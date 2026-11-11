// 名前の付いた状態の語彙編（plan/design-named-state.md 5.1 節）: 状態の目録。定義が状態を指すのはこの表の id だけ
// （付与 kind: 'state'・トリガー { applied }・対象の絞り込み targetState・条件 enemyState・dot の state）。
// 目録が持つのは、どの状態か（同一性）・画面の名前・持ち主の側と、中身を書かない敵の状態の印（withoutContents）だけ。スタックの上限・維持・中身は付与に書く（同 3.5 節）。
// id は英語版の説明文の状態名の lowerCamelCase（同 5.1 節の id の付け方）。一度付けた id は変えない
import type { LocalizedText } from '../types.ts';

/** 状態を持つ側。ally = 味方の枠、enemy = 敵（1 体の前提） */
export type StateHolder = 'ally' | 'enemy';

/**
 * 2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 状態の家族。条件・きっかけが家族の根（id が家族の名前と同じ状態）を指したら、
 * 家族のどの状態でも当たる（「バリア適用状態なら」は、名前の無いバリアにも名前の付いたバリアにも当たる）
 */
export type StateFamily = 'barrier' | 'intoTheFray';

/**
 * ミント・プリカ編（plan/design-mint-prika.md 2.2 節）: 切り替えの組。同じ持ち主に組のある状態が付いたら、組のほかの状態の件を閉じる
 * （解除不可も。skills/holders.ts の fireGrant）
 */
export type StateSwitchGroup = 'assignedPart';

