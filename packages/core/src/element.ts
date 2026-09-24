import type { Element } from './types.ts';

export const ELEMENTS = ['Fire', 'Water', 'Wind', 'Electronic', 'Iron'] as const satisfies readonly Element[];

export const ELEMENT_LABEL: Record<Element, { ja: string; en: string }> = {
  Fire: { ja: '炎', en: 'Fire' },
  Water: { ja: '水', en: 'Water' },
  Wind: { ja: '風', en: 'Wind' },
  Electronic: { ja: '電撃', en: 'Electric' },
  Iron: { ja: '鉄', en: 'Iron' },
};

/** 属性相性: 炎→風→鉄→電撃→水→炎（左が右に有利） */
const STRONG_AGAINST: Record<Element, Element> = {
  Fire: 'Wind',
  Wind: 'Iron',
  Iron: 'Electronic',
  Electronic: 'Water',
  Water: 'Fire',
};

export const ELEMENT_ADVANTAGE_MULTIPLIER = 1.1;

export function isAdvantage(attacker: Element, enemy: Element | null): boolean {
  return enemy !== null && STRONG_AGAINST[attacker] === enemy;
}

/**
 * 属性の乗数。有利なら 1.1 + bonus、それ以外は 1（Stage 13: bonus は有利コードの攻撃ダメージ▲の合計 elementDamage。
 * 非有利では乗らない。要件 5.1 節の「属性有利 (1.1 + 属性ダメバフ)」）
 */
export function elementMultiplier(attacker: Element, enemy: Element | null, bonus = 0): number {
  return isAdvantage(attacker, enemy) ? ELEMENT_ADVANTAGE_MULTIPLIER + bonus : 1;
}
