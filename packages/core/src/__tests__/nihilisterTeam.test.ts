// ニヒリスター（261）を含む編成: バーストの倍率ダメージ・火傷（持続ダメージ dot）・最大装弾数▲。sim と calc の整合と、火傷の tick（plan/design-nihilister.md）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MEASURED_BURST_DELAYS } from '../burst/landing.ts';
import { HEXAGON_AFTER_ACTIVATION_FRAMES, effectFrameOf, hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { gameSecondsToFrames } from '../time.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { timerFrames } from '../skills/timeline.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { dotTickFrames, planTeamRun } from '../frame/plan.ts';
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

const NIHILISTER = 261;
// 撮影の計画の編成（ココア + ニヒリスター。ココアの検証記録と同じ録画）と、ニヒリスターが II の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; nihilister: number }> = {
  '撮影の計画の編成（ココア + ニヒリスター）': {
    input: team([fixedSlot(311), fixedSlot(NIHILISTER)], 1),
    nihilister: 1,
  },
  '実戦寄り（リター + ニヒリスター + ドレイク + アリス + クラウン）': {
    input: team([fixedSlot(82), fixedSlot(NIHILISTER), fixedSlot(101), fixedSlot(191), fixedSlot(330)], 1),
    nihilister: 1,
  },
};

describe('ニヒリスターの定義', () => {
  it('supports S2 (partly: the gauge of the hit is a note) and the burst (S1 is notes)', () => {
    const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${NIHILISTER}.json`));
    expect(def.skills.skill1.support).toBe('noEffect');
    // S2 のヒットのゲージは確かめていない（notes の未対応）
    expect(def.skills.skill2.support).toBe('partial');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage', 'dot', 'timed']);
  });
});

describe.each(Object.entries(TEAMS))('sim vs calc: %s', (_name, { input, nihilister }) => {
  const sim = runSimulation(input);
  const calc = computeTeamDamage(input);
  const plan = planTeamRun(input);
  const mine = plan.schedule!.activations.filter((a) => a.slotIndex === nihilister);
  // バースト使用時の効果（火傷・最大装弾数▲）は、発動の 9f 後の効果の発火から（C-0219）。戦闘の終わり以降は発火しない
  const fires = mine.map(effectFrameOf).filter((f) => f < plan.frames);

  it('lands the burst damage and fires the burst effects 9 frames after the hexagon change of each use (C-0219, V-0382)', () => {
    const delays = MEASURED_BURST_DELAYS.find((row) => row.resourceIds.includes(NIHILISTER))!.delays;
    expect(delays).toEqual({ hitFrames: 9, effectFrames: 9 });
    expect(mine.length).toBeGreaterThan(0);
    for (const a of mine) {
      expect(hitFrameOf(a)).toBe(hexagonFrameOf(a) + 9);
      expect(hexagonFrameOf(a)).toBe(a.frame + HEXAGON_AFTER_ACTIVATION_FRAMES);
      expect(effectFrameOf(a)).toBe(a.frame + HEXAGON_AFTER_ACTIVATION_FRAMES + 9);
    }
  });

  it('hits with S2 15 frames after each activation every 10 s from the start of battle, whatever the shots and bursts (C-0401, C-0453)', () => {
    const s2 = plan.skillHits.filter((h) => h.slotIndex === nihilister && h.effect.source.skill === 'skill2');
    const expected = timerFrames(10, plan.frames)
      .map((f) => f + 15)
      .filter((f) => f < plan.frames);
    expect(s2.map((h) => h.frame)).toEqual(expected);
    for (const h of s2) expect(h.effect.multiplier).toBeCloseTo(1.1264, 10);
  });

  it('burns 10 ticks on each burst of Nihilister: at the hit, then from 1.5 s every second (C-0101, restart when re-applied)', () => {
    expect(fires.length).toBeGreaterThan(0);
    const ticks = plan.skillHits.filter((h) => h.slotIndex === nihilister && h.effect.dot !== undefined);
    expect(ticks.map((h) => h.frame)).toEqual(dotTickFrames(fires, 1, 10, plan.frames));
    for (const t of ticks) expect(t.effect.multiplier).toBeCloseTo(0.1319, 10);
  });

  it('gives max ammo +6 for 15 s on each burst (overlapping bursts extend the window)', () => {
    const windows = plan.timeline.windows.filter(
      (w) => w.sourceSlotIndex === nihilister && w.effect.stat === 'maxAmmo',
    );
    // バーストごとの [効果の発火, 効果の発火 + 15 秒) の和集合（再発火は上書き延長）
    const expected: [number, number][] = [];
    for (const u of fires) {
      const end = Math.min(u + gameSecondsToFrames(15), plan.frames);
      const last = expected.at(-1);
      if (last !== undefined && u <= last[1]) last[1] = Math.max(last[1], end);
      else expected.push([u, end]);
    }
    expect(windows.map((w) => [w.start, w.end])).toEqual(expected);
    for (const w of windows) expect(w.effect.value).toBe(6);
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
