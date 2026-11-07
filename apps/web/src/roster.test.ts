// 育成状況（roster.ts。plan/design-combat-power-sort.md 5 節）。データは作った値
import { emptyBuild, type BuildSnapshot, type CharacterIndexEntry, type SnapshotCharacter } from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { INITIAL_PARTIES, type PartiesState } from './parties.ts';
import {
  applyRoster,
  consoleFromRoster,
  importConfirmText,
  importSummary,
  restoreRoster,
  rosterDate,
  rosterFields,
  rosterFileName,
  rosterLabel,
  rosterSlotCount,
  serializeRoster,
  withRosterFields,
} from './roster.ts';
import { emptySlot, initialTeamState, teamReducer, type TeamState } from './team.ts';

const INDEX = [
  { resourceId: 10, rarity: 'SR' },
  { resourceId: 82, rarity: 'SSR' },
] as CharacterIndexEntry[];

function character(over: Partial<SnapshotCharacter> = {}): SnapshotCharacter {
  return {
    ...emptyBuild(),
    growth: { level: 410, grade: 3, core: 5 },
    affectionRank: 12,
    gear: {
      head: { type: 'OL', level: 5, overload: [{ option: 'attack', level: 11 }] },
      body: null,
      arm: null,
      leg: null,
    },
    cube: { id: 1000301, level: 7 },
    recycleRoom: { personal: 30, class: 20, corporation: 10 },
    skillLevels: { skill1: 10, skill2: 7, burst: 4 },
    treasure: { tid: 200101, level: 2, phase: 3 },
    ...over,
  };
}

const ROSTER: BuildSnapshot = {
  formatVersion: 1,
  fetchedAt: '2026-10-28T20:00:00.000Z',
  synchroLevel: 400,
  recycleRoom: { '1001': 30, '1101': 20, '1203': 5 },
  characters: {
    '10': character({
      growth: { level: 400, grade: 2, core: 0 },
      collection: { rarity: 'R', level: 15 },
      treasure: null,
    }),
    '82': character(),
  },
  unmapped: [],
};

function teamWith(...ids: (number | null)[]): TeamState {
  const team = initialTeamState();
  return { ...team, slots: team.slots.map((s, i) => ({ ...s, resourceId: ids[i] ?? null })) };
}

describe('rosterFields', () => {
  it('凸・コア・好感度・装備・キューブ・コレクション・スキル Lv・宝物の段階を写す（Lv は写さない）', () => {
    expect(rosterFields(ROSTER.characters['82']!)).toEqual({
      growth: { grade: 3, core: 5 },
      build: {
        affectionRank: 12,
        gear: {
          head: { type: 'OL', level: 5, overload: [{ option: 'attack', level: 11 }] },
          body: null,
          arm: null,
          leg: null,
        },
        cube: { id: 1000301, level: 7 },
        collection: null,
      },
      skillLevels: { skill1: 10, skill2: 7, burst: 4 },
      treasurePhase: 3,
    });
    expect(rosterFields(ROSTER.characters['10']!).build.collection).toEqual({ rarity: 'R', level: 15 });
  });

  it('宝物の段階が未確定なら宝物なし（0）', () => {
    expect(rosterFields(character({ treasure: { tid: 200101, level: 0, phase: null } })).treasurePhase).toBe(0);
    expect(rosterFields(ROSTER.characters['10']!).treasurePhase).toBe(0);
  });
});

