// 起動時の編成の保存の復元と、読めなかった保存の退避（savedTeams.ts。plan/design-unreadable-team-save.md 5 節）
import type { CharacterIndexEntry } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { INITIAL_PARTIES, PARTIES_STORAGE_KEY, serializeParties, switchParty } from './parties.ts';
import {
  MAX_UNREADABLE_PER_KIND,
  UNREADABLE_KEY_PREFIX,
  backupUnreadable,
  listUnreadable,
  restoreSaves,
  unreadableFileName,
  unreadableMessage,
} from './savedTeams.ts';
import type { SaveStore } from './storage.ts';
import { STORAGE_KEY, TEAM_SHAPE_ERROR, initialTeamState, serializeTeamState, teamReducer } from './team.ts';

const index = [{ resourceId: 10 }, { resourceId: 11 }] as unknown as CharacterIndexEntry[];
/** 2026-11-09 12:34（日本時間） */
const NOW = Date.parse('2026-11-09T03:34:00Z');

function memoryStore(initial: Record<string, string> = {}, writable = true): SaveStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    read: (key) => data.get(key) ?? null,
    write: (key, value) => {
      if (!writable) return false;
      data.set(key, value);
      return true;
    },
    remove: (key) => void data.delete(key),
    keys: (prefix) => [...data.keys()].filter((k) => k.startsWith(prefix)),
  };
}

const TEAM = teamReducer(initialTeamState(), { type: 'selectCharacter', index: 0, resourceId: 10 });
/** 版の無い旧形式（Stage 3〜13） */
const LEGACY = JSON.stringify({ slots: [], enemy: { defence: 100 } });

describe('restoreSaves', () => {
  it('reads what it can and backs nothing up when the saves are readable or absent', () => {
    expect(restoreSaves(memoryStore(), index, NOW)).toEqual({ team: null, parties: null, unsaved: [] });
    const { parties } = switchParty(INITIAL_PARTIES, TEAM, 1);
    const store = memoryStore({
      [STORAGE_KEY]: serializeTeamState(TEAM),
      [PARTIES_STORAGE_KEY]: serializeParties(parties),
    });
    expect(restoreSaves(store, index, NOW)).toEqual({ team: TEAM, parties, unsaved: [] });
    expect(listUnreadable(store)).toEqual([]);
  });

  it('backs up an unreadable team before the screen overwrites it, with the reason', () => {
    for (const [raw, error] of [
      [LEGACY, 'この版の編成は読めません（formatVersion undefined）'],
      ['{', 'JSON として読めません'],
      [JSON.stringify({ formatVersion: 99 }), 'この版の編成は読めません（formatVersion 99）'],
      [serializeTeamState(teamReducer(TEAM, { type: 'selectCharacter', index: 1, resourceId: 999 })), TEAM_SHAPE_ERROR],
    ] as const) {
      const store = memoryStore({ [STORAGE_KEY]: raw });
      const result = restoreSaves(store, index, NOW);
      expect(result).toEqual({ team: null, parties: null, unsaved: [] });
      // 画面は復元の直後に初期値で保存する。退避は残る
      store.write(STORAGE_KEY, serializeTeamState(initialTeamState()));
      expect(listUnreadable(store)).toEqual([
        { kind: 'team', raw, error, key: `${UNREADABLE_KEY_PREFIX}team.${NOW}`, savedAt: NOW },
      ]);
    }
  });

  it('backs up the whole list, or the list with the parties it emptied', () => {
    const broken = memoryStore({ [PARTIES_STORAGE_KEY]: 'x' });
    expect(restoreSaves(broken, index, NOW).parties).toBeNull();
    expect(listUnreadable(broken)).toMatchObject([{ kind: 'parties', raw: 'x', error: 'JSON として読めません' }]);

    const { parties } = switchParty(INITIAL_PARTIES, TEAM, 1);
    const raw = JSON.parse(serializeParties(parties));
    raw.parties[3] = { slots: 'x' };
    const partial = memoryStore({ [PARTIES_STORAGE_KEY]: JSON.stringify(raw) });
    const result = restoreSaves(partial, index, NOW);
    expect(result.parties?.parties[0]?.slots[0]?.resourceId).toBe(10);
    expect(result.parties?.parties[3]).toBeNull();
    expect(listUnreadable(partial)).toMatchObject([
      { kind: 'parties', raw: JSON.stringify(raw), error: TEAM_SHAPE_ERROR, dropped: [3] },
    ]);
  });

  it('reports what it could not back up, so the screen does not save', () => {
    const store = memoryStore({ [STORAGE_KEY]: LEGACY, [PARTIES_STORAGE_KEY]: 'x' }, false);
    const result = restoreSaves(store, index, NOW);
    expect(result.unsaved).toMatchObject([
      { kind: 'team', raw: LEGACY, key: null, savedAt: NOW },
      { kind: 'parties', raw: 'x', key: null, savedAt: NOW },
    ]);
  });
});

