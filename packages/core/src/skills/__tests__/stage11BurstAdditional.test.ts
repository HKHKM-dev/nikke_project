// 2 段目の段 11 の PR 5（plan/design-skill-stage11.md 2.5 節）: 値 × カウンタの値（damage の perCount: { counter }）と、damage の条件
// selfCounter。使い手はラプラス：アルティメットヒーロー（103）のバーストの追加ダメージ（録画 0723・0724。V-0532）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { effectFrameOf, hitFrameOf, isInFullBurst } from '../../burst/schedule.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LUDMILLA = 190;
const BELORTA = 60;
const LAPLACE = 103;
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

describe('語彙の検証', () => {
  const def = readJson<{ skills: { burst: { effects: Record<string, unknown>[] } } }>(
    `../../../data/skills/${LAPLACE}.json`,
  );
  const withEffect = (patch: Record<string, unknown>) => {
    const copy = structuredClone(def);
    copy.skills.burst.effects[2] = { ...copy.skills.burst.effects[2], ...patch };
    return () => parseSkillDefinition(copy);
  };

  it('accepts perCount { counter } and the condition selfCounter on damage', () => {
    expect(withEffect({})).not.toThrow();
  });

  it('rejects perCount with both or neither of state and counter, and an unknown counter', () => {
    expect(withEffect({ perCount: { state: 'beauty', counter: 'overEnergyStage' } })).toThrow(
      /exactly one of state and counter/,
    );
    expect(withEffect({ perCount: {} })).toThrow(/exactly one of state and counter/);
    expect(withEffect({ perCount: { counter: 'unknown' } })).toThrow(/perCount\.counter/);
  });
});

describe('ラプラス：アルティメットヒーローのバーストの追加ダメージ（V-0532）', () => {
  const m = 2;
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const input: TeamInput = {
    slots: [slotOf(LUDMILLA), slotOf(BELORTA), slotOf(LAPLACE)],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: m,
  };
  const r = runSimulation(input);
  const bursts = r.schedule!.activations.filter((a) => a.slotIndex === m);
  const additional = r.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'burst');
  const stages = r.history.counters.filter((x) => x.slotIndex === m && x.counter === 'overEnergyStage');
  // 条件 selfCounter と同じく、発火のフレームの前のフレームの終わりの値
  const stageAt = (frame: number) => stages.filter((x) => x.frame < frame).at(-1)?.value ?? 0;
  const per = skillValue(character(LAPLACE).skills.burst, 4, MAX_SKILL_LEVELS.burst) / 100;

  it('fires only at the bursts with stage 1 or more, times the stage at Burst use', () => {
    const withStage = bursts.filter((b) => stageAt(effectFrameOf(b)) >= 1);
    expect(stageAt(effectFrameOf(bursts[0]!))).toBe(0);
    expect(withStage.length).toBeGreaterThanOrEqual(2);
    expect(additional).toHaveLength(withStage.length);
    additional.forEach((h, k) => {
      const stage = stageAt(effectFrameOf(withStage[k]!));
      expect(h.stacks).toBe(stage);
      expect(h.hit.multiplier).toBeCloseTo(per * stage, 9);
    });
  });

  it('lands 12 frames after activation, after the Full Burst entry, with the Full Burst bonus', () => {
    const withStage = bursts.filter((b) => stageAt(effectFrameOf(b)) >= 1);
    additional.forEach((h, k) => {
      const b = withStage[k]!;
      expect(h.frame).toBe(effectFrameOf(b) + 12);
      expect(h.frame).toBeGreaterThan(hitFrameOf(b));
      expect(isInFullBurst(r.schedule!, h.frame)).toBe(true);
      expect(h.hit.boost.fullBurst).toBe(0.5);
    });
  });
});
