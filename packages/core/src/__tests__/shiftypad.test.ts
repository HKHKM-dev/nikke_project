// ShiftyPad の育成データの写し方（plan/design-build-snapshot.md 3 節）。データは作った値（オーナーの実データは使わない）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateBuild } from '../build.ts';
import { MASTER_FILES } from '../load.ts';
import {
  buildEntriesOf,
  diffSnapshots,
  rosterMarkdown,
  stripAccountFields,
  toBuildSnapshot,
  type ShiftyPadDetail,
  type ShiftyPadRaw,
} from '../shiftypad.ts';
import type { BuildMasters, CharacterIndexEntry } from '../types.ts';

const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [
    k,
    JSON.parse(readFileSync(new URL(`../../data/masters/${f}`, import.meta.url), 'utf8')) as unknown,
  ]),
) as BuildMasters;

const entry = (resourceId: number, nameCode: number, over: Partial<CharacterIndexEntry> = {}): CharacterIndexEntry => ({
  resourceId,
  nameCode,
  name: { ja: `ニケ${resourceId}`, en: `Nikke ${resourceId}` },
  rarity: 'SSR',
  class: 'Attacker',
  corporation: 'ELYSION',
  element: 'Fire',
  weaponType: 'AR',
  burstStep: 'Step3',
  ...over,
});
const INDEX = [
  entry(82, 5065, { class: 'Defender', corporation: 'MISSILIS', weaponType: 'SMG' }),
  entry(10, 3001, { rarity: 'SR' }),
  entry(30, 5016, { class: 'Supporter', corporation: 'TETRA', weaponType: 'SG' }),
];

/** 装備の欄がすべて空の詳細 */
function detail(nameCode: number, over: ShiftyPadDetail = {}): ShiftyPadDetail {
  const d: ShiftyPadDetail = {
    name_code: nameCode,
    lv: 1,
    grade: 3,
    core: 0,
    attractive_lv: 0,
    harmony_cube_tid: 0,
    harmony_cube_lv: 0,
    arena_harmony_cube_tid: 0,
    arena_harmony_cube_lv: 0,
    favorite_item_tid: 0,
    favorite_item_lv: 0,
    skill1_lv: 10,
    skill2_lv: 10,
    ulti_skill_lv: 10,
  };
  for (const p of ['head', 'torso', 'arm', 'leg'])
    for (const k of ['tid', 'lv', 'tier', 'corporation_type', 'option1_id', 'option2_id', 'option3_id'])
      d[`${p}_equip_${k}`] = 0;
  return { ...d, ...over };
}

const RAW: ShiftyPadRaw = {
  fetchedAt: '2026-10-28T16:30:00.000Z',
  outpost: {
    synchro_level: 728,
    recycle_room_researches: [
      { tid: 1001, lv: 340 },
      { tid: 1101, lv: 223 },
      { tid: 1102, lv: 199 },
      { tid: 1103, lv: 198 },
      { tid: 1201, lv: 198 },
      { tid: 1202, lv: 196 },
      { tid: 1203, lv: 195 },
    ],
  },
  characters: [
    { name_code: 5065, lv: 728, grade: 3, core: 7 },
    { name_code: 3001, lv: 728, grade: 2, core: 0 },
    { name_code: 5016, lv: 728, grade: 3, core: 2 },
  ],
  details: [
    // OL 4 部位（オプションの空きあり）・キューブ・SR のコレクション・好感度
    detail(5065, {
      attractive_lv: 40,
      harmony_cube_tid: 1000303,
      harmony_cube_lv: 15,
      favorite_item_tid: 100102,
      favorite_item_lv: 15,
      skill1_lv: 10,
      skill2_lv: 4,
      ulti_skill_lv: 7,
      head_equip_tid: 1,
      head_equip_tier: 10,
      head_equip_lv: 5,
      head_equip_option1_id: 7000815,
      head_equip_option2_id: 7000507,
      head_equip_option3_id: 7001302,
      torso_equip_tid: 2,
      torso_equip_tier: 10,
      torso_equip_lv: 3,
      torso_equip_option1_id: 7001101,
      arm_equip_tid: 3,
      arm_equip_tier: 10,
      arm_equip_lv: 0,
      leg_equip_tid: 4,
      leg_equip_tier: 10,
      leg_equip_lv: 5,
      leg_equip_option2_id: 7000610,
    }),
    // T9 と企業装備・R のコレクション・好感度 0（R / SR は 0 で返る）
    detail(3001, {
      favorite_item_tid: 100101,
      favorite_item_lv: 3,
      head_equip_tid: 5,
      head_equip_tier: 9,
      head_equip_lv: 5,
      head_equip_corporation_type: 1,
      torso_equip_tid: 6,
      torso_equip_tier: 9,
      torso_equip_lv: 2,
    }),
    // 宝物
    detail(5016, { favorite_item_tid: 200301, favorite_item_lv: 1, attractive_lv: 12 }),
  ],
};

