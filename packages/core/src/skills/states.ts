// 名前の付いた状態の語彙編（plan/design-named-state.md 5.1 節）: 状態の目録。定義が状態を指すのはこの表の id だけ
// （付与 kind: 'state'・トリガー { applied }・対象の絞り込み targetState・条件 enemyState・dot の state）。
// 目録が持つのは、どの状態か（同一性）・画面の名前・持ち主の側だけ。スタックの上限・維持・中身は付与に書く（同 3.5 節）。
// id は英語版の説明文の状態名の lowerCamelCase（同 5.1 節の id の付け方）。一度付けた id は変えない
import type { LocalizedText } from '../types.ts';

/** 状態を持つ側。ally = 味方の枠、enemy = 敵（1 体の前提） */
export type StateHolder = 'ally' | 'enemy';

export type NamedStateInfo = {
  /** 画面と CLI の名前（日本語は説明文の状態名） */
  name: LocalizedText;
  holder: StateHolder;
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
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 2.1 節）: ゴールデンチップ（ソーダ：トゥインクルバニーの S1。戦闘開始時に 50 個、
   * フルバースト中の通常攻撃 3 回ごとに 1 個。最大 50 スタック・持続・クリティカルダメージ▲。C-0128）
   */
  goldenChip: { name: { ja: 'ゴールデンチップ', en: 'Golden Chip' }, holder: 'ally' },
  /** 同（2.2 節）: リラックス（クラウンの S2。通常攻撃 43 回ごとに 1 スタック・20 スタック・持続。フルスタックで外れて回復。C-0271） */
  relax: { name: { ja: 'リラックス', en: 'Relax' }, holder: 'ally' },
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
