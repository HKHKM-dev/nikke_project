// 2 段目の段 10 の PR 1（plan/design-skill-stage10.md 2.1・2.2・3.1 節）: シンデレラ（511）のバースト。「10 回順番に攻撃」は
// バーストの倍率を回数倍にして遅れの表の 10 ヒットで等分し（hitsRef）、追加ダメージは 10 ヒットのそれぞれに、バーストを使った時の
// 美しさのスタック数を掛けて出す（perCount）。録画 0480・0481（V-0502）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { effectFrameOf, hitFramesOf, isInFullBurst } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { resolveBurstDamage } from '../skills/burstDamage.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const CINDERELLA = 511;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definition = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) slot.skills = { definition: definition(id), levels: MAX_SKILL_LEVELS };
  return slot;
}

describe('シンデレラ（511）のバースト', () => {
  it('multiplies the burst value by the hit count, and the delay table has as many split hits', () => {
    const c = character(CINDERELLA);
    const [burst] = resolveBurstDamage(definition(CINDERELLA), c, MAX_SKILL_LEVELS);
    const hits = skillValue(c.skills.burst, 2, MAX_SKILL_LEVELS.burst);
    expect(hits).toBe(10);
    expect(burst!.multiplier).toBeCloseTo((skillValue(c.skills.burst, 1, MAX_SKILL_LEVELS.burst) / 100) * hits, 9);
    expect(burstDelaysOf(c).hitOffsets).toHaveLength(hits);
  });

  it('gives the additional damage on each of the 10 hits, times the Beauty stacks at Burst use (ラム + デルタ + シンデレラ)', () => {
    const m = 2;
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
    const input: TeamInput = {
      slots: [slotOf(822), slotOf(20), slotOf(CINDERELLA)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: m,
    };
    const plan = planTeamRun(applyCompositionToTeam(input));
    const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === m);
    expect(bursts.length).toBeGreaterThanOrEqual(2);
    const additional = plan.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'burst');
    expect(additional.map((h) => h.frame)).toEqual(bursts.flatMap(hitFramesOf));
    // 美しさのスタック数は、発火のフレームより前に付いた件の段の最大（条件 selfState と同じ見え方）
    const beauty = itemsOf(plan.history, { holder: m, state: 'beauty' });
    const stacksAt = (frame: number) =>
      Math.max(0, ...beauty.filter((i) => i.start < frame && frame < i.end).map((i) => i.stack ?? 1));
    const per = skillValue(character(CINDERELLA).skills.burst, 3, MAX_SKILL_LEVELS.burst) / 100;
    bursts.forEach((b, k) => {
      const stacks = stacksAt(effectFrameOf(b));
      expect(stacks).toBeGreaterThan(0);
      for (const h of additional.slice(k * 10, k * 10 + 10)) {
        expect(h.stacks).toBe(stacks);
        expect(h.hit.multiplier).toBeCloseTo(per * stacks, 9);
        expect(isInFullBurst(plan.schedule!, h.frame)).toBe(true);
        expect(h.hit.boost.fullBurst).toBe(0.5);
      }
    });
  });

  it('rejects perCount without the trigger burstUse or with an unknown field', () => {
    const def = readJson<{ skills: { burst: { effects: Record<string, unknown>[] } } }>('../../data/skills/511.json');
    const withEffect = (patch: Record<string, unknown>) => {
      const copy = structuredClone(def);
      copy.skills.burst.effects[1] = { ...copy.skills.burst.effects[1], ...patch };
      return () => parseSkillDefinition(copy);
    };
    expect(withEffect({})).not.toThrow();
    expect(withEffect({ trigger: 'battleStart', perBurstHit: undefined })).toThrow(
      /perCount needs the trigger "burstUse"/,
    );
    expect(withEffect({ perCount: { state: 'beauty', stacks: 2 } })).toThrow(/perCount\.stacks: unknown field/);
    expect(withEffect({ perCount: 'beauty' })).toThrow(/perCount: expected an object/);
  });
});
