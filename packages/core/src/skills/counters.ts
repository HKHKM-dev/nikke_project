// 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: キャラ固有のカウンタの目録。定義がカウンタを指すのはこの表の id だけ
// （増減 kind: 'counterChange'・条件 selfCounter・付与の stacksFrom）。カウンタは枠ごとに 1 つの整数で、最初は 0、増減の結果は 0 と
// 上限の間で切る。時間では減らない。状態の目録（skills/states.ts）と同じく、目録に足すのはそのカウンタを使うキャラを定義する時
import type { LocalizedText } from '../types.ts';

export type CounterInfo = {
  /** 画面と CLI の名前（日本語は説明文のカウンタの名前） */
  name: LocalizedText;
  /** 上限（増やした結果はここで切る） */
  max: number;
};

export const COUNTERS = {
  /**
   * 火力ゲージ（ネオン：ビジョン・アイの S2・バースト）。戦闘開始時に 100、火力チャージの付与で 1、火力チャージ状態の通常攻撃ごとに 2、
   * 火力チャージ状態の終わりに 45。100 のバーストで超火力にして 100 消費する。上限 100（V-0503）
   */
  firepowerGauge: { name: { ja: '火力ゲージ', en: 'Firepower Gauge' }, max: 100 },
  /**
   * オーバーエネルギー（ラプラス：アルティメットヒーローの S2）。使用武器の変更の中の通常攻撃 12 回ごとに 5（%）、100 で 0 に戻して段階を 1 上げる。
   * 上限 100（説明文の description_value_01。V-0529）
   */
  overEnergy: { name: { ja: 'オーバーエネルギー', en: 'Over Energy' }, max: 100 },
  /** オーバーエネルギーの段階（同じ S2）。オーバーエネルギーが 100 になるたびに 1 上がる。上限 4（説明文の 1〜4 段階。V-0529） */
  overEnergyStage: { name: { ja: 'オーバーエネルギーの段階', en: 'Over Energy stage' }, max: 4 },
  /**
   * 粘着榴弾の付着している数（ラピ：レッドフードの S2。2 段目の段 12 の PR 2。plan/design-skill-stage12.md 2.2 節）。フルバーストの外で
   * 撃った榴弾ごとに 1、フルバーストの始まりに起爆して 0（C-9905）。上限は説明文に無く、読んでいない（0116 では 8 まで溜まった。上限に
   * 届かない大きさにした）
   */
  stickyGrenade: { name: { ja: '付着している粘着榴弾', en: 'Attached sticky grenades' }, max: 99 },
} as const satisfies Record<string, CounterInfo>;

export type CounterId = keyof typeof COUNTERS;

export const COUNTER_IDS = Object.keys(COUNTERS) as CounterId[];

/** カウンタの画面の名前 */
export function counterName(id: CounterId): LocalizedText {
  return COUNTERS[id].name;
}

/** カウンタの上限 */
export function counterMax(id: CounterId): number {
  return COUNTERS[id].max;
}
