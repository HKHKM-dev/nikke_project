import { describe, expect, it } from 'vitest';
import { computeDamage, type EnemyInput } from '../damage.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition, SkillEntry } from '../skills/types.ts';
import { TEAM_SIZE, computeTeamDamage, type SlotCondition, type TeamSlotInput } from '../team.ts';
import type { SkillRaw } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { makeCharacter } from './fixtures.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };

function slot(resourceId: number, shot = {}, extra: Partial<TeamSlotInput> = {}): TeamSlotInput {
  return { character: makeCharacter(shot, { resourceId }), growth, condition, ...extra };
}

const ar = slot(1);
const smg = slot(2, { maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440, damage: 500 });
const sr = slot(3, { maxAmmo: 6, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP', damage: 6000 });

describe('computeTeamDamage', () => {
  it('sums the per-slot results in slot order and skips empty slots', () => {
    const team = computeTeamDamage({ slots: [ar, smg, null, sr], enemy, durationSeconds: 180 });
    const individual = [ar, smg, sr].map((s) =>
      computeDamage({ character: s.character, growth, enemy, condition: { ...condition, durationSeconds: 180 } }),
    );
    expect(team.filledCount).toBe(3);
    expect(team.slots).toHaveLength(4);
    expect(team.slots[2]).toBeNull();
    expect(team.slots[3]?.index).toBe(3);
    expect(team.totalDps).toBeCloseTo(
      individual.reduce((a, r) => a + r.dps, 0),
      8,
    );
    expect(team.totalDamage).toBeCloseTo(
      individual.reduce((a, r) => a + r.totalDamage, 0),
      6,
    );
    // 持続バフもフルバーストもないので区間は 1 つ。1 トリガーの値と合計が単体計算と一致する
    for (const [slotIndex, r] of [
      [0, individual[0]!],
      [1, individual[1]!],
      [3, individual[2]!],
    ] as const) {
      const c = team.slots[slotIndex]!;
      expect(c.segments).toHaveLength(1);
      expect(c.segments[0]!.trigger.perTrigger).toBe(r.perTrigger);
      expect(c.cadence).toEqual(r.cadence);
      expect(c.normalDamage).toBe(r.totalDamage);
      expect(c.dps).toBeCloseTo(r.dps, 9);
    }
  });

  it('returns zero totals for an all-empty team', () => {
    const team = computeTeamDamage({ slots: [null, null, null], enemy, durationSeconds: 180 });
    expect(team.slots).toEqual([null, null, null]);
    expect(team.filledCount).toBe(0);
    expect(team.totalDps).toBe(0);
    expect(team.totalDamage).toBe(0);
    expect(team.schedule).toBeNull();
    expect(team.timeline.segments).toHaveLength(1);
  });

  it('shares are each slot’s fraction of the total and add up to 1', () => {
    const team = computeTeamDamage({ slots: [ar, smg, sr], enemy, durationSeconds: 180 });
    const shares = team.slots.map((s) => s?.share ?? 0);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    for (const s of team.slots) {
      expect(s?.share).toBeCloseTo((s?.totalDamage ?? 0) / team.totalDamage, 12);
    }
  });

  it('a single-slot team equals computeDamage for that character', () => {
    const team = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 90 });
    const single = computeDamage({
      character: sr.character,
      growth,
      enemy,
      condition: { ...condition, durationSeconds: 90 },
    });
    expect(team.slots[0]?.segments[0]?.trigger.perTrigger).toBe(single.perTrigger);
    expect(team.slots[0]?.normalDamage).toBe(single.totalDamage);
    expect(team.slots[0]?.share).toBe(1);
    expect(team.totalDps).toBe(single.dps);
    expect(team.totalDamage).toBe(single.totalDamage);
  });

  it('applies attackOverride and duration per slot independently', () => {
    const team = computeTeamDamage({
      slots: [slot(1, {}, { attackOverride: 5000 }), slot(2)],
      enemy,
      durationSeconds: 90,
    });
    expect(team.slots[0]?.segments[0]?.trigger.attack).toBe(5000);
    expect(team.slots[1]?.segments[0]?.trigger.attack).toBe(1000);
    expect(team.slots[0]?.totalDamage).toBe(team.slots[0]?.normalDamage);
    expect(team.slots[0]?.dps).toBeCloseTo((team.slots[0]?.normalDamage ?? 0) / 90, 9);
  });

  it('passes the weapon model through to every slot', () => {
    const model = { ...DEFAULT_WEAPON_MODEL, chargeReleaseFrames: 0 };
    const withModel = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 180, model });
    const withoutModel = computeTeamDamage({ slots: [sr], enemy, durationSeconds: 180 });
    expect(withModel.slots[0]?.cadence.cycleFrames).toBeLessThan(withoutModel.slots[0]?.cadence.cycleFrames ?? 0);
  });

  it('rejects duplicate characters and out-of-range slot counts', () => {
    expect(() => computeTeamDamage({ slots: [ar, slot(1)], enemy, durationSeconds: 180 })).toThrow(RangeError);
    expect(() => computeTeamDamage({ slots: [], enemy, durationSeconds: 180 })).toThrow(RangeError);
    expect(() =>
      computeTeamDamage({ slots: Array.from({ length: TEAM_SIZE + 1 }, () => null), enemy, durationSeconds: 180 }),
    ).toThrow(RangeError);
    // 空枠は重複判定の対象外
    expect(() => computeTeamDamage({ slots: [null, null, ar, null, null], enemy, durationSeconds: 180 })).not.toThrow();
  });
});

