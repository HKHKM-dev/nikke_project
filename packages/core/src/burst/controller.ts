// Stage 7: バーストの状態機械（純関数・フレーム単位）。
// 「このフレームに入ったゲージ量」を受け取って 1 フレーム進める。ゲージの出どころ（射撃）は知らない。
//
//   charging ──ゲージ満タン──▶ ready ──I の候補──▶ chain(step) ──StepFull の発動──▶ fullBurst ──600f──▶ charging
//                                                     └──最後の発動から 600f 候補なし（タイムアウト）──▶ charging
//
// - charging: ゲージを足す（上限で止める）。ready / chain / fullBurst の間は足さない（フルバースト後は 0 から）。
// - ready: I の候補（CT 明け）が出るまで時間制限なしで待つ（録画 0019）。
// - chain: 段階 step の候補が出たら発動し、発動したニケの nextStep に進む。最後の発動から
//   chainTimeoutFrames 候補が出なければチェーン失敗でゲージ 0（録画 0022）。
// - 候補の順: その段階の専任（burstStep が一致）と AllStep のうち、枠番号の若い順（レッドフード編の論点 12。plan/design-red-hood.md
//   7.1 節）。CT が明けていて、このチェーンで未使用のもの。
//   レッドフード編（plan/design-red-hood.md 7.1 節の論点 7。V-0639）: AllStep の枠は、CT が明けていれば同じチェーンでも撃ち直す
//   （I・II のクールタイム▼で CT が 0 になったレッドフードが、同じチェーンの次の段階を撃つ）。
// 定数の根拠は plan/design-stage7.md 0 節・1 節。演出時間は録画からの目視で、tools/captures/gauge.ts で較正する。
import { gameSecondsToFrames } from '../time.ts';
import type { BurstNextStep, BurstStep } from '../types.ts';
import { withBurstDelays, type BurstDelays } from './landing.ts';
import {
  FULL_BURST_AFTER_ACTIVATION_FRAMES,
  type BurstActivation,
  type BurstSchedule,
  type BurstStepKey,
  type CooldownReduction,
  type FullBurstWindow,
} from './schedule.ts';

/** バーストゲージの上限（CDN の target_burst_energy_pershot と同じ単位） */
export const BURST_GAUGE_MAX = 1_000_000;
/**
 * バーストの段の長さ（ゲーム内のフレーム）。I → II、II → III の本当の発動どうしは、動画で約 29f（C-0515。新しい CT の秒どうし。
 * 段の表示どうしも 29f。C-0285）で、そのうち 1f は I・II の発動の止まり（C-0289。videoFrameOf が足す）なので、ゲーム内では 28f。
 * キャラによらない（2026-10-10 のオーナーの判断。plan/design-burst-hit-origin.md 8 節）
 */
const BURST_STAGE_FRAMES = 28;
/**
 * ゲージ満タン（BURST バーが消えた発）から I の発動（CT が走り出す）までのフレーム。約 23f（22.6〜23.9f。C-0285。V-0189）。
 * 満タン後に I の CT 明けを待った場合は、CT 明けのフレームですぐ撃つ
 */
export const BURST_READY_DELAY_FRAMES = 23;
/** I → II の発動の間隔（フレーム） */
export const BURST_STEP1_TO_STEP2_FRAMES = BURST_STAGE_FRAMES;
/** II → III の発動の間隔（フレーム） */
export const BURST_STEP2_TO_STEP3_FRAMES = BURST_STAGE_FRAMES;
/**
 * StepFull の発動（III の本当の発動。CT が走り出す）からフルバースト開始（III のタイマーの 00.00）まで（フレーム）。
 * 値の出どころは schedule.ts の FULL_BURST_AFTER_ACTIVATION_FRAMES（C-0512・V-0391。2026-10-10 のオーナーの判断）
 */
export const FULL_BURST_START_DELAY_FRAMES = FULL_BURST_AFTER_ACTIVATION_FRAMES;
/**
 * フルバースト時間（フレーム）の既定値。Stage 8 からは StepFull に入る発動をしたニケの burst_duration
 * （BurstUnit.fullBurstFrames。イサベル 5 秒、モダニア 15 秒）を優先し、それがない枠だけこの値を使う（plan/design-stage8.md 3.3 節）
 */
