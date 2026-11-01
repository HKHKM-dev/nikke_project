// 名前の付いた状態の語彙編（plan/design-named-state.md 5.1 節）: 状態の目録。定義が状態を指すのはこの表の id だけ
// （付与 kind: 'state'・トリガー { applied }・対象の絞り込み targetState・条件 enemyState・dot の state）。
// 目録が持つのは、どの状態か（同一性）・画面の名前・持ち主の側だけ。スタックの上限・維持・中身は付与に書く（同 3.5 節）。
// id は英語版の説明文の状態名の lowerCamelCase（同 5.1 節の id の付け方）。一度付けた id は変えない
import type { LocalizedText } from '../types.ts';

/** 状態を持つ側。ally = 味方の枠、enemy = 敵（1 体の前提） */
export type StateHolder = 'ally' | 'enemy';

/**
 * 2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 状態の家族。条件・きっかけが家族の根（id が家族の名前と同じ状態）を指したら、
 * 家族のどの状態でも当たる（「バリア適用状態なら」は、名前の無いバリアにも名前の付いたバリアにも当たる）
 */
export type StateFamily = 'barrier' | 'intoTheFray';

export type NamedStateInfo = {
  /** 画面と CLI の名前（日本語は説明文の状態名） */
  name: LocalizedText;
  holder: StateHolder;
  /** 2 段目の段 5: 家族（任意） */
  family?: StateFamily;
};

