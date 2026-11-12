// 指標: バーストの時刻表・ゲージ・CT（plan/design-stage19.md 2.3.1 節）
import { BURST_GAUGE_MAX } from '../../../burst/controller.ts';
import {
  activationFramesOfSlot,
  activationVideoFrameOf,
  type BurstSchedule,
  effectFrameOf,
  hexagonFrameOf,
  hitFrameOf,
  hitFramesOf,
  videoFrameOf,
} from '../../../burst/schedule.ts';
import { landingFrameSpans } from '../../../frame/landing.ts';
import type { SimResult } from '../../../sim/engine.ts';
import { itemsOf } from '../../../skills/holders.ts';
import type { NamedStateId } from '../../../skills/states.ts';
import { gameSecondsToFrame, gameSecondsToFrames } from '../../../time.ts';
import { eachOrOne, type Metric, type MetricContext, nthActivationOf, slotIndexOf, slotOf } from './context.ts';

export const burstMetrics: Readonly<Record<string, Metric>> = {
  fullBurstCount: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.length ?? 0,
  },
  /**
   * 録画の動画のフレームで数えた、フルバーストの入りどうしの間隔（最初の n 個）（V-0122）。入りの止まり
   * （C-0069）を足した動画のフレームの差なので、録画の戦闘開始のずれに依らない
   */
  fullBurstStartIntervals: {
    args: ['n'],
    sim: (r, c) => fullBurstStartIntervals(r, c),
  },
  /**
   * 最初の n 回のフルバーストの、III のタイマーの 00.00（窓の始まり）から窓の終わりまでの動画のフレーム（V-0633）。
   * 入りの止まり（C-0069）を足す（videoFrameOf）。録画ではレシピ burst-panel の、六角形の所が灰色に替わったフレームまで
   */
  fullBurstLengths: {
    args: ['n'],
    sim: (r, c) => fullBurstLengths(r, c),
  },
  /** バーストを撃った枠（1 始まり）の並び（最初の n 回（V-0121）。チェーンが切れた単独の発動も入る） */
  burstActivationSlots: {
    args: ['n'],
    sim: (r, c) => burstActivationSlots(r, c),
  },
  burstActivationVideoFrames: {
    args: ['n'],
    sim: (r, c) => burstActivationVideoFrames(r, c),
  },
  fullBurstToNextActivation: {
    args: ['n'],
    sim: (r, c) => fullBurstToNextActivation(r, c),
  },
  fullBurstToGaugeFull: {
    args: ['n'],
    sim: (r, c) => fullBurstToGaugeFull(r, c),
  },
  gaugeFullToActivation: {
    args: ['n'],
    sim: (r, c) => gaugeFullToActivation(r, c),
  },
  // 枠のバーストの発動の回数（時刻表（V-0530）。burstCount は倍率ダメージのバーストの回数）
  burstActivationCount: {
    args: ['slot'],
    sim: (r, c) => {
      if (r.schedule === null) throw new Error('バーストの時刻表が無い');
      return activationFramesOfSlot(r.schedule, slotIndexOf(c)).length;
    },
  },
  /**
   * V-0359: n 回目のフルバーストの入りに、枠の残りのバーストスキル CT が縮んだフレーム数（n はカンマ区切りの並びも書ける）。同じ
   * フレームの CT▲ は負で入る（CooldownReduction.applied）
   */
  cooldownCutFrames: {
    args: ['slot', 'n'],
    sim: (r, c) => cooldownCutFrames(r, c),
  },
  fullBurstStarts: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
  },
  // 枠の 1 発目から n 回目（0 始まり）のフルバーストの入りまでのフレーム数（plan/design-cinderella-s1-charge.md 4 節）。
  // 録画では、即着弾の枠（SR）の 1 発目の増分から、III のタイマーの 00.00 までの動画のフレーム（間に入りの止まりが無い 1 回目に使う）。
  // 戦闘開始のフレームを読まずに済む
  fullBurstStartFromFirstShot: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const start = r.schedule?.fullBurstWindows[Number(c.args.n)]?.start;
      if (start === undefined) throw new Error(`${String(c.args.n)} 回目のフルバーストが無い`);
      const first = slotOf(r.shots, c).frames[0];
      if (first === undefined) throw new Error(`枠 ${String(c.args.slot)} の発が無い`);
      return start - first;
    },
  },
  /**
   * ゲーム内の fromSec 秒から toSec 秒までの、録画の動画のフレーム数。フルバーストの入りの止まり（C-0069）を足す。
   * 3 分モードの残り時間が 02:59 から 00:00 になるまでは fromSec 0・toSec 179
   */
  videoFramesBetween: {
    args: ['fromSec', 'toSec'],
    sim: (r, c) => videoFramesBetween(r.schedule, c),
  },
  gaugeFullFrame: {
    args: ['n'],
    sim: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
  },
  // 録画 0045・0046・0082 の「n 回目に BURST バーが消えた発の番号」（V-0085）。モデルは全発が当たるので、外れた発のある録画では
  // 当たった発の番号と比べる。満タンが来なければ 0
  gaugeFullShotIndex: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const full = r.schedule?.gaugeFullFrames[Number(c.args.n)];
      if (full === undefined) return 0;
      return slotOf(r.shots, c).frames.filter((f) => f <= full).length;
    },
    occurrences: (r) => r.schedule?.gaugeFullFrames.length ?? 0,
  },
  // V-0235: n 回目（0 始まり）にチェーンが切れた（ゲージが 0 に戻った。C-0009）フレームの後から、次に BURST バーが消えたフレームまでに
  // 枠が撃った発の数。単騎のオートバーストで、チェーンの待ちの明けから次の満タンまでの溜まり方を比べる
  chainTimeoutToGaugeFullShots: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const timeout = r.schedule?.chainTimeouts[Number(c.args.n)];
      if (timeout === undefined) throw new Error(`${String(c.args.n)} 回目のチェーン切れが無い`);
      const full = r.schedule?.gaugeFullFrames.find((f) => f > timeout);
      if (full === undefined) throw new Error(`${String(c.args.n)} 回目のチェーン切れの後に満タンが無い`);
      return slotOf(r.shots, c).frames.filter((f) => f > timeout && f <= full).length;
    },
  },
  burstCount: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).burst.activations.length,
  },
  burstHitDelays: { args: ['slot', 'count'], sim: burstHitDelays },
  gaugeFullToBurstHit: { args: ['slot', 'n'], sim: gaugeFullToBurstHit },
  burstHitOffsets: { args: ['slot', 'n'], sim: burstHitOffsets },
  burstEffectFirstShot: { args: ['slot', 'n'], sim: burstEffectFirstShot },
  burstEffectDelay: { args: ['slot', 'n'], sim: burstEffectDelay },
  fullBurstCrossingShotGauge: { args: ['slot'], sim: fullBurstCrossingShotGauge },
  shotGauge: { args: ['slot', 'n'], sim: shotGauge },
  // フルバーストの終わりから frames の間に撃った発の 1 発のゲージの、ほかの時の 1 発に対する比（V-0638）
  shotGaugeRatioAfterFullBurst: { args: ['slot', 'frames'], sim: shotGaugeRatioAfterFullBurst },
  // 枠 holder に状態 state が付いている間（n で n 回目の窓だけ）に着いた、枠の 1 回のゲージ（味方のゲージで足した量を入れる）の、
  // ほかの時に対する比（V-0751）
  shotGaugeRatioInHolderState: { args: ['slot', 'holder', 'state'], sim: shotGaugeRatioInHolderState },
  // 枠の n 回目（1 始まり）の周期のゲージ（burstGaugeHit）の量（バーの最大に対する %）（V-0483）
  timerGauge: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const n = Number(c.args.n);
      const g = r.timerGauges.filter((x) => x.slotIndex === slotIndexOf(c))[n - 1];
      if (g === undefined) throw new Error(`枠 ${String(c.args.slot)} の ${n} 回目の周期のゲージが無い`);
      return Math.round((g.energy / BURST_GAUGE_MAX) * 10_000) / 100;
    },
  },
  // 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節）: 右のバースト欄の表示の時刻
  ctEndToFullBurstStart: {
    args: ['slot', 'n'],
    sim: (r, c) => ctEndToFullBurstStart(r, c),
  },
  // 枠の n 回目の発動の印から、その発動の CT の明けまでの動画のフレーム（V-0543）
  activationToCtEnd: {
    args: ['slot', 'n'],
    sim: (r, c) => activationToCtEnd(r, c),
  },
  chainStepIntervals: {
    args: ['n'],
    sim: (r, c) => chainStepIntervals(r, c),
  },
};

