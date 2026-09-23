// Stage 11 アリス編: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の DSL・解決・順位・対象判定。
// plan/design-stage11.md 17・18 節、22.2 節。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { WeaponType } from '../../types.ts';
import { firingParams } from '../../sim/firing.ts';
import { ZERO_BUFFS, applyResolvedEffect } from '../buffs.ts';
import {
  attackRankFor,
  finalAttacksAt,
  rankByFinalAttack,
  tiedAtCutoff,
  type AttackWindow,
  type RankSlot,
} from '../ranking.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { canEverTarget, dependsOnContext, dependsOnRank, isEffectTarget } from '../targets.ts';
import { parseSkillDefinition } from '../types.ts';

function definition(skills: Record<string, unknown>, resourceId = 1): unknown {
  const none = { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] };
  return {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-24',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

const supported = (...effects: unknown[]) => ({ support: 'supported', effects });

const aliceS1 = {
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'topAttack',
  targetCountRef: 1,
  stat: 'chargeSpeed',
  ref: 2,
  durationRef: 3,
};

describe('parseSkillDefinition (Stage 11 アリス編, 22.2)', () => {
  it('accepts topAttack with targetCountRef / targetCount, any trigger, a weapon and instant effects', () => {
    const def = parseSkillDefinition(
      definition({
        skill1: supported(
          aliceS1,
          { ...aliceS1, trigger: { count: 'normalShot', every: 5 }, targetCountRef: undefined, targetCount: 2 },
          { ...aliceS1, targetWeapon: 'SG' },
          { kind: 'ammoRefill', trigger: 'burstUse', target: 'topAttack', targetCount: 1, ref: 1 },
        ),
      }),
    );
    const effects = def.skills.skill1.effects;
    expect(effects[0]).toMatchObject({ target: 'topAttack', targetCountRef: 1 });
    expect(effects[1]).toMatchObject({ target: 'topAttack', targetCount: 2 });
    expect(effects[1]).not.toHaveProperty('targetCountRef');
    expect(effects[2]).toMatchObject({ targetWeapon: 'SG' });
    expect(effects[3]).toMatchObject({ kind: 'ammoRefill', targetCount: 1 });
  });

  it.each([
    [
      'topAttack in passive',
      { kind: 'passive', target: 'topAttack', stat: 'attack', ref: 1 },
      /not allowed in passive/,
    ],
    ['topAttack without a count', { ...aliceS1, targetCountRef: undefined }, /exactly one of targetCount/],
    ['topAttack with both counts', { ...aliceS1, targetCount: 2 }, /exactly one of targetCount/],
    [
      'a count without topAttack',
      { ...aliceS1, target: 'allies', targetCountRef: 1 },
      /only allowed with target "topAttack"/,
    ],
    ['a zero count', { ...aliceS1, targetCountRef: undefined, targetCount: 0 }, /positive integer/],
    [
      'heal on topAttack',
      { kind: 'heal', trigger: 'burstUse', target: 'topAttack', targetCount: 2, ref: 1 },
      /heal cannot target "topAttack"/,
    ],
  ])('rejects %s', (_name, effect, message) => {
    expect(() => parseSkillDefinition(definition({ skill1: supported(effect) }))).toThrow(message);
  });
});

describe('resolve (topAttack の N)', () => {
  const base = makeCharacter();
  const character = makeCharacter(
    {},
    {
      skills: {
        ...base.skills,
        skill1: {
          id: 1,
          name: { ja: 'S1', en: 'S1' },
          description: { ja: '', en: '' },
          values: ['2', '11.67', '10'].map((v) => Array.from({ length: 10 }, () => v)),
        },
      },
    },
  );

  it('resolves targetCountRef to the level value and keeps it on timed and instant effects', () => {
    const def = parseSkillDefinition(
      definition({
        skill1: supported(aliceS1, {
          kind: 'ammoRefill',
          trigger: 'burstUse',
          target: 'topAttack',
          targetCount: 3,
          ref: 2,
        }),
      }),
    );
    expect(resolveTimed(def, character, MAX_SKILL_LEVELS)[0]).toMatchObject({ target: 'topAttack', targetCount: 2 });
    expect(resolveInstant(def, character, MAX_SKILL_LEVELS)[0]).toMatchObject({ targetCount: 3 });
  });

  it('rejects a non-integer count from the data', () => {
    const def = parseSkillDefinition(definition({ skill1: supported({ ...aliceS1, targetCountRef: 2 }) }));
    expect(() => resolveTimed(def, character, MAX_SKILL_LEVELS)).toThrow(/target count must be a positive integer/);
  });
});

describe('順位（skills/ranking.ts、18 節）', () => {
  const slot = (casterBaseAttack: number, weaponType: WeaponType = 'SR'): RankSlot => ({
    casterBaseAttack,
    weaponType,
    passive: ZERO_BUFFS,
  });
  const attack = (value: number, scaling: 'ratio' | 'casterAttack' = 'ratio') => ({
    stat: 'attack' as const,
    scaling,
    value,
  });

  it('ranks by final attack (ratio and caster-based flat), same-frame windows included, ties by slot order', () => {
    const slots: RankSlot[] = [slot(54316, 'RL'), slot(99925), slot(119896), null, slot(119896, 'AR')];
    const windows: AttackWindow[] = [
      // アリスのバースト（同じフレームに始まる）
      { slotIndex: 2, sourceSlotIndex: 2, effect: attack(0.5512), start: 306, end: 906 },
      // クラウン型の固定加算（発動者 = 枠 1 の 99,925 × 0.5）。フラワーに 306 から
      { slotIndex: 0, sourceSlotIndex: 1, effect: attack(0.5, 'casterAttack'), start: 306, end: 906 },
      // 切れた窓・まだの窓は数えない
      { slotIndex: 4, sourceSlotIndex: 4, effect: attack(1), start: 0, end: 306 },
      { slotIndex: 1, sourceSlotIndex: 1, effect: attack(1), start: 307, end: 900 },
      // 攻撃力以外は数えない
      {
        slotIndex: 1,
        sourceSlotIndex: 1,
        effect: { stat: 'chargeSpeed', scaling: 'ratio', value: 5 },
        start: 0,
        end: 900,
      },
    ];
    const finals = finalAttacksAt(slots, windows, 306);
    expect(finals[2]).toBeCloseTo(119896 * 1.5512, 6);
    expect(finals[0]).toBeCloseTo(54316 + 99925 * 0.5, 6);
    expect(finals[3]).toBeNull();
    expect(finals[4]).toBe(119896);
    expect(rankByFinalAttack(finals)).toEqual([2, 4, 0, 1]);
    // 同値は枠の若い順
    expect(rankByFinalAttack([100, 200, 200, null, 100])).toEqual([1, 2, 0, 4]);
    expect(tiedAtCutoff([1, 2, 0], [100, 200, 200], 1)).toBe(true);
    expect(tiedAtCutoff([1, 2, 0], [100, 200, 200], 2)).toBe(false);
    // 武器種で絞ってから並べる
    expect(attackRankFor({ targetWeapon: 'SR' }, slots, finals)).toEqual([2, 1]);
  });

  it('includes passive attack in the final attack', () => {
    const slots: RankSlot[] = [
      { ...slot(100)!, passive: { ...ZERO_BUFFS, attackRatio: 0.5, attackFlat: 10 } },
      slot(155),
    ];
    expect(finalAttacksAt(slots, [], 0)).toEqual([160, 155]);
  });
});

describe('対象判定（topAttack）', () => {
  const e = { target: 'topAttack' as const, targetCount: 2 };

  it('takes the first N of the attack rank, nobody without a rank', () => {
    const context = { attackRank: [2, 1, 4, 0] };
    expect([0, 1, 2, 3, 4].filter((i) => isEffectTarget(e, 2, i, 'SR', context))).toEqual([1, 2]);
    expect(isEffectTarget(e, 2, 2, 'SR', null)).toBe(false);
    expect(isEffectTarget(e, 2, 2, 'SR', { burstUsers: [2] })).toBe(false);
    // 候補が N 未満なら全員
    expect(isEffectTarget({ target: 'topAttack', targetCount: 5 }, 0, 4, 'SR', context)).toBe(true);
    // 武器種の条件
    expect(isEffectTarget({ ...e, targetWeapon: 'SG' }, 2, 2, 'SR', context)).toBe(false);
  });

  it('depends on the context and the rank; can target anyone with the weapon', () => {
    expect(dependsOnContext(e)).toBe(true);
    expect(dependsOnRank(e)).toBe(true);
    expect(dependsOnRank({ target: 'burstUsers' })).toBe(false);
    expect(canEverTarget(e, 0, 3, 'AR')).toBe(true);
    expect(canEverTarget({ ...e, targetWeapon: 'SG' }, 0, 3, 'AR')).toBe(false);
    expect(canEverTarget({ target: 'self' }, 0, 3, 'AR')).toBe(false);
  });
});

describe('発動者基準のチャージ速度（scaling casterChargeTime、録画 42 で確定）', () => {
  it('is only allowed with stat chargeSpeed', () => {
    expect(() =>
      parseSkillDefinition(
        definition({ skill1: supported({ ...aliceS1, stat: 'attack', scaling: 'casterChargeTime' }) }),
      ),
    ).toThrow(/casterChargeTime is only allowed with stat "chargeSpeed"/);
  });

  it('resolves to seconds of the caster’s base charge time and subtracts them after the ratio', () => {
    const base = makeCharacter();
    const caster = makeCharacter(
      { chargeTime: 1.5, inputType: 'UP' },
      {
        skills: {
          ...base.skills,
          skill1: {
            id: 1,
            name: { ja: 'S1', en: 'S1' },
            description: { ja: '', en: '' },
            values: ['2', '11.67', '10'].map((v) => Array.from({ length: 10 }, () => v)),
          },
        },
      },
    );
    const def = parseSkillDefinition(definition({ skill1: supported({ ...aliceS1, scaling: 'casterChargeTime' }) }));
    const [effect] = resolveTimed(def, caster, MAX_SKILL_LEVELS);
    expect(effect!.value).toBeCloseTo(0.1167 * 1.5, 12);
    const totals = applyResolvedEffect(ZERO_BUFFS, effect!, 0).totals;
    expect(totals.chargeTimeFlat).toBeCloseTo(0.17505, 12);
    expect(totals.chargeSpeed).toBe(0);
    // アドミ（1 秒）: 60 − 10.5 = 49.5 → 50f（録画 42 の間隔 72f = 50 + 22）
    const admi = makeCharacter({ chargeTime: 1, inputType: 'UP' }).shot;
    expect(firingParams(admi, totals).chargeFrames).toBe(50);
    // アリス自身（1.5 秒・バースト 80.15%）: 1.5 × 0.1985 − 0.175 = 0.1227 秒 → 8f（比率 11.67% と同じ）
    const alice = makeCharacter({ chargeTime: 1.5, inputType: 'UP' }).shot;
    expect(firingParams(alice, { ...totals, chargeSpeed: 0.8015 }).chargeFrames).toBe(8);
    // 0 未満にはならない
    expect(firingParams(admi, { ...totals, chargeTimeFlat: 2 }).chargeFrames).toBe(0);
  });
});
