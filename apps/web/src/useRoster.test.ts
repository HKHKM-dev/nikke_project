// 育成状況のフック（useRoster.ts。plan/design-combat-power-sort.md 5 節）: 保存の復元・読み込み・書き出し・消す。データは作った値
import { emptyBuild, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { memoryStorage, renderHook } from './hookHarness.ts';
import { INITIAL_PARTIES, type PartiesState } from './parties.ts';
import { ROSTER_STORAGE_KEY, applyRoster, rosterFields, serializeRoster } from './roster.ts';
import { initialTeamState, type TeamAction } from './team.ts';
import { useRoster } from './useRoster.ts';

const INDEX = [{ resourceId: 82, rarity: 'SSR' }] as CharacterIndexEntry[];
const ROSTER: BuildSnapshot = {
  formatVersion: 1,
  fetchedAt: '2026-10-28T20:00:00.000Z',
  synchroLevel: 400,
  recycleRoom: { '1001': 30 },
  characters: {
    '82': {
      ...emptyBuild(),
      growth: { level: 400, grade: 3, core: 5 },
      skillLevels: { skill1: 10, skill2: 7, burst: 4 },
      treasure: null,
    },
  },
  unmapped: [],
};
const SAVED = JSON.stringify(ROSTER);
/** キャラのデータの検査に掛かる保存（凸が範囲の外） */
const BROKEN = JSON.stringify({
  ...ROSTER,
  characters: { '82': { ...ROSTER.characters['82']!, growth: { level: 1, grade: 99, core: 0 } } },
});

let storage: Storage;
let confirm: ReturnType<typeof vi.fn<(text: string) => boolean>>;

beforeEach(() => {
  storage = memoryStorage();
  confirm = vi.fn(() => true);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { confirm });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(index: readonly CharacterIndexEntry[] | null = INDEX) {
  const team = initialTeamState();
  const dispatch = vi.fn<(action: TeamAction) => void>();
  const setParties = vi.fn<(parties: PartiesState) => void>();
  const props = { index, team, parties: INITIAL_PARTIES, dispatch, setParties };
  const hook = await renderHook(useRoster, props);
  return { hook, team, dispatch, setParties, props };
}

const file = (text: string) => new File([text], 'builds.json', { type: 'application/json' });

describe('useRoster', () => {
  it('starts with no roster when nothing is saved', async () => {
    const { hook } = await render();
    expect(hook.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });

  it('restores the saved roster once the character index is loaded', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { hook, props } = await render(null);
    // キャラの一覧を読むまでは検査できないので、育成状況は無く、保存はある
    expect(hook.current.controls).toMatchObject({ roster: null, stored: true, message: null });
    await hook.rerender({ ...props, index: INDEX });
    expect(hook.current.controls).toMatchObject({ roster: ROSTER, stored: true, message: null });
  });

  it('adds the roster build to selecting a character in it, and passes other actions through', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { hook, dispatch } = await render();
    hook.current.dispatchWithRoster({ type: 'selectCharacter', index: 0, resourceId: 82 });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'selectCharacter',
      index: 0,
      resourceId: 82,
      fields: rosterFields(ROSTER.characters['82']!),
    });
    const other: TeamAction = { type: 'selectCharacter', index: 1, resourceId: 10 };
    hook.current.dispatchWithRoster(other);
    expect(dispatch).toHaveBeenLastCalledWith(other);
  });

  it('keeps a saved roster that no longer reads, and shows why', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { hook } = await render();
    const { controls } = hook.current;
    expect(controls.roster).toBeNull();
    expect(controls.stored).toBe(true);
    expect(controls.message?.kind).toBe('error');
    expect(controls.message?.lines[0]).toBe('ブラウザに保存した育成状況（読み込み直すか消す）');
    expect(controls.message?.lines[1]).toMatch(/characters\.82\.growth\.grade/);
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBe(BROKEN);
  });

  it('imports a file after the confirmation: saves the text, overwrites the team and parties, and reports', async () => {
    const { hook, team, dispatch, setParties } = await render();
    await act(() => hook.current.controls.importFile(file(SAVED)));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    const next = applyRoster(team, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenCalledWith(next.parties);
    expect(hook.current.controls).toMatchObject({
      roster: ROSTER,
      stored: true,
      message: { kind: 'ok', lines: ['2026-10-29 の育成・1 体を読み込んだ'] },
    });
  });

  it('does nothing when the confirmation is declined', async () => {
    confirm.mockReturnValue(false);
    const { hook, dispatch, setParties } = await render();
    await act(() => hook.current.controls.importFile(file(SAVED)));
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(setParties).not.toHaveBeenCalled();
    expect(hook.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });

  it('shows the errors of a file that does not read, without asking or saving', async () => {
    const { hook, dispatch } = await render();
    await act(() => hook.current.controls.importFile(file('{"formatVersion":2,"characters":{}}')));
    expect(confirm).not.toHaveBeenCalled();
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(hook.current.controls.message).toEqual({
      kind: 'error',
      lines: ['この版の育成状況は読めない（formatVersion 2）'],
    });
  });

  it('ignores a file before the character index is loaded', async () => {
    const { hook, dispatch } = await render(null);
    await act(() => hook.current.controls.importFile(file(SAVED)));
    expect(confirm).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
  });

  it('exports the saved text as a file only while a roster is restored', async () => {
    const anchors: { href: string; download: string; click: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { href: '', download: '', click: vi.fn() };
        anchors.push(a);
        return a;
      },
    });
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:roster';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    try {
      // 読めない保存は書き出さない
      storage.setItem(ROSTER_STORAGE_KEY, BROKEN);
      (await render()).hook.current.controls.exportFile();
      expect(anchors).toEqual([]);

      storage.setItem(ROSTER_STORAGE_KEY, SAVED);
      (await render()).hook.current.controls.exportFile();
      expect(anchors).toHaveLength(1);
      expect(anchors[0]).toMatchObject({ href: 'blob:roster', download: 'nikke-builds-2026-10-29.json' });
      expect(anchors[0]!.click).toHaveBeenCalledTimes(1);
      expect(await blobs[0]!.text()).toBe(serializeRoster(SAVED));
      expect(revoke).toHaveBeenCalledWith('blob:roster');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('clears the saved roster and the message after the confirmation', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { hook } = await render();
    confirm.mockReturnValue(false);
    await act(() => hook.current.controls.clear());
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBe(BROKEN);
    expect(hook.current.controls.stored).toBe(true);

    confirm.mockReturnValue(true);
    await act(() => hook.current.controls.clear());
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(hook.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });
});
