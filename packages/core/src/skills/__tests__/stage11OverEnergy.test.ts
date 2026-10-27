// 2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.3・2.4 節）: カウンタが最大になった時のきっかけ（{ counterFull }）、カウンタの値の
// 間だけ効く常時の効果（while の selfCounter）、最大HP のみ▲（maxHpOnly）。使い手はラプラス：アルティメットヒーロー（103）の S2（V-0529）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LAPLACE = 103;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`));

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
function withSkill2(...effects: unknown[]): unknown {
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-27',
    skills: { skill1: none, skill2: { effects }, burst: none },
  };
}
const charge = {
  kind: 'counterChange',
  counter: 'overEnergy',
  trigger: { count: 'weaponChangeShot', everyRef: 8 },
  target: 'self',
  amountRef: 9,
};
const reset = { ...charge, trigger: { counterFull: 'overEnergy' }, amountRef: 1, decrease: true };
const stageUp = {
  kind: 'counterChange',
  counter: 'overEnergyStage',
  trigger: { counterFull: 'overEnergy' },
  target: 'self',
  amount: 1,
};
const stage1 = {
  kind: 'passive',
  target: 'self',
  stat: 'maxHpOnly',
  ref: 2,
  while: { selfCounter: { counter: 'overEnergyStage', atLeast: 1 } },
};

describe('語彙の検証', () => {
  it('accepts { counterFull } in counterChange and a counter while on a passive', () => {
    expect(() => parseSkillDefinition(withSkill2(charge, reset, stageUp, stage1))).not.toThrow();
  });

  it('rejects { counterFull } outside counterChange and an unknown counter', () => {
    expect(() =>
      parseSkillDefinition(
        withSkill2({ kind: 'timed', trigger: { counterFull: 'overEnergy' }, target: 'self', stat: 'attack', ref: 1 }),
      ),
    ).toThrow();
    expect(() => parseSkillDefinition(withSkill2({ ...reset, trigger: { counterFull: 'unknown' } }))).toThrow(
      /counterFull/,
    );
  });

  it('rejects a counter while without an increasing counterChange, below, or atLeast 0', () => {
    expect(() => parseSkillDefinition(withSkill2(reset, stage1))).toThrow(/needs a counterChange that increases it/);
    const bad = (selfCounter: unknown) => ({ ...stage1, while: { selfCounter } });
    expect(() =>
      parseSkillDefinition(withSkill2(charge, stageUp, bad({ counter: 'overEnergyStage', below: 2 }))),
    ).toThrow(/atLeast of at least 1/);
    expect(() =>
      parseSkillDefinition(withSkill2(charge, stageUp, bad({ counter: 'overEnergyStage', atLeast: 0 }))),
    ).toThrow();
    expect(() =>
      parseSkillDefinition(
        withSkill2(charge, stageUp, {
          ...stage1,
          while: { selfCounter: { counter: 'overEnergyStage', atLeast: 1 }, selfState: 'warmUp' },
        }),
      ),
    ).toThrow(/exactly one of selfState and selfCounter/);
  });
});

describe('ラプラス：アルティメットヒーローの S2（V-0529）', () => {
  const c = character(LAPLACE);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(LAPLACE), levels: MAX_SKILL_LEVELS },
  };
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
  const r = runSimulation(input);
  const log = r.shots[0]!;
  const changed = log.weaponChangeShotFrames ?? [];

  it('raises the stage after every 240th changed shot, the frame after the counter is full, up to 4', () => {
    const stages = r.history.counters.filter((x) => x.counter === 'overEnergyStage');
    expect(stages.map((x) => x.value)).toEqual([1, 2, 3, 4]);
    // 240 発目で 100 になり、次のフレームに 0 に戻して段階を上げる
    expect(stages.map((x) => x.frame)).toEqual([1, 2, 3, 4].map((k) => changed[240 * k - 1]! + 1));
    const energy = r.history.counters.filter((x) => x.counter === 'overEnergy');
    const full = energy.filter((x) => x.value === 100).map((x) => x.frame + 1);
    expect(full.slice(0, 4)).toEqual(stages.map((x) => x.frame));
    // 5 回目以降の 100 でも段階は 4 のまま（上限で切る）
    expect(full.length).toBeGreaterThan(4);
  });

  it('adds the stage values of max HP only to the final max HP read by the S1 attack up (C-0577)', () => {
    const hits = r.slots[0]!.segments;
    const attackAt = (frame: number) => hits.find((s) => s.start <= frame && frame < s.end)!.trigger.normal;
    // 段階が上がった後の区間ほど 1 発の値が大きい（S1 の攻撃力▲が最終最大HP を読み直す）
    const stages = r.history.counters.filter((x) => x.counter === 'overEnergyStage').map((x) => x.frame + 1);
    const before = stages.map((f) => attackAt(f - 1));
    const after = stages.map((f) => attackAt(f + 1));
    after.forEach((a, i) => expect(a).toBeGreaterThan(before[i]!));
  });
});
