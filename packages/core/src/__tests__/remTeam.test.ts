// レム（820。V-0844）を含む編成で、バーストの鬼の気（クリティカル確率▲）・RL の味方への発動者基準の攻撃力▲と最大装弾数▲、
// S1 の鬼の気の間の攻撃力▲のスタックが意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const REM = 820;
const FLOWER = 304;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

describe('レムの定義', () => {
  const def = parseSkillDefinition(rawDefinition(REM));

  it('defines the S1 stacks in Demon’s Breath and the Burst buffs, and leaves the heals as notes', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'timed', trigger: { count: 'normalHit' }, target: 'self', stat: 'attack' },
    ]);
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('noEffect');
    expect(def.skills.skill2.notes?.map((n) => n.kind)).toEqual(['noDamage', 'outOfScope']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'state', state: 'demonsBreath', target: 'self' },
      { kind: 'timed', target: 'allies', targetWeapon: 'RL', stat: 'attack', scaling: 'casterAttack' },
      { kind: 'timed', target: 'allies', targetWeapon: 'RL', stat: 'maxAmmo', scaling: 'flat' },
    ]);
  });
});

/** 編成と、レムの枠と、RL の枠と、マガジンを見るフラワーの枠 */
const CASES: Record<string, { input: TeamInput; rem: number; rl: number[]; flower?: number }> = {
  '撮影の編成（I-DOLL・フラワー + レム（操作）。V-0844）': {
    input: fixedTeam([FLOWER, REM], 1, { enemy: rangeEnemy }),
    rem: 1,
    rl: [0],
    flower: 0,
  },
  '実戦寄り（ジャッカル + レム + エミリア + A2 + アニス：スター）': {
    input: fixedTeam([111, REM, 821, 811, 17], 2),
    rem: 1,
    rl: [0, 2, 3, 4],
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, rem, rl, flower }) => {
  const sim = runSimulation(input);
  const uses = sim.schedule!.activations.filter((a) => a.slotIndex === rem);
  const starts = uses.map((a) => effectFrameOf(a)).filter((f) => f < sim.frames);
  const breath = itemsOf(sim.history, { holder: rem, state: 'demonsBreath' });

  it('gives Rem Demon’s Breath for 10 s on each Burst (C-1489)', () => {
    expect(uses.length).toBeGreaterThan(2);
    expect(breath.map((w) => w.start)).toEqual(starts);
    for (const w of breath) if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });

  it('gives only allies with rocket launchers the caster-based ATK up and Max Ammo up for 10 s (C-1487, C-1488)', () => {
    for (const holder of input.slots.keys()) {
      for (const stat of ['attack', 'maxAmmo'] as const) {
        const items = itemsOf(sim.history, { sourceSlotIndex: rem, holder, kind: 'timed', skill: 'burst', stat });
        expect(items.map((w) => w.start)).toEqual(rl.includes(holder) ? starts : []);
      }
    }
  });

  it.runIf(flower !== undefined)(
    'lets Flower reload up to 11 rounds in the window, and clips it back to 6 after (C-1488)',
    () => {
      const log = sim.shots[flower!]!;
      let first = 0;
      const magazines = (log.lastShotFrames ?? []).map((end) => {
        const last = log.frames.indexOf(end);
        const n = last - first + 1;
        first = last + 1;
        return n;
      });
      expect(Math.max(...magazines)).toBe(11);
      expect(magazines.filter((n) => n !== 6).length).toBeGreaterThan(0);
    },
  );

  it('stacks the S1 ATK up only while Rem is in Demon’s Breath, up to 30 (C-1490)', () => {
    const stacks = itemsOf(sim.history, { holder: rem, kind: 'timed', skill: 'skill1', stat: 'attack' });
    expect(stacks.length).toBeGreaterThan(0);
    for (const s of stacks) expect(breath.some((w) => w.start <= s.start && s.start <= w.end)).toBe(true);
    const top = Math.max(...stacks.map((s) => s.stack ?? 1));
    expect(top).toBeGreaterThan(10);
    expect(top).toBeLessThanOrEqual(30);
  });
});

describeEveryShotInOneGroup(TEAMS);
