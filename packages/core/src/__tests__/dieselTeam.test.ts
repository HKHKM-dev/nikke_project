// ディーゼル編（plan/design-diesel.md）: ディーゼル（72）を含む編成で、イチゴキャンディの付き方（命中 N 回ごと）、フルスタックの消費と
// 弾丸チャージ・貫通ダメージ▲（フルスタックの消費のきっかけ。2.1 節）、宝物版のヘイトの窓と、ヘイトの間の 150 回ごとのスタック量▲が
// 意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  SHOOTING_RANGE_ENEMY,
  windowsFrom,
} from './teamHelpers.ts';

const DIESEL = 72;
const FLOWER = 304;
const enemy = { ...SHOOTING_RANGE_ENEMY, element: 'Wind' as const };

function team(ids: number[], controlled: number, diesel: number, phase: TreasurePhase, burst = true): TeamInput {
  const input = fixedTeam(ids, controlled, { enemy, burst });
  input.slots[diesel]!.skills!.treasurePhase = phase;
  return input;
}

/** 射撃の列の every 発ごとの発の次のフレーム（射撃の回数のきっかけの件の始まり） */
const everyNth = (shots: readonly number[], every: number): number[] =>
  shots.filter((_, k) => (k + 1) % every === 0).map((f) => f + 1);

describe('基礎版（宝物なし）の単騎: 命中 100 回ごとのイチゴキャンディと、1000 回ごとのフルスタック', () => {
  const plan = planTeamRun(team([DIESEL], 0, 0, 0, false));
  const shots = plan.shots[0]!.frames;
  const candy = itemsOf(plan.history, { holder: 0, state: 'strawberryCandy' });
  const refills = plan.instants.filter((x) => x.effect.kind === 'ammoRefill');

  it('adds one stack on the frame after every 100th hit', () => {
    expect(candy.map((i) => i.start)).toEqual(everyNth(shots, 100).filter((f) => f < plan.frames));
  });

  it('removes all 10 stacks on the frame after the 1000th hit and reloads (once per full stack)', () => {
    const full = everyNth(shots, 1000);
    expect(full.length).toBeGreaterThan(1);
    expect(refills.map((x) => x.frame)).toEqual(full);
    for (const f of full) {
      const chain = candy.filter((i) => i.start <= f && f < i.end);
      expect(chain.map((i) => i.stack).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 10 }, (_, k) => k + 1));
      expect(chain.every((i) => i.end === f + 1)).toBe(true);
    }
    // 外した後の最大装弾数（300）で止めるので、記録の量は負にならない
    expect(refills.every((x) => x.amount >= 0)).toBe(true);
  });
});

describe('撮影の編成（I-DOLL・フラワー（I・操作）・ディーゼル（II・宝物の段階 3））', () => {
  const plan = planTeamRun(team([FLOWER, DIESEL], 0, 1, 3));
  const shots = plan.shots[1]!.frames;
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === 1).map((a) => a.frame);
  const attract = itemsOf(plan.history, { holder: 1, state: 'attract' });
  const candy = itemsOf(plan.history, { holder: 1, state: 'strawberryCandy' });
  const refills = plan.instants.filter((x) => x.effect.kind === 'ammoRefill');
  const full = [...new Set(refills.map((x) => x.frame))];

  it('puts Diesel in Attract for 10 s from each of her Burst uses (the chain times out without III)', () => {
    expect(plan.schedule!.fullBurstWindows).toEqual([]);
    expect(bursts.length).toBeGreaterThan(3);
    expect(attract.map((i) => [i.start, i.end])).toEqual(
      windowsFrom(bursts, 10, plan.frames).map((w) => [w.start, w.end]),
    );
  });

  it('stacks Strawberry Candy every 70 hits, plus one every 150th hit while in Attract and Candy is present', () => {
    const inAttract = (f: number) => attract.some((a) => a.start <= f && f < a.end);
    // 足す段の始まりのフレームにイチゴキャンディが付いていれば足す（同じ発の付与の件は入り、フルスタックで外した件は入らない。
    // plan/design-diesel.md 8.1 節）
    const present = (f: number) => candy.some((i) => i.start <= f && f < i.end);
    const candidates = everyNth(shots, 150).filter(inAttract);
    const extra = candidates.filter(present);
    expect(extra.length).toBeGreaterThan(3);
    // 0 段の時の 150 回目は足さない（この編成のモデルでも起きる）
    expect(candidates.length).toBeGreaterThan(extra.length);
    const expected = [...everyNth(shots, 70), ...extra].filter((f) => f < plan.frames).sort((a, b) => a - b);
    expect(candy.map((i) => i.start)).toEqual(expected);
  });

  it('removes all stacks at each full stack and reloads both allies there', () => {
    expect(full.length).toBeGreaterThan(3);
    expect(full).toEqual(candy.filter((i) => i.stack === 10).map((i) => i.start));
    for (const f of full) {
      expect(candy.filter((i) => i.start <= f && f < i.end).every((i) => i.end === f + 1)).toBe(true);
      expect(refills.filter((x) => x.frame === f).map((x) => x.slotIndex)).toEqual([0, 1]);
    }
    expect(refills.every((x) => x.amount >= 0)).toBe(true);
  });

  it('gives all allies Pierce Damage up for 10 s from each full stack', () => {
    const expected = windowsFrom(full, 10, plan.frames);
    expect(gameSecondsToFrames(10)).toBeLessThan(full[1]! - full[0]!);
    for (const slot of [0, 1]) {
      expect(effectWindows(plan, slot, { resourceId: DIESEL, skill: 'skill2', stat: 'pierceDamage' })).toEqual(
        expected,
      );
    }
  });
});

describeEveryShotInOneGroup({
  基礎版の単騎: team([DIESEL], 0, 0, 0, false),
  '撮影の編成（宝物の段階 3）': team([FLOWER, DIESEL], 0, 1, 3),
});
