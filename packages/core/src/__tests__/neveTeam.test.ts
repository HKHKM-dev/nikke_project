// ネヴェ編（V-0843）: ネヴェ（193）を含む編成で、S1 の CT ごとのダメージ、S2 のフルバーストの始まりの後の 2 発の貫通特化と攻撃力▲、
// バーストの会心率▲・命中率▲（20 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const NEVE = 193;
const COCOA = 311;
const SOLDIER_FA = 301;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('ネヴェの定義', () => {
  const def = parseSkillDefinition(rawDefinition(NEVE));

  it('defines the S1 cooldown damage, the 2-round Pierce and ATK up of S2, and the burst Crit Rate and Hit Rate up', () => {
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'damage', trigger: { everySeconds: 10 }, damageType: 'skill' },
    ]);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'pierce', durationShotsRef: 1 },
      { kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'attack', durationShotsRef: 3 },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'critRate' },
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'hitRate' },
    ]);
  });
});

/** 編成とネヴェの枠 */
const CASES: Record<string, { input: TeamInput; neve: number }> = {
  '撮影 B の編成（ココア + ソルジャーF.A. + ネヴェ（操作）。V-0843）': {
    input: fixedTeam([COCOA, SOLDIER_FA, NEVE].map(autoSlot), 2, { enemy: rangeEnemy }),
    neve: 2,
  },
  '実戦寄り（ネヴェ + クラウン + リター + マクスウェル + ドレイク）': {
    input: fixedTeam([82, 330, NEVE, 102, 101], 2),
    neve: 2,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, neve }) => {
  const plan = planTeamRun(input);
  const fullBursts = plan.schedule!.fullBurstWindows;
  const shots = plan.shots[neve]!.frames;
  const s2 = (stat: 'pierce' | 'attack') =>
    itemsOf(plan.history, { sourceSlotIndex: neve, holder: neve, kind: 'timed', skill: 'skill2', stat });

  it('hits the target with S1 every 10 s from the start of battle, 15 frames after each activation', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === neve && h.effect.source.skill === 'skill1');
    const period = gameSecondsToFirstFrame(10);
    expect(hits.length).toBeGreaterThan(10);
    hits.forEach((h, k) => expect(h.frame).toBe((k + 1) * period + 15));
  });

  it('gives Pierce and ATK up on her first 2 shots after every Full Burst start', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    for (const stat of ['pierce', 'attack'] as const) {
      const items = s2(stat);
      expect(items.map((w) => w.start)).toEqual(fullBursts.map((w) => w.start).filter((f) => f < plan.frames));
      for (const w of items) {
        if (w.end >= plan.frames) continue;
        const inside = shots.filter((f) => f >= w.start && f < w.end);
        expect(inside).toEqual(shots.filter((f) => f >= w.start).slice(0, 2));
      }
    }
  });

  it('gives Crit Rate and Hit Rate up for 20 s at every own burst', () => {
    const own = plan.schedule!.activations.filter((a) => a.slotIndex === neve);
    expect(own.length).toBeGreaterThan(2);
    for (const stat of ['critRate', 'hitRate'] as const) {
      const items = itemsOf(plan.history, { sourceSlotIndex: neve, holder: neve, kind: 'timed', skill: 'burst', stat });
      expect(items.length).toBe(own.filter((a) => a.frame < plan.frames).length);
      for (const w of items) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(20));
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
