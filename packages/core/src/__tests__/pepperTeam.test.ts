// ペッパー（131。V-0835）を含む編成で、S1 の最後の弾丸ごとの回復とリフレッシュハート、S2 の CT ごとのダメージ、
// バーストのバーストスキルダメージ・スタック可能バフのスタック量▲・フルスタックのときの回復が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const PEPPER = 131;
const GUILLOTINE_WS = 182;

describe('ペッパーの定義', () => {
  const def = parseSkillDefinition(rawDefinition(PEPPER));

  it('defines the heal and Refresh Heart, the S2 damage, and the Burst damage, stack increase and heal', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['heal', 'state']);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['indirect']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['noDamage']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage', 'stackChange', 'heal']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影 A の編成（ペッパー単騎）': fixedTeam([PEPPER], 0),
  '撮影 B の編成（ペッパー + ギロチン：ウィンタースレイヤー）': fixedTeam([PEPPER, GUILLOTINE_WS], 1),
  '実戦寄り（ペッパー + クラウン + ギロチン：ウィンタースレイヤー + アリス + ユニ）': fixedTeam(
    [PEPPER, 330, GUILLOTINE_WS, 191, 160],
    2,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const pepper = input.slots.findIndex((s) => s?.character.resourceId === PEPPER);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === pepper);
  const lastShots = sim.shots[pepper]!.frames.filter((_, k) => (k + 1) % sim.shots[pepper]!.magazine === 0);

  it('deals the S2 damage every 10 s from 10 s', () => {
    const hits = sim.skillHits.filter((h) => h.slotIndex === pepper && h.effect.source.skill === 'skill2');
    expect(hits.map((h) => h.frame)).toEqual(timerFramesOf({ everySeconds: 10 }, sim.frames));
  });

  it('gives every ally a Refresh Heart stack on each last bullet, capped at 5', () => {
    for (let holder = 0; holder < input.slots.length; holder++) {
      const items = itemsOf(sim.history, { holder, state: 'refreshHeart' });
      expect(items.length).toBeGreaterThan(0);
      expect(Math.max(...items.map((i) => i.stack))).toBe(5);
    }
    const applied = sim.history.applications.filter((a) => a.state === 'refreshHeart' && a.slotIndex === pepper);
    // 射撃の回数のきっかけは次のフレームに付く
    expect(applied.map((a) => a.frame - 1)).toEqual(expect.arrayContaining(lastShots));
  });

  it('adds one stack to stackable buffs on each Burst, and heals all allies only at full Refresh Heart', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(sim.slots[pepper]!.burst.hits).toHaveLength(uses.length);
    const heals = sim.instants.filter(
      (i) => i.sourceSlotIndex === pepper && i.effect.kind === 'heal' && i.effect.source.skill === 'burst',
    );
    const healFrames = new Set(heals.map((h) => h.frame));
    for (const a of uses) {
      const at = a.frame;
      const before = itemsOf(sim.history, { holder: pepper, state: 'refreshHeart' }).filter(
        (i) => i.start < at && at <= i.end,
      ).length;
      expect(healFrames.has(at)).toBe(before === 5);
    }
  });

  const guillotine = input.slots.findIndex((s) => s?.character.resourceId === GUILLOTINE_WS);
  if (guillotine < 0) return;

  it('adds one EXP stack to Guillotine on each Burst below the cap, and none at the cap of 100', () => {
    const exp = itemsOf(sim.history, { holder: guillotine, state: 'exp' });
    const held = (frame: number) => exp.filter((i) => i.start <= frame && frame < i.end).length;
    const below = uses.filter((a) => held(a.frame - 1) < 100);
    const atCap = uses.filter((a) => held(a.frame - 1) === 100);
    expect(below.length).toBeGreaterThan(0);
    expect(atCap.length).toBeGreaterThan(0);
    for (const a of below) expect(exp.some((i) => i.start === a.frame)).toBe(true);
    for (const a of atCap) expect(held(a.frame + 1)).toBe(100);
  });
});

describeEveryShotInOneGroup(TEAMS);
