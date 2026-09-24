// Stage 6: calc の区間モデル（持続バフ）。plan/design-stage6.md 6.2〜6.3 節。
//   6.2 退化テスト: timed 効果がなければ Stage 5 の 2 区間モデルと厳密一致する
//   6.3 ロードマップの完了条件: 持続時間がサイクル長以上なら常時バフと一致する
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition, SkillEntry } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { type SlotCondition, type TeamSlotInput } from '../team.ts';
import type { SkillRaw } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const unsupported: SkillEntry = { support: 'unsupported', effects: [] };
const supported = (effects: SkillEntry['effects']): SkillEntry => ({ support: 'supported', effects });

/** values: [1] = 比率 %、[2] = 維持秒数、[3] = バーストスキル倍率 % */
function raw(id: number, ratio = '50', seconds = '10', burstPercent = '100'): SkillRaw {
  return {
    id,
    name: { ja: `S${id}`, en: `S${id}` },
    description: { ja: '', en: '' },
    values: [tenLevels(ratio), tenLevels(seconds), tenLevels(burstPercent)],
  };
}

function skillSlot(
  resourceId: number,
  entries: Partial<Record<'skill1' | 'burst', SkillEntry>>,
  skill: SkillRaw = raw(resourceId),
  levels = MAX_SKILL_LEVELS,
): TeamSlotInput {
  const character = makeCharacter({}, { resourceId, skills: { skill1: skill, skill2: skill, burst: skill } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-22',
    skills: { skill1: entries.skill1 ?? unsupported, skill2: unsupported, burst: entries.burst ?? unsupported },
  };
  return { character, growth, condition, skills: { definition, levels } };
}

/** 定義なしの枠 */
const plain = (resourceId: number): TeamSlotInput => ({
  character: makeCharacter({}, { resourceId }),
  growth,
  condition,
});
const sr = (resourceId: number): TeamSlotInput => ({
  character: makeCharacter(
    { maxAmmo: 6, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP', damage: 6000 },
    { resourceId },
  ),
  growth,
  condition,
});

describe('6.3 A: a battleStart buff lasting the whole battle equals the same effect as a passive', () => {
  const asTimed = skillSlot(21, {
    skill1: supported([
      { kind: 'timed', trigger: 'battleStart', target: 'self', stat: 'attack', ref: 1, durationSeconds: 180 },
    ]),
  });
  const asPassive = skillSlot(21, {
    skill1: supported([{ kind: 'passive', target: 'self', stat: 'attack', ref: 1 }]),
  });

  for (const burst of [false, true]) {
    it(`matches exactly with burst=${burst}`, () => {
      const t = computeTeamDamage({ slots: [asTimed], enemy, durationSeconds: 180, burst });
      const p = computeTeamDamage({ slots: [asPassive], enemy, durationSeconds: 180, burst });
      expect(t.totalDamage).toBe(p.totalDamage);
      expect(t.slots[0]?.segments.map((s) => s.buffs)).toEqual(p.slots[0]?.segments.map((s) => s.buffs));
      expect(t.slots[0]?.segments.map((s) => s.trigger.perTrigger)).toEqual(
        p.slots[0]?.segments.map((s) => s.trigger.perTrigger),
      );
    });
  }
});

describe('6.3 B: a burstUse buff lasting at least one cycle is on from the first activation to the end', () => {
  const slot20s = skillSlot(23, {
    burst: supported([
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationSeconds: 20 },
    ]),
  });

  it('splits 180 s into three buff states and matches the hand calculation', () => {
    const s = computeTeamDamage({ slots: [slot20s], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' })
      .slots[0]!;
    expect(s.segments.map((g) => [g.fullBurst, g.buffs.attackRatio !== 0, g.seconds])).toEqual([
      [false, false, 10],
      [true, true, 90],
      [false, true, 80],
    ]);
    expect(s.windows).toHaveLength(1);
    expect(s.windows[0]).toMatchObject({ start: 600, end: 10800 });
    const rate = s.cadence.triggersPerSecond;
    const expected = s.segments.reduce((a, g) => a + rate * g.seconds * g.trigger.perTrigger, 0);
    expect(s.normalDamage).toBeCloseTo(expected, 6);
    expect(s.segments.reduce((a, g) => a + g.damage, 0)).toBeCloseTo(s.normalDamage, 6);
  });

  it('is on for the whole battle except the first 10 s', () => {
    const s = computeTeamDamage({ slots: [slot20s], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' })
      .slots[0]!;
    const buffedSeconds = s.segments.filter((g) => g.buffs.attackRatio !== 0).reduce((a, g) => a + g.seconds, 0);
    expect(buffedSeconds).toBe(170);
  });
});

describe('6.3 C: a zero-duration buff is the same as no effect at all', () => {
  it('produces no window and the same total', () => {
    const zero = skillSlot(22, {
      skill1: supported([
        { kind: 'timed', trigger: 'battleStart', target: 'self', stat: 'attack', ref: 1, durationSeconds: 0 },
      ]),
    });
    const none = skillSlot(22, {});
    const a = computeTeamDamage({ slots: [zero], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' });
    const b = computeTeamDamage({ slots: [none], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' });
    expect(a.totalDamage).toBe(b.totalDamage);
    expect(a.slots[0]?.windows).toEqual([]);
  });
});

describe('6.2 degeneration: without timed effects the model is Stage 5’s two intervals', () => {
  it('gives exactly two groups of 90 s each and the plain rate × seconds product', () => {
    const t = computeTeamDamage({
      slots: [plain(1), sr(3)],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    for (const s of t.slots) {
      if (s === null) continue;
      expect(s.segments).toHaveLength(2);
      expect(s.segments.map((g) => [g.fullBurst, g.seconds])).toEqual([
        [false, 90],
        [true, 90],
      ]);
      const rate = s.cadence.triggersPerSecond;
      expect(s.segments[0]!.damage).toBe(rate * s.segments[0]!.trigger.perTrigger * 90);
      expect(s.segments[1]!.damage).toBe(rate * s.segments[1]!.trigger.perTrigger * 90);
      expect(s.segments[1]!.trigger.boost.fullBurst).toBe(0.5);
      expect(s.normalDamage + s.burst.totalDamage).toBeCloseTo(s.totalDamage, 6);
    }
    expect(t.slots.reduce((a, s) => a + (s?.share ?? 0), 0)).toBeCloseTo(1, 12);
  });

  it('gives a single group without a burst schedule', () => {
    const t = computeTeamDamage({ slots: [plain(1)], enemy, durationSeconds: 180 });
    expect(t.slots[0]?.segments).toHaveLength(1);
    expect(t.slots[0]?.segments[0]).toMatchObject({ fullBurst: false, seconds: 180 });
    expect(t.schedule).toBeNull();
  });
});

describe('timed buff targets and levels', () => {
  it('gives an allies buff to every slot, including ones without definitions', () => {
    const caster = skillSlot(24, {
      burst: supported([
        { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'attack', ref: 1, durationRef: 2 },
      ]),
    });
    const t = computeTeamDamage({
      slots: [caster, plain(2)],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    expect(t.slots[0]?.windows).toHaveLength(9);
    expect(t.slots[1]?.windows).toHaveLength(9);
    const buffed = t.slots[1]?.segments.find((g) => g.buffs.attackRatio !== 0);
    expect(buffed?.fullBurst).toBe(true);
    expect(buffed?.buffs.attackRatio).toBeCloseTo(0.5, 12);
  });

  it('gives a self buff only to the caster', () => {
    const caster = skillSlot(28, {
      burst: supported([
        { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationRef: 2 },
      ]),
    });
    const t = computeTeamDamage({
      slots: [caster, plain(2)],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    expect(t.slots[0]?.windows).toHaveLength(9);
    expect(t.slots[1]?.windows).toEqual([]);
    expect(t.slots[1]?.segments.every((g) => g.buffs.attackRatio === 0)).toBe(true);
  });

  it('follows the skill level for both the ratio and the duration', () => {
    const scaling = {
      id: 27,
      name: { ja: 'S', en: 'S' },
      description: { ja: '', en: '' },
      values: [
        Array.from({ length: 10 }, (_, i) => String(10 + i * 5)),
        Array.from({ length: 10 }, (_, i) => String(5 + i)),
        tenLevels('100'),
      ],
    } satisfies SkillRaw;
    const make = (level: number): TeamSlotInput =>
      skillSlot(
        27,
        {
          burst: supported([
            { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationRef: 2 },
          ]),
        },
        scaling,
        { skill1: 10, skill2: 10, burst: level },
      );
    const lv1 = computeTeamDamage({ slots: [make(1)], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' })
      .slots[0]!;
    const lv10 = computeTeamDamage({ slots: [make(10)], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' })
      .slots[0]!;
    // Lv1: +10% / 5 秒（300f）、Lv10: +55% / 14 秒（840f）
    expect(lv1.windows[0]).toMatchObject({ start: 600, end: 900 });
    expect(lv10.windows[0]).toMatchObject({ start: 600, end: 1440 });
    expect(Math.max(...lv1.segments.map((g) => g.buffs.attackRatio))).toBeCloseTo(0.1, 12);
    expect(Math.max(...lv10.segments.map((g) => g.buffs.attackRatio))).toBeCloseTo(0.55, 12);
    expect(lv10.totalDamage).toBeGreaterThan(lv1.totalDamage);
  });
});

describe('burst hit buff snapshot', () => {
  const lapi = (seconds: number, resourceId: number): TeamSlotInput =>
    skillSlot(resourceId, {
      burst: supported([
        { kind: 'burstDamage', ref: 3, damageType: 'skill' },
        { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationSeconds: seconds },
      ]),
    });

  it('uses the buffs from just before the activation, so its own buff does not apply', () => {
    const s = computeTeamDamage({
      slots: [lapi(10, 25)],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    }).slots[0]!;
    expect(s.burst.activations).toHaveLength(9);
    // 10 秒バフはフルバースト区間の終わりで切れるので、どの発動も「素の攻撃力 − 防御力」基準になる
    const bare = s.baseAttack - enemy.defence;
    for (const a of s.burst.activations) expect(a.hit.baseHit).toBeCloseTo(bare, 9);
    expect(s.burst.totalDamage).toBeCloseTo(9 * s.burst.activations[0]!.hit.perActivation, 6);
  });

  it('differs per activation when a buff outlives the cycle', () => {
    const s = computeTeamDamage({
      slots: [lapi(20, 26)],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    }).slots[0]!;
    const hits = s.burst.activations.map((a) => a.hit.perActivation);
    // 1 回目は素の攻撃力（1000 − 100）、2 回目以降は前サイクルの 20 秒バフが生きている（1000 × 1.5 − 100）
    expect(s.burst.activations.map((a) => a.hit.baseHit)).toEqual([
      900, 1400, 1400, 1400, 1400, 1400, 1400, 1400, 1400,
    ]);
    expect(hits[0]).toBeLessThan(hits[1]!);
    expect(hits[1]! / hits[0]!).toBeCloseTo(1400 / 900, 9);
    expect(new Set(hits.slice(1)).size).toBe(1);
    expect(s.burst.totalDamage).toBeCloseTo(
      hits.reduce((a, b) => a + b, 0),
      6,
    );
  });

  it('keeps the representative hit even for a slot that never activates', () => {
    const second = lapi(10, 30);
    const t = computeTeamDamage({
      slots: [lapi(10, 25), second],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    // 同じ段階（Step3）の 2 体目は発動しないが、1 発動の内訳は出る
    expect(t.slots[1]?.burst.activations).toEqual([]);
    expect(t.slots[1]?.burst.hit).not.toBeNull();
    expect(t.slots[1]?.burst.totalDamage).toBe(0);
  });
});
