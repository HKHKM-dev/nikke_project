// Stage 13: 育成入力の拡張 B — 効果層（plan/design-stage12.md 3・12 節）。
// OL の表の形、OL・キューブ・コレクションの BuffTotals への写像、新 stat（有利コード・コアダメージ・通常攻撃ダメージ倍率）の式。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OVERLOAD_OPTIONS, emptyBuild, fixedSpecBuild, validateBuild, type BuildInput } from '../../build.ts';
import {
  COLLECTION_SKILL_EFFECTS,
  CUBE_SKILL_EFFECTS,
  OVERLOAD_OPTION_STAT,
  resolveBuildEffects,
  type BuildEffect,
} from '../../buildEffects.ts';
import { ELEMENT_DAMAGE_APPLIES_TO_SKILL_DAMAGE, computeTriggerDamage, type EnemyInput } from '../../damage.ts';
import { elementMultiplier } from '../../element.ts';
import { computeTeamDamage } from '../../calc/model.ts';
import { type TeamSlotInput } from '../../team.ts';
import type { BuildMasters, CharacterData, OverloadOption } from '../../types.ts';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { ZERO_BUFFS, type BuffTotals } from '../buffs.ts';
import { computeSkillHit } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { resolvePassiveStates, type TimelineSlot } from '../timeline.ts';
import { BUFF_STATS, parseSkillDefinition } from '../types.ts';

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8')) as T;
}
const masters: BuildMasters = {
  gear: readJson('../../../data/masters/gear.json'),
  affection: readJson('../../../data/masters/affection.json'),
  cubes: readJson('../../../data/masters/cubes.json'),
  collections: readJson('../../../data/masters/collections.json'),
  recycleRoom: readJson('../../../data/masters/recycleRoom.json'),
  overload: readJson('../../../data/masters/overload.json'),
};
const ar = { weaponType: 'AR', corporation: 'ELYSION' } as const;
const smg = { weaponType: 'SMG', corporation: 'ELYSION' } as const;

function build(patch: Partial<BuildInput>): BuildInput {
  return { ...emptyBuild(), ...patch };
}
function olBuild(...lines: { option: OverloadOption; level: number }[]): BuildInput {
  return build({ gear: { head: { type: 'OL', level: 5, overload: lines }, body: null, arm: null, leg: null } });
}
const byStat = (effects: readonly BuildEffect[]) => effects.map((e) => [e.stat, Number(e.value.toFixed(6))]);

