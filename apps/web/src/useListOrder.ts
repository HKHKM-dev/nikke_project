// キャラの一覧の並び（listOrder.ts）の状態: 選んだ並び（ブラウザに覚える）と、育成状況の戦闘力。
// 戦闘力の表（data/characters/combat.json）は、戦闘力順のとき（と、育成状況があるとき）に読む。戦闘力順はいつも選べ、
// スペック固定のときと育成状況が無いときは、スペック固定の値で計算した戦闘力（core の fixedSpecCombatPowers）で並べる。
// 版と形は読み込み（loadCombatPowerTable）が確かめ、違えば tableError にする（デプロイの直後に古い JS と新しい表が混ざっても、
// 画面全体を落とさない）
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
  /** 戦闘力がスペック固定の値で計算したものか（スペック固定のときと、育成状況が無いとき） */
  fixedSpecPowers: boolean;
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

  const order = effectiveListOrder(saved, roster !== null);
  const fixedSpecPowers = fixedSpec || roster === null;
  const needTable = order === 'combatPower' || roster !== null;
  useEffect(() => {
    if (!needTable || table !== null) return;
    loadCombatPowerTable({ baseUrl }).then(setTable, (e: unknown) =>
      setTableError(e instanceof Error ? e.message : String(e)),
    );
  }, [needTable, table, baseUrl]);

  // スペック固定の戦闘力は育成状況に依らないので、育成状況を読み込み直しても計算し直さない
  const fixedComputed = useMemo(
    () => (table === null || masters === null ? null : fixedSpecCombatPowers(table, masters)),
    [table, masters],
  );
  const rosterComputed = useMemo(
    () =>
      table === null || masters === null || roster === null
        ? null
        : snapshotCombatPowers(roster, (id) => combatCharacterOf(table, id), masters),
    [roster, table, masters],
  );
  const computed = fixedSpecPowers ? fixedComputed : rosterComputed;
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
      fixedSpecPowers,
      failedCount: computed?.failures.length ?? 0,
      tableError,
    },
    state,
  };
}
