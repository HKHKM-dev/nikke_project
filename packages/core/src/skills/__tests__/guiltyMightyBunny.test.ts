// ギルティ：マイティバニー（404）の定義（plan/design-guilty-mighty-bunny.md 3 節）: 静的な状態（バニーモード：スタンス）を読む書き方と、
// Lv ごとの解決値（マイティストンプの使用武器の変更を含む）
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS, resolveTimed, type SkillLevels } from '../resolve.ts';
import { staticStatesOf } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const GUILTY = 404;
const raw = rawDefinition<Raw>(GUILTY);
const character = characterOf(GUILTY);
const definition = parseSkillDefinition(raw);

describe('バニーモード：スタンス', () => {
  it('is a static state of self (granted at battle start until the end of battle)', () => {
    expect(staticStatesOf(definition)).toEqual(['bunnyModeStance']);
  });

  it('cannot be read by while of a passive, so Chain Enhance is written as timed with a condition', () => {
    const copy = structuredClone(raw);
    copy.skills.skill2.effects[0] = {
      kind: 'passive',
      target: 'self',
      stat: 'attackDamage',
      ref: 2,
      while: { selfState: 'bunnyModeStance' },
    };
    expect(() => parseSkillDefinition(copy)).toThrow(/needs a grant of the same state on self/);
    for (const e of raw.skills.skill2.effects) expect(e.condition).toEqual({ selfState: 'bunnyModeStance' });
  });
});

describe('解決値', () => {
  const timedAt = (levels: SkillLevels) => resolveTimed(definition, character, levels);
  const close = (actual: number[], expected: number[]) =>
    expected.forEach((v, i) => expect(actual[i]).toBeCloseTo(v, 12));
  const nonWeapon = (levels: SkillLevels) =>
    timedAt(levels)
      .filter((t) => t.stat !== 'weapon')
      .map((t) => [t.stat, t.value] as const);

  it('takes the Lv1 and Lv10 values of S1, Chain Enhance and the burst ups from the description', () => {
    const stats = ['attack', 'attackDamage', 'chargeDamage', 'chargeDamage', 'attackDamage'];
    expect(nonWeapon(MAX_SKILL_LEVELS).map(([s]) => s)).toEqual(stats);
    close(
      nonWeapon(MAX_SKILL_LEVELS).map(([, v]) => v),
      [0.201, 0.2045, 0.4, 14, 0.7735],
    );
    close(
      nonWeapon({ skill1: 1, skill2: 1, burst: 1 }).map(([, v]) => v),
      [0.1188, 0.1208, 0.2364, 8.2727, 0.4571],
    );
  });

  it('makes Mighty Stomp a 1-round change of 101.3% with a fixed 1.5 s charge and 250% full charge (Lv10)', () => {
    const [stomp, ...rest] = timedAt(MAX_SKILL_LEVELS).filter((t) => t.stat === 'weapon');
    expect(rest).toEqual([]);
    expect(stomp!.weapon!.shot).toMatchObject({ maxAmmo: 1, chargeTime: 1.5, fullChargeDamage: 2.5, damage: 10130 });
    expect(stomp!.weapon!.fixedChargeTime).toBe(true);
    expect(stomp!.durationUntil).toBe('ammoSpent');
  });

  it('keeps the burst charge damage up for one shot', () => {
    const up = timedAt(MAX_SKILL_LEVELS).find((t) => t.source.skill === 'burst' && t.stat === 'chargeDamage');
    expect(up).toMatchObject({ durationShots: 1 });
  });
});
