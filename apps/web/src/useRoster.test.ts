// @vitest-environment happy-dom
// 育成状況のフック（useRoster.ts。plan/design-combat-power-sort.md 5 節）: 保存の復元・読み込み・書き出し・消す。データは作った値
import { emptyBuild, type BuildSnapshot, type CharacterIndexEntry } from '@nikke/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  formatVersion: 2,
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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** スロット 1 に育成状況にいるキャラ（82）を入れた編成 */
const TEAM = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 82 });

function render(index: readonly CharacterIndexEntry[] | null = INDEX) {
  const dispatch = vi.fn<(action: TeamAction) => void>();
  const setParties = vi.fn<(parties: PartiesState) => void>();
  const props = { index, team: TEAM, parties: INITIAL_PARTIES, dispatch, setParties };
  const { result, rerender } = renderHook(useRoster, { initialProps: props });
  return { result, rerender, dispatch, setParties, props };
}

const file = (text: string) => new File([text], 'builds.json', { type: 'application/json' });

describe('useRoster', () => {
  it('starts with no roster when nothing is saved', () => {
    const { result } = render();
    expect(result.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });

  it('restores the saved roster once the character index is loaded', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result, rerender, props } = render(null);
    // キャラの一覧を読むまでは検査できないので、育成状況は無く、保存はある
    expect(result.current.controls).toMatchObject({ roster: null, stored: true, message: null });
    rerender({ ...props, index: INDEX });
    expect(result.current.controls).toMatchObject({ roster: ROSTER, stored: true, message: null });
  });

  it('adds the roster build to selecting a character in it, and passes other actions through', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result, dispatch } = render();
    result.current.dispatchWithRoster({ type: 'selectCharacter', index: 0, resourceId: 82 });
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'selectCharacter',
      index: 0,
      resourceId: 82,
      fields: rosterFields(ROSTER.characters['82']!),
    });
    const other: TeamAction = { type: 'selectCharacter', index: 1, resourceId: 10 };
    result.current.dispatchWithRoster(other);
    expect(dispatch).toHaveBeenLastCalledWith(other);
  });

  it('keeps a saved roster that no longer reads, and shows why', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { result } = render();
    const { controls } = result.current;
    expect(controls.roster).toBeNull();
    expect(controls.stored).toBe(true);
    expect(controls.message?.kind).toBe('error');
    expect(controls.message?.lines[0]).toBe('ブラウザに保存した育成状況（読み込み直すか消す）');
    expect(controls.message?.lines[1]).toMatch(/characters\.82\.growth\.grade/);
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(BROKEN);
  });

  it('imports a file without asking: saves the text, overwrites the team and parties, and reports', async () => {
    const { result, dispatch, setParties } = render();
    await act(() => result.current.controls.importFile(file(SAVED)));
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    const next = applyRoster(TEAM, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenCalledWith(next.parties);
    expect(result.current.controls).toMatchObject({
      roster: ROSTER,
      stored: true,
      // 知らせが無ければ何も出さない（読み込んだこと自体は出さない）
      message: null,
    });
  });

  it('drops a pending clear when a file is imported', async () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result } = render();
    act(() => result.current.controls.clear());
    expect(result.current.controls.clearPrompt).not.toBeNull();
    await act(() => result.current.controls.importFile(file(SAVED)));
    expect(result.current.controls.clearPrompt).toBeNull();
  });

  it('shows the errors of a file that does not read, without saving', async () => {
    const { result, dispatch } = render();
    await act(() => result.current.controls.importFile(file('{"formatVersion":3,"characters":{}}')));
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.controls.message).toEqual({
      kind: 'error',
      lines: ['この版の育成状況は読めない（formatVersion 3）'],
    });
  });

  it('ignores a file before the character index is loaded', async () => {
    const { result, dispatch } = render(null);
    await act(() => result.current.controls.importFile(file(SAVED)));
    expect(dispatch).not.toHaveBeenCalled();
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
  });

  it('exports the saved text as a file only while a roster is restored', async () => {
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      anchors.push(this);
    });
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:roster';
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    // 読めない保存は書き出さない
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    render().result.current.controls.exportFile();
    expect(anchors).toEqual([]);

    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    render().result.current.controls.exportFile();
    expect(anchors).toHaveLength(1);
    expect(anchors[0]!.getAttribute('href')).toBe('blob:roster');
    expect(anchors[0]!.download).toBe('nikke-builds-2026-10-29.json');
    expect(await blobs[0]!.text()).toBe(serializeRoster(SAVED));
    expect(revoke).toHaveBeenCalledWith('blob:roster');
  });

  it('asks in the settings before clearing, and does nothing when cancelled', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result, dispatch, setParties } = render();
    expect(result.current.controls.clearPrompt).toBeNull();
    act(() => result.current.controls.clear());
    // 戻すスロットの数は、いまの編成の育成状況にいるキャラのスロット
    expect(result.current.controls.clearPrompt).toBe(clearConfirmText(1));
    act(() => result.current.controls.cancelClear());
    expect(result.current.controls.clearPrompt).toBeNull();
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setParties).not.toHaveBeenCalled();
  });

  it('clears the saved roster and what it copied into the team after the confirmation', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result, dispatch, setParties } = render();
    act(() => result.current.controls.clear());
    act(() => result.current.controls.confirmClear());
    const next = clearRosterFromTeam(TEAM, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenCalledWith(next.parties);
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: null, stored: false, message: null, clearPrompt: null });
  });

  it('clears a saved roster that no longer reads', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { result } = render();
    act(() => result.current.controls.clear());
    // 読めない保存は戻すスロットが無い
    expect(result.current.controls.clearPrompt).toBe(clearConfirmText(0));
    act(() => result.current.controls.confirmClear());
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });
});
