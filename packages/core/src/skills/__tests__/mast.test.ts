// マスト編（plan/design-mast.md 2 節）: 敵に付く状態のスタック・発動者基準の防御力▼（casterDefence）・状態のスタックを写す周期のダメージ
// （dot の stacksFrom の元に状態の付与・copyEachTick・sustained: false）・スタックの維持の数え方（stackRefresh）の語彙の検証と式
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defenceAfterDown, type EnemyInput } from '../../damage.ts';
import { applyResolvedEffect, ZERO_BUFFS } from '../buffs.ts';
import { resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveStateGrants } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';
import type { CharacterData } from '../../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type Effects = { effects: Record<string, unknown>[] };
const MAST = 350;
const raw = readJson<{ skills: { skill1: Effects; skill2: Effects; burst: Effects } }>(
  `../../../data/skills/${MAST}.json`,
);
const character = readJson<CharacterData>(`../../../data/characters/${MAST}.json`);
const seaBreeze = raw.skills.skill1.effects.findIndex((e) => e.kind === 'state');
const storm = raw.skills.burst.effects.findIndex((e) => e.kind === 'dot');

const patched = (slot: 'skill1' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('allows stacks on a grant on the enemy', () => {
    const grant = resolveStateGrants(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS).find(
      (g) => g.state === 'seaBreeze',
    )!;
    expect(grant).toMatchObject({ enemy: true, maxStacks: 50 });
  });

  it('allows casterDefence only with enemyDefenseDown', () => {
    const contents = (stat: string) => [{ stat, scaling: 'casterDefence', ref: 2 }];
    expect(patched('skill1', seaBreeze, { contents: contents('damageTaken') })).toThrow(
      /casterDefence is only allowed with stat "enemyDefenseDown"/,
    );
  });

  it('takes stackRefresh "each" only on a grant with stacks', () => {
    expect(patched('skill1', seaBreeze, { stackRefresh: 'each' })).not.toThrow();
    expect(patched('skill1', seaBreeze, { stackRefresh: 'all' })).toThrow(/expected "each"/);
    expect(patched('skill1', seaBreeze, { maxStacksRef: undefined, stackRefresh: 'each' })).toThrow(
      /stackRefresh needs maxStacks or maxStacksRef/,
    );
  });

  it('takes copyEachTick only with stacksFrom, and sustained only as false', () => {
    expect(patched('burst', storm, { copyEachTick: true })).not.toThrow();
    expect(patched('burst', storm, { copyEachTick: false })).toThrow(/expected true/);
    expect(patched('burst', storm, { stacksFrom: undefined, copyEachTick: true })).toThrow(
      /copyEachTick needs stacksFrom/,
    );
    expect(patched('burst', storm, { sustained: true })).toThrow(/expected false/);
  });

  it('needs the copied state as a dot or a grant on the enemy with stacks', () => {
    expect(patched('skill1', seaBreeze, { maxStacksRef: undefined })).toThrow(
      /stacksFrom needs a dot of the state "seaBreeze", or a grant of it on the enemy with stacks/,
    );
  });

  it('does not mark Storm as sustained damage', () => {
    const dots = resolveDotEffects(parseSkillDefinition(raw), character, MAX_SKILL_LEVELS);
    expect(dots).toHaveLength(1);
    expect(dots[0]!.sustained).toBeUndefined();
    expect(dots[0]!.dot).toMatchObject({
      stacksFrom: 'seaBreeze',
      state: 'storm',
      intervalSeconds: 1,
      durationSeconds: 7,
    });
  });
});

describe('発動者基準の防御力▼の式', () => {
  const enemy: EnemyInput = { defence: 100, element: null, hasCore: true };

  it('subtracts the caster base DEF × X% per application, and needs the caster DEF', () => {
    const effect = { stat: 'enemyDefenseDown' as const, scaling: 'casterDefence' as const, value: 0.019 };
    const once = applyResolvedEffect(ZERO_BUFFS, effect, 0, undefined, 1000);
    expect(once.appliedAmount).toBeCloseTo(19, 9);
    expect(once.totals.enemyDefenseDownFlat).toBeCloseTo(19, 9);
    expect(once.totals.enemyDefenseDown).toBe(0);
    expect(() => applyResolvedEffect(ZERO_BUFFS, effect, 0)).toThrow(/casterDefence needs the base defence/);
  });

  it('subtracts the flat down after the ratio down, stops at 0 and rounds after (未確定の仮の形)', () => {
    expect(defenceAfterDown(enemy, { ...ZERO_BUFFS, enemyDefenseDownFlat: 19.4 })).toBe(81);
    expect(defenceAfterDown(enemy, { ...ZERO_BUFFS, enemyDefenseDown: 0.5, enemyDefenseDownFlat: 19.4 })).toBe(31);
    expect(defenceAfterDown(enemy, { ...ZERO_BUFFS, enemyDefenseDownFlat: 338 })).toBe(0);
  });
});
