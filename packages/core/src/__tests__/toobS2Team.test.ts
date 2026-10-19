// 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.2・1.3 節）: 攻撃速度▲（attackSpeed）と、状態の間だけ効く常時の効果（while）。
// トーブ（192・宝物の段階 3）の S2 と、ソルジャーF.A.（301・SG）の編成（V-0458 の録画 510〜512。C-0599〜C-0602）、sim と calc の整合
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { rateAfterShots, simulateShotFrames } from '../cadence.ts';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { firingParams, ZERO_FIRING_BUFFS } from '../frame/firing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { variantDefinition } from '../records/sensitivity.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { whileItems, type HeldOrigin } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS, resolvePassives, resolveWhileEffects } from '../skills/resolve.ts';
import { applyTreasure, type TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TOOB = 192;
const FA = 301;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

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
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS, treasurePhase },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

/** 録画 510・511 と同じ枠順（1 枠目ソルジャーF.A.（操作）・2 枠目トーブ（宝物の段階 3）） */
const team = (treasurePhase: TreasurePhase): TeamInput => ({
  slots: [fixedSlot(FA), fixedSlot(TOOB, treasurePhase)],
  enemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
});

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const GRANT = {
  kind: 'state',
  state: 'temporaryModification',
  trigger: { count: 'normalShot', every: 10 },
  target: 'allies',
  maxStacks: 3,
  durationSeconds: 5,
  contents: [{ stat: 'maxAmmo', scaling: 'flat', ref: 1 }],
};
const WHILE_FULL = { selfState: { state: 'temporaryModification', stacks: 'full' } };
const definitionWith = (effects: object[], skill1: object[] = [GRANT]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-20',
    skills: { skill1: skill1.length > 0 ? { effects: skill1 } : empty, skill2: { effects }, burst: empty },
  });
const SPEED = { kind: 'passive', target: 'allies', targetWeapon: 'SG', stat: 'attackSpeed', ref: 2 };

describe('while と attackSpeed の読み込み', () => {
  it('accepts while on a passive that looks at a state granted on self', () => {
    const def = definitionWith([{ ...SPEED, while: WHILE_FULL }]);
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'passive', stat: 'attackSpeed', while: WHILE_FULL });
  });

  it('rejects while combined with a condition, negated, or with unknown fields', () => {
    expect(() => definitionWith([{ ...SPEED, while: WHILE_FULL, condition: { selfHp: { atLeastRef: 1 } } }])).toThrow(
      /while cannot be combined with condition/,
    );
    expect(() =>
      definitionWith([{ ...SPEED, while: { selfState: { state: 'temporaryModification', present: false } } }]),
    ).toThrow(/while needs the state/);
    expect(() => definitionWith([{ ...SPEED, while: { ...WHILE_FULL, other: 1 } }])).toThrow(/unknown field/);
    expect(() =>
      definitionWith([{ kind: 'passive', target: 'allies', stat: 'damageTaken', ref: 1, while: WHILE_FULL }]),
    ).toThrow(/held by the enemy, so it cannot have while/);
  });

  it('needs a grant of the state on self in the definition, with max stacks for a stack condition', () => {
    expect(() => definitionWith([{ ...SPEED, while: WHILE_FULL }], [])).toThrow(
      /while on "temporaryModification" needs a grant of the same state on self/,
    );
    const { maxStacks: _maxStacks, ...single } = GRANT;
    expect(() => definitionWith([{ ...SPEED, while: WHILE_FULL }], [single])).toThrow(/with maxStacks/);
    // スタックの条件が無ければ、スタックしない付与でもよい
    const present = { selfState: { state: 'temporaryModification', present: true } };
    expect(definitionWith([{ ...SPEED, while: present }], [single]).skills.skill2.effects).toHaveLength(1);
  });

  it('allows attackSpeed only for AR, SMG and SG allies, and not decreasing', () => {
    for (const targetWeapon of ['AR', 'SMG', 'SG']) {
      expect(definitionWith([{ ...SPEED, targetWeapon }]).skills.skill2.effects).toHaveLength(1);
    }
    for (const targetWeapon of ['MG', 'SR', 'RL']) {
      expect(() => definitionWith([{ ...SPEED, targetWeapon }])).toThrow(/attackSpeed needs targetWeapon AR, SMG, SG/);
    }
    const { targetWeapon: _w, ...noWeapon } = SPEED;
    expect(() => definitionWith([noWeapon])).toThrow(/attackSpeed needs targetWeapon/);
    expect(() => definitionWith([{ ...SPEED, decrease: true }])).toThrow(/attackSpeed cannot decrease/);
    expect(
      definitionWith([
        {
          kind: 'timed',
          trigger: 'burstUse',
          target: 'allies',
          targetWeapon: 'SG',
          stat: 'attackSpeed',
          ref: 2,
          durationSeconds: 10,
        },
      ]).skills.skill2.effects,
    ).toHaveLength(1);
  });

  it('resolves while effects apart from the passives, with the stack condition', () => {
    const applied = applyTreasure(character(TOOB), definitionOf(TOOB), 3);
    const definition = applied.definition!;
    expect(
      resolvePassives(definition, applied.character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill2'),
    ).toEqual([]);
    const whiles = resolveWhileEffects(definition, applied.character, MAX_SKILL_LEVELS);
    expect(whiles.map((e) => [e.stat, e.whileState, e.whileStacks, e.effectIndex, e.targetWeapon])).toEqual([
      ['critRate', 'temporaryModification', 'full', 0, undefined],
      ['attackSpeed', 'temporaryModification', 'full', 1, 'SG'],
    ]);
    expect(whiles[0]!.value).toBeCloseTo(0.1008, 12);
    expect(whiles[1]!.value).toBeCloseTo(0.4224, 12);
  });

  it('keeps the base S2 as notes (the base Temporary Modification comes by chance. 論点 7)', () => {
    const def = definitionOf(TOOB);
    expect(def.skills.skill2.effects).toEqual([]);
    expect(def.skills.skill2.notes!.map((n) => n.effect?.stat)).toEqual(['critRate', 'attackSpeed']);
  });
});