function fullBurstStartIntervals(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const starts = schedule.fullBurstWindows.map((w) => videoFrameOf(schedule, w.start));
  const n = Number(ctx.args.n);
  if (starts.length < n + 1) throw new Error(`フルバーストが ${starts.length} 回しかない`);
  return starts.slice(1, n + 1).map((s, i) => s - starts[i]!);
}

function fullBurstLengths(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const windows = schedule.fullBurstWindows.slice(0, n);
  if (windows.length < n) throw new Error(`フルバーストが ${windows.length} 回しかない`);
  return windows.map((w) => videoFrameOf(schedule, w.end) - videoFrameOf(schedule, w.start));
}

/**
 * n 回目（0 始まり）のフルバーストの入りから、その後の最初のバーストの発動までの動画のフレーム数
 * （フルバーストの後に I だけ撃って切れる発動の時刻（V-0124）。ゲージの溜まり方と CT で決まる）。入りの止まり（C-0069）は videoFrameOf で足す
 */
function fullBurstToNextActivation(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const window = schedule.fullBurstWindows[n];
  if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
  const next = schedule.activations.find((a) => a.frame > window.start);
  if (next === undefined) throw new Error(`${n} 回目のフルバーストの後に発動が無い`);
  return videoFrameOf(schedule, next.frame) - videoFrameOf(schedule, window.start);
}

