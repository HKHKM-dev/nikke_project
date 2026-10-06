// レイヴン（851）を含む編成: S1 のスタックする持続ダメージと、付けたとき・tick のゲージ（plan/design-raven-s1.md）。
// sim と calc の整合と、tick のスタック・ゲージの予約。録画 141 の観測値を入力にした tick・スタック・満タンの確かめ（6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { BURST_GAUGE_MAX } from '../burst/controller.ts';
import { energyPerTrigger } from '../burst/dynamic.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { dotTicks, planTeamRun } from '../frame/plan.ts';
import type { ShotLog } from '../frame/shots.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number, definition?: SkillDefinition): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (definition !== undefined || DEFINED.has(id)) {
    slot.skills = { definition: definition ?? definitionOf(id), levels: MAX_SKILL_LEVELS };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

/** フルチャージの発（部分チャージの発を除く）のフレーム */
function fullChargeFrames(log: ShotLog): number[] {
  const partial = new Set((log.partialShots ?? []).filter((p) => p.progress < 1).map((p) => p.frame));
  return log.frames.filter((f) => !partial.has(f));
}

const RAVEN = 851;
const raven = character(RAVEN);
// 撮影の編成（レイヴン単騎。V-0111）と、レイヴンが III の実戦寄りの 5 人（クルミの編成のクルミをレイヴンに替えたもの）
const TEAMS: Record<string, { input: TeamInput; raven: number }> = {
  '撮影の編成（レイヴン単騎）': { input: team([fixedSlot(RAVEN)], 0), raven: 0 },
  '実戦寄り（レイヴン + クラウン + ドレイク + アリス + リター）': {
    input: team([fixedSlot(RAVEN), fixedSlot(330), fixedSlot(101), fixedSlot(191), fixedSlot(82)], 0),
    raven: 0,
  },
};

