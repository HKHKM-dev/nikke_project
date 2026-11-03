// ナユタ編（plan/design-nayuta.md）: ナユタ（223）を含む編成で、S2 の記憶吸収（3 秒ごとのスタック）とスタック量別の効果、S1 の
// 「記憶吸収が適用される時」の味方全体の▲、バーストの攻撃ダメージ▲が意図どおりに出るか。記憶燃焼（使用武器変更）は撮影で値を読むまで
// 定義に入れない（設計書 2.6 節）ので、語彙（weaponChange の state・チャージ武器への変更）は仮の値の定義で別に確かめる
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { appliedFrames, timerFrames } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rawDefinition } from './teamHelpers.ts';

const NAYUTA = 223;
const LITER = 82;
const ALICE = 191;
const CROWN = 330;
const DELTA = 20;

const TEAMS: Record<string, { input: TeamInput; nayuta: number }> = {
  ナユタ単騎: { input: fixedTeam([NAYUTA], 0), nayuta: 0 },
  'リター・ナユタ・アリス': { input: fixedTeam([LITER, NAYUTA, ALICE], 1), nayuta: 1 },
  '実戦寄り（リター・クラウン・アリス・ナユタ・デルタ）': {
    input: fixedTeam([LITER, CROWN, ALICE, NAYUTA, DELTA], 2),
    nayuta: 3,
  },
};

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([name, t]) => [name, t.input])));

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, nayuta }) => {
  const plan = planTeamRun(input);
  const ticks = timerFrames(3, plan.history.frames);
  const slots = input.slots.map((_, i) => i);

  it('stacks Memory Absorption every 3 s from the start of battle, up to 30', () => {
    const stacks = itemsOf(plan.history, { holder: nayuta, state: 'memoryAbsorption' });
    expect(stacks.map((i) => i.start)).toEqual(ticks.slice(0, 30));
    expect(stacks.every((i) => i.end === plan.history.frames)).toBe(true);
  });

  it('applies Memory Absorption on every tick, after the cap too', () => {
    expect(appliedFrames(plan.history, 'memoryAbsorption', nayuta)).toEqual(ticks);
  });

  it('gives the S2 stage effects from 2, 10 and 30 stacks to the end of battle', () => {
    const fromStacks = (stat: 'attack' | 'attackDamage' | 'coreDamage') =>
      itemsOf(plan.history, { holder: nayuta, sourceSlotIndex: nayuta, skill: 'skill2', stat }).filter(
        (i) => i.origin.kind !== 'state',
      );
    for (const [stat, stacks] of [
      ['attack', 2],
      ['attackDamage', 10],
      ['coreDamage', 30],
    ] as const) {
      const items = fromStacks(stat);
      expect(items.length).toBeGreaterThan(0);
      expect(Math.min(...items.map((i) => i.start))).toBeGreaterThanOrEqual(ticks[stacks - 1]!);
      expect(Math.min(...items.map((i) => i.start))).toBeLessThanOrEqual(ticks[stacks - 1]! + 1);
      expect(Math.max(...items.map((i) => i.end))).toBe(plan.history.frames);
    }
  });

  it('gives every ally the S1 core damage and ATK ups on each Memory Absorption, lasting 5 s', () => {
    const fiveSeconds = gameSecondsToFrames(5);
    for (const holder of slots) {
      for (const stat of ['coreDamage', 'attack'] as const) {
        const items = itemsOf(plan.history, { holder, sourceSlotIndex: nayuta, skill: 'skill1', kind: 'timed', stat });
        expect(items.length).toBeGreaterThan(0);
        // 3 秒ごとに付き直すので、最初の付与から戦闘の終わりまで途切れない
        expect(items[0]!.start).toBe(ticks[0]);
        for (const f of ticks) expect(items.some((i) => i.start <= f && f < i.end + 1)).toBe(true);
        for (const i of items)
          expect(i.end).toBeLessThanOrEqual(Math.min(plan.history.frames, i.start + fiveSeconds * 60));
      }
    }
  });

  it('gives every ally the burst Attack Damage up only when Nayuta uses the Burst', () => {
    const uses = plan.schedule?.activations.filter((a) => a.slotIndex === nayuta) ?? [];
    for (const holder of slots) {
      const items = itemsOf(plan.history, { holder, sourceSlotIndex: nayuta, skill: 'burst', stat: 'attackDamage' });
      expect(items.length > 0).toBe(uses.length > 0);
    }
    if (input.slots.length === 1) expect(uses).toEqual([]);
  });
});

// 語彙の確かめ（plan/design-nayuta.md 2.5・2.6 節）: 記憶燃焼を仮の値（レート・解放はテストの値で、撮影で読んだものではない）で定義し、
// S1 の「記憶燃焼状態なら」のフルチャージの倍率ダメージを足すと、変更の窓の間の発だけがフルチャージになり、ダメージがそこにだけ出る
describe('記憶燃焼の語彙（仮の値の定義）', () => {
  type Raw = { skills: Record<'skill1' | 'burst', { effects: unknown[] }> };
  const raw = structuredClone(rawDefinition<Raw>(NAYUTA));
  raw.skills.burst.effects.push({
    kind: 'weaponChange',
    trigger: 'burstUse',
    state: 'memoryIncineration',
    damageRef: 3,
    chargeTimeSeconds: 1.8,
    fullChargeDamage: 250,
    durationRef: 4,
    rateOfFire: 60,
    infiniteAmmo: true,
  });
  raw.skills.skill1.effects.push({
    kind: 'damage',
    trigger: { count: 'fullChargeShot' },
    condition: { selfState: 'memoryIncineration' },
    ref: 7,
    damageType: 'skill',
  });
  const input = fixedTeam([LITER, NAYUTA, ALICE], 1);
  input.slots[1] = fixedSlot(NAYUTA, raw);
  const plan = planTeamRun(input);
  const weapon = itemsOf(plan.history, { holder: 1, kind: 'timed', stat: 'weapon' });
  const incineration = itemsOf(plan.history, { holder: 1, state: 'memoryIncineration' });
  const inside = (f: number) => weapon.some((w) => w.start <= f && f < w.end);

  it('changes the weapon at least once', () => {
    expect(weapon.length).toBeGreaterThan(0);
  });

  // 付与（burstUse の state）は発火のフレームから、使用武器の変更（burstUse の timed）は次のフレームから（レッドフードのレッドウルフと
  // 同じ）。前の 1 フレームは基礎の武器（SMG）の発で、フルチャージに数えないので S1 は出ない
  it('holds Memory Incineration over the weapon change windows, from one frame earlier', () => {
    expect(incineration.map((i) => [i.start + 1, i.end])).toEqual(weapon.map((w) => [w.start, w.end]));
  });

  it('fires the S1 damage only on full-charge shots of the changed weapon', () => {
    const shots = plan.shots[1]!;
    const changed = shots.weaponChangeShotFrames ?? [];
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every(inside)).toBe(true);
    // 変更後の武器はチャージ武器（1.8 秒）なので、SMG のレートより間が空く
    expect(changed[1]! - changed[0]!).toBeGreaterThanOrEqual(gameSecondsToFrames(1.8));
    const hits = plan.skillHits.filter((h) => h.slotIndex === 1 && h.effect.source.skill === 'skill1');
    expect(hits.length).toBe(changed.length);
    expect(hits.every((h) => inside(h.frame))).toBe(true);
  });
});
