// ナユタ編（plan/design-nayuta.md 2.5・2.6 節）: スタック量増減効果無効（stackImmutable）・使用武器の変更の状態（weaponChange の state）・
// チャージしない武器からチャージ武器への変更の語彙の検証と、Lv ごとの解決値
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withAddedEffects } from '../../records/observations.ts';
import type { CharacterData } from '../../types.ts';
import { isChargeWeapon } from '../../weapons.ts';
import { firesChargeShots, MAX_SKILL_LEVELS, resolveStateGrants, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const NAYUTA = 223;
const raw = readJson<Raw>(`../../../data/skills/${NAYUTA}.json`);
const character = readJson<CharacterData>(`../../../data/characters/${NAYUTA}.json`);
const absorption = raw.skills.skill2.effects.findIndex((e) => e.state === 'memoryAbsorption');

/** 記憶燃焼（仮の値。レートはテストの値で、撮影で読んだものではない） */
const INCINERATION = {
  kind: 'weaponChange',
  trigger: 'burstUse',
  state: 'memoryIncineration',
  damageRef: 3,
  chargeTimeSeconds: 1.8,
  fullChargeDamage: 250,
  durationRef: 4,
  rateOfFire: 60,
};

const edited = (edit: (copy: Raw) => void) => {
  const copy = structuredClone(raw);
  edit(copy);
  return copy;
};
const withIncineration = (patch: Record<string, unknown> = {}) =>
  edited((c) => c.skills.burst.effects.push({ ...INCINERATION, ...patch }));

describe('スタック量増減効果無効（stackImmutable）', () => {
  it('accepts the definition, with the mark on Memory Absorption', () => {
    const def = parseSkillDefinition(raw);
    const grant = def.skills.skill2.effects[absorption]!;
    expect(grant).toMatchObject({ kind: 'state', state: 'memoryAbsorption', stackImmutable: true });
  });

  it('needs stacks and true', () => {
    const without = edited((c) => {
      delete c.skills.skill2.effects[absorption]!.maxStacksRef;
    });
    expect(() => parseSkillDefinition(without)).toThrow(/stackImmutable needs maxStacks/);
    const notTrue = edited((c) => {
      c.skills.skill2.effects[absorption]!.stackImmutable = false;
    });
    expect(() => parseSkillDefinition(notTrue)).toThrow(/expected true/);
  });

  it('rejects a stack change of the state in the same definition', () => {
    for (const decrease of [false, true]) {
      const change = edited((c) =>
        c.skills.skill2.effects.push({
          kind: 'stackChange',
          state: 'memoryAbsorption',
          trigger: 'burstUse',
          target: 'self',
          amount: 1,
          ...(decrease ? { decrease: true } : {}),
        }),
      );
      expect(() => parseSkillDefinition(change)).toThrow(/stackImmutable/);
    }
  });

  it('needs the same mark on every grant of the state', () => {
    const second = edited((c) => {
      const { stackImmutable: _mark, contents: _contents, ...rest } = c.skills.skill2.effects[absorption]!;
      c.skills.skill1.effects.push({ ...rest, trigger: 'battleStart' });
    });
    expect(() => parseSkillDefinition(second)).toThrow(/same stackImmutable/);
  });
});

describe('使用武器の変更の状態（weaponChange の state）', () => {
  it('adds a grant of the state on self with the same trigger and duration at the end of the slot', () => {
    const def = parseSkillDefinition(withIncineration());
    const effects = def.skills.burst.effects;
    const weaponIndex = effects.findIndex((e) => e.kind === 'weaponChange');
    expect(effects.at(-1)).toEqual({
      kind: 'state',
      state: 'memoryIncineration',
      trigger: 'burstUse',
      target: 'self',
      durationRef: 4,
      weaponChangeOf: weaponIndex,
    });
    const grant = resolveStateGrants(def, character, MAX_SKILL_LEVELS).find((g) => g.state === 'memoryIncineration')!;
    const weapon = resolveTimed(def, character, MAX_SKILL_LEVELS).find((t) => t.stat === 'weapon')!;
    expect(grant.durationFrames).toBe(weapon.durationFrames);
    expect(grant.trigger).toEqual(weapon.trigger);
  });

  it('cannot be combined with maxAmmoRef', () => {
    const def = withIncineration({ durationRef: undefined, maxAmmoRef: 4 });
    expect(() => parseSkillDefinition(JSON.parse(JSON.stringify(def)))).toThrow(
      /state cannot be combined with maxAmmoRef/,
    );
  });

  it('does not add the grant twice when the definition is written back and read again', () => {
    const def = parseSkillDefinition(withIncineration());
    const again = withAddedEffects(def, [
      { rid: NAYUTA, skill: 'skill2', effect: { kind: 'passive', target: 'self', stat: 'attack', ref: 6 } },
    ]);
    const count = (d: typeof def) => d.skills.burst.effects.filter((e) => e.kind === 'state').length;
    expect(count(again)).toBe(1);
  });
});

describe('チャージ武器への変更（SMG の記憶燃焼）', () => {
  const def = parseSkillDefinition(withIncineration());
  const weapon = resolveTimed(def, character, MAX_SKILL_LEVELS).find((t) => t.stat === 'weapon')!.weapon!;

  it('makes the changed weapon a charge weapon of 1.8 s and 250% from a non-charge SMG', () => {
    expect(isChargeWeapon(character.shot)).toBe(false);
    expect(weapon.shot).toMatchObject({ inputType: 'UP', chargeTime: 1.8, fullChargeDamage: 2.5, rateOfFire: 60 });
    expect(isChargeWeapon(weapon.shot)).toBe(true);
    // 1 発のダメージは値 03（Lv10 で 275.18%）
    expect(weapon.shot.damage).toBe(27518);
  });

  it('lets the slot fire full-charge shots only through the change', () => {
    expect(firesChargeShots(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS)).toBe(false);
    expect(firesChargeShots(def, character, MAX_SKILL_LEVELS)).toBe(true);
    expect(firesChargeShots(null, character, MAX_SKILL_LEVELS)).toBe(false);
  });

  it('still rejects a full charge damage without the charge time on a non-charge weapon', () => {
    const bad = withIncineration({ chargeTimeSeconds: undefined });
    expect(() =>
      resolveTimed(parseSkillDefinition(JSON.parse(JSON.stringify(bad))), character, MAX_SKILL_LEVELS),
    ).toThrow(/charge weapon/);
  });
});
