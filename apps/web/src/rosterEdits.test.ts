// 育成状況の編集の重ね（rosterEdits.ts。plan/design-roster-edit.md 5 節）。データは作った値
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  emptyBuild,
  readBuildSnapshot,
  type BuildSnapshot,
  type SnapshotCharacter,
} from '@nikke/core';
import { describe, expect, it } from 'vitest';
import { rosterFields } from './roster.ts';
import {
  accountEdited,
  applyRosterEdits,
  characterEditOf,
  editedCharacterIds,
  editedRoster,
  parseRosterEdits,
  patchedCharacterEdit,
  sameCharacterEdit,
  sameGrowthFields,
  sameRecycleRoom,
  withAccountEdit,
  withCharacterEdit,
  type RosterEdits,
} from './rosterEdits.ts';

const INDEX = [
  { resourceId: 10, rarity: 'SR' as const, class: 'Defender' as const, corporation: 'TETRA' },
  { resourceId: 82, rarity: 'SSR' as const, class: 'Attacker' as const, corporation: 'ELYSION' },
];

function character(over: Partial<SnapshotCharacter> = {}): SnapshotCharacter {
  return {
    ...emptyBuild(),
    growth: { level: 400, grade: 3, core: 7 },
    affectionRank: 10,
    gear: {
      head: { type: 'OL', level: 5, overload: [{ option: 'attack', level: 11 }] },
      body: { type: 'T9Corp', level: 3 },
      arm: null,
      leg: { type: 'T9', level: 0 },
    },
    cube: { id: 1000301, level: 7 },
    recycleRoom: { personal: 30, class: 20, corporation: 5 },
    skillLevels: { skill1: 10, skill2: 7, burst: 4 },
    treasure: { tid: 200101, level: 2, phase: 3 },
    ...over,
  };
}

const ROSTER: BuildSnapshot = {
  formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
  fetchedAt: '2026-10-28T20:00:00.000Z',
  synchroLevel: 400,
  recycleRoom: { '1001': 30, '1101': 20, '1102': 8, '1201': 5, '1203': 6 },
  characters: {
    // Lv がシンクロ LV と違うキャラ
    '10': character({
      growth: { level: 160, grade: 2, core: 0 },
      recycleRoom: { personal: 30, class: 8, corporation: 6 },
      collection: { rarity: 'R', level: 15 },
      treasure: null,
    }),
    '82': character(),
  },
  unmapped: ['x'],
};
/** 読み込んだファイル: キャラのデータに無いキャラ（999）と、知らない欄を持つ */
const RAW_CHARACTERS: Record<string, SnapshotCharacter> = { ...ROSTER.characters, '999': character() };
const RAW = { ...ROSTER, extra: 1, characters: RAW_CHARACTERS };
const SAVED = JSON.stringify(RAW);
const NOW = '2026-11-12T03:00:00.000Z';
const base82 = characterEditOf(ROSTER.characters['82']!);
const edit82 = { ...base82, skillLevels: { skill1: 10, skill2: 8, burst: 4 } };

describe('parseRosterEdits', () => {
  it('無ければ null、書いた形は読み戻す', () => {
    expect(parseRosterEdits(null)).toEqual({ ok: true, edits: null });
    const edits = withCharacterEdit(null, ROSTER, 82, edit82, NOW)!;
    expect(parseRosterEdits(JSON.stringify(edits))).toEqual({ ok: true, edits });
  });

  it('JSON でない・知らない版・形が合わないものは理由を返す', () => {
    expect(parseRosterEdits('{')).toEqual({ ok: false, error: 'JSON として読めない' });
    expect(parseRosterEdits('{"formatVersion":2}')).toEqual({
      ok: false,
      error: 'この版の編集は読めない（formatVersion 2）',
    });
    expect(parseRosterEdits('[]')).toEqual({ ok: false, error: 'この版の編集は読めない（formatVersion なし）' });
    for (const broken of [
      { formatVersion: 1, characters: {} },
      { formatVersion: 1, editedAt: NOW, characters: { '82': 1 } },
      { formatVersion: 1, editedAt: NOW, characters: {}, synchroLevel: '400' },
      { formatVersion: 1, editedAt: NOW, characters: {}, recycleRoom: [] },
    ])
      expect(parseRosterEdits(JSON.stringify(broken))).toEqual({ ok: false, error: '編集の形が合わない' });
  });
});

