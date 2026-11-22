// メアリー：ベイゴッデス（132。V-0858）を含む編成で、S2 の有利コードの攻撃ダメージ▲が自分のバーストの使用の 1・2・3 回目から段ごとに
// 3・5・10 秒ずつ足されること、バーストの攻撃力▲が水冷の味方にだけ 3 秒付くこと、S1 の持続回復がフルバーストの開始の
// 1・2・3 回目から段ごとに付くことを見る。射撃の列のグループ分け
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { buffsMetrics } from '../records/observations/metrics/buffs.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { characterOf, rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MARY_BG = 132;
const TIER_SECONDS = [3, 5, 10];

describe('メアリー：ベイゴッデスの定義', () => {
  const def = parseSkillDefinition(rawDefinition(MARY_BG));

  it('defines the S1 heals by Full Burst count, the S2 Elemental Advantage tiers by own Burst count and the Burst ups', () => {
    for (const slot of ['skill1', 'skill2', 'burst'] as const) expect(def.skills[slot].support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject(
      [1, 2, 3].map((atLeast) => ({
        kind: 'heal',
        trigger: { count: 'fullBurstStart', atLeast },
        target: 'allies',
      })),
    );
    expect(def.skills.skill2.effects).toMatchObject(
      [1, 2, 3].map((atLeast) => ({
        kind: 'timed',
        trigger: { count: 'burstUse', atLeast },
        target: 'allies',
        targetElement: 'Water',
        stat: 'elementDamage',
      })),
    );
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'allies', targetElement: 'Water', stat: 'attack' },
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'maxHp', scaling: 'casterMaxHp' },
    ]);
  });
});

const CASES: Record<string, { input: TeamInput; mary: number }> = {
  '撮影の編成（メアリー：ベイゴッデスの単騎・操作・灼熱の敵。V-0858）': {
    input: fixedTeam([MARY_BG], 0, { enemy: rangeEnemyWithEvents() }),
    mary: 0,
  },
  '実戦寄り（アニス：スター + メアリー：ベイゴッデス + レム + ヘルム（操作） + ネオン：ブルーオーシャン）・灼熱の敵': {
    input: fixedTeam([17, MARY_BG, 820, 352, 14], 3, { enemy: rangeEnemyWithEvents() }),
    mary: 1,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, mary }) => {
  const plan = planTeamRun(input);
  const schedule = plan.schedule!;
  const uses = schedule.activations
    .filter((a) => a.slotIndex === mary)
    .map((a) => effectFrameOf(a))
    .filter((f) => f < plan.frames);
  const water = [...input.slots.keys()].filter(
    (i) => characterOf(input.slots[i]!.character.resourceId).element === 'Water',
  );
  const others = [...input.slots.keys()].filter((i) => !water.includes(i));

  it('adds one S2 tier from each of her first three Burst uses, for 3, 5 and 10 seconds (C-1532)', () => {
    expect(uses.length).toBeGreaterThan(3);
    for (const holder of water) {
      const tiers = itemsOf(plan.history, { sourceSlotIndex: mary, holder, kind: 'timed', skill: 'skill2' });
      for (let k = 0; k < 3; k++) {
        const tier = tiers.filter((w) => w.origin.kind === 'timed' && w.origin.effect.effectIndex === k);
        // k 段目は、自分の k + 1 回目以降のバーストの使用のたびに付く（編成のほかの I・II・III の使用は数えない）
        expect(tier.map((w) => w.start)).toEqual(uses.slice(k));
        for (const w of tier)
          expect(w.end).toBe(Math.min(w.start + gameSecondsToFrames(TIER_SECONDS[k]!), plan.frames));
      }
    }
    for (const holder of others)
      expect(itemsOf(plan.history, { sourceSlotIndex: mary, holder, kind: 'timed', skill: 'skill2' })).toEqual([]);
  });

  it('gives the Burst ATK up only to Water allies for 3 seconds from each use (C-1533)', () => {
    for (const holder of water) {
      const items = itemsOf(plan.history, {
        sourceSlotIndex: mary,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'attack',
      });
      expect(items.map((w) => w.start)).toEqual(uses);
      for (const w of items) expect(w.end).toBe(Math.min(w.start + gameSecondsToFrames(3), plan.frames));
    }
    for (const holder of others)
      expect(
        itemsOf(plan.history, { sourceSlotIndex: mary, holder, kind: 'timed', skill: 'burst', stat: 'attack' }),
      ).toEqual([]);
  });

  it('applies one S1 heal tier from each of the first three Full Bursts to every ally (C-1534)', () => {
    const starts = schedule.fullBurstWindows.map((w) => w.start).filter((f) => f < plan.frames);
    // 単騎ではフルバーストにならず、S1 は起きない
    if (input.slots.length === 1) expect(starts).toEqual([]);
    else expect(starts.length).toBeGreaterThan(3);
    for (const holder of input.slots.keys()) {
      for (let k = 0; k < 3; k++) {
        const heals = plan.instants.filter(
          (i) =>
            i.sourceSlotIndex === mary &&
            i.slotIndex === holder &&
            i.effect.kind === 'heal' &&
            i.effect.source.skill === 'skill1' &&
            i.effect.effectIndex === k,
        );
        expect(heals).toHaveLength(Math.max(starts.length - k, 0));
      }
    }
  });

  it('reports the start of each S2 tier separately through buffFireStarts (effect)', () => {
    const sim = runSimulation(input);
    for (let k = 0; k < 3; k++) {
      const starts = buffsMetrics.buffFireStarts!.sim(sim, {
        args: { slot: mary + 1, skill: 'skill2', stat: 'elementDamage', effect: k },
        input,
      });
      expect(starts).toEqual(uses.slice(k));
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