describe('OL の上昇値の表（3.2）', () => {
  const options = masters.overload.options;

  it('has the 9 CDN options in group-id order, 15 levels each, all verified against game data', () => {
    expect(options.map((o) => o.cdnGroupId)).toEqual([
      100100, 100200, 100300, 100400, 100500, 100600, 100700, 100800, 100900,
    ]);
    expect(options.map((o) => o.option)).toEqual(OVERLOAD_OPTIONS);
    expect(Object.keys(OVERLOAD_OPTION_STAT)).toEqual(OVERLOAD_OPTIONS);
    for (const o of options) {
      expect(o.values, o.option).toHaveLength(15);
      expect(o.verified).toBe(true);
    }
  });

  // 2026-09-24: ShiftyPad（Blablalink）の state_effects にある OL 行の実数値（function_value = 1/100 %）。
  // ユーザーのアカウントの 198 体の装備から観測できた 113 点（Lv → 値）。チャージ速度 Lv14 は観測なし
  const OBSERVED: Record<OverloadOption, Record<number, number>> = {
    elementDamage: {
      2: 1094,
      3: 1234,
      4: 1375,
      5: 1515,
      6: 1655,
      7: 1795,
      8: 1935,
      9: 2075,
      10: 2215,
      11: 2356,
      12: 2496,
      13: 2636,
      14: 2776,
      15: 2916,
    },
    hitRate: { 1: 477, 2: 547, 3: 618, 4: 688, 5: 759, 6: 829, 7: 900, 8: 970, 10: 1111, 11: 1181, 13: 1322, 15: 1463 },
    maxAmmo: {
      1: 2784,
      2: 3195,
      3: 3606,
      4: 4017,
      5: 4428,
      6: 4839,
      7: 5250,
      8: 5660,
      9: 6071,
      10: 6482,
      11: 6893,
      12: 7304,
      13: 7715,
      14: 8126,
    },
    attack: {
      1: 477,
      2: 547,
      3: 618,
      4: 688,
      5: 759,
      6: 829,
      7: 900,
      8: 970,
      9: 1040,
      10: 1111,
      11: 1181,
      12: 1252,
      13: 1322,
      14: 1393,
      15: 1463,
    },
    chargeDamage: { 1: 477, 2: 547, 3: 618, 4: 688, 5: 759, 6: 829, 7: 900, 9: 1040, 10: 1111, 11: 1181, 14: 1393 },
    chargeSpeed: {
      1: 198,
      2: 228,
      3: 257,
      4: 286,
      5: 316,
      6: 345,
      7: 375,
      8: 404,
      9: 433,
      10: 463,
      11: 492,
      12: 521,
      13: 551,
      15: 609,
    },
    critRate: { 1: 230, 2: 264, 3: 298, 4: 332, 5: 366, 7: 435, 8: 469, 10: 537, 11: 571, 14: 673, 15: 707 },
    critDamage: {
      1: 664,
      2: 762,
      3: 860,
      4: 958,
      5: 1056,
      6: 1154,
      7: 1252,
      8: 1350,
      9: 1448,
      10: 1546,
      11: 1644,
      14: 1938,
    },
    defence: { 2: 547, 3: 618, 5: 759, 7: 900, 8: 970, 9: 1040, 10: 1111, 11: 1181, 13: 1322, 14: 1393 },
  };

  it('matches the 113 values observed in the game data (ShiftyPad state_effects)', () => {
    let count = 0;
    for (const o of options) {
      for (const [level, value] of Object.entries(OBSERVED[o.option])) {
        expect(o.values[Number(level) - 1], `${o.option} Lv${level}`).toBe(value / 100);
        count++;
      }
    }
    expect(count).toBe(113);
  });

  it('matches the six values quoted from the other project (design 0.3)', () => {
    const v = (option: OverloadOption, level: number) => options.find((o) => o.option === option)!.values[level - 1];
    expect([v('attack', 1), v('attack', 13)]).toEqual([4.77, 13.22]);
    expect([v('elementDamage', 1), v('elementDamage', 13)]).toEqual([9.54, 26.36]);
    expect([v('maxAmmo', 1), v('maxAmmo', 13)]).toEqual([27.84, 77.15]);
  });

  it('every row is an arithmetic progression within the 2-decimal rounding (guards against typos)', () => {
    for (const o of options) {
      const first = o.values[0]!;
      const last = o.values[14]!;
      o.values.forEach((value, k) => {
        expect(Math.abs(value - (first + ((last - first) * k) / 14)), `${o.option} Lv${k + 1}`).toBeLessThanOrEqual(
          0.0101,
        );
      });
    }
  });
});

describe('validateBuild: OL の行（12.2）', () => {
  it('allows up to 3 lines on OL gear only, with levels 1..15', () => {
    expect(() => validateBuild(ar, olBuild({ option: 'attack', level: 15 }), masters)).not.toThrow();
    const t9 = build({
      gear: {
        head: { type: 'T9', level: 5, overload: [{ option: 'attack', level: 1 }] },
        body: null,
        arm: null,
        leg: null,
      },
    });
    expect(() => validateBuild(ar, t9, masters)).toThrow(/only allowed on OL gear/);
    const four = olBuild(
      ...(['attack', 'critRate', 'critDamage', 'hitRate'] as const).map((option) => ({ option, level: 1 })),
    );
    expect(() => validateBuild(ar, four, masters)).toThrow(/at most 3/);
    expect(() => validateBuild(ar, olBuild({ option: 'attack', level: 0 }), masters)).toThrow(RangeError);
    expect(() => validateBuild(ar, olBuild({ option: 'attack', level: 16 }), masters)).toThrow(RangeError);
    expect(() => validateBuild(ar, olBuild({ option: 'nope' as OverloadOption, level: 1 }), masters)).toThrow(
      /unknown option/,
    );
  });
});