export type NamedStateInfo = {
  /** 画面と CLI の名前（日本語は説明文の状態名） */
  name: LocalizedText;
  holder: StateHolder;
  /** 2 段目の段 5: 家族（任意） */
  family?: StateFamily;
  /**
   * プリバティ編: 中身がダメージに関係しない敵の状態（付与に中身を書かない。名前だけを条件が見る）。書かない敵の状態は、どれかの付与が中身を持つ
   * （parse/crossChecks.ts の validateStateGrants）
   */
  withoutContents?: true;
  /**
   * 課題 2-59（plan/design-debuff-removal.md 2.1 節）: デバフ解除（removeDebuff）で外れる味方の状態。録画で外れると確かめた状態だけに付ける
   */
  debuff?: true;
  /** ミント・プリカ編: 切り替えの組（任意） */
  group?: StateSwitchGroup;
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
  /**
   * プリバティ編: ターゲット指定（プリバティの宝物版バースト。敵全体に 10 秒。中身の攻撃力▼はダメージに関係しないので中身なし（withoutContents）。
   * 宝物版 S2 の「対象がターゲット指定状態なら」の追加ダメージが見る）
   */
  designatedTarget: { name: { ja: 'ターゲット指定', en: 'Designated Target' }, holder: 'enemy', withoutContents: true },
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
  /**
   * 2 段目の段 21 の PR 2（plan/design-skill-stage21.md 2.2・2.3 節）: 時間延長 I・II（ソーダ：トゥインクルバニーの S2。バースト 3 段階突入時に
   * ゴールデンチップの数で味方全体に付き、フルバーストタイムの間続く。延長の秒は同じきっかけの fullBurstExtend が足す（C-0877）。中身なし。
   * S2 の「自分が時間延長 I（II）状態なら」のダメージが見る）
   */
  timeExtension1: { name: { ja: '時間延長I', en: 'Time Extension I' }, holder: 'ally' },
  timeExtension2: { name: { ja: '時間延長II', en: 'Time Extension II' }, holder: 'ally' },
  /**
   * 2 段目の段 21 の PR 3（plan/design-skill-stage21.md 2.4 節）: 気絶免疫（D の S2。ターゲットが出現した時（戦闘開始時）に味方全体に付く。
   * 射撃場には防ぐ気絶が無いので中身なし。D のバーストの「自分が気絶免疫状態なら」のフルバーストタイムの延長が見る）
   */
  stunImmunity: { name: { ja: '気絶免疫', en: 'Stun Immunity' }, holder: 'ally' },
  /**
   * レッドフード編（plan/design-red-hood.md 2.2 節）: バーストの使った段階ごとのモードの名前（『バーストⅠで使用時：ビーストケージ』など）。
   * バーストの発動に維持 0 秒で付き（記録だけ）、S2 の「〈モード〉を適用時」「レッドウルフを発動した時」の { applied } が見る
   */
  beastCage: { name: { ja: 'ビーストケージ', en: 'Beast Cage' }, holder: 'ally' },
  theLastHowl: { name: { ja: 'ハウリングエンド', en: 'The Last Howl' }, holder: 'ally' },
  redWolf: { name: { ja: 'レッドウルフ', en: 'Red Wolf' }, holder: 'ally' },
  /**
   * ナユタ編（plan/design-nayuta.md 1 節）: S2 の記憶吸収（3 秒ごとに 1 スタック・スタック量増減効果無効）。S1 の「記憶吸収が適用される時」の
   * { applied } と、S2 のスタック量別の効果の条件が見る
   */
  memoryAbsorption: { name: { ja: '記憶吸収', en: 'Memory Absorption' }, holder: 'ally' },
  /** ナユタ編（同 2.5 節）: バーストの「記憶燃焼：使用武器変更」の変更の窓の間の状態（weaponChange の state）。S1 の「記憶燃焼状態なら」が見る */
  memoryIncineration: { name: { ja: '記憶燃焼', en: 'Memory Incineration' }, holder: 'ally' },
  /**
   * メイド編（plan/design-maids.md 2.4 節）: ほろ酔い（マスト：ロマンチックメイドの S1。バースト 1 段階突入時に自分に付く命中率▼・3 スタック・持続。
   * S1 の「ほろ酔い状態の時に限り」・S2 とバーストの「× ほろ酔いのスタック数」が見る）
   */
  drunken: { name: { ja: 'ほろ酔い', en: 'Drunken' }, holder: 'ally', debuff: true },
  /** 同: 二日酔い（マスト：ロマンチックメイドの S2。ほろ酔いのフルスタックのフルバーストの終わりに付く気絶。10 秒。射撃を止める shotPause が見る） */
  hangover: { name: { ja: '二日酔い', en: 'Hangover' }, holder: 'ally' },
  /**
   * クエンシー：エスケープクイーン編: ルート探索 1〜3 段階（S2。通常攻撃 2 回ごとに付く命中率▲・攻撃力▲のスタック。2 段階は 1 段階の、
   * 3 段階は 2 段階のフルスタックの時だけ付く。S1 の「ルート探索 N 段階フルスタック状態の時のみ」が見る）
   */
  exploreRouteStage1: { name: { ja: 'ルート探索1段階', en: 'Explore Route Stage 1' }, holder: 'ally' },
  exploreRouteStage2: { name: { ja: 'ルート探索2段階', en: 'Explore Route Stage 2' }, holder: 'ally' },
  exploreRouteStage3: { name: { ja: 'ルート探索3段階', en: 'Explore Route Stage 3' }, holder: 'ally' },
  /**
   * ディーゼル：ウィンタースイーツ編（plan/design-diesel-ws.md 1 節）: イントロ（S1。初めてのフルバーストで、直前に自分がバーストを使っていれば
   * 付く。クリティカルダメージ▲・持続・解除不可。S1 の「イントロ状態なら」が見る）
   */
  intro: { name: { ja: 'イントロ', en: 'Intro' }, holder: 'ally' },
  /** 同: クライマックス（S1。使っていなければ付く。S1 とバーストの「クライマックス状態なら」が見る） */
  highlight: { name: { ja: 'クライマックス', en: 'Highlight' }, holder: 'ally' },
  /**
   * エード：エージェントバニー編（plan/design-agent-bunny.md 1 節）: 隠しレンズ（S1。フルチャージの発ごとに 1 スタック・10 スタック・5 秒。
   * 中身は適正最小射程距離▲。S2 の「隠しレンズのフルスタック状態時のみ」が見る）
   */
  spyLens: { name: { ja: '隠しレンズ', en: 'Spy Lens' }, holder: 'ally' },
  /**
   * アルカナ（V-0713）: 運命の輪のカード（バースト。電撃コードの味方全体に付く攻撃ダメージ▲・10 秒。S1・S2 の「自分が運命の輪のカード状態なら」が見る。C-1050・C-1054）
   */
  wheelOfFortune: { name: { ja: '運命の輪のカード', en: 'Wheel of Fortune' }, holder: 'ally' },
  /** 同: 審判のカード（バースト。敵全体に付く受けるダメージ▲・10 秒。C-1050） */
  judgment: { name: { ja: '審判のカード', en: 'Judgment' }, holder: 'enemy' },
  /** 同: 力のカード（S2。直前にバーストを使った III の電撃コードの味方に付くスキル発動者基準の攻撃力▲・15 秒。C-1053） */
  strength: { name: { ja: '力のカード', en: 'Strength' }, holder: 'ally' },
  /** 同: 死神のカード（S2。味方全体に付くバーストスキルクールタイム▼とスキル発動者基準の攻撃力▲・5 秒。C-1053） */
  death: { name: { ja: '死神のカード', en: 'Death' }, holder: 'ally' },
  /**
   * 同: 魔術師のカード（S1。直前にバーストを使った III の電撃コードの味方に付くスキル 2 クールタイム▼・15 秒。中身は skillCooldownDown。
   * C-1055。plan/design-arcana-magician.md）
   */
  magician: { name: { ja: '魔術師のカード', en: 'The Magician' }, holder: 'ally' },
  /**
   * ツバイ編（plan/design-zwei.md 2.5 節）: ツバイの宝物版のバースト「貫通学概論：貫通ダメージ▲」（味方全体・10 秒）。
   * 中身は貫通ダメージ▲。宝物版 S2 の「自分が貫通学概論状態なら」が見る
   */
  pierceAttacks101: { name: { ja: '貫通学概論', en: 'Pierce Attacks 101' }, holder: 'ally' },
  /**
   * A2 の B モード編（plan/design-hp-down-interval.md）: A2 のバースト「B モード」（自分。中身は攻撃力▲・チャージ速度▲。付いている間 1 秒ごとに
   * 現在の HP▼、HP が 40% 以下で解除）
   */
  modeB: { name: { ja: 'Bモード', en: 'Mode B' }, holder: 'ally' },
  /**
   * グレイブ編（plan/design-grave.md）: バーストの「完全計算」（自分・10 秒。中身は無い）。S1 の「完全計算状態が終了した時」（{ ended }）、S2 の
   * 「完全計算状態なら…攻撃命中回数別の効果」の数える窓と、過熱II・III の維持の終わり（{ stateEnd }）が見る
   */
  prediction: { name: { ja: '完全計算', en: 'Prediction' }, holder: 'ally' },
  /** 同: S1 の「放熱」（自分。中身はリロード比率▼。最大装弾数のリロード完了で解除。V-0735）。S1 の「放熱状態の時に限り」が見る */
  heatEmission: { name: { ja: '放熱', en: 'Heat Emission' }, holder: 'ally' },
  /** 同: S2 の「過熱I」（自分。中身は攻撃力▲。最大装弾リロード完了時に解除）。過熱II の「過熱I 状態の時に限り」が見る */
  overheatI: { name: { ja: '過熱I', en: 'Overheat I' }, holder: 'ally' },
  /** 同: S2 の「過熱II」（自分。中身は攻撃力▲。完全計算の終わりまで）。過熱III の「過熱II 状態の時に限り」が見る */
  overheatII: { name: { ja: '過熱II', en: 'Overheat II' }, holder: 'ally' },
  /** 同: S2 の「過熱III」（自分。中身は攻撃ダメージ▲。完全計算の終わりまで） */
  overheatIII: { name: { ja: '過熱III', en: 'Overheat III' }, holder: 'ally' },
  /**
   * ミント・プリカ編（plan/design-mint-prika.md 1 節）: ステージパート：ボーカル（ミントのバースト。プリカの S2 のアンコールがシンガロングの
   * スキル発動者に付ける。持続・解除不可。ダンスと入れ替わる。ミントの S1・S2 の「ボーカル状態なら」が見る）
   */
  assignedPartSinging: {
    name: { ja: 'ステージパート：ボーカル', en: 'Assigned Part: Singing' },
    holder: 'ally',
    group: 'assignedPart',
  },
  /** 同: ステージパート：ダンス（ミントのバースト。持続・解除不可。ボーカルと入れ替わる。ミントのバースト・S1 の「ダンス状態なら」が見る） */
  assignedPartDancing: {
    name: { ja: 'ステージパート：ダンス', en: 'Assigned Part: Dancing' },
    holder: 'ally',
    group: 'assignedPart',
  },
  /** 同: ボーカルエフェクト（ミントの S1。味方全体・3 秒。中身はスキル発動者基準の攻撃力▲） */
  singingEffect: { name: { ja: 'ボーカルエフェクト', en: 'Singing Effect' }, holder: 'ally' },
  /** 同: ダンスエフェクト（ミントの S1。味方全体・3 秒。中身は持続回復で、ダメージに関係しない） */
  dancingEffect: { name: { ja: 'ダンスエフェクト', en: 'Dancing Effect' }, holder: 'ally' },
  /**
   * 同: シンガロング（ミントのバースト。味方全体・10 秒。中身は攻撃ダメージ▲・最大装弾数▲・クリティカルダメージ▲。ミントの S2 の
   * 「シンガロング状態でなければ」とプリカの S2 の「シンガロングが適用された時」が見る）
   */
  singAlong: { name: { ja: 'シンガロング', en: 'Sing Along' }, holder: 'ally' },
  /**
   * 同: パフォーマンス（プリカのバースト。味方全体・25 秒・解除不可。中身はチャージダメージ▲。プリカの S1・S2 の「パフォーマンス状態なら」が
   * 見る。アンコールで維持が延びる）
   */
  performance: { name: { ja: 'パフォーマンス', en: 'Performance' }, holder: 'ally' },
  /** 同: アンコール（プリカの S2。項目ごとに対象が違うので、付いた記録だけの名前） */
  encore: { name: { ja: 'アンコール', en: 'Encore' }, holder: 'ally' },
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

/** プリバティ編: 付与に中身を書かない敵の状態か */
export function namedStateWithoutContents(id: NamedStateId): boolean {
  return (NAMED_STATES[id] as NamedStateInfo).withoutContents === true;
}

/** 課題 2-59: デバフ解除で外れる状態か */
export function namedStateIsDebuff(id: NamedStateId): boolean {
  return (NAMED_STATES[id] as NamedStateInfo).debuff === true;
}

/** ミント・プリカ編: 状態の切り替えの組（無ければ undefined） */
export function namedStateGroup(id: NamedStateId): StateSwitchGroup | undefined {
  return (NAMED_STATES[id] as NamedStateInfo).group;
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
