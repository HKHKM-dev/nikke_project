// キャラの一覧の並び（listOrder.ts）の状態: 選んだ並び（ブラウザに覚える）と、育成状況の戦闘力。
// 戦闘力の表（data/characters/combat.json）は、戦闘力順を選べるとき（育成状況があるか、スペック固定のとき）だけ読む。
// スペック固定のときは、育成状況でなくスペック固定の値で計算した戦闘力（core の fixedSpecCombatPowers）で並べる
import {
  combatCharacterOf,
  fixedSpecCombatPowers,
  loadCombatPowerTable,
  snapshotCombatPowers,
  type BuildMasters,
  type BuildSnapshot,
  type CombatPowerTable,
} from '@nikke/core';
import { createContext, useEffect, useMemo, useState } from 'react';
import { LIST_ORDER_STORAGE_KEY, effectiveListOrder, parseListOrder, type ListOrder } from './listOrder.ts';
import { readStorage, writeStorage } from './storage.ts';

/** 一覧（トレイ・選択肢）と未対応の一覧が読む、いまの並びと戦闘力 */
export type ListOrderState = { order: ListOrder; powers: ReadonlyMap<number, number> };
export const ListOrderContext = createContext<ListOrderState>({ order: 'name', powers: new Map() });

/** 設定のメニューの「一覧の並び」の欄 */
export type ListOrderControls = {
  order: ListOrder;
  select: (order: ListOrder) => void;
  /** 戦闘力順を選べるか（育成状況があるか、スペック固定のとき） */
  combatPowerAvailable: boolean;
  /** スペック固定（戦闘力はスペック固定の値で計算したもの） */
  fixedSpec: boolean;
  /** 戦闘力を出せなかったキャラの数 */
  failedCount: number;
  /** 戦闘力の表を読めなかった理由 */
  tableError: string | null;
};

export function useListOrder(
  roster: BuildSnapshot | null,
  masters: BuildMasters | null,
  baseUrl: string,
  fixedSpec: boolean,
): { controls: ListOrderControls; state: ListOrderState } {
  const [saved, setSaved] = useState(() => parseListOrder(readStorage(LIST_ORDER_STORAGE_KEY)));
  const [table, setTable] = useState<CombatPowerTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const available = roster !== null || fixedSpec;
  useEffect(() => {
    if (!available || table !== null) return;
    loadCombatPowerTable({ baseUrl }).then(setTable, (e: unknown) =>
      setTableError(e instanceof Error ? e.message : String(e)),
    );
  }, [available, table, baseUrl]);

  const computed = useMemo(
    () =>
      table === null || masters === null
        ? null
        : fixedSpec
          ? fixedSpecCombatPowers(table, masters)
          : roster === null
            ? null
            : snapshotCombatPowers(roster, (id) => combatCharacterOf(table, id), masters),
    [roster, table, masters, fixedSpec],
  );
  const order = effectiveListOrder(saved, available);
  const powers = computed?.powers;
  const state = useMemo<ListOrderState>(() => ({ order, powers: powers ?? new Map() }), [order, powers]);

  const select = (next: ListOrder) => {
    setSaved(next);
    writeStorage(LIST_ORDER_STORAGE_KEY, next);
  };

  return {
    controls: {
      order,
      select,
      combatPowerAvailable: available,
      fixedSpec,
      failedCount: computed?.failures.length ?? 0,
      tableError,
    },
    state,
  };
}
