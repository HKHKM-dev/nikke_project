// キャラの一覧の並び（listOrder.ts）の状態: 選んだ並び（ブラウザに覚える）と、育成状況の戦闘力。
// 戦闘力の表（data/characters/combat.json）は、育成状況があるときだけ読む
import {
  combatCharacterOf,
  loadCombatPowerTable,
  snapshotCombatPowers,
  type BuildMasters,
  type BuildSnapshot,
  type CombatPowerTable,
} from '@nikke/core';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  LIST_ORDER_STORAGE_KEY,
  combatPowerNote,
  effectiveListOrder,
  parseListOrder,
  type ListOrder,
} from './listOrder.ts';
import { readStorage, writeStorage } from './storage.ts';

/** 一覧（トレイ・選択肢）と未対応の一覧が読む、いまの並びと戦闘力 */
export type ListOrderState = { order: ListOrder; powers: ReadonlyMap<number, number> };
export const ListOrderContext = createContext<ListOrderState>({ order: 'name', powers: new Map() });

/** 一覧の項目に添える戦闘力（戦闘力順のときだけ。listOrder.ts の combatPowerNote） */
export function useCombatPowerNote(resourceId: number): string {
  const { order, powers } = useContext(ListOrderContext);
  return combatPowerNote(order, powers, resourceId);
}

/** 設定のメニューの「一覧の並び」の欄 */
export type ListOrderControls = {
  order: ListOrder;
  select: (order: ListOrder) => void;
  /** 育成状況があるか（無ければ戦闘力順は選べない） */
  hasRoster: boolean;
  /** 戦闘力を出せなかったキャラの数 */
  failedCount: number;
  /** 戦闘力の表を読めなかった理由 */
  tableError: string | null;
};

export function useListOrder(
  roster: BuildSnapshot | null,
  masters: BuildMasters | null,
  baseUrl: string,
): { controls: ListOrderControls; state: ListOrderState } {
  const [saved, setSaved] = useState(() => parseListOrder(readStorage(LIST_ORDER_STORAGE_KEY)));
  const [table, setTable] = useState<CombatPowerTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const hasRoster = roster !== null;
  useEffect(() => {
    if (!hasRoster || table !== null) return;
    loadCombatPowerTable({ baseUrl }).then(setTable, (e: unknown) =>
      setTableError(e instanceof Error ? e.message : String(e)),
    );
  }, [hasRoster, table, baseUrl]);

  const computed = useMemo(
    () =>
      roster === null || table === null || masters === null
        ? null
        : snapshotCombatPowers(roster, (id) => combatCharacterOf(table, id), masters),
    [roster, table, masters],
  );
  const order = effectiveListOrder(saved, hasRoster);
  const powers = computed?.powers;
  const state = useMemo<ListOrderState>(() => ({ order, powers: powers ?? new Map() }), [order, powers]);

  const select = (next: ListOrder) => {
    setSaved(next);
    writeStorage(LIST_ORDER_STORAGE_KEY, next);
  };

  return {
    controls: { order, select, hasRoster, failedCount: computed?.failures.length ?? 0, tableError },
    state,
  };
}
