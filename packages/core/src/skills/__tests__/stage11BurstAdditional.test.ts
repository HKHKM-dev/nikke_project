// 2 段目の段 11 の PR 5（plan/design-skill-stage11.md 2.5 節）: 値 × カウンタの値（damage の perCount: { counter }）と、damage の条件
// selfCounter。使い手はラプラス：アルティメットヒーロー（103）のバーストの追加ダメージ（録画 0723・0724。V-0532）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { effectFrameOf, hitFrameOf, isInFullBurst } from '../../burst/schedule.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { fixedEnemy, fixedSlot, type FixedSlotOptions, fixedTeam } from '../../__tests__/teamHelpers.ts';

const LUDMILLA = 190;
const BELORTA = 60;
const LAPLACE = 103;
/** このテストの枠の、既定と違う所 */
const SLOT_OPTIONS: FixedSlotOptions = { hp: true };

describe('語彙の検証', () => {
  const def = rawDefinition<{ skills: { burst: { effects: Record<string, unknown>[] } } }>(LAPLACE);
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
  const enemy: EnemyInput = fixedEnemy({ element: 'Fire' });
  const input: TeamInput = fixedTeam(
    [fixedSlot(LUDMILLA, SLOT_OPTIONS), fixedSlot(BELORTA, SLOT_OPTIONS), fixedSlot(LAPLACE, SLOT_OPTIONS)],
    m,
    { enemy },
  );
  const r = runSimulation(input);
  const bursts = r.schedule!.activations.filter((a) => a.slotIndex === m);
  const additional = r.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'burst');
  const stages = r.history.counters.filter((x) => x.slotIndex === m && x.counter === 'overEnergyStage');
  // 条件 selfCounter と同じく、発火のフレームの前のフレームの終わりの値
  const stageAt = (frame: number) => stages.filter((x) => x.frame < frame).at(-1)?.value ?? 0;
  const per = skillValue(characterOf(LAPLACE).skills.burst, 4, MAX_SKILL_LEVELS.burst) / 100;

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
