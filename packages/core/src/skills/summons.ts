// キャラ固有の召喚の目録（plan/design-ein-near-feather.md 1.1 節）。定義が召喚を指すのはこの表の id だけ
// （展開 kind: 'summon' と、攻撃 damage のきっかけ { summon }）。カウンタ・状態の目録（skills/counters.ts・skills/states.ts）と同じく、
// 目録に足すのはその召喚を使うキャラを定義する時
import type { LocalizedText } from '../types.ts';

export type SummonInfo = {
  /** 画面と CLI の名前（日本語は説明文の召喚の名前） */
  name: LocalizedText;
};

export const SUMMONS = {
  /**
   * ニアフェザー（アインの S1・S2・バースト）。戦闘開始時に 4 機、バースト使用時に 6 機を展開する（前の組を置き換える）。1 機ずつ維持時間で
   * 消え、展開している機数でニアフェザー攻撃の間隔が決まる（V-0636）
   */
  nearFeather: { name: { ja: 'ニアフェザー', en: 'Near Feather' } },
  /** ミサイルコンテナ（ベスティーのバースト）。バースト使用時に 2 機を呼び出し、18 秒維持する。1 機ずつ 1 秒ごとに攻撃する */
  missileContainer: { name: { ja: 'ミサイルコンテナ', en: 'Missile Container' } },
} as const satisfies Record<string, SummonInfo>;

export type SummonId = keyof typeof SUMMONS;

export const SUMMON_IDS = Object.keys(SUMMONS) as SummonId[];
