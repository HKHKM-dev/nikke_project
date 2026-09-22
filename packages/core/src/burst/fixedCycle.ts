// Stage 5: 固定バーストサイクルの時刻表（純関数）。sim と calc が同じ時刻表を使う。
// サイクル k は [cycleFrames × k, cycleFrames × (k + 1))。前半 normalFrames が通常区間、後半 fullBurstFrames がフルバースト区間。
// 各サイクルの通常区間の終わり（= フルバースト区間の始まり）にバースト I → II → III が同一フレームで発動する。
// バースト CT・ゲージ蓄積は Stage 7。ここでは毎サイクル必ず発動する。
import type { BurstStep } from '../types.ts';
import { FPS } from '../weapons.ts';

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

export type BurstStepKey = 'Step1' | 'Step2' | 'Step3';
export const BURST_STEP_KEYS = ['Step1', 'Step2', 'Step3'] as const satisfies readonly BurstStepKey[];

/** 枠のバースト段階。null は空枠 */
export type BurstCandidate = { burstStep: BurstStep } | null;

/** 段階ごとに発動する枠番号。null = その段階のニケがいない（発動なし。フルバースト自体は起きると仮定） */
export type BurstAssignment = Record<BurstStepKey, number | null>;

export type FullBurstWindow = { start: number; end: number };

export type FixedCycleSchedule = {
  /** 各サイクルの発動フレーム（durationFrames 未満のものだけ）。180 秒なら 600, 1800, …, 10200 の 9 個 */
  activationFrames: number[];
  /** durationFrames 内のフルバースト区間 [start, end) の列（末尾は durationFrames で切る） */
  fullBurstWindows: FullBurstWindow[];
  /** durationFrames 内のフルバースト時間の合計（フレーム）。180 秒なら 5,400 */
  fullBurstFramesTotal: number;
  assignment: BurstAssignment;
};

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

export function planFixedCycle(
  candidates: readonly BurstCandidate[],
  durationFrames: number,
  cycle: BurstCycleFrames = FIXED_BURST_CYCLE,
): FixedCycleSchedule {
  validateCycle(cycle);
  if (!Number.isInteger(durationFrames) || durationFrames < 0) {
    throw new RangeError(`durationFrames must be a non-negative integer, got ${durationFrames}`);
  }
  const activationFrames: number[] = [];
  const fullBurstWindows: FullBurstWindow[] = [];
  let fullBurstFramesTotal = 0;
  for (let k = 0; ; k++) {
    const start = k * cycle.cycleFrames + cycle.normalFrames;
    if (start >= durationFrames) break;
    const end = Math.min(start + cycle.fullBurstFrames, durationFrames);
    activationFrames.push(start);
    fullBurstWindows.push({ start, end });
    fullBurstFramesTotal += end - start;
  }
  return { activationFrames, fullBurstWindows, fullBurstFramesTotal, assignment: assignBurstSteps(candidates) };
}

/** フレーム frame がフルバースト区間か（サイクル内の位置だけで決まる） */
export function isFullBurstFrame(frame: number, cycle: BurstCycleFrames = FIXED_BURST_CYCLE): boolean {
  return frame % cycle.cycleFrames >= cycle.normalFrames;
}
