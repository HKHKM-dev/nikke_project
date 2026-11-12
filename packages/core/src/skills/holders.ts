// 効果を持ち主ごとの一覧で持つ（plan/design-holder-effects.md）。
// 1 パス目のループ（frame/firstPass.ts）が、スキルによる効果を、効果を受ける枠（持ち主）ごとの件の列で持つ。
// 件の列は、出どころ × 効果 × 持ち主ごとの窓の始まりの列（昇順）で、件（窓）は次の規則で作る（2.3 節）: 和集合の上書き延長
// （終わりのフレームちょうどの付き直しも続き）、スタックの段（skills/stacks.ts）、N 発間維持、フルバーストの終わり、撃ち切り、
// 吸収回復の付き直し（終わりのフレームちょうどに付けば新しく付いた）。件は、始まりの列とループで分かった出来事（射撃・使用武器の
// 変更の終わり・フルバーストの窓）から作り直すので、同じフレームの中で始まりが前後して登録されても（射撃の回数のきっかけは次の
// フレームから）、和集合とスタックと同じ件になる。ループの中の判定（射手・当たり・条件・順位）は件を読み、段（1・1.5・2・
// 2.5 段目）の見え方は件の列の段の印で表す（2.5 節）。強化（2.5 段目）の受け付けと値は、参照する件の一生が要るので、ループの後に
// 履歴を閉じる時に決める（amplify。ループの中で強化の件を読む所は無い）。ループの後は、履歴の値の小片から区間を作る（buffTimelineOf。
// 2.9 節）。値の小片の並びは時刻の順（論点 5）。件を作るのはここだけで、読む側は履歴を直接読む。
// ここには件の一覧を作る createHolderLists を置き、型は holders/types.ts、件を作る純粋な関数は holders/items.ts、ループの後に
// 履歴を読む関数は holders/history.ts に置く（どれもここから同じ名前で再公開する）。
import { groupDotsByState } from '../frame/dot.ts';
import { lowerBound, type ShotLog } from '../frame/shots.ts';
import { resolveDotEffects } from './burstDamage.ts';
import { ZERO_HIT_RATE, applyResolvedEffect, fixedAttackBaseOf, statTotal, type BuffTotals } from './buffs.ts';
import { chanceStackLevelsAt, type ChanceOpportunity } from './chance.ts';
import { resolveCycleEvery } from './cycles.ts';
import {
  isResolvedApplied,
  isResolvedSelfHpAtMost,
  isResolvedChance,
  isResolvedFullStack,
  isResolvedShotCount,
  isResolvedTimer,
  resolveCounterChanges,
  resolveDotCancels,
  resolveInstant,
  resolveMaxStacksUps,
  resolvePassives,
  resolveRemoveDebuffs,
  resolveRemoveStates,
  resolveStateExtends,
  resolveStackChanges,
  resolveTimed,
  resolveWhileEffects,
  type ResolvedEffect,
  type ResolvedInstantEffect,
  type ResolvedShotCountTrigger,
  type ResolvedTrigger,
  type ResolvedWhileEffect,
  type ResolvedCounterWhileEffect,
  isCounterWhileEffect,
  isHpWhileEffect,
  resolveCounterWhileEffects,
  resolveHpWhileEffects,
  type ItemEffect,
} from './resolve.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type AttackItem, type RankingRecord } from './ranking.ts';
import { counterMax, type CounterId } from './counters.ts';
import { createSpanMemo } from './spanMemo.ts';
import type { MaxStacksAt } from './stacks.ts';
import { namedStateGroup, namedStateIsDebuff, stateMatches, statesMatching, type NamedStateId } from './states.ts';
import { canEverTarget, dependsOnDefense, dependsOnRank, isEffectTarget, type FireContext } from './targets.ts';
import {
  advanceShotCount,
  createTriggerTracker,
  fireContextOf,
  burstStepHolds,
  shotCountWeight,
  type FrameEvents,
  type FullStackEvent,
  type HealRecord,
  type ShotCountEveryAt,
  type ShotEvent,
  type TriggerTracker,
} from './triggers.ts';
import {
  conditionReadsItems,
  isEndedTrigger,
  isMaxHpStat,
  isStateCountWindow,
  isCounterFullTrigger,
  isAllyDecrease,
  isFiringStat,
  HIT_STATE_STATS,
  isStateStat,
  isSelfHpAtMost,
  selfHpHolds,
  staticStatesOf,
  type BuffStat,
  type EndedTrigger,
  type EffectCondition,
  type SelfHpCondition,
  type TimerTrigger,
} from './types.ts';
import type { SkillSlot } from '../types.ts';
import {
  rankSlotsOf,
  resolvePassiveStates,
  timerFramesOf,
  type AppliedRecord,
  type ConditionSkip,
  type TimelineSlot,
} from './timeline.ts';
import {
  type AmplifierSource,
  type CounterRecord,
  type CounterSource,
  type CycleSource,
  ENEMY,
  type EnemyStateSource,
  type ExtendSource,
  type GrantSource,
  type HeldItem,
  type HeldOrigin,
  type HeldStage,
  type HeldTrack,
  type HolderLists,
  type HolderListsOptions,
  type HpRatioSteps,
  type RemoveDebuffGuessRecord,
  type RemoveDebuffSource,
  type RemoveSource,
  type StackSource,
  type TimedSource,
  counterEffectiveFrom,
  isEnemyEffect,
  leadShotKey,
  pickRemoveDebuff,
} from './holders/types.ts';
import {
  ALL_READS,
  STAGE_RANK,
  type TrackReads,
  appliedStagesOf,
  atBattleStart,
  buildTrackItems,
  closeTakesEffect,
  grantStartOf,
  insertSorted,
  lastAtOrBefore,
  scaledEffect,
  setLength,
  stacksHold,
  stageOfStackChange,
  stageOfTimed,
  startOfFire,
  stateGroupsOf,
  trackReadsOf,
  valueOf,
  whileItems,
} from './holders/items.ts';
import { alliesOf, amplify } from './holders/history.ts';

export {
  ENEMY,
  isEnemyEffect,
  type HeldStage,
  type HeldOrigin,
  type HeldItem,
  type HeldTrack,
  type AmplifierSource,
  type AmplifiedPiece,
  type HolderHistory,
  type HpRatioSteps,
  selfHpRatioOf,
  type RemoveDebuffGuess,
  type RemoveDebuffGuessRecord,
  pickRemoveDebuff,
  type CounterRecord,
  counterEffectiveFrom,
  counterFullFrames,
  type HolderListsOptions,
  type LeadShots,
  type HolderLists,
} from './holders/types.ts';
export { startOfFire, shiftEdges, stacksHold, whileItems } from './holders/items.ts';
export {
  type HeldItemView,
  type HeldItemFilter,
  itemsOf,
  activeItemsAt,
  type ValuePiece,
  valuePiecesOf,
  buffTimelineOf,
} from './holders/history.ts';

