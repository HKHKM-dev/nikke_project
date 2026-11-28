// アニス（12。V-0891）を含む編成で、バーストのダメージ（1 ヒット）と防御力▼（説明文の割合・5 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { characterOf, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const ANIS = 12;
const FLOWER = 304;

describe('アニスの定義', () => {
  const def = parseSkillDefinition(rawDefinition(ANIS));

  it('defines only the Burst damage and DEF down; the DEF ups and damage sharing are notes', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['indirect', 'noDamage']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage', 'timed']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（I-DOLL・フラワー + アニス・電撃の敵）': fixedTeam(
    [fixedSlot(FLOWER, { conditionMode: 'auto' }), null, fixedSlot(ANIS, { conditionMode: 'auto' })],
    2,
    { enemy: rangeEnemyWithEvents({ element: 'Electronic' }) },
  ),
  '実戦寄り（I-DOLL・フラワー + アニス + ギロチン：ウィンタースレイヤー + アリス）': fixedTeam(
    [FLOWER, ANIS, 182, 191],
    3,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const anis = input.slots.findIndex((s) => s?.character.resourceId === ANIS);
  const plan = planTeamRun(input);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === anis);

  it('hits once 93 f after the hexagon (C-1615)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(burstDelaysOf(characterOf(ANIS))).toEqual({ hitFrames: 93, effectFrames: 93 });
    for (const a of uses) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 93]);
  });

  it('gives the DEF down (held by the enemy) for 5 s from the Burst hit (C-1617)', () => {
    const down = itemsOf(plan.history, {
      sourceSlotIndex: anis,
      kind: 'timed',
      skill: 'burst',
      stat: 'enemyDefenseDown',
    });
    expect(down.length).toBe(uses.length);
    down.forEach((w, k) => {
      expect(w.start).toBe(hitFramesOf(uses[k]!)[0]);
      expect(w.end).toBe(Math.min(w.start + gameSecondsToFrames(5), plan.frames));
    });
  });
});
