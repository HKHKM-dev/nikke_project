// @vitest-environment happy-dom
// キャラのデータのキャッシュ（useCharacterCache.ts）: 画面全体で 1 つに持つ表、先読み、読めなかった後の取り直し。
// 表はモジュールに 1 つで、鍵に baseUrl を含むので、テストごとに baseUrl を変えて分ける
import type { CharacterData } from '@nikke/core';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchCharacters, useCharacterCache } from './useCharacterCache.ts';

const loadCharacter = vi.hoisted(() => vi.fn<(id: number, options: { baseUrl: string }) => Promise<CharacterData>>());
vi.mock('@nikke/core', () => ({ loadCharacter }));

const character = (id: number) => ({ resourceId: id }) as CharacterData;
let n = 0;
/** テストごとに別の表を使う baseUrl */
let base = '';

beforeEach(() => {
  n += 1;
  base = `/t${n}/`;
  loadCharacter.mockReset();
  loadCharacter.mockImplementation((id) => Promise.resolve(character(id)));
});
afterEach(cleanup);

describe('useCharacterCache', () => {
  it('loads each wanted id once, shared by hooks reading at the same time', async () => {
    const a = renderHook(() => useCharacterCache([1, null, 2], base));
    const b = renderHook(() => useCharacterCache([2], base));
    await waitFor(() => expect(a.result.current.characters.size).toBe(2));
    await waitFor(() => expect(b.result.current.characters.get(2)).toEqual(character(2)));
    expect(loadCharacter.mock.calls.map(([id]) => id).sort()).toEqual([1, 2]);
  });

  it('returns a character already loaded elsewhere on the first render, without loading it again', async () => {
    const a = renderHook(() => useCharacterCache([3], base));
    await waitFor(() => expect(a.result.current.characters.has(3)).toBe(true));
    const b = renderHook(() => useCharacterCache([3], base));
    expect(b.result.current.characters.get(3)).toEqual(character(3));
    expect(loadCharacter).toHaveBeenCalledTimes(1);
  });

  it('serves prefetched characters without loading them again', async () => {
    prefetchCharacters([4, null], base);
    await waitFor(() => expect(loadCharacter).toHaveBeenCalledTimes(1));
    await act(() => Promise.resolve());
    const { result } = renderHook(() => useCharacterCache([4], base));
    expect(result.current.characters.get(4)).toEqual(character(4));
    expect(loadCharacter).toHaveBeenCalledTimes(1);
  });

  it('keeps the error without fetching again, and drops it once the character is loaded elsewhere', async () => {
    loadCharacter.mockRejectedValueOnce(new Error('network'));
    const a = renderHook(({ ids }) => useCharacterCache(ids, base), { initialProps: { ids: [5] } });
    await waitFor(() => expect(a.result.current.errors.get(5)).toBe('network'));
    a.rerender({ ids: [5] });
    expect(loadCharacter).toHaveBeenCalledTimes(1);
    // ほかの所（先読み）で読み終えた後の描き直しでは、データを出し、エラーは出さない
    prefetchCharacters([5], base);
    await waitFor(() => expect(loadCharacter).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());
    a.rerender({ ids: [5] });
    expect(a.result.current.characters.get(5)).toEqual(character(5));
    expect(a.result.current.errors.has(5)).toBe(false);
  });

  it('returns the same table across renders until the characters loaded elsewhere are stored', async () => {
    const a = renderHook(() => useCharacterCache([5], base));
    await waitFor(() => expect(a.result.current.characters.has(5)).toBe(true));
    const b = renderHook(() => useCharacterCache([5], base));
    const first = b.result.current.characters;
    b.rerender();
    expect(first.get(5)).toEqual(character(5));
    expect(b.result.current.characters).toBe(first);
  });

  it('does not keep a failed load in the shared table, so the next reader loads it again', async () => {
    loadCharacter.mockRejectedValueOnce(new Error('network'));
    const a = renderHook(() => useCharacterCache([6], base));
    await waitFor(() => expect(a.result.current.errors.has(6)).toBe(true));
    const b = renderHook(() => useCharacterCache([6], base));
    await waitFor(() => expect(b.result.current.characters.get(6)).toEqual(character(6)));
    expect(b.result.current.errors.has(6)).toBe(false);
    expect(loadCharacter).toHaveBeenCalledTimes(2);
  });

  it('returns the same error table across renders once the stale error is dropped', async () => {
    loadCharacter.mockRejectedValueOnce(new Error('network'));
    const a = renderHook(({ ids }) => useCharacterCache(ids, base), { initialProps: { ids: [7] } });
    await waitFor(() => expect(a.result.current.errors.has(7)).toBe(true));
    prefetchCharacters([7], base);
    await waitFor(() => expect(loadCharacter).toHaveBeenCalledTimes(2));
    await act(() => Promise.resolve());
    a.rerender({ ids: [7] });
    const errors = a.result.current.errors;
    expect(errors.has(7)).toBe(false);
    a.rerender({ ids: [7] });
    expect(a.result.current.errors).toBe(errors);
  });
});
