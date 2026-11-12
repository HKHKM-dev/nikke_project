// 件の一覧の層 5: 見る側（plan/design-split-first-pass.md 3.3 節・9.2 節）。stat ごとの見る列（射撃・ダメージ・当たり・射程・会心・ペレット・
// 条件・順位・ゲージ・CT）、状態の件のスタックの段と敵の状態、登録が閉じる件の列（カウンタの 0・HP の割合・見る状態の終わり）、
// 最大 HP▲・現在の HP▼・HP の割合・最終防御力・最終攻撃力と順位。
import { lowerBound } from '../../frame/shots.ts';
import { chanceStackLevelsAt } from '../chance.ts';
import { type ItemEffect } from '../resolve.ts';
import { attackRankFor, finalAttacksAt, type AttackItem } from '../ranking.ts';
import { stateMatches, type NamedStateId } from '../states.ts';
import { dependsOnRank } from '../targets.ts';
import {
  isMaxHpStat,
  isFiringStat,
  HIT_STATE_STATS,
  isStateStat,
  isSelfHpAtMost,
  selfHpHolds,
  staticStatesOf,
  type BuffStat,
  type SelfHpCondition,
} from '../types.ts';
import { rankSlotsOf } from '../timeline.ts';
import { ENEMY, type HeldItem, type HeldTrack, type HolderLists, type HpRatioSteps } from './types.ts';
import { STAGE_RANK, valueOf } from './items.ts';
import { alliesOf } from './history.ts';
import type { HolderBase, Records } from './records.ts';
import type { Fires } from './fires.ts';
import type { Sources } from './sources.ts';
import type { Read } from './read.ts';

