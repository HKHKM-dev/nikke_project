// エード：エージェントバニー編（plan/design-agent-bunny.md）: エード：エージェントバニー（315）を含む編成で、隠しレンズ（フルチャージの発ごとに
// 1 スタック・適正最小射程距離▲）、S1・S2 の「適正射程距離内の対象に命中した時」の攻撃力▲・貫通ダメージ▲、フルスタックの間の貫通特化と
// 攻撃力▲、バーストの適正最小射程距離▲・攻撃ダメージ▲・貫通ダメージ▲が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { distanceBonusAt, inEffectiveRangeAt } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, fixedSlot, fixedTeam, RANGE_BIGARMS, rangeEnemyWithEvents, skillValueOf } from './teamHelpers.ts';

const ADE_AB = 315;
const FLOWER = 304;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number, burst: boolean): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy, burst });

const TEAMS: Record<string, TeamInput> = {
  'エード：エージェントバニー単騎（撮影 A の編成）': team([ADE_AB], 0, false),
  'I-DOLL・フラワー + エード：エージェントバニー（撮影 B の編成）': team([FLOWER, ADE_AB], 1, true),
};

describe('適正射程距離（distanceBonusAt・inEffectiveRangeAt）', () => {
  const sr = characterOf(ADE_AB);
  const landing = (id: string) => RANGE_BIGARMS.landings.find((l) => l.id === id)!;

  it('keeps the band check without Minimum Effective Range up (SR gets the range bonus only at the far landing)', () => {
    expect(RANGE_BIGARMS.landings.filter((l) => distanceBonusAt(sr, l)).map((l) => l.id)).toEqual(['farA', 'farB']);
  });

  it('shortens the lower end to min × (1 − Σ) and checks the representative distance', () => {
    const lens = (stacks: number) => (stacks * skillValueOf(ADE_AB, 'skill1', 3)) / 100;
    const min = (value: number) => ({ min: value, max: 0 });
    // 中近（28）: 8 スタック（下端 29.0）では外、9 スタック（27.0）で中（V-0710）
    expect(distanceBonusAt(sr, landing('midNear'), min(lens(8)))).toBe(false);
    expect(distanceBonusAt(sr, landing('midNear'), min(lens(9)))).toBe(true);
    // 近（18）: 隠しレンズだけ（25.0）では外、バーストと合わせると中
    expect(distanceBonusAt(sr, landing('nearA'), min(lens(10)))).toBe(false);
    expect(distanceBonusAt(sr, landing('nearA'), min(lens(10) + skillValueOf(ADE_AB, 'burst', 1) / 100))).toBe(true);
  });

  it('puts the near landings in the band from the stack measured after the lens ran out and Burst was used (V-0796)', () => {
    const lens = (stacks: number) => (stacks * skillValueOf(ADE_AB, 'skill1', 3)) / 100;
    const min = (value: number) => ({ min: value, max: 0 });
    const burst = skillValueOf(ADE_AB, 'burst', 1) / 100;
    // 近 A（18〜20。C-1336）: バーストだけ（下端 20.0）では外、1 スタック（18.0）で中
    expect(distanceBonusAt(sr, landing('nearA'), min(burst))).toBe(false);
    expect(distanceBonusAt(sr, landing('nearA'), min(burst + lens(1)))).toBe(true);
    // 近 B（15〜16。C-1337）: 2 スタック（16.0）までは外、3 スタック（14.0）で中
    expect(distanceBonusAt(sr, landing('nearB'), min(burst + lens(2)))).toBe(false);
    expect(distanceBonusAt(sr, landing('nearB'), min(burst + lens(3)))).toBe(true);
  });

  it('uses the manual range bonus without a landing plan', () => {
    const slot = fixedSlot(ADE_AB);
    expect(inEffectiveRangeAt(null, slot, 0, 0, { min: 1, max: 0 })).toBe(slot.condition.distanceBonus);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const ade = input.slots.findIndex((s) => s?.character.resourceId === ADE_AB);
  const plan = planTeamRun(input);
  const shots = plan.shots[ade]!.frames;
  const windows = (filter: Parameters<typeof itemsOf>[1]) =>
    itemsOf(plan.history, filter).map(({ start, end }) => ({ start, end }));
  const s1 = windows({ sourceSlotIndex: ade, holder: ade, kind: 'timed', skill: 'skill1', stat: 'attack' });
  const s2 = windows({ sourceSlotIndex: ade, holder: ade, kind: 'timed', skill: 'skill2', stat: 'pierceDamage' });
  const landingAt = (frame: number) => plan.landing!.spans.find((s) => s.start <= frame && frame < s.end)!.landing;

  it('gives the S1 ATK up and the S2 Pierce Damage up to every ally in the same windows', () => {
    expect(s1.length).toBeGreaterThan(0);
    expect(s2).toEqual(s1);
    input.slots.forEach((_, holder) =>
      expect(windows({ sourceSlotIndex: ade, holder, kind: 'timed', skill: 'skill1', stat: 'attack' })).toEqual(s1),
    );
  });

  it('does not fire on the first nine shots at the mid-near landing (Spy Lens below 9 stacks, no Burst)', () => {
    const firstFire = Math.min(...s1.map((w) => w.start));
    const before = shots.filter((f) => f < firstFire - 1);
    expect(landingAt(firstFire - 1)).toBe('midNear');
    if (!input.burst) expect(before).toHaveLength(9);
  });

  it('keeps Pierce and the self ATK up only while Spy Lens is at max stacks', () => {
    const lens = windows({ sourceSlotIndex: ade, holder: ade, kind: 'state', state: 'spyLens' });
    expect(lens.length).toBeGreaterThan(0);
    const pierce = windows({ sourceSlotIndex: ade, holder: ade, kind: 'while', stat: 'pierce' });
    expect(pierce.length).toBeGreaterThan(0);
    // 10 発目（10 スタック目を付けた発）の次のフレームから
    expect(pierce[0]!.start).toBe(shots[9]! + 1);
  });
});
