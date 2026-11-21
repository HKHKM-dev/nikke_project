// ファントム（580）の定義で足した語彙（plan/design-phantom.md 2 節）: 条件「敵が〈状態〉でなければ」（enemyState の present: false）、
// 敵への付与と発数の維持の条件 enemyState、フルスタックの消費のきっかけ（状態の付与・解除・倍率ダメージ）、敵の状態の解除
import { describe, expect, it } from 'vitest';
import { rawDefinition, type RawDefinition } from '../../__tests__/data.ts';
import { characterOf } from '../../__tests__/teamHelpers.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { resolveRemoveStates } from '../resolve.ts';
import { enemyStateOf } from '../types.ts';

const raw = rawDefinition(580);
type Slot = 'skill1' | 'skill2' | 'burst';
const patched = (slot: Slot, index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw) as RawDefinition;
  const effects = copy.skills[slot]!.effects;
  effects[index] = { ...effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const CARD = 0;
const DAGGER = 1;
const ADDITIONAL = 0;
const REMOVE_CARD = 1;

describe('enemyState の否定の形', () => {
  const def = parseSkillDefinition(raw);

  it('reads { state, present: false } and the plain id', () => {
    const card = def.skills.skill1.effects[CARD]!;
    expect(enemyStateOf('condition' in card ? card.condition : undefined)).toEqual({
      state: 'callingCard',
      present: false,
    });
    const additional = def.skills.skill2.effects[ADDITIONAL]!;
    expect(enemyStateOf('condition' in additional ? additional.condition : undefined)).toEqual({
      state: 'callingCard',
      present: true,
    });
  });

  it('rejects present: true and unknown keys', () => {
    expect(patched('skill1', DAGGER, { condition: { enemyState: { state: 'callingCard', present: true } } })).toThrow(
      /expected false/,
    );
    expect(
      patched('skill1', DAGGER, { condition: { enemyState: { state: 'callingCard', present: false, x: 1 } } }),
    ).toThrow(/unknown/);
  });

  it('takes enemyState on a grant on the enemy and with a duration in shots, but not other keys', () => {
    expect(patched('skill1', CARD, { condition: { inFullBurst: true } })).toThrow(
      /a grant on the enemy can only have the conditions selfState and enemyState/,
    );
    const shots = { kind: 'timed', trigger: { count: 'normalHit' }, target: 'self', stat: 'attackDamage', ref: 6 };
    expect(
      patched('skill1', 2, { ...shots, durationShotsRef: 7, condition: { enemyState: 'callingCard' } }),
    ).not.toThrow();
    expect(patched('skill1', 2, { ...shots, durationShotsRef: 7, condition: { inFullBurst: true } })).toThrow(
      /a duration in shots can only have the conditions selfState and enemyState/,
    );
  });
});

describe('フルスタックの消費のきっかけと敵の状態の解除', () => {
  const def = parseSkillDefinition(raw);
  const character = characterOf(580);
  const levels = { skill1: 10, skill2: 10, burst: 10 };

  it('resolves the removal of the Calling Card on the enemy and the Burst removal of the Distributed Damage stacks', () => {
    const removes = resolveRemoveStates(def, character, levels);
    expect(removes.map((r) => [r.state, r.enemy === true, r.trigger])).toEqual([
      ['callingCard', true, { fullStack: 'thiefsDagger' }],
      ['thiefsVision', false, 'burstUse'],
    ]);
  });

  it('needs a grant of the removed state on the enemy', () => {
    expect(patched('skill2', REMOVE_CARD, { state: 'sleepy' })).toThrow(
      /a remove on the enemy needs a grant of "sleepy" on the enemy/,
    );
    expect(patched('skill2', REMOVE_CARD, { target: 'allies' })).toThrow(/expected "self" or "enemy"/);
  });

  it('rejects gaugePerHit on a full-stack damage', () => {
    expect(patched('skill2', ADDITIONAL, { gaugePerHit: true, delayFrames: 1, condition: undefined })).toThrow(
      /gaugePerHit needs a timer trigger/,
    );
  });

  it('needs a grant of the consumed state with stacks for the damage trigger', () => {
    expect(patched('skill2', ADDITIONAL, { trigger: { fullStack: 'wakeUp' } })).toThrow(
      /a full-stack trigger of "wakeUp" needs grants of the same state on self/,
    );
  });
});
