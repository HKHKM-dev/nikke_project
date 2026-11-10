// キャラの一覧の並び（plan/design-combat-power-sort.md 6 節）。React に依存しない純関数だけを置く。
// 名前順と戦闘力順。戦闘力順は、育成状況にいるキャラを戦闘力の降順で先に並べ、いないキャラ（と戦闘力を出せないキャラ）を
// その後に名前順で並べる。戦闘力が同じキャラの実機の一覧での順は、育成データに出ない値で決まるので（C-0989）、名前順にする（7 節）。
import type { CharacterIndexEntry } from '@nikke/core';

export type ListOrder = 'name' | 'combatPower';
export const LIST_ORDERS: readonly ListOrder[] = ['name', 'combatPower'];
export const LIST_ORDER_LABEL: Record<ListOrder, string> = { name: '名前順', combatPower: '戦闘力順' };
export const LIST_ORDER_STORAGE_KEY = 'nikke-calc.listOrder';

/** 並びの向き（昇順・降順）。モダン UI のニケ一覧の ▲▼ のボタンで切り替える */
export type ListDirection = 'asc' | 'desc';
export const LIST_DIRECTION_LABEL: Record<ListDirection, string> = { asc: '昇順', desc: '降順' };
export const LIST_DIRECTION_STORAGE_KEY = 'nikke-calc.listDirection';

/** 保存した向き。無い・知らない値は null（並びの既定の向きに従う） */
export function parseListDirection(v: string | null): ListDirection | null {
  return v === 'asc' || v === 'desc' ? v : null;
}

/** 並びの既定の向き: 名前順は昇順、戦闘力順は降順（強い順） */
export function defaultListDirection(order: ListOrder): ListDirection {
  return order === 'name' ? 'asc' : 'desc';
}

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

/**
 * 一覧に出す順に並べたキャラ。名前順の降順は名前の逆順。戦闘力順は、向きに依らず戦闘力の無いキャラを後ろに名前順で並べ、
 * 同じ戦闘力のキャラも名前順にする（向きで逆にするのは戦闘力の大小だけ）
 */
export function orderCharacters(
  index: readonly CharacterIndexEntry[],
  order: ListOrder,
  powers: ReadonlyMap<number, number>,
  direction: ListDirection = defaultListDirection(order),
): CharacterIndexEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  if (order === 'name') return [...index].sort((a, b) => sign * byName(a, b));
  return [...index].sort((a, b) => {
    const pa = powers.get(a.resourceId);
    const pb = powers.get(b.resourceId);
    if (pa === undefined || pb === undefined)
      return (pa === undefined ? 1 : 0) - (pb === undefined ? 1 : 0) || byName(a, b);
    return sign * (pa - pb) || byName(a, b);
  });
}