describe('resolveBuildEffects（3.1）', () => {
  it('is empty for an empty build and for the fixed-spec preset (the effect layer never applies under fixed spec)', () => {
    expect(resolveBuildEffects(ar, emptyBuild(), masters)).toEqual({ effects: [], notes: [] });
    expect(resolveBuildEffects(ar, fixedSpecBuild({ rarity: 'SSR', corporation: 'ELYSION' }), masters)).toEqual({
      effects: [],
      notes: [],
    });
  });

  it('maps OL lines to ratio buffs and notes the DEF line as ignored', () => {
    const r = resolveBuildEffects(
      ar,
      olBuild({ option: 'attack', level: 15 }, { option: 'elementDamage', level: 11 }, { option: 'defence', level: 3 }),
      masters,
    );
    expect(byStat(r.effects)).toEqual([
      ['attack', 0.1463],
      ['elementDamage', 0.2356],
    ]);
    expect(r.effects[0]!.source).toMatchObject({ kind: 'overload', part: 'head', line: 0, level: 15 });
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ level: 'ignored', source: { kind: 'overload', line: 2 } });
  });

  it('every cube and collection skill in the masters has a mapping', () => {
    for (const cube of masters.cubes.cubes) {
      for (const skill of cube.skills)
        expect(CUBE_SKILL_EFFECTS[skill.id], `${cube.name.ja} ${skill.id}`).toBeDefined();
    }
    for (const c of masters.collections.collections) {
      for (const skill of c.skills) {
        expect(COLLECTION_SKILL_EFFECTS[skill.id], `${c.rarity} ${c.weaponType} ${skill.id}`).toBeDefined();
      }
    }
  });

  it('cube: the unique effect by stage and the anti-code (elemental advantage) once unlocked at Lv5', () => {
    // レリックベアー（1000303）: Lv1 はリロード速度の段階 1 だけ、Lv15 は段階 3 + アンチコード段階 6
    const lv1 = resolveBuildEffects(ar, build({ cube: { id: 1000303, level: 1 } }), masters);
    expect(byStat(lv1.effects)).toEqual([['reloadSpeed', 0.1484]]);
    const lv15 = resolveBuildEffects(ar, build({ cube: { id: 1000303, level: 15 } }), masters);
    expect(byStat(lv15.effects)).toEqual([
      ['reloadSpeed', 0.2969],
      ['elementDamage', 0.1909],
    ]);
    expect(lv15.effects[1]!.source).toMatchObject({ kind: 'cube', skillId: 4009012, level: 6 });
    // タクティカルベアー（1000304）の弾丸チャージは未対応として知らせる
    const bastion = resolveBuildEffects(ar, build({ cube: { id: 1000304, level: 15 } }), masters);
    expect(byStat(bastion.effects)).toEqual([['elementDamage', 0.1909]]);
    expect(bastion.notes.map((n) => n.level)).toEqual(['unsupported']);
    // クオンタム（1000307）はバーストゲージのチャージ速度
    const quantum = resolveBuildEffects(ar, build({ cube: { id: 1000307, level: 7 } }), masters);
    expect(byStat(quantum.effects)).toEqual([
      ['burstGaugeSpeed', 0.0466],
      ['elementDamage', 0.0848],
    ]);
  });

  it('collection: the weapon-type effect by stage, DEF and damage-taken lines ignored', () => {
    const arSr15 = resolveBuildEffects(ar, build({ collection: { rarity: 'SR', level: 15 } }), masters);
    expect(byStat(arSr15.effects)).toEqual([['coreDamage', 0.1704]]);
    expect(arSr15.notes.map((n) => n.level)).toEqual(['ignored', 'ignored']);
    const smgR0 = resolveBuildEffects(smg, build({ collection: { rarity: 'R', level: 0 } }), masters);
    expect(byStat(smgR0.effects)).toEqual([['normalAttackDamage', 0.0157]]);
    // 宝物を解放している枠は R / SR のコレクションを付けていない（宝物のスキルは skills/treasure.ts）
    expect(
      resolveBuildEffects(ar, build({ collection: { rarity: 'SR', level: 15 } }), masters, { treasurePhase: 1 })
        .effects,
    ).toEqual([]);
  });

  it('the new stats are part of the skill DSL too', () => {
    for (const stat of ['elementDamage', 'coreDamage', 'normalAttackDamage'] as const) {
      expect(BUFF_STATS).toContain(stat);
    }
  });
});