export const FULL_BURST_FRAMES = gameSecondsToFrames(10);
/** チェーン中に次の段階の候補が出ないまま待てるフレーム（ゲーム内のチェーン待ちのタイマー 10 秒。録画 0022 で約 600f） */
export const BURST_CHAIN_TIMEOUT_FRAMES = gameSecondsToFrames(10);

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
  /**
   * 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: fullBurstFrames の元の秒（burst_duration）。フルバーストタイムの延長の秒を
   * 足してからフレームにする（切り捨てを 1 回にする）。省略は fullBurstFrames に延長の秒のフレームを足す
   */
  fullBurstSeconds?: number;
  /** 着弾編: 発動からヒット・効果の発火までの遅れ（burst/landing.ts）。省略は 0 */
  delays?: Readonly<BurstDelays>;
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
  /** Stage 11: 今のチェーンで撃った枠（発動順）。フルバーストに入ったら窓の burstUsers になる */
  chainSlots: number[];
  fullBurstEnd: number;
  activations: BurstActivation[];
  /** 戦闘時間で切る前の窓 */
  windows: FullBurstWindow[];
  gaugeFullFrames: number[];
  chainTimeouts: number[];
  cooldownReductions: CooldownReduction[];
  /**
   * 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: 次に作るフルバーストの窓に足す延長の秒（予約。fullBurstExtend の発火が足す）。
   * 窓を作る時に足して 0 に戻す。窓を作らずにチェーンが切れたら捨てる
   */
  fullBurstExtensionSeconds: number;
  /**
   * 同: 発動のフレームに、その発動の枠のバーストの延長（バースト使用時の fullBurstExtend。条件はそのフレームで見る）の秒を返す。
   * 窓を作る発動ならその窓に足し、作らない発動なら次の窓に予約する（件の一覧が窓の終わりを読むので、窓の終わりは窓を作る時に決め、
   * 後から動かさない）。省略は 0
   */
  extensionAtActivation?: (slotIndex: number, frame: number) => number;
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 3.2 節）: 手で撃ったチェーンの始まり（I の本当の発動）のフレームの並び。
   * null はオートバースト
   */
  readonly manualBursts: readonly number[] | null;
  /** manualBursts の次に使う番号 */
  manualNext: number;
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
  manualBursts: readonly number[] | null = null,
): BurstControllerState {
  validateTiming(timing);
  if (manualBursts !== null) {
    manualBursts.forEach((f, i) => {
      if (!Number.isInteger(f) || f < 0 || (i > 0 && f <= manualBursts[i - 1]!))
        throw new RangeError(
          `manualBursts must be ascending non-negative integers, got ${JSON.stringify(manualBursts)}`,
        );
    });
  }
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
    chainSlots: [],
    fullBurstEnd: 0,
    activations: [],
    windows: [],
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
    fullBurstExtensionSeconds: 0,
    manualBursts,
    manualNext: 0,
  };
}

/**
 * 段階 step で撃てる枠（専任か AllStep）のうち、枠番号の最も若いもの。なければ -1。
 * レッドフード編（plan/design-red-hood.md 7.1 節の論点 7）: AllStep の枠は、このチェーンで撃っていても CT が明けていれば候補にする
 */
function pickCandidate(state: BurstControllerState, step: BurstStepKey, frame: number): number {
  // レッドフード編（同 論点 12）: 専任と AllStep を分けず、撃てる候補を枠の若い順に選ぶ（オーナーの言う「左側優先」。AllStep の枠が
  // 撃てる専任より左にいる録画は無い）
  return state.units.findIndex(
    (u, i) =>
      u !== null &&
      state.cooldownEnd[i]! <= frame &&
      ((u.burstStep === step && !state.usedInChain[i]) || u.burstStep === 'AllStep'),
  );
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
  state.fullBurstExtensionSeconds = 0;
  state.usedInChain.fill(false);
  state.chainSlots = [];
  state.gauge = 0;
  state.step = 'Step1';
}

/**
 * 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: 窓の長さ。burst_duration に予約の延長の秒を足してからフレームにする
 * （延長が無ければいままでどおり）
 */
function fullBurstLengthOf(state: BurstControllerState, unit: NonNullable<BurstUnit>): number {
  const base = unit.fullBurstFrames ?? state.timing.fullBurstFrames;
  const extension = state.fullBurstExtensionSeconds;
  if (extension <= 0) return base;
  if (unit.fullBurstFrames !== undefined && unit.fullBurstSeconds !== undefined)
    return gameSecondsToFrames(unit.fullBurstSeconds + extension);
  return base + gameSecondsToFrames(extension);
}