/**
 * n 回目（0 始まり）のフルバーストの入りから、その後に最初にゲージが満タンになる（BURST バーが
 * 消える（V-0124）。C-0083）までの動画のフレーム数。フルバーストの後のゲージの溜まり方を、CT に左右されずに比べる
 */
function fullBurstToGaugeFull(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const window = schedule.fullBurstWindows[n];
  if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
  const full = schedule.gaugeFullFrames.find((f) => f > window.start);
  if (full === undefined) throw new Error(`${n} 回目のフルバーストの後に満タンが無い`);
  return videoFrameOf(schedule, full) - videoFrameOf(schedule, window.start);
}

/**
 * V-0189: n 回目（0 始まり）にゲージが満タンになった（BURST バーが消えた）フレームから、その後の最初の発動（I）までの動画のフレーム数。
 * ゲージが律速の回の I の段の長さ（C-0073）を比べる
 */
function gaugeFullToActivation(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const full = schedule.gaugeFullFrames[n];
  if (full === undefined) throw new Error(`${n} 回目の満タンが無い`);
  const next = schedule.activations.find((a) => a.frame >= full);
  if (next === undefined) throw new Error(`${n} 回目の満タンの後に発動が無い`);
  return videoFrameOf(schedule, next.frame) - videoFrameOf(schedule, full);
}

/**
 * V-0359（リターの S1 の CT▼）: n 回目（0 始まり）のフルバーストの入りのフレームに、枠の残りのバーストスキル CT が縮んだフレーム数
 * （その枠が受けた即時効果の CT▼ の、実際に縮んだ量の和。CT が明けていた枠は 0。burst/controller.ts の reduceCooldown）。
 * n はカンマ区切りの並び（"0,2,3"）も書け、そのときは回ごとの列。録画では、右のバースト欄の CT の残り秒の切り替わりから読んだ
 * 縮んだ長さ（ゲーム内の秒 ÷ 0.017）と比べる
 */
function cooldownCutFrames(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number | number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const cutAt = (n: number): number => {
    const window = schedule.fullBurstWindows[n];
    if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
    return schedule.cooldownReductions
      .filter((r) => r.slotIndex === slotIndex && r.frame === window.start)
      .reduce((sum, r) => sum + r.applied, 0);
  };
  return eachOrOne(ctx.args.n, cutAt);
}

