// ネオン（11。V-0856）を含む編成で、バーストのバーストスキルダメージと SG の味方（自分も入る）への最大装弾数▲、
// S2 のフルバーストの始まりの後の受け手ごとの 2 発のクリティカル確率▲が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstHitsOfSlot, effectFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const NEON = 11;
const SOLDIER_FA = 301;
const SOLDIER_EG = 300;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

describe('ネオンの定義', () => {
  const def = parseSkillDefinition(rawDefinition(NEON));

  it('defines the S2 2-round Crit Rate up and the burst damage and SG Max Ammo up, and leaves S1 as a note', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'timed', trigger: 'fullBurstStart', target: 'allies', stat: 'critRate', durationShotsRef: 2 },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage', damageType: 'skill' },
      { kind: 'timed', trigger: 'burstUse', target: 'allies', targetWeapon: 'SG', stat: 'maxAmmo', scaling: 'flat' },
    ]);
  });
});

/** 編成と、ネオンの枠 */
const CASES: Record<string, { input: TeamInput; neon: number }> = {
  '撮影の編成（ネオン + ソルジャーF.A. + ソルジャーE.G.（操作）。V-0856）': {
    input: fixedTeam([NEON, SOLDIER_FA, SOLDIER_EG], 2, { enemy: rangeEnemy }),
    neon: 0,
  },
  '実戦寄り（ネオン + ブラン + ドレイク + マクスウェル + リター）': {
    input: fixedTeam([NEON, 270, 101, 102, 82], 0),
    neon: 0,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, neon }) => {
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === neon);
  const starts = uses.map((a) => effectFrameOf(a)).filter((f) => f < sim.frames);
  const fullBursts = sim.schedule!.fullBurstWindows.map((w) => w.start).filter((f) => f < sim.frames);
  const isSg = (slot: number): boolean => input.slots[slot]!.character.weaponType === 'SG';

  it('lands one burst damage hit on the target per Neon burst (C-1520)', () => {
    const landed = burstHitsOfSlot(sim.schedule!, neon, sim.frames);
    expect(landed.length).toBeGreaterThan(2);
    expect(landed.map((h) => h.activationFrame)).toEqual(uses.map((a) => a.frame).slice(0, landed.length));
    const hits = sim.slots[neon]!.burst.hits;
    expect(hits).toHaveLength(landed.length);
    for (const h of hits) expect(h.baseHit).toBeGreaterThan(0);
  });

  it('gives every SG ally, Neon included, Max Ammo up for 10 s on each Neon burst (C-1521)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(isSg(neon)).toBe(true);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(sim.history, {
        sourceSlotIndex: neon,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'maxAmmo',
      });
      expect(items.map((w) => w.start)).toEqual(isSg(holder) ? starts : []);
      for (const w of items) if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });

  it('gives every ally Crit Rate up from each Full Burst start through the ally’s own 2nd shot (C-1522)', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(sim.history, {
        sourceSlotIndex: neon,
        holder,
        kind: 'timed',
        skill: 'skill2',
        stat: 'critRate',
      });
      expect(items.map((w) => w.start)).toEqual(fullBursts);
      const shots = sim.shots[holder]!.frames;
      for (const w of items) {
        if (w.end >= sim.frames) continue;
        const inside = shots.filter((f) => f >= w.start && f < w.end);
        expect(inside).toEqual(shots.filter((f) => f >= w.start).slice(0, 2));
      }
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