describe('whileItems', () => {
  const origin = (maxStacks?: number) =>
    ({ kind: 'state', state: 'temporaryModification', grant: { maxStacks }, contents: [] }) as unknown as HeldOrigin;
  const items = [
    { start: 10, end: 400, stack: 1 },
    { start: 60, end: 400, stack: 2 },
    { start: 110, end: 400, stack: 3 },
    { start: 500, end: 800, stack: 1 },
  ];

  it('takes the top stack for "full", N stacks and above for N, and every item without a stack condition', () => {
    expect(whileItems([{ origin: origin(3), items }], 'full')).toEqual([{ start: 110, end: 400 }]);
    expect(whileItems([{ origin: origin(3), items }], 2)).toEqual([{ start: 60, end: 400 }]);
    expect(whileItems([{ origin: origin(3), items }], undefined)).toEqual([
      { start: 10, end: 400 },
      { start: 500, end: 800 },
    ]);
    // 上限の無い付与（スタックしない）はフルスタックにならない
    expect(whileItems([{ origin: origin(undefined), items: [{ start: 0, end: 50 }] }], 'full')).toEqual([]);
  });

  it('merges overlapping and touching items of several tracks into one', () => {
    const other = [{ start: 400, end: 450, stack: 3 }];
    expect(
      whileItems(
        [
          { origin: origin(3), items },
          { origin: origin(3), items: other },
        ],
        'full',
      ),
    ).toEqual([{ start: 110, end: 450 }]);
  });
});

describe('攻撃速度の刻み（C-0600）', () => {
  const sg = character(FA).shot;

  it('multiplies the rate before the 1-shot-per-frame cap', () => {
    expect(rateAfterShots(sg, 3, 1.4224)).toBeCloseTo(90 * 1.4224, 9);
    expect(rateAfterShots(sg, 3, 1000)).toBeCloseTo(60 / 0.017, 9);
  });

  it('shortens the SG intervals to 28・28・27・28・27 from a magazine start, and leaves the reload and charge alone', () => {
    const params = firingParams(sg, { ...ZERO_FIRING_BUFFS, attackSpeed: 0.4224 });
    expect(params.rateScale).toBeCloseTo(1.4224, 12);
    expect(params.reloadChunkFrames).toBe(firingParams(sg).reloadChunkFrames);
    const frames = simulateShotFrames(sg, undefined, params);
    expect(frames.slice(1, 6).map((f, i) => f - frames[i]!)).toEqual([28, 28, 27, 28, 27]);
    // チャージ武器には掛けない（書けない。frame/firing.ts）
    const sr = { ...sg, chargeTime: 1, fullChargeDamage: 2.5, inputType: 'UP' as const };
    expect(firingParams(sr, { ...ZERO_FIRING_BUFFS, attackSpeed: 0.4224 }).rateScale).toBe(1);
  });
});

