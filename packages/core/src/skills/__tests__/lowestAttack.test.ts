// 最終攻撃力が一番低い味方（lowestAttack）と、順位の対象の基本バースト段階の絞り込み（plan/design-lowest-attack.md 2 節）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { ZERO_BUFFS } from '../buffs.ts';
import { fixedTargetsOf } from '../composition.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { attackRankFor, tiedAtCutoff, type RankSlot } from '../ranking.ts';
import { canEverTarget, dependsOnRank, isEffectTarget } from '../targets.ts';
import type { SkillEffect } from '../types.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-28',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const parse = (effect: Record<string, unknown>): SkillEffect =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

// リバーレリオ S1 の 4 行目の形
const liberalio = {
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'lowestAttack',
  targetCountRef: 8,
  targetBurstStep: 'Step3',
  stat: 'chargeSpeed',
  scaling: 'casterChargeTime',
  ref: 6,
  durationRef: 7,
};

describe('読み込み', () => {
  it('parses lowestAttack with targetBurstStep on timed', () => {
    expect(parse(liberalio)).toMatchObject({ target: 'lowestAttack', targetBurstStep: 'Step3', targetCountRef: 8 });
    // topAttack にも段階を書ける
    expect(parse({ ...liberalio, target: 'topAttack' })).toMatchObject({ targetBurstStep: 'Step3' });
  });

  it('requires N and rejects what topAttack cannot do', () => {
    const { targetCountRef: _, ...noCount } = liberalio;
    expect(() => parse(noCount)).toThrow(/exactly one of targetCount and targetCountRef/);
    expect(() => parse({ ...liberalio, stat: 'attack', scaling: undefined, condition: { inFullBurst: true } })).toThrow(
      /a conditional effect cannot target "lowestAttack"/,
    );
    expect(() => parse({ ...liberalio, excludeSelf: 'always' })).toThrow(/excludeSelf/);
  });

  it('is only allowed in timed', () => {
    expect(() => parse({ kind: 'passive', target: 'lowestAttack', targetCount: 1, stat: 'attack', ref: 1 })).toThrow(
      /lowestAttack is not allowed in passive/,
    );
    expect(() =>
      parse({ kind: 'heal', trigger: 'fullBurstStart', target: 'lowestAttack', targetCount: 1, ref: 1 }),
    ).toThrow(/lowestAttack is only allowed in timed/);
    expect(() =>
      parse({
        kind: 'state',
        state: 'ragingCurrent',
        trigger: 'fullBurstStart',
        target: 'lowestAttack',
        targetCount: 1,
        durationRef: 1,
        contents: [{ stat: 'attackDamage', ref: 2 }],
      }),
    ).toThrow(/lowestAttack is only allowed in timed/);
  });
});

describe('順位', () => {
  const slot = (attack: number): RankSlot => ({
    casterBaseAttack: attack,
    weaponType: 'SR',
    element: 'Fire',
    passive: ZERO_BUFFS,
  });
  const slots = [slot(100), slot(300), slot(200), slot(150)];
  const finals = [100, 300, 200, 150];

  it('ranks from the lowest, ties by the younger slot', () => {
    expect(attackRankFor({ target: 'lowestAttack' }, slots, finals, 1)).toEqual([0, 3, 2, 1]);
    expect(attackRankFor({ target: 'topAttack' }, slots, finals, 1)).toEqual([1, 2, 3, 0]);
    const tied = [200, 300, 200, 150];
    const rank = attackRankFor({ target: 'lowestAttack' }, slots, tied, 1);
    expect(rank).toEqual([3, 0, 2, 1]);
    expect(tiedAtCutoff(rank, tied, 1)).toBe(false);
    expect(tiedAtCutoff(rank, tied, 2)).toBe(true);
  });

  it('ranks only the slots of the burst step (fixedTargets)', () => {
    // 枠 0 は II（一番低いが段階が合わない）。III の枠 1・2・3 のうち一番低い枠 3
    const effect = { target: 'lowestAttack' as const, targetCount: 1, fixedTargets: [1, 2, 3] };
    const rank = attackRankFor(effect, slots, finals, 1);
    expect(rank).toEqual([3, 2, 1]);
    const ch = makeCharacter();
    const targets = slots.flatMap((_, i) => (isEffectTarget(effect, 1, i, ch, { attackRank: rank }) ? [i] : []));
    expect(targets).toEqual([3]);
    // 自分が一番低ければ自分
    const own = attackRankFor(effect, slots, [100, 120, 200, 150], 1);
    expect(slots.flatMap((_, i) => (isEffectTarget(effect, 1, i, ch, { attackRank: own }) ? [i] : []))).toEqual([1]);
  });

  it('depends on the rank, and can ever target only the slots of the step', () => {
    const effect = { target: 'lowestAttack' as const, targetCount: 1, fixedTargets: [1, 2] };
    expect(dependsOnRank(effect)).toBe(true);
    const ch = makeCharacter();
    expect([0, 1, 2, 3].filter((i) => canEverTarget(effect, 1, i, ch))).toEqual([1, 2]);
  });

  it('gets its slots from the basic burst step in the composition', () => {
    const effect = parse(liberalio);
    const iii = makeCharacter({}, { burstStep: 'Step3' });
    const ii = makeCharacter({}, { burstStep: 'Step2' });
    expect(fixedTargetsOf(effect, [ii, iii, iii, ii], 1)).toEqual([1, 2]);
  });
});