describe('比べ', () => {
  it('OL の行は位置で比べる（position の有無・並びで違うと判定しない）', () => {
    const lines = [
      { option: 'attack' as const, level: 11 },
      { option: 'elementDamage' as const, level: 3 },
    ];
    const a = { ...base82, gear: { ...base82.gear, head: { type: 'OL' as const, level: 5, overload: lines } } };
    const positioned = [
      { ...lines[1]!, position: 1 },
      { ...lines[0]!, position: 0 },
    ];
    const b = { ...base82, gear: { ...base82.gear, head: { type: 'OL' as const, level: 5, overload: positioned } } };
    expect(sameCharacterEdit(a, b)).toBe(true);
    // 間の行を空けた装備は、詰めた装備と違う
    const gapped = [lines[0]!, { ...lines[1]!, position: 2 }];
    const c = { ...base82, gear: { ...base82.gear, head: { type: 'OL' as const, level: 5, overload: gapped } } };
    expect(sameCharacterEdit(a, c)).toBe(false);
    // 行の無い OL は、overload が無くても空でも同じ
    const none = { ...base82, gear: { ...base82.gear, head: { type: 'OL' as const, level: 5 } } };
    const empty = { ...base82, gear: { ...base82.gear, head: { type: 'OL' as const, level: 5, overload: [] } } };
    expect(sameCharacterEdit(none, empty)).toBe(true);
  });

  it('どの項目の違いも見分ける', () => {
    expect(sameCharacterEdit(base82, { ...base82 })).toBe(true);
    for (const other of [
      { ...base82, growth: { grade: 2, core: 7 } },
      { ...base82, growth: { grade: 3, core: 6 } },
      { ...base82, affectionRank: 11 },
      { ...base82, gear: { ...base82.gear, arm: { type: 'T9' as const, level: 0 } } },
      { ...base82, cube: null },
      { ...base82, collection: { rarity: 'SR' as const, level: 0 } },
      edit82,
      { ...base82, treasure: null },
      { ...base82, treasure: { tid: 200101, level: 1, phase: 2 as const } },
    ])
      expect(sameCharacterEdit(base82, other)).toBe(false);
  });

  it('スロットの育成どうし（宝物は段階で比べる）', () => {
    const fields = rosterFields(ROSTER.characters['82']!);
    expect(sameGrowthFields(fields, rosterFields(character()))).toBe(true);
    expect(sameGrowthFields(fields, { ...fields, treasurePhase: 2 })).toBe(false);
    expect(sameGrowthFields(fields, { ...fields, build: { ...fields.build, affectionRank: 1 } })).toBe(false);
    // 宝物を付けているスロットに残っている R・SR のコレクションは比べない（計算は宝物を使う）
    const leftover = { ...fields, build: { ...fields.build, collection: { rarity: 'R' as const, level: 3 } } };
    expect(sameGrowthFields(fields, leftover)).toBe(true);
    expect(sameGrowthFields({ ...fields, treasurePhase: 0 }, { ...leftover, treasurePhase: 0 })).toBe(false);
  });

  it('研究の Lv は、無い研究を 0 として比べる', () => {
    expect(sameRecycleRoom({ '1001': 30 }, { '1001': 30, '1101': 0 })).toBe(true);
    expect(sameRecycleRoom({ '1001': 30 }, { '1001': 30, '1101': 1 })).toBe(false);
  });
});

describe('patchedCharacterEdit（育成の欄の変更を 1 体分に重ねる）', () => {
  const current = ROSTER.characters['82']!;
  const fields = rosterFields(current);

  it('変えた項目だけを重ね、宝物は段階を変えない限りそのまま', () => {
    expect(patchedCharacterEdit(current, {}, 200101)).toEqual(base82);
    expect(patchedCharacterEdit(current, { skillLevels: edit82.skillLevels }, 200101)).toEqual(edit82);
    expect(patchedCharacterEdit(current, { growth: { grade: 1, core: 0 } }, 200101).growth).toEqual({
      grade: 1,
      core: 0,
    });
    const build = { ...fields.build, affectionRank: 30, cube: null };
    expect(patchedCharacterEdit(current, { build }, 200101)).toMatchObject({ affectionRank: 30, cube: null });
  });

  it('宝物の段階は、その段階の Lv で書く（段階 1 は Lv 0）。tid はいまの宝物のもの', () => {
    expect(patchedCharacterEdit(current, { treasurePhase: 1 }, 1).treasure).toEqual({
      tid: 200101,
      level: 0,
      phase: 1,
    });
    expect(patchedCharacterEdit(current, { treasurePhase: 2 }, 1).treasure).toEqual({
      tid: 200101,
      level: 1,
      phase: 2,
    });
    expect(patchedCharacterEdit(current, { treasurePhase: 3 }, 1).treasure).toEqual(current.treasure);
  });

  it('宝物を外して R・SR にする・R・SR から宝物にする（宝物があるときはコレクションを持たない）', () => {
    const toCollection = patchedCharacterEdit(
      current,
      { treasurePhase: 0, build: { ...fields.build, collection: { rarity: 'SR', level: 0 } } },
      200101,
    );
    expect(toCollection).toMatchObject({ treasure: null, collection: { rarity: 'SR', level: 0 } });
    const plain = ROSTER.characters['10']!;
    // 宝物の無かったニケは、キャラのデータの宝物の ID で書く
    expect(patchedCharacterEdit(plain, { treasurePhase: 2 }, 200202)).toMatchObject({
      treasure: { tid: 200202, level: 1, phase: 2 },
      collection: null,
    });
    // 宝物の無いキャラ（ID が無い）は宝物なしのまま
    expect(patchedCharacterEdit(plain, { treasurePhase: 2 }, null)).toMatchObject({
      treasure: null,
      collection: plain.collection,
    });
  });

  it('R・SR を選んだら、段階 0 が来なくても宝物は持たない（キャラのデータに宝物が無いニケの、育成状況の宝物）', () => {
    const build = { ...fields.build, collection: { rarity: 'R' as const, level: 0 } };
    expect(patchedCharacterEdit(current, { build }, null)).toMatchObject({
      treasure: null,
      collection: build.collection,
    });
    // 「なし」のまま（コレクションを選んでいない）なら、宝物は残る
    expect(patchedCharacterEdit(current, { build: fields.build }, null).treasure).toEqual(current.treasure);
  });

  it('段階が未確定の宝物は、ほかの項目を変えても残り、段階を選ぶと決まる', () => {
    const unknown = character({ treasure: { tid: 200101, level: 0, phase: null } });
    expect(patchedCharacterEdit(unknown, { skillLevels: edit82.skillLevels }, 200101).treasure).toEqual(
      unknown.treasure,
    );
    expect(patchedCharacterEdit(unknown, { treasurePhase: 1 }, 200101).treasure).toEqual({
      tid: 200101,
      level: 0,
      phase: 1,
    });
  });
});

