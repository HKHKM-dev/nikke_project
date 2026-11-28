// ネロ（380。V-0892）を含む編成で、バーストのバーストスキルダメージ（1 ヒット）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const NERO = 380;
const FLOWER = 304;

describe('ネロの定義', () => {
  const def = parseSkillDefinition(rawDefinition(NERO));

  it('defines only the Burst damage; the heal, hit and taunt effects are notes', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['noDamage', 'noDamage']);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'outOfScope', 'indirect']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['noDamage', 'indirect']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  'I-DOLL・フラワー + ネロ': fixedTeam([FLOWER, null, NERO], 2),
  '実戦寄り（I-DOLL・フラワー + ネロ + ギロチン：ウィンタースレイヤー + アリス）': fixedTeam(
    [FLOWER, NERO, 182, 191],
    3,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const nero = input.slots.findIndex((s) => s?.character.resourceId === NERO);
  const uses = planTeamRun(input).schedule!.activations.filter((a) => a.slotIndex === nero);

  it('hits once 51 f after the hexagon (C-1616)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(burstDelaysOf(characterOf(NERO))).toEqual({ hitFrames: 51, effectFrames: 0 });
    for (const a of uses) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 51]);
  });
});

describeEveryShotInOneGroup(TEAMS);
