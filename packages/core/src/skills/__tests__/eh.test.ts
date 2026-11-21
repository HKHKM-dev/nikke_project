// E.H. 編（plan/design-eh.md 2.3・8.1 節）: 使用武器の変更の即値の最大装弾数（weaponChange の maxAmmo）と、変更後の武器のコアの倍率
// （coreDamageRate）の検証と、Lv ごとの解決値
import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVELS, resolveCounterWhileEffects, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const EH = 113;
const raw = rawDefinition<Raw>(EH);
const character = characterOf(EH);
const change = raw.skills.burst.effects.findIndex((e) => e.kind === 'weaponChange');

/** バーストの使用武器変更の欄を書き換えた定義（undefined の欄は JSON に戻すと消える） */
const withChange = (patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills.burst.effects[change] = { ...copy.skills.burst.effects[change], ...patch };
  return JSON.parse(JSON.stringify(copy)) as Raw;
};
const LV1 = { skill1: 1, skill2: 1, burst: 1 };

describe('即値の最大装弾数（weaponChange の maxAmmo）', () => {
  it('accepts the definition', () => {
    const def = parseSkillDefinition(raw);
    expect(def.skills.burst.effects[change]).toMatchObject({ kind: 'weaponChange', maxAmmo: 1 });
  });

  it('rejects maxAmmo next to maxAmmoRef, a duration, infinite ammo or a state, and a non-positive count', () => {
    expect(() => parseSkillDefinition(withChange({ maxAmmoRef: 2 }))).toThrow(/at most one of maxAmmoRef and maxAmmo/);
    expect(() => parseSkillDefinition(withChange({ durationRef: 2 }))).toThrow(/maxAmmoRef or maxAmmo ends/);
    expect(() => parseSkillDefinition(withChange({ infiniteAmmo: true }))).toThrow(/infiniteAmmo cannot be combined/);
    for (const bad of [0, 1.5, -1]) expect(() => parseSkillDefinition(withChange({ maxAmmo: bad }))).toThrow();
  });

  it('resolves to a charge weapon with the magazine of one round, ending when it is spent', () => {
    const weapon = resolveTimed(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).find(
      (t) => t.stat === 'weapon',
    )!;
    expect(weapon.durationUntil).toBe('ammoSpent');
    expect(weapon.value).toBeCloseTo(0.61);
    expect(weapon.weapon!.shot).toMatchObject({ maxAmmo: 1, chargeTime: 0.4, fullChargeDamage: 2.5 });
  });
});

describe('変更後の武器のコアの倍率（weaponChange の coreDamageRate）', () => {
  it('replaces the core multiplier of the changed weapon only', () => {
    const weapon = resolveTimed(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).find(
      (t) => t.stat === 'weapon',
    )!;
    expect(weapon.weapon!.shot.coreDamageRate).toBe(2);
    expect(character.shot.coreDamageRate).toBe(2.5);
    const without = resolveTimed(
      parseSkillDefinition(withChange({ coreDamageRate: undefined })),
      character,
      MAX_SKILL_LEVELS,
    );
    expect(without.find((t) => t.stat === 'weapon')!.weapon!.shot.coreDamageRate).toBe(2.5);
  });

  it('needs a multiplier of at least 1', () => {
    for (const bad of [0.5, 0, -1, '2'])
      expect(() => parseSkillDefinition(withChange({ coreDamageRate: bad }))).toThrow();
  });
});

describe('E.H. の Lv ごとの解決値', () => {
  const def = parseSkillDefinition(raw);
  it.each([
    [MAX_SKILL_LEVELS, 0.075, 0.1636, 0.61, 4.3005],
    [LV1, 0.0443, 0.0967, 0.3602, 2.5412],
  ])('levels %o', (levels, magazineAttack, elementDamage, weaponDamage, burstAttack) => {
    const counterWhile = resolveCounterWhileEffects(def, character, levels);
    expect(counterWhile.map((e) => [e.stat, e.value])).toEqual([['attack', magazineAttack]]);
    const timed = resolveTimed(def, character, levels);
    expect(timed.find((t) => t.stat === 'elementDamage')!.value).toBeCloseTo(elementDamage);
    expect(timed.find((t) => t.stat === 'weapon')!.value).toBeCloseTo(weaponDamage);
    expect(timed.find((t) => t.stat === 'attack')!.value).toBeCloseTo(burstAttack);
  });
});
