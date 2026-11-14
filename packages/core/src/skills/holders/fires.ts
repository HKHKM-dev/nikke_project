// 件の一覧の層 2: 発火の読み（plan/design-split-first-pass.md 3.3 節・9.2 節）。きっかけから TriggerTracker を作る firesOf と、
// 自分の HP の割合のきっかけの状態。
import { adjacentSlotsOf } from '../composition.ts';
import {
  isResolvedAdjacentHp,
  isResolvedApplied,
  isResolvedSelfHpAtMost,
  isResolvedShotCount,
  isResolvedTimer,
  type ResolvedTrigger,
} from '../resolve.ts';
import { createTriggerTracker, type ShotCountEveryAt, type TriggerTracker } from '../triggers.ts';
import { isEndedTrigger, isStateCountWindow, isCounterFullTrigger, type EffectCondition } from '../types.ts';
import { timerFramesOf } from '../timeline.ts';
import type { HolderBase, Records, WithLate } from './records.ts';

/**
 * 「HP が最大」の判定の閾値。割合がこれ以下なら最大でない（selfHpAtMostAt は閾値に 1e-9 を足して比べるので、割合が 1 − 1e-9 より
 * 大きければ最大とみなす）
 */
const BELOW_FULL_HP = 1 - 2e-9;

/** きっかけから発火の追跡（TriggerTracker）を作る */
export function createFires({
  counterFullAt,
  counterKey,
  frames,
  options,
  late,
  slots,
}: HolderBase & Records & WithLate) {
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
      const low = late.selfHpAtMostAt(state.slotIndex, frame, state.threshold);
      if (state.low && !low && frame < frames) state.ends.push(frame);
      state.dropped = low && !state.low;
      state.low = low;
      state.frame = frame;
    }
    return state.dropped;
  };
  /** 割合が閾値を上回ったフレームか（selfHpDropped と同じ状態を読む。上がったフレームは ends の最後） */
  const selfHpRose = (state: SelfHpState, frame: number): boolean => {
    selfHpDropped(state, frame);
    return state.ends.at(-1) === frame;
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
    // 両隣の味方の HP の割合が閾値以下に下がったフレーム・100% に上がったフレーム（どちらかの枠で起きれば 1 回。
    // plan/design-adjacent-allies.md 2.3・2.4 節）
    if (isResolvedAdjacentHp(trigger)) {
      const full = 'adjacentHpFull' in trigger;
      const states = adjacentSlotsOf(slots, slotIndex, false).map((i) =>
        selfHpStateOf(i, full ? BELOW_FULL_HP : trigger.adjacentHpAtMost),
      );
      return (ev) =>
        states.map((s) => (full ? selfHpRose(s, ev.frame) : selfHpDropped(s, ev.frame))).some((fired) => fired);
    }
    // カウンタが上限に届いた次のフレーム（registerCounters が counterFullAt に書く）
    if (isCounterFullTrigger(trigger)) {
      const key = counterKey(slotIndex, trigger.counterFull);
      return (ev) => counterFullAt.get(key) === ev.frame;
    }
    // 自分のその状態の件が外れた最初のフレーム（counterChange の { ended } と同じ endedAt。plan/design-grave.md 2.1 節）
    if (isEndedTrigger(trigger)) {
      const state = trigger.ended;
      return (ev) => late.endedAt(slotIndex, state, ev.frame);
    }
    // 同 2.4 節: 自分の状態の間だけ数える回数（状態が付くたびに 0 から数え直す）
    // （stateWindowFires は件の一覧の後に作るので、最初の呼び出しで作る）
    if (isResolvedShotCount(trigger) && isStateCountWindow(trigger.during)) {
      const window = trigger.during.state;
      let fires: TriggerTracker | undefined;
      return (ev) => (fires ??= late.stateWindowFires(trigger, slotIndex, window, condition?.selfState?.state))(ev);
    }
    if (!isResolvedTimer(trigger)) return createTriggerTracker(trigger, slotIndex, options.scheduleModel, everyAt);
    const at = new Set(timerFramesOf(trigger, frames));
    return (ev) => at.has(ev.frame);
  };
  return { firesOf, selfHpStateOf };
}
export type Fires = ReturnType<typeof createFires>;
