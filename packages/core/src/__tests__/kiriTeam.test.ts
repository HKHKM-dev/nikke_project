// キリ（33）の S1（フルチャージの発ごとに防御型の味方 2 機へ発動者基準の攻撃力▲）とバースト（防御型の味方全体へクリティカル確率▲と
// 味方全体への持続回復）を、撮影（V-0882）と同じ編成で見る。「〈絞り込み〉の味方 N 機」は plan/design-kiri.md 2 節
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { battleSecondsToFrames, gameSecondsToFrames } from '../time.ts';
import { piecesOf } from './historyHelpers.ts';
import { fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const KIRI = 33;
const DELTA = 20;
const LUDMILLA = 190;
const CROW = 110;

const enemy: EnemyInput = fixedEnemy({ element: 'Electronic' });

// 撮影 A（録画 1411・1412 の並び）: デルタ（防御型・II。2 枠目）・キリ（3 枠目・操作）。バースト I がいないのでバーストは起きない
const KIRI_DELTA: TeamInput = fixedTeam([null, fixedSlot(DELTA), fixedSlot(KIRI)], 2, { enemy });
// 撮影 B: ルドミラ（防御型・I）・デルタ（防御型・II）・キリ（III・操作）
const CHAIN: TeamInput = fixedTeam(
  [LUDMILLA, DELTA, KIRI].map((id) => fixedSlot(id)),
  2,
  { enemy },
);
// 撮影 C（録画 1415 の並び）: クロウ（2 枠目）・キリ（3 枠目・操作）・デルタ（4 枠目）・ルドミラ（5 枠目）。バーストなし
const THREE_DEFENDERS: TeamInput = fixedTeam(
  [null, fixedSlot(CROW), fixedSlot(KIRI), fixedSlot(DELTA), fixedSlot(LUDMILLA)],
  2,
  { enemy, burst: false },
);

const BATTLE_END = battleSecondsToFrames(KIRI_DELTA.durationSeconds);
const THREE_SECONDS = gameSecondsToFrames(3);
const TEN_SECONDS = gameSecondsToFrames(10);

const fromSlot = (team: TeamInput, source: number, stat: string) =>
  piecesOf(planTeamRun(team)).filter((p) => p.sourceSlotIndex === source && p.effect.stat === stat);

describe('キリ + デルタ（撮影 A）', () => {
  const plan = planTeamRun(KIRI_DELTA);
  const ups = fromSlot(KIRI_DELTA, 2, 'attack');

  it('gives the attack up of S1 to the Defender only, from each Full Charge shot for 3 s', () => {
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([1]));
    expect(ups[0]!.effect).toMatchObject({ scaling: 'casterAttack', value: 0.0581 });
    // 窓はフルチャージの発の次のフレームから付き（その発自身には乗らない）、発の間が 3 秒より短い間は付け直しで続き、
    // マガジンの最後の発から 3 秒で切れる
    const shots = new Set(plan.shots[2]!.frames);
    expect(ups[0]!.start).toBe(plan.shots[2]!.frames[0]! + 1);
    expect(ups.every((p) => shots.has(p.start - 1))).toBe(true);
    expect(ups.filter((p) => p.end < BATTLE_END).every((p) => shots.has(p.end - 1 - THREE_SECONDS))).toBe(true);
    expect(ups.every((p) => p.end <= BATTLE_END)).toBe(true);
  });

  it('has no burst', () => {
    expect(plan.schedule!.fullBurstWindows).toEqual([]);
  });
});

describe('ルドミラ + デルタ + キリ（撮影 B）', () => {
  const plan = planTeamRun(CHAIN);
  const fullBursts = plan.schedule!.fullBurstWindows;

  it('gives the attack up of S1 to both Defenders (2, as many as N)', () => {
    expect(new Set(fromSlot(CHAIN, 2, 'attack').map((p) => p.slotIndex))).toEqual(new Set([0, 1]));
  });

  it('gives the crit rate up of the burst to the Defenders only, for 10 s from each burst', () => {
    const ups = fromSlot(CHAIN, 2, 'critRate');
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([0, 1]));
    expect(ups[0]!.effect.value).toBeCloseTo(0.199, 12);
    expect(fullBursts.length).toBeGreaterThan(1);
    const firstLudmilla = ups.filter((p) => p.slotIndex === 0);
    expect(firstLudmilla[0]!.end - firstLudmilla[0]!.start).toBe(TEN_SECONDS);
  });

  it('heals all allies (herself included) at each burst', () => {
    const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 2);
    expect(new Set(heals.map((h) => h.slotIndex))).toEqual(new Set([0, 1, 2]));
    expect(heals.filter((h) => h.slotIndex === 2)).toHaveLength(fullBursts.length);
  });
});

describe('防御型 3 機 + キリ（撮影 C）', () => {
  // 実機は発ごとに 2 機を選び直す（C-1579）。モデルは枠の若い順の 2 機（クロウ・デルタ）に決め打ちで付け、注記で知らせる
  it('gives the attack up of S1 to the first 2 Defender slots, and notes the fixed pick', () => {
    expect(new Set(fromSlot(THREE_DEFENDERS, 2, 'attack').map((p) => p.slotIndex))).toEqual(new Set([1, 3]));
    const codes = (team: TeamInput, slot: number) => runSimulation(team).slots[slot]!.notes.map((n) => n.code);
    expect(codes(THREE_DEFENDERS, 2)).toContain('counted-allies-pick');
    expect(codes(CHAIN, 2)).not.toContain('counted-allies-pick');
  });
});