// ---- Stage 4: 常時発動パッシブ ----

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
function rawSkill(id: number, values: (string[] | null)[]): SkillRaw {
  return { id, name: { ja: `S${id}`, en: `S${id}` }, description: { ja: '', en: '' }, values };
}
const unsupported: SkillEntry = { support: 'unsupported', effects: [] };
function definition(resourceId: number, skill1: SkillEntry, skill2: SkillEntry = unsupported): SkillDefinition {
  return { formatVersion: 1, resourceId, checkedAt: '2026-09-22', skills: { skill1, skill2, burst: unsupported } };
}

// 枠 A: 自分に攻撃力 +20%、味方全体に会心ダメ +10%（values は Lv によらず一定）
const buffer = slot(
  11,
  {},
  {
    character: makeCharacter(
      {},
      {
        resourceId: 11,
        skills: {
          skill1: rawSkill(1, [tenLevels('20'), tenLevels('10')]),
          skill2: rawSkill(2, []),
          burst: rawSkill(3, []),
        },
      },
    ),
    skills: {
      definition: definition(11, {
        support: 'supported',
        effects: [
          { kind: 'passive', target: 'self', stat: 'attack', ref: 1 },
          { kind: 'passive', target: 'allies', stat: 'critDamage', ref: 2 },
        ],
      }),
      levels: MAX_SKILL_LEVELS,
    },
  },
);
// 枠 B: 味方全体に発動者基準で攻撃力 +10%
const caster = slot(
  12,
  {},
  {
    character: makeCharacter(
      {},
      {
        resourceId: 12,
        skills: { skill1: rawSkill(4, [tenLevels('10')]), skill2: rawSkill(5, []), burst: rawSkill(6, []) },
      },
    ),
    skills: {
      definition: definition(12, {
        support: 'supported',
        effects: [{ kind: 'passive', target: 'allies', stat: 'attack', scaling: 'casterAttack', ref: 1 }],
      }),
      levels: MAX_SKILL_LEVELS,
    },
  },
);
// 枠 C: 定義なし（skills 省略）
const plain = slot(13);

