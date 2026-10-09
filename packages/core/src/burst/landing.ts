// バーストの着弾編（plan/design-burst-landing.md 2 節）: バーストの発動から、バーストの倍率ダメージのヒットと、
// 「バーストスキルを使用した時」の効果の発火までの遅れ（キャラごとの実測値。ゲーム内の時間 = モデルのフレーム）。
// 表に無いキャラは 0（発動と同じフレーム。未測定）。チェーン・CT・フルバーストの窓は発動のフレームのまま。
// 遅れの起点は録画で読んだ発動の印: I・II は右のバースト欄の六角形の替わり目（本当の発動の HEXAGON_AFTER_ACTIVATION_FRAMES 後。
// hexagonFrameOf）、III はフルバーストの入り（発動のフレーム）。遅れ 0 の欄は本当の発動のまま（plan/design-burst-hit-origin.md）。
// 分かれたヒット編（plan/design-burst-split-hits.md）: 1 回の発動の倍率ダメージが間をあけた複数のヒットに分かれるキャラは、
// 1 ヒット目からのずれの列（hitOffsets）を持ち、倍率を等分して各ヒットに出す。
import type { CharacterData } from '../types.ts';
import { hexagonFrameOf, type BurstActivation } from './schedule.ts';

export type BurstDelays = {
  /** 発動の印（hexagonFrameOf）→ バーストの倍率ダメージ（burstDamage）の 1 ヒット目 */
  hitFrames: number;
  /** 発動の印（hexagonFrameOf）→ 自分の burstUse・{ count: burstUse } のトリガーの発火 */
  effectFrames: number;
  /** 分かれたヒット編: 1 ヒット目から各ヒットまでのずれ（昇順・先頭は 0）。省略は [0]（1 ヒット） */
  hitOffsets?: readonly number[];
};

