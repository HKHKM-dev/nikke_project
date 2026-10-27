// 2 段目の段 5 の PR 1（plan/design-skill-stage5.md 1.1・1.2・2.1 節）: バリアの状態（目録の家族 barrier）と、バリア適用状態の条件。
// 使い手はラム（822）のバーストのバリアと、アスカ（830）の S2 の「自分がバリア適用状態なら有利コードの攻撃ダメージ▲」
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { stateMatches, statesMatching } from '../skills/states.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData, Element } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const RUM = 822;
const DELTA = 20;
const ASUKA = 830;
const FLOWER = 304;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

function teamOf(ids: number[], element: Element, controlledSlot = 0): TeamInput {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true };
  return { slots: ids.map(slotOf), enemy, durationSeconds: 180, burst: true, controlledSlot };
}

describe('目録の家族', () => {
  it('lets the family root match every state of the family', () => {
    expect(stateMatches('barrier', 'barrier')).toBe(true);
    expect(stateMatches('barrier', 'relax')).toBe(false);
    expect(statesMatching('barrier')).toContain('barrier');
    expect(statesMatching('relax')).toEqual(['relax']);
  });

  it('rejects a barrier grant that looks at the barrier family', () => {
    const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
    const grant = {
      kind: 'state',
      state: 'barrier',
      trigger: 'burstUse',
      target: 'self',
      durationSeconds: 5,
      condition: { selfState: 'barrier' },
    };
    expect(() =>
      parseSkillDefinition({
        formatVersion: 1,
        resourceId: 1,
        checkedAt: '2026-10-16',
        skills: { skill1: { effects: [grant] }, skill2: empty, burst: empty },
      }),
    ).toThrow(/cannot look at its own state/);
  });
});

describe('ラムのバーストのバリアとアスカ S2（plan/design-skill-stage5.md 2.1 節）', () => {
  const plan = planTeamRun(teamOf([RUM, DELTA, ASUKA], 'Wind'));
  const rumBursts = () => plan.schedule!.activations.filter((a) => a.slotIndex === 0).map((a) => a.frame);

  it('puts a barrier on every ally from each burst of Rum for 10 seconds', () => {
    const starts = rumBursts();
    expect(starts.length).toBeGreaterThan(1);
    for (const holder of [0, 1, 2]) {
      const items = itemsOf(plan.history, { holder, state: 'barrier' });
      expect(items.map((i) => i.start)).toEqual(starts.filter((f) => f < plan.history.frames));
      for (const i of items)
        expect(i.end - i.start).toBe(Math.min(gameSecondsToFrames(10), plan.history.frames - i.start));
    }
  });

  it('gives Asuka the element damage up at each Full Burst start while she has the barrier', () => {
    const windows = plan.schedule!.fullBurstWindows;
    const barrier = itemsOf(plan.history, { holder: 2, state: 'barrier' });
    const element = itemsOf(plan.history, { holder: 2, sourceSlotIndex: 2, kind: 'timed', stat: 'elementDamage' });
    const expected = windows
      .map((w) => w.start)
      .filter((s) => barrier.some((b) => b.start <= s && s < b.end) && s < plan.history.frames);
    expect(expected.length).toBeGreaterThan(0);
    expect(element.map((i) => i.start)).toEqual(expected);
  });

  it('drops the effect in a team where nobody grants a barrier (the team of recording 063)', () => {
    const without = planTeamRun(teamOf([FLOWER, DELTA, ASUKA], 'Wind'));
    expect(itemsOf(without.history, { holder: 2, sourceSlotIndex: 2, kind: 'timed', stat: 'elementDamage' })).toEqual(
      [],
    );
  });
});

describe('編成: ラム + デルタ + アスカ（風圧）', () => {
  const input = teamOf([RUM, DELTA, ASUKA], 'Wind');
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
