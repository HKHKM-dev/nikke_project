// Stage 7: バーストの時刻表（sim と calc が共有する）。
// Stage 5 / 6 の固定サイクルは「全段階が同じフレーム」「段階の割当が固定」だったが、動的サイクルでは
// 段階ごとに発動フレームが違い、同じ段階の 2 体が CT で交互に撃つこともあるので、発動を 1 回ずつ列挙する形にする。
// 固定サイクル（fixedCycle.ts）も動的サイクル（dynamic.ts）もこの形を返す。
import { FPS } from '../weapons.ts';

export type BurstStepKey = 'Step1' | 'Step2' | 'Step3';
export const BURST_STEP_KEYS = ['Step1', 'Step2', 'Step3'] as const satisfies readonly BurstStepKey[];

export type FullBurstWindow = { start: number; end: number };

export type BurstActivation = {
  frame: number;
  step: BurstStepKey;
  slotIndex: number;
  /** この発動でフルバーストに入るか */
  startsFullBurst: boolean;
  /**
   * Stage 8: この発動の結果入った段階（「バースト N 段階突入時」のトリガー）。フルバーストに入るなら null。
   * 通常は I → Step2、II → Step3。リエントリー（Step1 → Step1）なら Step1
   */
  enteredStep: BurstStepKey | null;
};

export type BurstScheduleModel = 'fixed' | 'dynamic';

/** Stage 10: 「バーストスキルクールタイム X 秒▼」を 1 枠に当てた記録（即時効果。plan/design-stage10.md 4 節） */
export type CooldownReduction = {
  frame: number;
  /** CT を縮めた枠 */
  slotIndex: number;
  /** 効果を出した枠 */
  sourceSlotIndex: number;
  /** 縮めようとしたフレーム数（durationToFrames(X 秒)） */
  frames: number;
  /** 実際に縮んだフレーム数（CT が明けていれば 0。明けるフレームより前には戻さない） */
  applied: number;
};

export type BurstSchedule = {
  model: BurstScheduleModel;
  /** 発生順（同じフレームなら I → II → III の順） */
  activations: BurstActivation[];
  /** フルバースト区間 [start, end) の列。末尾は戦闘時間で切る */
  fullBurstWindows: FullBurstWindow[];
  /** fullBurstWindows の長さの合計（フレーム） */
  fullBurstFramesTotal: number;
  /** ゲージが満タンになったフレーム（動的サイクルだけ。固定サイクルは空） */
  gaugeFullFrames: number[];
  /** チェーンが途切れた（次の段階が出ないままタイムアウトした）フレーム（動的サイクルだけ） */
  chainTimeouts: number[];
  /** Stage 10: CT 短縮の記録（動的サイクルだけ。固定サイクルは CT を見ないので空） */
  cooldownReductions: CooldownReduction[];
};

/** 枠 slotIndex がバーストを撃ったフレーム列（発生順） */
export function activationFramesOfSlot(schedule: BurstSchedule, slotIndex: number): number[] {
  return schedule.activations.filter((a) => a.slotIndex === slotIndex).map((a) => a.frame);
}

/**
 * Stage 8: 「バースト N 段階突入時」の発火フレーム（昇順・重複なし）。
 * 段階 2 / 3 は発動の結果その段階に進んだフレーム。段階 1 はゲージ満タンのフレームとリエントリーの発動
 * （固定サイクルは満タンがないので、各サイクルのフルバースト開始 = 発動フレーム）。
 */
export function stageEnterFrames(schedule: BurstSchedule, step: BurstStepKey): number[] {
  const frames = schedule.activations.filter((a) => a.enteredStep === step).map((a) => a.frame);
  if (step === 'Step1') {
    frames.push(
      ...(schedule.model === 'fixed' ? schedule.fullBurstWindows.map((w) => w.start) : schedule.gaugeFullFrames),
    );
  }
  return [...new Set(frames)].sort((a, b) => a - b);
}

/** frame がフルバースト区間に入っているか */
export function isInFullBurst(schedule: BurstSchedule, frame: number): boolean {
  return schedule.fullBurstWindows.some((w) => w.start <= frame && frame < w.end);
}

export type BurstSummary = {
  model: BurstScheduleModel;
  /** フルバーストの回数（戦闘時間内に始まったもの） */
  fullBursts: number;
  /** fullBurstFramesTotal / frames（0 フレームなら 0） */
  fullBurstUptime: number;
  /** 隣り合うフルバースト開始の間隔の平均（秒）。1 回以下なら null */
  meanCycleSeconds: number | null;
  /** 1 回目のフルバースト開始（秒）。なければ null */
  firstFullBurstSeconds: number | null;
  /** バーストの発動回数（全段階の合計） */
  activations: number;
  chainTimeouts: number;
};

export function summarizeSchedule(schedule: BurstSchedule, frames: number): BurstSummary {
  const starts = schedule.fullBurstWindows.map((w) => w.start);
  const first = starts[0];
  const last = starts[starts.length - 1];
  return {
    model: schedule.model,
    fullBursts: starts.length,
    fullBurstUptime: frames > 0 ? schedule.fullBurstFramesTotal / frames : 0,
    meanCycleSeconds:
      starts.length >= 2 && first !== undefined && last !== undefined
        ? (last - first) / (starts.length - 1) / FPS
        : null,
    firstFullBurstSeconds: first === undefined ? null : first / FPS,
    activations: schedule.activations.length,
    chainTimeouts: schedule.chainTimeouts.length,
  };
}

/** 段階ごとに、実際に撃った枠（初出順・重複なし）。UI とテスト用 */
export function slotsByStep(schedule: BurstSchedule): Record<BurstStepKey, number[]> {
  const result: Record<BurstStepKey, number[]> = { Step1: [], Step2: [], Step3: [] };
  for (const a of schedule.activations) if (!result[a.step].includes(a.slotIndex)) result[a.step].push(a.slotIndex);
  return result;
}