export function createHolderLists(slots: readonly TimelineSlot[], options: HolderListsOptions): HolderLists {
  const { frames, logs } = options;
  const passive = resolvePassiveStates(slots);
  const tracks: HeldTrack[] = [];
  const applications: AppliedRecord[] = [];
  const conditionSkips: ConditionSkip[] = [];
  const rankings: RankingRecord[] = [];
  const removeDebuffGuesses: RemoveDebuffGuessRecord[] = [];
  const heals: HealRecord[] = [];
  const amplifiers: AmplifierSource[] = [];

  /**
   * 件の列ごとの、件を作る関数が読む入力（trackReadsOf）と、件を作った時の入力の長さ（始まり・機会・射撃・使用武器の変更の終わり・
   * リロードの込め終わり・フルバーストの窓・閉じるフレーム・消費のフレーム・減少・上限を上げる状態の件の列の入力。読まない入力は 0。
   * updateLengths）
   */
  const itemsSeen = new Map<HeldTrack, { reads: TrackReads; lengths: number[]; verified: number[] }>();
  /**
   * 発動者の最大HP 基準（scaling casterMaxHp）の timed を、持ち主
   * holder の比率（X × 発動者のバフ前の最大HP ÷ 持ち主のバフ前の最大HP）の ratio に直す
   * （plan/design-hp-ratio-readers.md 9 節の論点 8）。HP の割合・最終最大HP・表示は比率をそのまま読む
   */
  const holderScaledOrigin = (origin: HeldOrigin, sourceSlotIndex: number, holder: number): HeldOrigin => {
    if (origin.kind !== 'timed' || origin.effect.scaling !== 'casterMaxHp') return origin;
    const caster = slots[sourceSlotIndex]?.casterMaxHp;
    const own = slots[holder]?.casterMaxHp;
    if (caster === undefined || own === undefined)
      throw new RangeError(`slot ${holder}: casterMaxHp needs the base max HP of the caster and the holder`);
    return { ...origin, effect: { ...origin.effect, scaling: 'ratio', value: (origin.effect.value * caster) / own } };
  };
  const newTrack = (
    holder: number,
    sourceSlotIndex: number,
    origin: HeldOrigin,
    stage: HeldStage,
    opportunities: ChanceOpportunity[] | null = null,
  ): HeldTrack => {
    const track: HeldTrack = {
      holder,
      sourceSlotIndex,
      casterBaseAttack: slots[sourceSlotIndex]?.casterBaseAttack ?? 0,
      casterMaxHp: slots[sourceSlotIndex]?.casterMaxHp,
      origin: holderScaledOrigin(origin, sourceSlotIndex, holder),
      stage,
      starts: [],
      closes: [],
      consumes: [],
      decreases: [],
      opportunities,
      items: [],
    };
    tracks.push(track);
    // verified はテスト用（verifyItems）: 確かめた時の入力の長さ（件を作る関数が読まない入力も含む）
    itemsSeen.set(track, { reads: trackReadsOf(origin), lengths: new Array<number>(12).fill(-1), verified: [] });
    return track;
  };
  const counterKey = (slotIndex: number, counter: CounterId): string => `${slotIndex}:${counter}`;
  /** 件の列を frame で閉じる（同じフレームは 1 つ。戦闘の後は閉じない）。効果解除（fireRemove）とカウンタの 0（registerCounters） */
  const closeTrack = (track: HeldTrack, frame: number): void => {
    if (frame < frames && !track.closes.includes(frame)) insertSorted(track.closes, frame);
  };
  /** 件の列を frame で消費する（同じフレームに始まった件も次のフレームで切る。フルスタックの消費と、{ applied } の付与の切り替え） */
  const consumeTrack = (track: HeldTrack, frame: number): void => {
    if (frame < frames && !track.consumes.includes(frame)) insertSorted(track.consumes, frame);
  };
  /** 枠のカウンタが上限に届いたフレームの次のフレーム（{ counterFull } の発火。届くたびに書き替える） */
  const counterFullAt = new Map<string, number>();
  /** 周期のトリガーは出来事の列に無いので、周期のフレームで発火する（atStart のフレーム 0 はループの前に登録する） */
  /**
   * 発動者 × 閾値ごとの、HP の割合の窓の追跡（plan/design-mast.md 8 節）。毎フレームのきっかけの判定で 1 回だけ割合を求め、
   * 閾値以下に下がったフレーム（dropped）と、上回ったフレーム（ends。件の列の untilEnds と共有）を記録する
   */
  type SelfHpState = {
    slotIndex: number;
    threshold: number;
    frame: number;
    low: boolean;
    dropped: boolean;
    ends: number[];
  };
  const selfHpStates = new Map<string, SelfHpState>();
  const selfHpStateOf = (slotIndex: number, threshold: number): SelfHpState => {
    const key = `${slotIndex}:${threshold}`;
    let state = selfHpStates.get(key);
    if (state === undefined) {
      state = { slotIndex, threshold, frame: -1, low: false, dropped: false, ends: [] };
      selfHpStates.set(key, state);
    }
    return state;
  };
  const selfHpDropped = (state: SelfHpState, frame: number): boolean => {
    if (state.frame !== frame) {
      const low = selfHpAtMostAt(state.slotIndex, frame, state.threshold);
      if (state.low && !low && frame < frames) state.ends.push(frame);
      state.dropped = low && !state.low;
      state.low = low;
      state.frame = frame;
    }
    return state.dropped;
  };
  const firesOf = (
    trigger: ResolvedTrigger,
    slotIndex: number,
    everyAt?: ShotCountEveryAt,
    /** 自分の状態の窓で数える回数は、効果の条件を満たす発だけを数える（付与の条件。stateWindowFires） */
    condition?: EffectCondition,
  ): TriggerTracker => {
    // { applied } は出来事では発火しない（段の登録の後に、付いた記録から発火する。dispatchApplied）
    if (isResolvedApplied(trigger)) return () => false;
    // 自分の HP の割合が閾値以下に下がったフレーム（上がったフレームは窓の終わりに書く。plan/design-mast.md 8 節）
    if (isResolvedSelfHpAtMost(trigger)) {
      const state = selfHpStateOf(slotIndex, trigger.selfHpAtMost);
      return (ev) => selfHpDropped(state, ev.frame);
    }
    // カウンタが上限に届いた次のフレーム（registerCounters が counterFullAt に書く）
    if (isCounterFullTrigger(trigger)) {
      const key = counterKey(slotIndex, trigger.counterFull);
      return (ev) => counterFullAt.get(key) === ev.frame;
    }
    // 自分のその状態の件が外れた最初のフレーム（counterChange の { ended } と同じ endedAt。plan/design-grave.md 2.1 節）
    if (isEndedTrigger(trigger)) {
      const state = trigger.ended;
      return (ev) => endedAt(slotIndex, state, ev.frame);
    }
    // 同 2.4 節: 自分の状態の間だけ数える回数（状態が付くたびに 0 から数え直す）
    // （stateWindowFires は件の一覧の後に作るので、最初の呼び出しで作る）
    if (isResolvedShotCount(trigger) && isStateCountWindow(trigger.during)) {
      const window = trigger.during.state;
      let fires: TriggerTracker | undefined;
      return (ev) => (fires ??= stateWindowFires(trigger, slotIndex, window, condition?.selfState?.state))(ev);
    }
    if (!isResolvedTimer(trigger)) return createTriggerTracker(trigger, slotIndex, options.scheduleModel, everyAt);
    const at = new Set(timerFramesOf(trigger, frames));
    return (ev) => at.has(ev.frame);
  };

  // ---- 常時の件（スキルの常時パッシブと静的な状態の中身。論点 3）。戦闘の始めから終わりまで ----
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolvePassives(slot.definition, slot.character, slot.levels)) {
      slots.forEach((target, holder) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, holder, target.character)) return;
        const track = newTrack(holder, sourceSlotIndex, { kind: 'passive', effect }, 1);
        if (frames > 0) track.starts.push(0);
      });
    }
  });

  // ---- { applied } の効果の段（見る状態を付ける付与の段。plan/design-skill-stage4.md 1.1 節） ----
  const appliedStageOf = appliedStagesOf(slots);

  // ---- timed の出どころ（持ち主ごとの件の列は、対象になりうる枠にだけ作る） ----
  const timedSources: TimedSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      const stage = isResolvedApplied(effect.trigger) ? appliedStageOf(effect.trigger.applied) : stageOfTimed(effect);
      if (stage === 2.5) {
        amplifiers.push({ sourceSlotIndex, effect, starts: [] });
        continue;
      }
      const chance = isResolvedChance(effect.trigger);
      const opportunities: ChanceOpportunity[] | null = chance ? [] : null;
      const canTarget = slots.map(
        (target, holder) => target !== null && canEverTarget(effect, sourceSlotIndex, holder, target.character),
      );
      // 敵の件の効果は、味方ごとではなく敵の 1 つの件の列に付ける
      const enemy = isEnemyEffect(effect);
      const src: TimedSource = {
        sourceSlotIndex,
        effect,
        stage,
        fires: firesOf(effect.trigger, sourceSlotIndex),
        chance,
        tracks: canTarget.map((can, holder) =>
          can && !enemy ? newTrack(holder, sourceSlotIndex, { kind: 'timed', effect }, stage, opportunities) : null,
        ),
        enemy:
          enemy && canTarget.some(Boolean)
            ? newTrack(ENEMY, sourceSlotIndex, { kind: 'timed', effect }, stage, opportunities)
            : null,
      };
      // HP の割合の窓の終わりは、発動者 × 閾値の追跡と共有する（秒の維持の件は読まない）
      if (isResolvedSelfHpAtMost(effect.trigger) && effect.durationUntil === 'selfHpAbove') {
        const ends = selfHpStateOf(sourceSlotIndex, effect.trigger.selfHpAtMost).ends;
        for (const track of [...src.tracks, src.enemy]) if (track !== null) track.untilEnds = ends;
      }
      timedSources.push(src);
    }
  });

  // ---- 時間で変わる状態（出どころ × 状態 × 持ち主ごとに 1 つの件の列） ----
  const stateGroups = stateGroupsOf(slots, firesOf, appliedStageOf);
  for (const group of stateGroups) {
    const grant = group.grants[0]!.grant;
    // 敵に付く状態は、敵の 1 つの件の列（対象の味方が編成にいれば）
    if (grant.enemy === true) {
      if (slots.some((t, holder) => t !== null && canEverTarget(grant, group.sourceSlotIndex, holder, t.character))) {
        group.enemy = newTrack(
          ENEMY,
          group.sourceSlotIndex,
          { kind: 'state', state: group.state, grant, contents: group.contents },
          group.stage,
        );
      }
      continue;
    }
    // 確率のきっかけの付与は、機会を持ち主の件の列で共有する（付与はその状態の 1 つだけ。skills/parse/crossChecks.ts）
    const opportunities: ChanceOpportunity[] | null = isResolvedChance(grant.trigger) ? [] : null;
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!group.grants.some((g) => canEverTarget(g.grant, group.sourceSlotIndex, holder, target.character))) return;
      group.tracks[holder] = newTrack(
        holder,
        group.sourceSlotIndex,
        { kind: 'state', state: group.state, grant, contents: group.contents },
        group.stage,
        opportunities,
      );
    });
  }

  // ---- 状態の間だけ効く常時の効果（while。plan/design-skill-stage9.md 1.3 節）。対象ごとに件の列（段 1.5）。
  // 件は出どころの枠の状態の件から作るので、始まりは登録しない（readWhileItems） ----
  /**
   * 出どころの枠 × 閾値ごとの、HP の割合が閾値以上の区間の件（plan/design-hp-ratio-readers.md 2.1 節。開いて
   * いる件の終わりは戦闘の終わり。変わった時だけ新しい配列にする）。フレーム f の可否は、f の登録の始め（updateHpAtLeast）に、f より前に始まった最大HP の件と前の現在の
   * HP▼ から出す（selfHpRatioAt。循環しない）。1 パス目が f の射撃（射手の実効値）で読む stat は f の登録より前に読むので、常時の
   * selfHp に書けない（skills/parse/timed.ts）
   */
  type HpAtLeastState = { slotIndex: number; threshold: number; holds: boolean; items: HeldItem[] };
  const hpAtLeastStates = new Map<string, HpAtLeastState>();
  /** HP の割合の while の件の列 → 出どころ × 閾値の状態（件の列を作る時に結び付ける） */
  const hpWhileStates = new Map<HeldTrack, HpAtLeastState>();
  const hpAtLeastOf = (slotIndex: number, threshold: number): HpAtLeastState => {
    const key = `${slotIndex}:${threshold}`;
    let state = hpAtLeastStates.get(key);
    if (state === undefined) {
      state = { slotIndex, threshold, holds: false, items: [] };
      hpAtLeastStates.set(key, state);
    }
    return state;
  };
  let hpAtLeastFrame = -1;
  const updateHpAtLeast = (frame: number): void => {
    if (hpAtLeastStates.size === 0 || frame <= hpAtLeastFrame || frame >= frames) return;
    hpAtLeastFrame = frame;
    for (const state of hpAtLeastStates.values()) {
      const holds = selfHpRatioAt(state.slotIndex, frame) >= state.threshold - 1e-9;
      if (holds === state.holds) continue;
      state.items = holds
        ? [...state.items, { start: frame, end: frames }]
        : state.items.with(-1, { ...state.items.at(-1)!, end: frame });
      state.holds = holds;
    }
  };
  const whileTracks: HeldTrack[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of [
      ...resolveWhileEffects(slot.definition, slot.character, slot.levels),
      ...resolveCounterWhileEffects(slot.definition, slot.character, slot.levels),
      ...resolveHpWhileEffects(slot.definition, slot.character, slot.levels),
    ]) {
      const hp = isHpWhileEffect(effect) ? hpAtLeastOf(sourceSlotIndex, effect.whileSelfHp.atLeast) : undefined;
      slots.forEach((target, holder) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, holder, target.character)) return;
        const track = newTrack(holder, sourceSlotIndex, { kind: 'while', effect }, 1.5);
        if (hp !== undefined) hpWhileStates.set(track, hp);
        whileTracks.push(track);
      });
    }
  });

  // ---- 循環の間隔の変更（対象は自分） ----
  const cycleSources: CycleSource[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCycleEvery(slot.definition, slot.character, slot.levels)) {
      cycleSources.push({
        slotIndex,
        effect,
        fires: firesOf(effect.trigger, slotIndex),
        track: newTrack(slotIndex, slotIndex, { kind: 'cycleEvery', effect }, 1),
      });
    }
  });

  // ---- 解除（対象は自分。件を見る条件つきは段 1.5。plan/design-skill-stage1.md 1.2 節） ----
  const removeSources: RemoveSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveRemoveStates(slot.definition, slot.character, slot.levels)) {
      removeSources.push({
        sourceSlotIndex,
        effect,
        stage: conditionReadsItems(effect.condition) ? 1.5 : 1,
        fires: firesOf(effect.trigger, sourceSlotIndex),
      });
    }
  });

  // ---- 状態の維持の延長（{ applied } のほかは段 1.5 の後に発火する。plan/design-mint-prika.md 2.5 節） ----
  const extendSources: ExtendSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveStateExtends(slot.definition, slot.character, slot.levels)) {
      extendSources.push({ sourceSlotIndex, effect, fires: firesOf(effect.trigger, sourceSlotIndex) });
    }
  });

  // ---- デバフ解除（対象は味方。段 1 の解除と同じ時に閉じる。plan/design-debuff-removal.md 2.2 節） ----
  const removeDebuffSources: RemoveDebuffSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveRemoveDebuffs(slot.definition, slot.character, slot.levels)) {
      removeDebuffSources.push({ sourceSlotIndex, effect, fires: firesOf(effect.trigger, sourceSlotIndex) });
    }
  });

  // ---- スタック量の増減（足す・減らす先は、同じ定義の付与の状態の、自分の件の列。plan/design-skill-stage3.md 1.1・1.5 節） ----
  const stackSources: StackSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveStackChanges(slot.definition, slot.character, slot.levels)) {
      const group = stateGroups.find((g) => g.sourceSlotIndex === sourceSlotIndex && g.state === effect.state);
      const track = group?.tracks[sourceSlotIndex] ?? null;
      if (track === null) {
        throw new Error(
          `no state track for ${effect.state} on slot ${sourceSlotIndex} (stackChange needs a grant on self)`,
        );
      }
      stackSources.push({
        sourceSlotIndex,
        effect,
        stage: stageOfStackChange(effect),
        fires: firesOf(effect.trigger, sourceSlotIndex),
        track,
      });
    }
  });

  /** フレーム frame がフルバーストの窓 [start, end) の中か（条件 inFullBurst） */
  const inFullBurstAt = (frame: number): boolean =>
    options.fullBurstWindows().some((w) => w.start <= frame && frame < w.end);

  /**
   * 枠 slotIndex のスロット skill の射撃の回数のきっかけの、フレームごとの間隔
   * （cycleEvery の shotCounts の窓の中ならその間隔。重なれば小さいほう。plan/design-skill-stage12.md 2.4 節）。窓の件はそのフレームに付いたものも見る
   */
  const shotCountEveryOf = (slotIndex: number, skill: SkillSlot): ShotCountEveryAt | undefined => {
    const own = cycleSources.filter(
      (c) => c.slotIndex === slotIndex && c.effect.target === 'shotCounts' && c.effect.targetSkill === skill,
    );
    if (own.length === 0) return undefined;
    return (frame) => {
      let every: number | undefined;
      for (const c of own) {
        if (readItems(c.track).some((it) => it.start <= frame && frame < it.end))
          every = every === undefined ? c.effect.every : Math.min(every, c.effect.every);
      }
      return every;
    };
  };

  // ---- カウンタの増減（対象は自分。値は枠 × カウンタごとに 1 つ。plan/design-skill-stage10.md 2.3 節） ----
  /**
   * 枠 × 状態ごとの、その枠に付いた記録のフレーム（昇順。plan/design-skill-stage19.md 2.1 節）。counterChange の { applied } と
   * 周期の since が読む。読むたびに、まだ見ていない記録を足す
   */
  const ownApplied = new Map<string, number[]>();
  /** 同じ索引の、{ applied } の付与で付いたのでない記録だけのもの（即時効果の { applied }。plan/design-mint-prika.md 2.6 節） */
  const ownUnchainedApplied = new Map<string, number[]>();
  /** { applied } の付与で付いた記録（timed・付与・即時効果の { applied } を起こさない。連鎖させない）。記録を足した直後に印を付ける */
  const chainedApplications = new Set<AppliedRecord>();
  let ownAppliedSeen = 0;
  const readOwnApplied = (index: Map<string, number[]>, slotIndex: number, state: NamedStateId): readonly number[] => {
    for (; ownAppliedSeen < applications.length; ownAppliedSeen++) {
      const r = applications[ownAppliedSeen]!;
      const key = `${r.slotIndex}:${r.state}`;
      const lists = chainedApplications.has(r) ? [ownApplied] : [ownApplied, ownUnchainedApplied];
      for (const map of lists) {
        const list = map.get(key) ?? [];
        if (!list.includes(r.frame)) insertSorted(list, r.frame);
        map.set(key, list);
      }
    }
    return index.get(`${slotIndex}:${state}`) ?? [];
  };
  const ownAppliedOf = (slotIndex: number, state: NamedStateId): readonly number[] =>
    readOwnApplied(ownApplied, slotIndex, state);
  /** 同: 枠にその状態の件（段によらない）が効いているか */
  const ownStateActive = (slotIndex: number, state: NamedStateId, frame: number): boolean =>
    (stateTracks[slotIndex]?.get(state) ?? []).some((t) => activeAt(t, frame).length > 0);
  /**
   * 同（論点 2）: 状態の付いた時から数える周期（since）。起点はそのフレームまでに付いた最後の記録で、k 回目は起点から k × everySeconds 秒
   * （timerFramesOf と同じ数え方）。その状態が効いている間だけ。atStart なら付いたフレームにも発火する（V-0729。currentHpDown。
   * 1 パス目の即時効果も件の一覧の sinceFires で決める）
   */
  const sinceFires = (trigger: TimerTrigger, slotIndex: number): TriggerTracker => {
    const state = trigger.since!.applied;
    const offsets = new Set(timerFramesOf(trigger, frames));
    if (trigger.atStart === true) offsets.add(0);
    return (ev) => {
      const start = lastAtOrBefore(ownAppliedOf(slotIndex, state), ev.frame);
      return start !== undefined && offsets.has(ev.frame - start) && ownStateActive(slotIndex, state, ev.frame);
    };
  };
  /**
   * 自分の状態の間だけ数える回数のきっかけ（during: { state }。plan/design-grave.md 2.4 節。V-0735）。その状態の件が効いていて、
   * 効果の条件（付与の condition。「完全計算かつ過熱I 状態の時に限り」の過熱I。その発で付いた分も入れる）を満たす発だけを数え、件が新しく始まったら 0 から数え直す
   * （付き直しで件が続いている間は数え直さない）。N の倍数に届いた発で発火する（回数の量は triggers.ts と同じ）
   */
  const stateWindowFires = (
    trigger: ResolvedShotCountTrigger,
    slotIndex: number,
    state: NamedStateId,
    conditionState: NamedStateId | undefined,
  ): TriggerTracker => {
    /** 枠のその状態の件のうち、[frame, frame + span] のどこかで効いている件の始まりの最小（無ければ undefined。配列を作らない） */
    const startOfHeld = (s: NamedStateId, frame: number, span: number): number | undefined => {
      let start: number | undefined;
      for (const t of stateTracks[slotIndex]?.get(s) ?? [])
        for (const it of readItems(t))
          if (it.start <= frame + span && frame < it.end && (start === undefined || it.start < start)) start = it.start;
      return start;
    };
    let count = 0;
    let from: number | undefined;
    return (ev) => {
      const shot = ev.shots[slotIndex];
      if (!shot) return false;
      const start = startOfHeld(state, ev.frame, 0);
      if (start === undefined) return false;
      if (start !== from) {
        from = start;
        count = 0;
      }
      // その発で付いた状態（同じ発の回数のきっかけで前に書いた付与。件は次のフレームから）も条件に入れる（V-0735: 過熱I を付けた発も
      // 過熱II の回数に、過熱II を付けた発も過熱III の回数に数える）。条件は自分の状態があるかだけ（skills/parse/state.ts）で、段 1.5 の件も
      // そのフレームに付いた件を見る
      if (conditionState !== undefined && startOfHeld(conditionState, ev.frame, 1) === undefined) return false;
      const next = advanceShotCount(count, shotCountWeight(trigger.count, shot), trigger.every);
      count = next.count;
      return next.fired;
    };
  };
  const counterSources: CounterSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCounterChanges(slot.definition, slot.character, slot.levels)) {
      const t = effect.trigger;
      counterSources.push({
        sourceSlotIndex,
        effect,
        fires:
          isEndedTrigger(t) || isResolvedApplied(t)
            ? null
            : isResolvedTimer(t) && t.since !== undefined
              ? sinceFires(t, sourceSlotIndex)
              : firesOf(t, sourceSlotIndex, shotCountEveryOf(sourceSlotIndex, effect.source.skill)),
      });
    }
  });
  const counterValues = new Map<string, number>();
  const counterRecords: CounterRecord[] = [];
  /** 枠のカウンタの、いまの値（そのフレームの増減は、すべての判定の後に足すので、前のフレームの終わりの値） */
  const counterValue = (slotIndex: number, counter: CounterId): number =>
    counterValues.get(counterKey(slotIndex, counter)) ?? 0;
  // ---- フルスタックの消費（定義の回復のきっかけ { fullStack } の状態。自分だけ。plan/design-skill-stage3.md 1.3 節）。
  // 使用武器の変更のきっかけ { fullStack } の状態も（plan/design-skill-stage11.md 2.1 節） ----
  const consuming: { holder: number; state: NamedStateId }[] = [];
  slots.forEach((slot, holder) => {
    if (slot === null || slot.definition === null) return;
    const effects = [
      ...resolveInstant(slot.definition, slot.character, slot.levels),
      ...resolveTimed(slot.definition, slot.character, slot.levels).filter((e) => e.stat === 'weapon'),
    ];
    for (const effect of effects) {
      if (!isResolvedFullStack(effect.trigger)) continue;
      const state = effect.trigger.fullStack;
      if (!consuming.some((c) => c.holder === holder && c.state === state)) consuming.push({ holder, state });
    }
  });

  // ---- 吸収回復の窓（効果ごと・持ち主ごと。C-0082・C-0087） ----
  /** 効果は出どころの枠・スロット・効果の番号で引く（1 パス目は効果を別に解決するので、同じオブジェクトではない） */
  const healKey = (sourceSlotIndex: number, effect: ResolvedInstantEffect): string =>
    `${sourceSlotIndex}:${effect.source.skill}:${effect.effectIndex}`;
  const healTracks = new Map<string, (HeldTrack | null)[]>();
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      if (effect.kind !== 'heal') continue;
      healTracks.set(
        healKey(sourceSlotIndex, effect),
        slots.map((target, holder) =>
          target !== null && canEverTarget(effect, sourceSlotIndex, holder, target.character)
            ? newTrack(holder, sourceSlotIndex, { kind: 'healWindow', effect }, 1)
            : null,
        ),
      );
    }
  });

  // ---- 持続ダメージが付ける敵の状態（出どころ × 状態ごとに 1 つの件の列。持ち主は敵） ----
  const enemyStateSources: EnemyStateSource[] = [];
  const dotCancelSources: { track: HeldTrack; fires: TriggerTracker }[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const group of groupDotsByState(resolveDotEffects(slot.definition, slot.character, slot.levels))) {
      const state = group[0]!.dot!.state;
      if (state === undefined) continue;
      enemyStateSources.push({
        effects: group.map((effect) => ({ effect, fires: firesOf(effect.trigger, sourceSlotIndex) })),
        track: newTrack(ENEMY, sourceSlotIndex, { kind: 'enemyState', state, effects: group }, 1),
      });
    }
    // 消去（cancelState）は、同じ枠の持続ダメージの状態の件を閉じる（plan/design-skill-stage13.md 2.5 節）
    for (const cancel of resolveDotCancels(slot.definition, slot.character, slot.levels)) {
      const source = enemyStateSources.find(
        ({ track }) =>
          track.sourceSlotIndex === sourceSlotIndex &&
          track.origin.kind === 'enemyState' &&
          track.origin.state === cancel.state,
      )!;
      dotCancelSources.push({ track: source.track, fires: firesOf(cancel.trigger, sourceSlotIndex) });
    }
  });

  // 静的な状態はフレーム 0 に付いた記録を作る（見る側の規則を状態の種類で分けない。plan/design-named-state.md 5.4 節）
  if (frames > 0) {
    slots.forEach((slot, slotIndex) => {
      for (const state of staticStatesOf(slot?.definition)) {
        applications.push({ frame: 0, state, sourceSlotIndex: slotIndex, slotIndex });
      }
    });
  }

  // ---- 状態の中身の最大スタック数▲（plan/design-skill-stage14.md 2.7 節。論点 5） ----
  // 上限が上がる件の列（持ち主のその状態の、スタックする件の列）→ 上げる状態の件の列（同じ持ち主に、中身を持つ定義の枠が付けたもの）と量
  const capRaisers = new Map<HeldTrack, { base: number; raisers: { track: HeldTrack; amount: number }[] }>();
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const up of resolveMaxStacksUps(slot.definition, slot.character, slot.levels)) {
      for (const raiser of tracks) {
        const r = raiser.origin;
        if (r.kind !== 'state' || raiser.sourceSlotIndex !== sourceSlotIndex || r.state !== up.whileState) continue;
        for (const target of tracks) {
          const t = target.origin;
          if (target.holder !== raiser.holder || t.kind !== 'state' || t.state !== up.state) continue;
          if (t.grant.maxStacks === undefined) continue;
          const entry = capRaisers.get(target) ?? { base: t.grant.maxStacks, raisers: [] };
          entry.raisers.push({ track: raiser, amount: up.amount });
          capRaisers.set(target, entry);
        }
      }
    }
  });
  /**
   * 件の列の、始まりのフレームごとの上限（上げる状態の件がそのフレームに付いていれば量を足す。上げる状態のスタック数によらず 1 回）。
   * 上げる件の列が無ければ undefined（付与の上限のまま）。上げる件の列の件は、件を作る直前に 1 回だけ読む（その入力が変われば updateLengths
   * が作り直させる）
   */
  const maxStacksAtOf = (track: HeldTrack): MaxStacksAt | undefined => {
    const entry = capRaisers.get(track);
    if (entry === undefined) return undefined;
    const raisers = entry.raisers.map((r) => ({ items: readItems(r.track), amount: r.amount }));
    return (frame) => {
      let cap = entry.base;
      for (const r of raisers) if (r.items.some((it) => it.start <= frame && frame < it.end)) cap += r.amount;
      return cap;
    };
  };

  // ---- 件を作る ----
  /**
   * 件の列の、件を作る関数が読む入力（reads）の長さを lengths に書き、前に書いた長さと違えば true（読まない入力は 0）。
   * 毎フレーム読まれるので、配列を作らずに比べる（plan/design-first-pass-perf.md 3.1 節）
   */
  const updateLengths = (
    track: HeldTrack,
    log: ShotLog | null | undefined,
    reads: TrackReads,
    lengths: number[],
  ): boolean => {
    let changed = setLength(lengths, 0, track.starts.length);
    changed = setLength(lengths, 1, track.opportunities?.length ?? 0) || changed;
    changed = setLength(lengths, 2, reads.shots ? (log?.frames.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 3, reads.weaponChangeEnds ? (log?.weaponChangeEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 4, reads.reloadEnds ? (log?.reloadEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 5, reads.fullBurstWindows ? options.fullBurstWindows().length : 0) || changed;
    changed = setLength(lengths, 6, track.closes.length) || changed;
    changed = setLength(lengths, 7, track.consumes.length) || changed;
    changed = setLength(lengths, 8, track.decreases.length) || changed;
    changed = setLength(lengths, 10, reads.untilEnds ? (track.untilEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 11, track.extensions?.length ?? 0) || changed;
    // 上限を上げる状態の件の列の入力（始まり・閉じる・消費・減少。その件の列は持続の付与で、ほかの入力を読まない）
    const raisers = capRaisers.get(track)?.raisers;
    if (raisers === undefined) return changed;
    let raised = 0;
    for (const r of raisers)
      raised += r.track.starts.length + r.track.closes.length + r.track.consumes.length + r.track.decreases.length;
    return setLength(lengths, 9, raised) || changed;
  };
  /** 件の列の件（件を作る関数が読む入力が変わったときだけ作り直す） */
  const readItems = (track: HeldTrack): HeldItem[] => {
    // while の件は、出どころの枠の状態の件から作る（入力の長さでなく、元の件が作り直されたかで見る）
    if (track.origin.kind === 'while') {
      const effect = track.origin.effect;
      // 出どころ × 閾値の区間の件（updateHpAtLeast）をそのまま使う（plan/design-hp-ratio-readers.md 2.1 節）
      if (isHpWhileEffect(effect)) return (track.items = hpWhileStates.get(track)!.items);
      return isCounterWhileEffect(effect) ? readCounterWhileItems(track, effect) : readWhileItems(track, effect);
    }
    const log = track.holder === ENEMY ? null : logs[track.holder];
    const { reads, lengths, verified } = itemsSeen.get(track)!;
    if (updateLengths(track, log, reads, lengths)) {
      track.items = buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track));
    } else if (options.verifyItems === true) {
      // 作り直さずに返す件が、いまの入力から作り直した件と同じか（入力のどれも変わっていなければ確かめ直さない）
      if (
        updateLengths(track, log, ALL_READS, verified) &&
        JSON.stringify(track.items) !==
          JSON.stringify(buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track)))
      )
        throw new Error(`stale items: track ${tracks.indexOf(track)}`);
    }
    return track.items;
  };
  const activeAt = (track: HeldTrack, frame: number): HeldItem[] =>
    readItems(track).filter((it) => it.start <= frame && frame < it.end);

  /**
   * while の件の列が見る、出どころの枠のその状態（家族の根なら家族のどれか）の
   * 段 1 の件の列（出どころは問わない。条件の selfState が見るものと同じ。plan/design-skill-stage9.md 1.3 節）。
   * 段 1.5（条件つきの付与）の状態の件の列も見る（V-0702。
   * クエンシー：エスケープクイーンの S1 の「ルート探索 2 段階フルスタック状態の時のみ」。2 段階の付与は 1 段階のフルスタックの条件つき）。件の列は
   * 条件の selfState と同じ stateTracks から引く。段 1.5 の件も付いたフレームから効かせる（while は stat を出すだけで状態を付けないので連鎖しない）
   */
  const whileOwn = new Map<HeldTrack, HeldTrack[]>();
  /** while の件を作った時の、元の状態の件（件の列ごとの items。作り直すと別の配列になる） */
  const whileSeen = new Map<HeldTrack, readonly HeldItem[][]>();
  const readWhileItems = (track: HeldTrack, effect: ResolvedWhileEffect): HeldItem[] => {
    let own = whileOwn.get(track);
    if (own === undefined) {
      const family = statesMatching(effect.whileState);
      own = family.flatMap((s) => stateTracks[track.sourceSlotIndex]?.get(s) ?? []);
      whileOwn.set(track, own);
    }
    const deps = own.map((t) => readItems(t));
    const seen = whileSeen.get(track);
    if (seen !== undefined && seen.length === deps.length && seen.every((d, i) => d === deps[i])) return track.items;
    whileSeen.set(track, deps);
    track.items = whileItems(
      own.map((t, i) => ({ origin: t.origin, items: deps[i]!, chance: t.opportunities !== null })),
      effect.whileStacks,
    );
    return track.items;
  };

  /**
   * カウンタの while の件（plan/design-skill-stage11.md 2.4 節）。出どころの枠のそのカウンタが atLeast 以上の間。
   * 記録の値はそのフレームのすべての判定の後に足したものなので、効くのは次のフレームから（戦闘開始時の増減はフレーム 0 から）。
   * カウンタの記録が増えた時だけ作り直す
   */
  const counterWhileSeen = new Map<HeldTrack, number>();
  const readCounterWhileItems = (track: HeldTrack, effect: ResolvedCounterWhileEffect): HeldItem[] => {
    if (counterWhileSeen.get(track) === counterRecords.length) return track.items;
    counterWhileSeen.set(track, counterRecords.length);
    const { counter, atLeast } = effect.whileCounter;
    const items: HeldItem[] = [];
    let open: number | null = null;
    for (const r of counterRecords) {
      if (r.slotIndex !== track.sourceSlotIndex || r.counter !== counter) continue;
      const from = counterEffectiveFrom(r);
      if (r.value >= atLeast) open ??= from;
      else if (open !== null) {
        if (open < from) items.push({ start: open, end: Math.min(from, frames) });
        open = null;
      }
    }
    if (open !== null && open < frames) items.push({ start: open, end: frames });
    track.items = items;
    return track.items;
  };

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
  // 段 1.5（条件つきの付与）の状態の件も入れ、前のフレームまでに付いた件だけを見る
  // （同じフレームの条件つきどうしは連鎖させない。超火力（カウンタの条件で付く）を、後のフルバーストの開始の条件が見る。plan/design-skill-stage10.md 3.2 節）
  const stateTracks = slots.map((_, holder) => {
    const byState = new Map<NamedStateId, HeldTrack[]>();
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== holder || (track.stage !== 1 && track.stage !== 1.5) || o.kind !== 'state') continue;
      byState.set(o.state, [...(byState.get(o.state) ?? []), track]);
    }
    return byState;
  });
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

  /** 条件が無ければ成り立つ（段 1.5 には、条件の無い perCount の timed も入る。stageOfTimed） */
  const holdsAt = (condition: EffectCondition | undefined, sourceSlotIndex: number, frame: number): boolean => {
    if (condition === undefined) return true;
    if (condition.selfState !== undefined) {
      const { state, present, stacks, sameFiring } = condition.selfState;
      // 家族の根なら、家族のどの状態でも当たる（plan/design-skill-stage5.md 1.2 節）
      const family = statesMatching(state);
      const isStatic = family.some((s) => staticStates[sourceSlotIndex]?.has(s) === true);
      const own = family.flatMap((s) => stateTracks[sourceSlotIndex]?.get(s) ?? []);
      if (stacks === undefined) {
        const has = isStatic || own.some((t) => selfStateItemsAt(t, frame).length > 0);
        if (has !== present) return false;
      } else if (
        !stacksHold(
          stacks,
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

  /**
   * 確率のきっかけ（timed・付与）の機会を 1 つ貯める。発のフレーム f の次のフレームから、確率 × その発の回数の量（回数の量が 0 の発と、
   * 戦闘の後に始まる機会は除く。plan/design-soldier-eg.md 3.1 節）
   */
  const pushChanceOpportunity = (
    opportunities: ChanceOpportunity[] | null | undefined,
    trigger: ResolvedShotCountTrigger & { chance: number },
    shot: ShotEvent | null | undefined,
    f: number,
  ): void => {
    if (!opportunities || !shot || f + 1 >= frames) return;
    const weight = shotCountWeight(trigger.count, shot);
    if (weight > 0) opportunities.push({ start: f + 1, q: Math.min(1, trigger.chance * weight) });
  };

  // ---- 登録 ----
  /** timed の発火 1 つを、対象の持ち主の件の列に足す。対象になった枠を返す */
  const fireTimed = (src: TimedSource, start: number, context: FireContext): number[] => {
    if (start >= frames) return [];
    // 値 × 発火のフレームの自分のその状態のスタック数（0 なら出さない。plan/design-maids.md 2.1 節）
    const per = src.effect.perCount;
    const scale = per === undefined ? undefined : stackLevelAt(src.sourceSlotIndex, per.state, start);
    if (scale !== undefined && scale <= 0) return [];
    const targets: number[] = [];
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(src.effect, src.sourceSlotIndex, holder, target.character, context)) return;
      // 敵の件の効果は、対象の味方があれば敵の件の列に 1 回だけ足す
      if (src.enemy !== null) {
        if (targets.length === 0) insertSorted(src.enemy.starts, start);
        targets.push(holder);
        return;
      }
      const track = src.tracks[holder];
      if (!track)
        throw new Error(`no track for ${src.effect.source.skill}[${src.effect.effectIndex}] on slot ${holder}`);
      insertSorted(track.starts, start);
      if (scale !== undefined) (track.startScales ??= new Map()).set(start, scale);
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 状態の付与の発火 1 つを、対象の持ち主の状態の件の列と、付いた記録に足す。fire は leadFrames のある付与のきっかけの発のフレーム
   * （件の列の leadFires に足す）
   */
  const fireGrant = (g: GrantSource, start: number, context: FireContext, fire?: number): number[] => {
    if (start >= frames) return [];
    const group = g.group;
    // スタックの数をカウンタの値か、自分の状態のスタック数（発火のフレームの段の最大。条件 selfState と同じ件を見る。
    // plan/design-skill-stage10.md 2.1 節）から取る（0 なら付けない）。付いた後は、数え元が変わっても段は変わらない（V-0523）
    const from = g.grant.stacksFrom;
    // 使用回数のある状態は、1 回の発火で stacksPerFire のスタック（セブンスドワーフ・フルアクティブの 2 回）
    // 確率の状態から写すときは、段ごとの「元のスタック数がその段以上の確率」で
    // 段を付け、件の段の scale にする（値はスタック数の期待値 × 値になる。plan/design-tove-base.md 2.1 節）
    const levels =
      from !== undefined && 'state' in from ? chanceLevelsAt(group.sourceSlotIndex, from.state, start) : undefined;
    const count =
      from === undefined
        ? (g.grant.stacksPerFire ?? 1)
        : 'counter' in from
          ? counterValue(group.sourceSlotIndex, from.counter)
          : levels !== undefined
            ? levels.filter((p) => p > 0).length
            : stackLevelAt(group.sourceSlotIndex, from.state, start);
    if (count <= 0) return [];
    const addStart = (track: HeldTrack): void => {
      let fires: number[] | undefined;
      if (fire !== undefined) {
        const byStart = (track.leadFires ??= new Map());
        fires = byStart.get(start);
        if (fires === undefined) byStart.set(start, (fires = []));
      }
      for (let k = 0; k < count; k++) {
        insertSorted(track.starts, start);
        if (fires !== undefined) insertSorted(fires, fire!);
      }
      if (levels !== undefined) (track.levelScales ??= new Map()).set(start, levels);
    };
    const targets: number[] = [];
    // 敵に付く状態は、対象の味方があれば敵の件の列に 1 回だけ足す（付いた記録は作らない。{ applied } で見る
    // 語彙は味方の状態だけ）
    if (group.enemy !== null) {
      const on = slots.some(
        (target, holder) =>
          target !== null && isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context),
      );
      if (on) addStart(group.enemy);
      return targets;
    }
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context)) return;
      const track = group.tracks[holder];
      if (!track) throw new Error(`no state track for ${group.state} on slot ${holder}`);
      addStart(track);
      // { applied } のきっかけの付与（文脈に appliedCasters がある）は、同じフレームの切り替えでは後とみなす
      switchGroup(holder, group.state, start, context?.appliedCasters !== undefined);
      const record: AppliedRecord = {
        frame: start,
        state: group.state,
        sourceSlotIndex: group.sourceSlotIndex,
        slotIndex: holder,
      };
      applications.push(record);
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 切り替えの組の状態 state が持ち主 holder にフレーム start に付いたら、組のほかの状態の
   * 件の列（出どころは問わない。解除不可も。plan/design-mint-prika.md 2.2 節）を閉じる。
   * ふだんは解除と同じく start + 1 で切り、同じフレームに始まった件は残す（付与が勝つ）。
   * { applied } のきっかけの付与は、同じフレームの付与より後とみなし、同じフレームに始まった件も切る（消費と同じ）
   */
  const switchGroup = (holder: number, state: NamedStateId, start: number, fromApplied: boolean): void => {
    const switchGroupOf = namedStateGroup(state);
    if (switchGroupOf === undefined) return;
    for (const other of tracks) {
      const o = other.origin;
      if (other.holder !== holder || o.kind !== 'state' || o.state === state) continue;
      if (namedStateGroup(o.state) !== switchGroupOf) continue;
      if (fromApplied) consumeTrack(other, start);
      else closeTrack(other, start);
    }
  };
  /**
   * 解除の発火 1 つ（plan/design-skill-stage1.md 1.2 節）。持ち主（自分）のその状態の件の列（出どころは問わない）に、
   * 閉じるフレームを足す。解除不可の件の列は閉じない
   */
  const fireRemove = (src: RemoveSource, frame: number): void => {
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== src.sourceSlotIndex || o.kind !== 'state' || o.state !== src.effect.state) continue;
      // 消去（cancel）は解除不可の件も閉じる（plan/design-mint-prika.md 2.1 節）
      if (o.grant.undispellable === true && src.effect.cancel !== true) continue;
      closeTrack(track, frame);
    }
  };
  /**
   * 延長の発火 1 つ（plan/design-mint-prika.md 2.5 節）。対象の枠のその状態の件の列（出どころは問わない）に、延長を足す
   * （そのフレームに付いていて後まで続く件だけが延びる。extendItems）
   */
  const fireExtend = (src: ExtendSource, frame: number): void => {
    if (frame >= frames) return;
    if (src.targets === undefined) {
      const matching = statesMatching(src.effect.state);
      src.targets = tracks.filter(
        (track) =>
          track.origin.kind === 'state' &&
          matching.includes(track.origin.state) &&
          (src.effect.target === 'self' ? track.holder === src.sourceSlotIndex : track.holder !== ENEMY),
      );
    }
    for (const track of src.targets) (track.extensions ??= []).push({ frame, frames: src.effect.frames });
  };
  /**
   * 持ち主ごとの、デバフ 1 個ごとの件の列。デバフの印の付いた状態（解除不可を除く）は状態ごと、味方の timed の▼は効果ごと
   * （plan/design-debuff-removal-timed.md 2.1・2.2 節）。件の列は組み立ての後に増えないので、初めての発火で作る
   */
  let debuffTracks: HeldTrack[][][] | undefined;
  /**
   * 遅れ（delayFrames）のあるデバフ解除の予約（効くフレーム → 解除）。対象は、ループがそのフレームに来た時に、そのフレームまでに
   * 付いた状態で選ぶ（発火のフレームで先読みすると、遅れの間に付いた状態が件の列にまだ無い）
   */
  const pendingRemoveDebuffs = new Map<number, RemoveDebuffSource[]>();
  /**
   * デバフ解除の効くフレーム at（ループがいるフレーム）に効いている、味方のデバフ（印の付いた状態と、timed の▼）の
   * 件を、対象の味方ごとに count 個まで、スタックごと閉じる（選び方は pickRemoveDebuff）。at のすべての段の付与を登録した後に呼ぶ
   */
  const fireRemoveDebuff = (src: RemoveDebuffSource, at: number): void => {
    debuffTracks ??= slots.map((_, holder) => {
      const byState = new Map<NamedStateId, HeldTrack[]>();
      const allyDecreases: HeldTrack[][] = [];
      for (const track of tracks) {
        const o = track.origin;
        if (track.holder !== holder) continue;
        if (o.kind === 'timed' && isAllyDecrease(o.effect)) {
          allyDecreases.push([track]);
          continue;
        }
        if (o.kind !== 'state' || !namedStateIsDebuff(o.state)) continue;
        if (o.grant.undispellable === true) continue;
        const list = byState.get(o.state);
        if (list === undefined) byState.set(o.state, [track]);
        else list.push(track);
      }
      return [...byState.values(), ...allyDecreases];
    });
    // 持ち主ごとに、at に効いているデバフと、その最も早い始まり。at に別の解除が閉じた件の列はもう外れているので数えない。removable は
    // そのうちこの解除で外れるもの（閉じても付与が勝つ件の列と、閉じるフレームを読まない確率の件の列を除く）。外すのは removable から選び
    // （外れない件で N 機・count 個の枠を使わない）、選び方を確かめていない所の注記は、ゲームが選ぶ元の、付いているデバフ全部で決める
    // （plan/design-debuff-removal.md 2.2 節）
    const heldOf = (removable: boolean) =>
      debuffTracks!.map((debuffs) =>
        debuffs.flatMap((ts) => {
          const starts = ts.flatMap((t) =>
            t.closes.includes(at) || (removable && (!closeTakesEffect(t.starts, at) || t.opportunities !== null))
              ? []
              : activeAt(t, at).map((it) => it.start),
          );
          return starts.length === 0 ? [] : [{ tracks: ts, firstStart: Math.min(...starts) }];
        }),
      );
    const { effect } = src;
    const pick = effect.target === 'debuffedRandom' ? effect.pick : undefined;
    const { chosen } = pickRemoveDebuff(heldOf(true), effect.count, pick);
    const { guesses } = pickRemoveDebuff(heldOf(false), effect.count, pick);
    for (const ts of chosen) for (const track of ts) closeTrack(track, at);
    for (const guess of guesses) {
      removeDebuffGuesses.push({
        frame: at,
        sourceSlotIndex: src.sourceSlotIndex,
        effect: { source: effect.source, effectIndex: effect.effectIndex },
        ...guess,
      });
    }
  };
  /**
   * スタック量の増加の発火 1 つ（plan/design-skill-stage3.md 1.1 節）。状態の件の列に、同じフレームの始まりを N 個入れる
   * （スタックの段は始まりの数で上がり、上限と維持は付与のもの）。付いた記録は 1 件。
   * 減少（同 1.5 節）は、件の列に減少（そのフレームに効いている段の上から N 段を次のフレームで切る）を入れる。付いた記録は作らない
   */
  const fireStackChange = (src: StackSource, start: number): void => {
    if (start >= frames) return;
    if (src.effect.decrease === true) {
      const decreases = src.track.decreases;
      let i = decreases.length;
      while (i > 0 && decreases[i - 1]!.frame > start) i--;
      // 0 になったら件を閉じる減少（使用回数を使い切った時）
      decreases.splice(i, 0, {
        frame: start,
        amount: src.effect.amount,
        ...(src.effect.closesAtZero === true ? { closesAtZero: true as const } : {}),
      });
      return;
    }
    for (let k = 0; k < src.effect.amount; k++) insertSorted(src.track.starts, start);
    const record: AppliedRecord = {
      frame: start,
      state: src.effect.state,
      sourceSlotIndex: src.sourceSlotIndex,
      slotIndex: src.sourceSlotIndex,
    };
    applications.push(record);
  };

  // ---- { applied } の出どころ（timed・付与。見る状態が自分に付いた記録から発火する。plan/design-skill-stage4.md 1.1 節） ----
  type AppliedSource = {
    state: NamedStateId;
    sourceSlotIndex: number;
    stage: HeldStage;
    /** 最後に発火したフレーム。記録のフレームは呼び出しの順に減らないので、前の呼び出しと同じフレームの 2 回目を落とす */
    last: number;
    /** 発火の条件（selfState だけ。plan/design-mint-prika.md 2.3 節） */
    condition: EffectCondition | undefined;
    /** 同: 条件を満たさない発火を記録する（付与は skipGrant で状態も残す） */
    skip: (frame: number) => void;
    /** casters はそのフレームにきっかけの状態の件を付けた枠（対象 appliedCaster。同 2.4 節） */
    fire: (start: number, casters: readonly number[]) => void;
  };
  const appliedSources: AppliedSource[] = [];
  for (const group of stateGroups) {
    for (const g of group.grants) {
      const t = g.grant.trigger;
      if (!isResolvedApplied(t)) continue;
      appliedSources.push({
        state: t.applied,
        sourceSlotIndex: group.sourceSlotIndex,
        stage: g.stage,
        last: -1,
        condition: g.grant.condition,
        skip: (frame) => skipGrant(g, frame),
        fire: (start, casters) => {
          const before = applications.length;
          fireGrant(g, start, { appliedCasters: casters });
          for (let k = before; k < applications.length; k++) chainedApplications.add(applications[k]!);
        },
      });
    }
  }
  for (const src of timedSources) {
    const t = src.effect.trigger;
    if (!isResolvedApplied(t)) continue;
    appliedSources.push({
      state: t.applied,
      sourceSlotIndex: src.sourceSlotIndex,
      stage: src.stage,
      last: -1,
      condition: src.effect.condition,
      skip: (frame) => skipEffect(src.sourceSlotIndex, src.effect, frame),
      fire: (start, casters) => {
        fireTimed(src, start, { appliedCasters: casters });
      },
    });
  }
  // { applied } の状態の維持の延長（plan/design-mint-prika.md 2.5 節）
  for (const src of extendSources) {
    const t = src.effect.trigger;
    if (!isResolvedApplied(t)) continue;
    appliedSources.push({
      state: t.applied,
      sourceSlotIndex: src.sourceSlotIndex,
      stage: appliedStageOf(t.applied),
      last: -1,
      condition: src.effect.condition,
      skip: (frame) => skipEffect(src.sourceSlotIndex, src.effect, frame),
      fire: (start) => fireExtend(src, start),
    });
  }
  /**
   * 段 stage の { applied } の出どころを、この呼び出しで付いた記録（applications の from から。{ applied } の付与の記録を除く）から
   * 発火する。窓は記録のフレームから。同じフレームに 2 つの出どころから付いても 1 回（appliedFrames と同じ）
   */
  const dispatchApplied = (stage: HeldStage, from: number): void => {
    if (from >= applications.length) return;
    for (const a of appliedSources) {
      if (a.stage !== stage) continue;
      const fires = new Map<number, number[]>();
      for (let k = from; k < applications.length; k++) {
        const r = applications[k]!;
        if (r.state !== a.state || r.slotIndex !== a.sourceSlotIndex || chainedApplications.has(r)) continue;
        const casters = fires.get(r.frame) ?? [];
        if (!casters.includes(r.sourceSlotIndex)) casters.push(r.sourceSlotIndex);
        fires.set(r.frame, casters);
      }
      for (const frame of [...fires.keys()].sort((x, y) => x - y)) {
        if (frame <= a.last) continue;
        a.last = frame;
        // 条件（自分の状態）は段 1.5 と同じく前のフレームまでに付いた件を見る（plan/design-mint-prika.md 2.3 節）
        if (!holdsAt(a.condition, a.sourceSlotIndex, frame)) {
          a.skip(frame);
          continue;
        }
        a.fire(frame, fires.get(frame)!);
      }
    }
  };
  /** まだ dispatchApplied で読んでいない記録の始まり（静的な状態の記録は、戦闘開始時の呼び出しで読む） */
  let appliedFrom = 0;
  const recordRanking = (
    frame: number,
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number; targetCount?: number; excludeSelf?: string },
    attackRank: readonly number[],
    finalAttacks: (number | null)[],
    targets: readonly number[],
  ): void => {
    rankings.push({
      frame,
      sourceSlotIndex,
      effect: { source: e.source, effectIndex: e.effectIndex },
      finalAttacks,
      targets: attackRank.filter((i) => targets.includes(i)),
      // unlessShort で末尾に足した自分は、同値の比べに入れない（順位ではなく足りない分の補い）
      tied: tiedAtCutoff(
        e.excludeSelf === 'unlessShort' ? attackRank.slice(0, -1) : attackRank,
        finalAttacks,
        e.targetCount ?? 1,
      ),
    });
  };

  // { applied } の出どころは出来事では発火しない（dispatchApplied）
  const timedAt = (stage: HeldStage): TimedSource[] =>
    timedSources.filter((s) => s.stage === stage && !isResolvedApplied(s.effect.trigger));
  const stage1Timed = timedAt(1);
  const stage15Timed = timedAt(1.5);
  const stage2Timed = timedAt(2);
  const grantsAt = (stage: HeldStage): GrantSource[] =>
    stateGroups.flatMap((group) =>
      group.grants.filter((g) => g.stage === stage && !isResolvedApplied(g.grant.trigger)),
    );
  const stage1Grants = grantsAt(1);
  // 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節）: leadFrames のある付与（段 1 だけ。skills/parse/state.ts が条件・
  // stacksFrom・順位の対象を止める）の、前の回の発（known）と、件の始まりのフレーム → その件の数（early）と、この回の発（fired）
  if (stateGroups.some((group) => group.grants.some((g) => g.grant.leadFrames !== undefined && g.stage !== 1)))
    throw new Error('a grant with leadFrames must be in stage 1');
  // HP の割合で解除される付与の「発火のフレームにすでに閾値以下なら付かない」は段 1 の付与だけが見る（skills/parse/state.ts が
  // 条件を止める）。前の回の発から始める付与（leadFrames）とは組まない
  if (
    stateGroups.some((group) =>
      group.grants.some(
        (g) => g.grant.untilSelfHpAtMost !== undefined && (g.stage !== 1 || g.grant.leadFrames !== undefined),
      ),
    )
  )
    throw new Error('a grant lasting until the HP drops must be in stage 1 without leadFrames');
  const leads = new Map(
    stage1Grants.flatMap((g) => {
      if (g.grant.leadFrames === undefined) return [];
      const known = options.leadShots?.[leadShotKey(g)] ?? [];
      const early = new Map<number, number[]>();
      for (const shot of known) {
        const at = grantStartOf(g.grant, shot);
        const shots = early.get(at);
        if (shots === undefined) early.set(at, [shot]);
        else shots.push(shot);
      }
      return [[g, { known: new Set(known), early, fired: [] as number[] }] as const];
    }),
  );
  const stage15Grants = grantsAt(1.5);
  const stage2Grants = grantsAt(2);
  const stage1Removes = removeSources.filter((r) => r.stage === 1);
  const stage15Removes = removeSources.filter((r) => r.stage === 1.5);
  const stage1Stacks = stackSources.filter((x) => x.stage === 1);
  const stage15Stacks = stackSources.filter((x) => x.stage === 1.5);
  const skipGrant = (g: GrantSource, frame: number): void => {
    conditionSkips.push({
      frame,
      sourceSlotIndex: g.group.sourceSlotIndex,
      effect: { source: g.grant.source, effectIndex: g.grant.effectIndex },
      state: g.group.state,
    });
  };
  const skipEffect = (
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number },
    frame: number,
  ): void => {
    conditionSkips.push({ frame, sourceSlotIndex, effect: { source: e.source, effectIndex: e.effectIndex } });
  };

  const ampFires = new Map(amplifiers.map((amp) => [amp, firesOf(amp.effect.trigger, amp.sourceSlotIndex)]));

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
  /** このフレームのカウンタの増減を、すべての判定の後に足す（0 と上限の間で切る） */
  const registerCounters = (ev: FrameEvents, battleStartOnly: boolean): void => {
    if (counterSources.length === 0) return;
    const f = ev.frame;
    const deltas = new Map<string, { slotIndex: number; counter: CounterId; delta: number }>();
    for (const src of counterSources) {
      const t = src.effect.trigger;
      let fired: boolean;
      if (isEndedTrigger(t)) fired = !battleStartOnly && endedAt(src.sourceSlotIndex, t.ended, f);
      // 自分にその状態が付いたフレーム（このフレームのすべての付与の後。戦闘開始時の付与はフレーム 0 の
      // 出来事で読む）
      else if (isResolvedApplied(t))
        fired = !battleStartOnly && lastAtOrBefore(ownAppliedOf(src.sourceSlotIndex, t.applied), f) === f;
      else if (battleStartOnly) fired = atBattleStart(t);
      else fired = t !== 'battleStart' && src.fires!(ev);
      if (!fired) continue;
      const condition = src.effect.condition;
      if (
        !fireContextHolds(condition, t, ev, src.sourceSlotIndex) ||
        (condition !== undefined && !counterConditionHolds(condition, src.sourceSlotIndex, f))
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      const key = counterKey(src.sourceSlotIndex, src.effect.counter);
      const d = deltas.get(key) ?? { slotIndex: src.sourceSlotIndex, counter: src.effect.counter, delta: 0 };
      d.delta += src.effect.decrease === true ? -src.effect.amount : src.effect.amount;
      deltas.set(key, d);
    }
    for (const [key, { slotIndex, counter, delta }] of deltas) {
      const before = counterValues.get(key) ?? 0;
      const after = Math.max(0, Math.min(counterMax(counter), before + delta));
      if (after === before) continue;
      counterValues.set(key, after);
      counterRecords.push(
        battleStartOnly
          ? { frame: 0, slotIndex, counter, value: after, battleStart: true }
          : { frame: f, slotIndex, counter, value: after },
      );
      if (after === counterMax(counter)) counterFullAt.set(key, (battleStartOnly ? 0 : f) + 1);
      // 0 に届いたら、そのカウンタで続く自分の状態の件の列を次のフレームで閉じる（解除不可でも）
      if (after === 0)
        for (const track of counterEmptyTracks.get(key) ?? []) closeTrack(track, battleStartOnly ? 0 : f);
    }
  };

  /** 段 1〜2 と強化の発火（手順 3。battleStartOnly ならループの前の戦闘開始時の分だけ） */
  const register = (ev: FrameEvents, battleStartOnly: boolean): void => {
    const f = ev.frame;
    // このフレームの HP の割合の while の可否（このフレームのどの登録よりも先）
    updateHpAtLeast(f);
    const from = appliedFrom;
    // 見る状態の持ち主の件が f に外れたら、f を窓の終わりに足す（f には付いていない。plan/design-grave.md 2.5 節）
    if (!battleStartOnly)
      for (const { track, state } of stateEndTracks) {
        const ends = track.untilEnds!;
        if (ends.at(-1) !== f && endedAt(track.holder, state, f)) ends.push(f);
      }
    // HP の割合で解除される件（plan/design-hp-down-interval.md 2.2 節）: f より前に付いた件が f に効いていて、持ち主の HP の割合が閾値以下と読めたら、
    // f + 1 で閉じる（f には付いている。HP の割合は f より前の現在の HP▼ から。付いた時にすでに以下なら付かない（段 1 の付与））
    if (!battleStartOnly)
      for (const { track, threshold } of selfHpUntilTracks)
        if (readItems(track).some((it) => it.start < f && f < it.end) && selfHpAtMostAt(track.holder, f, threshold))
          closeTrack(track, f);
    const take = (trigger: ResolvedTrigger): boolean =>
      battleStartOnly ? atBattleStart(trigger) : trigger !== 'battleStart';
    // 段 1: 条件なし・順位の対象でない付与と効果（確率のきっかけは機会を貯める）
    for (const g of stage1Grants) {
      const lead = leads.size > 0 ? leads.get(g) : undefined;
      // 前の回の発の件は、その始まりのフレームに登録する（同じフレームの段 1.5 の enemyState が見る）
      if (lead !== undefined && !battleStartOnly) {
        const shots = lead.early.get(f);
        if (shots !== undefined) for (const shot of shots) fireGrant(g, f, null, shot);
      }
      // 確率のきっかけの付与は、timed の確率と同じく機会を貯める（付いた記録は作らない）
      if (isResolvedChance(g.grant.trigger)) {
        if (!battleStartOnly) {
          const track = g.group.tracks.find((t) => t !== null);
          pushChanceOpportunity(track?.opportunities, g.grant.trigger, ev.shots[g.group.sourceSlotIndex], f);
        }
        continue;
      }
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (!fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex)) {
        skipGrant(g, f);
        continue;
      }
      // HP の割合で解除される状態は、発火のフレームにすでに閾値以下なら付かない（不発に数える。V-0729）
      const hpUntil = g.grant.untilSelfHpAtMost;
      if (hpUntil !== undefined && !battleStartOnly && selfHpAtMostAt(g.group.sourceSlotIndex, f, hpUntil)) {
        skipGrant(g, f);
        continue;
      }
      if (lead !== undefined) {
        lead.fired.push(f);
        if (lead.known.has(f)) continue;
      }
      fireGrant(
        g,
        battleStartOnly ? 0 : grantStartOf(g.grant, f),
        fireContextOf(g.grant.trigger, ev),
        lead !== undefined ? f : undefined,
      );
    }
    for (const src of stage1Timed) {
      if (src.chance) {
        const trigger = src.effect.trigger;
        if (!battleStartOnly && isResolvedChance(trigger)) {
          const track = src.enemy ?? src.tracks.find((t) => t !== null);
          pushChanceOpportunity(track?.opportunities, trigger, ev.shots[src.sourceSlotIndex], f);
        }
        continue;
      }
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (!fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex)) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    // 解除（閉じるのは発火の次のフレームなので、段の中の順は同じフレームの判定に効かない。plan/design-skill-stage1.md 1.2 節）
    for (const r of stage1Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (!fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex)) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // スタック量の増減（増加は状態の件の列の始まりを足すだけなので、段 1 の付与と同じ見え方。減少は次のフレームで切るので、
    // 段の中の順は同じフレームの判定に効かない）
    for (const x of stage1Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 段 1 の { applied }（段 1 の付与・スタック量の増加で付いた記録から）
    dispatchApplied(1, from);
    // 敵の状態（持続ダメージの発火のフレーム。ループの中の判定は読まない）
    for (const e of enemyStateSources) {
      for (const { effect, fires } of e.effects) {
        if (!take(effect.trigger) || !(battleStartOnly || fires(ev))) continue;
        const at = battleStartOnly ? 0 : f + (effect.dot!.applyDelayFrames ?? 0);
        if (at < frames) insertSorted(e.track.starts, at);
      }
    }
    // 消去（f の判定には付いている。dotActiveSpans が f + 1 で切る）
    if (!battleStartOnly) for (const c of dotCancelSources) if (c.fires(ev)) insertSorted(c.track.closes, f);
    if (!battleStartOnly) {
      // 循環の間隔の変更はループの中でしか読まないので、戦闘開始時もフレーム 0 の出来事で登録する
      for (const c of cycleSources) {
        if (!c.fires(ev)) continue;
        const start = startOfFire(c.effect.trigger, f);
        if (start < frames) insertSorted(c.track.starts, start);
      }
    }
    // 段 1.5: 条件つきの付与と効果（と、状態のスタック数を数で読む付与）。判定は段 1 の件だけを見る（条件つきどうしは
    // 連鎖させない）
    for (const g of stage15Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (
        !fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex) ||
        !holdsAt(g.grant.condition, g.group.sourceSlotIndex, f)
      ) {
        skipGrant(g, f);
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : grantStartOf(g.grant, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage15Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (
        !fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex) ||
        !holdsAt(src.effect.condition, src.sourceSlotIndex, f)
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    for (const r of stage15Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (
        !fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex) ||
        !holdsAt(r.effect.condition, r.sourceSlotIndex, f)
      ) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // 状態の維持の延長（{ applied } のほか。段 1.5 までに付いた件を延ばす。plan/design-mint-prika.md 2.5 節）
    for (const x of extendSources) {
      if (isResolvedApplied(x.effect.trigger)) continue;
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!holdsAt(x.effect.condition, x.sourceSlotIndex, f)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireExtend(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    for (const x of stage15Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (
        !fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex) ||
        !holdsAt(x.effect.condition, x.sourceSlotIndex, f)
      ) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    dispatchApplied(1.5, from);
    // 段 2: 順位の対象。発火のフレームの順位（段 1・1.5 の攻撃力の件。同じフレームに付いたものも入れる）
    for (const g of stage2Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(g.grant.trigger, f, g.grant.delayFrames);
      if (start >= frames) continue;
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(g.grant, rankSlots, finalAttacks, g.group.sourceSlotIndex);
      const targets = fireGrant(g, start, { ...fireContextOf(g.grant.trigger, ev), attackRank });
      recordRanking(f, g.group.sourceSlotIndex, g.grant, attackRank, finalAttacks, targets);
    }
    for (const src of stage2Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames);
      if (start >= frames) continue;
      // 最終防御力の比べの対象（発火のフレームの最終防御力。段 1・1.5 の防御力▲ の件。同じフレームに付いたものも入れる）
      if (dependsOnDefense(src.effect)) {
        fireTimed(src, start, {
          ...fireContextOf(src.effect.trigger, ev),
          lowerDefense: lowerDefenseAt(src.sourceSlotIndex, f),
        });
        continue;
      }
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(src.effect, rankSlots, finalAttacks, src.sourceSlotIndex);
      const targets = fireTimed(src, start, { ...fireContextOf(src.effect.trigger, ev), attackRank });
      recordRanking(f, src.sourceSlotIndex, src.effect, attackRank, finalAttacks, targets);
    }
    dispatchApplied(2, from);
    appliedFrom = applications.length;
    // デバフ解除（解除と同じく、閉じるのは効くフレームの次のフレームなので、同じフレームの判定には効かない）。遅れのある解除は
    // 効くフレームに予約し、そのフレームで対象を選ぶ（予約した解除を先に）。対象は、このフレームのすべての段の付与の後に選ぶ
    const due = battleStartOnly || pendingRemoveDebuffs.size === 0 ? undefined : pendingRemoveDebuffs.get(f);
    if (due !== undefined) {
      pendingRemoveDebuffs.delete(f);
      for (const r of due) fireRemoveDebuff(r, f);
    }
    for (const r of removeDebuffSources) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      const at = battleStartOnly ? 0 : startOfFire(r.effect.trigger, f, r.effect.delayFrames);
      if (at === f) fireRemoveDebuff(r, at);
      else if (at < frames) {
        const list = pendingRemoveDebuffs.get(at);
        if (list === undefined) pendingRemoveDebuffs.set(at, [r]);
        else list.push(r);
      }
    }
    // 2.5 段目: 強化は発火の窓の始まりだけを貯める（受け付けと値は、履歴を閉じる時に amplify で決める）
    for (const amp of amplifiers) {
      if (!take(amp.effect.trigger)) continue;
      if (!battleStartOnly && !ampFires.get(amp)!(ev)) continue;
      const start = battleStartOnly ? 0 : startOfFire(amp.effect.trigger, f);
      if (start < frames) amp.starts.push(start);
    }
    // カウンタの増減は、このフレームのすべての判定の後
    registerCounters(ev, battleStartOnly);
  };
  const emptyEvents = (frame: number): FrameEvents => ({
    frame,
    shots: slots.map(() => null),
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: slots.map(() => false),
  });

  const hasFiring = slots.map((_, i) => (firingViews[i] ?? []).length > 0);
  /**
   * 射手の実効値（持ち主ごと）。毎フレーム × 枠で読まれるので、効いている件の組が変わらない間（件の境目まで）は前の値を使い回す
   * （plan/design-first-pass-perf.md 3.2 節）
   */
  const firingBuffs = firingViews.map((views) =>
    createSpanMemo(
      views.length,
      (i) => readItems(views[i]!.track),
      (frame, base: BuffTotals): BuffTotals | null => {
        let buffs = base;
        let changed = false;
        for (const v of views) {
          // 和集合の窓は重ならないので効いているのは多くて 1 つ。スタックする効果は効いている段の数だけ足す。件の scale（perCount の
          // スタック数）は 2 パス目（piecesOfTrack）と同じく値に掛ける
          for (const it of activeAt(v.track, frame)) {
            const effect = scaledEffect(v.effect, it);
            buffs = applyResolvedEffect(
              buffs,
              effect,
              fixedAttackBaseOf(effect, v.track.casterBaseAttack, slots),
              v.track.casterMaxHp,
            ).totals;
            changed = true;
          }
        }
        return changed ? buffs : null;
      },
    ),
  );

  // 毎フレーム読むので、消費する状態の持ち主の件の列は前もって引く（件の列はここまでに作り終わる。plan/design-first-pass-perf.md 3.1 節）
  const consumingTracks = consuming.map(({ holder, state }) => ({
    holder,
    state,
    own: tracks.filter((t) => t.holder === holder && t.origin.kind === 'state' && t.origin.state === state),
  }));

  const selfStackCountAt: HolderLists['selfStackCountAt'] = (holder, state, frame) => {
    let level = 0;
    for (const s of statesMatching(state)) {
      if (staticStates[holder]?.has(s) === true) level = Math.max(level, 1);
      for (const t of stateTracks[holder]?.get(s) ?? [])
        for (const it of activeAt(t, frame)) if (it.start < frame) level = Math.max(level, it.stack ?? 1);
    }
    return level;
  };

  return {
    hasSources:
      timedSources.length > 0 ||
      stateGroups.length > 0 ||
      cycleSources.length > 0 ||
      amplifiers.length > 0 ||
      enemyStateSources.length > 0 ||
      removeSources.length > 0 ||
      extendSources.length > 0 ||
      removeDebuffSources.length > 0 ||
      stackSources.length > 0 ||
      whileTracks.length > 0 ||
      counterSources.length > 0,
    registerBattleStart() {
      if (frames <= 0) return;
      register(emptyEvents(0), true);
    },
    registerFrame(ev) {
      register(ev, false);
      // テスト用: ループの中で読まれない件の列も、毎フレーム読んで確かめる（いまは読まない列を、後の定義が読んでも落とし漏れが分かる）
      if (options.verifyItems === true) for (const track of tracks) readItems(track);
    },
    firingBuffsAt(holder, frame, base) {
      return hasFiring[holder] ? firingBuffs[holder]!(frame, base) : null;
    },
    hasFiringTracks: (holder) => hasFiring[holder] === true,
    // 件の scale（perCount のスタック数・確率）は 2 パス目と同じく値に掛ける
    hitRateAt: (holder, frame) => {
      let n = 0;
      let up = 0;
      for (const v of hitViews[holder] ?? []) {
        for (const it of activeAt(v.track, frame)) {
          const value = valueOf(v.effect, it);
          n += value;
          if (v.effect.value > 0) up += value;
        }
      }
      return n === 0 && up === 0 ? ZERO_HIT_RATE : { n, up };
    },
    hasHitTracks: hitViews.some((views) => views.length > 0),
    critUpAt: (holder, frame) => sumAt(critViews[holder], frame),
    pelletsAt: (holder, frame) => ({
      pelletCount: sumAt(pelletCountViews[holder], frame),
      singlePellet: sumAt(singlePelletViews[holder], frame),
    }),
    hasPelletTracks: (holder) => hasPellets[holder] === true,
    minEffectiveRangeAt,
    rankContext,
    applyHeal(effect, sourceSlotIndex, holder, frame) {
      const track = healTracks.get(healKey(sourceSlotIndex, effect))?.[holder] ?? null;
      if (track === null)
        throw new Error(`no heal track for ${effect.source.skill}[${effect.effectIndex}] on ${holder}`);
      const opens = effect.durationFrames === undefined || activeAt(track, frame).length === 0;
      if (frame < frames) insertSorted(track.starts, frame);
      if (opens) heals.push({ frame, sourceSlotIndex, slotIndex: holder });
      return opens;
    },
    openWeaponChange(holder, weaponId, end) {
      for (const track of tracks) {
        const o = track.origin;
        if (track.holder !== holder || o.kind !== 'timed') continue;
        if (o.effect.durationUntil !== 'ammoSpent' || o.effect.weapon?.id !== weaponId) continue;
        const last = readItems(track).at(-1);
        if (last === undefined || last.start >= end || last.end < end) continue;
        return true;
      }
      return false;
    },
    cycleEveryAt(slotIndex, targetSkill, frame) {
      return cycleSources
        .filter((c) => c.slotIndex === slotIndex && c.effect.target === 'cycle' && c.effect.targetSkill === targetSkill)
        .flatMap((c) => activeAt(c.track, frame).map(() => c.effect.every));
    },
    shotCountEveryOf,
    gaugeSpeedAt: (holder, frame) => sumAt(gaugeViews[holder], frame),
    hasGaugeSpeedTracks: (holder) => (gaugeViews[holder] ?? []).length > 0,
    damageBuffsAt(holder, frame, base) {
      let buffs = base;
      for (const v of (damageViews[holder] ??= damageViewsOf(holder))) {
        for (const it of activeAt(v.track, frame)) {
          const effect = scaledEffect(v.effect, it);
          buffs = applyResolvedEffect(
            buffs,
            effect,
            fixedAttackBaseOf(effect, v.track.casterBaseAttack, slots),
            v.track.casterMaxHp,
            // 発動者基準の防御力▼（casterDefence）は付けた枠の基礎防御力を読む（2 パス目の skills/timeline.ts と同じ）
            slots[v.track.sourceSlotIndex]?.baseDefence,
          ).totals;
        }
      }
      return buffs;
    },
    burstCooldownAt: (holder, frame) => cooldownSum(holder, (it) => it.start <= frame && frame < it.end),
    burstCooldownStartedAt: (holder, frame) => cooldownSum(holder, (it) => it.start === frame),
    hasBurstCooldownTracks: (holder) => (cooldownViews[holder] ?? []).length > 0,
    // holdsAt の selfState と違い、段によらず frame より前に付いた件だけを見る（frame/plan.ts の selfStateHolds と同じ規則にする）。
    // 段は 1 始まりなので、付いていればスタック数は 1 以上
    selfStateAt: (holder, state, frame) => selfStackCountAt(holder, state, frame) > 0,
    stateStartedAt: (holder, state, frame) => {
      for (const t of stateTracks[holder]?.get(state) ?? [])
        for (const it of readItems(t)) if (it.start === frame) return true;
      return false;
    },
    stateHeldAt: ownStateActive,
    appliedAt: (slotIndex, state, frame) =>
      lastAtOrBefore(readOwnApplied(ownUnchainedApplied, slotIndex, state), frame) === frame,
    sinceFires,
    endedAt,
    selfStackCountAt,
    enemyStateAt,
    instantConditionHolds(effect, sourceSlotIndex, frame) {
      if (holdsAt(effect.condition, sourceSlotIndex, frame)) return true;
      skipEffect(sourceSlotIndex, effect, frame);
      return false;
    },
    skipInstant: (effect, sourceSlotIndex, frame) => skipEffect(sourceSlotIndex, effect, frame),
    lowerCurrentHp(slotIndex, frame, ratio) {
      const downs = hpDowns[slotIndex];
      if (downs === undefined) throw new RangeError(`lowerCurrentHp: no slot ${slotIndex}`);
      const n = downs.frames.length;
      if (n > 0 && downs.frames[n - 1]! > frame) throw new RangeError('lowerCurrentHp must be called in frame order');
      downs.frames.push(frame);
      downs.products.push((n > 0 ? downs.products[n - 1]! : 1) * (1 - ratio));
    },
    consumeFullStacks(frame) {
      const out: FullStackEvent[] = [];
      for (const { holder, state, own } of consumingTracks) {
        const full = own.some((t) => {
          const max = t.origin.kind === 'state' ? t.origin.grant.maxStacks : undefined;
          return max !== undefined && readItems(t).some((it) => it.stack === max && it.start === frame);
        });
        if (!full) continue;
        for (const t of own) consumeTrack(t, frame);
        out.push({ slotIndex: holder, state });
      }
      return out;
    },
    leadShots() {
      return Object.fromEntries(
        [...leads].filter(([, l]) => l.fired.length > 0).map(([g, l]) => [leadShotKey(g), l.fired]),
      );
    },
    history() {
      for (const track of tracks) readItems(track);
      const amplified = amplify(tracks, amplifiers, slots, frames);
      return {
        frames,
        slots,
        passive,
        tracks,
        amplified: amplified.pieces,
        applications,
        conditionSkips: [...conditionSkips, ...amplified.skips]
          .map((x, i) => ({ x, i }))
          .sort((a, b) => a.x.frame - b.x.frame || a.i - b.i)
          .map(({ x }) => x),
        rankings,
        removeDebuffGuesses,
        heals,
        fullBurstWindows: [...options.fullBurstWindows()],
        logs,
        counters: counterRecords,
        hpRatios: slots.map((_, i) => hpRatioStepsOf(i)),
      };
    },
  };
}
