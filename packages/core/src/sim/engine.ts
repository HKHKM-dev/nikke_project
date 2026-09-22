// Stage 5: 最小フレームシミュレータ（ヘッドレス・純関数）。
// 60fps で戦闘時間ぶんのフレームを回し、各枠の通常射撃（shooter.ts）と固定サイクルのバースト（burst/fixedCycle.ts）を逐次処理する。
// 1 トリガーのダメージは calc と同じ computeTriggerDamage の期待値（乱数なし）。バーストスキルは同じ computeBurstHit。
// Stage 6: 持続バフを skills/timeline.ts の区間に載せた。区間ごとの 1 トリガー値を先に計算しておき、
// フレームループは「区間をまたいだら参照を差し替える」だけにする（毎フレーム式を評価しない）。
// calc（team.ts）はこの sim の期待値モデルで、両者の差は発射サイクルの離散化（マガジンの位相と端数）だけになる（__tests__/simCalc.test.ts）。
import { durationToFrames, isFullBurstFrame, type FixedCycleSchedule } from '../burst/fixedCycle.ts';
import { BURST_STEP_KEYS, type BurstStepKey } from '../burst/fixedCycle.ts';
import { computeCadence, type CadenceResult } from '../cadence.ts';
import { baseAttackOf, computeTriggerDamage, modelNotes, type ModelNote, type TriggerDamage } from '../damage.ts';
import { MAX_SKILL_LEVELS, type AppliedEffect, type AppliedTimedEffect } from '../skills/resolve.ts';
import { slotBurstHit, type BurstHitResult } from '../skills/burstDamage.ts';
import type { BuffTotals } from '../skills/buffs.ts';
import {
  EMPTY_BUFF_STATE,
  groupTimeline,
  planBuffTimeline,
  type BuffTimeline,
  type BuffWindow,
} from '../skills/timeline.ts';
import {
  BURST_HIT_USES_PRE_ACTIVATION_BUFFS,
  burstSnapshotState,
  planTeamSchedule,
  toTimelineSlots,
  validateTeamSlots,
  type TeamInput,
} from '../team.ts';
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { initialShooter, stepShooter, type ShooterState } from './shooter.ts';

export type SimInput = TeamInput & {
  /** true なら全イベントを events に残す（テスト・デバッグ用。既定 false） */
  trace?: boolean;
};

export type SimEvent =
  | { frame: number; kind: 'trigger'; slot: number; fullBurst: boolean; damage: number }
  | { frame: number; kind: 'burst'; slot: number; step: BurstStepKey; damage: number }
  | { frame: number; kind: 'fullBurstStart' | 'fullBurstEnd' }
  | { frame: number; kind: 'buffStart' | 'buffEnd'; slot: number; effect: BuffWindow['effect'] };

/** 1 区間ぶんの結果。区間は timeline.segments と 1:1 */
export type SimSlotSegment = {
  start: number;
  end: number;
  seconds: number;
  fullBurst: boolean;
  buffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  timedEffects: AppliedTimedEffect[];
  trigger: TriggerDamage;
  /** この区間に実際に撃った数（整数） */
  triggers: number;
  damage: number;
};

export type SimSlotResult = {
  index: number;
  character: CharacterData;
  baseAttack: number;
  cadence: CadenceResult;
  notes: ModelNote[];
  /** 常時パッシブだけ（Stage 4 互換の表示用） */
  passiveBuffs: BuffTotals;
  passiveEffects: AppliedEffect[];
  /** この枠に掛かった持続バフの窓（発生順） */
  windows: BuffWindow[];
  segments: SimSlotSegment[];
  /** Σ segments.damage */
  normalDamage: number;
  /** バーストスキル。activations は発動フレーム。hit は定義がない・unsupported なら null */
  burst: { activations: number[]; hit: BurstHitResult | null; damage: number };
  totalDamage: number;
};