function burstActivationSlots(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  if (schedule.activations.length < n) throw new Error(`発動が ${schedule.activations.length} 回しかない`);
  return schedule.activations.slice(0, n).map((a) => a.slotIndex + 1);
}

/**
 * 最初の n 回の発動の段の表示（I・II は六角形の替わり目、III はタイマーの 00.00（V-0504）。activationVideoFrameOf）の、
 * 戦闘開始からの録画の動画のフレーム（それより前の発動の止まり・フルバーストの入りの止まりを含む）
 */
function burstActivationVideoFrames(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  if (schedule.activations.length < n) throw new Error(`発動が ${schedule.activations.length} 回しかない`);
  return schedule.activations.slice(0, n).map((a) => activationVideoFrameOf(schedule, a));
}

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節。C-0512）: 枠の n 回目（0 始まり。カンマ区切りの並びも書ける）の
 * 発動の、その枠の CT の明け（前の発動 + CT − 前の発動の CT を維持の CT▼ で縮めた分 − その間に即時の CT▼ で縮んだ分）から
 * 発動の印（III はタイマーの 00.00。hexagonFrameOf）までの動画のフレーム数の列。モデルでその回が CT の明けで撃っていなければ
 * （ゲージや前の段が律速）比べられない
 */
function ctEndToFullBurstStart(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const character = ctx.input.slots[slotIndex]?.character;
  if (character === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  const cooldown = gameSecondsToFrames(character.burstSkill.cooldownSeconds);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex);
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const k = Number(s);
      const activation = mine[k];
      const previous = mine[k - 1];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      if (previous === undefined) throw new Error(`${s} 回目はモデルで CT が律速でない（前の発動が無い）`);
      const cut = schedule.cooldownReductions
        .filter((r) => r.slotIndex === slotIndex && r.frame >= previous.frame && r.frame < activation.frame)
        .reduce((sum, r) => sum + r.applied, 0);
      const ctEnd = previous.frame + cooldown - (previous.cooldownShortenedFrames ?? 0) - cut;
      if (ctEnd !== activation.frame)
        throw new Error(`${s} 回目はモデルで CT が律速でない（CT の明け ${ctEnd}・発動 ${activation.frame}）`);
      return activationVideoFrameOf(schedule, activation) - videoFrameOf(schedule, ctEnd);
    });
}

/**
 * 枠の n 回目（0 始まり（V-0543）。カンマ区切りの並びも書ける）の発動の印（I・II は六角形の替わり目、III は 00.00。
 * activationVideoFrameOf）から、その発動の CT の明け（発動 + CT − 維持の CT▼ で縮めた分 − 次の発動までに即時の CT▼ で縮んだ分）までの
 * 動画のフレーム数の列。録画では、次の回の右のバースト欄の顔の CT の秒の表示が消えたフレームから、この回の替わり目を引いた値
 */
function activationToCtEnd(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const character = ctx.input.slots[slotIndex]?.character;
  if (character === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  const cooldown = gameSecondsToFrames(character.burstSkill.cooldownSeconds);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex);
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const k = Number(s);
      const activation = mine[k];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      const until = mine[k + 1]?.frame ?? Infinity;
      const cut = schedule.cooldownReductions
        .filter((r) => r.slotIndex === slotIndex && r.frame >= activation.frame && r.frame < until)
        .reduce((sum, r) => sum + r.applied, 0);
      const ctEnd = activation.frame + cooldown - (activation.cooldownShortenedFrames ?? 0) - cut;
      return videoFrameOf(schedule, ctEnd) - activationVideoFrameOf(schedule, activation);
    });
}

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節。C-0515）: n 回目（0 始まり）のフルバーストを開いたチェーンの、
 * 隣り合う本当の発動どうしの動画のフレーム数（I → II・II → III。I・II の発動の止まりを含む）
 */
