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

export function elementMultiplier(attacker: Element, enemy: Element | null): number {
  return isAdvantage(attacker, enemy) ? ELEMENT_ADVANTAGE_MULTIPLIER : 1;
}
