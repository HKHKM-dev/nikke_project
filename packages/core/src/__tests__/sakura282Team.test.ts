// サクラ編（V-0837）: サクラ（282）を含む編成で、S2 のフルバースト開始時の味方全体へのバーストスキルクールタイム▼と、バーストの
// 発動者基準の攻撃力▲（10 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { skillValue } from '../skills/resolve.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const SAKURA = 282;
const DELTA = 20;
const IDOLL_SUN = 308;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('サクラの定義', () => {
  const def = parseSkillDefinition(rawDefinition(SAKURA));

  it('defines the cooldown cut of S2 and the caster-based ATK up of the burst, and leaves the rest as notes', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['indirect']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'cooldownReduction', trigger: 'fullBurstStart', target: 'allies' },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'attack', scaling: 'casterAttack' },
    ]);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['noDamage', 'outOfScope']);
  });
});

/** 編成とサクラの枠 */
const CASES: Record<string, { input: TeamInput; sakura: number }> = {
  '撮影の編成（デルタ + I-DOLL・サン + サクラ（操作）。V-0837）': {
    input: fixedTeam([DELTA, IDOLL_SUN, SAKURA].map(autoSlot), 2, { enemy: rangeEnemy }),
    sakura: 2,
  },
  '実戦寄り（サクラ + クラウン + アリス + マクスウェル + ドレイク）': {
    input: fixedTeam([SAKURA, 330, 191, 102, 101], 1),
    sakura: 0,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, sakura }) => {
  const plan = planTeamRun(input);
  const fullBursts = plan.schedule!.fullBurstWindows;
  const own = plan.schedule!.activations.filter((a) => a.slotIndex === sakura);

  it('cuts the running Burst cooldown of every ally at every Full Burst start', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    const cuts = plan.instants.filter((x) => x.effect.kind === 'cooldownReduction' && x.sourceSlotIndex === sakura);
    const value = skillValue(characterOf(SAKURA).skills.skill2, 2, 10);
    fullBursts.forEach((w, k) => {
      const atStart = cuts.filter((x) => x.frame === w.start);
      expect(atStart.map((x) => x.slotIndex).sort()).toEqual([...input.slots.keys()]);
      // そのチェーンで使った枠の CT は走っているので、値の分だけ縮む。ほかの枠は残りの分まで
      const after = k === 0 ? -1 : fullBursts[k - 1]!.end;
      const chain = plan.schedule!.activations.filter((a) => a.frame > after && a.frame <= w.start);
      expect(chain.length).toBeGreaterThanOrEqual(3);
      for (const x of atStart) {
        if (chain.some((a) => a.slotIndex === x.slotIndex)) expect(x.amount).toBe(gameSecondsToFrames(value));
        else expect(x.amount).toBeLessThanOrEqual(gameSecondsToFrames(value));
      }
    });
    expect(cuts).toHaveLength(fullBursts.length * input.slots.length);
  });

  it('gives caster-based ATK up to every ally at every own Burst activation, for 10 s', () => {
    expect(own.length).toBeGreaterThan(2);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(plan.history, {
        sourceSlotIndex: sakura,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'attack',
      });
      expect(items.map((w) => w.start)).toEqual(own.map((a) => a.frame));
      for (const w of items) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