describe('toBuildSnapshot', () => {
  const snap = toBuildSnapshot(RAW, INDEX);

  it('keys characters by resourceId in order and keeps the account-wide values', () => {
    expect(Object.keys(snap.characters)).toEqual(['10', '30', '82']);
    expect(snap.synchroLevel).toBe(728);
    expect(snap.fetchedAt).toBe(RAW.fetchedAt);
    expect(snap.recycleRoom['1101']).toBe(223);
    expect(snap.unmapped).toEqual([]);
  });

  it('maps OL gear, option lines, cube, collection, affection and skill levels', () => {
    const c = snap.characters['82']!;
    expect(c.growth).toEqual({ level: 728, grade: 3, core: 7 });
    expect(c.affectionRank).toBe(40);
    expect(c.gear.head).toEqual({
      type: 'OL',
      level: 5,
      overload: [
        { option: 'attack', level: 15 },
        { option: 'elementDamage', level: 7 },
        { option: 'defence', level: 2 },
      ],
    });
    expect(c.gear.body).toEqual({ type: 'OL', level: 3, overload: [{ option: 'critRate', level: 1 }] });
    expect(c.gear.arm).toEqual({ type: 'OL', level: 0 });
    expect(c.gear.leg).toEqual({ type: 'OL', level: 5, overload: [{ option: 'hitRate', level: 10 }] });
    expect(c.cube).toEqual({ id: 1000303, level: 15 });
    expect(c.collection).toEqual({ rarity: 'SR', level: 15 });
    expect(c.treasure).toBeNull();
    expect(c.skillLevels).toEqual({ skill1: 10, skill2: 4, burst: 7 });
    // 防御型・ミシリス
    expect(c.recycleRoom).toEqual({ personal: 340, class: 199, corporation: 196 });
  });

  it('maps T9, corporation gear, an R collection and affection 0 to rank 1', () => {
    const c = snap.characters['10']!;
    expect(c.gear).toEqual({
      head: { type: 'T9Corp', level: 5 },
      body: { type: 'T9', level: 2 },
      arm: null,
      leg: null,
    });
    expect(c.collection).toEqual({ rarity: 'R', level: 3 });
    expect(c.affectionRank).toBe(1);
    expect(c.cube).toBeNull();
    expect(c.recycleRoom).toEqual({ personal: 340, class: 223, corporation: 198 });
  });

  it('keeps a treasure with its level and leaves the phase undecided', () => {
    const c = snap.characters['30']!;
    expect(c.treasure).toEqual({ tid: 200301, level: 1, phase: null });
    expect(c.collection).toBeNull();
    // 支援型・テトラ
    expect(c.recycleRoom).toEqual({ personal: 340, class: 198, corporation: 195 });
  });

  it('produces builds that pass validateBuild', () => {
    for (const [id, c] of Object.entries(snap.characters)) {
      const e = INDEX.find((i) => i.resourceId === Number(id))!;
      expect(() => validateBuild(e, c, masters)).not.toThrow();
    }
  });

  it('reports values it cannot map instead of dropping them silently', () => {
    const raw: ShiftyPadRaw = {
      ...RAW,
      characters: [...RAW.characters, { name_code: 9999, lv: 728, grade: 0, core: 0 }],
      details: [
        detail(5065, {
          head_equip_tid: 1,
          head_equip_tier: 11,
          torso_equip_tid: 2,
          torso_equip_tier: 10,
          torso_equip_option1_id: 7001401,
          favorite_item_tid: 100103,
        }),
        detail(9999),
      ],
    };
    const s = toBuildSnapshot(raw, INDEX);
    expect(s.characters['82']!.gear.head).toBeNull();
    expect(s.characters['82']!.gear.body).toEqual({ type: 'OL', level: 0 });
    expect(s.characters['82']!.collection).toBeNull();
    expect(s.characters['9999']).toBeUndefined();
    expect(s.unmapped).toHaveLength(6);
    expect(s.unmapped.join('\n')).toMatch(/tier 11/);
    expect(s.unmapped.join('\n')).toMatch(/7001401/);
    expect(s.unmapped.join('\n')).toMatch(/100103/);
    expect(s.unmapped.join('\n')).toMatch(/name_code 9999: data\/characters に無い/);
    expect(s.unmapped.join('\n')).toMatch(/name_code 3001: GetUserCharacterDetails に無い/);
  });
});

