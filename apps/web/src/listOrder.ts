// キャラの一覧の並び（plan/design-combat-power-sort.md 6 節）。React に依存しない純関数だけを置く。
// 名前順・ID 順と、値で並べる順（戦闘力順・OP 順）。値で並べる順は、値のあるキャラを先に並べ、無いキャラ（育成状況にいない・
// 戦闘力を出せない）をその後に名前順で並べる。値が同じキャラは名前順（戦闘力が同じキャラの実機の一覧での順は、育成データに出ない
// 値で決まる。C-0989。7 節）。OP 順は、育成状況の 4 部位の OL 装備の行のうち、そのオプションの上昇値（%）の合計で並べる。
import type { CharacterIndexEntry, OverloadOption } from '@nikke/core';

export type ListOrder = 'combatPower' | 'name' | 'id' | 'attackOverload' | 'elementOverload' | 'attackElementOverload';
/** 選ぶ欄に出す順 */
export const LIST_ORDERS: readonly ListOrder[] = [
  'combatPower',
  'name',
  'id',
  'attackOverload',
  'elementOverload',
  'attackElementOverload',
];
export const LIST_ORDER_LABEL: Record<ListOrder, string> = {
  combatPower: '戦闘力',
  name: '名前',
  id: 'ID',
  attackOverload: '攻撃力OP',
  elementOverload: '有利コードOP',
  attackElementOverload: '攻撃＋有利OP',
};
/** OP 順が足し合わせる OL のオプション（攻撃力▲・有利コード▲） */
export const OVERLOAD_ORDER_OPTIONS: Partial<Record<ListOrder, readonly OverloadOption[]>> = {
  attackOverload: ['attack'],
  elementOverload: ['elementDamage'],
  attackElementOverload: ['attack', 'elementDamage'],
};
export const LIST_ORDER_STORAGE_KEY = 'nikke-calc.listOrder';

/** 並びの向き（昇順・降順）。モダン UI のニケ一覧の ▲▼ のボタンで切り替える */
export type ListDirection = 'asc' | 'desc';
export const LIST_DIRECTION_LABEL: Record<ListDirection, string> = { asc: '昇順', desc: '降順' };
/** 並びの向きの印 */
export const LIST_DIRECTION_MARK: Record<ListDirection, string> = { asc: '▲', desc: '▼' };
/** OP 順を選んでいるが育成状況が無いときの知らせ */
export const OVERLOAD_WITHOUT_ROSTER_HINT = '育成状況を読み込んでいないので、OP 順は名前順で並べる';
export const LIST_DIRECTION_STORAGE_KEY = 'nikke-calc.listDirection';

/** 保存した向き。無い・知らない値は null（並びの既定の向きに従う） */
export function parseListDirection(v: string | null): ListDirection | null {
  return v === 'asc' || v === 'desc' ? v : null;
}

/** 並びの既定の向き: 名前順・ID 順は昇順、値で並べる順（戦闘力順・OP 順）は降順（高い順） */
export function defaultListDirection(order: ListOrder): ListDirection {
  return order === 'name' || order === 'id' ? 'asc' : 'desc';
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
 * 一覧に出す順に並べたキャラ。名前順・ID 順の降順は逆順。値で並べる順（values はその値。戦闘力・OP の合計）は、向きに依らず
 * 値の無いキャラを後ろに名前順で並べ、同じ値のキャラも名前順にする（向きで逆にするのは値の大小だけ）
 */
export function orderCharacters(
  index: readonly CharacterIndexEntry[],
  order: ListOrder,
  values: ReadonlyMap<number, number>,
  direction: ListDirection = defaultListDirection(order),
): CharacterIndexEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  if (order === 'name') return [...index].sort((a, b) => sign * byName(a, b));
  if (order === 'id') return [...index].sort((a, b) => sign * (a.resourceId - b.resourceId));
  return [...index].sort((a, b) => {
    const pa = values.get(a.resourceId);
    const pb = values.get(b.resourceId);
    if (pa === undefined || pb === undefined)
      return Number(pa === undefined) - Number(pb === undefined) || byName(a, b);
    return sign * (pa - pb) || byName(a, b);
  });
}
