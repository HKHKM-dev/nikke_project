// @vitest-environment happy-dom
// 絞り込みの表の読み込み（useFilterTable.ts）: 要るときに 1 回だけ読み、画面全体で使い回す。読めなかったら retry で読み直す。
// 表はモジュールに 1 つなので、テストごとにモジュールを読み直す
import type { FilterTable } from '@nikke/core';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loadFilterTable = vi.hoisted(() => vi.fn<() => Promise<FilterTable>>());
vi.mock('@nikke/core', () => ({ loadFilterTable }));

const TABLE = { formatVersion: 1, characters: {} } as unknown as FilterTable;

async function freshHook() {
  vi.resetModules();
  return (await import('./useFilterTable.ts')).useFilterTable;
}

beforeEach(() => {
  loadFilterTable.mockReset();
  loadFilterTable.mockResolvedValue(TABLE);
});
afterEach(cleanup);

describe('useFilterTable', () => {
  it('does not load until enabled, then loads once and shares the table', async () => {
    const useFilterTable = await freshHook();
    const a = renderHook(({ enabled }) => useFilterTable(enabled), { initialProps: { enabled: false } });
    expect(loadFilterTable).not.toHaveBeenCalled();
    a.rerender({ enabled: true });
    await waitFor(() => expect(a.result.current.table).toBe(TABLE));
    // あとから使う所（描き直されたニケ一覧）は、読み直さずに最初の描画から表を持つ
    const b = renderHook(() => useFilterTable(true));
    expect(b.result.current.table).toBe(TABLE);
    expect(loadFilterTable).toHaveBeenCalledTimes(1);
  });

  it('shares one load between hooks enabled at the same time', async () => {
    const useFilterTable = await freshHook();
    const a = renderHook(() => useFilterTable(true));
    const b = renderHook(() => useFilterTable(true));
    await waitFor(() => expect(a.result.current.table).toBe(TABLE));
    await waitFor(() => expect(b.result.current.table).toBe(TABLE));
    expect(loadFilterTable).toHaveBeenCalledTimes(1);
  });

  it('keeps the error without loading again, and loads again on retry', async () => {
    const useFilterTable = await freshHook();
    loadFilterTable.mockRejectedValueOnce(new Error('formatVersion 2'));
    const { result, rerender } = renderHook(() => useFilterTable(true));
    await waitFor(() => expect(result.current.error).toBe('formatVersion 2'));
    expect(result.current.table).toBeNull();
    rerender();
    expect(loadFilterTable).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.table).toBe(TABLE));
    expect(result.current.error).toBeNull();
    expect(loadFilterTable).toHaveBeenCalledTimes(2);
  });
});