describe('stripAccountFields', () => {
  it('drops account identifiers at any depth and keeps the rest', () => {
    const v = {
      intl_open_id: 'x',
      outpost: { synchro_level: 1, nickname: 'n', role_id: 1 },
      list: [{ uid: 1, name_code: 2, area_id: 3, nikke_area_id: 4 }],
    };
    expect(stripAccountFields(v)).toEqual({
      outpost: { synchro_level: 1 },
      list: [{ name_code: 2, nikke_area_id: 4 }],
    });
  });
});

describe('buildEntriesOf', () => {
  it('reads both a snapshot and a plain --build file', () => {
    const snap = toBuildSnapshot(RAW, INDEX);
    expect(Object.keys(buildEntriesOf(snap))).toEqual(['10', '30', '82']);
    expect(buildEntriesOf({ '82': { affectionRank: 3 } })).toEqual({ '82': { affectionRank: 3 } });
  });
});

describe('diffSnapshots and rosterMarkdown', () => {
  const labels = {
    nameOf: (id: number) => `ニケ${id}`,
    cubeName: (id: number) => (id === 1000303 ? 'Bキューブ' : undefined),
  };
  const prev = toBuildSnapshot(RAW, INDEX);

  it('reports account-wide, roster and per-character changes, with the attack when given', () => {
    const next = toBuildSnapshot(
      {
        ...RAW,
        outpost: {
          ...RAW.outpost,
          recycle_room_researches: RAW.outpost.recycle_room_researches.map((r) =>
            r.tid === 1201 ? { ...r, lv: 202 } : r,
          ),
        },
        details: RAW.details.map((d) => (d['name_code'] === 5065 ? { ...d, skill2_lv: 10, harmony_cube_tid: 0 } : d)),
      },
      INDEX,
    );
    const attack = (_id: number, c: { recycleRoom: { corporation: number }; cube: unknown }) =>
      1000 + c.recycleRoom.corporation * 25 + (c.cube === null ? 0 : 910);
    const lines = diffSnapshots(prev, next, labels, attack).join('\n');
    expect(lines).toContain('リサイクルルームの研究（エリシオン）: Lv 198 → 202');
    expect(lines).toContain(
      '- 82 ニケ82\n  - キューブ: Bキューブ Lv15 → -\n  - スキル: 10/4/7 → 10/10/7\n  - 攻撃力（戦闘中・バフ前）: 6810 → 5900（-910）',
    );
    expect(lines).toContain('変化だけで攻撃力が変わったキャラ: 1 体');
    expect(lines).toContain('- 10 ニケ10 +100');
    expect(lines).toMatch(/## 所持の増減\n\n- 変化なし/);
  });

  it('lists additions and an empty diff', () => {
    const fewer = toBuildSnapshot(
      { ...RAW, characters: RAW.characters.slice(1), details: RAW.details.slice(1) },
      INDEX,
    );
    const lines = diffSnapshots(fewer, prev, labels).join('\n');
    expect(lines).toContain('- 増えた: 82 ニケ82');
    expect(diffSnapshots(prev, prev, labels).join('\n')).toMatch(/## キャラごとの変化\n\n- 変化なし/);
  });

  it('renders the roster table', () => {
    const rows = rosterMarkdown(prev, labels);
    expect(rows[2]).toBe('| 10 | ニケ10 | 2 | 0 | 10/10/10 | - | R Lv3 |');
    expect(rows[3]).toBe('| 30 | ニケ30 | 3 | 2 | 10/10/10 | - | 宝物 Lv1 |');
    expect(rows[4]).toBe('| 82 | ニケ82 | 3 | 7 | 10/4/7 | Bキューブ Lv15 | SR Lv15 |');
  });
});
