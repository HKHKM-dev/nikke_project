// キャラの一覧の並び（listOrder.ts）の状態: 選んだ並び（ブラウザに覚える）と、育成状況の戦闘力。
// 戦闘力の表（data/characters/combat.json）は、戦闘力順のとき（と、育成状況があるとき）に読む。戦闘力順はいつも選べ、
// スペック固定のときと育成状況が無いときは、スペック固定の値で計算した戦闘力（core の fixedSpecCombatPowers）で並べる。
// 版と形は読み込み（loadCombatPowerTable）が確かめ、違えば tableError にする（デプロイの直後に古い JS と新しい表が混ざっても、
// 画面全体を落とさない）
import {
  combatCharacterOf,
  fixedSpecCombatPowers,
  loadCombatPowerTable,
  overloadTotal,
  snapshotCombatPowers,
  type BuildMasters,
  type BuildSnapshot,
  type CombatPowerTable,
} from '@nikke/core';
import { createContext, useEffect, useMemo, useState } from 'react';
import {
  LIST_DIRECTION_STORAGE_KEY,
  LIST_ORDER_STORAGE_KEY,
  OVERLOAD_ORDER_OPTIONS,
  defaultListDirection,
  effectiveListOrder,
  parseListDirection,
  parseListOrder,
  type ListDirection,
  type ListOrder,
} from './listOrder.ts';
import { readStorage, removeStorage, writeStorage } from './storage.ts';

/** 一覧（トレイ・選択肢）と未対応の一覧が読む、いまの並びと、値で並べる順の値（戦闘力・OP の合計。名前順・ID 順は空） */
export type ListOrderState = { order: ListOrder; direction: ListDirection; values: ReadonlyMap<number, number> };
export const ListOrderContext = createContext<ListOrderState>({ order: 'name', direction: 'asc', values: new Map() });

/** 並べ替えの操作（クラシックの「一覧の並び」の欄・モダン UI のニケ一覧の「並べ替え」） */
export type ListOrderControls = {
  order: ListOrder;
  /** 並びを選ぶ。向きは、その並びの既定の向きに戻す */
  select: (order: ListOrder) => void;
  direction: ListDirection;
  /** 昇順と降順を入れ替える */
  toggleDirection: () => void;
  /** 戦闘力がスペック固定の値で計算したものか（スペック固定のときと、育成状況が無いとき） */
  fixedSpecPowers: boolean;
  /** 戦闘力を出せなかったキャラの数 */
  failedCount: number;
  /** 戦闘力の表を読めなかった理由 */
  tableError: string | null;
  /** OP 順を選んでいるが、育成状況が無い（全員を名前順で並べる） */
  overloadWithoutRoster: boolean;
};

export function useListOrder(
  roster: BuildSnapshot | null,
  masters: BuildMasters | null,
  baseUrl: string,
  fixedSpec: boolean,
): { controls: ListOrderControls; state: ListOrderState } {
  const [saved, setSaved] = useState(() => parseListOrder(readStorage(LIST_ORDER_STORAGE_KEY)));
  const [savedDirection, setSavedDirection] = useState(() =>
    parseListDirection(readStorage(LIST_DIRECTION_STORAGE_KEY)),
  );
  const [table, setTable] = useState<CombatPowerTable | null>(null);
  const [tableError, setTableError] = useState<string | null>(null);

  const order = effectiveListOrder(saved, roster !== null);
  // 覚えた向きは、覚えた並びのときだけ使う（育成状況の有無で並びが変わったときに、別の並びへ持ち越さない）
  const direction = (saved === order ? savedDirection : null) ?? defaultListDirection(order);
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
  // OP 順の値は、スペック固定でも育成状況の装備から出す（スペック固定の装備に OL は無い）。出せないキャラは値なし（後ろに回る）
  const overloadOptions = OVERLOAD_ORDER_OPTIONS[order];
  const overloads = useMemo(() => {
    if (overloadOptions === undefined || roster === null || masters === null) return undefined;
    const out = new Map<number, number>();
    for (const [id, character] of Object.entries(roster.characters)) {
      try {
        out.set(Number(id), overloadTotal(character, masters, overloadOptions));
      } catch {
        // 知らないオプション・Lv の行があるキャラは並べない
      }
    }
    return out;
  }, [overloadOptions, roster, masters]);
  const values = order === 'combatPower' ? powers : overloads;
  const state = useMemo<ListOrderState>(
    () => ({ order, direction, values: values ?? new Map() }),
    [order, direction, values],
  );

  const select = (next: ListOrder) => {
    setSaved(next);
    writeStorage(LIST_ORDER_STORAGE_KEY, next);
    setSavedDirection(null);
    removeStorage(LIST_DIRECTION_STORAGE_KEY);
  };
  const toggleDirection = () => {
    const next = direction === 'asc' ? 'desc' : 'asc';
    setSaved(order);
    writeStorage(LIST_ORDER_STORAGE_KEY, order);
    setSavedDirection(next);
    writeStorage(LIST_DIRECTION_STORAGE_KEY, next);
  };

  return {
    controls: {
      order,
      select,
      direction,
      toggleDirection,
      fixedSpecPowers,
      failedCount: computed?.failures.length ?? 0,
      overloadWithoutRoster: overloadOptions !== undefined && roster === null,
      tableError,
    },
    state,
  };
}
