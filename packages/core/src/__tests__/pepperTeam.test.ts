// ペッパー（131。V-0835）を含む編成で、S1 の最後の弾丸ごとの回復とリフレッシュハート、S2 の CT ごとのダメージ、
// バーストのバーストスキルダメージ・スタック可能バフのスタック量▲・フルスタックのときの回復が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition, type RawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam } from './teamHelpers.ts';

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
  const lastShots = sim.shots[pepper]!.lastShotFrames ?? [];

  it('deals the S2 damage 7 f after each activation every 10 s from 10 s (C-1462)', () => {
    const hits = sim.skillHits.filter((h) => h.slotIndex === pepper && h.effect.source.skill === 'skill2');
    const starts = timerFramesOf({ everySeconds: 10 }, sim.frames).filter((f) => f + 7 < sim.frames);
    expect(hits.map((h) => h.frame)).toEqual(starts.map((f) => f + 7));
  });

  it('gives every ally a Refresh Heart stack on each last bullet, capped at 5', () => {
    for (let holder = 0; holder < input.slots.length; holder++) {
      const items = itemsOf(sim.history, { holder, state: 'refreshHeart' });
      expect(items.length).toBeGreaterThan(0);
      expect(Math.max(...items.map((i) => i.stack ?? 1))).toBe(5);
    }
    const applied = sim.history.applications.filter((a) => a.state === 'refreshHeart' && a.slotIndex === pepper);
    // 射撃の回数のきっかけは次のフレームに付く
    expect(lastShots.length).toBeGreaterThan(2);
    expect(applied.map((a) => a.frame - 1)).toEqual(expect.arrayContaining(lastShots));
  });

  it('adds one stack to stackable buffs on each Burst, and heals all allies only at full Refresh Heart', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(sim.slots[pepper]!.burst.hits).toHaveLength(uses.length);
    // 六角形の替わり目からヒットまで 84f、効果は遅れ 0（C-1463・C-1464）
    expect(burstDelaysOf(characterOf(PEPPER))).toEqual({ hitFrames: 84, effectFrames: 0 });
    for (const a of uses) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 84]);
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
    // 1 回目のバーストまでは、スタック量▲を外した定義の編成と同じに進むので、バーストのフレームの段の差がスタック量▲の分
    const raw = structuredClone(rawDefinition<RawDefinition>(PEPPER));
    raw.skills.burst!.effects.splice(1, 1);
    const slots = input.slots.map((s) =>
      s?.character.resourceId === PEPPER ? fixedSlot(PEPPER, { definition: raw }) : s,
    );
    const plain = itemsOf(runSimulation({ ...input, slots }).history, { holder: guillotine, state: 'exp' });
    const first = uses[0]!;
    expect(below[0]).toBe(first);
    const heldPlain = plain.filter((i) => i.start <= first.frame && first.frame < i.end).length;
    expect(held(first.frame) - heldPlain).toBe(1);
    for (const a of atCap) expect(held(a.frame + 1)).toBe(100);
  });
});

describeEveryShotInOneGroup(TEAMS);
