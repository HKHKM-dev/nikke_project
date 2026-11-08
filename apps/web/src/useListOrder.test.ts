// キャラの一覧の並びのフック（useListOrder.ts。plan/design-combat-power-sort.md 6 節）: 覚えた並びと、育成状況かスペック固定の戦闘力。
// 戦闘力の表とマスタは置いてあるデータ（packages/core/data）を読む
import { readFileSync } from 'node:fs';
import {
  MASTER_FILES,
  characterIndexPath,
  combatCharacterOf,
  combatTablePath,
  emptyBuild,
  fixedSpecCombatPowers,
  masterDataPath,
  snapshotCombatPower,
  type BuildMasters,
  type BuildSnapshot,
  type CharacterIndex,
  type CombatPowerTable,
  type SnapshotCharacter,
} from '@nikke/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupHooks, flush, memoryStorage, renderHook } from './hookHarness.ts';
import { LIST_ORDER_STORAGE_KEY } from './listOrder.ts';
import { useListOrder } from './useListOrder.ts';

/** 置いてあるデータの文（パスは画面が読むのと同じ。packages/core/src/load.ts） */
const text = (path: string): string =>
  readFileSync(new URL(`../../../packages/core/data/${path}`, import.meta.url), 'utf8');
/** 表の文は fetch の返しにそのまま使う（読み込みのたびに直列化し直さない） */
const tableText = text(combatTablePath());
const table = JSON.parse(tableText) as CombatPowerTable;
const masters = Object.fromEntries(
  Object.keys(MASTER_FILES).map((k) => [k, JSON.parse(text(masterDataPath(k as keyof BuildMasters)))]),
) as BuildMasters;
const ssr = (JSON.parse(text(characterIndexPath())) as CharacterIndex).characters.find((c) => c.rarity === 'SSR')!;

const entry: SnapshotCharacter = {
  ...emptyBuild(),
  growth: { level: 300, grade: 3, core: 2 },
  affectionRank: 10,
  skillLevels: { skill1: 10, skill2: 10, burst: 10 },
  treasure: null,
};
/** 戦闘力を出せる SSR と、キャラのデータに無い 1 体 */
const ROSTER: BuildSnapshot = {
  formatVersion: 1,
  fetchedAt: '2026-10-29T00:00:00Z',
  synchroLevel: 300,
  recycleRoom: {},
  characters: { [ssr.resourceId]: entry, '-1': entry },
  unmapped: [],
};
const POWER = snapshotCombatPower(combatCharacterOf(table, ssr.resourceId)!, entry, masters).value;
/** スペック固定の値で計算した戦闘力（スペック固定のときと、育成状況が無いとき） */
const FIXED = fixedSpecCombatPowers(table, masters);

let storage: Storage;
let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;

beforeEach(() => {
  storage = memoryStorage();
  fetchMock = vi.fn(async () => new Response(tableText, { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  await cleanupHooks();
  vi.unstubAllGlobals();
});

type Props = { roster: BuildSnapshot | null; masters: BuildMasters | null; baseUrl: string; fixedSpec: boolean };
const DEFAULTS: Props = { roster: ROSTER, masters, baseUrl: '/base', fixedSpec: false };
const render = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useListOrder(p.roster, p.masters, p.baseUrl, p.fixedSpec), { ...DEFAULTS, ...props });

describe('useListOrder', () => {
  it('uses the name order without a roster or a saved order, and does not load the table', async () => {
    const hook = await render({ roster: null });
    await flush();
    expect(hook.current.controls).toMatchObject({
      order: 'name',
      fixedSpecPowers: true,
      failedCount: 0,
      tableError: null,
    });
    expect(hook.current.state).toEqual({ order: 'name', powers: new Map() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('orders by the fixed-spec power without a roster once the combat power order is chosen', async () => {
    const hook = await render({ roster: null });
    await act(() => hook.current.controls.select('combatPower'));
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.current.state).toEqual({ order: 'combatPower', powers: FIXED.powers });
    expect(hook.current.controls).toMatchObject({ fixedSpecPowers: true, failedCount: FIXED.failures.length });
  });

  it('loads the table once with a roster, defaults to the combat power order, and counts the failures', async () => {
    const hook = await render();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^\/base\/.*combat\.json$/);
    expect(hook.current.state).toEqual({ order: 'combatPower', powers: new Map([[ssr.resourceId, POWER]]) });
    expect(hook.current.controls).toMatchObject({
      order: 'combatPower',
      fixedSpecPowers: false,
      failedCount: 1,
      tableError: null,
    });
    // 育成状況が替わっても読み直さない
    await hook.rerender({ ...DEFAULTS, roster: { ...ROSTER, characters: { [ssr.resourceId]: entry } } });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.current.controls.failedCount).toBe(0);
  });

  it('uses the fixed-spec power under the fixed spec even with a roster', async () => {
    const hook = await render({ fixedSpec: true });
    await flush();
    expect(hook.current.state).toEqual({ order: 'combatPower', powers: FIXED.powers });
    expect(hook.current.controls.fixedSpecPowers).toBe(true);
    await hook.rerender(DEFAULTS);
    expect(hook.current.state.powers).toEqual(new Map([[ssr.resourceId, POWER]]));
    expect(hook.current.controls.fixedSpecPowers).toBe(false);
  });

  it('waits for the masters before computing the powers', async () => {
    const hook = await render({ masters: null });
    await flush();
    expect(hook.current.state.powers).toEqual(new Map());
    await hook.rerender(DEFAULTS);
    expect(hook.current.state.powers).toEqual(new Map([[ssr.resourceId, POWER]]));
  });

  it('keeps the selected order in the browser, and ignores an unknown saved value', async () => {
    storage.setItem(LIST_ORDER_STORAGE_KEY, 'name');
    const hook = await render();
    expect(hook.current.controls.order).toBe('name');
    // 名前順でも、育成状況があれば表を読む
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => hook.current.controls.select('combatPower'));
    expect(hook.current.controls.order).toBe('combatPower');
    expect(storage.getItem(LIST_ORDER_STORAGE_KEY)).toBe('combatPower');

    storage.setItem(LIST_ORDER_STORAGE_KEY, 'level');
    expect((await render()).current.controls.order).toBe('combatPower');
    expect((await render({ roster: null })).current.controls.order).toBe('name');
  });

  it('shows why the table did not load', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    const hook = await render();
    await flush();
    expect(hook.current.controls.tableError).toMatch(/combat\.json -> HTTP 404$/);
    expect(hook.current.state.powers).toEqual(new Map());
    // Error でない理由は文字列にする
    fetchMock.mockRejectedValue('offline');
    const offline = await render();
    await flush();
    expect(offline.current.controls.tableError).toBe('offline');
  });
});
