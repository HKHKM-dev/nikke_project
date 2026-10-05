// 対象の語彙編（plan/design-target-vocab.md 2 節）: 自分を除く（excludeSelf）・基本チャージ時間の順位（longestChargeTime）・
// 同じ部隊に絞る（targetSquad）と、「チャージ時間 X 秒▼」（chargeSpeed の scaling 'flat'）
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { applyResolvedEffect, ZERO_BUFFS } from '../buffs.ts';
import { applyComposition, fixedTargetsOf } from '../composition.ts';
import { attackRankFor, tiedAtCutoff, type RankSlot } from '../ranking.ts';
import { canEverTarget, isEffectTarget } from '../targets.ts';
import { parseSkillDefinition, type SkillEffect } from '../types.ts';

function definitionWith(effect: Record<string, unknown>): unknown {
  const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-05',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  };
}

const parse = (effect: Record<string, unknown>): SkillEffect =>
  parseSkillDefinition(definitionWith(effect)).skills.skill1.effects[0]!;

const timed = { kind: 'timed', trigger: 'fullBurstStart', stat: 'attack', ref: 1, durationRef: 2 };

describe('自分を除く（excludeSelf）', () => {
  const slot = (attack: number): RankSlot => ({
    casterBaseAttack: attack,
    weaponType: 'AR',
    element: 'Fire',
    passive: ZERO_BUFFS,
  });
  const slots = [slot(300), slot(200), slot(100)];
  const finals = [300, 200, 100];

  it('drops the caster from the ranking, and appends it only for unlessShort', () => {
    expect(attackRankFor({}, slots, finals, 0)).toEqual([0, 1, 2]);
    expect(attackRankFor({ excludeSelf: 'always' }, slots, finals, 0)).toEqual([1, 2]);
    expect(attackRankFor({ excludeSelf: 'unlessShort' }, slots, finals, 0)).toEqual([1, 2, 0]);
  });

  it('targets the top N others, and the caster only when they are short', () => {
    const ch = makeCharacter();
    const targets = (excludeSelf: 'always' | 'unlessShort', count: number, n: number) => {
      const s = slots.slice(0, n);
      const effect = { target: 'topAttack' as const, targetCount: count, excludeSelf };
      const context = { attackRank: attackRankFor(effect, s, finals.slice(0, n), 0) };
      return s.flatMap((_, i) => (isEffectTarget(effect, 0, i, ch, context) ? [i] : []));
    };
    // ミランダ（基礎）: 自分を除く 1 機。自分が攻撃力 1 位でも 2 位の枠に付く
    expect(targets('unlessShort', 1, 3)).toEqual([1]);
    // ミランダ（宝物）: 2 機。味方が 1 体だけなら、その味方と自分
    expect(targets('unlessShort', 2, 2)).toEqual([0, 1]);
    // 単騎なら自分
    expect(targets('unlessShort', 1, 1)).toEqual([0]);
    // 姫野の型（付記なし）: 足りなければ足りないまま
    expect(targets('always', 2, 2)).toEqual([1]);
    expect(targets('always', 1, 1)).toEqual([]);
  });

  it('does not count the appended caster as a tie', () => {
    const rank = attackRankFor({ excludeSelf: 'unlessShort' }, [slot(300), slot(300)], [300, 300], 0);
    expect(rank).toEqual([1, 0]);
    expect(tiedAtCutoff(rank.slice(0, -1), [300, 300], 1)).toBe(false);
  });

  it('marks which slots can ever be a target', () => {
    const ch = makeCharacter();
    expect(canEverTarget({ target: 'topAttack', excludeSelf: 'always' }, 0, 0, ch)).toBe(false);
    expect(canEverTarget({ target: 'topAttack', excludeSelf: 'always' }, 0, 1, ch)).toBe(true);
    // 足りなければ自分も（武器種の条件に依らない）
    expect(canEverTarget({ target: 'topAttack', targetWeapon: 'SR', excludeSelf: 'unlessShort' }, 0, 0, ch)).toBe(true);
  });

  it('parses only on timed topAttack', () => {
    const effect = parse({ ...timed, target: 'topAttack', targetCountRef: 3, excludeSelf: 'unlessShort' });
    expect(effect).toMatchObject({ target: 'topAttack', excludeSelf: 'unlessShort' });
    expect(() => parse({ ...timed, target: 'allies', excludeSelf: 'always' })).toThrow(
      /excludeSelf: only allowed with target "topAttack"/,
    );
    expect(() => parse({ ...timed, target: 'topAttack', targetCount: 1, excludeSelf: 'yes' })).toThrow(/excludeSelf/);
    expect(() => parse({ kind: 'passive', target: 'allies', stat: 'attack', ref: 1, excludeSelf: 'always' })).toThrow(
      /excludeSelf is only allowed in timed/,
    );
  });
});

