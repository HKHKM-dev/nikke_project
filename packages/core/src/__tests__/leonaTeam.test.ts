// レオナ編（plan/design-leona.md）: レオナ（382）を含む編成で、S1 の咆哮（通常攻撃 5 回ごとに味方全体へ 1 スタック・5 スタック）と
// 適正最大射程距離▲（15 回ごとに SG の味方へ。中近に距離ボーナスが乗る）、S2 のペレット数▲（フルバーストの開始で SG の上位 2 機）、
// バーストの会心率▲（咆哮がフルスタックの時だけ SG の味方へ）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { landingPartsWith } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { hitRateNOf, rangeUpOf } from '../skills/buffs.ts';
import { itemsOf } from '../skills/holders.ts';
import { runSimulation } from '../sim/engine.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents, skillValueOf } from './teamHelpers.ts';

const LEONA = 382;
const LUDMILLA = 190;
const ANIS_SS = 15;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
// S1 の回数（5 回・15 回）と咆哮の最大スタック数
const ROAR_EVERY = skillValueOf(LEONA, 'skill1', 1);
const ROAR_MAX = skillValueOf(LEONA, 'skill1', 3);
const RANGE_EVERY = skillValueOf(LEONA, 'skill1', 5);
const RANGE_UP = skillValueOf(LEONA, 'skill1', 6) / 100;
const PELLET_TARGETS = skillValueOf(LEONA, 'skill2', 3);

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const SHOOT = team([LUDMILLA, LEONA, ANIS_SS], 1);
const TEAMS: Record<string, TeamInput> = {
  'ルドミラ + レオナ + アニス：スパークリングサマー（撮影の編成）': SHOOT,
  // SG が 4 体（ソリン：フロストチケット・レオナ・アニス：SS・ノワール）。ペレット数▲は上位 2 機にだけ付く
  '実戦寄り（ソリン：フロストチケット + レオナ + アニス：SS + ノワール + ルドミラ）': team(
    [74, LEONA, ANIS_SS, 271, LUDMILLA],
    1,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const me = input.slots.findIndex((x) => x?.character.resourceId === LEONA);
  const sg = input.slots.flatMap((x, i) => (x?.character.weaponType === 'SG' ? [i] : []));
  const plan = planTeamRun(input);
  const shots = plan.shots[me]!.frames;
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: me, ...filter });
  /** 自分の k 発目（1 始まり）のフレーム */
  const nth = (k: number) => shots[k - 1]!;

  it('adds a Roar stack to every ally from the frame after each 5th normal attack, up to 5 stacks', () => {
    const roar = items({ kind: 'state', state: 'roar' });
    expect(new Set(roar.map((w) => w.holder))).toEqual(new Set(input.slots.map((_, i) => i)));
    const mine = roar.filter((w) => w.holder === me);
    expect(Math.max(...mine.map((w) => w.stack ?? 1))).toBe(ROAR_MAX);
    // 段の始まりは、5 の倍数の発の次のフレーム
    const fifths = new Set(shots.filter((_, k) => (k + 1) % ROAR_EVERY === 0).map((f) => f + 1));
    for (const w of mine) expect(fifths.has(w.start), `stack ${w.stack} at ${w.start}`).toBe(true);
    expect(mine[0]!.start).toBe(nth(ROAR_EVERY) + 1);
  });

  it('gives Max Effective Range up only to SG allies, from the frame after each 15th normal attack', () => {
    const range = items({ kind: 'timed', skill: 'skill1', stat: 'maxEffectiveRange' });
    expect(new Set(range.map((w) => w.holder))).toEqual(new Set(sg));
    const fifteenths = new Set(shots.filter((_, k) => (k + 1) % RANGE_EVERY === 0).map((f) => f + 1));
    for (const w of range) expect(fifteenths.has(w.start)).toBe(true);
    expect(Math.min(...range.map((w) => w.start))).toBe(nth(RANGE_EVERY) + 1);
  });

  it('gives Pellet count up to the top 2 SG allies for 10 s at each Full Burst start', () => {
    const pellets = items({ kind: 'timed', skill: 'skill2', stat: 'pelletCount' });
    expect(pellets.length).toBeGreaterThan(0);
    const starts = [...new Set(pellets.map((w) => w.start))];
    for (const start of starts) {
      const holders = pellets.filter((w) => w.start === start).map((w) => w.holder);
      expect(holders).toHaveLength(Math.min(PELLET_TARGETS, sg.length));
      for (const h of holders) expect(sg).toContain(h);
    }
    for (const w of pellets) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    // ▲の間の発は 15 個で数える（10 個では当たった数の期待値が 10 を超えない）
    for (const h of new Set(pellets.map((w) => w.holder))) {
      const log = plan.shots[h]!;
      const during = log.frames.flatMap((f, k) =>
        pellets.some((w) => w.holder === h && w.start <= f && f < w.end) ? [log.pelletHits![k]!] : [],
      );
      expect(Math.max(...during)).toBeGreaterThan(10);
    }
  });

  it('gives the Burst Crit Rate up to SG allies only when Roar is at max stacks at the Burst use', () => {
    const uses = items({ kind: 'timed', skill: 'burst', stat: 'critDamage', holder: me }).map((w) => w.start);
    expect(uses.length).toBeGreaterThan(3);
    const crit = items({ kind: 'timed', skill: 'burst', stat: 'critRate' });
    const full = (frame: number) =>
      items({ kind: 'state', state: 'roar', holder: me }).some(
        (w) => w.stack === ROAR_MAX && w.start < frame && frame < w.end,
      );
    let withCrit = 0;
    for (const f of uses) {
      const at = crit.filter((w) => w.start === f);
      if (full(f)) {
        withCrit += 1;
        expect(new Set(at.map((w) => w.holder))).toEqual(new Set(sg));
      } else expect(at).toEqual([]);
    }
    expect(withCrit).toBeGreaterThan(0);
  });
});

