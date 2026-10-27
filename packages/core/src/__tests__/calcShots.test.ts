// 一本化の段 A-1（plan/design-unify-sim-calc.md 5.1 節。2026-10-27 オーナー決定）: calc は全枠・全グループで通常攻撃のトリガー数を
// 1 パス目の射撃の列から数え、通常攻撃も sim と一致する。2026-10-27 まではハイブリッド（plan/design-stage10.md 5 節。持続の
// 射撃バフが掛かっているグループだけ数え、ほかは平均レート × 秒数）で、LRNAM のリターの枠が sim より 2.5% 以上小さかった
// （plan/design-calc-hybrid.md 1.2 節。窓がマガジンの位相を固定するので、長くしても縮まない偏り）。
// 一本化の段 A-2（plan/design-unify-sim-calc.md 5.2 節）: calc/model.ts を消し、画面の形（TeamResult）は simTeamResult(runSimulation) の
// 1 本になった。上の一致はグループへのまとめ（simTeamResult）の確かめとして残す。sim の 2 パス目は区間ごとの二分探索の集計になり、
// フレームループは trace のときだけ回る。下の describe で、trace の有無で値が変わらないことと、trace のフレームループの出来事を
// 足すと集計の値になることを固定する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyEvent, EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation, simGroupTotals, type SimResult } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { runTeam } from './runTeam.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, ShotParams } from '../types.ts';
import { framesToGameSeconds } from '../time.ts';
import { makeCharacter } from './fixtures.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

// 2026-09-28 の起票の編成（リター + ニヒリスター + アリス + 紅蓮BS + モダニア）。リターの S1 の最大装弾数▲は味方全体で、全枠が窓を持つ
const LRNAM = team([fixedSlot(82), fixedSlot(261), fixedSlot(191), fixedSlot(225), fixedSlot(260)], 2);
// 録画 0037: 窓を持つのはドレイク（バーストの自分への最大装弾数▲）だけ
const REC37 = team([fixedSlot(822), fixedSlot(20), fixedSlot(101, 3)], 2);
// Stage 8 の 5 人: 射撃の窓が 1 つも掛からない
const STAGE8 = team([fixedSlot(291), fixedSlot(20), fixedSlot(231), fixedSlot(101), fixedSlot(870)], 2);

const relDiff = (a: number, b: number) => (a - b) / b;

describe('calc は全枠・全グループを射撃の列から数える（一本化の段 A-1）', () => {
  it.each([
    ['LRNAM（全枠が窓を持つ）', LRNAM],
    ['録画 0037（窓を持つのはドレイクだけ）', REC37],
    ['Stage 8 の 5 人（窓なし）', STAGE8],
  ] as const)('%s: 全グループが shots で、グループの発数・枠の合計・編成の合計が sim と一致する', (_, input) => {
    const calc = runTeam(input);
    const sim = runSimulation(input);
    for (let i = 0; i < input.slots.length; i++) {
      const c = calc.slots[i]!;
      expect(
        c.segments.every((g) => g.triggerSource === 'shots'),
        `slot ${i}`,
      ).toBe(true);
      expect(c.segments.map((g) => g.triggers)).toEqual(simGroupTotals(sim, i).map((g) => g.triggers));
      // 区間は [0, frames) を隙間なく覆うので、全グループの発数の和は射撃の列の長さ
      expect(c.segments.reduce((n, g) => n + g.triggers, 0)).toBe(sim.shots[i]!.frames.length);
      // 残るのは浮動小数点の加算順の違いだけ（plan/design-unify-sim-calc.md 4.2 節）
      expect(relDiff(sim.slots[i]!.totalDamage, c.totalDamage), `slot ${i}`).toBeCloseTo(0, 9);
    }
    expect(relDiff(sim.totalDamage, calc.totalDamage)).toBeCloseTo(0, 9);
  });
});