export type SimResult = {
  /** 回したフレーム数 = durationSeconds × 60（切り上げ） */
  frames: number;
  schedule: FixedCycleSchedule | null;
  timeline: BuffTimeline;
  slots: (SimSlotResult | null)[];
  totalDamage: number;
  /** trace: false なら空 */
  events: SimEvent[];
};

type Runner = {
  index: number;
  shooter: ShooterState;
  result: SimSlotResult;
};

export function runSimulation(input: SimInput): SimResult {
  const { slots, enemy, durationSeconds } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  const trace = input.trace ?? false;
  validateTeamSlots(slots);
  const frames = durationToFrames(durationSeconds);

  const schedule = planTeamSchedule(slots, frames, input.burst);
  const timelineSlots = toTimelineSlots(slots);
  const timeline = planBuffTimeline(timelineSlots, schedule, frames);

  const runners: (Runner | null)[] = slots.map((slot, index) => {
    if (slot === null) return null;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
    };
    const passive = timeline.passive[index] ?? EMPTY_BUFF_STATE;
    // 区間ごとの 1 トリガー値を先に計算しておく（フレームループでは参照するだけ）
    const segments: SimSlotSegment[] = timeline.segments.map((segment) => {
      const state = segment.slots[index] ?? EMPTY_BUFF_STATE;
      return {
        start: segment.start,
        end: segment.end,
        seconds: segment.seconds,
        fullBurst: segment.fullBurst,
        buffs: state.buffs,
        passiveEffects: state.passiveEffects,
        timedEffects: state.timedEffects,
        trigger: computeTriggerDamage({
          ...base,
          buffs: state.buffs,
          condition: { ...slot.condition, fullBurst: segment.fullBurst },
        }),
        triggers: 0,
        damage: 0,
      };
    });
    return {
      index,
      shooter: initialShooter(slot.character.shot, model),
      result: {
        index,
        character: slot.character,
        baseAttack: baseAttackOf(slot),
        cadence: computeCadence(slot.character.shot, model),
        notes: modelNotes(slot.character.shot),
        passiveBuffs: passive.buffs,
        passiveEffects: passive.passiveEffects,
        windows: timeline.windows.filter((w) => w.slotIndex === index),
        segments,
        normalDamage: 0,
        // 代表値（1 発動の内訳）は割当に関係なく出す。発動があれば 1 回目のスナップショットで上書きする
        burst: {
          activations: [],
          hit: slotBurstHit(
            slot.skills?.definition,
            slot.skills?.levels ?? MAX_SKILL_LEVELS,
            slot.character,
            enemy,
            computeTriggerDamage({ ...base, buffs: passive.buffs, condition: { ...slot.condition, fullBurst: false } }),
            passive.buffs,
          ),
          damage: 0,
        },
        totalDamage: 0,
      },
    };
  });

  const events: SimEvent[] = [];
  const activations = schedule?.activationFrames ?? [];
  let nextActivation = 0;
  let inFullBurst = false;
  let segIndex = 0;

  for (let f = 0; f < frames; f++) {
    while (segIndex + 1 < timeline.segments.length && timeline.segments[segIndex]!.end <= f) segIndex += 1;
    const fb = schedule !== null && isFullBurstFrame(f);
    if (trace) {
      if (schedule !== null && inFullBurst && !fb) events.push({ frame: f, kind: 'fullBurstEnd' });
      for (const w of timeline.windows) {
        if (w.start === f) events.push({ frame: f, kind: 'buffStart', slot: w.slotIndex, effect: w.effect });
        if (w.end === f) events.push({ frame: f, kind: 'buffEnd', slot: w.slotIndex, effect: w.effect });
      }
    }
    // バースト発動（同一フレームに I → II → III の順。そのフレームの通常攻撃より先）
    if (schedule !== null && activations[nextActivation] === f) {
      nextActivation += 1;
      if (trace) events.push({ frame: f, kind: 'fullBurstStart' });
      for (const step of BURST_STEP_KEYS) {
        const index = schedule.assignment[step];
        if (index === null) continue;
        const runner = runners[index];
        if (!runner) continue;
        const slot = slots[index]!;
        const state = burstSnapshotState(timeline, f, index, BURST_HIT_USES_PRE_ACTIVATION_BUFFS);
        const trigger = computeTriggerDamage({
          character: slot.character,
          growth: slot.growth,
          enemy,
          attackOverride: slot.attackOverride,
          buffs: state.buffs,
          condition: { ...slot.condition, fullBurst: false },
        });
        const hit = slotBurstHit(
          slot.skills?.definition,
          slot.skills?.levels ?? MAX_SKILL_LEVELS,
          slot.character,
          enemy,
          trigger,
          state.buffs,
        );
        if (hit === null) continue;
        if (runner.result.burst.activations.length === 0) runner.result.burst.hit = hit;
        runner.result.burst.activations.push(f);
        runner.result.burst.damage += hit.perActivation;
        if (trace) events.push({ frame: f, kind: 'burst', slot: index, step, damage: hit.perActivation });
      }
    }
    inFullBurst = fb;
    // 通常射撃（枠順）
    for (const runner of runners) {
      if (runner === null) continue;
      if (!stepShooter(runner.shooter, runner.result.character.shot, model)) continue;
      const segment = runner.result.segments[segIndex]!;
      segment.triggers += 1;
      segment.damage += segment.trigger.perTrigger;
      if (trace)
        events.push({
          frame: f,
          kind: 'trigger',
          slot: runner.index,
          fullBurst: fb,
          damage: segment.trigger.perTrigger,
        });
    }
  }

  // 枠 0 から順に加算する（calc と同じ流儀）
  let totalDamage = 0;
  const results = runners.map((runner) => {
    if (runner === null) return null;
    const r = runner.result;
    for (const segment of r.segments) r.normalDamage += segment.damage;
    r.totalDamage = r.normalDamage + r.burst.damage;
    totalDamage += r.totalDamage;
    return r;
  });

  return { frames, schedule, timeline, slots: results, totalDamage, events };
}