describe('基本チャージ時間が一番長い味方（longestChargeTime）', () => {
  const ar = makeCharacter({ chargeTime: 0 }, { weaponType: 'AR' });
  const sr = makeCharacter({ chargeTime: 1 }, { weaponType: 'SR' });
  const alice = makeCharacter({ chargeTime: 1.5 }, { weaponType: 'SR' });
  const effect = parse({
    ...timed,
    target: 'longestChargeTime',
    targetCountRef: 3,
    stat: 'chargeSpeed',
    scaling: 'flat',
  });

  it('ranks the slots by base charge time (ties by slot order)', () => {
    expect(fixedTargetsOf(effect, [ar, sr, alice], 0)).toEqual([2, 1, 0]);
    expect(fixedTargetsOf(effect, [sr, ar, sr], 1)).toEqual([0, 2, 1]);
    expect(fixedTargetsOf(effect, [ar, null, sr], 0)).toEqual([2, 0]);
  });

  it('targets the first N of the fixed ranking', () => {
    const def = applyComposition(parseSkillDefinition(definitionWith({ ...effect })), [ar, sr, alice], 0);
    const fixed = def.skills.skill1.effects[0]!;
    expect(fixed).toMatchObject({ fixedTargets: [2, 1, 0] });
    const resolved = {
      ...(fixed as unknown as { target: 'longestChargeTime'; fixedTargets: number[] }),
      targetCount: 1,
    };
    expect([0, 1, 2].filter((i) => isEffectTarget(resolved, 0, i, ar))).toEqual([2]);
    expect([0, 1, 2].filter((i) => isEffectTarget({ ...resolved, targetCount: 2 }, 0, i, ar))).toEqual([1, 2]);
    // 2 回通しても同じ
    expect(applyComposition(def, [ar, sr, alice], 0)).toBe(def);
  });

  it('refuses to target without the composition step', () => {
    expect(() => isEffectTarget({ target: 'longestChargeTime', targetCount: 1 }, 0, 0, ar)).toThrow(/fixedTargets/);
  });

  it('parses only on timed with a count', () => {
    expect(() => parse({ ...timed, target: 'longestChargeTime' })).toThrow(/exactly one of targetCount/);
    expect(() => parse({ kind: 'passive', target: 'longestChargeTime', stat: 'attack', ref: 1 })).toThrow(
      /longestChargeTime is only allowed in timed/,
    );
    expect(() =>
      parse({
        kind: 'cooldownReduction',
        trigger: 'fullBurstEnd',
        target: 'longestChargeTime',
        targetCount: 1,
        ref: 1,
      }),
    ).toThrow(/longestChargeTime is only allowed in timed/);
  });
});

describe('チャージ時間 X 秒▼（chargeSpeed の flat）', () => {
  it('adds seconds to the charge time reduction', () => {
    const applied = applyResolvedEffect(ZERO_BUFFS, { stat: 'chargeSpeed', scaling: 'flat', value: 0.18 }, 0);
    expect(applied.totals.chargeTimeFlat).toBe(0.18);
    expect(applied.totals.maxAmmoFlat).toBe(0);
  });

  it('rejects decrease and other stats', () => {
    expect(() => parse({ ...timed, target: 'self', stat: 'chargeSpeed', scaling: 'flat', decrease: true })).toThrow(
      /do not write decrease/,
    );
    expect(() => parse({ ...timed, target: 'self', stat: 'reloadSpeed', scaling: 'flat' })).toThrow(
      /flat is only allowed with stat "maxAmmo" or "chargeSpeed"/,
    );
  });
});

describe('同じ部隊に絞る（targetSquad）', () => {
  const emma = makeCharacter({}, { squad: 'Absolute' });
  const eunhwa = makeCharacter({}, { squad: 'Absolute', weaponType: 'SR' });
  const delta = makeCharacter({}, { squad: 'Scouting', weaponType: 'SR' });
  const passive = { kind: 'passive', target: 'allies', targetSquad: 'same', stat: 'critDamage', ref: 1 };

  it('targets the slots of the caster squad, the caster included', () => {
    const def = applyComposition(parseSkillDefinition(definitionWith(passive)), [emma, delta, eunhwa], 0);
    const effect = def.skills.skill1.effects[0] as unknown as { target: 'allies'; fixedTargets: number[] };
    expect(effect.fixedTargets).toEqual([0, 2]);
    const chars = [emma, delta, eunhwa];
    expect([0, 1, 2].filter((i) => isEffectTarget(effect, 0, i, chars[i]!))).toEqual([0, 2]);
    expect([0, 1, 2].filter((i) => canEverTarget(effect, 0, i, chars[i]!))).toEqual([0, 2]);
  });

  it('narrows together with the weapon', () => {
    const effect = parse({ ...passive, targetWeapon: 'SR' });
    expect(fixedTargetsOf(effect, [emma, delta, eunhwa], 0)).toEqual([2]);
  });

  it('refuses to target without the composition step', () => {
    expect(() => isEffectTarget({ target: 'allies', targetSquad: 'same' }, 0, 0, emma)).toThrow(/fixedTargets/);
  });

  it('parses only on allies, and not on damageTaken', () => {
    expect(parse({ ...timed, target: 'allies', targetSquad: 'same' })).toMatchObject({ targetSquad: 'same' });
    expect(() => parse({ ...passive, target: 'self' })).toThrow(/targetSquad: only allowed with target "allies"/);
    expect(() => parse({ ...passive, targetSquad: 'other' })).toThrow(/targetSquad/);
    expect(() => parse({ ...passive, stat: 'damageTaken' })).toThrow(
      /cannot narrow its target by weapon, element or squad/,
    );
  });
});
