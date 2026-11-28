// モリー（590。V-0885）を含む編成で、バーストの味方全体への持続ダメージ▲（C-1588）が、モリーのバーストのたびに 10 秒、
// 味方全体の持続ダメージの tick に乗るか。必死の抵抗（C-1590）は戦闘の終わりまで続く状態で、S2 の挑発はゲージを溜めない（C-1589）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { statesMatching } from '../skills/states.ts';
import { staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MOLLY = 590;
const KURUMI = 862;
const RAVEN = 851;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('モリーの定義', () => {
  const def = parseSkillDefinition(rawDefinition(MOLLY));

  it('defines Struggle as a barrier-family state, the burst Sustained Damage up, and the rest as notes', () => {
    expect(statesMatching('barrier')).toContain('struggle');
    expect(staticStatesOf(def)).toEqual(['struggle']);
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'state', state: 'struggle', trigger: 'battleStart', target: 'self', durationUntil: 'battleEnd' },
    ]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'outOfScope']);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['noDamage', 'outOfScope']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'sustainedDamage' },
    ]);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['outOfScope', 'outOfScope']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A（クルミ + モリー + レイヴン（操作）。V-0885）': fixedTeam([KURUMI, MOLLY, RAVEN].map(autoSlot), 2, {
    enemy: rangeEnemy,
  }),
  '実戦寄り（リター + モリー + レイヴン + アリス + クルミ）': fixedTeam([82, MOLLY, RAVEN, 191, KURUMI], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const m = input.slots.findIndex((x) => x?.character.resourceId === MOLLY);
  const plan = planTeamRun(input);
  const mine = plan.schedule!.activations.filter((a) => a.slotIndex === m);
  const fromMolly = (holder: number) =>
    itemsOf(plan.history, { sourceSlotIndex: m, holder, kind: 'timed', skill: 'burst', stat: 'sustainedDamage' });

  it('keeps Struggle on her from the start of battle to the end (a static state, not items)', () => {
    expect(itemsOf(plan.history, { state: 'struggle' })).toEqual([]);
  });

  it('gives every ally the Sustained Damage up from each Burst of hers, for 10 s', () => {
    expect(mine.length).toBeGreaterThan(3);
    const starts = mine.map(effectFrameOf).filter((f) => f < plan.frames);
    for (const holder of input.slots.keys()) {
      const items = fromMolly(holder);
      expect(items.map((w) => w.start)).toEqual(starts);
      for (const w of items) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });

  it("raises the allies' damage over time ticks (skill hits) against the definition without the burst effect", () => {
    const without = structuredClone(input);
    const raw = rawDefinition<{ skills: { burst: { effects: unknown[]; notes: unknown[] } } }>(MOLLY);
    raw.skills.burst.effects = [];
    without.slots[m] = {
      ...without.slots[m]!,
      skills: { ...without.slots[m]!.skills!, definition: parseSkillDefinition(raw) },
    };
    const dot = (t: TeamInput) =>
      runSimulation(t)
        .slots.filter((s) => s !== null)
        .reduce((sum, s) => sum + s.skillHits.damage, 0);
    expect(dot(input)).toBeGreaterThan(dot(without));
  });
});

describeEveryShotInOneGroup(TEAMS);
