// 2 段目の段 12 の PR 1（plan/design-skill-stage12.md 2.1・3.1 節）: damage の編成の条件 burstStepMix と、ラピ：レッドフード（16）の
// 戦闘補助でない側の S1（フルバーストの始まりの自分の攻撃力▲）とバースト III の追加ダメージ（録画 0116・0117。V-0535）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { effectFrameOf, isInFullBurst } from '../../burst/schedule.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { applyCompositionToTeam } from '../composition.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const RAPI_RH = 16;
const LITER = 82;
const DELTA = 20;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`));

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

describe('語彙の検証', () => {
  const def = readJson<{ skills: { burst: { effects: Record<string, unknown>[] } } }>(
    `../../../data/skills/${RAPI_RH}.json`,
  );
  const withEffect = (patch: Record<string, unknown>) => {
    const copy = structuredClone(def);
    copy.skills.burst.effects[0] = { ...copy.skills.burst.effects[0], ...patch };
    return () => parseSkillDefinition(copy);
  };

  it('accepts burstStepMix on damage', () => {
    expect(withEffect({})).not.toThrow();
  });

  it('still rejects squad on damage and a malformed burstStepMix', () => {
    expect(withEffect({ squad: { present: true } })).toThrow(/squad: only allowed in/);
    expect(withEffect({ burstStepMix: { otherBurstStep: 'Step1', present: 'yes' } })).toThrow(
      /present: expected a boolean/,
    );
  });
});

describe('戦闘補助でない側の効果は、基本バースト段階 I の味方がいる編成でだけ残る', () => {
  const effectsOf = (input: TeamInput, index: number) => {
    const skills = applyCompositionToTeam(input).slots[index]!.skills!.definition!.skills;
    return { skill1: skills.skill1.effects, burst: skills.burst.effects };
  };

  it('keeps the S1 attack up and the burst III additional damage with an ally of base burst stage I', () => {
    const input: TeamInput = { slots: [slotOf(LITER), slotOf(DELTA), slotOf(RAPI_RH)], enemy, durationSeconds: 180 };
    const { skill1, burst } = effectsOf(input, 2);
    expect(skill1.map((e) => e.kind)).toEqual(['timed']);
    expect(burst.map((e) => e.kind)).toEqual(['damage']);
  });

  it('drops both without an ally of base burst stage I (Combat Assist)', () => {
    const input: TeamInput = { slots: [slotOf(DELTA), slotOf(RAPI_RH)], enemy, durationSeconds: 180 };
    const { skill1, burst } = effectsOf(input, 1);
    expect(skill1).toEqual([]);
    expect(burst).toEqual([]);
  });
});

describe('ラピ：レッドフードの S1 の攻撃力▲とバースト III の追加ダメージ（V-0535）', () => {
  const m = 2;
  const input: TeamInput = {
    slots: [slotOf(LITER), slotOf(DELTA), slotOf(RAPI_RH)],
    enemy,
    durationSeconds: 180,
    burst: true,
  };
  const r = runSimulation(input);
  const schedule = r.schedule!;
  const bursts = schedule.activations.filter((a) => a.slotIndex === m);
  const additional = r.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'burst');
  const s1 = character(RAPI_RH).skills.skill1;

  it('lands 11 frames after each burst III, inside Full Burst, at 2808% with the Full Burst bonus', () => {
    expect(bursts.length).toBeGreaterThanOrEqual(2);
    expect(additional).toHaveLength(bursts.length);
    additional.forEach((h, k) => {
      expect(h.frame).toBe(effectFrameOf(bursts[k]!) + 11);
      expect(isInFullBurst(schedule, h.frame)).toBe(true);
      expect(h.hit.multiplier).toBeCloseTo(
        skillValue(character(RAPI_RH).skills.burst, 5, MAX_SKILL_LEVELS.burst) / 100,
        9,
      );
      expect(h.hit.boost.fullBurst).toBe(0.5);
    });
  });

  it('raises her attack by the S1 value from the start to the end of the Full Burst window', () => {
    const window = schedule.fullBurstWindows[0]!;
    const at = (frame: number) => r.slots[m]!.segments.find((s) => s.start <= frame && frame < s.end)!.trigger.buffs;
    const up = skillValue(s1, 3, MAX_SKILL_LEVELS.skill1) / 100;
    // フルバーストの窓の終わりの直前は、リターのバーストの攻撃力▲（5 秒）が切れて S1 の▲だけが残る（リターの S1 は使用 1 回目の段）
    expect(at(window.end - 1).attackRatio).toBeCloseTo(up, 9);
    expect(at(window.end).attackRatio).toBe(0);
    expect(at(window.start - 1).attackRatio).toBeLessThan(at(window.start).attackRatio - up + 1e-9);
  });
});
