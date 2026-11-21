// スノーホワイト：イノセントデイズ編（plan/design-snow-white-id.md）: 224 を含む編成で、S1 の命中 30 回ごとの 2 ヒット、S2 の命中 50 回
// （バーストの窓の間は 30 回）ごとの 35 ヒット、バーストの攻撃力▲・装弾数無限の窓が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { cycleItemsOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const SNOW_WHITE_ID = 224;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const CASES: Record<string, { input: TeamInput; slot: number }> = {
  '撮影 A（単騎）': { input: fixedTeam([fixedSlot(SNOW_WHITE_ID)], 0, { enemy: rangeEnemy }), slot: 0 },
  '撮影 B（ココア + ソルジャーF.A. + スノーホワイト：イノセントデイズ）': {
    input: fixedTeam([311, 301, SNOW_WHITE_ID], 2, { enemy: rangeEnemy }),
    slot: 2,
  },
  '実戦寄り（リター + クラウン + スノーホワイト：イノセントデイズ + 紅蓮 + ソルジャーE.G.）': {
    input: fixedTeam([82, 330, SNOW_WHITE_ID, 222, 300], 2),
    slot: 2,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, slot: S }) => {
  const plan = planTeamRun(input);
  const log = plan.shots[S]!;
  /** フレーム f の発までの、戦闘の始めからの命中の期待値の和（同じフレームの発を含む） */
  const hitsUpTo = (f: number) =>
    log.frames.reduce((sum, frame, k) => (frame <= f ? sum + (log.hits?.[k] ?? 1) : sum), 0);
  const hitsBefore = (f: number) =>
    log.frames.reduce((sum, frame, k) => (frame < f ? sum + (log.hits?.[k] ?? 1) : sum), 0);
  /** きっかけの発で、命中の回数が N の倍数を越えたか */
  const crosses = (f: number, n: number) => Math.floor(hitsUpTo(f) / n) > Math.floor(hitsBefore(f) / n);
  const hitsOf = (skill: string) =>
    plan.skillHits
      .filter((h) => h.slotIndex === S && h.effect.source.skill === skill)
      .map((h) => h.frame)
      .sort((a, b) => a - b);
  const windows = cycleItemsOf(plan).filter((w) => w.slotIndex === S);
  const inWindow = (f: number) => windows.some((w) => w.start <= f && f < w.end);
  /** 命中の回数が every(f) の倍数を越えた発の delay 後から、offsets のフレームに出るヒット（戦闘の終わりより後は出ない） */
  const expectedHits = (every: (f: number) => number, delay: number, offsets: readonly number[]) =>
    log.frames
      .filter((f) => crosses(f, every(f)))
      .flatMap((f) => offsets.map((o) => f + delay + o))
      .filter((f) => f < plan.frames)
      .sort((a, b) => a - b);

  it('fires S1 as 2 hits 11 frames apart, 36 frames after every 30th hit', () => {
    const hits = hitsOf('skill1');
    expect(hits.length).toBeGreaterThan(20);
    expect(hits).toEqual(expectedHits(() => 30, 36, [0, 11]));
  });

  it('fires S2 as 35 hits over 100 frames, 20 frames after every 50th hit (30th inside the Burst windows)', () => {
    const offsets = plan.skillHits.find((h) => h.slotIndex === S && h.effect.source.skill === 'skill2')!.effect
      .hitOffsets!;
    expect(offsets).toHaveLength(35);
    expect(offsets.at(-1)).toBe(100);
    const hits = hitsOf('skill2');
    expect(hits.length).toBeGreaterThan(35 * 5);
    expect(hits).toEqual(expectedHits((f) => (inWindow(f) ? 30 : 50), 20, offsets));
  });

  it('gives herself attack and infinite ammo for 10 seconds on every own Burst use', () => {
    const uses = (plan.schedule?.activations ?? []).filter((a) => a.slotIndex === S).map(effectFrameOf);
    for (const stat of ['attack', 'infiniteAmmo'] as const) {
      const own = itemsOf(plan.history, { sourceSlotIndex: S, holder: S, kind: 'timed', skill: 'burst', stat });
      expect(own.map((w) => w.start)).toEqual(uses);
      // 戦闘の終わりで切れる窓のほかは 10 秒
      for (const w of own) expect(w.end === plan.frames || w.end - w.start === 588).toBe(true);
    }
    expect(windows.map((w) => w.start)).toEqual(uses);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(CASES).map(([n, c]) => [n, c.input])));
