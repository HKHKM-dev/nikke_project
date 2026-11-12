// @vitest-environment happy-dom
// 育成状況のフック（useRoster.ts。plan/design-combat-power-sort.md 5 節・plan/design-roster-edit.md 5 節）: 保存の復元・読み込み・
// 書き出し・消す・編集。データは作った値
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  emptyBuild,
  readBuildSnapshot,
  type BuildSnapshot,
  type CharacterIndexEntry,
} from '@nikke/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PARTIES, type PartiesState } from './parties.ts';
import {
  ROSTER_STORAGE_KEY,
  applyRoster,
  clearConfirmText,
  clearRosterFromTeam,
  revertAllConfirmText,
  rosterFields,
  serializeRoster,
} from './roster.ts';
import { ROSTER_EDITS_STORAGE_KEY, characterEditOf, type RosterEdits } from './rosterEdits.ts';
import type * as StorageModule from './storage.ts';
import { initialTeamState, teamReducer, type TeamAction, type TeamState } from './team.ts';
import { useRoster } from './useRoster.ts';

const INDEX = [{ resourceId: 82, rarity: 'SSR', class: 'Attacker', corporation: 'ELYSION' }] as CharacterIndexEntry[];
const ROSTER: BuildSnapshot = {
  formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
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

/** ブラウザの保存に書けない状態にする（storage.ts の writeStorage が false を返す） */
const storageFailure = vi.hoisted(() => ({ write: false }));
vi.mock('./storage.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return {
    ...actual,
    writeStorage: (key: string, value: string) => !storageFailure.write && actual.writeStorage(key, value),
  };
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  storageFailure.write = false;
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
    act(() => result.current.controls.clear.request());
    expect(result.current.controls.clear.prompt).not.toBeNull();
    await act(() => result.current.controls.importFile(file(SAVED)));
    expect(result.current.controls.clear.prompt).toBeNull();
  });

  it('shows the errors of a file that does not read, without saving', async () => {
    const { result, dispatch } = render();
    const unknown = BUILD_SNAPSHOT_FORMAT_VERSION + 1;
    await act(() =>
      result.current.controls.importFile(file(JSON.stringify({ formatVersion: unknown, characters: {} }))),
    );
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.controls.message).toEqual({
      kind: 'error',
      lines: [`この版の育成状況は読めない（formatVersion ${unknown}）`],
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
    expect(result.current.controls.clear.prompt).toBeNull();
    act(() => result.current.controls.clear.request());
    // 戻すスロットの数は、いまの編成の育成状況にいるキャラのスロット
    expect(result.current.controls.clear.prompt).toBe(clearConfirmText(1));
    act(() => result.current.controls.clear.cancel());
    expect(result.current.controls.clear.prompt).toBeNull();
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    expect(dispatch).not.toHaveBeenCalled();
    expect(setParties).not.toHaveBeenCalled();
  });

  it('clears the saved roster and what it copied into the team after the confirmation', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    const { result, dispatch, setParties } = render();
    act(() => result.current.controls.clear.request());
    act(() => result.current.controls.clear.confirm());
    const next = clearRosterFromTeam(TEAM, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenCalledWith(next.parties);
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({
      roster: null,
      stored: false,
      message: null,
      clear: { prompt: null },
    });
  });

  it('clears a saved roster that no longer reads', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    const { result } = render();
    act(() => result.current.controls.clear.request());
    // 読めない保存は戻すスロットが無い
    expect(result.current.controls.clear.prompt).toBe(clearConfirmText(0));
    act(() => result.current.controls.clear.confirm());
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: null, stored: false, message: null });
  });
});