function chainStepIntervals(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const entries = schedule.activations.flatMap((a, i) => (a.startsFullBurst ? [i] : []));
  const last = entries[n];
  const window = schedule.fullBurstWindows[n];
  if (last === undefined || window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const chain = schedule.activations.slice(last - window.burstUsers.length + 1, last + 1);
  const frames = chain.map((a) => videoFrameOf(schedule, a.frame));
  return frames.slice(1).map((f, i) => f - frames[i]!);
}

/**
 * 枠の n 発目（1 始まり）が溜めたゲージ（バーの最大に対する %。
 * 発・射撃ごとの倍率ダメージのヒット・その発が壊した障害物の物のゲージの合計。着弾のフレームは問わない。
 * plan/design-anis-star-gauge-timing.md 7 節の V-B）
 */
function shotGauge(result: SimResult, ctx: MetricContext): number {
  const slotIndex = slotIndexOf(ctx);
  const n = Number(ctx.args.n);
  const frame = result.shots[slotIndex]?.frames[n - 1];
  if (frame === undefined) throw new Error(`${n} 発目が無い`);
  const energy = result.shotGauges
    .filter((g) => g.slotIndex === slotIndex && g.shotFrame === frame)
    .reduce((a, g) => a + g.energy, 0);
  return Math.round((energy / BURST_GAUGE_MAX) * 10_000) / 100;
}

/**
 * 枠の 1 発のゲージ（同じ発の記録の合計）の平均を、フルバーストの終わりから frames の間（[終わり, 終わり + frames)）に
 * 撃った発と、ほかの時（フルバーストの間とその後の frames を除く）に撃った発で比べた比（小数 4 桁）（V-0638）。録画では、その枠だけが当たった
 * フレームの BURST バーの段の平均の比と比べる。どちらかに発が無ければ誤り
 */
function shotGaugeRatioAfterFullBurst(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const frames = Number(ctx.args.frames);
  const windows = schedule.fullBurstWindows;
  const perShot = new Map<number, number>();
  for (const g of result.shotGauges)
    if (g.slotIndex === slotIndex) perShot.set(g.shotFrame, (perShot.get(g.shotFrame) ?? 0) + g.energy);
  const inside: number[] = [];
  const outside: number[] = [];
  for (const [f, energy] of perShot) {
    if (windows.some((w) => w.end <= f && f < w.end + frames)) inside.push(energy);
    else if (!windows.some((w) => w.start <= f && f < w.end)) outside.push(energy);
  }
  if (inside.length === 0 || outside.length === 0) throw new Error('フルバーストの後か、ほかの時の発が無い');
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  return Math.round((mean(inside) / mean(outside)) * 10_000) / 10_000;
}

/**
 * 枠の 1 回のゲージ（着弾の記録の発のゲージに、味方のゲージ（allyGaugeAdd）で足した量を入れる）の、枠 holder に状態 state が付いている
 * 間に着いた回と、ほかの時（状態の付いていない時）に着いた回の比（小数 4 桁。plan/design-grave-heat-gauge.md 2.3 節）。どちらも、
 * 足した量を入れた合計を発のゲージだけの合計で割り、その 2 つを比べる（1 回の発のゲージが一定なら、1 回のゲージの平均の比と同じ。
 * 命中の期待値が着地点で変わっても動かない）。n（0 始まり）を書くと、付いている間は n 回目の件の窓だけ。録画では、その枠だけが当たる
 * 区間のバーの 1 回の伸びの比と比べる。どちらかに回が無ければ誤り
 */
function shotGaugeRatioInHolderState(result: SimResult, ctx: MetricContext): number {
  const slotIndex = slotIndexOf(ctx);
  const holder = Number(ctx.args.holder) - 1;
  const state = String(ctx.args.state);
  // 1 パス目が足す窓（selfStateAt）と同じく、付いた次のフレームから外れるフレームの前まで
  const windows = itemsOf(result.history, { holder, state: state as NamedStateId });
  const n = ctx.args.n === undefined ? null : Number(ctx.args.n);
  if (n !== null && windows[n] === undefined) throw new Error(`枠 ${holder + 1} の ${state} の ${n} 回目が無い`);
  const within = (w: { start: number; end: number }, f: number) => w.start < f && f < w.end;
  const sums = { in: { own: 0, all: 0 }, out: { own: 0, all: 0 } };
  /** 窓の中なら in（n があれば n 回目の窓だけ。ほかの窓は数えない）、外なら out */
  const sideOf = (f: number) =>
    windows.some((w) => within(w, f)) ? (n === null || within(windows[n]!, f) ? sums.in : null) : sums.out;
  const add = (gauges: readonly { slotIndex: number; frame: number; energy: number }[], own: boolean) => {
    for (const g of gauges) {
      const side = g.slotIndex === slotIndex ? sideOf(g.frame) : null;
      if (side === null) continue;
      side.all += g.energy;
      if (own) side.own += g.energy;
    }
  };
  add(result.shotGauges, true);
  add(result.allyGauges, false);
  if (sums.in.own === 0 || sums.out.own === 0)
    throw new Error(`枠 ${holder + 1} の ${state} の間か、ほかの時の回が無い`);
  return Math.round((sums.in.all / sums.in.own / (sums.out.all / sums.out.own)) * 10_000) / 10_000;
}

/**
 * 録画の窓の終わりを跨ぐ発（窓の中で撃ち、窓の後に着いた発）が溜めたゲージ（バーの最大に対する %。
 * 発と射撃ごとの倍率ダメージのヒットの合計。plan/design-anis-star-gauge-timing.md 3.5 節・7 節の V-A）と比べる、
 * モデルの発 1 つ分のゲージ。
 * 窓の順に、窓の始まりより後に撃って窓の終わりより後（終わりのフレームを含む）に着いた最初の発（跨ぐ発か、窓の後に撃った発）の値。
 * モデルにどの窓の終わりを跨ぐ発があるかは発の位相で 1f ごとに入れ替わるので、跨ぐ発に限らない（V-0189 の論点 3 の X1）。
 * 跨ぐ発も着弾のフレームに溜めること（C-0259）は、1 パス目の単体テストで見る。窓の後に着く発が無ければ誤り
 */
function fullBurstCrossingShotGauge(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const windows = schedule.fullBurstWindows;
  for (const [k, w] of windows.entries()) {
    const next = windows[k + 1]?.start ?? Infinity;
    const after = result.shotGauges.filter(
      (g) => g.slotIndex === slotIndex && w.start <= g.shotFrame && g.shotFrame < next && g.frame >= w.end,
    );
    if (after.length === 0) continue;
    const first = Math.min(...after.map((g) => g.shotFrame));
    const energy = after.filter((g) => g.shotFrame === first).reduce((a, g) => a + g.energy, 0);
    return Math.round((energy / BURST_GAUGE_MAX) * 10_000) / 100;
  }
  throw new Error('フルバーストの窓の後に着く発が無い');
}

function videoFramesBetween(schedule: SimResult['schedule'], ctx: MetricContext): number {
  const from = gameSecondsToFrame(Number(ctx.args.fromSec));
  const to = gameSecondsToFrame(Number(ctx.args.toSec));
  return videoFrameOf(schedule, to) - videoFrameOf(schedule, from);
}

/**
 * 枠のバーストの、発動からヒット（バーストの倍率ダメージ。分かれたヒットは 1 ヒット目）までの
 * 動画のフレーム数（発動の順に最初の count 回）。フルバーストの入りの止まりは videoFrameOf で足す。起点は六角形の替わり目（plan/design-burst-landing.md）
 * （本当の発動の 5f 後。I・II の発動自身の止まりを含める。activationVideoFrameOf）
 */
function burstHitDelays(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const count = Number(ctx.args.count);
  if (mine.length < count) throw new Error(`発動が ${mine.length} 回しかない`);
  return mine.slice(0, count).map((a) => videoFrameOf(schedule, hitFrameOf(a)) - activationVideoFrameOf(schedule, a));
}

/**
 * 枠の n 回目（0 始まり）のバーストの発動の前の最後の満タン（BURST バーが消えた発）から、その発動のヒット（分かれたヒットは
 * 1 ヒット目）までの動画のフレーム数の列。n はカンマ区切りの並び（"0,2,3"）も書ける。burstHitDelays と違い、起点に六角形の替わり目を
 * 使わないので、遅れの定数を足す起点（本当の発動か替わり目か）の差が出る。ゲージが律速のチェーン（満タンから I まで 23f。C-0285）で比べる
 */
function gaugeFullToBurstHit(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const activation = mine[Number(s)];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      const full = schedule.gaugeFullFrames.filter((f) => f <= activation.frame).at(-1);
      if (full === undefined) throw new Error(`${s} 回目の発動の前に満タンが無い`);
      return videoFrameOf(schedule, hitFrameOf(activation)) - videoFrameOf(schedule, full);
    });
}