describe('操作', () => {
  it('ニケの編集を重ね、読み込んだ値と同じになったら外す（空になれば null）', () => {
    const edits = withCharacterEdit(null, ROSTER, 82, edit82, NOW)!;
    expect(edits).toEqual({ formatVersion: 1, editedAt: NOW, characters: { '82': edit82 } });
    expect([...editedCharacterIds(edits)]).toEqual([82]);
    expect(accountEdited(edits)).toBe(false);
    expect(withCharacterEdit(edits, ROSTER, 82, base82, NOW)).toBeNull();
    expect(withCharacterEdit(edits, ROSTER, 82, null, NOW)).toBeNull();
    // ほかの編集は残る。編集の日時は進む
    const two = withCharacterEdit(
      edits,
      ROSTER,
      10,
      { ...characterEditOf(ROSTER.characters['10']!), cube: null },
      NOW,
    )!;
    const later = '2026-11-12T04:00:00.000Z';
    expect(withCharacterEdit(two, ROSTER, 82, null, later)).toMatchObject({
      editedAt: later,
      characters: { '10': { cube: null } },
    });
    // 育成状況にいないニケの編集は持たない
    expect(withCharacterEdit(null, ROSTER, 5, edit82, NOW)).toBeNull();
    expect([...editedCharacterIds(null)]).toEqual([]);
  });

  it('アカウント全体は、読み込んだ値から変えたものだけを持つ', () => {
    const same = { synchroLevel: 400, recycleRoom: ROSTER.recycleRoom };
    expect(withAccountEdit(null, ROSTER, same, NOW)).toBeNull();
    const level = withAccountEdit(null, ROSTER, { ...same, synchroLevel: 410 }, NOW)!;
    expect(level).toEqual({ formatVersion: 1, editedAt: NOW, characters: {}, synchroLevel: 410 });
    expect(accountEdited(level)).toBe(true);
    const room = { ...ROSTER.recycleRoom, '1101': 21 };
    const both = withAccountEdit(level, ROSTER, { synchroLevel: 410, recycleRoom: room }, NOW)!;
    expect(both).toMatchObject({ synchroLevel: 410, recycleRoom: room });
    // シンクロ LV だけを読み込んだ値に戻すと、リサイクルルームだけが残る
    const roomOnly = withAccountEdit(both, ROSTER, { synchroLevel: 400, recycleRoom: room }, NOW)!;
    expect(roomOnly.synchroLevel).toBeUndefined();
    expect(roomOnly.recycleRoom).toEqual(room);
    expect(withAccountEdit(both, ROSTER, null, NOW)).toBeNull();
    // ニケの編集は残る
    const withCharacter = withCharacterEdit(both, ROSTER, 82, edit82, NOW)!;
    expect(withAccountEdit(withCharacter, ROSTER, null, NOW)).toEqual({
      formatVersion: 1,
      editedAt: NOW,
      characters: { '82': edit82 },
    });
    expect(accountEdited(null)).toBe(false);
  });
});

