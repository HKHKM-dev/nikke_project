// sim-run.ts のラベル（きっかけ・効果の値・件の出どころ・状態の id）
import { describe, expect, it } from 'vitest';
import { characterOf, DEFINED_IDS, rawDefinition } from '../../src/__tests__/data.ts';
import { parseSkillDefinition } from '../../src/skills/parse/definition.ts';
import { resolveTrigger, type ItemEffect, type ResolvedTrigger } from '../../src/skills/resolve.ts';
import { SKILL_SLOTS, type SkillEffect } from '../../src/skills/types.ts';
import { effectValueText, itemLabel, stateLabelOf, triggerLabel } from './labels.ts';

/** 全部の定義の効果（そのスロットの説明文の値つき） */
const EFFECTS = [...DEFINED_IDS].flatMap((rid) => {
  const definition = parseSkillDefinition(rawDefinition(rid));
  const character = characterOf(rid);
  return SKILL_SLOTS.flatMap((slot) =>
    definition.skills[slot].effects.map((effect) => ({ skill: character.skills[slot], effect })),
  );
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
    [{ counterUp: 'heroLevel' }, 'counterUp:heroLevel'],
    [{ stateStacks: 'exp', step: 10 }, 'stateStacks:exp/10'],
    [{ count: 'nonCoreHit', every: 6 }, 'nonCoreHit/6'],
    [{ summon: 'nearFeather', intervalSeconds: { 1: 6.7 }, startDelaySeconds: 0.67 }, 'summon:nearFeather'],
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
    const labels = EFFECTS.flatMap(({ skill, effect }) =>
      'trigger' in effect && effect.trigger !== undefined
        ? [triggerLabel(resolveTrigger(effect.trigger, skill, 10))]
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

describe('itemLabel', () => {
  const item = (fields: Record<string, unknown>): ItemEffect => fields as unknown as ItemEffect;

  it('labels an item by what holds it: the state, the counter, the HP ratio, or else the trigger', () => {
    expect(itemLabel(item({ whileState: 'camouflage' }))).toBe('while:camouflage');
    expect(itemLabel(item({ whileCounter: { counter: 'overEnergyStage', atLeast: 2 } }))).toBe(
      'while:overEnergyStage>=2',
    );
    expect(itemLabel(item({ whileSelfHp: { atLeast: 0.5 } }))).toBe('while:hp>=0.5');
    expect(itemLabel(item({ trigger: { count: 'burstUse', atLeast: 2 } }))).toBe('burstUse≥2');
  });
});

describe('stateLabelOf', () => {
  const effect = (fields: Record<string, unknown>): SkillEffect => fields as unknown as SkillEffect;

  it('adds the state id to the effects that name a state, and nothing to the others', () => {
    expect(stateLabelOf(effect({ kind: 'state', state: 'camouflage' }))).toBe(' camouflage');
    expect(stateLabelOf(effect({ kind: 'removeState', state: 'metalSigma' }))).toBe(' metalSigma');
    expect(stateLabelOf(effect({ kind: 'stackChange', state: 'relax', target: 'self' }))).toBe(' relax');
    // 味方の全部のスタック可能バフへの増減は、状態を名指ししない
    expect(stateLabelOf(effect({ kind: 'stackChange', target: 'allies', allStackable: true }))).toBe(' allStackable');
    expect(stateLabelOf(effect({ kind: 'timed', trigger: 'burstUse' }))).toBe('');
  });
});
