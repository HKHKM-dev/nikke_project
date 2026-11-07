// トーブの基礎版編（plan/design-tove-base.md 2 節）: 宝物なしのトーブ（192）。S1 の代用弾丸（攻撃した時の確率）で付く応急改造を、
// スタック数の分布の期待値の小片で持ち、S2（フルスタックの時）にはフルスタックの確率を、バースト（応急改造スタックコピー）には
// バーストの時のスタック数が各段以上の確率を掛ける（C-0986・C-0987）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { chanceStackLevelsAt, chanceValueOf } from '../skills/chance.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TOVE = 192;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

/** 1 枠目トーブ（I）・2 枠目ソルジャーF.A.（SG・II）・3 枠目ソルジャーE.G.（III・操作） */
function run(tovePhase: TreasurePhase = 0) {
  const input: TeamInput = {
    slots: [fixedSlot(TOVE, tovePhase), fixedSlot(301), fixedSlot(300)],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: 2,
  };
  const plan = planTeamRun(input);
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === 0).map(effectFrameOf);
  return { plan, bursts };
}

describe('トーブの基礎版（宝物なし）', () => {
  const { plan, bursts } = run();
  const shots = plan.shots[0]!.frames;
  const modification = (holder: number) => itemsOf(plan.history, { holder, state: 'temporaryModification' });

  it('gives Temporary Modification to all allies as expected pieces from the shot after Tove’s first shot', () => {
    for (const holder of [0, 1, 2]) {
      const items = modification(holder);
      expect(items.length).toBeGreaterThan(0);
      expect(Math.min(...items.map((i) => i.start))).toBe(shots[0]! + 1);
      for (const i of items) {
        expect(i.scale).toBeGreaterThan(0);
        expect(i.scale).toBeLessThanOrEqual(1);
      }
    }
    // 味方全体に同じ分布（機会は 1 つの列）
    const shape = (holder: number) =>
      modification(holder).map(({ start, end, stack, scale }) => ({ start, end, stack, scale }));
    expect(shape(1)).toEqual(shape(0));
  });

  it('gives S2 Critical Rate up = value × the probability of max stacks, and no Attack Speed up', () => {
    const items = modification(0);
    const critRate = piecesOf(plan).filter(
      (p) => p.slotIndex === 1 && p.sourceSlotIndex === 0 && p.effect.source.skill === 'skill2',
    );
    expect(critRate.length).toBeGreaterThan(0);
    for (const p of critRate.slice(0, 300)) {
      expect(p.effect.stat).toBe('critRate');
      const full = chanceStackLevelsAt(items, p.start, 3)[2]!;
      expect(p.effect.value).toBe(chanceValueOf(0.0332, full));
    }
    // フルスタックでも 1 より小さい（期待値）
    expect(Math.max(...critRate.map((p) => p.effect.value))).toBeLessThan(0.0332);
  });

  it('copies the expected stacks at the Burst for 10 s (each level scaled by the probability of at least that many)', () => {
    expect(bursts.length).toBeGreaterThanOrEqual(5);
    const length = gameSecondsToFrames(10);
    // 値は発動者のバフ前攻撃力に掛ける比（scaling casterAttack）。味方全体の効果（effects[0]）だけを見る
    const atk = 0.0232;
    for (const holder of [0, 1, 2]) {
      const miracle = piecesOf(plan).filter(
        (p) =>
          p.slotIndex === holder &&
          p.sourceSlotIndex === 0 &&
          p.effect.source.skill === 'burst' &&
          p.effect.effectIndex === 0,
      );
      for (const b of bursts.slice(0, 5)) {
        const levels = chanceStackLevelsAt(modification(0), b, 3);
        const at = miracle.filter((p) => p.start <= b && b < p.end);
        const sum = at.reduce((s, p) => s + p.effect.value, 0);
        // 3 段の値の和 = 値 × スタック数の期待値（丸めの分を除く）
        expect(sum).toBeCloseTo(atk * levels.reduce((s, v) => s + v, 0), 5);
        expect(at.length).toBe(levels.filter((v) => v > 0).length);
        const after = miracle.filter((p) => p.start <= b + length && b + length < p.end);
        expect(after.length).toBe(0);
      }
    }
  });

  it('leaves the treasure version unchanged (no chance pieces)', () => {
    const treasure = run(3);
    for (const i of itemsOf(treasure.plan.history, { holder: 0, state: 'temporaryModification' })) {
      expect(i.scale).toBeUndefined();
    }
  });
});
