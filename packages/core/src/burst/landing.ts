// バーストの発動から、バーストの倍率ダメージのヒットと、
// 「バーストスキルを使用した時」の効果の発火までの遅れ（キャラごとの実測値。ゲーム内の時間 = モデルのフレーム。plan/design-burst-landing.md 2 節）。
// 表に無いキャラは 0（発動と同じフレーム。未測定）。チェーン・CT・フルバーストの窓は発動のフレームのまま。
// 遅れの起点は録画で読んだ発動の印: I・II は右のバースト欄の六角形の替わり目（本当の発動の HEXAGON_AFTER_ACTIVATION_FRAMES 後）、
// III はタイマーの 00.00（本当の発動の FULL_BURST_AFTER_ACTIVATION_FRAMES 後。フルバーストの窓の始まり）。どちらも hexagonFrameOf。
// III のタイマーの 00.00 の後にはフルバーストの入りの止まり（22f）がある。録画の動画のフレームは止まりを含むが、
// 表の値は止まりを引いた値（ゲーム内の時間）。各行の数値と読み方は、その行の claim の結論にある。
// 遅れ 0 の効果は本当の発動のまま、遅れ 0 の III のヒットは 00.00（hitFrameOf。plan/design-burst-hit-origin.md 8 節）。
// バースト使用時の効果の付き始めは実機ではキャラごとに違い（本当の発動の頃・表示の 1〜2f 前・表示の 0〜1f 後。V-0399）、
// 表に行の無いキャラは実機より 0〜6f 早く付くことがある。数 f の差は直さない（plan/burst-effect-delay-candidates.md 2.7 節の案 C）。
// 1 回の発動の倍率ダメージが間をあけた複数のヒットに分かれるキャラは、
// 1 ヒット目からのずれの列（hitOffsets）を持ち、倍率を等分して各ヒットに出す（plan/design-burst-split-hits.md）。
import type { CharacterData } from '../types.ts';
import { hexagonFrameOf, type BurstActivation } from './schedule.ts';

export type BurstDelays = {
  /** 発動の印（hexagonFrameOf）→ バーストの倍率ダメージ（burstDamage）の 1 ヒット目 */
  hitFrames: number;
  /** 発動の印（hexagonFrameOf）→ 自分の burstUse・{ count: burstUse } のトリガーの発火 */
  effectFrames: number;
  /** 1 ヒット目から各ヒットまでのずれ（昇順・先頭は 0）。省略は [0]（1 ヒット） */
  hitOffsets?: readonly number[];
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 2 節）: 遅れの起点。省略（'mark'）は発動の印（hexagonFrameOf）、
   * 'activation' は本当の発動。表の行は書かない（比べる設定の burstDelays の上書きだけが使う）
   */
  origin?: 'mark' | 'activation';
};

