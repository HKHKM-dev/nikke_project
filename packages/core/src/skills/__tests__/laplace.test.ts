// ラプラス編（plan/design-laplace.md 2 節）: 使用武器の変更の初回ダメージ firstShotDamageRef と、自分の状態の間の発だけの防御力無視
// trueDamageWhile の語彙の検証と、Lv ごとの解決値（S1 のヒーロービジョンのスタックと維持）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition, skillValueOf } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveStateGrants, resolveTimed } from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

type Entry = { effects: Record<string, unknown>[]; notes?: Record<string, unknown>[] };
type Raw = { skills: { skill1: Entry; skill2: Entry; burst: Entry }; treasureSkills: Raw['skills'] };
const LAPLACE = 100;
const character = characterOf(LAPLACE);
const FULL = { selfState: { state: 'heroVision', stacks: 'full' } };
const CHANGE = {
  kind: 'weaponChange',
  trigger: 'burstUse',
  damageRef: 2,
  firstShotDamageRef: 1,
  durationRef: 3,
  pierce: true,
  instantFire: true,
  rateOfFire: 600,
  trueDamageWhile: FULL,
};
/** 宝物版のバーストの変更を書き換えた定義 */
function withChange(patch: Record<string, unknown>, edit: (raw: Raw) => void = () => {}): Raw {
  const raw = structuredClone(rawDefinition<Raw>(LAPLACE));
  raw.treasureSkills.burst.effects = [{ ...CHANGE, ...patch }];
  raw.treasureSkills.burst.notes = raw.treasureSkills.burst.notes!.filter((n) => n.kind === 'noDamage');
  edit(raw);
  return raw;
}

describe('語彙の検証', () => {
  it('accepts the definition and a burst with firstShotDamageRef and trueDamageWhile', () => {
    expect(() => parseSkillDefinition(rawDefinition(LAPLACE))).not.toThrow();
    const def = parseSkillDefinition(withChange({}));
    const change = def.treasureSkills?.burst?.effects[0];
    expect(change).toMatchObject({ firstShotDamageRef: 1, trueDamageWhile: { selfState: { stacks: 'full' } } });
  });

  it('does not combine trueDamageWhile with trueDamage', () => {
    expect(() => parseSkillDefinition(withChange({ trueDamage: true }))).toThrow(
      /trueDamageWhile cannot be combined with trueDamage/,
    );
  });

  it('takes the while form (no stacksBelow, sameFiring, present: false, selfCounter)', () => {
    const at = (selfState: Record<string, unknown>) => withChange({ trueDamageWhile: { selfState } });
    expect(() => parseSkillDefinition(at({ state: 'heroVision', stacksBelow: 5 }))).toThrow(
      /stacksBelow is not allowed/,
    );
    expect(() => parseSkillDefinition(at({ state: 'heroVision', stacks: 5, sameFiring: true }))).toThrow(
      /sameFiring is not allowed/,
    );
    expect(() => parseSkillDefinition(at({ state: 'heroVision', present: false }))).toThrow(/present: false/);
    expect(() =>
      parseSkillDefinition(withChange({ trueDamageWhile: { selfCounter: { counter: 'overEnergy', atLeast: 1 } } })),
    ).toThrow(/trueDamageWhile needs \{ selfState \}/);
  });

  it('needs a stacking grant of the state on self in the definition', () => {
    const noGrant = withChange({}, (raw) => {
      raw.treasureSkills.skill1.effects = [];
    });
    expect(() => parseSkillDefinition(noGrant)).toThrow(/while on "heroVision" needs a grant of the same state/);
  });
});

describe('Lv ごとの解決値', () => {
  const resolveWith = (raw: Raw, treasure: boolean) =>
    applyTreasure(character, parseSkillDefinition(raw), treasure ? 3 : 0).definition!;
  const treasureCharacter = applyTreasure(character, null, 3).character;

  it('resolves Hero Vision: 5 stacks, 15 s (treasure) and 5 s (base)', () => {
    const base = resolveStateGrants(resolveWith(rawDefinition(LAPLACE), false), character, MAX_SKILL_LEVELS);
    expect(base).toHaveLength(1);
    expect(base[0]).toMatchObject({ state: 'heroVision', maxStacks: skillValueOf(LAPLACE, 'skill1', 3) });
    const treasure = resolveStateGrants(resolveWith(rawDefinition(LAPLACE), true), treasureCharacter, MAX_SKILL_LEVELS);
    expect(treasure[0]).toMatchObject({ state: 'heroVision', maxStacks: 5 });
    expect(treasure[0]!.durationFrames).toBeGreaterThan(base[0]!.durationFrames! * 2);
  });

  it('resolves the first damage and the per-shot true damage condition (full = the grant cap)', () => {
    const [change] = resolveTimed(resolveWith(withChange({}), true), treasureCharacter, MAX_SKILL_LEVELS).filter(
      (e) => e.stat === 'weapon',
    );
    const value = (ref: number) => Number(character.treasure!.skills.burst.values[ref - 1]![9]);
    expect(change!.weapon!.firstShotDamage).toBe(Math.round(value(1) * 100));
    expect(change!.weapon!.shot.damage).toBe(Math.round(value(2) * 100));
    expect(change!.weapon!.trueDamageWhile).toEqual({ state: 'heroVision', stacks: 5 });
    expect(change!.weapon!.trueDamage).toBeUndefined();
  });
});