describe('適正最大射程距離▲ と中近の距離ボーナス（撮影の編成）', () => {
  const sim = runSimulation(SHOOT);
  const plan = planTeamRun(SHOOT);
  const slots = applyTreasureToTeam(SHOOT).slots;
  const shotsOf = (i: number) => plan.shots[i]!.frames;
  const segmentAt = (frame: number) => sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!;
  const bonusAt = (i: number, frame: number) => {
    const seg = segmentAt(frame);
    const buffs = seg.slots[i]!.buffs;
    return landingPartsWith(plan.landing, slots[i]!, i, seg.landing, hitRateNOf(buffs), rangeUpOf(buffs)).map(
      (p) => p.condition.distanceBonus,
    );
  };

  it('starts at the mid-near landing without the range bonus for SG, and puts it on after the 15th Leona shot', () => {
    for (const i of [1, 2]) {
      const shots = shotsOf(i);
      expect(segmentAt(shots[0]!).landing).toBe('midNear');
      expect(bonusAt(i, shots[0]!)).toEqual([false]);
      const after = shots.find((f) => f > shotsOf(1)[RANGE_EVERY - 1]! && segmentAt(f).landing === 'midNear')!;
      expect(segmentAt(after).slots[i]!.buffs.maxEffectiveRange).toBeCloseTo(RANGE_UP, 12);
      expect(bonusAt(i, after)).toEqual([true]);
    }
  });

  it('keeps the SMG ally out of the SG range up', () => {
    for (const s of sim.timeline.segments) expect(s.slots[0]!.buffs.maxEffectiveRange).toBe(0);
  });

  it('does not reach the mid-far landings (33 and beyond) with the 30 upper end', () => {
    const shots = shotsOf(1);
    const midFar = shots.filter(
      (f) => segmentAt(f).landing === 'midFar' && segmentAt(f).slots[1]!.buffs.maxEffectiveRange > 0,
    );
    expect(midFar.length).toBeGreaterThan(0);
    for (const f of midFar) expect(bonusAt(1, f).every((b) => !b)).toBe(true);
  });
});
