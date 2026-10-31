// バーストの着弾編（plan/design-burst-landing.md 2 節）: バーストの発動から、バーストの倍率ダメージのヒットと、
// 「バーストスキルを使用した時」の効果の発火までの遅れ（キャラごとの実測値。ゲーム内の時間 = モデルのフレーム）。
// 表に無いキャラは 0（発動と同じフレーム。未測定）。チェーン・CT・フルバーストの窓は発動のフレームのまま。
// 遅れの起点は録画で読んだ発動の印: I・II は右のバースト欄の六角形の替わり目（本当の発動の HEXAGON_AFTER_ACTIVATION_FRAMES 後）、
// III はタイマーの 00.00（本当の発動の FULL_BURST_AFTER_ACTIVATION_FRAMES 後。フルバーストの窓の始まり）。どちらも hexagonFrameOf。
// 遅れ 0 の効果は本当の発動のまま、遅れ 0 の III のヒットは 00.00（hitFrameOf。plan/design-burst-hit-origin.md 8 節）。
// バースト使用時の効果の付き始めは実機ではキャラごとに違い（本当の発動の頃・表示の 1〜2f 前・表示の 0〜1f 後。V-0399）、
// 表に行の無いキャラは実機より 0〜6f 早く付くことがある。数 f の差は直さない（plan/burst-effect-delay-candidates.md 2.7 節の案 C）。
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
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 2 節）: 遅れの起点。省略（'mark'）は発動の印（hexagonFrameOf）、
   * 'activation' は本当の発動。表の行は書かない（比べる設定の burstDelays の上書きだけが使う）
   */
  origin?: 'mark' | 'activation';
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
  /**
   * 同じ発動の▲がヒットに乗る（plan/design-burst-landing.md 10 節の案 1）: true なら、バーストの倍率ダメージのヒットに、
   * 発動の直前のバフ（burstHitBuffs）に加えて、同じ発動で自分に付いた burst スロットの効果を足す。書かない行は乗せない（6 節の 5）
   */
  sameActivationBuffsOnHit?: true;
  delays: BurstDelays;
  claim: string;
};

const NO_DELAYS: Readonly<BurstDelays> = Object.freeze({ hitFrames: 0, effectFrames: 0 });

