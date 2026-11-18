// レイ（仮称）編（plan/design-rei-tentative.md 2.1・2.2 節）: 他のキャラが敵に付けた状態へのスタック量▲（stackChange の target enemy で、
// 同じ定義に dot が無いもの）と、時間で変わる状態の味方の対象（timed の targetState。編成で targetStateHeld が付く）の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { applyComposition, grantedStatesOf, isHeldTargetState } from '../composition.ts';
import { isEffectTarget } from '../targets.ts';
import { MAX_SKILL_LEVELS, resolveDotStackUps, resolveEnemyStackUps } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import type { SkillEffect } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const REI = 834;
const raw = rawDefinition<Raw>(REI);
const character = characterOf(REI);
const STACK_UP = raw.skills.skill1.effects.findIndex((e) => e.kind === 'stackChange');
const HELD = raw.skills.skill1.effects.findIndex((e) => e.targetState === 'annihilationState');

const patched = (index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills.skill1.effects[index] = { ...copy.skills.skill1.effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes a stack up of an enemy state without a dot in the definition, still only with the condition enemyState', () => {
    expect(patched(STACK_UP, { condition: { inFullBurst: true } })).toThrow(/unknown field \(allowed: enemyState\)/);
    expect(patched(STACK_UP, { condition: { enemyState: 'seaBreeze' } })).toThrow(
      /target enemy needs the condition \{ enemyState: "antiATField" \}/,
    );
  });
});

describe('解決（Lv10）', () => {
  const definition = parseSkillDefinition(raw);

  it('resolves the Anti A.T. Field stack up as a stack up of an enemy grant, not of a dot', () => {
    expect(resolveDotStackUps(definition, character, MAX_SKILL_LEVELS)).toEqual([]);
    const [up, ...rest] = resolveEnemyStackUps(definition, character, MAX_SKILL_LEVELS);
    expect(rest).toEqual([]);
    expect(up).toMatchObject({ state: 'antiATField', amount: 10, condition: { enemyState: 'antiATField' } });
  });
});

describe('時間で変わる状態の味方（編成）', () => {
  const definition = parseSkillDefinition(raw);
  const asuka = parseSkillDefinition(rawDefinition(835));
  const characters = [304, 20, 835, 834].map(characterOf);
  const held = (others: ReadonlySet<never> | Set<string>) =>
    applyComposition(definition, characters, 3, null, [], others as never).skills.skill1.effects[
      HELD
    ] as SkillEffect & {
      fixedTargets?: readonly number[];
      targetStateHeld?: true;
    };

  it('marks the target state as held when another slot grants it over time, with every slot as candidates', () => {
    const e = held(grantedStatesOf(asuka));
    expect(e.targetStateHeld).toBe(true);
    expect(e.fixedTargets).toEqual([0, 1, 2, 3]);
  });

  it('targets no slot when nobody grants the state', () => {
    const e = held(new Set());
    expect(e.targetStateHeld).toBeUndefined();
    expect(e.fixedTargets).toEqual([]);
  });

  it('keeps the static filter when a slot holds the state statically', () => {
    const e = definition.skills.skill1.effects[HELD]!;
    expect(isHeldTargetState(e, [undefined, ['annihilationState']], new Set(['annihilationState']))).toBe(false);
    expect(isHeldTargetState(e, [], new Set(['annihilationState']))).toBe(true);
  });
});

describe('時間で変わる状態の味方（発火の文脈）', () => {
  const slot = { weaponType: 'AR', element: 'Wind' } as const;
  const effect = {
    target: 'allies',
    targetState: 'annihilationState',
    targetStateHeld: true,
    fixedTargets: [0, 1, 2, 3],
  } as const;

  it('targets only the slots holding the state at the fire frame', () => {
    const context = { stateHolders: [2] };
    expect([0, 1, 2, 3].filter((i) => isEffectTarget(effect, 3, i, slot, context))).toEqual([2]);
  });

  it('targets nobody without the fire context, and adds the source with includeSelf', () => {
    expect([0, 1, 2, 3].filter((i) => isEffectTarget(effect, 3, i, slot))).toEqual([]);
    const withSelf = { ...effect, includeSelf: true } as const;
    expect([0, 1, 2, 3].filter((i) => isEffectTarget(withSelf, 3, i, slot, { stateHolders: [2] }))).toEqual([2, 3]);
  });
});
