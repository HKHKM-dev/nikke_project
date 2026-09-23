// Stage 5: 最小フレームシミュレータ（ヘッドレス・純関数）。
// 60fps で戦闘時間ぶんのフレームを回し、各枠の通常射撃（shooter.ts）と固定サイクルのバースト（burst/fixedCycle.ts）を逐次処理する。
// 1 トリガーのダメージは calc と同じ computeTriggerDamage の期待値（乱数なし）。バーストスキルは同じ computeBurstHit。
// Stage 6: 持続バフを skills/timeline.ts の区間に載せた。区間ごとの 1 トリガー値を先に計算しておき、
// フレームループは「区間をまたいだら参照を差し替える」だけにする（毎フレーム式を評価しない）。
// Stage 7: 時刻表を動的サイクル（burst/dynamic.ts。射手を回してゲージを溜め、状態機械で発動を決める）にした。
// 射撃は時刻表に依存しないので 2 パス（1 パス目 = planTeamSchedule で時刻表、2 パス目 = 下のフレームループ）で済む。
// calc（team.ts）はこの sim の期待値モデルで、両者の差は発射サイクルの離散化（マガジンの位相と端数）だけになる（__tests__/simCalc.test.ts）。
// Stage 8: 1 パス目を team.ts の planTeamRun（射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動）にまとめた。
// 射撃は 1 パス目の射撃の列（sim/shots.ts）をそのまま使い、倍率ダメージ（damage）は発動フレームで足す。
// Stage 10: 1 パス目の射撃の列と時刻表は sim/firstPass.ts のフレームループ（射撃に効くバフ・CT 短縮・弾丸チャージ込み）で作る。
// 2 パス目は変えない（射撃の列を読み、区間ごとの 1 トリガー値を足す）。
import type { BurstSchedule, BurstStepKey } from '../burst/schedule.ts';
import { computeCadence, type CadenceResult } from '../cadence.ts';
import { baseAttackOf, computeTriggerDamage, modelNotes, type ModelNote, type TriggerDamage } from '../damage.ts';
import { MAX_SKILL_LEVELS, type AppliedEffect, type AppliedTimedEffect } from '../skills/resolve.ts';
import { slotBurstHit, type BurstHitResult } from '../skills/burstDamage.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import type { BuffTotals } from '../skills/buffs.ts';
import { EMPTY_BUFF_STATE, groupTimeline, type BuffTimeline, type BuffWindow } from '../skills/timeline.ts';
import {
  BURST_HIT_USES_PRE_ACTIVATION_BUFFS,
  burstSnapshotState,
  planTeamRun,
  type SkillHitEvent,
  type TeamInput,
} from '../team.ts';
import type { CharacterData } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { firingParams } from './firing.ts';
import type { InstantApplication } from './firstPass.ts';
import type { ShotLog } from './shots.ts';

export type SimInput = TeamInput & {
  /** true なら全イベントを events に残す（テスト・デバッグ用。既定 false） */
  trace?: boolean;
};

export type SimEvent =
  | { frame: number; kind: 'trigger'; slot: number; fullBurst: boolean; damage: number }
  | { frame: number; kind: 'burst'; slot: number; step: BurstStepKey; damage: number }
  | { frame: number; kind: 'fullBurstStart' | 'fullBurstEnd' | 'gaugeFull' | 'chainTimeout' }
  | { frame: number; kind: 'buffStart' | 'buffEnd'; slot: number; effect: BuffWindow['effect'] }
  | { frame: number; kind: 'skillHit'; slot: number; effect: SkillHitEvent['effect']; damage: number }
  | { frame: number; kind: 'cooldownReduction' | 'ammoRefill'; slot: number; source: number; amount: number };

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
  /** Stage 8: 倍率ダメージ（damage）の発動フレームと合計（calc と同じ発動列） */
  skillHits: { frames: number[]; damage: number };
  totalDamage: number;
};

export type SimResult = {
  /** 回したフレーム数 = durationSeconds × 60（切り上げ） */
  frames: number;
  schedule: BurstSchedule | null;
  timeline: BuffTimeline;
  /** Stage 8: 各枠の射撃の列（1 パス目）。2 パス目の射撃はこの列どおり */
  shots: (ShotLog | null)[];
  /** Stage 10: 即時効果（CT 短縮・弾丸チャージ）を当てた記録（1 パス目） */
  instants: InstantApplication[];
  slots: (SimSlotResult | null)[];
  totalDamage: number;
  /** trace: false なら空 */
  events: SimEvent[];
};

