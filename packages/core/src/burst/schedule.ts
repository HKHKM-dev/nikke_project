// Stage 7: バーストの時刻表（sim と calc が共有する）。
// Stage 5 / 6 の固定サイクルは「全段階が同じフレーム」「段階の割当が固定」だったが、動的サイクルでは
// 段階ごとに発動フレームが違い、同じ段階の 2 体が CT で交互に撃つこともあるので、発動を 1 回ずつ列挙する形にする。
// 固定サイクル（fixedCycle.ts）も動的サイクル（dynamic.ts）もこの形を返す。
import { framesToGameSeconds } from '../time.ts';

export type BurstStepKey = 'Step1' | 'Step2' | 'Step3';
export const BURST_STEP_KEYS = ['Step1', 'Step2', 'Step3'] as const satisfies readonly BurstStepKey[];

export type FullBurstWindow = {
  start: number;
  end: number;
  /**
   * Stage 11: このフルバーストを開いたチェーンでバーストを撃った枠（発動順）。「直前にバーストスキルを使用した味方」。
   * 動的サイクルはゲージ満タン後〜フルバースト開始の発動（途切れたチェーンの発動は含めない）、固定サイクルは割り当ての枠
   */
  burstUsers: number[];
};

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
  /**
   * III の起点（plan/design-burst-hit-origin.md 8 節）: フルバーストに入る発動の、フルバーストの窓の始まり（III のタイマーの 00.00）の
   * フレーム。動的サイクルは発動の FULL_BURST_AFTER_ACTIVATION_FRAMES 後、固定サイクルは発動と同じフレーム。省略は発動の
   * FULL_BURST_AFTER_ACTIVATION_FRAMES 後（hexagonFrameOf）
   */
  fullBurstStart?: number;
  /**
   * バーストの着弾編（plan/design-burst-landing.md 2 節）: バーストの倍率ダメージのヒットのフレーム。省略は frame（遅れ 0）。
   * 戦闘時間を超えることがある（そのヒットは出ない）
   */
  hitFrame?: number;
  /** 着弾編: 自分の burstUse・{ count: burstUse } のトリガーが発火するフレーム。省略は frame（遅れ 0） */
  effectFrame?: number;
  /**
   * 分かれたヒット編（plan/design-burst-split-hits.md）: 1 ヒット目（hitFrame）から各ヒットまでのずれ（昇順・先頭は 0）。
   * 省略は [0]（1 ヒット）。倍率は等分する
   */
  hitOffsets?: readonly number[];
};

/**
 * 着弾編: 発動のヒットのフレーム。遅れの無い III のヒット（遅れの表に無いキャラも）は、III のタイマーの 00.00（hexagonFrameOf）に出る
 * （2026-10-10 のオーナーの判断。plan/design-burst-hit-origin.md 8 節の案 C'。雪子のヒットは 00.00 の 1f 前。C-0419）
 */
export function hitFrameOf(a: BurstActivation): number {
  return a.hitFrame ?? (a.startsFullBurst ? hexagonFrameOf(a) : a.frame);
}

/** 分かれたヒット編: 発動のヒットのフレームの列（1 ヒットなら [hitFrameOf(a)]。戦闘時間を超えるものも含む） */
export function hitFramesOf(a: BurstActivation): number[] {
  const first = hitFrameOf(a);
  return (a.hitOffsets ?? [0]).map((offset) => first + offset);
}

/** 着弾編: 発動の効果の発火のフレーム */
export function effectFrameOf(a: BurstActivation): number {
  return a.effectFrame ?? a.frame;
}

export type BurstScheduleModel = 'fixed' | 'dynamic';