describe('BuffTotals への合成（3.1）: 装備した枠自身の常時バフ', () => {
  it('adds build effects on top of skill passives, only to the slot that has them', () => {
    const allyAttack = makeCharacter({}, { resourceId: 2 });
    allyAttack.skills.skill1 = { ...allyAttack.skills.skill1, values: [Array.from({ length: 10 }, () => '10')] };
    const definition = parseSkillDefinition({
      formatVersion: 1,
      resourceId: 2,
      checkedAt: '2026-09-24',
      skills: {
        skill1: { support: 'supported', effects: [{ kind: 'passive', target: 'allies', stat: 'attack', ref: 1 }] },
        skill2: { support: 'unsupported', effects: [] },
        burst: { support: 'unsupported', effects: [] },
      },
    });
    const effects: BuildEffect[] = [
      { source: { kind: 'overload', name: { ja: '', en: '' }, level: 15 }, stat: 'attack', value: 0.1463 },
      { source: { kind: 'cube', name: { ja: '', en: '' }, level: 6 }, stat: 'elementDamage', value: 0.1909 },
    ];
    const slots: TimelineSlot[] = [
      {
        character: makeCharacter(),
        definition: null,
        levels: MAX_SKILL_LEVELS,
        casterBaseAttack: 1000,
        buildEffects: effects,
      },
      { character: allyAttack, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 },
    ];
    const [mine, ally] = resolvePassiveStates(slots);
    expect(mine!.buffs.attackRatio).toBeCloseTo(0.1 + 0.1463, 12);
    expect(mine!.buffs.elementDamage).toBeCloseTo(0.1909, 12);
    expect(mine!.buildEffects).toBe(effects);
    expect(ally!.buffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(ally!.buffs.elementDamage).toBe(0);
    expect(ally!.buildEffects).toEqual([]);
  });
});

describe('新 stat の式（3.3）', () => {
  const character = makeCharacter(); // 炎 AR、コア倍率 2、会心 15% / 150%
  const advantaged: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
  const neutral: EnemyInput = { defence: 100, element: 'Water', hasCore: true };
  const trigger = (buffs: BuffTotals, enemy: EnemyInput = advantaged, c: CharacterData = character) =>
    computeTriggerDamage({
      character: c,
      growth: { level: 1, grade: 0, core: 0 },
      attackOverride: 10000,
      enemy,
      buffs,
      condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true },
    });

  it('elementDamage: 1.1 + Σ when advantaged, 1 otherwise', () => {
    expect(elementMultiplier('Fire', 'Wind', 0.2356)).toBeCloseTo(1.3356, 12);
    expect(elementMultiplier('Fire', 'Water', 0.2356)).toBe(1);
    expect(elementMultiplier('Fire', null, 0.2356)).toBe(1);
    const buffs = { ...ZERO_BUFFS, elementDamage: 0.2356 };
    expect(trigger(buffs).elementMultiplier).toBeCloseTo(1.3356, 12);
    expect(trigger(buffs, neutral).elementMultiplier).toBe(1);
    expect(trigger(buffs).normal / trigger(ZERO_BUFFS).normal).toBeCloseTo(1.3356 / 1.1, 12);
  });

  it('coreDamage: the core term becomes coreHitRate × (coreDamageRate − 1 + Σ), on the changed weapon if any', () => {
    const buffs = { ...ZERO_BUFFS, coreDamage: 0.1704 };
    expect(trigger(buffs).boost.core).toBeCloseTo(0.5 * (2 - 1 + 0.1704), 12);
    expect(trigger(buffs, { ...advantaged, hasCore: false }).boost.core).toBe(0);
    // 殲滅モード（使用武器の変更）では変更後の武器のコア倍率が基点
    const changed = { ...character.shot, coreDamageRate: 1.5 };
    const withWeapon = { ...buffs, weapon: { id: 'x', hits: 1, shot: changed } };
    expect(trigger(withWeapon).boost.core).toBeCloseTo(0.5 * (1.5 - 1 + 0.1704), 12);
  });

  it('normalAttackDamage multiplies the normal attack only (not the per-shot extra damage)', () => {
    const buffs = { ...ZERO_BUFFS, normalAttackDamage: 0.0946 };
    const perShot = [{ multiplier: 0.3, damageType: 'additional' as const }] as never;
    const base = computeTriggerDamage({
      character,
      growth: { level: 1, grade: 0, core: 0 },
      attackOverride: 10000,
      enemy: advantaged,
      buffs: ZERO_BUFFS,
      perShot,
      condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true },
    });
    const boosted = computeTriggerDamage({
      character,
      growth: { level: 1, grade: 0, core: 0 },
      attackOverride: 10000,
      enemy: advantaged,
      buffs,
      perShot,
      condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true },
    });
    expect(boosted.normalAttackMultiplier).toBeCloseTo(1.0946, 12);
    expect(boosted.normal / base.normal).toBeCloseTo(1.0946, 12);
    expect(boosted.perShot).toBeCloseTo(base.perShot, 9);
  });

  it('skill damage takes elementDamage (assumption, measurement 7) but not coreDamage', () => {
    const buffs = { ...ZERO_BUFFS, elementDamage: 0.2, coreDamage: 0.3 };
    const effects = [{ multiplier: 1, damageType: 'skill' as const }] as never;
    const t = trigger(buffs);
    const hit = computeSkillHit(effects, character, advantaged, t, buffs, false);
    expect(ELEMENT_DAMAGE_APPLIES_TO_SKILL_DAMAGE).toBe(true);
    expect(hit.elementMultiplier).toBeCloseTo(1.3, 12);
    expect(hit.boost.total).toBeCloseTo(1 + 0.15 * 0.5, 12);
  });
});

