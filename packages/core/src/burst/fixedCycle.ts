// Stage 5: 固定バーストサイクルの時刻表（純関数）。sim と calc が同じ時刻表を使う。
// サイクル k は [cycleFrames × k, cycleFrames × (k + 1))。前半 normalFrames が通常区間、後半 fullBurstFrames がフルバースト区間。
// 各サイクルの通常区間の終わり（= フルバースト区間の始まり）にバースト I → II → III が同一フレームで発動する。
// バースト CT・ゲージ蓄積は Stage 7（dynamic.ts）。ここでは毎サイクル必ず発動する。
// Stage 7 で時刻表の形を BurstSchedule（schedule.ts）に一般化した。固定サイクルは比較・退化テスト用に残す（TeamInput.burstModel: 'fixed'）。
import type { BurstStep } from '../types.ts';
import { FPS } from '../weapons.ts';
import {
  BURST_STEP_KEYS,
  type BurstActivation,
  type BurstSchedule,
  type BurstStepKey,
  type FullBurstWindow,
} from './schedule.ts';

export type BurstCycleFrames = {
  cycleFrames: number;
  normalFrames: number;
  fullBurstFrames: number;
};

/** 20 秒サイクル: 通常 10 秒 + フルバースト 10 秒 */
export const FIXED_BURST_CYCLE: Readonly<BurstCycleFrames> = Object.freeze({
  cycleFrames: 1200,
  normalFrames: 600,
  fullBurstFrames: 600,
});

/** 枠のバースト段階。null は空枠 */
export type BurstCandidate = { burstStep: BurstStep } | null;

/** 段階ごとに発動する枠番号。null = その段階のニケがいない（発動なし。フルバースト自体は起きると仮定） */
export type BurstAssignment = Record<(typeof BURST_STEP_KEYS)[number], number | null>;

/** 秒をフレームに（切り上げ）。戦闘時間の換算に使う */
export function durationToFrames(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`duration must be >= 0, got ${seconds}`);
  return Math.ceil(seconds * FPS);
}

function validateCycle(cycle: BurstCycleFrames): void {
  const { cycleFrames, normalFrames, fullBurstFrames } = cycle;
  if (!Number.isInteger(cycleFrames) || cycleFrames < 1) throw new RangeError('cycleFrames must be a positive integer');
  if (!Number.isInteger(normalFrames) || normalFrames < 0) throw new RangeError('normalFrames must be >= 0');
  if (!Number.isInteger(fullBurstFrames) || fullBurstFrames < 0) throw new RangeError('fullBurstFrames must be >= 0');
  if (normalFrames + fullBurstFrames !== cycleFrames) {
    throw new RangeError('normalFrames + fullBurstFrames must equal cycleFrames');
  }
}

/**
 * 段階 I / II / III ごとに発動する枠を決める（決定的。枠の順序にだけ依存する）。
 * その段階の専任（burstStep が一致）のうち最小の枠番号。埋まらない段階には AllStep の枠を若い順に、低い段階から充てる。
 */
export function assignBurstSteps(candidates: readonly BurstCandidate[]): BurstAssignment {
  const assignment: BurstAssignment = { Step1: null, Step2: null, Step3: null };
  for (const step of BURST_STEP_KEYS) {
    const index = candidates.findIndex((c) => c !== null && c.burstStep === step);
    if (index >= 0) assignment[step] = index;
  }
  const used = new Set(Object.values(assignment).filter((i): i is number => i !== null));
  for (const step of BURST_STEP_KEYS) {
    if (assignment[step] !== null) continue;
    const index = candidates.findIndex((c, i) => c !== null && c.burstStep === 'AllStep' && !used.has(i));
    if (index >= 0) {
      assignment[step] = index;
      used.add(index);
    }
  }
  return assignment;
}

/** 固定サイクルの段階の進み方（Stage 8 の段階突入トリガー用）。III でフルバーストに入る */
const FIXED_ENTERED_STEP: Record<BurstStepKey, BurstStepKey | null> = { Step1: 'Step2', Step2: 'Step3', Step3: null };

/**
 * 固定サイクルの時刻表。各サイクルの発動フレーム（180 秒なら 600, 1800, …, 10200 の 9 個）に、
 * 割り当てのある段階を I → II → III の順で同じフレームに並べる。段階が欠けてもフルバーストは起きると仮定する（Stage 5）。
 */
export function planFixedCycle(
  candidates: readonly BurstCandidate[],
  durationFrames: number,
  cycle: BurstCycleFrames = FIXED_BURST_CYCLE,
): BurstSchedule {
  validateCycle(cycle);
  if (!Number.isInteger(durationFrames) || durationFrames < 0) {
    throw new RangeError(`durationFrames must be a non-negative integer, got ${durationFrames}`);
  }
  const assignment = assignBurstSteps(candidates);
  const activations: BurstActivation[] = [];
  const fullBurstWindows: FullBurstWindow[] = [];
  let fullBurstFramesTotal = 0;
  for (let k = 0; ; k++) {
    const start = k * cycle.cycleFrames + cycle.normalFrames;
    if (start >= durationFrames) break;
    const end = Math.min(start + cycle.fullBurstFrames, durationFrames);
    for (const step of BURST_STEP_KEYS) {
      const slotIndex = assignment[step];
      if (slotIndex === null) continue;
      activations.push({
        frame: start,
        step,
        slotIndex,
        startsFullBurst: step === 'Step3',
        enteredStep: FIXED_ENTERED_STEP[step],
      });
    }
    fullBurstWindows.push({ start, end });
    fullBurstFramesTotal += end - start;
  }
  return {
    model: 'fixed',
    activations,
    fullBurstWindows,
    fullBurstFramesTotal,
    gaugeFullFrames: [],
    chainTimeouts: [],
  };
}

/** フレーム frame がフルバースト区間か（サイクル内の位置だけで決まる） */
export function isFullBurstFrame(frame: number, cycle: BurstCycleFrames = FIXED_BURST_CYCLE): boolean {
  return frame % cycle.cycleFrames >= cycle.normalFrames;
}