describe('useRoster: editing (plan/design-roster-edit.md 5 節)', () => {
  const entry = ROSTER.characters['82']!;
  /** スキル 2 の Lv を 8 にした編集 */
  const edit = { ...characterEditOf(entry), skillLevels: { ...entry.skillLevels, skill2: 8 } };
  const savedEdits = () => JSON.parse(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY) ?? 'null') as RosterEdits | null;
  /** 最後に編成を置き換えた先（スロット・共通育成への写し） */
  const replaced = (dispatch: ReturnType<typeof render>['dispatch']): TeamState => {
    const action = dispatch.mock.lastCall![0];
    if (action.type !== 'replace') throw new Error(`replace でない: ${action.type}`);
    return action.state;
  };
  const renderSaved = () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    return render();
  };

  it('has no editor without a roster, or with a saved roster that does not read', () => {
    expect(render().result.current.controls).toMatchObject({ editor: null, hasEdits: false });
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    expect(render().result.current.controls.editor).toBeNull();
  });

  it('saves an edit as an overlay beside the imported text, and copies the character into its slots', () => {
    const { result, dispatch } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    // 読み込んだ文は書き換えない
    expect(localStorage.getItem(ROSTER_STORAGE_KEY)).toBe(SAVED);
    expect(savedEdits()).toMatchObject({ formatVersion: 1, characters: { '82': edit } });
    const { controls } = result.current;
    expect(controls.roster!.characters['82']!.skillLevels.skill2).toBe(8);
    expect(controls.roster!.editedAt).toBe(savedEdits()!.editedAt);
    expect(controls.editor).toMatchObject({ accountEdited: false, problem: null });
    expect([...controls.editor!.editedIds]).toEqual([82]);
    expect(controls.hasEdits).toBe(true);
    // スロット 1 のそのニケの育成が、育成状況の値になる。共通育成は変えない
    expect(replaced(dispatch).slots[0]!.skillLevels.skill2).toBe(8);
    expect(replaced(dispatch).synchroLevel).toBe(TEAM.synchroLevel);
  });

  it('restores saved edits over the imported roster', () => {
    const { result } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    const restored = render().result.current.controls;
    expect(restored.roster!.characters['82']!.skillLevels.skill2).toBe(8);
    expect([...restored.editor!.editedIds]).toEqual([82]);
  });

  it('reverts a character: the overlay goes away and its slots get the imported build', () => {
    const { result, dispatch } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    act(() => result.current.controls.editor!.revertCharacter(82));
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: ROSTER, hasEdits: false });
    expect(replaced(dispatch).slots[0]!.skillLevels).toEqual(entry.skillLevels);
    // 読み込んだ値と同じ編集も、重ねに残さない
    act(() => result.current.controls.editor!.editCharacter(82, characterEditOf(entry)));
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
  });

  it('edits the account: levels that followed the synchro level follow it, and the common growth gets both values', () => {
    const { result, dispatch } = renderSaved();
    act(() =>
      result.current.controls.editor!.editAccount({ synchroLevel: 410, recycleRoom: { '1001': 30, '1101': 12 } }),
    );
    expect(savedEdits()).toMatchObject({ synchroLevel: 410, recycleRoom: { '1001': 30, '1101': 12 }, characters: {} });
    const { roster, editor } = result.current.controls;
    expect(roster).toMatchObject({ synchroLevel: 410, recycleRoom: { '1001': 30, '1101': 12 } });
    // 読み込んだ Lv がシンクロ LV と同じだったキャラは追従し、リサイクルルームの写しはクラスから引き直す
    expect(roster!.characters['82']).toMatchObject({
      growth: { level: 410 },
      recycleRoom: { personal: 30, class: 12, corporation: 0 },
    });
    expect(editor).toMatchObject({ accountEdited: true });
    expect([...editor!.editedIds]).toEqual([]);
    expect(replaced(dispatch)).toMatchObject({ synchroLevel: 410, console: { personal: 30, class: { Attacker: 12 } } });
    act(() => result.current.controls.editor!.revertAccount());
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(replaced(dispatch)).toMatchObject({ synchroLevel: 400, console: { personal: 30, class: { Attacker: 0 } } });
  });

  it('asks before reverting everything, then drops the edits and copies the imported roster', () => {
    const { result, dispatch, setParties } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    act(() => result.current.controls.editor!.editAccount({ synchroLevel: 410, recycleRoom: ROSTER.recycleRoom }));
    act(() => result.current.controls.revertAll.request());
    expect(result.current.controls.revertAll.prompt).toBe(revertAllConfirmText({ count: 1, account: true }));
    act(() => result.current.controls.revertAll.cancel());
    expect(result.current.controls).toMatchObject({ hasEdits: true, revertAll: { prompt: null } });
    act(() => result.current.controls.revertAll.request());
    act(() => result.current.controls.revertAll.confirm());
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: ROSTER, hasEdits: false, revertAll: { prompt: null } });
    const next = applyRoster(TEAM, INITIAL_PARTIES, ROSTER);
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'replace', state: next.team });
    expect(setParties).toHaveBeenLastCalledWith(next.parties);
  });

  it('drops the edits when a file is imported (without asking) or the roster is cleared', async () => {
    const { result } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    await act(() => result.current.controls.importFile(file(SAVED)));
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: ROSTER, hasEdits: false });

    act(() => result.current.controls.editor!.editCharacter(82, edit));
    act(() => result.current.controls.clear.request());
    // 編集した値も消えると知らせる
    expect(result.current.controls.clear.prompt).toBe(clearConfirmText(1, true));
    act(() => result.current.controls.clear.confirm());
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(result.current.controls).toMatchObject({ roster: null, editor: null, hasEdits: false });
  });

  it('exports the edited roster: version 2 with editedAt, named -edited, and it reads back', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const names: string[] = [];
    const blobs: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return 'blob:roster';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'download', 'set').mockImplementation((name) => {
      names.push(name);
    });
    const { result } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    result.current.controls.exportFile();
    expect(names).toEqual(['nikke-builds-2026-10-29-edited.json']);
    const read = readBuildSnapshot(await blobs[0]!.text(), INDEX);
    expect(read.ok && read.snapshot).toEqual(result.current.controls.roster);
    expect(read.ok && read.snapshot.editedAt).toBe(savedEdits()!.editedAt);
  });

  it('keeps edits that do not read, shows why, uses the imported roster, and lets them be dropped', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, SAVED);
    for (const broken of [
      '{',
      JSON.stringify({ formatVersion: 1, editedAt: 'x', characters: { '82': { growth: { grade: 99, core: 0 } } } }),
    ]) {
      localStorage.setItem(ROSTER_EDITS_STORAGE_KEY, broken);
      const { result } = render();
      const { controls } = result.current;
      expect(controls).toMatchObject({ roster: ROSTER, editor: null, hasEdits: true });
      expect(controls.message?.kind).toBe('error');
      expect(controls.message?.lines[0]).toMatch(/育成状況の編集/);
      expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBe(broken);
      act(() => controls.revertAll.request());
      // 何を編集したか分からない
      expect(result.current.controls.revertAll.prompt).toBe(revertAllConfirmText(null));
      act(() => result.current.controls.revertAll.confirm());
      expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
      expect(result.current.controls).toMatchObject({ roster: ROSTER, message: null, hasEdits: false });
      expect(result.current.controls.editor).not.toBeNull();
      cleanup();
    }
  });

  it('has nothing to revert to while the saved roster does not read', () => {
    localStorage.setItem(ROSTER_STORAGE_KEY, BROKEN);
    localStorage.setItem(ROSTER_EDITS_STORAGE_KEY, JSON.stringify({ formatVersion: 1, editedAt: 'x', characters: {} }));
    expect(render().result.current.controls).toMatchObject({ editor: null, hasEdits: false });
    // 消すと編集も消える
    const { result } = render();
    act(() => result.current.controls.clear.request());
    act(() => result.current.controls.clear.confirm());
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
  });

  it('does not take an edit that the roster check stops', () => {
    const { result, dispatch } = renderSaved();
    act(() => result.current.controls.editor!.editCharacter(82, { ...edit, growth: { grade: 99, core: 0 } }));
    expect(localStorage.getItem(ROSTER_EDITS_STORAGE_KEY)).toBeNull();
    expect(dispatch).not.toHaveBeenCalled();
    expect(result.current.controls.roster).toEqual(ROSTER);
    expect(result.current.controls.editor!.problem?.[1]).toMatch(/characters\.82\.growth\.grade/);
  });

  it('keeps an edit for this page when the browser cannot save it, and says so', () => {
    const { result } = renderSaved();
    storageFailure.write = true;
    act(() => result.current.controls.editor!.editCharacter(82, edit));
    expect(result.current.controls.roster!.characters['82']!.skillLevels.skill2).toBe(8);
    expect(result.current.controls.editor!.problem).toEqual([
      'この編集をブラウザに保存できなかった（再読み込みすると、保存できた所まで戻る）',
    ]);
    // 編集の問題は編集画面に出す（メニューの知らせには出さない）
    expect(result.current.controls.message).toBeNull();
  });
});
