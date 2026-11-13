// 件の一覧の層 6: 判定（plan/design-split-first-pass.md 3.3 節・9.2 節）。効果の条件（holdsAt）・発火の文脈・{ ended } の発火・
// カウンタの増減の条件。
import { statTotal } from '../buffs.ts';
import { type ResolvedTrigger } from '../resolve.ts';
import { statesMatching, type NamedStateId } from '../states.ts';
import { fireContextOf, burstStepHolds, type FrameEvents } from '../triggers.ts';
import { isStacksCondition, type EndedTrigger, type EffectCondition } from '../types.ts';
import { type HeldTrack } from './types.ts';
import { stacksHold, valueOf } from './items.ts';
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
  stateTracks,
  staticStates,
  tracks,
}: HolderBase & Records & Fires & Sources & Read & Views) {
  /** 条件が無ければ成り立つ（段 1.5 には、条件の無い perCount の timed も入る。stageOfTimed） */
  const holdsAt = (condition: EffectCondition | undefined, sourceSlotIndex: number, frame: number): boolean => {
    if (condition === undefined) return true;
    if (condition.selfState !== undefined) {
      const { state, present, sameFiring } = condition.selfState;
      // 家族の根なら、家族のどの状態でも当たる（plan/design-skill-stage5.md 1.2 節）
      const family = statesMatching(state);
      const isStatic = family.some((s) => staticStates[sourceSlotIndex]?.has(s) === true);
      const own = family.flatMap((s) => stateTracks[sourceSlotIndex]?.get(s) ?? []);
      if (!isStacksCondition(condition.selfState)) {
        const has = isStatic || own.some((t) => selfStateItemsAt(t, frame).length > 0);
        if (has !== present) return false;
      } else if (
        !stacksHold(
          condition.selfState,
          isStatic,
          // sameFiring（plan/design-quency-eq.md 2 節の論点 3）は、同じ発火で前に書いた付与が付けた分
          // （射撃の回数のきっかけの件は次のフレームから）も数えるので、段によらず次のフレームに効いている件を見る
          own.map((t) => ({
            origin: t.origin,
            items: sameFiring ? activeAt(t, frame + 1) : selfStateItemsAt(t, frame),
          })),
        )
      ) {
        // スタック数の条件（段 1 の状態の件の、そのフレームの段の最大。plan/design-skill-stage3.md 1.4 節）
        return false;
      }
    }
    if (condition.selfBuffed !== undefined) {
      const stat = condition.selfBuffed;
      const base = passive[sourceSlotIndex];
      const buffed =
        (base !== null && base !== undefined && statTotal(base.buffs, stat) > 0) ||
        (conditionViews[sourceSlotIndex] ?? []).some(
          (v) => v.effect.stat === stat && activeAt(v.track, frame).some((it) => valueOf(v.effect, it) > 0),
        );
      if (!buffed) return false;
    }
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
  /**
   * { ended } の発火（plan/design-skill-stage4.md 1.3 節）。持ち主（自分）のその状態の件（段によらない）の終わりがこの
   * フレームで、このフレームに続く件が無い
   */
  const endedTracks = new Map<string, HeldTrack[]>();
  const endedAt = (holder: number, state: NamedStateId, frame: number): boolean => {
    // 件の列は初期化で出そろうので、持ち主 × 状態ごとに 1 回だけ集める（毎フレーム呼ぶ）
    const key = `${holder}:${state}`;
    let own = endedTracks.get(key);
    if (own === undefined) {
      const family = statesMatching(state);
      own = tracks.filter((t) => t.holder === holder && t.origin.kind === 'state' && family.includes(t.origin.state));
      endedTracks.set(key, own);
    }
    let ended = false;
    for (const t of own)
      for (const it of readItems(t)) {
        if (it.start <= frame && frame < it.end) return false;
        if (it.end === frame) ended = true;
      }
    return ended;
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
      const own = tracks.filter(
        (t) => t.holder === slotIndex && t.origin.kind === 'state' && statesMatching(state).includes(t.origin.state),
      );
      const has =
        statesMatching(state).some((s) => staticStates[slotIndex]?.has(s) === true) ||
        own.some((t) => activeAt(t, frame).length > 0);
      if (has !== present) return false;
    }
    return condition.selfCounter === undefined || holdsAt({ selfCounter: condition.selfCounter }, slotIndex, frame);
  };
  return { counterConditionHolds, endedAt, fireContextHolds, holdsAt };
}
export type Conditions = ReturnType<typeof createConditions>;