/** Stage 10: 「バーストスキルクールタイム X 秒▼」を 1 枠に当てた記録（即時効果。plan/design-stage10.md 4 節） */
export type CooldownReduction = {
  frame: number;
  /** CT を縮めた枠 */
  slotIndex: number;
  /** 効果を出した枠 */
  sourceSlotIndex: number;
  /** 縮めようとしたフレーム数（gameSecondsToFrames(X 秒)） */
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

/** 着弾編: 枠 slotIndex のバーストの倍率ダメージのヒットのフレーム列（発生順。戦闘時間 frames 以降は除く） */
export function hitFramesOfSlot(schedule: BurstSchedule, slotIndex: number, frames: number): number[] {
  return burstHitsOfSlot(schedule, slotIndex, frames).map((h) => h.frame);
}

/**
 * 着弾編: 枠 slotIndex のバーストのヒットと、その発動のフレーム（発生順。戦闘時間 frames 以降のヒットは除く）。
 * 分かれたヒット編: ヒットごとに 1 つ。share はそのヒットの倍率の割合（等分。1 ヒットなら 1）
 */
export function burstHitsOfSlot(
  schedule: BurstSchedule,
  slotIndex: number,
  frames: number,
): { activationFrame: number; frame: number; share: number }[] {
  return schedule.activations
    .filter((a) => a.slotIndex === slotIndex)
    .flatMap((a) => {
      const hits = hitFramesOf(a);
      return hits.map((frame) => ({ activationFrame: a.frame, frame, share: 1 / hits.length }));
    })
    .filter((h) => h.frame < frames);
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

/**
 * フルバーストの入りで、ゲーム内の時間がまるごと止まる長さ（動画のフレーム）。III のタイマーの 00.00 から「FULL BURST!」の表示が
 * 消えるまで、残り時間・CT・射撃・ダメージが止まる（C-0069〜C-0071。V-0017 で 1 回 21〜24f）。モデルはゲーム内の時間で
 * 数えるので、与ダメージなどには足さない。録画の動画のフレームと比べるときだけ videoFrameOf で足す。止まりが始まるのは
 * III の本当の発動ではなく 00.00（フルバーストの窓の始まり。FULL_BURST_AFTER_ACTIVATION_FRAMES 後）
 */
export const FULL_BURST_ENTRY_STOP_VIDEO_FRAMES = 22;

/**
 * III の本当の発動（CT が走り出す。モデルの発動のフレーム）から、III のタイマーの 00.00 までのゲーム内のフレーム数。00.00 は
 * フルバーストの窓の始まり・入りの止まりの始まり・III の遅れの定数の起点。CT が律速の III では CT の明けから 00.00 まで 6〜8f
 * （C-0512）、ゲージが律速では満タンから 00.00 まで 87〜88f（V-0391）で、段の長さ 28f（C-0515）のモデルの III の発動（満タンから
 * 動画で 81f）からは 6〜7f。フルバーストの補正は 00.00 から 588f（C-0510・C-0511）。バースト使用時の効果（遅れの表に無いもの）は
 * 本当の発動のまま（2026-10-10 のオーナーの判断。plan/design-burst-hit-origin.md 8 節の案 C'）
 */
export const FULL_BURST_AFTER_ACTIVATION_FRAMES = 6;

/**
 * バーストの I・II の発動（フルバーストの入りでないもの）のたびに、ゲーム内の時間がまるごと止まる長さ（動画のフレーム）。
 * 止まるのは本当の発動（モデルの発動のフレーム）の 1〜3f 後の 1 ティックで、次の段の六角形の替わり目（本当の発動の約 6f 後）より前
 * （C-0289・C-0261・C-0258。V-0195・V-0379）。オートバーストでも 2f の回があり、手で撃つと多くが 2f だが（C-0500）、モデルは 1f 一律。
 * 入りの止まりと同じく、録画の動画のフレームと比べるときだけ videoFrameOf で足す（plan/design-activation-stall-video.md）
 */
export const ACTIVATION_STOP_VIDEO_FRAMES = 1;

/**
 * モデルのフレーム（ゲーム内の時間）→ 録画の動画のフレーム。frame より前のフルバーストの入り（III のタイマーの 00.00。
 * hexagonFrameOf）ごとに入りの止まりを、I・II の発動ごとに発動の止まりを足す
 */
export function videoFrameOf(schedule: BurstSchedule | null, frame: number): number {
  const activations = schedule?.activations ?? [];
  const entries = activations.filter((a) => a.startsFullBurst && hexagonFrameOf(a) < frame).length;
  const stops = activations.filter((a) => !a.startsFullBurst && a.frame < frame).length;
  return frame + entries * FULL_BURST_ENTRY_STOP_VIDEO_FRAMES + stops * ACTIVATION_STOP_VIDEO_FRAMES;
}

/**
 * I・II の本当の発動（モデルの発動のフレーム）から、右のバースト欄の六角形の替わり目までのゲーム内のフレーム数（発動自身の止まり
 * ACTIVATION_STOP_VIDEO_FRAMES を除く）。満タン → 替わり目 29f（C-0220）− 満タン → 本当の発動 23f（C-0285）− 止まり 1f（C-0289）。
 * I・II の遅れの定数（C-0219・C-0220・C-0230・C-0479）は替わり目から数えた値なので、ここを起点に足す（V-0382。plan/design-burst-hit-origin.md）
 */
export const HEXAGON_AFTER_ACTIVATION_FRAMES = 5;

/**
 * 発動の段の表示のモデルのフレーム。I・II は六角形の替わり目（本当の発動の HEXAGON_AFTER_ACTIVATION_FRAMES 後）、III は III のタイマーの
 * 00.00（フルバーストの窓の始まり。fullBurstStart。動的サイクルは本当の発動の FULL_BURST_AFTER_ACTIVATION_FRAMES 後）
 */
export function hexagonFrameOf(activation: Pick<BurstActivation, 'frame' | 'startsFullBurst' | 'fullBurstStart'>): number {
  if (!activation.startsFullBurst) return activation.frame + HEXAGON_AFTER_ACTIVATION_FRAMES;
  return activation.fullBurstStart ?? activation.frame + FULL_BURST_AFTER_ACTIVATION_FRAMES;
}

/**
 * 発動の動画のフレームを、録画で読む「発動」（右のバースト欄の六角形の替わり目、III はタイマーの 00.00）として数える。I・II の
 * 替わり目は本当の発動の HEXAGON_AFTER_ACTIVATION_FRAMES 後で、その間の発動自身の止まりを videoFrameOf が含める。III の 00.00 は
 * 入りの止まりの前（plan/design-activation-stall-video.md 2 節・plan/design-burst-hit-origin.md）
 */
export function activationVideoFrameOf(schedule: BurstSchedule | null, activation: BurstActivation): number {
  return videoFrameOf(schedule, hexagonFrameOf(activation));
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
        ? framesToGameSeconds((last - first) / (starts.length - 1))
        : null,
    firstFullBurstSeconds: first === undefined ? null : framesToGameSeconds(first),
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
