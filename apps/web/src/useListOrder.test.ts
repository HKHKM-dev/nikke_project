// キャラの一覧の並びのフック（useListOrder.ts。plan/design-combat-power-sort.md 6 節）: 覚えた並びと、育成状況の戦闘力。
// 戦闘力の表とマスタは置いてあるデータ（packages/core/data）を読む
import { readFileSync } from 'node:fs';
import {
  MASTER_FILES,
  combatCharacterOf,
  emptyBuild,
  snapshotCombatPower,
  type BuildMasters,
  type BuildSnapshot,
  type CharacterIndex,
  type CombatPowerTable,
  type SnapshotCharacter,
} from '@nikke/core';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, memoryStorage, renderHook } from './hookHarness.ts';
import { LIST_ORDER_STORAGE_KEY } from './listOrder.ts';
import { useListOrder } from './useListOrder.ts';

const data = <T>(path: string): T =>
  JSON.parse(readFileSync(new URL(`../../../packages/core/data/${path}`, import.meta.url), 'utf8')) as T;
const table = data<CombatPowerTable>('characters/combat.json');
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, data<unknown>(`masters/${f}`)]),
) as BuildMasters;
const ssr = data<CharacterIndex>('characters/index.json').characters.find((c) => c.rarity === 'SSR')!;

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

let storage: Storage;
let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;

beforeEach(() => {
  storage = memoryStorage();
  fetchMock = vi.fn(async () => Response.json(table));
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', {});
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

type Props = { roster: BuildSnapshot | null; masters: BuildMasters | null; baseUrl: string };
const render = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useListOrder(p.roster, p.masters, p.baseUrl), {
    roster: ROSTER,
    masters,
    baseUrl: '/base',
    ...props,
  });

describe('useListOrder', () => {
  it('uses the name order without a roster, and does not load the table', async () => {
    storage.setItem(LIST_ORDER_STORAGE_KEY, 'combatPower');
    const hook = await render({ roster: null });
    await flush();
    expect(hook.current.controls).toMatchObject({ order: 'name', hasRoster: false, failedCount: 0, tableError: null });
    expect(hook.current.state).toEqual({ order: 'name', powers: new Map() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('loads the table once with a roster, defaults to the combat power order, and counts the failures', async () => {
    const hook = await render();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^\/base\/.*combat\.json$/);
    expect(hook.current.state).toEqual({ order: 'combatPower', powers: new Map([[ssr.resourceId, POWER]]) });
    expect(hook.current.controls).toMatchObject({
      order: 'combatPower',
      hasRoster: true,
      failedCount: 1,
      tableError: null,
    });
    // 育成状況が替わっても読み直さない
    await hook.rerender({ roster: { ...ROSTER, characters: { [ssr.resourceId]: entry } }, masters, baseUrl: '/base' });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(hook.current.controls.failedCount).toBe(0);
  });

  it('waits for the masters before computing the powers', async () => {
    const hook = await render({ masters: null });
    await flush();
    expect(hook.current.state.powers).toEqual(new Map());
    await hook.rerender({ roster: ROSTER, masters, baseUrl: '/base' });
    expect(hook.current.state.powers).toEqual(new Map([[ssr.resourceId, POWER]]));
  });

  it('keeps the selected order in the browser, and ignores an unknown saved value', async () => {
    storage.setItem(LIST_ORDER_STORAGE_KEY, 'name');
    const hook = await render();
    expect(hook.current.controls.order).toBe('name');
    await act(() => hook.current.controls.select('combatPower'));
    expect(hook.current.controls.order).toBe('combatPower');
    expect(storage.getItem(LIST_ORDER_STORAGE_KEY)).toBe('combatPower');

    storage.setItem(LIST_ORDER_STORAGE_KEY, 'level');
    expect((await render()).current.controls.order).toBe('combatPower');
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
