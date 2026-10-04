// バーストの着弾編（plan/design-burst-landing.md 2 節）: バーストの発動から、バーストの倍率ダメージのヒットと、
// 「バーストスキルを使用した時」の効果の発火までの遅れ（キャラごとの実測値。ゲーム内の時間 = モデルのフレーム）。
// 表に無いキャラは 0（発動と同じフレーム。未測定）。チェーン・CT・フルバーストの窓は発動のフレームのまま。
// 分かれたヒット編（plan/design-burst-split-hits.md）: 1 回の発動の倍率ダメージが間をあけた複数のヒットに分かれるキャラは、
// 1 ヒット目からのずれの列（hitOffsets）を持ち、倍率を等分して各ヒットに出す。
import type { CharacterData } from '../types.ts';
import type { BurstActivation } from './schedule.ts';

export type BurstDelays = {
  /** 発動 → バーストの倍率ダメージ（burstDamage）の 1 ヒット目 */
  hitFrames: number;
  /** 発動 → 自分の burstUse・{ count: burstUse } のトリガーの発火 */
  effectFrames: number;
  /** 分かれたヒット編: 1 ヒット目から各ヒットまでのずれ（昇順・先頭は 0）。省略は [0]（1 ヒット） */
  hitOffsets?: readonly number[];
};

export type MeasuredBurstDelayRow = {
  resourceIds: readonly number[];
  /** 分かれたヒット編: true なら、burst が宝物版のとき（宝物の段階が burst まで解放したとき）だけ当てる */
  treasure?: boolean;
  delays: BurstDelays;
  claim: string;
};

const NO_DELAYS: Readonly<BurstDelays> = Object.freeze({ hitFrames: 0, effectFrames: 0 });

/** 実測値の表。1 行に根拠の結論の ID を添える（skills-guide.md 1.5 節） */
export const MEASURED_BURST_DELAYS: readonly MeasuredBurstDelayRow[] = [
  // イサベル: III の発動からヒットと効果の発火まで、どちらも 134f（動画で 156f。フルバーストの入りの止まり 22f を含む）
  { resourceIds: [231], delays: { hitFrames: 134, effectFrames: 134 }, claim: 'C-0165' },
  // ヘルム（宝物あり）: III の発動からヒットまで 59f（動画で 80〜81f。止まり 22f を含む）。効果（チャージダメージ倍率▲）は
  // フルバーストの始まりの表示より 2〜35f 前に発火する。モデルは発動より前に置けないので 0（発動と同じフレーム）。
  // 宝物なしは未測定（plan/design-burst-split-hits.md 7 節の論点 4）
  { resourceIds: [352], treasure: true, delays: { hitFrames: 59, effectFrames: 0 }, claim: 'C-0167' },
  // I-DOLL・フラワー: I の発動（六角形が I から II に替わるフレーム）からヒットまで 14f。バースト使用時の効果は無い
  { resourceIds: [304], delays: { hitFrames: 14, effectFrames: 0 }, claim: 'C-0220' },
  // ニヒリスター: II の発動からヒットと火傷の付与（1 回目の tick はヒットと同じフレーム。C-0101）まで、どちらも 9f
  { resourceIds: [261], delays: { hitFrames: 9, effectFrames: 9 }, claim: 'C-0219' },
  // ノワール: III の発動からヒットまで 72f（動画で 93〜94f。止まり 22f を含む）。効果（SG の味方の命中率▲）の遅れは未測定。
  // 録画が最小構成でない（エーテルの定義が無い）仮説だが、オーナーの判断で入れた（2026-10-04）
  { resourceIds: [271], delays: { hitFrames: 72, effectFrames: 0 }, claim: 'C-0226' },
  // ラピ: III の発動から 1 ヒット目まで 90f（動画で 111〜112f の最も多い値。止まり 22f を含む）、7f おきの 3 ヒット。
  // 効果（自分の攻撃力▲）の遅れは未測定。最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [10], delays: { hitFrames: 90, effectFrames: 0, hitOffsets: [0, 7, 14] }, claim: 'C-0227' },
  // ドレイク（宝物あり）: III の発動から 1 ヒット目まで 4f（動画で 26〜27f の最も多い値）、2・3 ヒット目は 27f・55f 後。
  // 効果（最大装弾数▲・攻撃ダメージ▲）の遅れは未測定。宝物なしは未測定。最小構成でない録画の仮説
  {
    resourceIds: [101],
    treasure: true,
    delays: { hitFrames: 4, effectFrames: 0, hitOffsets: [0, 27, 55] },
    claim: 'C-0228',
  },
  // ユニ: II の発動（六角形が II から次の表示に替わるフレーム）からヒットまで 124f（フルバーストにつながる回は、間の III の発動の
  // 止まり 22f を含めて動画で 146f）。バースト使用時の効果は無い。最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [160], delays: { hitFrames: 124, effectFrames: 0 }, claim: 'C-0230' },
  // クイーン（真）: III の発動からヒットまで 1f（動画で 22〜23f。止まり 22f を含む）。効果（自分の攻撃力▲）の遅れは未測定。
  // 最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [870], delays: { hitFrames: 1, effectFrames: 0 }, claim: 'C-0231' },
  // レイヴン: III の発動からヒットまで 43f（動画で 64〜65f。止まり 22f を含む）。効果（A.N.モード）は持続ダメージ▲で語彙に無い。
  // 最小構成でない録画の仮説
  { resourceIds: [851], delays: { hitFrames: 43, effectFrames: 0 }, claim: 'C-NNNN' },
];

