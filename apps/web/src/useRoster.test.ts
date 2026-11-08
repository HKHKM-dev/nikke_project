// 育成状況のフック（useRoster.ts。plan/design-combat-power-sort.md 5 節）: 保存の復元・読み込み・書き出し・消す。データは作った値
import { emptyBuild, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { cleanupHooks, memoryStorage, renderHook } from './hookHarness.ts';
import { INITIAL_PARTIES, type PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
  clearConfirmText,
  clearRosterFromTeam,
  rosterFields,
  serializeRoster,
} from './roster.ts';
import { initialTeamState, teamReducer, type TeamAction } from './team.ts';
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

beforeEach(() => {
  storage = memoryStorage();
  vi.stubGlobal('localStorage', storage);
  // 確かめの窓（window.confirm）は使わない。window は React が読む（hookHarness.ts）
  vi.stubGlobal('window', {});
});

afterEach(async () => {
  await cleanupHooks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** スロット 1 に育成状況にいるキャラ（82）を入れた編成 */
const TEAM = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 82 });

async function render(index: readonly CharacterIndexEntry[] | null = INDEX) {
  const team = TEAM;
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

  it('imports a file without asking: saves the text, overwrites the team and parties, and reports', async () => {
    const { hook, team, dispatch, setParties } = await render();
    await act(() => hook.current.controls.importFile(file(SAVED)));
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

  it('drops a pending clear when a file is imported', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { hook } = await render();
    await act(() => hook.current.controls.clear());
    expect(hook.current.controls.clearPrompt).not.toBeNull();
    await act(() => hook.current.controls.importFile(file(SAVED)));
    expect(hook.current.controls.clearPrompt).toBeNull();
  });

  it('shows the errors of a file that does not read, without saving', async () => {
    const { hook, dispatch } = await render();
    await act(() => hook.current.controls.importFile(file('{"formatVersion":2,"characters":{}}')));
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
  });

  it('asks in the settings before clearing, and does nothing when cancelled', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { hook, dispatch, setParties } = await render();
    expect(hook.current.controls.clearPrompt).toBeNull();
    await act(() => hook.current.controls.clear());
    // 戻すスロットの数は、いまの編成の育成状況にいるキャラのスロット
    expect(hook.current.controls.clearPrompt).toBe(clearConfirmText(1));
    await act(() => hook.current.controls.cancelClear());
    expect(hook.current.controls.clearPrompt).toBeNull();
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setParties).not.toHaveBeenCalled();
  });

  it('clears the saved roster and what it copied into the team after the confirmation', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { hook, team, dispatch, setParties } = await render();
    await act(() => hook.current.controls.clear());
    await act(() => hook.current.controls.confirmClear());
    const next = clearRosterFromTeam(team, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenCalledWith(next.parties);
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(hook.current.controls).toMatchObject({ roster: null, stored: false, message: null, clearPrompt: null });
  });

  it('clears a saved roster that no longer reads', async () => {
    storage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { hook } = await render();
    await act(() => hook.current.controls.clear());
    // 読めない保存は戻すスロットが無い
    expect(hook.current.controls.clearPrompt).toBe(clearConfirmText(0));
    await act(() => hook.current.controls.confirmClear());
    expect(storage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(hook.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });
});