describe('computeTeamDamage with build effects', () => {
  const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
  const slot = (buildEffects?: BuildEffect[]): TeamSlotInput => ({
    character: makeCharacter(),
    growth: { level: 1, grade: 0, core: 0 },
    attackOverride: 10000,
    condition: { coreHitRate: 0.5, distanceBonus: false, fullCharge: true },
    ...(buildEffects ? { buildEffects } : {}),
  });

  it('an empty list is the same as none (degenerate)', () => {
    const input = (s: TeamSlotInput) => ({ slots: [s], enemy, durationSeconds: 180, burst: true });
    const none = computeTeamDamage(input(slot()));
    const empty = computeTeamDamage(input(slot([])));
    expect(empty.totalDamage).toBe(none.totalDamage);
    expect(none.slots[0]!.buildEffects).toEqual([]);
  });

  it('an OL ATK line scales the normal attack like a +14.63% attack buff and shows up in the result', () => {
    const effects: BuildEffect[] = [
      { source: { kind: 'overload', name: { ja: '', en: '' }, level: 15 }, stat: 'attack', value: 0.1463 },
    ];
    const input = (s: TeamSlotInput) => ({ slots: [s], enemy, durationSeconds: 180 });
    const base = computeTeamDamage(input(slot()));
    const ol = computeTeamDamage(input(slot(effects)));
    expect(ol.slots[0]!.buildEffects).toEqual(effects);
    expect(ol.slots[0]!.passiveBuffs.attackRatio).toBeCloseTo(0.1463, 12);
    expect(ol.totalDamage / base.totalDamage).toBeCloseTo((10000 * 1.1463 - 100) / (10000 - 100), 9);
  });
});
