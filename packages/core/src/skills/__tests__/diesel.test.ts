// ディーゼル（72）の定義（plan/design-diesel.md）: 基礎版と宝物版の読み込みと、Lv ごとの解決値。イチゴキャンディ（命中 N 回ごと・
// 10 スタック・最大装弾数▲）、フルスタックの消費のきっかけの弾丸チャージ・貫通ダメージ▲（2.1 節）、宝物版のヘイトと、ヘイトの間の
// スタック量▲
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import {
  resolveInstant,
  resolveStackChanges,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  MAX_SKILL_LEVELS,
  type SkillLevels,
} from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type RawDefinition = {
  skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }>;
  treasureSkills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }>;
};

const diesel = readJson<CharacterData>('../../../data/characters/72.json');
const raw = readJson<RawDefinition>('../../../data/skills/72.json');
const def = parseSkillDefinition(raw);
const LV1: SkillLevels = { skill1: 1, skill2: 1, burst: 1 };

/** 段階 3（3 スロットとも宝物版）の character と定義 */
const treasure = applyTreasure(diesel, def, 3);

describe('読み込み', () => {
  it('reads the base and the treasure versions of all three slots', () => {
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual(['state', 'ammoRefill']);
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.treasureSkills?.skill1?.effects.map((e) => e.kind)).toEqual(['stackChange']);
    expect(def.treasureSkills?.skill2?.effects.map((e) => e.kind)).toEqual(['state', 'ammoRefill', 'timed']);
    expect(def.treasureSkills?.burst?.effects.map((e) => e.kind)).toEqual(['burstDamage', 'state']);
  });

  it('takes existingOnly only on an increase on self', () => {
    const copy = structuredClone(raw);
    copy.treasureSkills.skill1!.effects[0]!.decrease = true;
    expect(() => parseSkillDefinition(copy)).toThrow(/existingOnly needs an increase/);
  });

  it('needs a self stacking grant on a shot count for the full-stack refill', () => {
    const copy = structuredClone(raw);
    copy.skills.skill2!.effects[0]!.trigger = 'burstUse';
    copy.treasureSkills.skill2!.effects[0]!.trigger = 'burstUse';
    expect(() => parseSkillDefinition(copy)).toThrow(/shot count triggers/);
  });
});

describe('基礎版の解決値', () => {
  it('stacks Strawberry Candy every 100 hits (10 stacks, 10 s, max ammo up)', () => {
    const [grant] = resolveStateGrants(def, diesel, MAX_SKILL_LEVELS);
    expect(grant).toMatchObject({
      state: 'strawberryCandy',
      trigger: { count: 'normalHit', every: 100 },
      maxStacks: 10,
    });
    expect(grant!.durationFrames).toBe(588);
    const maxAmmo = (levels: SkillLevels) => resolveStateContents(def, diesel, levels);
    expect(maxAmmo(MAX_SKILL_LEVELS)).toEqual([expect.objectContaining({ stat: 'maxAmmo', scaling: 'ratio' })]);
    expect(maxAmmo(MAX_SKILL_LEVELS)[0]!.value).toBeCloseTo(0.567, 9);
    expect(maxAmmo(LV1)[0]!.value).toBeCloseTo(0.2835, 9);
  });

  it('reloads all allies on the full stack', () => {
    const refills = resolveInstant(def, diesel, MAX_SKILL_LEVELS).filter((e) => e.kind === 'ammoRefill');
    expect(refills).toEqual([expect.objectContaining({ target: 'allies', trigger: { fullStack: 'strawberryCandy' } })]);
    expect(refills[0]!.value).toBeCloseTo(0.8662, 9);
    expect(resolveInstant(def, diesel, LV1)[0]!.value).toBeCloseTo(0.4331, 9);
  });
});

describe('宝物版（段階 3）の解決値', () => {
  const { character, definition } = treasure;

  it('stacks Strawberry Candy every 70 hits and adds Pierce Damage up on the full stack', () => {
    const [grant, attract] = resolveStateGrants(definition!, character, MAX_SKILL_LEVELS);
    expect(grant).toMatchObject({
      state: 'strawberryCandy',
      trigger: { count: 'normalHit', every: 70 },
      maxStacks: 10,
    });
    expect(attract).toMatchObject({ state: 'attract', trigger: 'burstUse' });
    const pierce = resolveTimed(definition!, character, MAX_SKILL_LEVELS).filter((e) => e.stat === 'pierceDamage');
    expect(pierce).toEqual([expect.objectContaining({ target: 'allies', trigger: { fullStack: 'strawberryCandy' } })]);
    expect(pierce[0]!.value).toBeCloseTo(0.3, 9);
    expect(resolveTimed(definition!, character, LV1).find((e) => e.stat === 'pierceDamage')!.value).toBeCloseTo(
      0.177,
      9,
    );
  });

  it('adds one stack of Strawberry Candy every 150 hits while in Attract, only when Candy is present', () => {
    expect(resolveStackChanges(definition!, character, MAX_SKILL_LEVELS)).toEqual([
      expect.objectContaining({
        state: 'strawberryCandy',
        trigger: { count: 'normalHit', every: 150 },
        amount: 1,
        existingOnly: true,
        condition: { selfState: { state: 'attract', present: true } },
      }),
    ]);
  });
});
