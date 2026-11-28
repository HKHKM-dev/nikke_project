// 状態の目録（plan/design-named-state.md 5.1 節）。定義が状態を指すのはこの表の id だけ
// （付与 kind: 'state'・トリガー { applied }・対象の絞り込み targetState・条件 enemyState・dot の state）。
// 目録が持つのは、どの状態か（同一性）・画面の名前・持ち主の側と、中身を書かない敵の状態の印（withoutContents）だけ。スタックの上限・維持・中身は付与に書く（同 3.5 節）。
// id は英語版の説明文の状態名の lowerCamelCase（同 5.1 節の id の付け方）。一度付けた id は変えない
// 状態ごとの注記は、状態名とキャラ・スロットと、定義から読めないことだけ（中身・秒数・スタックは定義。一覧は plan/skill-catalog.md 4.1 節）
import type { LocalizedText } from '../types.ts';

/** 状態を持つ側。ally = 味方の枠、enemy = 敵（1 体の前提） */
export type StateHolder = 'ally' | 'enemy';

/**
 * 状態の家族（plan/design-skill-stage5.md 1.2 節）。条件・きっかけが家族の根（id が家族の名前と同じ状態）を指したら、
 * 家族のどの状態でも当たる（「バリア適用状態なら」は、名前の無いバリアにも名前の付いたバリアにも当たる）
 */
export type StateFamily = 'barrier' | 'intoTheFray';

/**
 * 切り替えの組（plan/design-mint-prika.md 2.2 節）。同じ持ち主に組のある状態が付いたら、組のほかの状態の件を次のフレームで閉じる
 * （解除不可も。skills/holders/fire.ts の fireGrant）。同じフレームに付いた組の状態どうしは、{ applied } のきっかけの付与を後とみなして残す
 */
export type StateSwitchGroup = 'assignedPart' | 'taste';

export type NamedStateInfo = {
  /** 画面と CLI の名前（日本語は説明文の状態名） */
  name: LocalizedText;
  holder: StateHolder;
  /** 家族（任意） */
  family?: StateFamily;
  /**
   * 中身がダメージに関係しない敵の状態（付与に中身を書かない。名前だけを条件が見る）。書かない敵の状態は、どれかの付与が中身を持つ
   * （parse/crossChecks.ts の validateStateGrants）
   */
  withoutContents?: true;
  /**
   * デバフ解除（removeDebuff）で外れる味方の状態（plan/design-debuff-removal.md 2.1 節）。録画で外れると確かめた状態だけに付ける
   */
  debuff?: true;
  /** 切り替えの組（任意） */
  group?: StateSwitchGroup;
};

