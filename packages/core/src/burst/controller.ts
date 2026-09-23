// Stage 7: バーストの状態機械（純関数・フレーム単位）。
// 「このフレームに入ったゲージ量」を受け取って 1 フレーム進める。ゲージの出どころ（射撃）は知らない。
//
//   charging ──ゲージ満タン──▶ ready ──I の候補──▶ chain(step) ──StepFull の発動──▶ fullBurst ──600f──▶ charging
//                                                     └──最後の発動から 600f 候補なし（タイムアウト）──▶ charging
//
// - charging: ゲージを足す（上限で止める）。ready / chain / fullBurst の間は足さない（フルバースト後は 0 から）。
// - ready: I の候補（CT 明け）が出るまで時間制限なしで待つ（録画 19）。
// - chain: 段階 step の候補が出たら発動し、発動したニケの nextStep に進む。最後の発動から
//   chainTimeoutFrames 候補が出なければチェーン失敗でゲージ 0（録画 22）。
// - 候補の順: その段階の専任（burstStep が一致）→ AllStep、それぞれ枠番号の若い順。CT が明けていて、このチェーンで未使用のもの。
// 定数の根拠は plan/design-stage7.md 0 節・1 節。演出時間は録画からの目視で、tools/captures/gauge.ts で較正する。
import type { BurstNextStep, BurstStep } from '../types.ts';
import type { BurstActivation, BurstSchedule, BurstStepKey, CooldownReduction, FullBurstWindow } from './schedule.ts';

/** バーストゲージの上限（CDN の target_burst_energy_pershot と同じ単位） */
export const BURST_GAUGE_MAX = 1_000_000;
/** ゲージ満タンから I の発動までのフレーム（満タン後に I の CT 明けを待った場合は、CT 明けのフレームですぐ撃つ） */
export const BURST_READY_DELAY_FRAMES = 20;
/** I → II の発動の間隔（フレーム） */
export const BURST_STEP1_TO_STEP2_FRAMES = 20;
/** II → III の発動の間隔（フレーム） */
export const BURST_STEP2_TO_STEP3_FRAMES = 20;
/** StepFull の発動からフルバースト開始まで（フレーム）。Stage 6 の実測で 3f 未満 */
export const FULL_BURST_START_DELAY_FRAMES = 0;
/**
 * フルバースト時間（フレーム）の既定値。Stage 8 からは StepFull に入る発動をしたニケの burst_duration
 * （BurstUnit.fullBurstFrames。イサベル 5 秒、モダニア 15 秒）を優先し、それがない枠だけこの値を使う（plan/design-stage8.md 3.3 節）
 */
export const FULL_BURST_FRAMES = 600;
/** チェーン中に次の段階の候補が出ないまま待てるフレーム（録画 22 で約 600f） */
export const BURST_CHAIN_TIMEOUT_FRAMES = 600;

export type BurstTiming = {
  gaugeMax: number;
  readyDelayFrames: number;
  step1ToStep2Frames: number;
  step2ToStep3Frames: number;
  fullBurstStartDelayFrames: number;
  fullBurstFrames: number;
  chainTimeoutFrames: number;
};

export const DEFAULT_BURST_TIMING: Readonly<BurstTiming> = Object.freeze({
  gaugeMax: BURST_GAUGE_MAX,
  readyDelayFrames: BURST_READY_DELAY_FRAMES,
  step1ToStep2Frames: BURST_STEP1_TO_STEP2_FRAMES,
  step2ToStep3Frames: BURST_STEP2_TO_STEP3_FRAMES,
  fullBurstStartDelayFrames: FULL_BURST_START_DELAY_FRAMES,
  fullBurstFrames: FULL_BURST_FRAMES,
  chainTimeoutFrames: BURST_CHAIN_TIMEOUT_FRAMES,
});

/** 枠 1 つ分のバースト。null は空枠 */
export type BurstUnit = {
  burstStep: BurstStep;
  nextStep: BurstNextStep;
  cooldownFrames: number;
  /** Stage 8: この枠の発動でフルバーストに入ったときの長さ（burst_duration）。省略は timing.fullBurstFrames */
  fullBurstFrames?: number;
} | null;

export type BurstPhase = 'charging' | 'ready' | 'chain' | 'fullBurst';

