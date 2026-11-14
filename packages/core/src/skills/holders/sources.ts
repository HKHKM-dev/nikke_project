// 件の一覧の層 3: 出どころの準備（plan/design-split-first-pass.md 3.3 節・9.2 節）。出どころの種類ごとの関数（常時の件・持続バフ・
// 状態の付与の組・while・循環の間隔・解除・延長・デバフ解除・スタック量・自分に付いた記録・カウンタ・消費・吸収回復・敵の状態と消去・
// 静的な状態の記録）を、件の列を作る順（tracks の並びと準備の検査が投げる順）に呼び、件の列が出そろった後に、持ち主ごとの状態の件の列
// （stateTracks）を埋める。
import { groupDotsByState } from '../../frame/dot.ts';
import { resolveDotEffects } from '../burstDamage.ts';
import { type ChanceOpportunity } from '../chance.ts';
import { resolveCycleEvery } from '../cycles.ts';
import {
  isResolvedApplied,
  isResolvedSelfHpAtMost,
  isResolvedChance,
  isResolvedFullStack,
  isResolvedTimer,
  resolveCounterChanges,
  resolveDotCancels,
  resolveInstant,
  resolvePassives,
  resolveRemoveDebuffs,
  resolveRemoveStates,
  resolveStateExtends,
  resolveStackChanges,
  resolveTimed,
  resolveWhileEffects,
  type ResolvedInstantEffect,
  type ResolvedShotCountTrigger,
  isHpWhileEffect,
  resolveCounterWhileEffects,
  resolveHpWhileEffects,
} from '../resolve.ts';
import { type CounterId } from '../counters.ts';
import { type NamedStateId } from '../states.ts';
import { canEverTarget, isEffectTarget } from '../targets.ts';
import { advanceShotCount, shotCountWeight, type ShotCountEveryAt, type TriggerTracker } from '../triggers.ts';
import { conditionReadsItems, isEndedTrigger, staticStatesOf, type TimerTrigger } from '../types.ts';
import type { SkillSlot } from '../../types.ts';
import { timerFramesOf, type AppliedRecord } from '../timeline.ts';
import {
  type CounterRecord,
  type CounterSource,
  type CycleSource,
  ENEMY,
  type EnemyStateSource,
  type ExtendSource,
  type HeldItem,
  type HeldStage,
  type HeldTrack,
  type RemoveDebuffSource,
  type RemoveSource,
  type StackSource,
  type StateGroup,
  type TimedSource,
  isEnemyEffect,
} from './types.ts';
import {
  appliedStagesOf,
  insertSorted,
  lastAtOrBefore,
  stageOfStackChange,
  stageOfTimed,
  stateGroupsOf,
} from './items.ts';
import type { HolderBase, Records, WithLate } from './records.ts';
import type { Fires } from './fires.ts';

/** 出どころの種類ごとの関数が受けるもの */
type SourceDeps = HolderBase & Records & Fires & WithLate;
/** 持ち主ごとの、状態 → その状態の件の列（段 1・1.5） */
type StateTracks = Map<NamedStateId, HeldTrack[]>[];

/** 出どころと件の列を作る（件の列はここで出そろう） */
export function createSources(deps: SourceDeps) {
  const { options, slots, tracks } = deps;
  addPassiveTracks(deps);
  // ---- { applied } の効果の段（見る状態を付ける付与の段。plan/design-skill-stage4.md 1.1 節） ----
  const appliedStageOf = appliedStagesOf(slots);
  const timedSources = createTimedSources({ ...deps, appliedStageOf });
  const stateGroups = createStateGroups({ ...deps, appliedStageOf });
  const { hpWhileStates, updateHpAtLeast, whileTracks } = createWhileSources(deps);
  const { cycleSources, shotCountEveryOf } = createCycleSources(deps);
  const removeSources = createRemoveSources(deps);
  const extendSources = createExtendSources(deps);
  const removeDebuffSources = createRemoveDebuffSources(deps);
  const stackSources = createStackSources({ ...deps, stateGroups });
  /** フレーム frame がフルバーストの窓 [start, end) の中か（条件 inFullBurst） */
  const inFullBurstAt = (frame: number): boolean =>
    options.fullBurstWindows().some((w) => w.start <= frame && frame < w.end);
  // 自分に付いた記録の読みが見る、持ち主ごとの状態の件の列（件の列が出そろった後に fillStateTracks で埋める）
  const stateTracks: StateTracks = slots.map(() => new Map<NamedStateId, HeldTrack[]>());
  const {
    chainedApplications,
    ownAppliedOf,
    ownStateActive,
    ownUnchainedApplied,
    readOwnApplied,
    sinceFires,
    stateWindowFires,
  } = createOwnApplied({ ...deps, stateTracks });
  const { counterRecords, counterSources, counterValue, counterValues } = createCounterSources({
    ...deps,
    shotCountEveryOf,
    sinceFires,
  });
  const consuming = consumingStatesOf(deps);
  const { healKey, healTracks } = createHealTracks(deps);
  const { dotCancelSources, enemyStateSources } = createEnemyStateSources(deps);
  addStaticApplications(deps);
  fillStateTracks(stateTracks, tracks);
  return {
    appliedStageOf,
    chainedApplications,
    consuming,
    counterRecords,
    counterSources,
    counterValue,
    counterValues,
    cycleSources,
    dotCancelSources,
    enemyStateSources,
    extendSources,
    healKey,
    healTracks,
    hpWhileStates,
    inFullBurstAt,
    ownAppliedOf,
    ownStateActive,
    ownUnchainedApplied,
    readOwnApplied,
    removeDebuffSources,
    removeSources,
    shotCountEveryOf,
    sinceFires,
    stackSources,
    stateGroups,
    stateTracks,
    stateWindowFires,
    timedSources,
    updateHpAtLeast,
    whileTracks,
  };
}
export type Sources = ReturnType<typeof createSources>;