export type MeasuredBurstDelayRow = {
  resourceIds: readonly number[];
  /** 分かれたヒット編: true なら、burst が宝物版のとき（宝物の段階が burst まで解放したとき）だけ当てる */
  treasure?: boolean;
  /**
   * 効果の窓の終わり（plan/design-burst-effect-window-end.md 案 B）: true なら、そのキャラの burstUse で発火する timed・使用武器変更の
   * 窓の終わりを発動から数える（維持時間から effectFrames を引く。窓の始まりは効果の発火のまま）。書かない行は窓ごと遅れる
   */
  windowFromActivation?: true;
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
  // I-DOLL・フラワー: I の発動（六角形が I から II に替わるフレーム。本当の発動の 5f 後）からヒットまで 14f。バースト使用時の効果は無い
  { resourceIds: [304], delays: { hitFrames: 14, effectFrames: 0 }, claim: 'C-0220' },
  // ニヒリスター: II の発動（六角形の替わり目）からヒットと火傷の付与（1 回目の tick はヒットと同じフレーム。C-0101）まで、どちらも 9f
  { resourceIds: [261], delays: { hitFrames: 9, effectFrames: 9 }, claim: 'C-0219' },
  // ノワール: III の発動からヒットまで 72f（動画で 93〜94f。止まり 22f を含む）。効果（SG の味方の命中率▲）の遅れは未測定。
  // 録画が最小構成でない（エーテルの定義が無い）仮説だが、オーナーの判断で入れた（2026-10-04）
  { resourceIds: [271], delays: { hitFrames: 72, effectFrames: 0 }, claim: 'C-0226' },
  // ラピ: III の発動から 1 ヒット目まで 90f（動画で 111〜112f の最も多い値。止まり 22f を含む）、7f おきの 3 ヒット。
  // 効果（自分の攻撃力▲）の遅れは未測定。最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [10], delays: { hitFrames: 90, effectFrames: 0, hitOffsets: [0, 7, 14] }, claim: 'C-0227' },
  // ドレイク（宝物あり）: III の発動から 1 ヒット目まで 4f（動画で 26〜27f の最も多い値）、2・3 ヒット目は 27f・55f 後。
  // 効果（攻撃ダメージ▲・最大装弾数▲）はヒットより前に付き、止まりの明けの 1f 後の発にも乗る（C-0420）ので 0。宝物なしは未測定
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
  // レイヴン: III の発動からヒットまで 43f（動画で 64〜65f。止まり 22f を含む）。効果（A.N.モードの持続ダメージ▲）はヒットより前に
  // 付き、止まりの明けの後の最初の S1 の tick から乗る（C-0421）ので 0
  { resourceIds: [851], delays: { hitFrames: 43, effectFrames: 0 }, claim: 'C-0233' },
  // マナ: III の発動から効果（持続ダメージの付与と 1 回目の tick・持続ダメージ▲）まで 2f（動画で 24f。止まり 22f を含む）。
  // バーストの倍率ダメージは無い
  { resourceIds: [290], delays: { hitFrames: 0, effectFrames: 2 }, claim: 'C-0301' },
  // モダニア: III の発動から殲滅モードの最初の発まで 7f（動画で 28〜29f。止まり 22f を含む）。モデルの使用武器変更は効果の発火の
  // 次のフレームから撃つので、効果（殲滅モード・装弾数無限）の発火は 6f。バーストの倍率ダメージは無い。止まりの明けから殲滅モードの
  // 最初の発まで撃たないことはモデルに無い（定義の burst の notes）
  // 窓の終わりは発動から数える（実測の最後の発は後ろにずれない。plan/design-burst-effect-window-end.md）
  { resourceIds: [260], delays: { hitFrames: 0, effectFrames: 6 }, windowFromActivation: true, claim: 'C-0452' },
  // アドミ: II の発動（六角形が II から III に替わるフレーム）から効果（味方全体のリロード速度▲・クリティカルダメージ▲）まで、
  // 味方の会心の発で挟んだ 16〜22f の真ん中の 19f（止まりより前なので動画のフレームと同じ）。窓は遅れた始まりから数える。
  // バーストの倍率ダメージは無い。読み直しの後付けの仮説（2026-10-08 オーナーの判断で入れた）
  { resourceIds: [172], delays: { hitFrames: 0, effectFrames: 19 }, claim: 'C-0479' },
  // ソルジャーE.G.: III の発動からヒットまで 7f（動画で 29f。止まり 22f を含む）。バースト使用時の効果は無い（V-0247・V-0242）
  { resourceIds: [300], delays: { hitFrames: 7, effectFrames: 0 }, claim: 'C-0370' },
  // 雪子: III の発動と同じフレームにヒット（動画では III のタイマーが 00.00 になる 1f 前。フルバーストの入りの止まりの前）。
  // 効果（1more の攻撃力▲・真紅の華の分配ダメージ▲）の遅れは未測定。表に無いときの既定と同じ値で、測った値として置く
  { resourceIds: [871], delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-0419' },
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

/**
 * 効果の窓の終わり（plan/design-burst-effect-window-end.md 案 B）: burstUse で発火する効果の維持フレームから引くフレーム数。
 * 行に windowFromActivation が無ければ 0
 */
export function burstWindowTrimOf(character: DelayKey): number {
  const row = measuredBurstDelayRow(character);
  return row?.windowFromActivation === true ? row.delays.effectFrames : 0;
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
 * 発動にヒットと効果の発火のフレームを書く。遅れは発動の印（I・II は六角形の替わり目。hexagonFrameOf）に足す。
 * 遅れ 0 の欄は書かない（hitFrameOf・effectFrameOf が本当の発動のフレームを返す）。
 * 分かれたヒットは hitOffsets を写す（1 ヒットなら書かない）
 */
export function withBurstDelays(activation: BurstActivation, delays: Readonly<BurstDelays>): BurstActivation {
  const out = { ...activation };
  const origin = hexagonFrameOf(activation);
  if (delays.hitFrames > 0) out.hitFrame = origin + delays.hitFrames;
  if (delays.effectFrames > 0) out.effectFrame = origin + delays.effectFrames;
  if (isSplit(delays)) out.hitOffsets = [...delays.hitOffsets!];
  return out;
}
