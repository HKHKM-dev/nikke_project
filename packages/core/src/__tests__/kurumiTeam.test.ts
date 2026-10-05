// クルミ（862）を含む編成: S1 のハッキング（持続ダメージ dot。付いた 1 秒後から 1 秒ごと・付き直しで延びる）。
// sim と calc の整合と、ハッキングの tick（plan/design-kurumi.md）と、tick のゲージ（V-0113。plan/design-raven-s1.md 10 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { dotTickFrames, planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrame } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const KURUMI = 862;
const DEF_PATH = `../../data/skills/${KURUMI}.json`;
// 撮影の計画の編成（クルミ単騎。V-0052）と、クルミが I の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; kurumi: number }> = {
  '撮影の計画の編成（クルミ単騎）': { input: team([fixedSlot(KURUMI)], 0), kurumi: 0 },
  '実戦寄り（クルミ + クラウン + ドレイク + アリス + リター）': {
    input: team([fixedSlot(KURUMI), fixedSlot(330), fixedSlot(101), fixedSlot(191), fixedSlot(82)], 0),
    kurumi: 0,
  },
};

describe('クルミの定義', () => {
  it('supports S1 (two hackings), S2 (additional damage in full burst, V-0181) and the burst (damage taken up)', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${KURUMI}.json`));
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['dot', 'dot']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'damage', trigger: { count: 'normalHit' }, condition: { fullBurst: true, targetStatus: 'hacking' } },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'damageTaken' },
    ]);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, kurumi }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const ticks = plan.skillHits.filter((h) => h.slotIndex === kurumi && h.effect.dot !== undefined);

  it('hacks on every 36th hit and on each burst as one hacking: from 1 s after, every second, extended by re-applying (C-0129, C-0130, C-0136)', () => {
    const shots = plan.shots[kurumi]!.frames;
    const hits = shots.filter((_, j) => (j + 1) % 36 === 0);
    const uses = activationFramesOfSlot(plan.schedule!, kurumi);
    expect(hits.length).toBeGreaterThan(10);
    expect(uses.length).toBeGreaterThan(0);
    const fires = [...hits, ...uses].sort((a, b) => a - b);
    expect(ticks.map((h) => h.frame)).toEqual(dotTickFrames(fires, 1, 5, plan.frames, 'afterInterval'));
    // 付いたフレームには tick が出ない（重ならないので、同じフレームに 2 つの tick も出ない）。ただし付いている最中に付き直しても
    // 刻みは変わらない（C-0146）ので、付き直したフレームには刻みの tick が重なることがある。確かめるのは、まとまりの最初に付いたフレーム
    const frames = ticks.map((h) => h.frame);
    expect(new Set(frames).size).toBe(frames.length);
    const holdFrames = gameSecondsToFrame(5);
    let groupEnd = -Infinity;
    for (const f of fires) {
      if (f >= groupEnd) expect(frames).not.toContain(f);
      groupEnd = Math.max(groupEnd, f + holdFrames);
    }
  });

  it('attributes each tick to the effect that applied the hacking last', () => {
    const uses = activationFramesOfSlot(plan.schedule!, kurumi);
    for (const u of uses) {
      const next = ticks.find((h) => h.frame > u);
      if (next === undefined) continue;
      const hitFiresBetween = plan.shots[kurumi]!.frames.filter(
        (f, j) => (j + 1) % 36 === 0 && f > u && f <= next.frame,
      );
      if (hitFiresBetween.length === 0) expect(next.effect.effectIndex).toBe(1);
    }
  });

  it('raises the damage taken by 18.06% for 10 s from each burst of Kurumi, for every slot (C-0138, C-0152)', () => {
    const uses = activationFramesOfSlot(plan.schedule!, kurumi);
    const windows = plan.timeline.windows.filter((w) => w.effect.stat === 'damageTaken');
    expect(windows.length).toBeGreaterThan(0);
    for (const w of windows) {
      expect(w.effect.value).toBeCloseTo(0.1806, 10);
      expect(uses).toContain(w.start);
    }
    // ▲の窓の中の tick は × 1.1806、外は × 1
    for (const h of plan.skillHits.filter((x) => x.slotIndex === kurumi && x.effect.dot !== undefined)) {
      const inside = windows.some((w) => w.start <= h.frame && h.frame < w.end);
      expect(h.hit.damageTakenMultiplier).toBeCloseTo(inside ? 1.1806 : 1, 10);
    }
  });

  it('uses 52.24% per tick at skill Lv10', () => {
    for (const h of plan.skillHits.filter((x) => x.slotIndex === kurumi && x.effect.dot !== undefined)) {
      expect(h.effect.multiplier).toBeCloseTo(0.5224, 10);
    }
  });

  it('charges one hit of Kurumi per hacking tick, also for a hacking applied by the burst, and nothing on applying it (C-0196)', () => {
    const own = plan.dotGauges.filter((g) => g.slotIndex === kurumi);
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((g) => g.kind === 'tick')).toBe(true);
    // ループの中で予約した tick は、ループの後に出したハッキングの tick と同じ列（バーストで付いた分も含む。10 節）
    expect(own.map((g) => g.frame)).toEqual(ticks.map((h) => h.frame));
    expect(new Set(own.map((g) => g.energy)).size).toBe(1);
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

// V-0113: クルミ単騎の録画 057〜062 の 1 回目の満タン。弾とハッキングの tick を 4,000 ずつ足した合計が、1,000,000 にちょうど
// 届いたヒットのフレームで満タンになる（付けた回は足さない）。数は観測値から読む（テストに実測値を直書きしない）
type Observation = { id: string; value: number | number[] };
const observations = readJson<Observation[]>('../../../../records/observations/057.json');
const obs = (id: string): Observation['value'] => {
  const o = observations.find((x) => x.id === id);
  if (o === undefined) throw new Error(`observation ${id} not found`);
  return o.value;
};

describe('recordings 057–062 (Kurumi solo): the first full gauge (V-0113)', () => {
  const { input } = TEAMS['撮影の計画の編成（クルミ単騎）']!;
  const plan = planTeamRun(input);
  const one = input.slots[0]!.character.shot.targetBurstEnergyPerShot;
  const full = plan.schedule!.gaugeFullFrames[0]!;
  const shots = plan.shots[0]!.frames;
  const ticks = plan.dotGauges.filter((g) => g.kind === 'tick').map((g) => g.frame);
  const gaugeAt = (frame: number): number =>
    (shots.filter((f) => f <= frame).length + ticks.filter((f) => f <= frame).length) * one;

  it('fills the gauge on the hit where the hits and the ticks reach 1,000,000 (C-0083, C-0196)', () => {
    expect(shots).toContain(full);
    expect(gaugeAt(full)).toBe(1_000_000);
    expect(gaugeAt(full - 1)).toBeLessThan(1_000_000);
  });

  it('fills the gauge later without the tick gauge', () => {
    const plain = structuredClone(readJson<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(DEF_PATH));
    for (const e of plain.skills.skill1.effects) delete e.gaugeOnTick;
    const slot = { ...input.slots[0]!, skills: { definition: parseSkillDefinition(plain), levels: MAX_SKILL_LEVELS } };
    const without = planTeamRun({ ...input, slots: [slot] });
    expect(without.dotGauges).toEqual([]);
    expect(without.schedule!.gaugeFullFrames[0]!).toBeGreaterThan(full);
  });

  it('counts the same hits and ticks up to the full gauge as the recordings (057-10, 057-11)', () => {
    for (const hits of obs('057-10') as number[]) expect(shots.filter((f) => f <= full)).toHaveLength(hits);
    for (const n of obs('057-11') as number[]) expect(ticks.filter((f) => f <= full)).toHaveLength(n);
  });
});
