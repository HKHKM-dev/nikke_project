// @vitest-environment happy-dom
// キャラの一覧の並びのフック（useListOrder.ts。plan/design-combat-power-sort.md 6 節）: 覚えた並びと、育成状況かスペック固定の戦闘力。
// 戦闘力の表とマスタは置いてあるデータ（packages/core/data）を読む
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIST_DIRECTION_STORAGE_KEY, LIST_ORDER_STORAGE_KEY } from './listOrder.ts';
import { useListOrder } from './useListOrder.ts';

/** 置いてあるデータの文（パスは画面が読むのと同じ。packages/core/src/load.ts）。happy-dom の URL は fs が読めないので、パスで組む */
const text = (path: string): string =>
  readFileSync(join(import.meta.dirname, '../../../packages/core/data', path), 'utf8');
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
  formatVersion: 2,
  fetchedAt: '2026-10-29T00:00:00Z',
  synchroLevel: 300,
  recycleRoom: {},
  characters: { [ssr.resourceId]: entry, '-1': entry },
  unmapped: [],
};
const POWER = snapshotCombatPower(combatCharacterOf(table, ssr.resourceId)!, entry, masters).value;
/** スペック固定の値で計算した戦闘力（スペック固定のときと、育成状況が無いとき） */
const FIXED = fixedSpecCombatPowers(table, masters);

let fetchMock: ReturnType<typeof vi.fn<(url: string) => Promise<Response>>>;