/** 実測値の表。1 行に根拠の結論の ID を添える（skills-guide.md 1.4 節） */
export const MEASURED_BURST_DELAYS: readonly MeasuredBurstDelayRow[] = [
  // イサベル: III のタイマーの 00.00 からヒットと効果の発火まで、どちらも 134f（動画で 156f。フルバーストの入りの止まり 22f を含む）
  { resourceIds: [231], delays: { hitFrames: 134, effectFrames: 134 }, claim: 'C-0165' },
  // ヘルム（宝物あり）: III のタイマーの 00.00 からヒットまで 59f（動画で 80〜81f。止まり 22f を含む）。効果（チャージダメージ倍率▲）は
  // フルバーストの始まりの表示より 2〜35f 前に発火する。モデルは発動より前に置けないので 0（発動と同じフレーム）。
  // 宝物なしは未測定（plan/design-burst-split-hits.md 7 節の論点 4）
  { resourceIds: [352], treasure: true, delays: { hitFrames: 59, effectFrames: 0 }, claim: 'C-0167' },
  // エレグ: II の発動（六角形の替わり目）からヒットまで 30f（動画で 51f。III の 00.00 の後のフルバーストの入りの止まり 22f を含み、
  // 止まりが明ける所に出る）。バースト使用時の効果（分配ダメージ▲）は遅れ 0。ブームインストールはヒットから付く（トリガー burstHit。
  // plan/design-elegg.md 8.9 節）。この編成では II から III の 00.00 までがどの回も同じで、ヒットが II の発動に結び付くか III の 00.00 に
  // 結び付くかは見分けていない
  { resourceIds: [500], delays: { hitFrames: 30, effectFrames: 0 }, claim: 'C-0689' },
  // マリアン：クイーン: III のタイマーの 00.00 からヒットまで 5f（動画で 27f。止まり 22f を含む）。バーストスキルダメージには同じ発動の
  // 攻撃力▲・攻撃ダメージ▲が乗る（同じ発動の▲がヒットに乗る行。C-0582 と同じ形）。効果の発火の遅れは 0
  { resourceIds: [19], sameActivationBuffsOnHit: true, delays: { hitFrames: 5, effectFrames: 0 }, claim: 'C-0742' },
  // I-DOLL・フラワー: I の発動（六角形が I から II に替わるフレーム。本当の発動の 5f 後）からヒットまで 14f。バースト使用時の効果は無い
  { resourceIds: [304], delays: { hitFrames: 14, effectFrames: 0 }, claim: 'C-0220' },
  // ニヒリスター: II の発動（六角形の替わり目）からヒットと火傷の付与（1 回目の tick はヒットと同じフレーム。C-0101）まで、どちらも 9f
  { resourceIds: [261], delays: { hitFrames: 9, effectFrames: 9 }, claim: 'C-0219' },
  // ノワール: III のタイマーの 00.00 からヒットまで 72f（動画で 93〜94f。止まり 22f を含む）。効果（SG の味方の命中率▲）の遅れは未測定。
  // 録画が最小構成でない（エーテルの定義が無い）仮説だが、オーナーの判断で入れた（2026-10-04）
  { resourceIds: [271], delays: { hitFrames: 72, effectFrames: 0 }, claim: 'C-0226' },
  // ラピ: III のタイマーの 00.00 から 1 ヒット目まで 90f（動画で 111〜112f の最も多い値。止まり 22f を含む）、7f おきの 3 ヒット。
  // 効果（自分の攻撃力▲）の遅れは未測定。最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [10], delays: { hitFrames: 90, effectFrames: 0, hitOffsets: [0, 7, 14] }, claim: 'C-0227' },
  // ドレイク（宝物あり）: III のタイマーの 00.00 から 1 ヒット目まで 4f（動画で 26〜27f の最も多い値）、2・3 ヒット目は 27f・55f 後。
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
  // クイーン（真）: III のタイマーの 00.00 からヒットまで 1f（動画で 22〜23f。止まり 22f を含む）。効果（自分の攻撃力▲）の遅れは未測定。
  // 最小構成でない録画の仮説（2026-10-04 オーナーの判断で入れた）
  { resourceIds: [870], delays: { hitFrames: 1, effectFrames: 0 }, claim: 'C-0231' },
  // レイヴン: III のタイマーの 00.00 からヒットまで 43f（動画で 64〜65f。止まり 22f を含む）。効果（A.N.モードの持続ダメージ▲）はヒットより前に
  // 付き、止まりの明けの後の最初の S1 の tick から乗る（C-0421）ので 0
  { resourceIds: [851], delays: { hitFrames: 43, effectFrames: 0 }, claim: 'C-0233' },
  // マナ: III のタイマーの 00.00 から効果（持続ダメージの付与と 1 回目の tick・持続ダメージ▲）まで 2f（動画で 24f。止まり 22f を含む）。
  // バーストの倍率ダメージは無い
  { resourceIds: [290], delays: { hitFrames: 0, effectFrames: 2 }, claim: 'C-0301' },
  // モダニア: III のタイマーの 00.00 から殲滅モードの最初の発まで 7f（動画で 28〜29f。止まり 22f を含む）。モデルの使用武器変更は効果の発火の
  // 次のフレームから撃つので、効果（殲滅モード・装弾数無限）の発火は 6f。バーストの倍率ダメージは無い。止まりの明けから殲滅モードの
  // 最初の発まで撃たないことはモデルに無い（定義の burst の notes）
  // 窓の終わりは発動から数える（実測の最後の発は後ろにずれない。plan/design-burst-effect-window-end.md）
  { resourceIds: [260], delays: { hitFrames: 0, effectFrames: 6 }, windowFromActivation: true, claim: 'C-0452' },
  // アドミ: II の発動（六角形が II から III に替わるフレーム）から効果（味方全体のリロード速度▲・クリティカルダメージ▲）まで、
  // 味方の会心の発で挟んだ 16〜22f の真ん中の 19f（止まりより前なので動画のフレームと同じ）。窓は遅れた始まりから数える。
  // バーストの倍率ダメージは無い。録画 0042 の読み直しで値を出し、録画 0400（撮る前に予測を固定。V-0388）で再現した
  { resourceIds: [172], delays: { hitFrames: 0, effectFrames: 19 }, claim: 'C-0479' },
  // ソルジャーE.G.: III のタイマーの 00.00 からヒットまで 7f（動画で 29f。止まり 22f を含む）。バースト使用時の効果は無い（V-0247・V-0242）
  { resourceIds: [300], delays: { hitFrames: 7, effectFrames: 0 }, claim: 'C-0370' },
  // エヌ：ミラクルフェアリー: II の発動（六角形が II から III に替わるフレーム）から効果（火力型の味方の攻撃力▲）まで、
  // ソルジャーE.G. の 1 ヒットで挟んだ 20〜21f のうち 21f（止まりより前なので動画のフレームと同じ）。窓は遅れた始まりから数える。
  // 回復（burst の effects[0]）も同じフレームに置く（見ていない）。バーストの倍率ダメージは無い（V-0457）
  { resourceIds: [121], delays: { hitFrames: 0, effectFrames: 21 }, claim: 'C-0596' },
  // ミハラ：ボンディングチェーン: 効果（プリング・チェーンの付与と 1 回目の tick・チェーンバインドの消去）は III のタイマーの 00.00 の 1f 前
  // （動画でも 1f 前。1 回目の tick にフルバースト補正が乗らない）。バーストの倍率ダメージは無い（V-0547）
  { resourceIds: [162], delays: { hitFrames: 0, effectFrames: -1 }, claim: 'C-0746' },
  // 雪子: III のタイマーの 00.00（hitFrameOf）にヒット（動画では 00.00 の 1f 前。フルバーストの入りの止まりの前）。
  // 効果（1more の攻撃力▲・真紅の華の分配ダメージ▲）の遅れは未測定。表に無いときの既定と同じ値で、測った値として置く
  { resourceIds: [871], delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-0419' },
  // ミハラ: III のタイマーの 00.00 から 1 ヒット目まで 17f（動画で 39f の最も多い値。止まり 22f を含む。C-0575）、2・3 ヒット目は
  // 10f・22f 後で、バーストスキルダメージを 3 等分する（C-0564）。効果（S2 のペインロード 1・2）の遅れは未測定。
  // 追加ダメージ（burst の effects[1]）は perBurstHit で 3 ヒットのそれぞれに出る（C-0565）
  { resourceIds: [161], delays: { hitFrames: 17, effectFrames: 0, hitOffsets: [0, 10, 22] }, claim: 'C-0575' },
  // ソーダ：トゥインクルバニー: III のタイマーの 00.00 からヒットまで 96f（動画で 118f。止まり 22f を含む。一時停止の無い 1 回の読み）。
  // 効果（命中率▲・攻撃力▲・ゴールデンチップの減少）はヒットより前に付く（発動から約 0.4 秒の一時停止画面で付いていた）ので 0。
  // ヒットに同じ発動の攻撃力▲が乗る（C-0582。ラピ・ヘルム・イサベルは乗らない）
  { resourceIds: [314], sameActivationBuffsOnHit: true, delays: { hitFrames: 96, effectFrames: 0 }, claim: 'C-0581' },
  // シンデレラ: 「10 回順番に攻撃」。III のタイマーの 00.00 から 1 ヒット目まで 54f（動画で 76f の最も多い値。止まり 22f を含む）、
  // 2 ヒット目以降は 1 ヒット目から約 12f おき（録画 0480 の 5 回の中央値）。バーストの倍率は回数倍（burstDamage の hitsRef）なので、
  // 等分した各ヒットが説明文の値（C-0654）。追加ダメージ（burst の effects[1]）は perBurstHit で 10 ヒットのそれぞれに出る（C-0656）
  // ルドミラ: I の発動（六角形が I から II に替わるフレーム）からヒットまで、動画で 96f（印からの動画のフレーム。hitFrames は本当の発動からの
  // ゲーム内のフレームで 73）。バースト使用時の効果（防御力▲。間接）の遅れは未測定（V-0509）
  { resourceIds: [190], delays: { hitFrames: 73, effectFrames: 0 }, claim: 'C-0675' },
  // ベロータ: II の発動（六角形が II から III に替わるフレーム）からヒットまで 15〜16f。効果（味方全体のチャージ速度▲）の遅れは未測定（V-0510）
  { resourceIds: [60], delays: { hitFrames: 16, effectFrames: 0 }, claim: 'C-0677' },
  // ラプラス：アルティメットヒーロー: III のタイマーの 00.00 の 1〜2f 前にヒット（雪子と同じく遅れ 0）。ヒットに同じ発動の攻撃力▲が乗る
  // （C-0682。ソーダ：トゥインクルバニーと同じ印）
  { resourceIds: [103], sameActivationBuffsOnHit: true, delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-0683' },
  // プリバティ：アンカインド・メイド: III のタイマーの 00.00 から 1 ヒット目まで 26f（動画で 48〜49f。止まり 22f を含む）、2 ヒット目は 21f 後で、
  // バーストスキルダメージを 2 等分する。ヒットに同じ発動の攻撃ダメージ▲・クリティカルダメージ▲が乗る（C-0679）
  {
    resourceIds: [313],
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 26, effectFrames: 0, hitOffsets: [0, 21] },
    claim: 'C-0680',
  },
  // エマ: I の発動（六角形の替わり目）から回復（味方全体の回復と吸収回復）まで 20f（アスカの S1 の付き始めで挟んだ 19〜21f のうち 20f。
  // 1 本の録画の 3 回）。バーストの倍率ダメージは無い（V-0515）
  { resourceIds: [90], delays: { hitFrames: 0, effectFrames: 20 }, claim: 'C-0687' },
  {
    resourceIds: [511],
    delays: { hitFrames: 54, effectFrames: 0, hitOffsets: [0, 12, 24, 35, 47, 59, 71, 82, 94, 106] },
    claim: 'C-0655',
  },
];

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 2.2 節）: 遅れの表の上書き。row が null なら表の行を外す（遅れ 0）。
 * treasure が true なら、burst が宝物版のときだけ当てる（そうでなければ表のまま）
 */
export type BurstDelayOverride = { treasure?: boolean; row: MeasuredBurstDelayRow | null };

type DelayKey = Pick<CharacterData, 'resourceId' | 'skills' | 'treasure' | 'burstDelayOverride'>;

/** 分かれたヒット編: burst が宝物版か（applyTreasure が skills.burst を宝物版のスキルに差し替えたか） */
export function isTreasureBurst(character: DelayKey): boolean {
  const treasureBurst = character.treasure?.skills.burst;
  return treasureBurst !== undefined && character.skills.burst.id === treasureBurst.id;
}

/** 表の行（画面の注記用）。表に無ければ null */
export function measuredBurstDelayRow(character: DelayKey): MeasuredBurstDelayRow | null {
  const override = character.burstDelayOverride;
  if (override !== undefined && (override.treasure !== true || isTreasureBurst(character))) return override.row;
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

/** 同じ発動の▲がヒットに乗るか（plan/design-burst-landing.md 10 節）。表に無ければ false */
export function sameActivationBuffsOnHit(character: DelayKey): boolean {
  return measuredBurstDelayRow(character)?.sameActivationBuffsOnHit === true;
}

/** キャラのバーストの遅れ。表に無ければ 0 */
export function burstDelaysOf(character: DelayKey): Readonly<BurstDelays> {
  return measuredBurstDelayRow(character)?.delays ?? NO_DELAYS;
}

/** 表にあるキャラだけ delays を持たせる（無いキャラの BurstUnit・BurstCandidate は今までと同じ形） */
export function burstDelaysFieldOf(character: DelayKey): { delays?: Readonly<BurstDelays> } {
  const delays = burstDelaysOf(character);
  return delays.hitFrames === 0 && delays.effectFrames === 0 && !isSplit(delays) && delays.origin === undefined
    ? {}
    : { delays };
}

/** 分かれたヒット編: 2 つ以上のヒットに分かれるか */
export function isSplit(delays: Readonly<BurstDelays>): boolean {
  return (delays.hitOffsets?.length ?? 1) > 1;
}

/**
 * 発動にヒットと効果の発火のフレームを書く。遅れは発動の印（I・II は六角形の替わり目。hexagonFrameOf）に足す。
 * 遅れ 0 の欄は書かない（hitFrameOf・effectFrameOf が本当の発動のフレームを返す）。
 * 分かれたヒットは hitOffsets を写す（1 ヒットなら書かない）。
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 2.3 節）: 遅れは負でもよい。origin が 'activation' なら本当の発動に足し、
 * 遅れ 0 の欄も書く。足した後のフレームが本当の発動より前なら RangeError
 */
export function withBurstDelays(activation: BurstActivation, delays: Readonly<BurstDelays>): BurstActivation {
  const out = { ...activation };
  const fromActivation = delays.origin === 'activation';
  const origin = fromActivation ? activation.frame : hexagonFrameOf(activation);
  const at = (d: number, what: string): number => {
    const frame = origin + d;
    if (frame < activation.frame)
      throw new RangeError(
        `burst ${what} delay ${d} puts the frame before the activation (${frame} < ${activation.frame})`,
      );
    return frame;
  };
  if (delays.hitFrames !== 0 || fromActivation) out.hitFrame = at(delays.hitFrames, 'hit');
  if (delays.effectFrames !== 0 || fromActivation) out.effectFrame = at(delays.effectFrames, 'effect');
  if (isSplit(delays)) out.hitOffsets = [...delays.hitOffsets!];
  return out;
}