/** 常時の件（スキルの常時パッシブと静的な状態の中身。論点 3）。戦闘の始めから終わりまで */
function addPassiveTracks({ frames, newTrack, slots }: SourceDeps): void {
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
}

/** timed の出どころ（持ち主ごとの件の列は、対象になりうる枠にだけ作る） */
function createTimedSources({
  amplifiers,
  appliedStageOf,
  firesOf,
  newTrack,
  selfHpStateOf,
  slots,
}: SourceDeps & { appliedStageOf: (state: NamedStateId) => HeldStage }): TimedSource[] {
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
  return timedSources;
}

/** 時間で変わる状態（出どころ × 状態 × 持ち主ごとに 1 つの件の列） */
function createStateGroups({
  appliedStageOf,
  firesOf,
  newTrack,
  slots,
}: SourceDeps & { appliedStageOf: (state: NamedStateId) => HeldStage }): StateGroup[] {
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
  return stateGroups;
}

/**
 * 状態の間だけ効く常時の効果（while。plan/design-skill-stage9.md 1.3 節）。対象ごとに件の列（段 1.5）。
 * 件は出どころの枠の状態の件から作るので、始まりは登録しない（readWhileItems）
 */
function createWhileSources({ frames, late, newTrack, slots }: SourceDeps) {
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
      const holds = late.selfHpRatioAt(state.slotIndex, frame) >= state.threshold - 1e-9;
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
  return { hpWhileStates, updateHpAtLeast, whileTracks };
}

/** 循環の間隔の変更（対象は自分）と、それで変わる射撃の回数のきっかけの間隔 */
function createCycleSources({ firesOf, late, newTrack, slots }: SourceDeps) {
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
        if (late.readItems(c.track).some((it) => it.start <= frame && frame < it.end))
          every = every === undefined ? c.effect.every : Math.min(every, c.effect.every);
      }
      return every;
    };
  };
  return { cycleSources, shotCountEveryOf };
}

/** 解除（対象は自分。件を見る条件つきは段 1.5。plan/design-skill-stage1.md 1.2 節） */
function createRemoveSources({ firesOf, slots }: SourceDeps): RemoveSource[] {
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
  return removeSources;
}

/** 状態の維持の延長（{ applied } のほかは段 1.5 の後に発火する。plan/design-mint-prika.md 2.5 節） */
function createExtendSources({ firesOf, slots }: SourceDeps): ExtendSource[] {
  const extendSources: ExtendSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveStateExtends(slot.definition, slot.character, slot.levels)) {
      extendSources.push({ sourceSlotIndex, effect, fires: firesOf(effect.trigger, sourceSlotIndex) });
    }
  });
  return extendSources;
}

/** デバフ解除（対象は味方。段 1 の解除と同じ時に閉じる。plan/design-debuff-removal.md 2.2 節） */
function createRemoveDebuffSources({ firesOf, slots }: SourceDeps): RemoveDebuffSource[] {
  const removeDebuffSources: RemoveDebuffSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveRemoveDebuffs(slot.definition, slot.character, slot.levels)) {
      removeDebuffSources.push({ sourceSlotIndex, effect, fires: firesOf(effect.trigger, sourceSlotIndex) });
    }
  });
  return removeDebuffSources;
}