describe('withRosterFields とスロットへの写し', () => {
  it('育成状況にいるキャラを入れる操作にだけ育成を付ける', () => {
    const select = { type: 'selectCharacter', index: 0, resourceId: 82 } as const;
    expect(withRosterFields(select, ROSTER)).toEqual({ ...select, fields: rosterFields(ROSTER.characters['82']!) });
    expect(withRosterFields({ ...select, resourceId: 30 }, ROSTER)).toEqual({ ...select, resourceId: 30 });
    expect(withRosterFields(select, null)).toBe(select);
    const clear = { type: 'clearSlot', index: 0 } as const;
    expect(withRosterFields(clear, ROSTER)).toBe(clear);
  });

  it('別のニケに変えたときだけ写す（同じニケを選び直しても、スロットで変えた育成は残る）', () => {
    const action = withRosterFields({ type: 'selectCharacter', index: 1, resourceId: 82 }, ROSTER);
    const placed = teamReducer(initialTeamState(), action);
    expect(placed.slots[1]).toEqual({ ...emptySlot(), resourceId: 82, ...rosterFields(ROSTER.characters['82']!) });
    const edited = teamReducer(placed, {
      type: 'setSkillLevels',
      index: 1,
      skillLevels: { skill1: 1, skill2: 1, burst: 1 },
    });
    expect(teamReducer(edited, action).slots[1]!.skillLevels).toEqual({ skill1: 1, skill2: 1, burst: 1 });
  });
});

it('consoleFromRoster: リサイクルルームの研究（tid）をコンソールにする。無い研究は 0', () => {
  expect(consoleFromRoster(ROSTER)).toEqual({
    personal: 30,
    class: { Attacker: 20, Defender: 0, Supporter: 0 },
    corporation: { ELYSION: 0, MISSILIS: 0, TETRA: 5, PILGRIM: 0, ABNORMAL: 0 },
  });
});

describe('applyRoster と rosterSlotCount', () => {
  const team = teamWith(82, null, 30);
  const parties: PartiesState = {
    active: 0,
    parties: [null, { slots: teamWith(10, 82).slots }, null, null, null],
  };

  it('シンクロ LV・コンソールと、全部の編成の育成状況にいるキャラのスロットに写す', () => {
    const next = applyRoster(team, parties, ROSTER);
    expect(next.team.synchroLevel).toBe(400);
    expect(next.team.console).toEqual(consoleFromRoster(ROSTER));
    expect(next.team.slots[0]).toEqual({ ...team.slots[0], ...rosterFields(ROSTER.characters['82']!) });
    expect(next.team.slots[2]).toBe(team.slots[2]);
    expect(next.parties.parties[1]!.slots[0]).toEqual({
      ...parties.parties[1]!.slots[0],
      ...rosterFields(ROSTER.characters['10']!),
    });
    expect(next.parties.parties[0]).toBeNull();
  });

  it('上書きされるスロットの数', () => {
    expect(rosterSlotCount(team, parties, ROSTER)).toBe(3);
    expect(rosterSlotCount(teamWith(30), INITIAL_PARTIES, ROSTER)).toBe(0);
  });
});

describe('保存と表示', () => {
  it('保存した JSON を読み戻す。読めないものは null', () => {
    expect(restoreRoster(serializeRoster(ROSTER), INDEX)).toEqual(ROSTER);
    expect(restoreRoster(null, INDEX)).toBeNull();
    expect(restoreRoster('{"formatVersion":2,"characters":{}}', INDEX)).toBeNull();
  });

  it('取得の日は日本時間', () => {
    expect(rosterDate(ROSTER)).toBe('2026-10-29');
    expect(rosterDate({ ...ROSTER, fetchedAt: 'unknown' })).toBe('unknown');
    expect(rosterLabel(ROSTER)).toBe('2026-10-29 の育成・2 体');
    expect(rosterFileName(ROSTER)).toBe('nikke-builds-2026-10-29.json');
  });

  it('読み込みの結果と確認の文', () => {
    const unknown = {
      ...ROSTER,
      characters: { ...ROSTER.characters, '82': character({ treasure: { tid: 200101, level: 0, phase: null } }) },
    };
    expect(importSummary(unknown, ['知らせ'])).toEqual([
      '2026-10-29 の育成・2 体を読み込んだ',
      '知らせ',
      '宝物の段階が未確定（Lv 0）の 1 体は、宝物なしでスロットへ写す（スロットで選ぶ）',
    ]);
    expect(importSummary(ROSTER, [])).toEqual(['2026-10-29 の育成・2 体を読み込んだ']);
    expect(importConfirmText(0)).toBe('シンクロ LV・リサイクルルームを、読み込む育成状況で上書きします。');
    expect(importConfirmText(3)).toMatch(/3 スロット（全部の編成）の育成を/);
  });
});