beforeEach(() => {
  localStorage.clear();
  fetchMock = vi.fn(async () => new Response(tableText, { headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 保留中の読み込み（fetch の then）と、それが起こす更新を流す。何かが「起きない」ことを見る前に使う（起きるのを待つのは waitFor） */
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

type Props = { roster: BuildSnapshot | null; masters: BuildMasters | null; baseUrl: string; fixedSpec: boolean };
const DEFAULTS: Props = { roster: ROSTER, masters, baseUrl: '/base', fixedSpec: false };
const render = (props: Partial<Props> = {}) =>
  renderHook((p: Props) => useListOrder(p.roster, p.masters, p.baseUrl, p.fixedSpec), {
    initialProps: { ...DEFAULTS, ...props },
  });

describe('useListOrder', () => {
  it('uses the name order without a roster or a saved order, and does not load the table', async () => {
    const { result } = render({ roster: null });
    await settle();
    expect(result.current.controls).toMatchObject({
      order: 'name',
      fixedSpecPowers: true,
      failedCount: 0,
      tableError: null,
    });
    expect(result.current.state).toEqual({ order: 'name', direction: 'asc', values: new Map() });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('orders by the fixed-spec power without a roster once the combat power order is chosen', async () => {
    const { result } = render({ roster: null });
    act(() => result.current.controls.select('combatPower'));
    await waitFor(() =>
      expect(result.current.state).toEqual({ order: 'combatPower', direction: 'desc', values: FIXED.powers }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.controls).toMatchObject({ fixedSpecPowers: true, failedCount: FIXED.failures.length });
  });

  it('loads the table once with a roster, defaults to the combat power order, and counts the failures', async () => {
    const { result, rerender } = render();
    await waitFor(() =>
      expect(result.current.state).toEqual({
        order: 'combatPower',
        direction: 'desc',
        values: new Map([[ssr.resourceId, POWER]]),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toMatch(/^\/base\/.*combat\.json$/);
    expect(result.current.controls).toMatchObject({
      order: 'combatPower',
      fixedSpecPowers: false,
      failedCount: 1,
      tableError: null,
    });
    // 育成状況が替わっても読み直さない
    rerender({ ...DEFAULTS, roster: { ...ROSTER, characters: { [ssr.resourceId]: entry } } });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.controls.failedCount).toBe(0);
  });

  it('uses the fixed-spec power under the fixed spec even with a roster', async () => {
    const { result, rerender } = render({ fixedSpec: true });
    await waitFor(() =>
      expect(result.current.state).toEqual({ order: 'combatPower', direction: 'desc', values: FIXED.powers }),
    );
    expect(result.current.controls.fixedSpecPowers).toBe(true);
    rerender(DEFAULTS);
    expect(result.current.state.values).toEqual(new Map([[ssr.resourceId, POWER]]));
    expect(result.current.controls.fixedSpecPowers).toBe(false);
  });

  it('waits for the masters before computing the powers', async () => {
    const { result, rerender } = render({ masters: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settle();
    expect(result.current.state.values).toEqual(new Map());
    rerender(DEFAULTS);
    await waitFor(() => expect(result.current.state.values).toEqual(new Map([[ssr.resourceId, POWER]])));
  });

  it('keeps the selected order in the browser, and ignores an unknown saved value', async () => {
    localStorage.setItem(LIST_ORDER_STORAGE_KEY, 'name');
    const { result } = render();
    expect(result.current.controls.order).toBe('name');
    // 名前順でも、育成状況があれば表を読む
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    act(() => result.current.controls.select('combatPower'));
    expect(result.current.controls.order).toBe('combatPower');
    expect(localStorage.getItem(LIST_ORDER_STORAGE_KEY)).toBe('combatPower');

    localStorage.setItem(LIST_ORDER_STORAGE_KEY, 'level');
    expect(render().result.current.controls.order).toBe('combatPower');
    expect(render({ roster: null }).result.current.controls.order).toBe('name');
    // 育成状況のある描画が始めた読み込みを、テストの中で終わらせる
    await settle();
  });

  it('toggles the direction and keeps it in the browser, and resets it to the default when the order is selected', async () => {
    const { result } = render({ roster: null });
    expect(result.current.controls.direction).toBe('asc');
    act(() => result.current.controls.toggleDirection());
    expect(result.current.state.direction).toBe('desc');
    expect(localStorage.getItem(LIST_DIRECTION_STORAGE_KEY)).toBe('desc');
    expect(render({ roster: null }).result.current.controls.direction).toBe('desc');

    act(() => result.current.controls.select('combatPower'));
    expect(result.current.controls.direction).toBe('desc');
    expect(localStorage.getItem(LIST_DIRECTION_STORAGE_KEY)).toBeNull();
    act(() => result.current.controls.toggleDirection());
    expect(result.current.controls.direction).toBe('asc');
    await settle();
  });

  it('keeps the toggled order when the roster comes, and does not carry a direction to another order', async () => {
    const { result, rerender } = render({ roster: null });
    act(() => result.current.controls.toggleDirection());
    expect(localStorage.getItem(LIST_ORDER_STORAGE_KEY)).toBe('name');
    rerender({ ...DEFAULTS });
    expect(result.current.state).toMatchObject({ order: 'name', direction: 'desc' });
    await settle();

    // 並びを覚えていない向きは使わない（育成状況で決まる並びの既定の向き）
    localStorage.clear();
    localStorage.setItem(LIST_DIRECTION_STORAGE_KEY, 'asc');
    const other = render();
    expect(other.result.current.state).toMatchObject({ order: 'combatPower', direction: 'desc' });
    await settle();
  });

  it('orders by the overload total of the roster gear, and flags the overload order without a roster', async () => {
    const { result } = render();
    act(() => result.current.controls.select('attackOverload'));
    // 育成状況の 2 体とも OL 装備が無いので 0
    expect(result.current.state).toEqual({
      order: 'attackOverload',
      direction: 'desc',
      values: new Map([
        [ssr.resourceId, 0],
        [-1, 0],
      ]),
    });
    expect(result.current.controls.overloadWithoutRoster).toBe(false);
    const noRoster = render({ roster: null }).result;
    expect(noRoster.current.state.values).toEqual(new Map());
    expect(noRoster.current.controls.overloadWithoutRoster).toBe(true);
    await settle();
  });

  it('shows why the table did not load', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    const { result } = render();
    await waitFor(() => expect(result.current.controls.tableError).toMatch(/combat\.json -> HTTP 404$/));
    expect(result.current.state.values).toEqual(new Map());
    // Error でない理由は文字列にする
    fetchMock.mockRejectedValue('offline');
    const offline = render().result;
    await waitFor(() => expect(offline.current.controls.tableError).toBe('offline'));
  });
});