/** スタック量の増減（足す・減らす先は、同じ定義の付与の状態の、自分の件の列。plan/design-skill-stage3.md 1.1・1.5 節） */
function createStackSources({
  firesOf,
  slots,
  stateGroups,
}: SourceDeps & { stateGroups: readonly StateGroup[] }): StackSource[] {
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
  return stackSources;
}

/**
 * 自分に付いた記録と、それを読むきっかけ（周期の since・状態の窓の中の射撃の回数）。stateTracks は件の列が出そろった後に埋まり、
 * 返す関数はそれより後に呼ばれる
 */
function createOwnApplied({ applications, frames, late, stateTracks }: SourceDeps & { stateTracks: StateTracks }) {
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
    (stateTracks[slotIndex]?.get(state) ?? []).some((t) => late.activeAt(t, frame).length > 0);
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
        for (const it of late.readItems(t))
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
  return {
    chainedApplications,
    ownAppliedOf,
    ownStateActive,
    ownUnchainedApplied,
    readOwnApplied,
    sinceFires,
    stateWindowFires,
  };
}

/** カウンタの増減（対象は自分。値は枠 × カウンタごとに 1 つ。plan/design-skill-stage10.md 2.3 節） */
function createCounterSources({
  counterKey,
  firesOf,
  shotCountEveryOf,
  sinceFires,
  slots,
}: SourceDeps & {
  shotCountEveryOf: (slotIndex: number, skill: SkillSlot) => ShotCountEveryAt | undefined;
  sinceFires: (trigger: TimerTrigger, slotIndex: number) => TriggerTracker;
}) {
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
  return { counterRecords, counterSources, counterValue, counterValues };
}

/**
 * フルスタックの消費（定義の回復のきっかけ { fullStack } の状態。自分だけ。plan/design-skill-stage3.md 1.3 節）。
 * 使用武器の変更（plan/design-skill-stage11.md 2.1 節）・弾丸チャージ・timed（plan/design-diesel.md 2.1 節）のきっかけ
 * { fullStack } の状態も
 */
function consumingStatesOf({ slots }: SourceDeps): { holder: number; state: NamedStateId }[] {
  const consuming: { holder: number; state: NamedStateId }[] = [];
  slots.forEach((slot, holder) => {
    if (slot === null || slot.definition === null) return;
    const effects = [
      ...resolveInstant(slot.definition, slot.character, slot.levels),
      ...resolveTimed(slot.definition, slot.character, slot.levels),
    ];
    for (const effect of effects) {
      if (!isResolvedFullStack(effect.trigger)) continue;
      const state = effect.trigger.fullStack;
      if (!consuming.some((c) => c.holder === holder && c.state === state)) consuming.push({ holder, state });
    }
  });
  return consuming;
}

/** 吸収回復の窓（効果ごと・持ち主ごと。C-0082・C-0087） */
function createHealTracks({ newTrack, slots }: SourceDeps) {
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
  return { healKey, healTracks };
}

/** 持続ダメージが付ける敵の状態（出どころ × 状態ごとに 1 つの件の列。持ち主は敵）と、その消去 */
function createEnemyStateSources({ firesOf, newTrack, slots }: SourceDeps) {
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
  return { dotCancelSources, enemyStateSources };
}

/** 静的な状態はフレーム 0 に付いた記録を作る（見る側の規則を状態の種類で分けない。plan/design-named-state.md 5.4 節） */
function addStaticApplications({ applications, frames, slots }: SourceDeps): void {
  if (frames > 0) {
    slots.forEach((slot, slotIndex) => {
      for (const state of staticStatesOf(slot?.definition)) {
        applications.push({ frame: 0, state, sourceSlotIndex: slotIndex, slotIndex });
      }
    });
  }
}

/**
 * 持ち主ごとの状態の件の列を埋める。段 1.5（条件つきの付与）の状態の件も入れ、前のフレームまでに付いた件だけを見る
 * （同じフレームの条件つきどうしは連鎖させない。超火力（カウンタの条件で付く）を、後のフルバーストの開始の条件が見る。plan/design-skill-stage10.md 3.2 節）
 */
function fillStateTracks(stateTracks: StateTracks, tracks: readonly HeldTrack[]): void {
  stateTracks.forEach((byState, holder) => {
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== holder || (track.stage !== 1 && track.stage !== 1.5) || o.kind !== 'state') continue;
      byState.set(o.state, [...(byState.get(o.state) ?? []), track]);
    }
  });
}
