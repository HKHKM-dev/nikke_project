// イヴ（850）を含む編成（plan/design-eve.md）。S1 の不安定エネルギーが通常攻撃のクリティカル命中 44 回ごとに自分の発から 3 ヒットで出て、
// エグゾスパインMk2 の間だけ同じ値のヒットが重なること、電撃コードの敵にだけ受けるダメージ▲が付くこと、S2 の攻撃力▲が戦闘を通して効き、
// Mk2 の間だけもう 1 つ重なること、電撃コードの敵にだけ 10 回命中ごとに弾丸チャージ 3 発が入ること、バーストが説明文の値の 6 倍で出て
// Mk2 が付くことを見る（6 ヒットの時刻は遅れの表の行）。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import { effectWindows, fixedTeam, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const EVE = 850;
const FLOWER = 304;
const DELTA = 20;
const LITER = 82;
const DIESEL = 72;
const RAPI = 10;

const electric = { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Electronic' as const } };
const fire = { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' as const } };

const TEAMS: Record<string, TeamInput> = {
  'I-DOLL・フラワー + デルタ + イヴ（撮影の編成・電撃）': fixedTeam([FLOWER, DELTA, EVE], 2, electric),
  'I-DOLL・フラワー + デルタ + イヴ（撮影の編成・灼熱）': fixedTeam([FLOWER, DELTA, EVE], 2, fire),
  '実戦寄り（リター + ディーゼル + イヴ + ラピ・電撃）': fixedTeam([LITER, DIESEL, EVE, RAPI], 2, electric),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const e = input.slots.findIndex((s) => s?.character.resourceId === EVE);
  const isElectric = input.enemy.element === 'Electronic';
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations.filter((x) => x.slotIndex === e).map((x) => x.frame);
  const mk2 = itemsOf(plan.history, { holder: e, state: 'exospineMk2' });
  const inMk2 = (f: number) => mk2.some((it) => it.start <= f && f < it.end);
  const s1Hits = (effectIndex: number) =>
    plan.skillHits
      .filter((h) => h.slotIndex === e && h.effect.source.skill === 'skill1' && h.effect.effectIndex === effectIndex)
      .map((h) => h.frame);

  it('fires Unstable Energy as 3 hits 12 frames apart, starting 1 frame after an own shot', () => {
    const hits = s1Hits(1);
    // 180 秒で 20 回より多く出る（会心率 75% の AR）
    expect(hits.length).toBeGreaterThan(60);
    const shots = new Set(plan.shots[e]!.frames);
    for (let k = 0; k + 2 < hits.length; k += 3) {
      expect(hits[k + 1]! - hits[k]!).toBe(12);
      expect(hits[k + 2]! - hits[k]!).toBe(24);
      expect(shots.has(hits[k]! - 1)).toBe(true);
    }
  });

  it('doubles Unstable Energy only for activations during Exospine Mk2', () => {
    const base = s1Hits(1);
    const doubled = s1Hits(2);
    expect(doubled.length).toBeGreaterThan(0);
    const expected: number[] = [];
    for (let k = 0; k < base.length; k += 3) {
      if (inMk2(base[k]! - 1)) expected.push(...base.slice(k, k + 3));
    }
    expect(doubled).toEqual(expected);
  });

  it('applies the Damage Taken increase only to an Electric enemy', () => {
    const w = effectWindows(plan, e, { resourceId: EVE, skill: 'skill1', stat: 'damageTaken' });
    expect(w.length > 0).toBe(isElectric);
  });

  it('applies Exospine Mk2 for 10 s from each burst use and adds the second S2 ATK increase only then', () => {
    expect(activations.length).toBeGreaterThan(0);
    expect(mk2.length).toBe(activations.length);
    mk2.forEach((it, i) => {
      expect(it.start - activations[i]!).toBeGreaterThanOrEqual(0);
      expect(it.start - activations[i]!).toBeLessThanOrEqual(1);
      expect(Math.min(it.end, plan.frames) - it.start).toBe(Math.min(588, plan.frames - it.start));
    });
    const attack = effectWindows(plan, e, { resourceId: EVE, skill: 'skill2', stat: 'attack' });
    expect(attack).toEqual(mk2.map((it) => ({ start: it.start, end: Math.min(it.end, plan.frames) })));
  });

  it('reloads 3 rounds every 10 hits only on an Electric enemy', () => {
    const refills = plan.instants.filter(
      (i) => i.sourceSlotIndex === e && i.effect.kind === 'ammoRefill' && i.effect.source.skill === 'skill2',
    );
    if (!isElectric) {
      expect(refills).toEqual([]);
      return;
    }
    expect(refills.length).toBeGreaterThan(100);
  });

  it('hits the burst for 6 × the description value on each use', () => {
    const hits = runSimulation(input).slots[e]!.burst.hits;
    expect(hits.length).toBe(activations.length);
    for (const h of hits) expect(h.multiplier).toBeCloseTo(6 * 4.5714, 10);
  });
});