export const NAMED_STATES = {
  /** ペルソナ（クイーン（真）・雪子の S1） */
  persona: { name: { ja: 'ペルソナ', en: 'Persona' }, holder: 'ally' },
  /** 追撃（雪子の S2） */
  followUp: { name: { ja: '追撃', en: 'Follow Up' }, holder: 'ally' },
  /** バトンタッチ（クイーン（真）の S2） */
  batonPass: { name: { ja: 'バトンタッチ', en: 'Baton Pass' }, holder: 'ally' },
  /** カモフラージュ（ウンファ：タクティカル・アップの S1） */
  camouflage: { name: { ja: 'カモフラージュ', en: 'Camouflage' }, holder: 'ally' },
  /** ハッキング（クルミの S1） */
  hacked: { name: { ja: 'ハッキング', en: 'Hacked' }, holder: 'enemy' },
  /** 私だけの星（アニス：スターの S1） */
  myOwnStar: { name: { ja: '私だけの星', en: 'My Own Star' }, holder: 'ally' },
  /** みんなの星（アニス：スターの S1） */
  everyonesStar: { name: { ja: 'みんなの星', en: "Everyone's Star" }, holder: 'ally' },
  /** シューティングスター（アニス：スターのバースト）。バーストの自動攻撃の呼び名 */
  shootingStar: { name: { ja: 'シューティングスター', en: 'Shooting Star' }, holder: 'ally' },
  /** マターガンマ（マナの S1） */
  metalGamma: { name: { ja: 'マターガンマ', en: 'Metal γ' }, holder: 'ally' },
  /** マターシグマ（マナの S2） */
  metalSigma: { name: { ja: 'マターシグマ', en: 'Metal σ' }, holder: 'ally' },
  /** ペインロード1（ミハラの S2） */
  highwayToHell1: { name: { ja: 'ペインロード1', en: 'Highway to Hell 1' }, holder: 'ally' },
  /** ペインロード2（ミハラの S2） */
  highwayToHell2: { name: { ja: 'ペインロード2', en: 'Highway to Hell 2' }, holder: 'ally' },
  /** ゴールデンチップ（ソーダ：トゥインクルバニーの S1） */
  goldenChip: { name: { ja: 'ゴールデンチップ', en: 'Golden Chip' }, holder: 'ally' },
  /** リラックス（クラウンの S2） */
  relax: { name: { ja: 'リラックス', en: 'Relax' }, holder: 'ally' },
  /**
   * バリア（名前の無いバリア・共用バリアの付与。多くのキャラが付ける）。家族の根で、「バリア適用状態なら」は家族のどのバリアにも当たる
   * （plan/design-skill-stage5.md 1.1 節）
   */
  barrier: { name: { ja: 'バリア', en: 'Barrier' }, holder: 'ally', family: 'barrier' },
  /** ナノコーティング（キロの S1）。被弾で減って壊れる分は扱わない（plan/design-kilo.md 2.1 節） */
  nanoCoating: { name: { ja: 'ナノコーティング', en: 'Nano Coating' }, holder: 'ally', family: 'barrier' },
  /** デコイ（シンデレラの S2）。被弾で壊れる分は扱わない（plan/design-skill-stage6.md 2.4 節）。判定は自分のデコイだけ */
  decoy: { name: { ja: 'デコイ', en: 'Decoy' }, holder: 'ally' },
  /** 美しさ（シンデレラの S2） */
  beauty: { name: { ja: '美しさ', en: 'Beautiful' }, holder: 'ally' },
  /**
   * 代用弾丸（トーブの S1）。弾丸チャージの即時効果の呼び名。維持 0 秒の付与で、付いた記録だけを作る
   * （plan/design-skill-stage4.md 2.1 節）
   */
  emergencyCraftedBullets: { name: { ja: '代用弾丸', en: 'Emergency-Crafted Bullets' }, holder: 'ally' },
  /** 応急改造（トーブの S1） */
  temporaryModification: { name: { ja: '応急改造', en: 'Temporary Modification' }, holder: 'ally' },
  /** その場しのぎの奇跡（トーブの宝物版のバースト） */
  miracleOfMakeshifts: { name: { ja: 'その場しのぎの奇跡', en: 'Miracle of Makeshifts' }, holder: 'ally' },
  /**
   * その場しのぎの奇跡（トーブの宝物版のバースト）のショットガンを所持する味方全体への分。ゲームでは同じ名前の 2 つ目の効果で、
   * ショットガンの味方には味方全体の分と重なって乗る。同じ状態の付与は 1 つの件の列にまとまり中身も 1 つなので、別の状態にする
   */
  miracleOfMakeshiftsShotgun: {
    name: { ja: 'その場しのぎの奇跡（ショットガン）', en: 'Miracle of Makeshifts (Shotgun)' },
    holder: 'ally',
  },
  /** 火力チャージ（ネオン：ビジョン・アイのバースト） */
  firepowerCharge: { name: { ja: '火力チャージ', en: 'Firepower Charge' }, holder: 'ally' },
  /** 超火力（ネオン：ビジョン・アイのバースト） */
  superFirepower: { name: { ja: '超火力', en: 'Super Firepower' }, holder: 'ally' },
  /** 超火力チャージ（ネオン：ビジョン・アイの S2）。名前は画面の適用中の効果の名前 */
  superFirepowerCharge: { name: { ja: '超火力チャージ', en: 'Super Firepower Charge' }, holder: 'ally' },
  /** ブームインストール（エレグのバースト） */
  boomInstall: { name: { ja: 'ブームインストール', en: 'BOOM Install' }, holder: 'enemy' },
  /** ウォームアップ（ラプラス：アルティメットヒーローの S1） */
  warmUp: { name: { ja: 'ウォームアップ', en: 'Warm Up' }, holder: 'ally' },
  /** ヒーロービジョン（ラプラスの S1） */
  heroVision: { name: { ja: 'ヒーロービジョン', en: 'Hero Vision' }, holder: 'ally' },
  /** クレッシェンド（ジュリアの S2） */
  crescendo: { name: { ja: 'クレッシェンド', en: 'Crescendo' }, holder: 'ally' },
  /** マイレージ（ルピーの S2） */
  mileage: { name: { ja: 'マイレージ', en: 'Mileage' }, holder: 'ally' },
  /** ショッピング（ルピー：ウィンターショッパーの S2） */
  shopping: { name: { ja: 'ショッピング', en: 'Shopping' }, holder: 'ally' },
  /** 熱血（モランの宝物版の S1） */
  fervor: { name: { ja: '熱血', en: 'Fervor' }, holder: 'ally' },
  /**
   * 臨戦（家族の根。ラプンツェル：サンクチュアリの「臨戦状態の味方」が指す）。家族のどの臨戦（マリアン：クイーン・紅蓮：神殺）にも当たる
   * （plan/design-new-chars-1029.md 5.1 節）
   */
  intoTheFray: { name: { ja: '臨戦', en: 'Into the Fray' }, holder: 'ally', family: 'intoTheFray' },
  /** 臨戦：意思の鋭槍（マリアン：クイーンの S1） */
  intoTheFraySharpenedResolve: {
    name: { ja: '臨戦：意思の鋭槍', en: 'Into the Fray: Sharpened Resolve' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 臨戦：胸を刺す願い（マリアン：クイーンの S2） */
  intoTheFrayPenetrantWish: {
    name: { ja: '臨戦：胸を刺す願い', en: 'Into the Fray: Penetrant Wish' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 臨戦：明鏡止水（紅蓮：神殺の S1） */
  intoTheFraySereneMind: {
    name: { ja: '臨戦：明鏡止水', en: 'Into the Fray: Serene Mind' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 臨戦：身剣合一（紅蓮：神殺の S2） */
  intoTheFrayAtOneWithTheSword: {
    name: { ja: '臨戦：身剣合一', en: 'Into the Fray: At One With the Sword' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 弱点露出（マリアン：クイーンの S1） */
  openWounds: { name: { ja: '弱点露出', en: 'Open Wounds' }, holder: 'enemy' },
  /** チェーンバインド（ミハラ：ボンディングチェーンの S1） */
  ensnaringChains: { name: { ja: 'チェーンバインド', en: 'Ensnaring Chains' }, holder: 'enemy' },
  /** プリング・チェーン（ミハラ：ボンディングチェーンのバースト） */
  draggingChain: { name: { ja: 'プリング・チェーン', en: 'Dragging Chain' }, holder: 'enemy' },
  /** オートファイア準備（スノーホワイト：ヘビーアームズの S1） */
  autoFireReady: { name: { ja: 'オートファイア準備', en: 'Auto Fire Ready' }, holder: 'ally' },
  /** セブンスドワーフ・フルアクティブ（スノーホワイト：ヘビーアームズのバースト）。最大ロックオン対象数▲は敵 1 体では効かない */
  sevenDwarvesFullyActive: {
    name: { ja: 'セブンスドワーフ・フルアクティブ', en: 'Seven Dwarves Fully Active' },
    holder: 'ally',
  },
  /** 特殊改造（エイダのバースト） */
  specialModification: { name: { ja: '特殊改造', en: 'Special Modification' }, holder: 'ally' },
  /** ミサイルガイド（ベスティー：タクティカル・アップの S1） */
  missileGuide: { name: { ja: 'ミサイルガイド', en: 'Missile Guide' }, holder: 'ally' },
  /** 氷結の魔女（エミリアのバースト） */
  freezingWitch: { name: { ja: '氷結の魔女', en: 'Freezing Witch' }, holder: 'ally' },
  /** 戦場コントロール（エマ：タクティカル・アップのバースト） */
  battlefieldFormation: { name: { ja: '戦場コントロール', en: 'Battle Formation' }, holder: 'ally' },
  /** 徹甲炸裂弾（ウンファ：タクティカル・アップのバースト） */
  explosiveRound: { name: { ja: '徹甲炸裂弾', en: 'Explosive Round' }, holder: 'enemy' },
  /** 硫酸弾（ジルの S2） */
  acidRound: { name: { ja: '硫酸弾', en: 'Acid Round' }, holder: 'ally' },
  /** 海風（マストの S1） */
  seaBreeze: { name: { ja: '海風', en: 'Sea Breeze' }, holder: 'enemy' },
  /** ターゲット指定（プリバティの宝物版のバースト） */
  designatedTarget: { name: { ja: 'ターゲット指定', en: 'Designated Target' }, holder: 'enemy', withoutContents: true },
  /** 暴風（マストのバースト）。持続ダメージではない（plan/design-mast.md 2.3 節） */
  storm: { name: { ja: '暴風', en: 'Storm' }, holder: 'enemy' },
  /** 変身（アークレンジャー・ブラックの S1） */
  transformation: { name: { ja: '変身', en: 'Transformation' }, holder: 'ally' },
  /** 借りていくよぉ…（ギルティの S1） */
  mindIfIBorrowThis: { name: { ja: '借りていくよぉ…', en: 'Mind If I Borrow This?' }, holder: 'ally' },
  /** 時間延長I・II（ソーダ：トゥインクルバニーの S2） */
  timeExtension1: { name: { ja: '時間延長I', en: 'Time Extension I' }, holder: 'ally' },
  timeExtension2: { name: { ja: '時間延長II', en: 'Time Extension II' }, holder: 'ally' },
  /** 気絶免疫（D の S2）。射撃場には防ぐ気絶が無いので中身なし */
  stunImmunity: { name: { ja: '気絶免疫', en: 'Stun Immunity' }, holder: 'ally' },
  /**
   * レッドフードのバーストの使った段階ごとのモードの名前（ビーストケージ・ハウリングエンド・レッドウルフ）。維持 0 秒の付与で、
   * 付いた記録だけを作る（plan/design-red-hood.md 2.2 節）
   */
  beastCage: { name: { ja: 'ビーストケージ', en: 'Beast Cage' }, holder: 'ally' },
  theLastHowl: { name: { ja: 'ハウリングエンド', en: 'The Last Howl' }, holder: 'ally' },
  redWolf: { name: { ja: 'レッドウルフ', en: 'Red Wolf' }, holder: 'ally' },
  /** 記憶吸収（ナユタの S2） */
  memoryAbsorption: { name: { ja: '記憶吸収', en: 'Memory Absorption' }, holder: 'ally' },
  /** 記憶燃焼（ナユタのバースト） */
  memoryIncineration: { name: { ja: '記憶燃焼', en: 'Memory Incineration' }, holder: 'ally' },
  /** ほろ酔い（マスト：ロマンチックメイドの S1） */
  drunken: { name: { ja: 'ほろ酔い', en: 'Drunken' }, holder: 'ally', debuff: true },
  /** 二日酔い（マスト：ロマンチックメイドの S2） */
  hangover: { name: { ja: '二日酔い', en: 'Hangover' }, holder: 'ally' },
  /** ルート探索1〜3段階（クエンシー：エスケープクイーンの S2） */
  exploreRouteStage1: { name: { ja: 'ルート探索1段階', en: 'Explore Route Stage 1' }, holder: 'ally' },
  exploreRouteStage2: { name: { ja: 'ルート探索2段階', en: 'Explore Route Stage 2' }, holder: 'ally' },
  exploreRouteStage3: { name: { ja: 'ルート探索3段階', en: 'Explore Route Stage 3' }, holder: 'ally' },
  /** イントロ（ディーゼル：ウィンタースイーツの S1） */
  intro: { name: { ja: 'イントロ', en: 'Intro' }, holder: 'ally' },
  /** クライマックス（ディーゼル：ウィンタースイーツの S1） */
  highlight: { name: { ja: 'クライマックス', en: 'Highlight' }, holder: 'ally' },
  /** 騒音公害（ディーゼル：ウィンタースイーツのバースト） */
  noisePollution: { name: { ja: '騒音公害', en: 'Noise Pollution' }, holder: 'ally' },
  /** 隠しレンズ（エード：エージェントバニーの S1） */
  spyLens: { name: { ja: '隠しレンズ', en: 'Spy Lens' }, holder: 'ally' },
  /** 運命の輪のカード（アルカナのバースト） */
  wheelOfFortune: { name: { ja: '運命の輪のカード', en: 'Wheel of Fortune' }, holder: 'ally' },
  /** 審判のカード（アルカナのバースト） */
  judgment: { name: { ja: '審判のカード', en: 'Judgment' }, holder: 'enemy' },
  /** 力のカード（アルカナの S2） */
  strength: { name: { ja: '力のカード', en: 'Strength' }, holder: 'ally' },
  /** 死神のカード（アルカナの S2） */
  death: { name: { ja: '死神のカード', en: 'Death' }, holder: 'ally' },
  /** 魔術師のカード（アルカナの S1） */
  magician: { name: { ja: '魔術師のカード', en: 'The Magician' }, holder: 'ally' },
  /** 貫通学概論（ツバイの宝物版のバースト） */
  pierceAttacks101: { name: { ja: '貫通学概論', en: 'Pierce Attacks 101' }, holder: 'ally' },
  /** Bモード（A2 のバースト） */
  modeB: { name: { ja: 'Bモード', en: 'Mode B' }, holder: 'ally' },
  /** 完全計算（グレイブのバースト） */
  prediction: { name: { ja: '完全計算', en: 'Prediction' }, holder: 'ally' },
  /** 放熱（グレイブの S1） */
  heatEmission: { name: { ja: '放熱', en: 'Heat Emission' }, holder: 'ally' },
  /** 過熱I（グレイブの S2） */
  overheatI: { name: { ja: '過熱I', en: 'Overheat I' }, holder: 'ally' },
  /** 過熱II（グレイブの S2） */
  overheatII: { name: { ja: '過熱II', en: 'Overheat II' }, holder: 'ally' },
  /** 過熱III（グレイブの S2） */
  overheatIII: { name: { ja: '過熱III', en: 'Overheat III' }, holder: 'ally' },
  /** ステージパート：ボーカル（ミントのバースト・プリカの S2。2 人が付ける） */
  assignedPartSinging: {
    name: { ja: 'ステージパート：ボーカル', en: 'Assigned Part: Singing' },
    holder: 'ally',
    group: 'assignedPart',
  },
  /** ステージパート：ダンス（ミントのバースト） */
  assignedPartDancing: {
    name: { ja: 'ステージパート：ダンス', en: 'Assigned Part: Dancing' },
    holder: 'ally',
    group: 'assignedPart',
  },
  /** ボーカルエフェクト（ミントの S1） */
  singingEffect: { name: { ja: 'ボーカルエフェクト', en: 'Singing Effect' }, holder: 'ally' },
  /** ダンスエフェクト（ミントの S1） */
  dancingEffect: { name: { ja: 'ダンスエフェクト', en: 'Dancing Effect' }, holder: 'ally' },
  /** シンガロング（ミントのバースト） */
  singAlong: { name: { ja: 'シンガロング', en: 'Sing Along' }, holder: 'ally' },
  /** パフォーマンス（プリカのバースト） */
  performance: { name: { ja: 'パフォーマンス', en: 'Performance' }, holder: 'ally' },
  /** アンコール（プリカの S2）。項目ごとに対象が違うので、付いた記録だけの名前 */
  encore: { name: { ja: 'アンコール', en: 'Encore' }, holder: 'ally' },
  /** 過電流（マクスウェル：オーディナリーメカニックの S2） */
  overcurrent: { name: { ja: '過電流', en: 'Overcurrent' }, holder: 'ally' },
  /**
   * ニンジンパーティー（アリス：ワンダーランドバニーの S1）。中身の阻止部位の攻撃ダメージ▲は前提の外なので書かず、
   * 付いた記録だけの名前
   */
  carrotParty: { name: { ja: 'ニンジンパーティー', en: 'Carrot Party' }, holder: 'ally' },
  /** ハッキングコード収集（エクシアの S2） */
  collectHackingCode: { name: { ja: 'ハッキングコード収集', en: 'Collect Hacking Code' }, holder: 'ally' },
  /** イチゴキャンディ（ディーゼルの S2） */
  strawberryCandy: { name: { ja: 'イチゴキャンディ', en: 'Strawberry Candy' }, holder: 'ally' },
  /** 心の平和（フローラの宝物版の S1） */
  heartOfPeace: { name: { ja: '心の平和', en: 'Peace of Mind' }, holder: 'ally' },
  /** ヘイト（ディーゼルの宝物版のバースト） */
  attract: { name: { ja: 'ヘイト', en: 'Attract' }, holder: 'ally' },
  /** 隠れ身（ロザンナの S1・S2）。単一攻撃対象からの除外と、直接攻撃を受けた時の解除は前提の外 */
  concealment: { name: { ja: '隠れ身', en: 'Concealment' }, holder: 'ally' },
  /** 狂気（ロザンナの宝物版の S2）。味方の戦闘不能時の付与は前提の外 */
  frenzy: { name: { ja: '狂気', en: 'Frenzy' }, holder: 'ally' },
  /** ソードコイン（ルージュの S2） */
  swordCoin: { name: { ja: 'ソードコイン', en: 'Sword Coin' }, holder: 'ally' },
  /**
   * 激流（リバーレリオの S2）。対になる緩流（ターゲットでないラプチャーに命中した時）は前提の外で付かないので、目録に置かない
   */
  ragingCurrent: { name: { ja: '激流', en: 'Raging Current' }, holder: 'ally' },
  /** 何見てんだよお前ら！！（ミルク：ブルーミングバニーのバースト） */
  overconfidentHuh: { name: { ja: '何見てんだよお前ら！！', en: 'Overconfident, Huh?!' }, holder: 'ally' },
  /** 殲滅態勢（アスカ：WILLE のバースト） */
  annihilationState: { name: { ja: '殲滅態勢', en: 'Annihilation State' }, holder: 'ally' },
  /** アンチA.T.フィールド（アスカ：WILLE の S1） */
  antiATField: { name: { ja: 'アンチA.T.フィールド', en: 'Anti A.T. Field' }, holder: 'enemy' },
  /** 攻撃態勢（レイ（仮称）のバースト） */
  attackState: { name: { ja: '攻撃態勢', en: 'Attack State' }, holder: 'ally' },
  /** バブル（リトルマーメイドの S2） */
  bubble: { name: { ja: 'バブル', en: 'Bubble' }, holder: 'enemy' },
  /** やみつきの味（ブレッディの S1） */
  lingeringTaste: { name: { ja: 'やみつきの味', en: 'Lingering Taste' }, holder: 'ally', group: 'taste' },
  /** オススメの味（ブレッディの S1） */
  recommendedTaste: { name: { ja: 'オススメの味', en: 'Recommended Taste' }, holder: 'ally', group: 'taste' },
  /** 思い出作り（アルカナ：フォーチュンメイトのバースト） */
  memoryMaking: { name: { ja: '思い出作り', en: 'Making Memories' }, holder: 'ally' },
  /** 幸せな思い出（アルカナ：フォーチュンメイトの S2） */
  happyMemory: { name: { ja: '幸せな思い出', en: 'Happy Memories' }, holder: 'ally' },
  /** 大切な思い出（アルカナ：フォーチュンメイトの S2） */
  preciousMemory: { name: { ja: '大切な思い出', en: 'Precious Moments' }, holder: 'ally' },
  /** 青春の記録（アルカナ：フォーチュンメイトの S1） */
  youthRecord: { name: { ja: '青春の記録', en: 'Snapshots of Youth' }, holder: 'ally' },
  /** ホイッスル（マルチャーナ：マリンスタディの S2） */
  whistle: { name: { ja: 'ホイッスル', en: 'Whistle' }, holder: 'ally' },
  /** 高リスク対象（マルチャーナ：マリンスタディのバースト） */
  highRiskTarget: { name: { ja: '高リスク対象', en: 'High-Risk Target' }, holder: 'enemy' },
  /**
   * 憑依（エレグ：ブーム・アンド・ショックの S1）。説明文では敵に付くが、モデルが要るのはキャプチャーの命中を数える窓だけなので、
   * 敵 1 体の前提で自分の状態として持つ（plan/design-elegg-bs.md 2.4 節）
   */
  ghostPossession: { name: { ja: '憑依', en: 'Possession' }, holder: 'ally' },
  /** エグゾスパインMk2（イヴのバースト） */
  exospineMk2: { name: { ja: 'エグゾスパインMk2', en: 'Exospine Mk2' }, holder: 'ally' },
  /** 射撃マニュアル（ミサトの S1） */
  shootingManual: { name: { ja: '射撃マニュアル', en: 'Shooting Manual' }, holder: 'ally' },
  /** 経験値（ギロチン：ウィンタースレイヤーの S2） */
  exp: { name: { ja: '経験値', en: 'EXP' }, holder: 'ally' },
  /** 生存本能1（ベスティーの S2） */
  survivalInstinct1: { name: { ja: '生存本能1', en: 'Survival Instinct 1' }, holder: 'ally' },
  /** 生存本能2（ベスティーの S2） */
  survivalInstinct2: { name: { ja: '生存本能2', en: 'Survival Instinct 2' }, holder: 'ally' },
  /** 生存本能3（ベスティーの S2） */
  survivalInstinct3: { name: { ja: '生存本能3', en: 'Survival Instinct 3' }, holder: 'ally' },
  /** 証拠品収集（ノベルの S2） */
  collectEvidence: { name: { ja: '証拠品収集', en: 'Collecting Evidence' }, holder: 'ally' },
  /** 眠い（プリムの宝物版の S1） */
  sleepy: { name: { ja: '眠い', en: 'Sleepy' }, holder: 'enemy' },
  /** 起きた（プリムの宝物版の S1） */
  wakeUp: { name: { ja: '起きた', en: 'Wake Up' }, holder: 'ally' },
  /** おばけの仮装（ベロータ：パンプキンウィッチの S1）。単一攻撃の対象からの除外と被弾での解除は前提の外なので中身なし */
  ghostCostume: { name: { ja: 'おばけの仮装', en: 'Ghost Costume' }, holder: 'ally' },
  /** おばけのイタズラ（ベロータ：パンプキンウィッチの S2） */
  ghostlyPrank: { name: { ja: 'おばけのイタズラ', en: 'Ghostly Prank' }, holder: 'enemy' },
  /** 予告状（ファントムの S1） */
  callingCard: { name: { ja: '予告状', en: 'Calling Card' }, holder: 'enemy' },
  /** 怪盗の短剣（ファントムの S1） */
  thiefsDagger: { name: { ja: '怪盗の短剣', en: "Thief's Dagger" }, holder: 'ally' },
  /** 怪盗の鑑定眼（ファントムの S2）。説明文に状態の名前が無いので、スロットの名前で呼ぶ */
  thiefsVision: { name: { ja: '怪盗の鑑定眼', en: "Thief's Vision" }, holder: 'ally' },
  /** リフレッシュハート（ペッパーの S1）。中身の受けるHP回復量▲は語彙に無いので書かない */
  refreshHeart: { name: { ja: 'リフレッシュハート', en: 'Refresh Heart' }, holder: 'ally' },
  /** 咆哮（レオナの S1） */
  roar: { name: { ja: '咆哮', en: 'Roar' }, holder: 'ally' },
  /** メイド精神（ソーダの S1） */
  maidSpirit: { name: { ja: 'メイド精神', en: 'Maid Spirit' }, holder: 'ally' },
  /** 鬼の気（レムのバースト） */
  demonsBreath: { name: { ja: '鬼の気', en: "Demon's Breath" }, holder: 'ally' },
  /** 傾く天秤（K の S1） */
  tiltedScale: { name: { ja: '傾く天秤', en: 'Tilted Scale' }, holder: 'ally' },
  /** 正義の実現（K の S2） */
  fulfillmentOfRighteousness: { name: { ja: '正義の実現', en: 'Fulfillment of Righteousness' }, holder: 'ally' },
  /**
   * スターゲイザー（アビスタのバースト。自分に最大HP▲・持続。S1 がフルバーストタイムの終わりに解除し、S2 の「スターゲイザー状態なら」が
   * フルバーストタイムの発動の時に読む。V-0887）
   */
  stargazer: { name: { ja: 'スターゲイザー', en: 'Stargazer' }, holder: 'ally' },
  /** アフターショー（アビスタの S1。自分のアイドルに攻撃力▲。フルバーストタイムの発動の時に解除。V-0887） */
  aftershow: { name: { ja: 'アフターショー', en: 'Aftershow' }, holder: 'ally' },
} as const satisfies Record<string, NamedStateInfo>;

export type NamedStateId = keyof typeof NAMED_STATES;

export const NAMED_STATE_IDS = Object.keys(NAMED_STATES) as NamedStateId[];

/** 状態の画面の名前 */
export function namedStateName(id: NamedStateId): LocalizedText {
  return NAMED_STATES[id].name;
}

/** 状態を持つ側 */
export function namedStateHolder(id: NamedStateId): StateHolder {
  return NAMED_STATES[id].holder;
}

/** 付与に中身を書かない敵の状態か */
export function namedStateWithoutContents(id: NamedStateId): boolean {
  return (NAMED_STATES[id] as NamedStateInfo).withoutContents === true;
}

/** デバフ解除で外れる状態か */
export function namedStateIsDebuff(id: NamedStateId): boolean {
  return (NAMED_STATES[id] as NamedStateInfo).debuff === true;
}

/** 状態の切り替えの組（無ければ undefined） */
export function namedStateGroup(id: NamedStateId): StateSwitchGroup | undefined {
  return (NAMED_STATES[id] as NamedStateInfo).group;
}

/** 状態の家族（無ければ undefined） */
export function namedStateFamily(id: NamedStateId): StateFamily | undefined {
  return (NAMED_STATES[id] as NamedStateInfo).family;
}

/** 条件・きっかけの id が指す状態か（同じ id か、id が家族の根でその家族の状態） */
export function stateMatches(conditionId: NamedStateId, state: NamedStateId): boolean {
  return state === conditionId || namedStateFamily(state) === conditionId;
}

/** 条件・きっかけの id が指す状態の一覧（家族の根なら家族のどれも） */
export function statesMatching(conditionId: NamedStateId): NamedStateId[] {
  return NAMED_STATE_IDS.filter((s) => stateMatches(conditionId, s));
}