export type BurstControllerState = {
  readonly timing: Readonly<BurstTiming>;
  readonly units: readonly BurstUnit[];
  phase: BurstPhase;
  gauge: number;
  /** ready / chain で次に撃つ段階 */
  step: BurstStepKey;
  /** 次の発動を許すフレーム（段階の演出時間） */
  nextAllowedFrame: number;
  /** チェーン中の最後の発動（タイムアウトの起点） */
  lastUseFrame: number;
  /** 枠ごとの CT 明けフレーム（戦闘開始時は 0 = すぐ使える） */
  cooldownEnd: number[];
  usedInChain: boolean[];
  fullBurstEnd: number;
  activations: BurstActivation[];
  /** 戦闘時間で切る前の窓 */
  windows: FullBurstWindow[];
  gaugeFullFrames: number[];
  chainTimeouts: number[];
  cooldownReductions: CooldownReduction[];
};

function validateTiming(t: BurstTiming): void {
  if (!(t.gaugeMax > 0)) throw new RangeError('gaugeMax must be > 0');
  for (const key of [
    'readyDelayFrames',
    'step1ToStep2Frames',
    'step2ToStep3Frames',
    'fullBurstStartDelayFrames',
    'fullBurstFrames',
    'chainTimeoutFrames',
  ] as const) {
    if (!Number.isInteger(t[key]) || t[key] < 0) throw new RangeError(`${key} must be a non-negative integer`);
  }
}

export function initialBurstController(
  units: readonly BurstUnit[],
  timing: Readonly<BurstTiming> = DEFAULT_BURST_TIMING,
): BurstControllerState {
  validateTiming(timing);
  for (const u of units) {
    if (u !== null && (!Number.isInteger(u.cooldownFrames) || u.cooldownFrames < 0)) {
      throw new RangeError(`cooldownFrames must be a non-negative integer, got ${u.cooldownFrames}`);
    }
    if (u?.fullBurstFrames !== undefined && (!Number.isInteger(u.fullBurstFrames) || u.fullBurstFrames < 0)) {
      throw new RangeError(`fullBurstFrames must be a non-negative integer, got ${u.fullBurstFrames}`);
    }
  }
  return {
    timing,
    units,
    phase: 'charging',
    gauge: 0,
    step: 'Step1',
    nextAllowedFrame: 0,
    lastUseFrame: 0,
    cooldownEnd: units.map(() => 0),
    usedInChain: units.map(() => false),
    fullBurstEnd: 0,
    activations: [],
    windows: [],
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
  };
}

/** 段階 step で撃てる枠。専任 → AllStep の順、それぞれ枠番号の若い順。なければ -1 */
function pickCandidate(state: BurstControllerState, step: BurstStepKey, frame: number): number {
  const ready = (i: number): boolean => state.cooldownEnd[i]! <= frame && !state.usedInChain[i];
  const dedicated = state.units.findIndex((u, i) => u !== null && u.burstStep === step && ready(i));
  if (dedicated >= 0) return dedicated;
  return state.units.findIndex((u, i) => u !== null && u.burstStep === 'AllStep' && ready(i));
}

const NEXT_OF: Record<BurstStepKey, BurstStepKey | 'StepFull'> = {
  Step1: 'Step2',
  Step2: 'Step3',
  Step3: 'StepFull',
};

/** 段階 current で撃ったニケの nextStep から、次に撃つ段階（または StepFull）を決める */
export function resolveNextStep(nextStep: BurstNextStep, current: BurstStepKey): BurstStepKey | 'StepFull' {
  return nextStep === 'NextStep' ? NEXT_OF[current] : nextStep;
}

function intervalAfter(timing: BurstTiming, from: BurstStepKey): number {
  return from === 'Step1' ? timing.step1ToStep2Frames : timing.step2ToStep3Frames;
}

function resetChain(state: BurstControllerState): void {
  state.usedInChain.fill(false);
  state.gauge = 0;
  state.step = 'Step1';
}

