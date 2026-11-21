// ソーダ（312。V-0838）を含む編成で、S1 のメイド精神、S2 の CT ごとの回復とフルスタックのときの追加の回復、
// バーストのバーストスキルダメージ・灼熱コードの味方へのスタック可能バフのスタック量▲が意図どおりに出るか
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

const SODA = 312;
const GUILLOTINE_WS = 182;

describe('ソーダの定義', () => {
  const def = parseSkillDefinition(rawDefinition(SODA));

  it('defines Maid Spirit, the S2 heals, and the Burst damage and stack increase for Fire Code allies', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['state']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual(['heal', 'heal']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage', 'stackChange']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['noDamage']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ソーダ + ギロチン：ウィンタースレイヤー）': fixedTeam([SODA, GUILLOTINE_WS], 1),
  '実戦寄り（ソーダ + クラウン + モダニア + ギロチン：ウィンタースレイヤー + ユニ）': fixedTeam(
    [SODA, 330, 260, GUILLOTINE_WS, 160],
    2,
  ),
};

/** バーストのスタック量▲を外した定義のソーダで、同じ編成を回す */
function withoutStackChange(input: TeamInput) {
  const raw = structuredClone(rawDefinition<RawDefinition>(SODA));
  raw.skills.burst!.effects.splice(1, 1);
  const slots = input.slots.map((s) => (s?.character.resourceId === SODA ? fixedSlot(SODA, { definition: raw }) : s));
  return runSimulation({ ...input, slots });
}

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const soda = input.slots.findIndex((s) => s?.character.resourceId === SODA);
  const guillotine = input.slots.findIndex((s) => s?.character.resourceId === GUILLOTINE_WS);
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === soda);
  const maid = itemsOf(sim.history, { holder: soda, state: 'maidSpirit' });
  const maidHeld = (frame: number) => maid.filter((i) => i.start <= frame && frame < i.end).length;

  it('gives Soda a Maid Spirit stack every 180 normal shots, reaching the cap of 5', () => {
    const applied = sim.history.applications.filter((a) => a.state === 'maidSpirit' && a.slotIndex === soda);
    expect(applied.length).toBeGreaterThan(5);
    expect(Math.max(...maid.map((i) => i.stack ?? 1))).toBe(5);
  });

  it('heals all allies every 12 s from 12 s, and again only at full Maid Spirit (C-1471)', () => {
    // ソーダ自身が受けた回復（味方ごとに 1 件ずつ記録される）
    const heals = sim.instants.filter(
      (i) =>
        i.sourceSlotIndex === soda &&
        i.slotIndex === soda &&
        i.effect.kind === 'heal' &&
        i.effect.source.skill === 'skill2',
    );
    const starts = timerFramesOf({ everySeconds: 12 }, sim.frames);
    expect([...new Set(heals.map((h) => h.frame))]).toEqual(starts);
    const full = starts.filter((f) => maidHeld(f) === 5);
    expect(full.length).toBeGreaterThan(0);
    expect(full.length).toBeLessThan(starts.length);
    for (const f of starts) expect(heals.filter((h) => h.frame === f)).toHaveLength(maidHeld(f) === 5 ? 2 : 1);
  });

  it('hits once 65 f after the hexagon on each Burst (C-1472)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(sim.slots[soda]!.burst.hits).toHaveLength(uses.length);
    expect(burstDelaysOf(characterOf(SODA))).toEqual({ hitFrames: 65, effectFrames: 0 });
    for (const a of uses) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 65]);
  });

  it('adds one Maid Spirit stack to Soda (Fire) on the first Burst, and no EXP stack to Guillotine (Water) (C-1473)', () => {
    const first = uses[0]!;
    const plain = withoutStackChange(input).history;
    const plainMaid = itemsOf(plain, { holder: soda, state: 'maidSpirit' });
    const before = maidHeld(first.frame - 1);
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(5);
    expect(maidHeld(first.frame) - plainMaid.filter((i) => i.start <= first.frame && first.frame < i.end).length).toBe(
      1,
    );
    const held = (items: ReturnType<typeof itemsOf>, frame: number) =>
      items.filter((i) => i.start <= frame && frame < i.end).length;
    const exp = itemsOf(sim.history, { holder: guillotine, state: 'exp' });
    const plainExp = itemsOf(plain, { holder: guillotine, state: 'exp' });
    expect(held(exp, first.frame - 1)).toBeLessThan(100);
    expect(held(exp, first.frame)).toBe(held(plainExp, first.frame));
  });
});

describeEveryShotInOneGroup(TEAMS);