describe('backupUnreadable', () => {
  it('does not add the same save twice (StrictMode runs the restore twice)', () => {
    const store = memoryStore({ [STORAGE_KEY]: LEGACY });
    restoreSaves(store, index, NOW);
    restoreSaves(store, index, NOW + 1);
    expect(listUnreadable(store)).toHaveLength(1);
  });

  it(`keeps the newest ${MAX_UNREADABLE_PER_KIND} of each kind`, () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_UNREADABLE_PER_KIND + 2; i++) {
      expect(backupUnreadable(store, { kind: 'team', raw: `t${i}`, error: 'e' }, NOW + i)).toBe(true);
    }
    backupUnreadable(store, { kind: 'parties', raw: 'p', error: 'e' }, NOW);
    const saves = listUnreadable(store);
    expect(saves.filter((s) => s.kind === 'team').map((s) => s.raw)).toEqual(['t2', 't3', 't4', 't5', 't6']);
    expect(saves.filter((s) => s.kind === 'parties')).toHaveLength(1);
  });

  it('lists a backup it cannot read as broken, and skips keys of unknown kinds', () => {
    const store = memoryStore({
      [`${UNREADABLE_KEY_PREFIX}team.${NOW}`]: 'not json',
      [`${UNREADABLE_KEY_PREFIX}other.${NOW}`]: '{}',
    });
    expect(listUnreadable(store)).toEqual([
      {
        kind: 'team',
        raw: 'not json',
        error: '退避の中身を読めません',
        key: `${UNREADABLE_KEY_PREFIX}team.${NOW}`,
        savedAt: NOW,
        broken: true,
      },
    ]);
    // 読めない退避があっても、新しい退避は別のキーに足す（消さない）
    expect(backupUnreadable(store, { kind: 'team', raw: 'not json', error: 'e' }, NOW + 1)).toBe(true);
    expect(listUnreadable(store)).toHaveLength(2);
  });
});

describe('the notice', () => {
  const save = { kind: 'team', raw: LEGACY, error: 'e', key: 'k', savedAt: NOW } as const;

  it('says what was reset, in JST', () => {
    expect(unreadableMessage(save)).toBe(
      '2026-11-09 12:34 に、ブラウザに保存した編成を読めなかったので、選んでいた編成と共通の設定（敵・コンソールなど）を初期値に戻しました。',
    );
    expect(unreadableMessage({ ...save, kind: 'parties' })).toBe(
      '2026-11-09 12:34 に、ブラウザに保存した編成の一覧を読めなかったので、選んでいる編成のほかを空にしました。',
    );
    expect(unreadableMessage({ ...save, kind: 'parties', dropped: [2, 4] })).toBe(
      '2026-11-09 12:34 に、ブラウザに保存した編成03・編成05 を読めなかったので、空にしました。',
    );
    expect(unreadableMessage({ ...save, savedAt: null, broken: true })).toBe(
      '以前に退避した、読めなかった編成の保存の中身を読めません。',
    );
  });

  it('names the exported file by kind and JST time', () => {
    expect(unreadableFileName(save)).toBe('nikke-calc-unreadable-team-20261109-1234.json');
    expect(unreadableFileName({ ...save, kind: 'parties', savedAt: null })).toBe(
      'nikke-calc-unreadable-parties-unknown.json',
    );
  });
});
