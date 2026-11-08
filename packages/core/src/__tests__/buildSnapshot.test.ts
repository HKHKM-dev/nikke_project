// 育成状況の JSON の読み込みの検査（plan/design-combat-power-sort.md 5.3 節）。データは作った値（オーナーの実データは使わない）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BUILD_SNAPSHOT_FORMAT_VERSION,
  readBuildSnapshot,
  snapshotCombatPower,
  snapshotCombatPowers,
  unknownTreasurePhaseCount,
  type BuildSnapshot,
  type SnapshotCharacter,
} from '../buildSnapshot.ts';
import { emptyBuild } from '../build.ts';
import { computeCombatPower } from '../combatPower.ts';
import { MASTER_FILES } from '../load.ts';
import type { BuildMasters, CharacterData, CharacterIndex } from '../types.ts';

const INDEX = [
  { resourceId: 10, rarity: 'SR' as const },
  { resourceId: 82, rarity: 'SSR' as const },
];

function character(over: Partial<SnapshotCharacter> = {}): SnapshotCharacter {
  return {
    ...emptyBuild(),
    growth: { level: 200, grade: 3, core: 7 },
    affectionRank: 10,
    gear: {
      head: { type: 'OL', level: 5, overload: [{ option: 'attack', level: 11 }] },
      body: { type: 'T9Corp', level: 3 },
      arm: null,
      leg: { type: 'T9', level: 0 },
    },
    cube: { id: 1000301, level: 7 },
    recycleRoom: { personal: 30, class: 20, corporation: 10 },
    skillLevels: { skill1: 10, skill2: 7, burst: 4 },
    treasure: null,
    ...over,
  };
}

function snapshot(over: Partial<BuildSnapshot> = {}): BuildSnapshot {
  return {
    formatVersion: BUILD_SNAPSHOT_FORMAT_VERSION,
    fetchedAt: '2026-10-29T03:00:00.000Z',
    synchroLevel: 400,
    recycleRoom: { '1001': 30, '1101': 20 },
    characters: {
      '10': character({ growth: { level: 400, grade: 2, core: 0 }, collection: { rarity: 'R', level: 15 } }),
      '82': character({ treasure: { tid: 200101, level: 0, phase: null } }),
    },
    unmapped: [],
    ...over,
  };
}

const read = (value: unknown) => readBuildSnapshot(JSON.stringify(value), INDEX);
const errorsOf = (value: unknown) => {
  const r = read(value);
  return r.ok ? [] : r.errors;
};