function activate(state: BurstControllerState, slotIndex: number, frame: number): void {
  const unit = state.units[slotIndex]!;
  if (state.phase === 'ready' && state.manualBursts !== null) state.manualNext += 1;
  // 2 段目の段 21: この発動の枠のバーストの延長は予約に足す（窓を作る発動なら、下でこの窓に足して空にする）
  if (state.extensionAtActivation !== undefined)
    reserveFullBurstExtension(state, state.extensionAtActivation(slotIndex, frame));
  const from = state.step;
  const next = resolveNextStep(unit.nextStep, from);
  state.cooldownEnd[slotIndex] = frame + unit.cooldownFrames;
  state.usedInChain[slotIndex] = true;
  state.chainSlots.push(slotIndex);
  state.lastUseFrame = frame;
  const startsFullBurst = next === 'StepFull';
  const start = frame + state.timing.fullBurstStartDelayFrames;
  const activation: BurstActivation = {
    frame,
    step: from,
    slotIndex,
    startsFullBurst,
    enteredStep: startsFullBurst ? null : next,
    ...(startsFullBurst ? { fullBurstStart: start } : {}),
  };
  state.activations.push(unit.delays === undefined ? activation : withBurstDelays(activation, unit.delays));
  if (startsFullBurst) {
    state.fullBurstEnd = start + fullBurstLengthOf(state, unit);
    // resetChain が chainSlots を差し替えるので、この配列はそのまま窓に渡せる
    state.windows.push({ start, end: state.fullBurstEnd, burstUsers: state.chainSlots });
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
 * Stage 16-B: blocked（敵を狙えない）の間はオートバーストが発動しない（2026-09-26 ユーザー確認）。
 * 満タン・フルバーストの終わりは進み、明けたフレームで発動の判定を再開する（チェーンのタイムアウトは最後の発動から数えたまま）
 */
export function stepBurstController(state: BurstControllerState, frame: number, gauge: number, blocked = false): void {
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
  // 手で撃つ（manualBursts）: 満タンの後の I は、満タンの readyDelayFrames 後と並びの次のフレームの遅い方。並びが尽きたら撃たない。
  // 録画で撃った時刻なので、的を狙えない間（blocked）でも撃つ。II・III はオートと同じ
  const manualReady = state.phase === 'ready' && state.manualBursts !== null;
  if (manualReady) {
    const next = state.manualBursts![state.manualNext];
    if (next === undefined) return;
    if (frame < next) return;
  }
  if (blocked && !manualReady) return;
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
  const applied = shortenCooldown(state, slotIndex, frames, frame);
  state.cooldownReductions.push({ frame, slotIndex, sourceSlotIndex, frames, applied });
}

/**
 * 枠 slotIndex の CT の明けを frames だけ早める（明けるフレームは frame より前に戻さない。明けている枠は変わらない）。縮めた長さを返す。
 * reduceCooldown（即時の CT▼。記録を残す）と、1 パス目の T4 の▼（記録を残さず、発動の cooldownShortenedFrames に足す）が使う
 */
export function shortenCooldown(state: BurstControllerState, slotIndex: number, frames: number, frame: number): number {
  const before = state.cooldownEnd[slotIndex]!;
  const after = Math.max(frame, before - frames);
  const applied = Math.max(0, before - after);
  if (applied > 0) state.cooldownEnd[slotIndex] = after;
  return applied;
}

/**
 * 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: 次に作るフルバーストの窓に延長の秒を予約する（fullBurstExtend のうち、窓の外で
 * 発火したもの。ソーダ：トゥインクルバニーのバースト 3 段階突入時）。同じ窓への予約は足し算
 */
export function reserveFullBurstExtension(state: BurstControllerState, seconds: number): void {
  if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError(`seconds must be >= 0, got ${seconds}`);
  state.fullBurstExtensionSeconds += seconds;
}

/** 戦闘時間 frames で切って BurstSchedule にする */
export function finishSchedule(state: BurstControllerState, frames: number): BurstSchedule {
  const fullBurstWindows = state.windows
    .filter((w) => w.start < frames)
    .map((w) => ({ start: w.start, end: Math.min(w.end, frames), burstUsers: [...w.burstUsers] }));
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