// Stage 22-B の編成（__tests__/stage22PartialCharge.test.ts）: SR のチャージの途中で狙えない窓が始まり、部分チャージの発が 1 つ出る
const SR: Partial<ShotParams> = {
  maxAmmo: 6,
  reloadTime: 1.5,
  rateOfFire: 60,
  endRateOfFire: 60,
  chargeTime: 1,
  fullChargeDamage: 2.5,
  fullChargeBurstEnergy: 2.5,
  inputType: 'UP',
  damage: 6000,
};
const partialEvents: EnemyEvent[] = [
  { kind: 'untargetable', start: framesToGameSeconds(203), end: framesToGameSeconds(203 + 120) },
];
const PARTIAL: TeamInput = {
  slots: [
    {
      character: makeCharacter(SR, { resourceId: 2 }),
      growth: { level: 1, grade: 0, core: 0 },
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    },
  ],
  enemy: { defence: 100, element: null, hasCore: true, events: partialEvents },
  durationSeconds: 30,
  burst: false,
};

/** 加算順の違いだけの差か（相対 1e-12） */
function expectSameSum(actual: number, expected: number, label?: string): void {
  expect(Math.abs(actual - expected), label).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
}

/** 出来事のダメージを足す（枠・種類で絞る）。足す順は出来事の順（フレーム順） */
function eventDamage(sim: SimResult, pick: (e: SimResult['events'][number]) => boolean): number {
  let sum = 0;
  for (const e of sim.events) if ('damage' in e && pick(e)) sum += e.damage;
  return sum;
}

describe('2 パス目の集計と trace のフレームループ（一本化の段 A-2）', () => {
  it.each([
    ['LRNAM（全枠が窓を持つ）', LRNAM],
    ['録画 0037（窓を持つのはドレイクだけ）', REC37],
    ['Stage 8 の 5 人（窓なし）', STAGE8],
    ['部分チャージの発がある SR（狙えない窓）', PARTIAL],
  ] as const)('%s: trace の有無で区間・合計・1 秒ごとのダメージが同じで、出来事を足すと集計の値になる', (_, input) => {
    const plain = runSimulation(input);
    const traced = runSimulation({ ...input, trace: true });
    expect(plain.events).toEqual([]);
    expect(traced.slots).toEqual(plain.slots);
    expect(traced.totalDamage).toBe(plain.totalDamage);
    expect(traced.damagePerSecond).toEqual(plain.damagePerSecond);

    // trace のフレームループは 1 発ずつ数えるので、区間ごとの発数は二分探索の数と同じ整数、ダメージは加算順の違いだけ
    for (const slot of plain.slots) {
      if (slot === null) continue;
      const triggers = traced.events.filter((e) => e.kind === 'trigger' && e.slot === slot.index);
      for (const segment of slot.segments) {
        const inside = triggers.filter((e) => segment.start <= e.frame && e.frame < segment.end);
        expect(inside.length, `slot ${slot.index} ${segment.start}f`).toBe(segment.triggers);
        const damage = inside.reduce((sum, e) => sum + (e.kind === 'trigger' ? e.damage : 0), 0);
        expectSameSum(damage, segment.damage, `slot ${slot.index} ${segment.start}f`);
      }
      expect(triggers.length).toBe(plain.shots[slot.index]!.frames.length);
      expectSameSum(
        eventDamage(traced, (e) => e.kind === 'burst' && e.slot === slot.index),
        slot.burst.damage,
      );
      expectSameSum(
        eventDamage(traced, (e) => e.kind === 'skillHit' && e.slot === slot.index),
        slot.skillHits.damage,
      );
    }
    // 1 秒ごとのダメージは、出来事のダメージを秒の箱に入れた和
    const perSecond = plain.damagePerSecond.total.map(() => 0);
    for (const e of traced.events) {
      if (!('damage' in e)) continue;
      perSecond[Math.floor(framesToGameSeconds(e.frame))]! += e.damage;
    }
    perSecond.forEach((value, k) => expectSameSum(value, plain.damagePerSecond.total[k]!, `${k}s`));
  });

  it('部分チャージの発は、集計でも trace の出来事でもチャージの進みで出し直した値になる', () => {
    const sim = runSimulation({ ...PARTIAL, trace: true });
    const partial = sim.shots[0]!.partialShots!;
    expect(partial).toHaveLength(1);
    const segment = sim.slots[0]!.segments.find((s) => s.partialCharge)!;
    expect(segment.partialCharge!.triggers).toBe(1);
    const event = sim.events.find((e) => e.kind === 'trigger' && e.frame === partial[0]!.frame)!;
    expect(event.kind === 'trigger' && event.damage).toBe(segment.partialCharge!.damage);
    expect(segment.partialCharge!.damage).toBeLessThan(segment.trigger.perTrigger);
  });
});