describe('トーブ（宝物の段階 3）+ ソルジャーF.A.', () => {
  const plan = planTeamRun(team(3));
  const fa = plan.shots[0]!.frames;
  const toob = plan.shots[1]!.frames;

  it('gives the attack speed up to the SG ally from the frame after the 30th shot of Tove (C-0601)', () => {
    const speed = piecesOf(plan).filter((p) => p.effect.stat === 'attackSpeed');
    expect(new Set(speed.map((p) => p.slotIndex))).toEqual(new Set([0]));
    // 敵のジャンプの無い編成では、30 発目の次のフレームから戦闘の終わりまで 3 スタック
    expect(speed.map((p) => [p.start, p.end])).toEqual([[toob[29]! + 1, plan.frames]]);
    expect(speed[0]!.effect.value).toBeCloseTo(0.4224, 12);
  });

  it('keeps the SG intervals at 39・40 f before 3 stacks and shortens them to 27・28 f after (C-0600・C-0601)', () => {
    expect(fa.slice(0, 4)).toEqual([12, 52, 91, 130]);
    const onset = toob[29]! + 1;
    const after = fa.filter((f) => f > onset + 40);
    const gaps = after
      .slice(1)
      .map((f, i) => f - after[i]!)
      .filter((g) => g < 45);
    expect(new Set(gaps)).toEqual(new Set([27, 28]));
    const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    expect(mean).toBeCloseTo(60 / 0.017 / 90 / 1.4224, 1);
  });

  it('adds the critical rate up to every ally, Tove herself included, while at 3 stacks (C-0599)', () => {
    const crit = piecesOf(plan).filter((p) => p.effect.stat === 'critRate' && p.sourceSlotIndex === 1);
    expect(new Set(crit.map((p) => p.slotIndex))).toEqual(new Set([0, 1]));
    expect(crit.every((p) => p.start === toob[29]! + 1)).toBe(true);
    expect(crit[0]!.effect.value).toBeCloseTo(0.1008, 12);
  });

  it('has no S2 effect without the treasure (the base S2 stays notes)', () => {
    const base = planTeamRun(team(0));
    expect(piecesOf(base).filter((p) => p.effect.stat === 'attackSpeed' || p.effect.stat === 'critRate')).toEqual([]);
    const frames = base.shots[0]!.frames.slice(0, 9);
    expect(new Set(frames.slice(1).map((f, i) => f - frames[i]!))).toEqual(new Set([39, 40]));
  });
});

describe('sim vs calc: トーブ（宝物の段階 3）+ ソルジャーF.A.', () => {
  const TEAM = team(3);
  const sim = runSimulation(TEAM);
  const calc = computeTeamDamage(TEAM);
  const plan = planTeamRun(TEAM);

  it('agree on the shot-counted groups and partition every shot into one group', () => {
    TEAM.slots.forEach((_, i) => {
      const groups = simGroupTotals(sim, i);
      calc.slots[i]!.segments.forEach((g, j) => {
        if (g.triggerSource !== 'shots') return;
        expect(g.triggers).toBe(groups[j]!.triggers);
        expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
      });
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});

describe('最小構成の感度（records/sensitivity.ts）', () => {
  it('drops while to keep the effect on through the battle (plus), and removes it (minus)', () => {
    const def = definitionOf(TOOB);
    const ref = { rid: TOOB, root: 'treasureSkills' as const, slot: 'skill2' as const, index: 1 };
    const plus = variantDefinition(def, ref, 'plus', 180)!;
    expect(plus.treasureSkills!.skill2!.effects[1]).not.toHaveProperty('while');
    expect(plus.treasureSkills!.skill2!.effects[1]).toMatchObject({ kind: 'passive', stat: 'attackSpeed' });
    const minus = variantDefinition(def, ref, 'minus', 180)!;
    expect(minus.treasureSkills!.skill2!.effects.map((e) => ('stat' in e ? e.stat : e.kind))).toEqual(['critRate']);
  });
});
