// バーストの着弾編（plan/design-burst-landing.md 2 節）: バーストの発動から、バーストの倍率ダメージのヒットと、
// 「バーストスキルを使用した時」の効果の発火までの遅れ（キャラごとの実測値。ゲーム内の時間 = モデルのフレーム）。
// 表に無いキャラは 0（発動と同じフレーム。未測定）。チェーン・CT・フルバーストの窓は発動のフレームのまま。
import type { BurstActivation } from './schedule.ts';

export type BurstDelays = {
  /** 発動 → バーストの倍率ダメージ（burstDamage）のヒット */
  hitFrames: number;
  /** 発動 → 自分の burstUse・{ count: burstUse } のトリガーの発火 */
  effectFrames: number;
};

const NO_DELAYS: Readonly<BurstDelays> = Object.freeze({ hitFrames: 0, effectFrames: 0 });

/** 実測値の表。1 行に根拠の結論の ID を添える（skills-guide.md 1.5 節） */
export const MEASURED_BURST_DELAYS: readonly { resourceIds: readonly number[]; delays: BurstDelays; claim: string }[] =
  [
    // イサベル: III の発動からヒットと効果の発火まで、どちらも 134f（動画で 156f。フルバーストの入りの止まり 22f を含む）
    { resourceIds: [231], delays: { hitFrames: 134, effectFrames: 134 }, claim: 'C-0165' },
    // ヘルム（宝物あり）: III の発動からヒットまで 59f（動画で 80〜81f。止まり 22f を含む）。効果（チャージダメージ倍率▲）は
    // フルバーストの始まりの表示より 2〜35f 前に発火する。モデルは発動より前に置けないので 0（発動と同じフレーム）
    { resourceIds: [352], delays: { hitFrames: 59, effectFrames: 0 }, claim: 'C-0167' },
  ];

/** キャラのバーストの遅れ。表に無ければ 0 */
export function burstDelaysOf(resourceId: number): Readonly<BurstDelays> {
  return MEASURED_BURST_DELAYS.find((row) => row.resourceIds.includes(resourceId))?.delays ?? NO_DELAYS;
}

/** 表にあるキャラだけ delays を持たせる（無いキャラの BurstUnit・BurstCandidate は今までと同じ形） */
export function burstDelaysFieldOf(resourceId: number): { delays?: Readonly<BurstDelays> } {
  const delays = burstDelaysOf(resourceId);
  return delays.hitFrames === 0 && delays.effectFrames === 0 ? {} : { delays };
}

/** 表の行（画面の注記用）。表に無ければ null */
export function measuredBurstDelayRow(resourceId: number): (typeof MEASURED_BURST_DELAYS)[number] | null {
  return MEASURED_BURST_DELAYS.find((row) => row.resourceIds.includes(resourceId)) ?? null;
}

/** 発動にヒットと効果の発火のフレームを書く。遅れ 0 の欄は書かない（hitFrameOf・effectFrameOf が発動のフレームを返す） */
export function withBurstDelays(activation: BurstActivation, delays: Readonly<BurstDelays>): BurstActivation {
  const out = { ...activation };
  if (delays.hitFrames > 0) out.hitFrame = activation.frame + delays.hitFrames;
  if (delays.effectFrames > 0) out.effectFrame = activation.frame + delays.effectFrames;
  return out;
}
