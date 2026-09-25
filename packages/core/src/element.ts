import type { Element } from './types.ts';

/** 並びは相性の循環（灼熱→風圧→鉄甲→電撃→水冷）。画面の選択肢もこの順 */
export const ELEMENTS = ['Fire', 'Wind', 'Iron', 'Electronic', 'Water'] as const satisfies readonly Element[];

export const ELEMENT_LABEL: Record<Element, { ja: string; en: string }> = {
  Fire: { ja: '灼熱', en: 'Fire' },
  Wind: { ja: '風圧', en: 'Wind' },
  Iron: { ja: '鉄甲', en: 'Iron' },
  Electronic: { ja: '電撃', en: 'Electric' },
  Water: { ja: '水冷', en: 'Water' },
};

/** 属性相性: 灼熱→風圧→鉄甲→電撃→水冷→灼熱（左が右に有利） */
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