type DelayKey = Pick<CharacterData, 'resourceId' | 'skills' | 'treasure'>;

/** 分かれたヒット編: burst が宝物版か（applyTreasure が skills.burst を宝物版のスキルに差し替えたか） */
export function isTreasureBurst(character: DelayKey): boolean {
  const treasureBurst = character.treasure?.skills.burst;
  return treasureBurst !== undefined && character.skills.burst.id === treasureBurst.id;
}

/** 表の行（画面の注記用）。表に無ければ null */
export function measuredBurstDelayRow(character: DelayKey): MeasuredBurstDelayRow | null {
  return (
    MEASURED_BURST_DELAYS.find(
      (row) => row.resourceIds.includes(character.resourceId) && (row.treasure !== true || isTreasureBurst(character)),
    ) ?? null
  );
}

/** キャラのバーストの遅れ。表に無ければ 0 */
export function burstDelaysOf(character: DelayKey): Readonly<BurstDelays> {
  return measuredBurstDelayRow(character)?.delays ?? NO_DELAYS;
}

/** 表にあるキャラだけ delays を持たせる（無いキャラの BurstUnit・BurstCandidate は今までと同じ形） */
export function burstDelaysFieldOf(character: DelayKey): { delays?: Readonly<BurstDelays> } {
  const delays = burstDelaysOf(character);
  return delays.hitFrames === 0 && delays.effectFrames === 0 && !isSplit(delays) ? {} : { delays };
}

/** 分かれたヒット編: 2 つ以上のヒットに分かれるか */
export function isSplit(delays: Readonly<BurstDelays>): boolean {
  return (delays.hitOffsets?.length ?? 1) > 1;
}

/**
 * 発動にヒットと効果の発火のフレームを書く。遅れ 0 の欄は書かない（hitFrameOf・effectFrameOf が発動のフレームを返す）。
 * 分かれたヒットは hitOffsets を写す（1 ヒットなら書かない）
 */
export function withBurstDelays(activation: BurstActivation, delays: Readonly<BurstDelays>): BurstActivation {
  const out = { ...activation };
  if (delays.hitFrames > 0) out.hitFrame = activation.frame + delays.hitFrames;
  if (delays.effectFrames > 0) out.effectFrame = activation.frame + delays.effectFrames;
  if (isSplit(delays)) out.hitOffsets = [...delays.hitOffsets!];
  return out;
}
