// 2 段目の段 13 の PR 3（plan/design-skill-stage13.md 2.6・3.3 節）: ミハラ：ボンディングチェーン（162）の S2 のフルバースト中の
// チェーンバインドのスタック量▲（stackChange の target enemy。録画 0748・0749・0754・0755。V-0548、C-0754・C-0751）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { fixedEnemy, fixedTeam } from '../../__tests__/teamHelpers.ts';

type Effects = { effects: Record<string, unknown>[] };
const MIHARA_BC = 162;
const raw = rawDefinition<{ skills: { skill2: Effects } }>(MIHARA_BC);

describe('語彙の検証', () => {
  const up = raw.skills.skill2.effects.findIndex((e) => e.kind === 'stackChange');
  const withUp = (patch: Record<string, unknown>) => {
    const copy = structuredClone(raw);
    copy.skills.skill2.effects[up] = { ...copy.skills.skill2.effects[up], ...patch };
    return () => parseSkillDefinition(copy);
  };

  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('needs the condition { enemyState } of the same state, and no decrease', () => {
    expect(withUp({ condition: undefined })).toThrow(/target enemy needs the condition/);
    expect(withUp({ condition: { enemyState: 'draggingChain' } })).toThrow(/target enemy needs the condition/);
    expect(withUp({ decrease: true })).toThrow(/decrease is not allowed with target enemy/);
  });

  it('points at a dot with firstTick halfAfterLatest', () => {
    expect(withUp({ state: 'draggingChain', condition: { enemyState: 'draggingChain' } })).toThrow(
      /stackChange of "draggingChain" needs a dot of the same state with firstTick halfAfterLatest/,
    );
  });
});

describe('ラム・デルタ・シンデレラ・ミハラ：ボンディングチェーン（V-0548 の撮影 C の編成）', () => {
  const ids = [822, 20, 511, MIHARA_BC] as const;
  const characters = ids.map((id) => characterOf(id));
  const slots = characters.map((character): TeamSlotInput => {
    const fixed = computeFixedSpecAttack(character);
    return {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 1, distanceBonus: true, hitRate: 1 },
      skills: {
        definition: parseSkillDefinition(rawDefinition(character.resourceId)),
        levels: MAX_SKILL_LEVELS,
      },
    };
  });
  const enemy: EnemyInput = fixedEnemy({ element: 'Fire' });
  const result = runSimulation(fixedTeam(slots, 3, { enemy }));
  const window = result.schedule!.fullBurstWindows[0]!;
  const chains = result.skillHits.filter(
    (h) => h.slotIndex === 3 && h.effect.source.skill === 'skill1' && h.effect.dot,
  );
  const ups = chains.filter((h) => h.onApply === true && window.start <= h.frame && h.frame < window.end);
  const shots = result.shots[3]!.frames;

  it('adds one stack every 40 hits that land during Full Burst, counting the hits from the start of battle', () => {
    expect(ups.length).toBeGreaterThan(0);
    for (const h of ups) expect(shots.filter((f) => f <= h.frame).length % 40).toBe(0);
  });

  it('restarts the ticks like an application, with one more stack each time', () => {
    ups.forEach((h, i) => {
      const next = chains.find((t) => t.stacks !== undefined && t.frame > h.frame)!;
      expect(next.frame - h.frame).toBe(Math.round(0.5 * 59.25));
      expect(next.stacks).toBe(Math.min(10 + i + 1, 20));
    });
  });
});