describe('applyRosterEdits と editedRoster（重ねを当てる）', () => {
  const edits = (over: Partial<RosterEdits>): RosterEdits => ({
    formatVersion: 1,
    editedAt: NOW,
    characters: {},
    ...over,
  });

  it('ニケの編集を当て、版 2・editedAt つきにする。ほかの欄とキャラのデータに無いキャラは残す', () => {
    const { raw, read } = editedRoster(SAVED, edits({ characters: { '82': edit82 } }), INDEX);
    expect(raw).toMatchObject({ formatVersion: 2, editedAt: NOW, extra: 1, unmapped: ['x'] });
    expect((raw.characters as Record<string, unknown>)['999']).toEqual(RAW.characters['999']);
    expect((raw.characters as Record<string, unknown>)['10']).toEqual(RAW.characters['10']);
    expect(read.ok && read.snapshot).toEqual({
      ...ROSTER,
      editedAt: NOW,
      characters: { ...ROSTER.characters, '82': { ...ROSTER.characters['82']!, skillLevels: edit82.skillLevels } },
    });
    // 書き出したものは、読み込みと同じ検査で読み戻せる
    const reread = readBuildSnapshot(JSON.stringify(raw), INDEX);
    expect(reread.ok && reread.snapshot).toEqual(read.ok && read.snapshot);
  });

  it('シンクロ LV を変えると、Lv が読み込んだシンクロ LV と同じキャラだけが追従する', () => {
    const { raw, read } = editedRoster(SAVED, edits({ synchroLevel: 410 }), INDEX);
    expect(read.ok && read.snapshot.synchroLevel).toBe(410);
    expect(read.ok && read.snapshot.characters['82']!.growth.level).toBe(410);
    expect(read.ok && read.snapshot.characters['10']!.growth.level).toBe(160);
    // キャラのデータに無いキャラの Lv も同じ規則で直す
    expect((raw.characters as Record<string, SnapshotCharacter>)['999']!.growth.level).toBe(410);
  });

  it('リサイクルルームを変えると、キャラごとの写しをクラスと企業から引き直す（キャラのデータに無いキャラは直せない）', () => {
    const recycleRoom = { ...ROSTER.recycleRoom, '1001': 31, '1101': 21, '1203': 7 };
    const { raw, read } = editedRoster(SAVED, edits({ recycleRoom }), INDEX);
    expect(read.ok && read.snapshot.recycleRoom).toEqual(recycleRoom);
    expect(read.ok && read.snapshot.characters['82']!.recycleRoom).toEqual({ personal: 31, class: 21, corporation: 5 });
    expect(read.ok && read.snapshot.characters['10']!.recycleRoom).toEqual({ personal: 31, class: 8, corporation: 7 });
    expect((raw.characters as Record<string, SnapshotCharacter>)['999']!.recycleRoom).toEqual(
      RAW.characters['999']!.recycleRoom,
    );
    // 変えていなければ写しは触らない
    const untouched = applyRosterEdits(RAW, edits({ synchroLevel: 410 }), INDEX);
    expect((untouched.characters as Record<string, SnapshotCharacter>)['10']!.recycleRoom).toEqual(
      RAW.characters['10']!.recycleRoom,
    );
  });

  it('育成状況にいない・キャラのデータに無いニケの編集は当てない', () => {
    const { raw } = editedRoster(SAVED, edits({ characters: { '5': edit82, '999': edit82 } }), INDEX);
    expect(Object.keys(raw.characters as object)).toEqual(Object.keys(RAW.characters));
    expect((raw.characters as Record<string, unknown>)['999']).toEqual(RAW.characters['999']);
  });

  it('保存した重ねからは、編集できる項目だけを当てる（Lv・リサイクルルームの写しは当てない）。欠けた項目は検査で止まる', () => {
    const extra = {
      ...edit82,
      growth: { ...edit82.growth, level: 1 },
      recycleRoom: { personal: 0, class: 0, corporation: 0 },
    };
    const { read } = editedRoster(SAVED, edits({ characters: { '82': extra } }), INDEX);
    expect(read.ok && read.snapshot.characters['82']).toEqual({
      ...ROSTER.characters['82']!,
      skillLevels: edit82.skillLevels,
    });
    const { growth: _growth, ...partial } = edit82;
    const missing = editedRoster(SAVED, edits({ characters: { '82': partial as typeof edit82 } }), INDEX).read;
    expect(missing.ok).toBe(false);
  });

  it('範囲の外の値を持つ重ねは、当てた結果が検査で止まる', () => {
    const broken = { ...edit82, growth: { grade: 99, core: 0 } };
    const { read } = editedRoster(SAVED, edits({ characters: { '82': broken } }), INDEX);
    expect(read).toEqual({ ok: false, errors: ['characters.82.growth.grade: 0〜3 の整数でない（99）'] });
  });
});
