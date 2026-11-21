// 件の一覧の層 6: 判定（plan/design-split-first-pass.md 3.3 節・9.2 節）。効果の条件（holdsAt）・発火の文脈・{ ended } の発火・
// カウンタの増減の条件。
import { statTotal } from '../buffs.ts';
import type { ResolvedTrigger } from '../resolve.ts';
import { statesMatching, type NamedStateId } from '../states.ts';
import { fireContextOf, burstStepHolds, type FrameEvents } from '../triggers.ts';
import { type BuffStat, isStacksCondition, selfBuffedOf, type EndedTrigger, type EffectCondition } from '../types.ts';
import type { HeldItem, HeldTrack } from './types.ts';
import { stacksHold, valueOf } from './items.ts';
import { isStateOrigin } from './history.ts';
import type { HolderBase, Records } from './records.ts';
import type { Fires } from './fires.ts';
import type { Sources } from './sources.ts';
import type { Read } from './read.ts';
import type { Views } from './views.ts';

/** 効果の条件・発火の文脈・{ ended }・カウンタの増減の条件を判定する */
export function createConditions({
  activeAt,
  conditionViews,
  counterValue,
  enemyStateAt,
  inFullBurstAt,
  minEffectiveRangeAt,
  options,
  passive,
  readItems,
  selfHpAtMostHolds,
  selfHpRatioAt,
  selfStateItemsAt,
  stateEndGuesses,
  stateTracks,
  staticStates,
  tracks,
}: HolderBase & Records & Fires & Sources & Read & Views) {
  /** 条件が無ければ成り立つ（段 1.5 には、条件の無い perCount の timed も入る。stageOfTimed） */
  /** 枠に stat の増加状態があるか（常時の値か段 1 の件に、その stat の正の値がある。条件 selfBuffed） */
  const buffedAt = (sourceSlotIndex: number, stat: BuffStat, frame: number): boolean => {
    const base = passive[sourceSlotIndex];
    return (
      (base !== null && base !== undefined && statTotal(base.buffs, stat) > 0) ||
      (conditionViews[sourceSlotIndex] ?? []).some(
        (v) => v.effect.stat === stat && activeAt(v.track, frame).some((it) => valueOf(v.effect, it) > 0),
      )
    );
  };
  /**
   * 枠 slotIndex がフレーム frame にその状態（家族の根なら家族のどれか。plan/design-skill-stage5.md 1.2 節）を持つか。静的な状態か、
   * 段の見え方（selfStateItemsAt）で件が付いているか。条件 selfState と、時間で変わる〈状態〉の味方の対象（stateHoldersAt）が使う
   */
  const hasStateAt = (slotIndex: number, state: NamedStateId, frame: number): boolean => {
    const family = statesMatching(state);
    if (family.some((s) => staticStates[slotIndex]?.has(s) === true)) return true;
    return family.some((s) =>
      (stateTracks[slotIndex]?.get(s) ?? []).some((t) => selfStateItemsAt(t, frame).length > 0),
    );
  };
  const holdsAt = (condition: EffectCondition | undefined, sourceSlotIndex: number, frame: number): boolean => {
    if (condition === undefined) return true;
    if (condition.selfState !== undefined) {
      const { state, present, sameFiring } = condition.selfState;
      if (!isStacksCondition(condition.selfState)) {
        // timed の sameFiring（plan/design-frima.md 2 節）は、同じ発で付いた件（射撃の回数のきっかけの件は次のフレームから）も見る
        const has = sameFiring
          ? statesMatching(state).some((s) =>
              (stateTracks[sourceSlotIndex]?.get(s) ?? []).some((t) => activeAt(t, frame + 1).length > 0),
            )
          : hasStateAt(sourceSlotIndex, state, frame);
        if (has !== present) return false;
      } else {
        const family = statesMatching(state);
        const isStatic = family.some((s) => staticStates[sourceSlotIndex]?.has(s) === true);
        const own = family.flatMap((s) => stateTracks[sourceSlotIndex]?.get(s) ?? []);
        // スタック数の条件（段 1 の状態の件の、そのフレームの段の最大。plan/design-skill-stage3.md 1.4 節）
        const holds = stacksHold(
          condition.selfState,
          isStatic,
          // sameFiring（plan/design-quency-eq.md 2 節の論点 3）は、同じ発火で前に書いた付与が付けた分
          // （射撃の回数のきっかけの件は次のフレームから）も数えるので、段によらず次のフレームに効いている件を見る
          own.map((t) => ({
            origin: t.origin,
            items: sameFiring ? activeAt(t, frame + 1) : selfStateItemsAt(t, frame),
          })),
        );
        if (!holds) return false;
      }
    }
    // 「自分が〈stat〉増加状態なら」と「でなければ」（plan/design-bready.md 2.2 節）
    const buffed = selfBuffedOf(condition);
    if (buffed !== undefined && buffedAt(sourceSlotIndex, buffed.stat, frame) !== buffed.present) return false;
    // 解除の「フルバースト状態でなければ」（inFullBurst: false）も
    if (condition.inFullBurst !== undefined && inFullBurstAt(frame) !== condition.inFullBurst) return false;
    if (condition.enemyState !== undefined && !enemyStateAt(condition.enemyState, frame)) return false;
    // 適正射程距離内なら（発火のフレームの着地点と、常時の値とそのフレームに
    // 効いている件の適正最小射程距離▲。射撃の回数のきっかけの付与は次のフレームから効くので、
    // その発自身のスタックは入らない。plan/design-agent-bunny.md 2.2 節）
    if (
      condition.inEffectiveRange === true &&
      options.effectiveRangeAt !== undefined &&
      !options.effectiveRangeAt(
        sourceSlotIndex,
        frame,
        (passive[sourceSlotIndex]?.buffs.minEffectiveRange ?? 0) + minEffectiveRangeAt(sourceSlotIndex, frame),
      )
    )
      return false;
    // カウンタの値（前のフレームの終わりの値。plan/design-skill-stage10.md 2.3 節）
    if (condition.selfCounter !== undefined) {
      const { counter, atLeast, below } = condition.selfCounter;
      const value = counterValue(sourceSlotIndex, counter);
      if (atLeast !== undefined && value < atLeast) return false;
      if (below !== undefined && value >= below) return false;
    }
    return true;
  };
  /**
   * 発火の文脈だけで決まる条件。条件の usedBurst（直前に自分がバーストスキルを使用していれば。plan/design-skill-stage1.md 1.5 節）: 発火の文脈の
   * burstUsers に自分がいるか。件を見ないので、段 1 の効果でも発火の前に見る。鍵が無ければ true。
   * selfHp の atMost も見る（plan/design-scarlet.md 2.2 節）。こちらは最大HP の件の列を読むが、発火のフレームより前に始まった件と
   * 前の現在の HP▼ だけなので、同じフレームの登録の順に依らない
   */
  const fireContextHolds = (
    condition: EffectCondition | undefined,
    trigger: ResolvedTrigger | EndedTrigger,
    ev: FrameEvents,
    sourceSlotIndex: number,
  ): boolean =>
    // 文脈の無い出来事では、true も false も成り立たない（「使っていなければ」の側に倒さない）
    (condition?.usedBurst === undefined ||
      fireContextOf(trigger, ev)?.burstUsers?.includes(sourceSlotIndex) === condition.usedBurst) &&
    // 使った段階（burstStep）も発火の文脈だけで決まる（plan/design-red-hood.md 2.1 節）
    burstStepHolds(condition, ev, sourceSlotIndex) &&
    // 自分の HP の割合が閾値以下か（resolveCondition が atMostRef を atMost（% 表記）にしてある）。以上の形は passive（編成の段）と
    // damage（2 パス目）だけなので、ここには来ない
    (condition?.selfHp === undefined || selfHpAtMostHolds(condition.selfHp, selfHpRatioAt(sourceSlotIndex, ev.frame)));
  /** 件のどれかがフレーム frame に終わり、frame を覆う件が無いか（items は件の列ごとの件） */
  const endsAt = (items: readonly (readonly HeldItem[])[], frame: number): boolean => {
    let ended = false;
    for (const list of items)
      for (const it of list) {
        if (it.start <= frame && frame < it.end) return false;
        if (it.end === frame) ended = true;
      }
    return ended;
  };
  /**
   * 持ち主 × 状態ごとの、その状態（家族も）の件の列（初期化で出そろう）と、まだ確かめていない読み（読んだフレーム・最後に読んだ
   * 件とその答え・読んだ答え）
   */
  type EndedReads = {
    holder: number;
    state: NamedStateId;
    own: HeldTrack[];
    frame: number;
    items: HeldItem[][];
    last: boolean;
    sawEnded: boolean;
    sawNotEnded: boolean;
  };
  const endedReads = new Map<string, EndedReads>();
  /**
   * 読んだフレームの登録が済んだ後の件で判定し直し、読んだ答えと食い違えば記録に残す（plan/design-state-ended.md 4 節）。件の列が
   * 最後に読んだ後に作り直されていなければ、答えは最後に読んだ答えのまま。そのフレームの件は、後のフレームの登録では変わらない
   * （閉じる・消費するのは後のフレーム）
   */
  const settleReads = (reads: EndedReads): void => {
    if (!reads.sawEnded && !reads.sawNotEnded) return;
    const rebuilt = reads.own.some((t, i) => readItems(t) !== reads.items[i]);
    const settled = rebuilt ? endsAt(reads.own.map(readItems), reads.frame) : reads.last;
    if (settled ? reads.sawNotEnded : reads.sawEnded)
      stateEndGuesses.push({ frame: reads.frame, holder: reads.holder, state: reads.state });
    reads.sawEnded = false;
    reads.sawNotEnded = false;
  };
  /**
   * { ended } の発火（plan/design-skill-stage4.md 1.3 節）。持ち主（自分）のその状態の件（段によらない）の終わりがこの
   * フレームで、このフレームに続く件が無い。1 フレームの登録の途中で読むので、終わりのフレームに同じ状態の件がそのフレームの
   * 登録で付くと、付く前に読む手続きと後に読む手続きで答えが分かれる（plan/design-state-ended.md 2.1 節）
   */
  const endedAt = (holder: number, state: NamedStateId, frame: number): boolean => {
    // 毎フレーム呼ぶので、件の列は持ち主 × 状態ごとに 1 回だけ集める
    const key = `${holder}:${state}`;
    let reads = endedReads.get(key);
    if (reads === undefined) {
      const own = tracks.filter((t) => t.holder === holder && isStateOrigin(t.origin, state));
      reads = { holder, state, own, frame, items: [], last: false, sawEnded: false, sawNotEnded: false };
      endedReads.set(key, reads);
    }
    if (reads.frame !== frame) {
      settleReads(reads);
      reads.frame = frame;
    }
    for (let i = 0; i < reads.own.length; i++) reads.items[i] = readItems(reads.own[i]!);
    const ended = endsAt(reads.items, frame);
    reads.last = ended;
    if (ended) reads.sawEnded = true;
    else reads.sawNotEnded = true;
    return ended;
  };
  /** まだ確かめていない読みを確かめる（ループの後。履歴を閉じる前） */
  const settleEnded = (): void => {
    for (const reads of endedReads.values()) settleReads(reads);
  };
  /**
   * カウンタの増減の条件。selfState は段によらずそのフレームに効いている状態の件を見る（増減はすべての判定の後に足すので、
   * 同じフレームの付与も入れてよい）。selfCounter は前のフレームの終わりの値
   */
  const counterConditionHolds = (condition: EffectCondition, slotIndex: number, frame: number): boolean => {
    // フルバーストの中か外か（そのフレームの窓。[start, end)）
    if (condition.inFullBurst !== undefined && inFullBurstAt(frame) !== condition.inFullBurst) return false;
    if (condition.selfState !== undefined) {
      const { state, present } = condition.selfState;
      const own = tracks.filter((t) => t.holder === slotIndex && isStateOrigin(t.origin, state));
      const has =
        statesMatching(state).some((s) => staticStates[slotIndex]?.has(s) === true) ||
        own.some((t) => activeAt(t, frame).length > 0);
      if (has !== present) return false;
    }
    return condition.selfCounter === undefined || holdsAt({ selfCounter: condition.selfCounter }, slotIndex, frame);
  };
  /** フレーム frame にその状態を持つ枠（時間で変わる〈状態〉の味方の対象。FireContext の stateHolders。plan/design-rei-tentative.md 2.2 節） */
  const stateHoldersAt = (state: NamedStateId, frame: number): number[] =>
    stateTracks.flatMap((_, i) => (hasStateAt(i, state, frame) ? [i] : []));
  return { counterConditionHolds, endedAt, fireContextHolds, holdsAt, settleEnded, stateHoldersAt };
}
export type Conditions = ReturnType<typeof createConditions>;