type Runner = {
  index: number;
  /** 射撃の列 */
  shots: readonly number[];
  /** 次に撃つ射撃の添字 */
  nextShot: number;
  result: SimSlotResult;
};

export function runSimulation(simInput: SimInput): SimResult {
  // Stage 9: 宝物版への差し替えは最上位で 1 回だけ（planTeamRun の外でもバーストの定義と character を読むため）
  const input = applyTreasureToTeam(simInput);
  const { slots, enemy } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  const trace = input.trace ?? false;

  // 1 パス目（calc と共通）: 射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動。2 パス目がこの下のフレームループ
  const { frames, shots, schedule, timeline, skillHits, instants } = planTeamRun({ ...input, model });

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
      shots: shots[index]?.frames ?? [],
      nextShot: 0,
      result: {
        index,
        character: slot.character,
        baseAttack: baseAttackOf(slot),
        cadence: computeCadence(slot.character.shot, model, firingParams(slot.character.shot, passive.buffs)),
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
        skillHits: { frames: [], damage: 0 },
        totalDamage: 0,
      },
    };
  });

  const events: SimEvent[] = [];
  const activations = schedule?.activations ?? [];
  const fullBurstWindows = schedule?.fullBurstWindows ?? [];
  const gaugeFull = new Set(schedule?.gaugeFullFrames ?? []);
  const chainTimeouts = new Set(schedule?.chainTimeouts ?? []);
  let nextActivation = 0;
  let nextSkillHit = 0;
  let nextInstant = 0;
  let windowIndex = 0;
  let inFullBurst = false;
  let segIndex = 0;

  for (let f = 0; f < frames; f++) {
    while (segIndex + 1 < timeline.segments.length && timeline.segments[segIndex]!.end <= f) segIndex += 1;
    while (windowIndex < fullBurstWindows.length && fullBurstWindows[windowIndex]!.end <= f) windowIndex += 1;
    const window = fullBurstWindows[windowIndex];
    const fb = window !== undefined && window.start <= f;
    if (trace) {
      if (inFullBurst && !fb) events.push({ frame: f, kind: 'fullBurstEnd' });
      if (gaugeFull.has(f)) events.push({ frame: f, kind: 'gaugeFull' });
      if (chainTimeouts.has(f)) events.push({ frame: f, kind: 'chainTimeout' });
      for (const w of timeline.windows) {
        if (w.start === f) events.push({ frame: f, kind: 'buffStart', slot: w.slotIndex, effect: w.effect });
        if (w.end === f) events.push({ frame: f, kind: 'buffEnd', slot: w.slotIndex, effect: w.effect });
      }
      if (fb && !inFullBurst) events.push({ frame: f, kind: 'fullBurstStart' });
    }
    // バースト発動（そのフレームの通常攻撃より先。同じフレームなら時刻表の順 = I → II → III）
    while (activations[nextActivation]?.frame === f) {
      const activation = activations[nextActivation]!;
      nextActivation += 1;
      const { slotIndex: index, step } = activation;
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
    // Stage 8: 倍率ダメージ（damage）。値は 1 パス目で計算済み（calc と同じ）
    while (skillHits[nextSkillHit]?.frame === f) {
      const h = skillHits[nextSkillHit]!;
      nextSkillHit += 1;
      const runner = runners[h.slotIndex];
      if (!runner) continue;
      runner.result.skillHits.frames.push(f);
      runner.result.skillHits.damage += h.hit.perActivation;
      if (trace)
        events.push({ frame: f, kind: 'skillHit', slot: h.slotIndex, effect: h.effect, damage: h.hit.perActivation });
    }
    if (trace) {
      while (instants[nextInstant]?.frame === f) {
        const x = instants[nextInstant]!;
        nextInstant += 1;
        events.push({ frame: f, kind: x.effect.kind, slot: x.slotIndex, source: x.sourceSlotIndex, amount: x.amount });
      }
    }
    inFullBurst = fb;
    // 通常射撃（枠順）。射撃は 1 パス目の射撃の列どおり
    for (const runner of runners) {
      if (runner === null) continue;
      if (runner.shots[runner.nextShot] !== f) continue;
      runner.nextShot += 1;
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
    r.totalDamage = r.normalDamage + r.burst.damage + r.skillHits.damage;
    totalDamage += r.totalDamage;
    return r;
  });

  return { frames, schedule, timeline, shots, instants, slots: results, totalDamage, events };
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