/**
 * バーストの効果の遅れ（backlog 2-4）: 枠の n 回目（0 始まり）のバーストの発動の印（I・II は六角形の替わり目。hexagonFrameOf。
 * V-0382・V-0390）から、効果の発火（effectFrameOf）以後の枠の最初の発までのモデルのフレーム数（ゲーム内の時間。フルバーストの
 * 入りの止まりを含まない）。効果の乗った最初の発の時刻を、動画のフレームの差（止まりの後の発は 22f を引く）と比べる。fromShot が
 * true なら起点を発動の後の最初の発にする（発の間隔とリロードの位置によらず、効果の遅れが無ければ 0）。band（的の距離帯）があれば、n は
 * 効果の発火のフレームの着地点がその帯の発動だけを数える（plan/design-eunhwa-tu-burst-shot-timing.md 7 節。モデルと録画で
 * バーストの回と的のジャンプの位相がそろわないので、帯で決まる値を帯どうしで比べる）
 */
function burstEffectFirstShot(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const band = ctx.args.band;
  const spans = band === undefined ? [] : landingFrameSpans(ctx.input.enemy, result.frames);
  const bandAt = (frame: number) => spans.find((s) => s.start <= frame && frame < s.end)?.band ?? null;
  const mine = schedule.activations.filter(
    (a) => a.slotIndex === slotIndexOf(ctx) && (band === undefined || bandAt(effectFrameOf(a)) === band),
  );
  const activation = mine[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  const log = slotOf(result.shots, ctx);
  // weaponChange が true なら、使用武器の変更の発だけを数える（変更の窓の前の基礎の武器の発を拾わない）（V-0666）
  const frames = ctx.args.weaponChange === true ? (log.weaponChangeShotFrames ?? []) : log.frames;
  const firstFrom = (frame: number) => {
    const shot = frames.find((f) => f >= frame);
    if (shot === undefined) throw new Error(`フレーム ${frame} の後に発が無い`);
    return shot;
  };
  const origin = ctx.args.fromShot === true ? firstFrom(activation.frame) : hexagonFrameOf(activation);
  // afterHits が true なら、バーストの倍率ダメージの最後のヒットの次のフレーム以後の最初の発（発動の後に撃たない間の明け）（V-0661）
  const from = ctx.args.afterHits === true ? hitFramesOf(activation).at(-1)! + 1 : effectFrameOf(activation);
  return firstFrom(from) - origin;
}

/**
 * バーストの効果の遅れ（backlog 2-4。V-0368）: 枠の n 回目（0 始まり）のバーストの発動の印（I・II は六角形の替わり目。
 * hexagonFrameOf。V-0382）から、バースト使用時の効果の発火（effectFrameOf）までのモデルのフレーム数（遅れの無い効果は負）。効果の乗った発が自分の発でないとき（味方の発の値で▲の有無を読むとき）に、
 * 録画の「▲の無い最後の発 〜 ▲の乗った最初の発」の幅（観測値の spread）と比べる
 */
function burstEffectDelay(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const activation = mine[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  return effectFrameOf(activation) - hexagonFrameOf(activation);
}

function burstHitOffsets(result: SimResult, ctx: MetricContext): number[] {
  const { schedule, activation } = nthActivationOf(result, ctx);
  const frames = hitFramesOf(activation).map((f) => videoFrameOf(schedule, f));
  return frames.map((f) => f - frames[0]!);
}

function gaugeFull(frames: readonly number[] | undefined, ctx: MetricContext): number {
  const value = frames?.[Number(ctx.args.n)];
  if (value === undefined) throw new Error(`${String(ctx.args.n)} 回目の満タンが無い`);
  return value;
}