/** stat ごとの見る列・状態の件・HP・防御力・順位を読む */
export function createViews({
  activeAt,
  counterKey,
  frames,
  passive,
  readItems,
  slots,
  stateTracks,
  tracks,
  updateHpAtLeast,
}: HolderBase & Records & Fires & Sources & Read) {
  // ---- 読む側の索引（持ち主ごと。並びは作った順） ----
  type View = { track: HeldTrack; effect: ItemEffect };
  const viewsOf = (test: (track: HeldTrack, effect: ItemEffect) => boolean): View[][] =>
    slots.map((_, holder) => {
      const views: View[] = [];
      for (const track of tracks) {
        if (track.holder !== holder) continue;
        const o = track.origin;
        // while の効果も、件を持つ効果として同じに読む（段 1.5）
        if (o.kind === 'timed' || o.kind === 'while') {
          if (test(track, o.effect)) views.push({ track, effect: o.effect });
        } else if (o.kind === 'state') {
          for (const c of o.contents) if (test(track, c)) views.push({ track, effect: c });
        }
      }
      return views;
    });
  /** views の件の、フレーム frame に効いている値の和（件の scale を掛ける） */
  const sumAt = (views: readonly View[] | undefined, frame: number): number => {
    let sum = 0;
    for (const v of views ?? []) for (const it of activeAt(v.track, frame)) sum += valueOf(v.effect, it);
    return sum;
  };
  // 射手: 射撃に効く stat（timed は段によらない。状態の中身も）
  const firingViews = viewsOf((_, e) => isFiringStat(e.stat));
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.4 節）: 与ダメージの値に効く件（piecesOfTrack と同じ持ち主の写し方）。
  // 読む枠だけ、初めて読むときに作る
  const damageViews: (View[] | undefined)[] = slots.map(() => undefined);
  const damageViewsOf = (holder: number): View[] => {
    const views: View[] = [];
    for (const track of tracks) {
      const o = track.origin;
      const contents = o.kind === 'timed' || o.kind === 'while' ? [o.effect] : o.kind === 'state' ? o.contents : [];
      for (const effect of contents) {
        if (isStateStat(effect.stat)) continue;
        const holds =
          track.holder === holder ||
          (track.holder === ENEMY &&
            (o.kind === 'state'
              ? alliesOf(o.grant, track.sourceSlotIndex, slots)
              : alliesOf(effect, track.sourceSlotIndex, slots)
            ).includes(holder));
        if (holds) views.push({ track, effect });
      }
    }
    return views;
  };
  /** 当たりと同じ段の件（状態の中身か、段 1.5 までの timed・while）で、stat が stats のどれかの件の索引 */
  const hitStageViewsOf = (...stats: readonly BuffStat[]): View[][] =>
    viewsOf(
      (track, e) =>
        (stats as readonly string[]).includes(e.stat) &&
        (track.origin.kind === 'state' || STAGE_RANK[track.stage] <= STAGE_RANK[1.5]),
    );
  // 当たり: 順位の対象でない timed の当たりの stat と、状態の中身。条件つき（段 1.5）の
  // 命中率▲（ソーダ：トゥインクルバニーのバースト）も、区間（2 パス目）と同じ N にするため入れる（plan/design-skill-stage3.md 経過）
  const hitViews = hitStageViewsOf(...HIT_STATE_STATS);
  // 条件 inEffectiveRange が読む適正最小射程距離▲（当たりと同じ段の件。plan/design-agent-bunny.md 2.2 節）
  const rangeViews = hitStageViewsOf('minEffectiveRange');
  const minEffectiveRangeAt = (holder: number, frame: number): number => sumAt(rangeViews[holder], frame);
  // 会心率▲・通常攻撃のクリティカル確率▲（当たりと同じ段の件。plan/design-new-chars-1029.md 5.7 節）
  const critViews = hitStageViewsOf('critRate', 'normalCritRate');
  // ペレット数▲・ペレットの数の固定（当たりと同じ段の件）
  const pelletCountViews = hitStageViewsOf('pelletCount');
  const singlePelletViews = hitStageViewsOf('singlePellet');
  const hasPellets = slots.map((_, h) => pelletCountViews[h]!.length > 0 || singlePelletViews[h]!.length > 0);
  // 条件 selfBuffed: 段 1 の件
  const conditionViews = viewsOf((track) => track.stage === 1);
  // 順位: 段 1・1.5 の攻撃力の件
  const rankViews = viewsOf((track, e) => e.stat === 'attack' && STAGE_RANK[track.stage] <= STAGE_RANK[1.5]);
  // 条件 selfState が見る、枠の静的な状態と、段 1 の状態の件の列（持ち主 → 状態。plan/design-skill-stage1.md 1.1 節）。
  // 静的な状態を見る selfState は編成の段（skills/composition.ts）で決まるので、ここに来るのは時間で変わる状態がほとんど
  const staticStates = slots.map((slot) => new Set(staticStatesOf(slot?.definition)));
  /**
   * 持ち主 × カウンタごとの、そのカウンタが 0 に届いたら閉じる自分の状態の件の列（付与の untilCounterEmpty。
   * 解除不可でも閉じる。registerCounters）
   */
  const counterEmptyTracks = new Map<string, HeldTrack[]>();
  /** HP の割合で解除される自分の状態の件の列（付与の untilSelfHpAtMost）と閾値（plan/design-hp-down-interval.md 2.2 節） */
  const selfHpUntilTracks: { track: HeldTrack; threshold: number }[] = [];
  /** ほかの状態の終わりで閉じる自分の状態の件の列（付与の untilStateEnd）と、見る状態（plan/design-grave.md 2.5 節） */
  const stateEndTracks: { track: HeldTrack; state: NamedStateId }[] = [];
  for (const track of tracks) {
    const o = track.origin;
    if (o.kind !== 'state') continue;
    if (o.grant.untilStateEnd !== undefined) {
      track.untilEnds = [];
      stateEndTracks.push({ track, state: o.grant.untilStateEnd });
    }
    if (o.grant.untilSelfHpAtMost !== undefined)
      selfHpUntilTracks.push({ track, threshold: o.grant.untilSelfHpAtMost });
    if (o.grant.untilCounterEmpty === undefined) continue;
    const key = counterKey(track.holder, o.grant.untilCounterEmpty);
    counterEmptyTracks.set(key, [...(counterEmptyTracks.get(key) ?? []), track]);
  }
  /** selfState が見る件: 段 1 はそのフレームに効いている件、段 1.5 は前のフレームまでに付いた件 */
  const selfStateItemsAt = (track: HeldTrack, frame: number): HeldItem[] =>
    track.stage === 1 ? activeAt(track, frame) : activeAt(track, frame).filter((it) => it.start < frame);
  /** 枠のその状態の、フレームのスタックの段の最大（selfState と同じ件。無ければ 0） */
  const stackLevelAt = (holder: number, state: NamedStateId, frame: number): number => {
    let level = 0;
    for (const t of stateTracks[holder]?.get(state) ?? []) {
      for (const it of selfStateItemsAt(t, frame)) level = Math.max(level, it.stack ?? 1);
    }
    return level;
  };
  /**
   * 枠のその状態が確率の状態なら、フレームの段ごとの「スタック数がその段以上の確率」（添字は段 − 1）。確率の状態で
   * なければ undefined
   */
  const chanceLevelsAt = (holder: number, state: NamedStateId, frame: number): number[] | undefined => {
    const track = (stateTracks[holder]?.get(state) ?? []).find((t) => t.opportunities !== null);
    if (track === undefined || track.origin.kind !== 'state') return undefined;
    return chanceStackLevelsAt(selfStateItemsAt(track, frame), frame, track.origin.grant.maxStacks ?? 1);
  };
  // エレグの段 3（plan/design-elegg-s3.md 3.2 節）: 条件 enemyState が見る、敵の状態の件の列（付与で付いた状態と、持続ダメージの状態）。
  // damage の enemyState（frame/plan.ts の damageConditionHolds）と同じく、そのフレームに付いた件も入れる
  const enemyStateTracks = tracks.filter(
    (t) => t.holder === ENEMY && (t.origin.kind === 'state' || t.origin.kind === 'enemyState'),
  );
  const enemyStateAt = (state: NamedStateId, frame: number): boolean =>
    enemyStateTracks.some(
      (t) =>
        (t.origin.kind === 'state' || t.origin.kind === 'enemyState') &&
        stateMatches(state, t.origin.state) &&
        activeAt(t, frame).length > 0,
    );
  // ゲージ: 時間で変わるバーストゲージのチャージ速度の件（plan/design-skill-stage1.md 1.6 節。段によらない。状態の中身も）
  const gaugeViews = viewsOf((_, e) => e.stat === 'burstGaugeSpeed');
  // バーストスキルのクールタイム▼ の維持の付いた形（T4）の件
  const cooldownViews = viewsOf((_, e) => e.stat === 'burstCooldown');
  /** 枠 holder の T4 の▼ の件のうち、pick に合うものの秒の和 */
  const cooldownSum = (holder: number, pick: (it: HeldItem) => boolean): number => {
    let sum = 0;
    for (const v of cooldownViews[holder] ?? [])
      for (const it of readItems(v.track)) if (pick(it)) sum += valueOf(v.effect, it);
    return sum;
  };
  const rankSlots = rankSlotsOf(slots, passive);
  // 枠のそのフレームの最終最大HP（常時 + 効いている最大HP▲ の件。plan/design-skill-stage6.md 2.4 節）。
  // 発動者の最終最大HP 基準の攻撃力▲（casterFinalMaxHp）の順位の値が読む
  const maxHpViews = viewsOf((_, e) => isMaxHpStat(e.stat));
  /**
   * 枠のフレーム frame の最大HP▲ の和（常時 + 効いている件。up）と、そのうちの最大HP のみ▲ の和（only）。startsBefore なら frame より前に
   * 始まった件だけ（同じフレームに付いた件は次のフレームから。マスト編の HP の割合）
   */
  const maxHpUpAt = (slotIndex: number, frame: number, startsBefore: boolean): { up: number; only: number } => {
    let up = passive[slotIndex]?.buffs.maxHpRatio ?? 0;
    let only = passiveMaxHpOnly[slotIndex] ?? 0;
    for (const v of maxHpViews[slotIndex] ?? []) {
      for (const it of readItems(v.track)) {
        if (!(startsBefore ? it.start < frame : it.start <= frame) || frame >= it.end) continue;
        const x = valueOf(v.effect, it);
        up += x;
        if (v.effect.stat === 'maxHpOnly') only += x;
      }
    }
    return { up, only };
  };
  const finalMaxHpAt = (slotIndex: number, frame: number): number | undefined => {
    const base = slots[slotIndex]?.casterMaxHp;
    if (base === undefined) return undefined;
    return base * (1 + maxHpUpAt(slotIndex, frame, false).up);
  };
  /**
   * 枠のフレーム frame の HP の割合（plan/design-mast.md 8 節。plan/design-skill-stage6.md 2.4 節の式）。枠の想定の割合 ×
   * (1 + Σ 最大HP▲ − Σ 最大HP のみ▲) ÷ (1 + Σ 最大HP▲)（Σ 最大HP▲ は最大HP のみ▲ も含む）。常時の分と、frame より前に始まって frame に
   * 効いている件（同じフレームに付いた件は次のフレームから。論点 8）
   */
  const passiveMaxHpOnly = passive.map(
    (state) =>
      state?.passiveEffects.filter((e) => e.stat === 'maxHpOnly').reduce((sum, e) => sum + e.appliedAmount, 0) ?? 0,
  );
  // 最大HP のみ▲ を持ちうる枠（常時か件の列）だけ、最大HP の件で割合が動く。ほかの枠は件を見ない（毎フレームの走査を省く）
  const maxHpOnlyMoves = slots.map(
    (_, i) => (passiveMaxHpOnly[i] ?? 0) > 0 || (maxHpViews[i] ?? []).some((v) => v.effect.stat === 'maxHpOnly'),
  );
  // 枠ごとの現在の HP▼ の発火のフレーム（昇順）と、その発火までの 1 − ratio の積（plan/design-scarlet.md 2.1 節）
  const hpDowns = slots.map(() => ({ frames: [] as number[], products: [] as number[] }));
  /** 枠の frame より前の現在の HP▼ の積（無ければ 1） */
  const hpDownProductBefore = (slotIndex: number, frame: number): number => {
    const downs = hpDowns[slotIndex]!;
    const i = lowerBound(downs.frames, frame);
    return i === 0 ? 1 : downs.products[i - 1]!;
  };
  const selfHpRatioAt = (slotIndex: number, frame: number): number => {
    const ratio = (slots[slotIndex]?.hpRatio ?? 1) * hpDownProductBefore(slotIndex, frame);
    if (!maxHpOnlyMoves[slotIndex]) return ratio;
    const { up, only } = maxHpUpAt(slotIndex, frame, true);
    return (ratio * (1 + up - only)) / (1 + up);
  };
  /**
   * 履歴に置く、枠の HP の割合の段（selfHpRatioAt を毎フレーム取り、値の変わったフレームだけを残す）。最大HP のみ▲ も現在の
   * HP▼ も無い枠は割合が動かないので 1 段。ループの後に呼ぶ
   */
  const hpRatioStepsOf = (slotIndex: number): HpRatioSteps => {
    if (!maxHpOnlyMoves[slotIndex] && hpDowns[slotIndex]!.frames.length === 0)
      return { frames: [0], ratios: [selfHpRatioAt(slotIndex, 0)] };
    const steps = { frames: [] as number[], ratios: [] as number[] };
    for (let f = 0; f < Math.max(frames, 1); f++) {
      const ratio = selfHpRatioAt(slotIndex, f);
      if (steps.ratios.at(-1) === ratio) continue;
      steps.frames.push(f);
      steps.ratios.push(ratio);
    }
    return steps;
  };
  /** 1 パス目の発火の文脈の selfHp（以下の形だけ。以上の形が来たら定義の読み込みの漏れなので投げる） */
  const selfHpAtMostHolds = (hp: SelfHpCondition, ratio: number): boolean => {
    if (!isSelfHpAtMost(hp))
      throw new RangeError(`selfHp ${JSON.stringify(hp)}: the at-least form is not read in the first pass`);
    return selfHpHolds(hp, ratio);
  };
  /** 枠の HP の割合がフレーム frame に閾値 threshold（割合）以下か（きっかけ { selfHpAtMost } と維持 { selfHpAtMostRef } が読む） */
  const selfHpAtMostAt = (slotIndex: number, frame: number, threshold: number): boolean =>
    selfHpRatioAt(slotIndex, frame) <= threshold + 1e-9;
  // 枠のそのフレームの最終防御力（常時 + 効いている防御力▲ の件）と、
  // 発動者より低い枠（同値は含まない）と発動者自身（plan/design-skill-stage7.md 1.2・1.4 節）
  const defenseViews = viewsOf((_, e) => e.stat === 'defense');
  const finalDefenceAt = (slotIndex: number, frame: number): number => {
    const base = slots[slotIndex]?.baseDefence;
    if (base === undefined)
      throw new RangeError(`slot ${slotIndex}: the base defence is needed to compare final defence`);
    let up = passive[slotIndex]?.buffs.defenseRatio ?? 0;
    for (const v of defenseViews[slotIndex] ?? [])
      for (const it of activeAt(v.track, frame)) up += valueOf(v.effect, it);
    return base * (1 + up);
  };
  const lowerDefenseAt = (sourceSlotIndex: number, frame: number): number[] => {
    const own = finalDefenceAt(sourceSlotIndex, frame);
    const out: number[] = [];
    slots.forEach((slot, i) => {
      if (slot !== null && (i === sourceSlotIndex || finalDefenceAt(i, frame) < own)) out.push(i);
    });
    return out;
  };
  const finalAttacksAtFrame = (frame: number): (number | null)[] => {
    const windows: AttackItem[] = [];
    rankViews.forEach((views, holder) => {
      for (const v of views) {
        for (const it of activeAt(v.track, frame)) {
          const casterMaxHp =
            v.effect.scaling === 'casterFinalMaxHp' ? finalMaxHpAt(v.track.sourceSlotIndex, frame) : undefined;
          windows.push({
            slotIndex: holder,
            sourceSlotIndex: v.track.sourceSlotIndex,
            effect: { stat: v.effect.stat, scaling: v.effect.scaling, value: valueOf(v.effect, it) },
            start: it.start,
            end: it.end,
            ...(casterMaxHp === undefined ? {} : { casterMaxHp }),
          });
        }
      }
    });
    return finalAttacksAt(rankSlots, windows, frame);
  };
  const rankContext: HolderLists['rankContext'] = (e, sourceSlotIndex, context, frame) => {
    // 回復は手順 3 の最初（このフレームの登録の前）に当てるので、順位が読む HP の割合の while の可否を先に出す
    // （f より前に始まった件と前の現在の HP▼ だけを読むので、登録の始めに出すのと同じ）
    updateHpAtLeast(frame);
    // 「残りの HP の割合が最も低い味方」は、発火のフレームの HP の割合
    // （frame より前に始まった件と前の現在の HP▼）の低い順・同値は枠の若い順
    // （plan/design-hp-ratio-readers.md 2.2 節）。割合が動かなければ fixedTargets（枠の想定の順）と同じ並び
    if (e.target === 'lowestHpRatio' && e.fixedTargets !== undefined) {
      const ratios = slots.map((_, i) => (e.fixedTargets!.includes(i) ? selfHpRatioAt(i, frame) : 0));
      const hpRank = [...e.fixedTargets].sort((a, b) => ratios[a]! - ratios[b]! || a - b);
      return { ...context, hpRank };
    }
    if (!dependsOnRank(e)) return context;
    const finalAttacks = finalAttacksAtFrame(frame);
    return { ...context, attackRank: attackRankFor(e, rankSlots, finalAttacks, sourceSlotIndex) };
  };
  return {
    chanceLevelsAt,
    conditionViews,
    cooldownSum,
    cooldownViews,
    counterEmptyTracks,
    critViews,
    damageViews,
    damageViewsOf,
    enemyStateAt,
    finalAttacksAtFrame,
    firingViews,
    gaugeViews,
    hasPellets,
    hitViews,
    hpDowns,
    hpRatioStepsOf,
    lowerDefenseAt,
    minEffectiveRangeAt,
    pelletCountViews,
    rankContext,
    rankSlots,
    selfHpAtMostAt,
    selfHpAtMostHolds,
    selfHpRatioAt,
    selfHpUntilTracks,
    selfStateItemsAt,
    singlePelletViews,
    stackLevelAt,
    stateEndTracks,
    staticStates,
    sumAt,
  };
}
export type Views = ReturnType<typeof createViews>;
