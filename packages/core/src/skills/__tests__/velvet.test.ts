// ベルベット編（plan/design-velvet.md 2 節）: カウンタの弾丸ポーチ（補充と、足りなければ起きない消費）、timed の条件
// 「フルバースト状態でなければ」（inFullBurst: false）と攻撃力の条件 inFullBurst の語彙の検証と、単騎の S1 の動き
import { describe, expect, it } from 'vitest';
import { effectWindows, fixedTeam, rawDefinition, skillValueOf } from '../../__tests__/teamHelpers.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { counterMax } from '../counters.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const VELVET = 316;
const raw = rawDefinition<Raw>(VELVET);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const S1_ATTACK = indexOf('skill1', (e) => e.stat === 'attack');
const S2_ATTACK = indexOf('skill2', (e) => e.stat === 'attack');
const S2_CHARGE_DAMAGE = indexOf('skill2', (e) => e.stat === 'chargeDamage');

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('caps the Ammo Pouch at the stored maximum of the description (6000)', () => {
    expect(counterMax('ammoPouch')).toBe(skillValueOf(VELVET, 'skill1', 3));
  });

  it('takes inFullBurst true and false on the attack up, and not on another stat tracked in the first pass', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.skill1.effects[S1_ATTACK]).toMatchObject({ condition: { inFullBurst: false } });
    expect(def.skills.skill2.effects[S2_ATTACK]).toMatchObject({ condition: { inFullBurst: true } });
    expect(patched('skill1', S1_ATTACK, { stat: 'chargeSpeed' })).toThrow(
      /inFullBurst is not supported for "chargeSpeed"/,
    );
  });

  it('takes inFullBurst: false on a timed with a stat that is not tracked in the first pass', () => {
    const def = patched('skill2', S2_CHARGE_DAMAGE, { condition: { inFullBurst: false } })();
    expect(def.skills.skill2.effects[S2_CHARGE_DAMAGE]).toMatchObject({ condition: { inFullBurst: false } });
  });
});

describe('単騎（オートバースト OFF）', () => {
  const plan = planTeamRun(fixedTeam([VELVET], 0, { burst: false }));
  const shots = plan.shots[0]!.frames;
  const pouch = skillValueOf(VELVET, 'skill1', 2);
  const cost = skillValueOf(VELVET, 'skill1', 4);
  const charges = pouch / cost;
  const duration = gameSecondsToFrames(skillValueOf(VELVET, 'skill1', 6));

  it('fires more full charges than the pouch can pay for', () => {
    expect(shots.length).toBeGreaterThan(charges);
  });

  for (const stat of ['attack', 'attackDamage']) {
    it(`gives the S1 ${stat} up from the frame after each of the first ${charges} full charges, then stops (6000 / 100)`, () => {
      const windows = effectWindows(plan, 0, { resourceId: VELVET, skill: 'skill1', stat });
      expect(windows[0]!.start).toBe(shots[0]! + 1);
      expect(windows.at(-1)!.end).toBe(shots[charges - 1]! + 1 + duration);
      // 払えた発の次のフレームはどれも窓の中、払えなかった発の次のフレームは窓の外
      const covered = (f: number) => windows.some((w) => w.start <= f && f < w.end);
      expect(shots.slice(0, charges).every((f) => covered(f + 1))).toBe(true);
      expect(shots.slice(charges).some((f) => covered(f + 1))).toBe(false);
    });
  }
});
