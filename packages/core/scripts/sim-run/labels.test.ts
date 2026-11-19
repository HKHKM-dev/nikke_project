// sim-run.ts のラベル（きっかけ・効果の値・状態の id）と、同じ効果の段のまとめ
import { describe, expect, it } from 'vitest';
import { characterOf, DEFINED_IDS, rawDefinition } from '../../src/__tests__/data.ts';
import { parseSkillDefinition } from '../../src/skills/parse/definition.ts';
import { resolveTrigger, type ItemEffect, type ResolvedTrigger } from '../../src/skills/resolve.ts';
import { SKILL_SLOTS, type SkillEffect } from '../../src/skills/types.ts';
import { compactTimed, effectValueText, stateLabelOf, triggerLabel } from './labels.ts';

/** 全部の定義の効果（キャラ・スロットつき） */
const EFFECTS = [...DEFINED_IDS].flatMap((rid) => {
  const definition = parseSkillDefinition(rawDefinition(rid));
  return SKILL_SLOTS.flatMap((slot) => definition.skills[slot].effects.map((effect) => ({ rid, slot, effect })));
});

describe('triggerLabel', () => {
  const CASES: [ResolvedTrigger, string][] = [
    ['burstUse', 'burstUse'],
    [{ counterFull: 'overEnergy' }, 'counterFull:overEnergy'],
    [{ everySeconds: 20 }, 'every20s'],
    [{ everySeconds: 0.2, carry: true, since: { applied: 'transformation' } }, 'every0.2s:since:transformation'],
    [{ applied: 'memoryAbsorption' }, 'applied:memoryAbsorption'],
    [{ buffApplied: 'sustainedDamage' }, 'buffApplied:sustainedDamage'],
    [{ fullStack: 'strawberryCandy' }, 'fullStack:strawberryCandy'],
    [{ weaponChangeEnd: true }, 'weaponChangeEnd'],
    [{ reloadEnd: true }, 'reloadEnd'],
    [{ coverHealed: true }, 'coverHealed'],
    [{ skillFired: 'skill2' }, 'skillFired:skill2'],
    [{ chargeTick: { everySeconds: 0.2 } }, 'chargeTick0.2s'],
    [{ chargeFull: true }, 'chargeFull'],
    [{ selfHpAtMost: 0.6 }, 'hp<=60%'],
    [{ adjacentHpAtMost: 0.905 }, 'adjacentHp<=90.5%'],
    [{ adjacentHpFull: true }, 'adjacentHpFull'],
    [{ ended: 'firepowerCharge' }, 'ended:firepowerCharge'],
    [{ count: 'lastShot', every: 1 }, 'lastShot/1'],
    [{ count: 'normalShot', every: 1, chance: 0.05 }, 'normalShot@5%'],
    [{ count: 'teamHit', every: 100, during: { state: 'ghostPossession' } }, 'teamHit/100@ghostPossession'],
    [{ count: 'normalHit', every: 36, during: 'fullBurst' }, 'normalHit/36@fullBurst'],
    [{ count: 'normalHit', every: 36, during: 'fullBurst', reset: 'fullBurstStart' }, 'normalHit/36@fullBurst!'],
    [{ count: 'fullBurstStart', atLeast: 1 }, 'fullBurstStart≥1'],
    [{ count: 'fullBurstStart', atLeast: 1, atMost: 1 }, 'fullBurstStart≥1≤1'],
  ];

  it.each(CASES)('labels %j as %s', (trigger, label) => {
    expect(triggerLabel(trigger)).toBe(label);
  });

  // きっかけの形を足したときに、ラベルに穴（undefined・NaN・オブジェクトのまま）が出ないこと
  it('labels the trigger of every effect of every definition without holes', () => {
    const labels = EFFECTS.flatMap(({ rid, slot, effect }) =>
      'trigger' in effect && effect.trigger !== undefined
        ? [triggerLabel(resolveTrigger(effect.trigger, characterOf(rid).skills[slot], 10))]
        : [],
    );
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.filter((label) => label === '' || /undefined|NaN|\[object/.test(label))).toEqual([]);
  });
});

describe('effectValueText', () => {
  const effect = (fields: Pick<ItemEffect, 'stat' | 'value' | 'scaling'>): ItemEffect => fields as ItemEffect;

  it('writes a ratio as a percentage with the sign, and a flat value as it is', () => {
    expect(effectValueText(effect({ stat: 'attack', value: 0.1425, scaling: 'ratio' }))).toBe('attack+14.25%');
    expect(effectValueText(effect({ stat: 'defense', value: -0.2, scaling: 'ratio' }))).toBe('defense-20.00%');
    expect(effectValueText(effect({ stat: 'maxAmmo', value: 3, scaling: 'flat' }))).toBe('maxAmmo+3');
    // チャージ速度の固定値は秒
    expect(effectValueText(effect({ stat: 'chargeSpeed', value: 0.5, scaling: 'flat' }))).toBe('chargeSpeed+0.5s');
  });

  it('marks the values that are scaled by something else', () => {
    const caster = effect({ stat: 'defense', value: 0.1, scaling: 'casterDefence' });
    expect(effectValueText(caster)).toBe('defense+(caster 10.00%)');
    // 掛けた後の量が分かれば、先に出す
    expect(effectValueText(caster, 1234.6)).toBe('defense+1235 (caster 10.00%)');
    expect(effectValueText(effect({ stat: 'chargeDamage', value: 0.02, scaling: 'perFinalMaxAmmo' }))).toBe(
      'chargeDamage+2.00% × max ammo',
    );
  });
});

describe('stateLabelOf', () => {
  it('adds the state id to the effects that name a state, and nothing to the others', () => {
    const expected = (effect: SkillEffect): string => {
      if (effect.kind === 'stackChange') return effect.target === 'allies' ? ' allStackable' : ` ${effect.state}`;
      return effect.kind === 'state' || effect.kind === 'removeState' ? ` ${effect.state}` : '';
    };
    const kinds = new Set<string>();
    for (const { effect } of EFFECTS) {
      const label = stateLabelOf(effect);
      expect(label).toBe(expected(effect));
      if (label !== '') kinds.add(effect.kind);
    }
    // 定義に、状態を指す 3 種類が全部ある（どれかが無くなったら、このテストは何も見ていない）
    expect([...kinds].sort()).toEqual(['removeState', 'stackChange', 'state']);
  });
});

describe('compactTimed', () => {
  const item = (sourceSlotIndex: number, skill: string, effectIndex: number, subIndex?: number) => ({
    sourceSlotIndex,
    effectIndex,
    ...(subIndex === undefined ? {} : { subIndex }),
    source: { skill },
  });

  it('merges the tiers of the same effect, keeping the first one and the order', () => {
    const a = item(0, 'skill1', 0);
    const b = item(1, 'skill1', 0);
    expect(compactTimed([a, b, item(0, 'skill1', 0), item(0, 'skill1', 0)])).toEqual([
      { e: a, n: 3 },
      { e: b, n: 1 },
    ]);
  });

  it('keeps apart the effects that differ in the slot, the skill, the effect index or the content index', () => {
    const items = [
      item(0, 'skill1', 0),
      item(0, 'skill2', 0),
      item(0, 'skill1', 1),
      item(0, 'skill1', 0, 0),
      item(0, 'skill1', 0, 1),
    ];
    expect(compactTimed(items).map((x) => x.n)).toEqual([1, 1, 1, 1, 1]);
    expect(compactTimed([])).toEqual([]);
  });
});
