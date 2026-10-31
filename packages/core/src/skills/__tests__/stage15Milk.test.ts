// 2 段目の段 15 の PR 1（plan/design-skill-stage15.md 2.1・3.1 節）: ミルク（141）の宝物版。T4 のバーストスキルクールタイム▼を timed
// （戦闘開始時・持続）で書いた最初の使い手と、即時の▼（フルチャージ 10 発ごと・味方全体）。HP の条件の即値（selfHp.atLeast。基礎版の S2）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { applySelfHp } from '../composition.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, selfHpThreshold } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (rid: number) => readJson<CharacterData>(`../../../data/characters/${rid}.json`);
const definition = (rid: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${rid}.json`));

const MILK = 141;
const DELTA = 20;
const IDOLL_SUN = 308;

function slotOf(rid: number, treasurePhase: 0 | 3 = 0): TeamSlotInput {
  const c = character(rid);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
    skills: { definition: definition(rid), levels: MAX_SKILL_LEVELS, treasurePhase },
  };
}

function run(slots: TeamSlotInput[], controlledSlot: number) {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const input: TeamInput = { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
  return runSimulation(input);
}

describe('selfHp.atLeast（説明文に即値で書かれた HP の閾値）', () => {
  const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  const withCondition = (selfHp: unknown) => ({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-31',
    skills: {
      skill1: { effects: [{ kind: 'passive', target: 'allies', stat: 'critDamage', ref: 1, condition: { selfHp } }] },
      skill2: none,
      burst: none,
    },
  });

  it('takes exactly one of atLeastRef and atLeast', () => {
    expect(() => parseSkillDefinition(withCondition({ atLeast: 80 }))).not.toThrow();
    expect(() => parseSkillDefinition(withCondition({ atLeast: 80, atLeastRef: 2 }))).toThrow(/exactly one/);
    expect(() => parseSkillDefinition(withCondition({}))).toThrow(/exactly one/);
    expect(() => parseSkillDefinition(withCondition({ atLeast: 0 }))).toThrow(/percent/);
  });

  it('reads the threshold from the immediate value or the description value', () => {
    expect(selfHpThreshold({ atLeast: 80 }, () => 50)).toBe(0.8);
    expect(selfHpThreshold({ atLeastRef: 1 }, () => 50)).toBe(0.5);
  });

  it('keeps the base S2 at full HP and drops it below 80%', () => {
    const def = definition(MILK);
    const milk = character(MILK);
    expect(applySelfHp(def, milk, MAX_SKILL_LEVELS, 1).skills.skill2.effects).toHaveLength(1);
    expect(applySelfHp(def, milk, MAX_SKILL_LEVELS, 0.79).skills.skill2.effects).toHaveLength(0);
  });
});

describe('ミルクの宝物版（V-0559）', () => {
  it('bursts 7 times alone in 180 s with the S1 cooldown −20 s (5 times without the treasure)', () => {
    // C-0769: 単騎の I は、チェーンの待ちの後のゲージで決まる間隔（約 23 秒）で撃つ。宝物版でなければ CT 40 秒が律速
    const treasure = run([slotOf(MILK, 3)], 0);
    const base = run([slotOf(MILK, 0)], 0);
    expect(treasure.schedule!.activations).toHaveLength(7);
    expect(base.schedule!.activations).toHaveLength(5);
  });

  it('cuts every ally’s cooldown by 2.83 s on every 10th full charge shot', () => {
    // C-0770: デルタ・I-DOLL・サン・ミルク。▼は 10 発目・20 発目…のフルチャージの発のフレームに味方全体（自分も）に出る
    const result = run([slotOf(DELTA), slotOf(IDOLL_SUN), slotOf(MILK, 3)], 2);
    const milkShots = result.shots[2]!.frames;
    const cuts = result.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === 2);
    const cutFrames = [...new Set(cuts.map((r) => r.frame))];
    expect(cutFrames.length).toBeGreaterThan(3);
    expect(cutFrames.slice(0, 3)).toEqual([milkShots[9], milkShots[19], milkShots[29]]);
    expect(new Set(cuts.filter((r) => r.frame === cutFrames[0]).map((r) => r.slotIndex))).toEqual(new Set([0, 1, 2]));
  });
});
