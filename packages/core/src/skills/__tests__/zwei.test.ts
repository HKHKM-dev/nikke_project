// ツバイ編（plan/design-zwei.md 2 節）: 使用武器変更の追加効果「貫通特化」（weaponChange の pierce）・変更後の武器の弾の数（shotCount）・
// スタックする N 発間維持（timed の maxStacksRef と durationShotsRef）の語彙の検証と、件の作り方・式
import { describe, expect, it } from 'vitest';
import { normalAttackDamageGroup } from '../../damage.ts';
import { ZERO_BUFFS } from '../buffs.ts';
import { shotCountStackItems } from '../timeline.ts';
import { parseSkillDefinition } from '../types.ts';
import { rawDefinition } from '../../__tests__/teamHelpers.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { treasureSkills: { skill1: Effects; burst: Effects } };
const raw = rawDefinition<Raw>(390);

const patched = (slot: 'skill1' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.treasureSkills[slot].effects[index] = { ...copy.treasureSkills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes pierce only as true and shotCount only as a positive integer', () => {
    expect(patched('burst', 0, { pierce: false })).toThrow(/pierce: expected true/);
    expect(patched('burst', 0, { shotCount: 0 })).toThrow(/shotCount/);
    expect(patched('burst', 0, { shotCount: 1.5 })).toThrow(/shotCount/);
  });

  it('lets a timed effect stack with a duration in shots', () => {
    const def = parseSkillDefinition(raw);
    const stacked = def.treasureSkills?.skill1?.effects[2];
    expect(stacked).toMatchObject({ kind: 'timed', maxStacksRef: 6, durationShotsRef: 7 });
  });

  it('rejects a stacking duration in shots on a state grant (only timed builds those items)', () => {
    expect(patched('burst', 1, { durationRef: undefined, durationShots: 1, maxStacks: 3 })).toThrow(
      /state grant with a duration in shots cannot stack/,
    );
  });
});

describe('スタックする N 発間維持の件（shotCountStackItems。L1）', () => {
  // 持ち主の発 100・200・300。1 発間維持・上限 3
  const shots = [100, 200, 300];

  it('adds a stack per start and ends every stack on the holder’s next shot', () => {
    expect(shotCountStackItems([110, 140, 170, 190], shots, 1, 1000, 3)).toEqual([
      { stack: 1, start: 110, end: 201 },
      { stack: 2, start: 140, end: 201 },
      { stack: 3, start: 170, end: 201 },
    ]);
  });

  it('starts again from one stack after the holder’s shot ends the stacks', () => {
    expect(shotCountStackItems([150, 201, 250], shots, 1, 1000, 3)).toEqual([
      { stack: 1, start: 150, end: 201 },
      { stack: 1, start: 201, end: 301 },
      { stack: 2, start: 250, end: 301 },
    ]);
  });

  it('counts N shots from the latest start and runs to the end without enough shots', () => {
    expect(shotCountStackItems([50, 150], shots, 2, 1000, 3)).toEqual([
      { stack: 1, start: 50, end: 301 },
      { stack: 2, start: 150, end: 301 },
    ]);
    expect(shotCountStackItems([350], shots, 1, 1000, 3)).toEqual([{ stack: 1, start: 350, end: 1000 }]);
  });
});

describe('変更後の武器の貫通特化（plan/design-zwei.md 2.1 節）', () => {
  const weapon = { id: '390.burst.0', hits: 1, shot: {} as never };

  it('adds Pierce Damage up to the Attack Damage up sum on a changed-weapon shot with Pierce', () => {
    const buffs = { ...ZERO_BUFFS, attackDamage: 0.5, pierceDamage: 0.25 };
    expect(normalAttackDamageGroup({ ...buffs, weapon })).toBeCloseTo(1.5, 12);
    expect(normalAttackDamageGroup({ ...buffs, weapon: { ...weapon, pierce: true } })).toBeCloseTo(1.75, 12);
  });
});