describe('レイヴンの定義', () => {
  it('supports S1 (stacking damage over time with gauge, and ATK up on Full Burst); S2 is notes; the burst is supported', () => {
    const def = definitionOf(RAVEN);
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      {
        kind: 'dot',
        trigger: { count: 'fullChargeShot' },
        firstTick: 'afterInterval',
        maxStacksRef: 5,
        gaugeOnApply: true,
        gaugeOnTick: true,
      },
      { kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'attack', scaling: 'casterAttack' },
    ]);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage', damageType: 'skill' },
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'sustainedDamage' },
    ]);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, raven: slotIndex }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const ticks = plan.skillHits.filter((h) => h.slotIndex === slotIndex && h.effect.dot !== undefined);
  const fires = fullChargeFrames(plan.shots[slotIndex]!);

  it('ticks from 1 s after each full-charge shot with the stacks of the group so far, up to 10 (C-0182)', () => {
    expect(fires.length).toBeGreaterThan(10);
    const expected = dotTicks(fires, 1, 5, plan.frames, 'afterInterval', 10);
    expect(ticks.map((h) => ({ frame: h.frame, stacks: h.stacks }))).toEqual(expected);
    expect(Math.max(...ticks.map((h) => h.stacks!))).toBeGreaterThan(1);
  });

  it('uses 68.46% per stack at skill Lv10', () => {
    for (const h of ticks) {
      expect(h.effect.multiplier).toBeCloseTo(0.6846, 10);
      expect(h.hit.multiplier).toBeCloseTo(0.6846 * h.stacks!, 10);
    }
  });

  it('charges one hit of the shooter on each application and on each tick (C-0181)', () => {
    const own = plan.dotGauges.filter((g) => g.slotIndex === slotIndex);
    const applies = own.filter((g) => g.kind === 'apply');
    const reserved = own.filter((g) => g.kind === 'tick');
    expect(applies.map((g) => g.frame)).toEqual(fires);
    // ループの中で予約した tick は、ループの後の dotTicks と同じ列（plan/design-raven-s1.md 8 節の 2）
    expect(reserved.map((g) => g.frame)).toEqual(ticks.map((h) => h.frame));
    for (const g of own) expect(g.energy).toBe(raven.shot.targetBurstEnergyPerShot);
  });

  it('agree exactly on the schedule, the instants and the shot-counted groups', () => {
    expect(sim.schedule).toEqual(calc.schedule);
    expect(sim.instants).toEqual(plan.instants);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!;
      const c = calc.slots[i]!;
      expect(s.skillHits.damage).toBe(c.skillHits.totalDamage);
      expect(s.burst.damage).toBe(c.burst.totalDamage);
      const groups = simGroupTotals(sim, i);
      c.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
    });
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });

  it('stays within 5% per slot and 3% for the team', () => {
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
    input.slots.forEach((_, i) => {
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});

describe('the gauge of the damage over time moves the bursts earlier', () => {
  it('fills the first gauge no later than without it', () => {
    const def = definitionOf(RAVEN);
    const withoutGauge: SkillDefinition = structuredClone(def);
    const dot = withoutGauge.skills.skill1.effects[0]!;
    if (dot.kind !== 'dot') throw new Error('expected a dot');
    delete dot.gaugeOnApply;
    delete dot.gaugeOnTick;
    const others = [330, 101, 191, 82].map((id) => fixedSlot(id));
    const a = planTeamRun(team([fixedSlot(RAVEN, def), ...others], 0)).schedule!.activations;
    const b = planTeamRun(team([fixedSlot(RAVEN, withoutGauge), ...others], 0)).schedule!.activations;
    expect(a[0]!.frame).toBeLessThan(b[0]!.frame);
  });
});

// plan/design-raven-s1.md 6 節: 録画 141（レイヴン単騎・操作）の付いたフレームを入力にして、tick とスタックと満タンを確かめる。
// 値は観測値から読む（テストに実測値を直書きしない）
type Observation = { id: string; value: number | number[] };
const observations = readJson<Observation[]>('../../../../records/observations/141.json');
const obs = (id: string): Observation['value'] => {
  const o = observations.find((x) => x.id === id);
  if (o === undefined) throw new Error(`observation ${id} not found`);
  return o.value;
};

describe('recording 141 (Raven solo, manual)', () => {
  const applications = obs('141-03') as number[];
  const tickFrames = obs('141-01') as number[];
  const stacks = obs('141-02') as number[];
  const hits = obs('141-08') as number[];
  const full = obs('141-07') as number;
  const model = dotTicks(applications, 1, 5, 1_000_000, 'afterInterval', 10);

  it('gives the observed ticks within 1 frame and the observed stacks (C-0182)', () => {
    expect(model).toHaveLength(tickFrames.length);
    model.forEach((t, i) => {
      expect(Math.abs(t.frame - tickFrames[i]!)).toBeLessThanOrEqual(1);
      expect(t.stacks).toBe(stacks[i]);
    });
  });

  it('fills the gauge on the observed tick: hits, applications and ticks add up to the full gauge (C-0181)', () => {
    const one = raven.shot.targetBurstEnergyPerShot;
    const events = [
      ...hits.map((frame) => ({ frame, energy: energyPerTrigger(raven.shot, true) })),
      ...applications.map((frame) => ({ frame, energy: one })),
      ...model.map((t) => ({ frame: t.frame, energy: one })),
    ].sort((a, b) => a.frame - b.frame);
    let gauge = 0;
    let filledAt: number | null = null;
    for (const e of events) {
      gauge += e.energy;
      if (gauge >= BURST_GAUGE_MAX) {
        filledAt = e.frame;
        break;
      }
    }
    // 満タンは最後の tick（観測では f の差 0〜1）で届く
    expect(filledAt).not.toBeNull();
    expect(Math.abs(filledAt! - full)).toBeLessThanOrEqual(1);
    expect(model.findIndex((t) => t.frame === filledAt)).toBe(tickFrames.indexOf(full));
  });
});
