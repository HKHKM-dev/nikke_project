// Stage 5: 最小フレームシミュレータ（ヘッドレス・純関数）。
// 60fps で戦闘時間ぶんのフレームを回し、各枠の通常射撃（shooter.ts）と固定サイクルのバースト（burst/fixedCycle.ts）を逐次処理する。
// 1 トリガーのダメージは calc と同じ computeTriggerDamage の期待値（乱数なし）。バーストスキルは同じ computeBurstHit。
// calc（team.ts）はこの sim の期待値モデルで、両者の差は発射サイクルの離散化（マガジンの位相と端数）だけになる（__tests__/simCalc.test.ts）。
import { durationToFrames, isFullBurstFrame, planFixedCycle, type FixedCycleSchedule } from '../burst/fixedCycle.ts';
import { BURST_STEP_KEYS, type BurstStepKey } from '../burst/fixedCycle.ts';
import { computeTriggerDamage, modelNotes, type ModelNote, type TriggerDamage } from '../damage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { slotBurstHit, type BurstHitResult } from '../skills/burstDamage.ts';
import type { BuffTotals } from '../skills/buffs.ts';
import { resolveTeamBuffs, validateTeamSlots, type AppliedEffect, type TeamInput } from '../team.ts';
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
  | { frame: number; kind: 'fullBurstStart' | 'fullBurstEnd' };

export type SimIntervalTotals = { triggers: number; damage: number };

export type SimSlotResult = {
  index: number;
  character: CharacterData;
  buffs: BuffTotals;
  appliedEffects: AppliedEffect[];
  /** 通常攻撃の 1 トリガー（通常区間 / フルバースト区間） */
  trigger: { normal: TriggerDamage; fullBurst: TriggerDamage };
  /** 通常攻撃。区間ごとのトリガー数とダメージ */
  normal: { nonFullBurst: SimIntervalTotals; fullBurst: SimIntervalTotals };
  /** バーストスキル。activations は発動フレーム。hit は定義がない・unsupported なら null */
  burst: { activations: number[]; hit: BurstHitResult | null; damage: number };
  totalDamage: number;
  notes: ModelNote[];
};

export type SimResult = {
  /** 回したフレーム数 = durationSeconds × 60（切り上げ） */
  frames: number;
  schedule: FixedCycleSchedule | null;
  slots: (SimSlotResult | null)[];
  totalDamage: number;
  /** trace: false なら空 */
  events: SimEvent[];
};

type Runner = {
  index: number;
  shooter: ShooterState;
  perTriggerNormal: number;
  perTriggerFullBurst: number;
  result: SimSlotResult;
};

export function runSimulation(input: SimInput): SimResult {
  const { slots, enemy, durationSeconds } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  const trace = input.trace ?? false;
  validateTeamSlots(slots);
  const frames = durationToFrames(durationSeconds);

  const schedule = input.burst
    ? planFixedCycle(
        slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep })),
        frames,
      )
    : null;
  const teamBuffs = resolveTeamBuffs(slots);

  const runners: (Runner | null)[] = slots.map((slot, index) => {
    if (slot === null) return null;
    const { buffs, appliedEffects } = teamBuffs[index]!;
    const base = {
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
      buffs,
    };
    const normal = computeTriggerDamage({ ...base, condition: { ...slot.condition, fullBurst: false } });
    const fullBurst = computeTriggerDamage({ ...base, condition: { ...slot.condition, fullBurst: true } });
    const hit = slotBurstHit(
      slot.skills?.definition,
      slot.skills?.levels ?? MAX_SKILL_LEVELS,
      slot.character,
      enemy,
      normal,
      buffs,
    );
    return {
      index,
      shooter: initialShooter(slot.character.shot, model),
      perTriggerNormal: normal.perTrigger,
      perTriggerFullBurst: fullBurst.perTrigger,
      result: {
        index,
        character: slot.character,
        buffs,
        appliedEffects,
        trigger: { normal, fullBurst },
        normal: { nonFullBurst: { triggers: 0, damage: 0 }, fullBurst: { triggers: 0, damage: 0 } },
        burst: { activations: [], hit, damage: 0 },
        totalDamage: 0,
        notes: modelNotes(slot.character.shot),
      },
    };
  });

  const events: SimEvent[] = [];
  const activations = schedule?.activationFrames ?? [];
  let nextActivation = 0;
  let inFullBurst = false;

  for (let f = 0; f < frames; f++) {
    const fb = schedule !== null && isFullBurstFrame(f);
    if (trace && schedule !== null && inFullBurst && !fb) events.push({ frame: f, kind: 'fullBurstEnd' });
    // バースト発動（同一フレームに I → II → III の順。そのフレームの通常攻撃より先）
    if (schedule !== null && activations[nextActivation] === f) {
      nextActivation += 1;
      if (trace) events.push({ frame: f, kind: 'fullBurstStart' });
      for (const step of BURST_STEP_KEYS) {
        const index = schedule.assignment[step];
        if (index === null) continue;
        const runner = runners[index];
        if (!runner || runner.result.burst.hit === null) continue;
        const damage = runner.result.burst.hit.perActivation;
        runner.result.burst.activations.push(f);
        runner.result.burst.damage += damage;
        if (trace) events.push({ frame: f, kind: 'burst', slot: index, step, damage });
      }
    }
    inFullBurst = fb;
    // 通常射撃（枠順）
    for (const runner of runners) {
      if (runner === null) continue;
      if (!stepShooter(runner.shooter, runner.result.character.shot, model)) continue;
      const damage = fb ? runner.perTriggerFullBurst : runner.perTriggerNormal;
      const bucket = fb ? runner.result.normal.fullBurst : runner.result.normal.nonFullBurst;
      bucket.triggers += 1;
      bucket.damage += damage;
      if (trace) events.push({ frame: f, kind: 'trigger', slot: runner.index, fullBurst: fb, damage });
    }
  }

  // 枠 0 から順に加算する（calc と同じ流儀）
  let totalDamage = 0;
  const results = runners.map((runner) => {
    if (runner === null) return null;
    const r = runner.result;
    r.totalDamage = r.normal.nonFullBurst.damage + r.normal.fullBurst.damage + r.burst.damage;
    totalDamage += r.totalDamage;
    return r;
  });

  return { frames, schedule, slots: results, totalDamage, events };
}
