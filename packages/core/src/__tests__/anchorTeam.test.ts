// アンカー（351。V-0878）を含む編成で、バーストのバーストスキルダメージ（5 ヒットに等分）が意図どおりに出て、
// S1 の挑発がバーストゲージを溜めないか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf, hitShareOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { characterOf, fixedTeam } from './teamHelpers.ts';

const ANCHOR = 351;

describe('アンカーの定義', () => {
  const def = parseSkillDefinition(rawDefinition(ANCHOR));

  it('defines only the Burst damage; the taunt and DEF up and the projectile damage up are notes', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.effects).toEqual([]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['noDamage', 'indirect']);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（アンカー単騎）': fixedTeam([ANCHOR], 0),
  '実戦寄り（アンカー + クラウン + ギロチン：ウィンタースレイヤー + アリス + ユニ）': fixedTeam(
    [ANCHOR, 330, 182, 191, 160],
    2,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const anchor = input.slots.findIndex((s) => s?.character.resourceId === ANCHOR);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === anchor);

  it('splits the Burst damage into 5 equal hits from 8 f after the hexagon (C-1574)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(burstDelaysOf(characterOf(ANCHOR))).toEqual({
      hitFrames: 8,
      effectFrames: 0,
      hitOffsets: [0, 8, 15, 20, 28],
    });
    for (const a of uses) {
      expect(hitShareOf(a)).toBe(1 / 5);
      expect(hitFramesOf(a)).toEqual([0, 8, 15, 20, 28].map((o) => hexagonFrameOf(a) + 8 + o));
    }
  });

  it('charges no Burst Gauge with the taunt on the last bullet (C-1573)', () => {
    const plan = planTeamRun(input);
    expect(plan.timerGauges.filter((g) => g.slotIndex === anchor)).toEqual([]);
    expect(sim.shots[anchor]!.lastShotFrames?.length).toBeGreaterThan(2);
  });
});
