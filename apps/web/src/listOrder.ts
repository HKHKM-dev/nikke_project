// キャラの一覧の並び（plan/design-combat-power-sort.md 6 節）。React に依存しない純関数だけを置く。
// 名前順と戦闘力順。戦闘力順は、育成状況にいるキャラを戦闘力の降順で先に並べ、いないキャラ（と戦闘力を出せないキャラ）を
// その後に名前順で並べる。戦闘力が同じキャラの実機の一覧での順は分かっていないので、仮に名前順にする（4 節）。
import {
  combatCharacterOf,
  snapshotCombatPower,
  type BuildMasters,
  type BuildSnapshot,
  type CharacterIndexEntry,
  type CombatPowerTable,
} from '@nikke/core';

export type ListOrder = 'name' | 'combatPower';
export const LIST_ORDERS: readonly ListOrder[] = ['name', 'combatPower'];
export const LIST_ORDER_LABEL: Record<ListOrder, string> = { name: '名前順', combatPower: '戦闘力順' };
export const LIST_ORDER_STORAGE_KEY = 'nikke-calc.listOrder';

/** 保存した並び。無い・知らない値は null（既定に従う） */
export function parseListOrder(v: string | null): ListOrder | null {
  return (LIST_ORDERS as readonly (string | null)[]).includes(v) ? (v as ListOrder) : null;
}

/** 使う並び。既定は、育成状況があれば戦闘力順、無ければ名前順。育成状況が無ければ戦闘力順は選べない */
export function effectiveListOrder(saved: ListOrder | null, hasRoster: boolean): ListOrder {
  return hasRoster ? (saved ?? 'combatPower') : 'name';
}

export type RosterCombatPowers = {
  /** resourceId → 戦闘力 */
  powers: ReadonlyMap<number, number>;
  /** 戦闘力を出せなかったキャラ（表に無い・育成状況の値がキャラに合わない） */
  failed: readonly number[];
};

/** 育成状況の全キャラの戦闘力 */
export function rosterCombatPowers(
  roster: BuildSnapshot,
  table: CombatPowerTable,
  masters: BuildMasters,
): RosterCombatPowers {
  const powers = new Map<number, number>();
  const failed: number[] = [];
  for (const [id, entry] of Object.entries(roster.characters)) {
    const resourceId = Number(id);
    const character = combatCharacterOf(table, resourceId);
    try {
      if (character === undefined) throw new Error('not in the combat table');
      powers.set(resourceId, snapshotCombatPower(character, entry, masters).value);
    } catch {
      failed.push(resourceId);
    }
  }
  return { powers, failed };
}

const byName = (a: CharacterIndexEntry, b: CharacterIndexEntry) => a.name.ja.localeCompare(b.name.ja, 'ja');

/** 一覧に出す順に並べたキャラ */
export function orderCharacters(
  index: readonly CharacterIndexEntry[],
  order: ListOrder,
  powers: ReadonlyMap<number, number>,
): CharacterIndexEntry[] {
  if (order === 'name') return [...index].sort(byName);
  return [...index].sort((a, b) => {
    const pa = powers.get(a.resourceId);
    const pb = powers.get(b.resourceId);
    if (pa !== undefined && pb !== undefined) return pb - pa || byName(a, b);
    if (pa !== undefined || pb !== undefined) return pa !== undefined ? -1 : 1;
    return byName(a, b);
  });
}

/** 一覧に添える戦闘力（戦闘力順のときだけ。出せないキャラは null） */
export function combatPowerNote(
  order: ListOrder,
  powers: ReadonlyMap<number, number>,
  resourceId: number,
): string | null {
  const value = order === 'combatPower' ? powers.get(resourceId) : undefined;
  return value === undefined ? null : `（戦闘力 ${value.toLocaleString('ja-JP')}）`;
}
