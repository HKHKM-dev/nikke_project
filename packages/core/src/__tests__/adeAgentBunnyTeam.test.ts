// エード：エージェントバニー編（plan/design-agent-bunny.md）: エード：エージェントバニー（315）を含む編成で、隠しレンズ（フルチャージの発ごとに
// 1 スタック・適正最小射程距離▲）、S1・S2 の「適正射程距離内の対象に命中した時」の攻撃力▲・貫通ダメージ▲、フルスタックの間の貫通特化と
// 攻撃力▲、バーストの適正最小射程距離▲・攻撃ダメージ▲・貫通ダメージ▲が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { distanceBonusAt, inEffectiveRangeAt } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, readJson, skillValueOf } from './teamHelpers.ts';

const ADE_AB = 315;
const FLOWER = 304;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Fire',
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
  'エード：エージェントバニー単騎（撮影 A の編成）': team([ADE_AB], 0, false),
  'I-DOLL・フラワー + エード：エージェントバニー（撮影 B の編成）': team([FLOWER, ADE_AB], 1, true),
};

describe('適正射程距離（distanceBonusAt・inEffectiveRangeAt）', () => {
  const sr = characterOf(ADE_AB);
  const landing = (id: string) => profile.landings.find((l) => l.id === id)!;

  it('keeps the band check without Minimum Effective Range up (SR gets the range bonus only at the far landing)', () => {
    expect(profile.landings.filter((l) => distanceBonusAt(sr, l)).map((l) => l.id)).toEqual(['farA', 'farB']);
  });

  it('shortens the lower end to min × (1 − Σ) and checks the representative distance', () => {
    const lens = (stacks: number) => (stacks * skillValueOf(ADE_AB, 'skill1', 3)) / 100;
    // 中近（28）: 8 スタック（下端 29.0）では外、9 スタック（27.0）で中（V-0710）
    expect(distanceBonusAt(sr, landing('midNear'), lens(8))).toBe(false);
    expect(distanceBonusAt(sr, landing('midNear'), lens(9))).toBe(true);
    // 近（18）: 隠しレンズだけ（25.0）では外、バーストと合わせると中
    expect(distanceBonusAt(sr, landing('nearA'), lens(10))).toBe(false);
    expect(distanceBonusAt(sr, landing('nearA'), lens(10) + skillValueOf(ADE_AB, 'burst', 1) / 100)).toBe(true);
  });

  it('uses the manual range bonus without a landing plan', () => {
    const slot = fixedSlot(ADE_AB);
    expect(inEffectiveRangeAt(null, slot, 0, 0, 1)).toBe(slot.condition.distanceBonus);
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

describeEveryShotInOneGroup(TEAMS);
