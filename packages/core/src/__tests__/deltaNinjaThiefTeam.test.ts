// デルタ：ニンジャシーフ（23。V-0886）を含む編成で、S1（フルバーストの始まりの忍法アシッドボム、バースト使用時の攻撃力▲と
// 忍法ハイパーアシッドボム。C-1580）・バースト（味方全体の分配ダメージ▲と発動者基準の攻撃力▲。C-1581。分配ダメージのヒットは
// 発動の印の 3f 後で、同じ発動の burst スロットの▲が乗る。C-1582）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { METRICS } from '../records/observations/metrics/index.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { slotPieces } from './historyHelpers.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  rangeEnemyWithEvents,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const DELTA_NT = 23;
const COCOA = 311;
const RAVEN = 851;
const LITER = 82;
const MODERNIA = 260;
const enemy = rangeEnemyWithEvents({ defence: 100, element: 'Fire' });

const TEAMS: Record<string, TeamInput> = {
  '撮影と同じ編成（ココア + レイヴン + デルタ：ニンジャシーフ（操作））': fixedTeam([COCOA, RAVEN, DELTA_NT], 2, {
    enemy,
  }),
  'リター + デルタ：ニンジャシーフ + モダニア（操作）': fixedTeam([LITER, DELTA_NT, MODERNIA], 2, { enemy }),
};

const ACID = skillValueOf(DELTA_NT, 'skill1', 1) / 100;
const HYPER = skillValueOf(DELTA_NT, 'skill1', 5) / 100;
const DISTRIBUTED = skillValueOf(DELTA_NT, 'burst', 1) / 100;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const sim = runSimulation(input);
  const d = input.slots.findIndex((s) => s?.character.resourceId === DELTA_NT);
  const schedule = sim.schedule!;
  const fullBursts = schedule.fullBurstWindows;
  const deltaBursts = schedule.activations.filter((a) => a.slotIndex === d);
  /** 枠 slot が受ける、デルタの skill の stat の、値 value の小片の始まり */
  const startsOf = (slot: number, skill: string, stat: string, value: number) =>
    slotPieces(sim, slot)
      .filter(
        (p) =>
          p.effect.source.resourceId === DELTA_NT &&
          p.effect.source.skill === skill &&
          p.effect.stat === stat &&
          Math.abs(p.effect.value - value) < 1e-12,
      )
      .map((p) => p.start)
      .sort((a, b) => a - b);

  it('uses the burst five times, each starting a Full Burst', () => {
    expect(deltaBursts.length).toBe(5);
    expect(fullBursts.length).toBe(5);
  });

  it('gives Acid Bomb to every ally for 15 s from each Full Burst start', () => {
    input.slots.forEach((_, i) => {
      expect(startsOf(i, 'skill1', 'damageTaken', ACID)).toEqual(fullBursts.map((w) => w.start));
    });
    const acid = slotPieces(sim, d).filter((p) => p.effect.stat === 'damageTaken' && p.effect.value === ACID);
    expect(acid.map((p) => ({ start: p.start, end: p.end }))).toEqual(
      windowsFrom(
        fullBursts.map((w) => w.start),
        15,
        sim.frames,
      ),
    );
  });

  it('gives the S1 ATK up to Delta only, and Hyper Acid Bomb and the Burst buffs to every ally, 1 frame after the mark', () => {
    // 遅れの表の行（effectFrames 1。C-1582）: 発動の印（II の六角形の替わり目）の 1f 後に付く
    const fired = deltaBursts.map((a) => hexagonFrameOf(a) + 1);
    input.slots.forEach((_, i) => {
      expect(startsOf(i, 'skill1', 'damageTaken', HYPER)).toEqual(fired);
      expect(startsOf(i, 'burst', 'distributedDamage', DISTRIBUTED)).toEqual(fired);
      expect(
        effectWindows(sim, i, { resourceId: DELTA_NT, skill: 'burst', stat: 'attack' }).map((w) => w.start),
      ).toEqual(fired);
      expect(effectWindows(sim, i, { resourceId: DELTA_NT, skill: 'skill1', stat: 'attack' }).length > 0).toBe(i === d);
    });
  });

  it('sums Acid Bomb and Hyper Acid Bomb with the other Damage Taken ups inside the Full Burst', () => {
    for (const w of fullBursts) {
      const segment = sim.slots[d]!.segments.find((s) => s.start <= w.start + 200 && w.start + 200 < s.end)!;
      expect(segment.trigger.buffs.damageTaken).toBeCloseTo(ACID + HYPER, 12);
    }
  });

  it('lands the distributed damage 3 frames after the mark, with the Burst buffs of the same activation (C-1582)', () => {
    for (const a of deltaBursts) expect(hitFrameOf(a) - hexagonFrameOf(a)).toBe(3);
    // 同じ発動の▲を乗せない形（遅れの表の行を外す）と比べる: 分配ダメージ▲（1 + 0.2）と発動者基準の攻撃力▲のぶん大きい。攻撃力▲の効きは、
    // 発動の直前にほかの攻撃力▲があると小さくなる（▲は加算）ので、15% 以下
    const withoutRow: TeamInput = {
      ...input,
      slots: input.slots.map((s): TeamSlotInput | null =>
        s?.character.resourceId === DELTA_NT
          ? { ...s, character: { ...s.character, burstDelayOverride: { row: null } } }
          : s,
      ),
    };
    const hit = (x: TeamInput) =>
      METRICS.burstHitDamage!.sim(runSimulation(x), { args: { slot: d + 1, n: 0, crit: false }, input: x }) as number;
    const ratio = hit(input) / hit(withoutRow);
    expect(ratio).toBeGreaterThan(1 + DISTRIBUTED);
    expect(ratio).toBeLessThan((1 + DISTRIBUTED) * 1.151);
  });
});

describeEveryShotInOneGroup(TEAMS);