export const NAMED_STATES = {
  /** ペルソナ（クイーン（真）・雪子の S1。C-0354） */
  persona: { name: { ja: 'ペルソナ', en: 'Persona' }, holder: 'ally' },
  /** 追撃（雪子の S2。クイーン（真）の S1 の「追撃が適用された時」。C-0355） */
  followUp: { name: { ja: '追撃', en: 'Follow Up' }, holder: 'ally' },
  /** バトンタッチ（クイーン（真）の S2。C-0357） */
  batonPass: { name: { ja: 'バトンタッチ', en: 'Baton Pass' }, holder: 'ally' },
  /** カモフラージュ（ウンファ：タクティカル・アップの S1。C-0311・C-0314） */
  camouflage: { name: { ja: 'カモフラージュ', en: 'Camouflage' }, holder: 'ally' },
  /** ハッキング（クルミの S1 の持続ダメージ。S2 の「対象がハッキング状態なら」。C-0136・C-0276） */
  hacked: { name: { ja: 'ハッキング', en: 'Hacked' }, holder: 'enemy' },
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 2.1 節）: 私だけの星（アニス：スターの S1。自分を除く基本バースト段階 I の味方が
   * いない時。S2・バーストの「私だけの星状態なら」。C-0189・C-0203・C-0555）
   */
  myOwnStar: { name: { ja: '私だけの星', en: 'My Own Star' }, holder: 'ally' },
  /** 同: みんなの星（アニス：スターの S1。自分を除く基本バースト段階 I の味方がいる時。C-0201・C-0555） */
  everyonesStar: { name: { ja: 'みんなの星', en: "Everyone's Star" }, holder: 'ally' },
  /** 同: シューティングスター（アニス：スターのバーストの自動攻撃の呼び名。10 秒。C-0211） */
  shootingStar: { name: { ja: 'シューティングスター', en: 'Shooting Star' }, holder: 'ally' },
  /** 2 段目の段 1（plan/design-skill-stage1.md 2.2 節）: マターガンマ（マナの S1。戦闘開始時・持続・攻撃力▲。C-0020） */
  metalGamma: { name: { ja: 'マターガンマ', en: 'Metal γ' }, holder: 'ally' },
  /**
   * 同: マターシグマ（マナの S2。戦闘開始時とフルバーストの終わり（直前に自分がバーストを使用していれば）に付き、フルバーストの
   * 開始で解除。バーストゲージのチャージ速度▲。C-0269。S2 の「マターシグマ状態なら」。C-0281）
   */
  metalSigma: { name: { ja: 'マターシグマ', en: 'Metal σ' }, holder: 'ally' },
  /** 同（2.3 節）: ペインロード 1（ミハラの S2。バーストの使用 1 回目から。攻撃力▲・45 秒） */
  highwayToHell1: { name: { ja: 'ペインロード1', en: 'Highway to Hell 1' }, holder: 'ally' },
  /** 同: ペインロード 2（ミハラの S2。バーストの使用 2 回目から。クリティカル確率▲・45 秒。バーストの「ペインロード2の状態なら」） */
  highwayToHell2: { name: { ja: 'ペインロード2', en: 'Highway to Hell 2' }, holder: 'ally' },
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 2.1 節）: ゴールデンチップ（ソーダ：トゥインクルバニーの S1。戦闘開始時に 50 個、
   * フルバースト中の通常攻撃 3 回ごとに 1 個。最大 50 スタック・持続・クリティカルダメージ▲。C-0128）
   */
  goldenChip: { name: { ja: 'ゴールデンチップ', en: 'Golden Chip' }, holder: 'ally' },
  /** 同（2.2 節）: リラックス（クラウンの S2。通常攻撃 43 回ごとに 1 スタック・20 スタック・持続。フルスタックで外れて回復。C-0271） */
  relax: { name: { ja: 'リラックス', en: 'Relax' }, holder: 'ally' },
  /**
   * 2 段目の段 5（plan/design-skill-stage5.md 1.1 節）: バリア（名前の無いバリア・共用バリアの付与。家族の根。「バリア適用状態なら」は
   * 家族のどのバリアにも当たる。ラムのバースト・アスカ S2）
   */
  barrier: { name: { ja: 'バリア', en: 'Barrier' }, holder: 'ally', family: 'barrier' },
  /**
   * 2 段目の段 6 の PR 2（plan/design-skill-stage6.md 2.4 節）: デコイ（シンデレラの S2 の分身。中身なし・持続。被弾で壊れる分は
   * 扱わない）。「デコイが存在する時」（selfState）が読む。判定は自分のデコイだけ
   */
  decoy: { name: { ja: 'デコイ', en: 'Decoy' }, holder: 'ally' },
  /**
   * 同: 美しさ（シンデレラの S2。デコイがある間 3 秒ごとに 1 スタック・中身は最大HP▲・12 スタック・持続）。S1 の最終最大HP 基準の
   * 攻撃力▲が、上がった最終最大HP を読み直す
   */
  beauty: { name: { ja: '美しさ', en: 'Beautiful' }, holder: 'ally' },
  /**
   * 2 段目の段 4（plan/design-skill-stage4.md 2.1 節）: 代用弾丸（トーブの S1。弾丸チャージの即時効果の呼び名。維持 0 秒の付与で、
   * 付いた記録だけを作る。「代用弾丸が適用される時」の { applied } が読む）
   */
  emergencyCraftedBullets: { name: { ja: '代用弾丸', en: 'Emergency-Crafted Bullets' }, holder: 'ally' },
  /** 同: 応急改造（トーブの S1。代用弾丸が適用される時に味方全体。最大装弾数▲・3 スタック・5 秒。S2・バーストが見る） */
  temporaryModification: { name: { ja: '応急改造', en: 'Temporary Modification' }, holder: 'ally' },
  /**
   * 2 段目の段 10 の PR 3（plan/design-skill-stage10.md 3.3 節）: その場しのぎの奇跡（トーブの宝物版のバースト。味方全体。スキル発動者
   * 基準の攻撃力▲・応急改造スタックコピー・15 秒）。付いた時のトーブの応急改造のスタック数で付く（V-0523）
   */
  miracleOfMakeshifts: { name: { ja: 'その場しのぎの奇跡', en: 'Miracle of Makeshifts' }, holder: 'ally' },
  /**
   * 同: ショットガンを所持する味方全体へのその場しのぎの奇跡。ゲームでは同じ名前の 2 つ目の効果で、ショットガンの味方には味方全体の分と
   * 重なって乗る（V-0523）。同じ状態の付与は 1 つの件の列にまとまり中身も 1 つなので、別の状態にする
   */
  miracleOfMakeshiftsShotgun: {
    name: { ja: 'その場しのぎの奇跡（ショットガン）', en: 'Miracle of Makeshifts (Shotgun)' },
    holder: 'ally',
  },
  /**
   * 2 段目の段 10（plan/design-skill-stage10.md 3.2 節）: 火力チャージ（ネオン：ビジョン・アイのバースト。火力ゲージが 100 未満の時。
   * 10 秒・解除不可。その間の通常攻撃と終わりに火力ゲージをチャージする。V-0503）
   */
  firepowerCharge: { name: { ja: '火力チャージ', en: 'Firepower Charge' }, holder: 'ally' },
  /** 同: 超火力（ネオン：ビジョン・アイのバースト。火力ゲージが 100 の時。攻撃ダメージ▲・10 秒。S1・S2 の超火力の追加効果が見る） */
  superFirepower: { name: { ja: '超火力', en: 'Super Firepower' }, holder: 'ally' },
  /**
   * 同: 超火力チャージ（ネオン：ビジョン・アイの S2。フルバーストの終わりに、火力ゲージの値をスタック数にして付く。1 スタックが
   * バーストゲージのチャージ速度▲。5 秒。画面の適用中の効果の名前。V-0503）
   */
  superFirepowerCharge: { name: { ja: '超火力チャージ', en: 'Super Firepower Charge' }, holder: 'ally' },
  /**
   * エレグのバースト編（plan/design-elegg.md 8.2 節）: ブームインストール（エレグのバースト。敵に付く。中身は防御力▼・10 秒。
   * バーストのヒットから付く。V-0521。S1・S2 の「対象がブームインストール状態なら」が見る（段 3））
   */
  boomInstall: { name: { ja: 'ブームインストール', en: 'BOOM Install' }, holder: 'enemy' },
  /**
   * 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: ウォームアップ（ラプラス：アルティメットヒーローの S1。フルチャージして攻撃した
   * 時にチャージ速度▲のスタック。フルスタックで外して使用武器の変更）
   */
  warmUp: { name: { ja: 'ウォームアップ', en: 'Warm Up' }, holder: 'ally' },
  /**
   * 2 段目の段 11 の PR 3（plan/design-skill-stage11.md 3.3 節。V-0530）: 熱血（モランの宝物版の S1。ラプチャーが出現した時・持続・
   * バーストスキルのクールタイム▼。宝物版の S2 の「熱血状態なら」）
   */
  fervor: { name: { ja: '熱血', en: 'Fervor' }, holder: 'ally' },
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.1 節）: 臨戦の家族。根（「臨戦状態の味方」が指す）と、マリアン：クイーン（19）・
   * 紅蓮：神殺（472）の臨戦。ラプンツェル：サンクチュアリ（473）の「自分と臨戦状態の味方」が根を指す
   */
  intoTheFray: { name: { ja: '臨戦', en: 'Into the Fray' }, holder: 'ally', family: 'intoTheFray' },
  /** 同: 臨戦：意思の鋭槍（マリアン：クイーンの S1。戦闘開始時・持続） */
  intoTheFraySharpenedResolve: {
    name: { ja: '臨戦：意思の鋭槍', en: 'Into the Fray: Sharpened Resolve' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 同: 臨戦：胸を刺す願い（マリアン：クイーンの S2。バースト使用時・10 秒） */
  intoTheFrayPenetrantWish: {
    name: { ja: '臨戦：胸を刺す願い', en: 'Into the Fray: Penetrant Wish' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 同: 臨戦：明鏡止水（紅蓮：神殺の S1。戦闘開始時・持続） */
  intoTheFraySereneMind: {
    name: { ja: '臨戦：明鏡止水', en: 'Into the Fray: Serene Mind' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 同: 臨戦：身剣合一（紅蓮：神殺の S2。バースト使用時・10 秒） */
  intoTheFrayAtOneWithTheSword: {
    name: { ja: '臨戦：身剣合一', en: 'Into the Fray: At One With the Sword' },
    holder: 'ally',
    family: 'intoTheFray',
  },
  /** 同: 弱点露出（マリアン：クイーンの S1。敵に付く。中身は受けるダメージ▲） */
  openWounds: { name: { ja: '弱点露出', en: 'Open Wounds' }, holder: 'enemy' },
  /**
   * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.3 節）: チェーンバインド（ミハラ：ボンディングチェーンの S1 の持続ダメージ。敵に付く。
   * キャプチャーチェーンの攻撃 1 回ごとに 1 スタック・20 スタック・持続・解除不可。V-0546）
   */
  ensnaringChains: { name: { ja: 'チェーンバインド', en: 'Ensnaring Chains' }, holder: 'enemy' },
  /**
   * 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: プリング・チェーン（ミハラ：ボンディングチェーンのバーストの持続ダメージ。敵に付く。
   * チェーンバインドのスタック数を写す・10 秒・解除不可。付けた後にチェーンバインドを消去する。V-0547）
   */
  draggingChain: { name: { ja: 'プリング・チェーン', en: 'Dragging Chain' }, holder: 'enemy' },
  /**
   * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.2 節）: オートファイア準備（スノーホワイト：ヘビーアームズの S1。チャージ中の
   * 0.2 秒ごとに 1 スタック・最大装填数（スタック）5・持続・解除条件は通常攻撃時。中身の防御力▲は間接。装填数がオートファイアの
   * 順番の攻撃の数（perCount）になる）
   */
  autoFireReady: { name: { ja: 'オートファイア準備', en: 'Auto Fire Ready' }, holder: 'ally' },
  /**
   * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5・6）: セブンスドワーフ・フルアクティブ（スノーホワイト：ヘビーアームズの
   * バースト。使用回数（スタック）2 回・持続。中身はチャージ時間 3.2 秒の固定（S2 の 1.2 秒の固定より勝つ）とオートファイア準備の最大装填数
   * 10▲。最大ロックオン対象数 10▲は敵 1 体では効かない。S1 の「フルチャージして攻撃した時」に使用回数 1 回▼、使い切ったら解除。
   * 通常攻撃をした時、フルバースト状態でなければ解除）
   */
  sevenDwarvesFullyActive: {
    name: { ja: 'セブンスドワーフ・フルアクティブ', en: 'Seven Dwarves Fully Active' },
    holder: 'ally',
  },
  /**
   * 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節。論点 9）: 特殊改造（エイダのバースト。自分・1 発間維持。中身はチャージ速度▼と
   * チャージダメージ▲。V-0569）
   */
  specialModification: { name: { ja: '特殊改造', en: 'Special Modification' }, holder: 'ally' },
  /**
   * 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: ミサイルガイド（ベスティー：タクティカル・アップの S1。フルチャージして攻撃した時、
   * ミサイルガイド状態でなければ自分に付く。中身はチャージ速度▲とチャージダメージ▲・3 発間維持。最大弾数のリロードが完了した時に解除）
   */
  missileGuide: { name: { ja: 'ミサイルガイド', en: 'Missile Guide' }, holder: 'ally' },
  /**
   * 同: 戦場コントロール（エマ：タクティカル・アップのバースト。味方全体に付く。中身は発動者の攻撃力の▲・10 秒。ベスティー：タクティカル・アップの
   * S2 の「自分が戦場コントロール状態なら」が見る）
   */
  battlefieldFormation: { name: { ja: '戦場コントロール', en: 'Battle Formation' }, holder: 'ally' },
  /**
   * 同: 徹甲炸裂弾（ウンファ：タクティカル・アップのバースト。敵に付く。中身は受けるダメージ▲・10 秒。ベスティー：タクティカル・アップの S2 の
   * 「対象が徹甲炸裂弾状態なら」が見る）
   */
  explosiveRound: { name: { ja: '徹甲炸裂弾', en: 'Explosive Round' }, holder: 'enemy' },
  /**
   * 2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2 節。論点 4）: 硫酸弾（ジルの S2。戦闘開始時と最大弾数のリロード完了時に自分に付く。
   * 中身は無く、次の通常攻撃で対象に持続ダメージを付けて外れる）
   */
  acidRound: { name: { ja: '硫酸弾', en: 'Acid Round' }, holder: 'ally' },
  /**
   * マスト編（plan/design-mast.md 2.1・2.2 節）: 海風（マストの S1。通常攻撃のクリティカルの命中 2 回ごとに敵に 1 スタック・50 スタック・3 秒。
   * 中身は発動者基準の防御力▼（casterDefence）。バーストの暴風が写すスタックの元）
   */
  seaBreeze: { name: { ja: '海風', en: 'Sea Breeze' }, holder: 'enemy' },
  /** 同 2.3 節: 暴風（マストのバースト。海風のスタック数を写す 1 秒ごとのダメージ・7 秒。持続ダメージではない） */
  storm: { name: { ja: '暴風', en: 'Storm' }, holder: 'enemy' },
  /**
   * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2）: 変身（アークレンジャー・ブラックの S1。バッテリーが 100 になった時に自分に付き、
   * 0 になった時に外れる。解除不可。中身は攻撃力▲。付いている間 0.2 秒ごとにバッテリーが 1 減る。S2 の持続ダメージ・バーストの「変身状態なら」が見る）
   */
  transformation: { name: { ja: '変身', en: 'Transformation' }, holder: 'ally' },
  /**
   * 2 段目の段 19 の PR 2（plan/design-skill-stage19.md 2.2 節。論点 5）: 借りていくよぉ…（ギルティの S1。通常攻撃 6 回ごとに自分に 1 スタック・
   * 5 スタック・10 秒。中身は攻撃力のコピー。S2 のスタック量▲が足し、バーストの「フルスタックなら」が見る）
   */
  mindIfIBorrowThis: { name: { ja: '借りていくよぉ…', en: 'Mind If I Borrow This?' }, holder: 'ally' },
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

/** 2 段目の段 5: 状態の家族（無ければ undefined） */
export function namedStateFamily(id: NamedStateId): StateFamily | undefined {
  return (NAMED_STATES[id] as NamedStateInfo).family;
}

/** 2 段目の段 5: 条件・きっかけの id が指す状態か（同じ id か、id が家族の根でその家族の状態） */
export function stateMatches(conditionId: NamedStateId, state: NamedStateId): boolean {
  return state === conditionId || namedStateFamily(state) === conditionId;
}

/** 2 段目の段 5: 条件・きっかけの id が指す状態の一覧（家族の根なら家族のどれも） */
export function statesMatching(conditionId: NamedStateId): NamedStateId[] {
  return NAMED_STATE_IDS.filter((s) => stateMatches(conditionId, s));
}