export type SimIntervalTotals = { triggers: number; damage: number };

export type SimGroupTotals = SimIntervalTotals & { key: string; fullBurst: boolean; seconds: number };

/**
 * sim の区間を calc と同じグループ（同じバフ状態）単位に集計する。
 * calc の TeamSlotResult.segments と同じ順番になるので、整合テストはこの単位で突き合わせる。
 */
export function simGroupTotals(result: SimResult, slotIndex: number): SimGroupTotals[] {
  const slot = result.slots[slotIndex];
  if (!slot) return [];
  const groups = groupTimeline(result.timeline, slotIndex);
  const byKey = new Map<string, SimGroupTotals>();
  const ordered = groups.map((g) => {
    const totals: SimGroupTotals = { key: g.key, fullBurst: g.fullBurst, seconds: g.seconds, triggers: 0, damage: 0 };
    byKey.set(g.key, totals);
    return totals;
  });
  result.timeline.segments.forEach((segment, i) => {
    const key = segment.slotKeys[slotIndex];
    const totals = key === null || key === undefined ? undefined : byKey.get(key);
    const simSegment = slot.segments[i];
    if (!totals || !simSegment) return;
    totals.triggers += simSegment.triggers;
    totals.damage += simSegment.damage;
  });
  return ordered;
}

/** 区間を「通常区間 / フルバースト区間」の 2 つに集計する（Stage 5 の normal 相当。テスト・CLI 用） */
export function simIntervalTotals(slot: SimSlotResult): {
  nonFullBurst: SimIntervalTotals;
  fullBurst: SimIntervalTotals;
} {
  const totals = { nonFullBurst: { triggers: 0, damage: 0 }, fullBurst: { triggers: 0, damage: 0 } };
  for (const segment of slot.segments) {
    const bucket = segment.fullBurst ? totals.fullBurst : totals.nonFullBurst;
    bucket.triggers += segment.triggers;
    bucket.damage += segment.damage;
  }
  return totals;
}