export type MeasuredBurstDelayRow = {
  resourceIds: readonly number[];
  /** true なら、burst が宝物版のとき（宝物の段階が burst まで解放したとき）だけ当てる */
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

/** 実測値の表。1 行に根拠の結論の ID を添える。注記はキャラ名と、値から読めないことだけ（skills-guide.md 1.4 節） */
export const MEASURED_BURST_DELAYS: readonly MeasuredBurstDelayRow[] = [
  // イサベル
  { resourceIds: [231], delays: { hitFrames: 134, effectFrames: 134 }, claim: 'C-0165' },
  // ヘルム（宝物あり）: 効果（チャージダメージ倍率▲）はフルバーストの始まりの表示より前に発火するが、モデルは発動より前に
  // 置けないので 0。宝物なしは未測定（plan/design-burst-split-hits.md 7 節の論点 4）
  { resourceIds: [352], treasure: true, delays: { hitFrames: 59, effectFrames: 0 }, claim: 'C-0167' },
  // エレグ: ブームインストールはヒットから付く（トリガー burstHit。plan/design-elegg.md 8.9 節）。この編成では II から III の
  // 00.00 までがどの回も同じで、ヒットが II の発動に結び付くか III の 00.00 に結び付くかは見分けていない
  { resourceIds: [500], delays: { hitFrames: 30, effectFrames: 0 }, claim: 'C-0689' },
  // エレグ：ブーム・アンド・ショック: burstDamage は持たない（順番の攻撃のヒットは damage の delayFrames）。効果は 00.00 から
  // 順番の攻撃の 1 ヒット目までの間に発火する。遅れ 0 は本当の発動（00.00 の 6f 前）になるので、範囲の中の 1f にした
  { resourceIds: [502], delays: { hitFrames: 6, effectFrames: 1 }, claim: 'C-1315' },
  // マリアン：クイーン
  { resourceIds: [19], sameActivationBuffsOnHit: true, delays: { hitFrames: 5, effectFrames: 0 }, claim: 'C-0742' },
  // ギロチン: 追加ダメージ（burst の effects[1]）もヒットと同じフレームに出る
  { resourceIds: [180], delays: { hitFrames: 105, effectFrames: 105 }, claim: 'C-1372' },
  // レイ（仮称）: フルバーストの開始の▲（S2 の攻撃力▲）はヒットに乗らない
  { resourceIds: [834], sameActivationBuffsOnHit: true, delays: { hitFrames: 11, effectFrames: 0 }, claim: 'C-1295' },
  // ベスティー：タクティカル・アップ
  { resourceIds: [94], sameActivationBuffsOnHit: true, delays: { hitFrames: 17, effectFrames: 0 }, claim: 'C-0807' },
  // クエンシー：エスケープクイーン
  {
    resourceIds: [403],
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 11, effectFrames: 0, hitOffsets: [0, 19] },
    claim: 'C-1011',
  },
  // ココア（バーストの倍率ダメージは無い）
  { resourceIds: [311], delays: { hitFrames: 0, effectFrames: 20 }, claim: 'C-0980' },
  // I-DOLL・フラワー（バースト使用時の効果は無い）
  { resourceIds: [304], delays: { hitFrames: 14, effectFrames: 0 }, claim: 'C-0220' },
  // ドラー
  { resourceIds: [202], delays: { hitFrames: 113, effectFrames: 113 }, claim: 'C-1217' },
  // エクシア（宝物あり）: フルスタックの時の追加ダメージもヒットと同じフレームに出る。宝物なしは未測定
  { resourceIds: [210], treasure: true, delays: { hitFrames: 91, effectFrames: 91 }, claim: 'C-1191' },
  // センチ（宝物あり）: 効果（防御力▼）の付き始めは 24〜44f のうち、2 ヒット目と同じ 28f にした。宝物なしは未測定
  {
    resourceIds: [80],
    treasure: true,
    delays: { hitFrames: 12, effectFrames: 28, hitOffsets: [0, 16] },
    claim: 'C-1221',
  },
  // ロザンナ（宝物あり）: 隠れ身の時の追加ダメージもヒットと同じフレームに出る。宝物なしは未測定
  { resourceIds: [280], treasure: true, delays: { hitFrames: 34, effectFrames: 34 }, claim: 'C-1207' },
  // ニヒリスター: 火傷の付与（1 回目の tick を含む。C-0101）もヒットと同じフレーム
  { resourceIds: [261], delays: { hitFrames: 9, effectFrames: 9 }, claim: 'C-0219' },
  // ノワール: 効果（SG の味方の命中率▲）の遅れは未測定。最小構成でない録画の仮説（オーナーの判断で入れている）
  { resourceIds: [271], delays: { hitFrames: 72, effectFrames: 0 }, claim: 'C-0226' },
  // ラピ: 効果（自分の攻撃力▲）の遅れは未測定。最小構成でない録画の仮説（オーナーの判断で入れている）
  { resourceIds: [10], delays: { hitFrames: 90, effectFrames: 0, hitOffsets: [0, 7, 14] }, claim: 'C-0227' },
  // ドレイク（宝物あり）: 効果はヒットより前に付き、止まりの明けの 1f 後の発にも乗る（C-0420）ので 0。宝物なしは未測定
  {
    resourceIds: [101],
    treasure: true,
    delays: { hitFrames: 4, effectFrames: 0, hitOffsets: [0, 27, 55] },
    claim: 'C-0228',
  },
  // ユニ（バースト使用時の効果は無い）: 最小構成でない録画の仮説（オーナーの判断で入れている）
  { resourceIds: [160], delays: { hitFrames: 124, effectFrames: 0 }, claim: 'C-0230' },
  // クイーン（真）: 効果（自分の攻撃力▲）の遅れは未測定。最小構成でない録画の仮説（オーナーの判断で入れている）
  { resourceIds: [870], delays: { hitFrames: 1, effectFrames: 0 }, claim: 'C-0231' },
  // レイヴン: 効果（A.N.モードの持続ダメージ▲）はヒットより前に付き、止まりの明けの後の最初の S1 の tick から乗る（C-0421）ので 0
  { resourceIds: [851], delays: { hitFrames: 43, effectFrames: 0 }, claim: 'C-0233' },
  // レイ
  { resourceIds: [831], sameActivationBuffsOnHit: true, delays: { hitFrames: 46, effectFrames: 0 }, claim: 'C-1067' },
  // マナ（バーストの倍率ダメージは無い）: 効果の持続ダメージは、付与と 1 回目の tick が同じフレーム
  { resourceIds: [290], delays: { hitFrames: 0, effectFrames: 2 }, claim: 'C-0301' },
  // モダニア（バーストの倍率ダメージは無い）: モデルの使用武器変更は効果の発火の次のフレームから撃つので、効果は殲滅モードの
  // 最初の発の 1f 前にした。止まりの明けから殲滅モードの最初の発まで撃たないことはモデルに無い（定義の burst の notes）
  { resourceIds: [260], delays: { hitFrames: 0, effectFrames: 6 }, windowFromActivation: true, claim: 'C-0452' },
  // アドミ（バーストの倍率ダメージは無い）: 効果の付き始めは、味方の会心の発で挟んだ 16〜22f の真ん中にした
  { resourceIds: [172], delays: { hitFrames: 0, effectFrames: 19 }, claim: 'C-0479' },
  // サクラ（バーストの倍率ダメージは無い）: ▲は発火の次のフレームの発から乗る
  { resourceIds: [282], delays: { hitFrames: 0, effectFrames: 49 }, claim: 'C-1470' },
  // グレイブ（バーストの倍率ダメージは無い）
  { resourceIds: [514], delays: { hitFrames: 0, effectFrames: -1 }, claim: 'C-1119' },
  // アスカ：WILLE（バーストの倍率ダメージは無い）
  { resourceIds: [835], delays: { hitFrames: 0, effectFrames: -1 }, claim: 'C-1262' },
  // ソルジャーE.G.（バースト使用時の効果は無い）
  { resourceIds: [300], delays: { hitFrames: 7, effectFrames: 0 }, claim: 'C-0370' },
  // ハラン（バースト使用時の効果は無い）
  { resourceIds: [230], delays: { hitFrames: 23, effectFrames: 0 }, claim: 'C-1543' },
  // エヌ：ミラクルフェアリー（バーストの倍率ダメージは無い）: 効果の付き始めは 20〜21f のうち 21f にした。回復（burst の effects[0]）も同じフレームに置く（見ていない）
  { resourceIds: [121], delays: { hitFrames: 0, effectFrames: 21 }, claim: 'C-0596' },
  // ミハラ：ボンディングチェーン（バーストの倍率ダメージは無い）: 効果のプリング・チェーンは、付与と 1 回目の tick が同じフレーム
  { resourceIds: [162], delays: { hitFrames: 0, effectFrames: -1 }, claim: 'C-0746' },
  // 雪子: 効果（1more の攻撃力▲・真紅の華の分配ダメージ▲）の遅れは未測定。表に無いときの既定と同じ値で、測った値として置く
  { resourceIds: [871], delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-0419' },
  // ミハラ: 効果（S2 のペインロード 1・2）の遅れは未測定。追加ダメージ（burst の effects[1]）は perBurstHit で 3 ヒットのそれぞれに出る
  { resourceIds: [161], delays: { hitFrames: 17, effectFrames: 0, hitOffsets: [0, 10, 22] }, claim: 'C-0575' },
  // ソリン（バースト使用時の効果は無い）: 追加ダメージ（burst の effects[1]）は perBurstHit で 3 ヒットのそれぞれに出る
  { resourceIds: [71], delays: { hitFrames: 17, effectFrames: 0, hitOffsets: [0, 20, 51] }, claim: 'C-1113' },
  // ブリッド（バースト使用時の効果は無い）: 追加ダメージ（burst の effects[1]）は perBurstHit でヒットと同じフレームに出る
  { resourceIds: [70], delays: { hitFrames: 41, effectFrames: 0 }, claim: 'C-1408' },
  // プリバティ（宝物あり）: 宝物なしは未測定
  {
    resourceIds: [170],
    treasure: true,
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 40, effectFrames: 0, hitOffsets: [0, 25, 55] },
    claim: 'C-0923',
  },
  // ソーダ：トゥインクルバニー: 効果（命中率▲・攻撃力▲・ゴールデンチップの減少）はヒットより前に付く（発動から約 0.4 秒の一時停止画面で付いていた）ので 0
  { resourceIds: [314], sameActivationBuffsOnHit: true, delays: { hitFrames: 96, effectFrames: 0 }, claim: 'C-0581' },
  // ナユタ
  {
    resourceIds: [223],
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 55, effectFrames: 0 },
    claim: 'C-0938',
  },
  // アルカナ: ヒットに乗るのは同じ発動の運命の輪のカード（攻撃ダメージ▲）か審判のカード（受けるダメージ▲）の 10%（値が同じで分けられない）
  { resourceIds: [581], sameActivationBuffsOnHit: true, delays: { hitFrames: 77, effectFrames: 0 }, claim: 'C-1051' },
  // ルドミラ: 効果（防御力▲。間接）の遅れは未測定
  { resourceIds: [190], delays: { hitFrames: 73, effectFrames: 0 }, claim: 'C-0675' },
  // ウンファ
  { resourceIds: [92], delays: { hitFrames: -1, effectFrames: 0 }, claim: 'C-1379' },
  // アイギス: 効果（S2 のパピヨンハート）の遅れは未測定
  { resourceIds: [872], delays: { hitFrames: -1, effectFrames: 0 }, claim: 'C-1607' },
  // ルピー
  { resourceIds: [200], delays: { hitFrames: 89, effectFrames: 0 }, claim: 'C-1421' },
  // ベロータ: ヒットは 15〜16f のうち 16f にした。効果（味方全体のチャージ速度▲）の遅れは未測定
  { resourceIds: [60], delays: { hitFrames: 16, effectFrames: 0 }, claim: 'C-0677' },
  // プリム（基礎版・宝物版）: 撮ったのは宝物版で、基礎版は同じとみなす（C-1461）。効果（防御力▼・防御力無視ダメージ▲）の発火のフレームは確かめていない
  { resourceIds: [142], delays: { hitFrames: 8, effectFrames: 0, hitOffsets: [0, 17, 39] }, claim: 'C-1460' },
  // シグナル: 効果（敵の防御力▼）は 3 ヒットのそれぞれが付け直す（トリガー burstHit。C-1405）
  { resourceIds: [22], delays: { hitFrames: 15, effectFrames: 15, hitOffsets: [0, 6, 11] }, claim: 'C-1402' },
  // ミカ: 効果（敵の防御力▼）の付き始めは印の −27〜54f までしか挟めず、1 ヒット目と同じ 28f にした。2 ヒットのそれぞれが付け直す（トリガー burstHit。C-1519）
  { resourceIds: [61], delays: { hitFrames: 28, effectFrames: 28, hitOffsets: [0, 35] }, claim: 'C-1516' },
  // バイパー（基礎版・宝物版）: 効果（敵の防御力▼）はヒットから付く（トリガー burstHit）。撮ったのは基礎版で、宝物版は同じとみなす。
  // 宝物版の持続ダメージ（burstUse）の発火のフレームは確かめていない
  { resourceIds: [112], delays: { hitFrames: 58, effectFrames: 0 }, claim: 'C-1613' },
  // ラプラス：アルティメットヒーロー
  { resourceIds: [103], sameActivationBuffsOnHit: true, delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-0683' },
  // シンデレラ：クリスタルウェーブ
  { resourceIds: [515], sameActivationBuffsOnHit: true, delays: { hitFrames: 0, effectFrames: 0 }, claim: 'C-1251' },
  // ドレイク：グレイトヴィラン
  { resourceIds: [104], sameActivationBuffsOnHit: true, delays: { hitFrames: 68, effectFrames: 0 }, claim: 'C-1430' },
  // プリバティ：アンカインド・メイド
  {
    resourceIds: [313],
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 26, effectFrames: 0, hitOffsets: [0, 21] },
    claim: 'C-0680',
  },
  // エマ（バーストの倍率ダメージは無い）: 回復の付き始めは 19〜21f のうち 20f にした
  { resourceIds: [90], delays: { hitFrames: 0, effectFrames: 20 }, claim: 'C-0687' },
  // シンデレラ: 倍率は回数倍（burstDamage の hitsRef）で、等分した各ヒットが説明文の値。追加ダメージ（burst の effects[1]）は
  // perBurstHit で 10 ヒットのそれぞれに出る
  {
    resourceIds: [511],
    delays: { hitFrames: 54, effectFrames: 0, hitOffsets: [0, 12, 24, 35, 47, 59, 71, 82, 94, 106] },
    claim: 'C-0655',
  },
  // イヴ: 各ヒットが説明文の値（burstDamage の hitsRef）
  {
    resourceIds: [850],
    delays: { hitFrames: 22, effectFrames: 0, hitOffsets: [0, 12, 24, 35, 47, 59] },
    claim: 'C-1323',
  },
  // ラプラス（宝物あり）: 使用武器変更（ビーム）は効果の発火の次のフレームから撃つので、効果は最初の発の 1f 前にした。宝物なしは未測定
  {
    resourceIds: [100],
    treasure: true,
    delays: { hitFrames: 7, effectFrames: 5 },
    windowFromActivation: true,
    claim: 'C-1204',
  },
  // ヘルム：アクアマリン: 電撃の敵への追加ダメージ（burst の effects[1]。burstUse）もヒットと同じフレームに出る
  { resourceIds: [353], delays: { hitFrames: 64, effectFrames: 64 }, claim: 'C-1061' },
  // ジュリア（宝物あり）: フルスタックの追加ダメージ（burst の effects[1]。perBurstHit）も各ヒットと同じフレームに出る。宝物なしは未測定
  {
    resourceIds: [150],
    treasure: true,
    delays: { hitFrames: 5, effectFrames: 0, hitOffsets: [0, 12, 24, 36, 47] },
    claim: 'C-1329',
  },
  // サクラ：ブルーム・イン・サマー: 持続ダメージ（burst の effects[1]。perBurstHit）は各ヒットのフレームで 1 スタックずつ付く
  {
    resourceIds: [284],
    delays: { hitFrames: 20, effectFrames: 0, hitOffsets: [0, 12, 24, 35, 47, 59, 71, 82, 94, 106] },
    claim: 'C-1586',
  },
  // メイデン：アイスローズ: ヒットの数は MP（burstDamage の hitsFrom）で、表は上限の 12 個。10 個目からは読んでいない（6f おきとみた）
  {
    resourceIds: [183],
    delays: { hitFrames: 40, effectFrames: 0, hitOffsets: [0, 6, 11, 17, 23, 29, 35, 41, 47, 53, 59, 65] },
    claim: 'C-1496',
  },
  // エピネル
  { resourceIds: [241], delays: { hitFrames: 39, effectFrames: 0 }, claim: 'C-1361' },
  // 2B: S1 の最大HP▲（{ count: burstUse }）の付き始めは 14〜18f のうち、ヒットと同じ 15f にした
  { resourceIds: [810], delays: { hitFrames: 15, effectFrames: 15 }, claim: 'C-1375' },
  // キロ
  { resourceIds: [361], delays: { hitFrames: 16, effectFrames: 0 }, claim: 'C-1382' },
  // プロダクト12（バースト使用時の効果は無い）
  { resourceIds: [303], delays: { hitFrames: 7, effectFrames: 0 }, claim: 'C-1526' },
  // クロウ（バースト使用時の効果は無い）
  { resourceIds: [110], delays: { hitFrames: 5, effectFrames: 0 }, claim: 'C-1401' },
  // ユルハ（バースト使用時の効果は無い）
  { resourceIds: [171], delays: { hitFrames: 116, effectFrames: 0, hitOffsets: [0, 7] }, claim: 'C-1437' },
  // メイデン（バースト使用時の効果は無い）
  { resourceIds: [181], delays: { hitFrames: 20, effectFrames: 0 }, claim: 'C-1485' },
  // ノベル
  { resourceIds: [212], delays: { hitFrames: 80, effectFrames: 80 }, claim: 'C-1450' },
  // ヤン（バースト使用時の効果は無い）: ヒットは動画で 0〜1f のうち 1f にした
  { resourceIds: [201], delays: { hitFrames: 1, effectFrames: 0 }, claim: 'C-1457' },
  // ペッパー
  { resourceIds: [131], delays: { hitFrames: 84, effectFrames: 0 }, claim: 'C-1463' },
  // アンカー（バースト使用時の効果は無い）
  { resourceIds: [351], delays: { hitFrames: 8, effectFrames: 0, hitOffsets: [0, 8, 15, 20, 28] }, claim: 'C-1574' },
  // ソーダ: 効果（スタック量▲）の遅れは未測定
  { resourceIds: [312], delays: { hitFrames: 65, effectFrames: 0 }, claim: 'C-1472' },
  // マリ
  { resourceIds: [832], delays: { hitFrames: 69, effectFrames: 0 }, claim: 'C-1483' },
  // デルタ：ニンジャシーフ: II の発動（六角形が II から III に替わるフレーム）から分配ダメージの 1 ヒットまで 3f（2 本の 10 回のうち 9 回。
  // 1 回は 2f）。ヒットに同じ発動の burst スロットの▲（分配ダメージ▲・発動者基準の攻撃力▲）が乗り、S1 のバースト使用時の▲は乗らない
  // （同じ発動の▲がヒットに乗る行）。バースト使用時の効果（攻撃力▲）は替わり目の 1〜2f 後から乗るので 1f。S1 のハイパーアシッドボムは
  // 替わり目の 7f 後から乗るが、この行の遅れで揃える（数 f の差は直さない）
  {
    resourceIds: [23],
    sameActivationBuffsOnHit: true,
    delays: { hitFrames: 3, effectFrames: 1 },
    claim: 'C-1582',
  },
  // アニス
  { resourceIds: [12], delays: { hitFrames: 93, effectFrames: 93 }, claim: 'C-1615' },
  // ネロ: 効果（挑発・受ける HP 回復量▲）の遅れは未測定
  { resourceIds: [380], delays: { hitFrames: 51, effectFrames: 0 }, claim: 'C-1616' },
];

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 2.2 節）: 遅れの表の上書き。row が null なら表の行を外す（遅れ 0）。
 * treasure が true なら、burst が宝物版のときだけ当てる（そうでなければ表のまま）
 */
export type BurstDelayOverride = { treasure?: boolean; row: MeasuredBurstDelayRow | null };

type DelayKey = Pick<CharacterData, 'resourceId' | 'skills' | 'treasure' | 'burstDelayOverride'>;

/** burst が宝物版か（applyTreasure が skills.burst を宝物版のスキルに差し替えたか） */
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

/** 2 つ以上のヒットに分かれるか */
export function isSplit(delays: Readonly<BurstDelays>): boolean {
  return (delays.hitOffsets?.length ?? 1) > 1;
}

/**
 * 発動にヒットと効果の発火のフレームを書く。遅れは発動の印（I・II は六角形の替わり目。hexagonFrameOf）に足す。
 * 遅れ 0 の欄は書かない（hitFrameOf・effectFrameOf が本当の発動のフレームを返す）。
 * 分かれたヒットは hitOffsets を写す（1 ヒットなら書かない）。
 * 遅れは負でもよい（plan/design-compare-setup-extension.md 2.3 節）。origin が 'activation' なら本当の発動に足し、
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
