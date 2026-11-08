// キャラの一覧の並び（plan/design-combat-power-sort.md 6 節）。React に依存しない純関数だけを置く。
// 名前順と戦闘力順。戦闘力順は、育成状況にいるキャラを戦闘力の降順で先に並べ、いないキャラ（と戦闘力を出せないキャラ）を
// その後に名前順で並べる。戦闘力が同じキャラの実機の一覧での順は、育成データに出ない値で決まるので（C-0989）、名前順にする（7 節）。
import type { CharacterIndexEntry } from '@nikke/core';
import { formatNumber } from './format.ts';

export type ListOrder = 'name' | 'combatPower';
export const LIST_ORDERS: readonly ListOrder[] = ['name', 'combatPower'];
export const LIST_ORDER_LABEL: Record<ListOrder, string> = { name: '名前順', combatPower: '戦闘力順' };
export const LIST_ORDER_STORAGE_KEY = 'nikke-calc.listOrder';

/** 保存した並び。無い・知らない値は null（既定に従う） */
export function parseListOrder(v: string | null): ListOrder | null {
  return (LIST_ORDERS as readonly (string | null)[]).includes(v) ? (v as ListOrder) : null;
}

/** 使う並び。選んだ並びがあればそれ。無ければ、育成状況があれば戦闘力順、無ければ名前順（戦闘力順はいつも選べる） */
export function effectiveListOrder(saved: ListOrder | null, hasRoster: boolean): ListOrder {
  return saved ?? (hasRoster ? 'combatPower' : 'name');
}

const collator = new Intl.Collator('ja');
const byName = (a: CharacterIndexEntry, b: CharacterIndexEntry) => collator.compare(a.name.ja, b.name.ja);

/** 一覧に出す順に並べたキャラ（戦闘力は正の値なので、無いキャラを -1 として降順に並べると後ろに回る） */
export function orderCharacters(
  index: readonly CharacterIndexEntry[],
  order: ListOrder,
  powers: ReadonlyMap<number, number>,
): CharacterIndexEntry[] {
  if (order === 'name') return [...index].sort(byName);
  const power = (c: CharacterIndexEntry) => powers.get(c.resourceId) ?? -1;
  return [...index].sort((a, b) => power(b) - power(a) || byName(a, b));
}

/** 一覧に添える戦闘力（戦闘力順のときだけ。出せないキャラは空） */
export function combatPowerNote(order: ListOrder, powers: ReadonlyMap<number, number>, resourceId: number): string {
  const value = order === 'combatPower' ? powers.get(resourceId) : undefined;
  return value === undefined ? '' : `（戦闘力 ${formatNumber(value)}）`;
}
