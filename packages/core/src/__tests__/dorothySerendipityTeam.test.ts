// ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md）: ドロシー：セレンディピティ（234）を含む編成で、S1 のペレットの命中 80 回ごとの
// 3 発（貫通特化・命中率▲・攻撃ダメージ▲・ペレットの数を 1 個に固定）、その発のペレットの命中の量とゲージ（1 個）、バーストのペレット数▲
// （15 個で数える）と、固定が▲に勝つことが意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const DOROTHY_S = 234;
const FLOWER = 304;
const DELTA = 20;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Water',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number, burst: boolean): TeamInput => ({
  slots: ids.map(autoSlot),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'ドロシー：セレンディピティ単騎（撮影 A の編成）': team([DOROTHY_S], 0, false),
  'I-DOLL・フラワー + デルタ + ドロシー：セレンディピティ（撮影 B の編成）': team([FLOWER, DELTA, DOROTHY_S], 2, true),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const me = input.slots.findIndex((s) => s?.character.resourceId === DOROTHY_S);
  const plan = planTeamRun(input);
  const log = plan.shots[me]!;
  const shots = log.frames;
  const windows = (skill: string, stat: string) =>
    itemsOf(plan.history, { sourceSlotIndex: me, holder: me, kind: 'timed', skill, stat }).map(({ start, end }) => ({
      start,
      end,
    }));
  const single = windows('skill1', 'singlePellet');
  const inside = (w: { start: number; end: number }) => shots.filter((f) => w.start <= f && f < w.end);
  const fixedShot = (k: number) => single.some((w) => w.start <= shots[k]! && shots[k]! < w.end);
  const pelletCount = windows('burst', 'pelletCount');
  const inBurst = (k: number) => pelletCount.some((w) => w.start <= shots[k]! && shots[k]! < w.end);

  it('gives Pierce, Hit Rate up and Attack Damage up in the same windows as the single pellet', () => {
    expect(single.length).toBeGreaterThan(10);
    for (const stat of ['pierce', 'hitRate', 'attackDamage']) expect(windows('skill1', stat)).toEqual(single);
  });

  it('opens each window on the frame after a shot and keeps it for exactly the next 3 shots', () => {
    for (const w of single.slice(0, -1)) {
      expect(shots).toContain(w.start - 1);
      expect(inside(w)).toHaveLength(3);
    }
  });

  it('counts one pellet on the fixed shots, and the base 10 pellets (more in the Burst) on the other shots', () => {
    const pellets = log.pelletHits!;
    const burst: number[] = [];
    shots.forEach((_, k) => {
      if (fixedShot(k)) expect(pellets[k]).toBeLessThanOrEqual(1);
      else if (inBurst(k)) burst.push(pellets[k]!);
      else {
        expect(pellets[k]).toBeGreaterThan(5);
        expect(pellets[k]).toBeLessThanOrEqual(10);
      }
    });
    // バーストの間は 15 個で数える（10 個では当たった数の期待値が 10 を超えない）
    if (input.burst) expect(Math.max(...burst)).toBeGreaterThan(10);
  });

  it('fires S1 on the shot whose running pellet total passes a multiple of 80', () => {
    const first = single[0]!.start - 1;
    const k = shots.indexOf(first);
    const total = (n: number) => log.pelletHits!.slice(0, n).reduce((a, b) => a + b, 0);
    expect(total(k)).toBeLessThan(80);
    expect(total(k + 1)).toBeGreaterThanOrEqual(80);
  });

  if (input.burst) {
    it('keeps one pellet on the fixed shots in the Burst (the single pellet wins over Pellet count up)', () => {
      expect(pelletCount.length).toBeGreaterThan(0);
      const both = shots.map((_, k) => k).filter((k) => fixedShot(k) && inBurst(k));
      expect(both.length).toBeGreaterThan(0);
      for (const k of both) expect(log.pelletHits![k]).toBeLessThanOrEqual(1);
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
