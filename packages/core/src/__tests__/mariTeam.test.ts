// マリ（832。V-0842）を含む編成で、S1 のコア命中ごとの貫通ダメージ▲（貫通特化の発にだけ乗る）、S2 の CT ごとの貫通特化・攻撃力▲、
// バーストのバーストスキルダメージ（II の六角形の替わり目の 69f 後）・味方全体の攻撃ダメージ▲が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { effectFrameOf, hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { timerFramesOf } from '../skills/timeline.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition, type RawDefinition } from './data.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MARI = 832;
const COCOA = 311;
const RED_HOOD = 16;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number, options: Parameters<typeof fixedSlot>[1] = {}): TeamSlotInput =>
  fixedSlot(id, { conditionMode: 'auto', ...options });

describe('マリの定義', () => {
  const def = parseSkillDefinition(rawDefinition(MARI));

  it('defines the pierce damage up, the S2 cooldown buffs and the burst, and leaves the shield damage up as a note', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'timed', trigger: { count: 'coreHit' }, target: 'allies', stat: 'pierceDamage' },
    ]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      { kind: 'timed', target: 'self', stat: 'pierce' },
      { kind: 'timed', target: 'self', stat: 'attack' },
      { kind: 'timed', target: 'allies', stat: 'attack', scaling: 'casterAttack' },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage' },
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'attackDamage' },
    ]);
  });
});

/** S1 の貫通ダメージ▲を外した定義のマリの枠 */
function withoutPierceDamage(slot: TeamSlotInput): TeamSlotInput {
  const raw = structuredClone(rawDefinition<RawDefinition>(MARI));
  raw.skills.skill1!.effects.splice(0, 1);
  return fixedSlot(MARI, { definition: raw, conditionMode: slot.conditionMode });
}

/** 編成とマリの枠と、貫通特化の付かない枠 */
const CASES: Record<string, { input: TeamInput; mari: number; noPierce: number[] }> = {
  '撮影の編成（ココア + マリ（操作）。V-0842）': {
    input: fixedTeam([autoSlot(COCOA), autoSlot(MARI)], 1, { enemy: rangeEnemy }),
    mari: 1,
    noPierce: [0],
  },
  '実戦寄り（リター + マリ + ラピ：レッドフード + アリス + マクスウェル）': {
    input: fixedTeam([82, MARI, RED_HOOD, 191, 102], 2),
    mari: 1,
    noPierce: [0],
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, mari, noPierce }) => {
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === mari);
  // CT の周期の発動のフレームの次のフレームから付く
  const s2Starts = timerFramesOf({ everySeconds: 10 }, sim.frames).map((f) => f + 1);
  const pierce = itemsOf(sim.history, { holder: mari, kind: 'timed', skill: 'skill2', stat: 'pierce' });

  it('gives Mari Pierce and ATK up, and every ally caster-based ATK up, every 10 s from 10 s for 5 s (C-1481)', () => {
    expect(pierce.map((w) => w.start)).toEqual(s2Starts);
    for (const w of pierce) if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
    for (const holder of input.slots.keys()) {
      const atk = itemsOf(sim.history, {
        sourceSlotIndex: mari,
        holder,
        kind: 'timed',
        skill: 'skill2',
        stat: 'attack',
      });
      // マリには自分への▲と発動者基準の▲の 2 つ、ほかの味方には発動者基準の▲だけ
      expect(atk).toHaveLength(s2Starts.length * (holder === mari ? 2 : 1));
    }
  });

  it('adds S1 pierce damage up only to shots with Pierce, which here are Mari during S2 (C-1482)', () => {
    const plain = runSimulation({
      ...input,
      slots: input.slots.map((s, i) => (i === mari ? withoutPierceDamage(s!) : s)),
    });
    // 貫通特化の付かない味方の発は変わらない
    for (const i of noPierce) expect(sim.slots[i]!.normalDamage).toBeCloseTo(plain.slots[i]!.normalDamage, 3);
    // マリの発は、貫通特化の窓に掛かる区間でだけ上がる
    const segments = sim.slots[mari]!.segments;
    const outside = (s: (typeof segments)[number]) => !pierce.some((w) => w.start < s.end && s.start < w.end);
    const sumOutside = (list: typeof segments) => list.filter(outside).reduce((a, s) => a + s.damage, 0);
    expect(sumOutside(segments)).toBeCloseTo(sumOutside(plain.slots[mari]!.segments), 3);
    expect(sim.slots[mari]!.normalDamage).toBeGreaterThan(plain.slots[mari]!.normalDamage);
  });

  it('hits once 69 f after the hexagon on each Burst and gives every ally Attack Damage up for 10 s (C-1483)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(burstDelaysOf(characterOf(MARI))).toEqual({ hitFrames: 69, effectFrames: 0 });
    expect(sim.slots[mari]!.burst.hits).toHaveLength(uses.length);
    for (const a of uses) expect(hitFramesOf(a)).toEqual([hexagonFrameOf(a) + 69]);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(sim.history, {
        sourceSlotIndex: mari,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'attackDamage',
      });
      expect(items.map((w) => w.start)).toEqual(uses.map((a) => effectFrameOf(a)).filter((f) => f < sim.frames));
      for (const w of items) if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