describe('readBuildSnapshot', () => {
  it('書いた形をそのまま読み戻す', () => {
    const r = read(snapshot());
    expect(r).toEqual({ ok: true, snapshot: snapshot(), notices: [] });
  });

  it('unmapped は欠けてよい（空）', () => {
    const { unmapped: _unmapped, ...rest } = snapshot();
    const r = read(rest);
    expect(r.ok && r.snapshot.unmapped).toEqual([]);
  });

  it('JSON でない・スナップショットの形でない・知らない版は止める', () => {
    expect(readBuildSnapshot('{', INDEX)).toEqual({ ok: false, errors: ['JSON として読めない'] });
    expect(errorsOf({ '82': character() })[0]).toMatch(/スナップショット/);
    expect(errorsOf({ ...snapshot(), formatVersion: 2 })).toEqual(['この版の育成状況は読めない（formatVersion 2）']);
  });

  it('範囲の外の値は、欄の場所つきで止める', () => {
    const s = snapshot();
    s.characters['10'] = character({ growth: { level: 400, grade: 3, core: 1 } });
    s.characters['82'] = character({ gear: { ...character().gear, arm: { type: 'T9', level: 7 } } });
    expect(errorsOf(s)).toEqual([
      'characters.10.growth.grade: 0〜2 の整数でない（3）',
      'characters.10.growth.core: 0〜0 の整数でない（1）',
      'characters.82.gear.arm.level: 0〜5 の整数でない（7）',
    ]);
  });

  it('理由は 5 件まで出し、残りは件数にする', () => {
    const s = snapshot();
    s.characters['82'] = character({ skillLevels: { skill1: 0, skill2: 11, burst: 0 }, affectionRank: 0 });
    s.synchroLevel = 0;
    s.fetchedAt = '';
    const errors = errorsOf(s);
    expect(errors).toHaveLength(6);
    expect(errors.at(-1)).toBe('ほか 1 件');
  });

  it('宝物とコレクションの両方・知らない OL の項目・宝物の段階 1 は止める', () => {
    const s = snapshot();
    s.characters['82'] = character({
      collection: { rarity: 'SR', level: 1 },
      treasure: { tid: 200101, level: 1, phase: 2 },
    });
    expect(errorsOf(s)).toEqual(['characters.82: 宝物とコレクションの両方がある']);
    const bad = snapshot();
    bad.characters['82'] = character({
      gear: { ...character().gear, head: { type: 'OL', level: 5, overload: [{ option: 'XXX' as never, level: 1 }] } },
    });
    bad.characters['10'] = { ...bad.characters['10']!, treasure: { tid: 200101, level: 0, phase: 1 as never } };
    expect(errorsOf(bad)).toEqual([
      'characters.10.treasure.phase: Lv 0 なら null（1）',
      'characters.82.gear.head.overload[0].option: 知らない項目（"XXX"）',
    ]);
  });

  it('宝物の段階が Lv に合わないものは止める（Lv 0 は null、Lv 1・2 は段階 2・3）', () => {
    const s = snapshot();
    s.characters['10'] = { ...s.characters['10']!, treasure: { tid: 200101, level: 0, phase: 3 } };
    s.characters['82'] = character({ treasure: { tid: 200101, level: 2, phase: 2 } });
    expect(errorsOf(s)).toEqual([
      'characters.10.treasure.phase: Lv 0 なら null（3）',
      'characters.82.treasure.phase: Lv 2 なら 3（2）',
    ]);
    const missing = snapshot();
    missing.characters['82'] = character({ treasure: { tid: 200101, level: 1 } as never });
    expect(errorsOf(missing)).toEqual(['characters.82.treasure.phase: Lv 1 なら 2（なし）']);
    const ok = snapshot();
    ok.characters['82'] = character({ treasure: { tid: 200101, level: 2, phase: 3 } });
    expect(read(ok).ok).toBe(true);
  });

  it('キャラのデータに無いキャラは飛ばし、写せなかった値と合わせて知らせる', () => {
    const s = snapshot({ unmapped: ['a', 'b'] });
    s.characters['999'] = character();
    const r = read(s);
    expect(r.ok && Object.keys(r.snapshot.characters)).toEqual(['10', '82']);
    expect(r.ok && r.notices).toEqual([
      'キャラのデータに無い 1 体（999）は飛ばした（キャラのデータが古い）',
      '取り込みで写せなかった値が 2 件ある（unmapped）',
    ]);
  });
});

it('unknownTreasurePhaseCount: 宝物の段階が未確定のキャラの数', () => {
  expect(unknownTreasurePhaseCount(snapshot())).toBe(1);
});

describe('snapshotCombatPower', () => {
  const data = (path: string) => JSON.parse(readFileSync(new URL(`../../data/${path}`, import.meta.url), 'utf8'));
  const masters = Object.fromEntries(
    Object.entries(MASTER_FILES).map(([k, f]) => [k, data(`masters/${f}`) as unknown]),
  ) as BuildMasters;
  const id = (data('characters/index.json') as CharacterIndex).characters.find(
    (c) => c.rarity === 'SSR' && c.weaponType === 'AR',
  )!.resourceId;
  const c = data(`characters/${id}.json`) as CharacterData;
  const entry = character({ cube: null, gear: emptyBuild().gear, treasure: null });

  it('1 体分の育成で computeCombatPower を呼ぶ', () => {
    expect(snapshotCombatPower(c, entry, masters)).toEqual(
      computeCombatPower(
        c,
        { growth: entry.growth, build: entry, skillLevels: entry.skillLevels, treasure: false },
        masters,
      ),
    );
  });

  it('宝物の無いキャラに treasure があれば止め、snapshotCombatPowers は出せなかったキャラにする', () => {
    expect(c.treasure).toBeNull();
    const withTreasure = { ...entry, treasure: { tid: 200101, level: 1, phase: 2 as const } };
    expect(() => snapshotCombatPower(c, withTreasure, masters)).toThrow(RangeError);
    const r = snapshotCombatPowers(snapshot({ characters: { [String(id)]: withTreasure } }), () => c, masters);
    expect(r.powers.size).toBe(0);
    expect(r.failures.map((f) => f.id)).toEqual([id]);
  });
});