function activate(state: BurstControllerState, slotIndex: number, frame: number): void {
  const unit = state.units[slotIndex]!;
  const from = state.step;
  const next = resolveNextStep(unit.nextStep, from);
  state.cooldownEnd[slotIndex] = frame + unit.cooldownFrames;
  state.usedInChain[slotIndex] = true;
  state.lastUseFrame = frame;
  const startsFullBurst = next === 'StepFull';
  state.activations.push({ frame, step: from, slotIndex, startsFullBurst, enteredStep: startsFullBurst ? null : next });
  if (startsFullBurst) {
    const start = frame + state.timing.fullBurstStartDelayFrames;
    state.fullBurstEnd = start + (unit.fullBurstFrames ?? state.timing.fullBurstFrames);
    state.windows.push({ start, end: state.fullBurstEnd });
    state.phase = 'fullBurst';
    resetChain(state);
    return;
  }
  state.phase = 'chain';
  state.step = next;
  state.nextAllowedFrame = frame + intervalAfter(state.timing, from);
}

/**
 * frame を 1 つ進める。gauge はこのフレームに当たった分のゲージ量（charging のときだけ足される）。
 * frame は 0 から 1 ずつ増やして呼ぶ。発動・フルバースト窓・満タン・タイムアウトは state に積まれる。
 */
export function stepBurstController(state: BurstControllerState, frame: number, gauge: number): void {
  const { timing } = state;
  if (state.phase === 'fullBurst' && frame >= state.fullBurstEnd) state.phase = 'charging';
  if (state.phase === 'charging') {
    state.gauge = Math.min(timing.gaugeMax, state.gauge + gauge);
    if (state.gauge >= timing.gaugeMax) {
      state.phase = 'ready';
      state.step = 'Step1';
      state.nextAllowedFrame = frame + timing.readyDelayFrames;
      state.gaugeFullFrames.push(frame);
    }
  }
  // 間隔 0 の設定では同じフレームに複数段階が撃てるのでループにする
  while ((state.phase === 'ready' || state.phase === 'chain') && frame >= state.nextAllowedFrame) {
    const candidate = pickCandidate(state, state.step, frame);
    if (candidate < 0) {
      if (state.phase === 'chain' && frame - state.lastUseFrame >= timing.chainTimeoutFrames) {
        state.chainTimeouts.push(frame);
        state.phase = 'charging';
        resetChain(state);
      }
      return;
    }
    activate(state, candidate, frame);
    if (state.phase !== 'chain' || state.nextAllowedFrame > frame) return;
  }
}

/**
 * Stage 10: 枠 slotIndex の残りの CT を frames フレーム縮める（「バーストスキルクールタイム X 秒▼」。即時効果）。
 * そのフレームの stepBurstController の後に呼ぶ（同じフレームに発動した枠の CT も縮む。plan/design-stage10.md 4 節）。
 * CT が明けている枠は変わらず、明けるフレームは frame より前に戻さない（縮んで明けた枠が撃てるのは次のフレームから）。
 * 同じフレームに何度呼んでも max(frame, c − a − b …) になり、順番に依らない
 */
export function reduceCooldown(
  state: BurstControllerState,
  slotIndex: number,
  frames: number,
  frame: number,
  sourceSlotIndex: number,
): void {
  if (!Number.isInteger(frames) || frames < 0)
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  if (state.units[slotIndex] == null) return;
  const before = state.cooldownEnd[slotIndex]!;
  const after = Math.max(frame, before - frames);
  const applied = Math.max(0, before - after);
  if (applied > 0) state.cooldownEnd[slotIndex] = after;
  state.cooldownReductions.push({ frame, slotIndex, sourceSlotIndex, frames, applied });
}

/** 戦闘時間 frames で切って BurstSchedule にする */
export function finishSchedule(state: BurstControllerState, frames: number): BurstSchedule {
  const fullBurstWindows = state.windows
    .filter((w) => w.start < frames)
    .map((w) => ({ start: w.start, end: Math.min(w.end, frames) }));
  return {
    model: 'dynamic',
    activations: state.activations.filter((a) => a.frame < frames),
    fullBurstWindows,
    fullBurstFramesTotal: fullBurstWindows.reduce((sum, w) => sum + (w.end - w.start), 0),
    gaugeFullFrames: state.gaugeFullFrames.filter((f) => f < frames),
    chainTimeouts: state.chainTimeouts.filter((f) => f < frames),
    cooldownReductions: state.cooldownReductions.filter((r) => r.frame < frames),
  };
}