describe('computeTeamDamage with passives', () => {
  it('leaves a team without definitions identical to Stage 3 and reports no skill support', () => {
    const team = computeTeamDamage({ slots: [ar, smg], enemy, durationSeconds: 180 });
    for (const s of team.slots) {
      expect(s?.passiveBuffs).toEqual(ZERO_BUFFS);
      expect(s?.passiveEffects).toEqual([]);
      expect(s?.skillSupport).toBeNull();
      expect(s?.segments[0]?.trigger.attack).toBe(s?.baseAttack);
    }
    const withNull = computeTeamDamage({
      slots: [{ ...ar, skills: { definition: null, levels: MAX_SKILL_LEVELS } }],
      enemy,
      durationSeconds: 180,
    });
    expect(withNull.slots[0]?.normalDamage).toBe(team.slots[0]?.normalDamage);
    expect(withNull.slots[0]?.skillSupport).toBeNull();
  });

  it('applies self effects only to the source and allies effects to every slot, including ones without skills', () => {
    const team = computeTeamDamage({ slots: [buffer, plain, null, caster], enemy, durationSeconds: 180 });
    const [a, c, , b] = team.slots;
    // 枠 A: 自分の +20% と B からの固定加算 1000 × 0.1、自分の会心ダメ +10%
    expect(a?.passiveBuffs).toEqual({ ...ZERO_BUFFS, attackRatio: 0.2, attackFlat: 100, critDamage: 0.1 });
    expect(a?.segments[0]?.trigger.attack).toBeCloseTo(1000 * 1.2 + 100, 10);
    // 枠 C（定義なし）: A の会心ダメと B の固定加算だけ
    expect(c?.passiveBuffs).toEqual({ ...ZERO_BUFFS, attackFlat: 100, critDamage: 0.1 });
    expect(c?.segments[0]?.trigger.attack).toBeCloseTo(1100, 10);
    expect(c?.skillSupport).toBeNull();
    // 枠 B: 自分の allies 効果も自分に掛かる
    expect(b?.passiveBuffs).toEqual({ ...ZERO_BUFFS, attackFlat: 100, critDamage: 0.1 });
    expect(b?.skillSupport).toEqual({ skill1: 'supported', skill2: 'unsupported', burst: 'unsupported' });
    expect(a?.passiveEffects.map((e) => [e.sourceSlotIndex, e.stat, e.scaling, e.appliedAmount])).toEqual([
      [0, 'attack', 'ratio', 0.2],
      [0, 'critDamage', 'ratio', 0.1],
      [3, 'attack', 'casterAttack', 100],
    ]);
    expect(c?.passiveEffects.map((e) => e.sourceSlotIndex)).toEqual([0, 3]);
  });

  it('bases casterAttack on the caster’s pre-buff attack, even when the caster is buffed', () => {
    // A の +20% は A 自身にしか掛からず、B の固定加算は B のバフ前攻撃力（1000）を基準にする
    const team = computeTeamDamage({ slots: [buffer, caster], enemy, durationSeconds: 180 });
    expect(team.slots[0]?.passiveBuffs.attackFlat).toBe(100);
    expect(team.slots[1]?.passiveBuffs.attackFlat).toBe(100);
    // スペック固定など attackOverride があればそれが基準
    const fixed = computeTeamDamage({
      slots: [plain, { ...caster, attackOverride: 5000 }],
      enemy,
      durationSeconds: 180,
    });
    expect(fixed.slots[0]?.passiveBuffs.attackFlat).toBe(500);
    expect(fixed.slots[0]?.segments[0]?.trigger.attack).toBe(1500);
  });

  it('removing a slot removes only the effects it was giving', () => {
    const full = computeTeamDamage({ slots: [buffer, plain, caster], enemy, durationSeconds: 180 });
    const withoutCaster = computeTeamDamage({ slots: [buffer, plain, null], enemy, durationSeconds: 180 });
    expect(withoutCaster.slots[1]?.passiveBuffs).toEqual({ ...ZERO_BUFFS, critDamage: 0.1 });
    expect(withoutCaster.slots[0]?.passiveBuffs).toEqual({ ...ZERO_BUFFS, attackRatio: 0.2, critDamage: 0.1 });
    expect(full.slots[1]?.dps).toBeGreaterThan(withoutCaster.slots[1]?.dps ?? 0);
  });

  it('follows skill levels per slot', () => {
    const leveled: TeamSlotInput = {
      ...buffer,
      character: makeCharacter(
        {},
        {
          resourceId: 11,
          skills: {
            skill1: rawSkill(1, [Array.from({ length: 10 }, (_, i) => String(10 + i)), tenLevels('10')]),
            skill2: rawSkill(2, []),
            burst: rawSkill(3, []),
          },
        },
      ),
      skills: { ...buffer.skills!, levels: { skill1: 1, skill2: 10, burst: 10 } },
    };
    const lv1 = computeTeamDamage({ slots: [leveled], enemy, durationSeconds: 180 });
    const lv10 = computeTeamDamage({
      slots: [{ ...leveled, skills: { ...leveled.skills!, levels: MAX_SKILL_LEVELS } }],
      enemy,
      durationSeconds: 180,
    });
    expect(lv1.slots[0]?.passiveBuffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(lv10.slots[0]?.passiveBuffs.attackRatio).toBeCloseTo(0.19, 12);
  });
});
