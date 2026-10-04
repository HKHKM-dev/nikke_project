// I-DOLL・フラワー（304）の定義（plan/skills-guide.md）。ダメージに効くのはバーストの倍率ダメージ 1 件だけ。
// フラワー編: S2 は 15 秒ごとにゲージだけを溜める（burstGaugeHit。plan/design-flower-s2-gauge.md、C-0178）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { resolveBurstDamage, resolveTimerGauges } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { timerFrames } from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const flower = readJson<CharacterData>('../../../data/characters/304.json');
const raw = readJson<{ skills: Record<string, { support: string; effects: unknown[] }> }>(
  '../../../data/skills/304.json',
);
const def = parseSkillDefinition(raw);

/** 304.json を写して、skill2 を差し替えた定義を検証にかける */
function withSkill2(entry: unknown): unknown {
  const copy = structuredClone(raw) as { skills: Record<string, unknown> };
  copy.skills.skill2 = entry;
  return copy;
}

const GAUGE = { kind: 'burstGaugeHit', trigger: { everySeconds: 15 } };

/** フラワー単騎（操作枠・スペック固定・的のジャンプなし）。definition を差し替えて比べる */
function solo(definition: SkillDefinition): TeamInput {
  const fixed = computeFixedSpecAttack(flower);
  return {
    slots: [
      {
        character: flower,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds: 180,
    burst: true,
    controlledSlot: 0,
  };
}

describe('I-DOLL・フラワー（304）', () => {
  it('models only the S2 gauge on S1 and S2', () => {
    expect(def.skills.skill1).toMatchObject({ support: 'noEffect', effects: [] });
    expect(def.skills.skill2).toMatchObject({ support: 'supported', effects: [GAUGE] });
    expect(resolveTimerGauges(def)).toEqual([15]);
  });

  it('resolves the burst to one skill-damage hit of the final ATK', () => {
    expect(resolveBurstDamage(def, flower, MAX_SKILL_LEVELS)).toEqual([
      expect.objectContaining({ damageType: 'skill', multiplier: expect.closeTo(3.3061, 10) }),
    ]);
    expect(resolveBurstDamage(def, flower, { skill1: 1, skill2: 1, burst: 1 })).toEqual([
      expect.objectContaining({ damageType: 'skill', multiplier: expect.closeTo(1.102, 10) }),
    ]);
  });
});

describe('burstGaugeHit の検証', () => {
  const entry = (effect: unknown) => withSkill2({ effects: [effect] });

  it('needs a timer trigger and no other fields', () => {
    expect(() => parseSkillDefinition(entry(GAUGE))).not.toThrow();
    expect(() => parseSkillDefinition(entry({ ...GAUGE, trigger: 'burstUse' }))).toThrow(/needs a timer trigger/);
    expect(() => parseSkillDefinition(entry({ ...GAUGE, trigger: { count: 'normalShot', every: 10 } }))).toThrow(
      /needs a timer trigger/,
    );
    expect(() => parseSkillDefinition(entry({ ...GAUGE, ref: 1 }))).toThrow(/ref: unknown field/);
  });

  it('is ignored when the slot is unsupported', () => {
    const none = parseSkillDefinition(
      withSkill2({ effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] }),
    );
    expect(resolveTimerGauges(none)).toEqual([]);
  });
});

describe('S2 のゲージ（1 パス目）', () => {
  const withGauge = planTeamRun(solo(def));
  const without = planTeamRun(
    solo(parseSkillDefinition(withSkill2({ effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] }))),
  );
  const shotsOf = (plan: typeof withGauge) => plan.shots[0]!.frames;
  const indexOfFull = (plan: typeof withGauge) =>
    shotsOf(plan).filter((f) => f <= plan.schedule!.gaugeFullFrames[0]!).length;

  it('adds one target hit of gauge every 15 s, so the first full comes one shot earlier', () => {
    // 1 発 28,000 × フルチャージ 2.5 = 70,000。14 発では 980,000 で届かず、15 秒の S2 の 28,000 で届く
    expect(flower.shot.targetBurstEnergyPerShot * flower.shot.fullChargeBurstEnergy * 14).toBeLessThan(1_000_000);
    expect(timerFrames(15, withGauge.frames)[0]!).toBeLessThan(shotsOf(withGauge)[13]!);
    expect(indexOfFull(without)).toBe(15);
    expect(indexOfFull(withGauge)).toBe(14);
  });

  it('does not change the shots themselves', () => {
    expect(shotsOf(withGauge).slice(0, 14)).toEqual(shotsOf(without).slice(0, 14));
  });
});
