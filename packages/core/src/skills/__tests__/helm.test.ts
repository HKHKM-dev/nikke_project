// ヘルム編: DSL の追加（stat の normalCritRate・chargeDamageMultiplier、即時効果 burstGauge、timed の「N 発間維持」）。
// plan/design-helm.md 2 節・V-0033。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { computeTriggerDamage } from '../../damage.ts';
import type { CharacterData } from '../../types.ts';
import { applyChargeBuffs, ZERO_BUFFS } from '../buffs.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveTimed } from '../resolve.ts';
import { shotCountWindows } from '../timeline.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

function definition(skills: Partial<Record<keyof SkillDefinition['skills'], unknown>>): unknown {
  const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-09-28',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

const supported = (...effects: unknown[]) => ({ effects });
const parseOne = (effect: unknown) => () => parseSkillDefinition(definition({ skill1: supported(effect) }));

describe('parseSkillDefinition（ヘルム編）', () => {
  it('accepts the new stats, burstGauge and a duration in shots', () => {
    expect(
      parseOne({
        kind: 'timed',
        trigger: { count: 'lastShot' },
        target: 'allies',
        stat: 'normalCritRate',
        ref: 1,
        durationRef: 2,
      }),
    ).not.toThrow();
    expect(
      parseOne({ kind: 'burstGauge', trigger: { count: 'fullChargeShot' }, target: 'allies', ref: 4 }),
    ).not.toThrow();
    expect(
      parseOne({
        kind: 'timed',
        trigger: 'burstUse',
        target: 'self',
        stat: 'chargeDamageMultiplier',
        ref: 4,
        durationShotsRef: 5,
      }),
    ).not.toThrow();
    expect(
      parseOne({
        kind: 'timed',
        trigger: 'fullBurstStart',
        target: 'allies',
        stat: 'critDamage',
        ref: 1,
        durationShots: 3,
      }),
    ).not.toThrow();
  });

  it('accepts gaugeHits on damage only with a shot count trigger (V-0034)', () => {
    const damage = { kind: 'damage', ref: 4, damageType: 'additional' };
    expect(parseOne({ ...damage, trigger: { count: 'fullChargeShot' }, gaugeHits: [1] })).not.toThrow();
    expect(parseOne({ ...damage, trigger: 'burstUse', gaugeHits: [1] })).toThrow(/shot count/);
    // V-0035: 遅れ 0（発と同じフレーム）は書ける。負は不可
    expect(parseOne({ ...damage, trigger: { count: 'normalHit' }, gaugeHits: [0] })).not.toThrow();
    expect(parseOne({ ...damage, trigger: { count: 'fullChargeShot' }, gaugeHits: [-1] })).toThrow(/non-negative/);
    expect(parseOne({ ...damage, trigger: { count: 'normalHit', stacksRef: 1 }, gaugeHits: [1] })).toThrow(/stacksRef/);
  });

  it('rejects burstGauge that does not target the whole team', () => {
    expect(parseOne({ kind: 'burstGauge', trigger: 'burstUse', target: 'self', ref: 1 })).toThrow(/allies/);
    expect(parseOne({ kind: 'burstGauge', trigger: 'burstUse', target: 'allies', targetWeapon: 'SR', ref: 1 })).toThrow(
      /narrow/,
    );
  });

  it('rejects a duration in shots mixed with seconds, stacks, conditions or stats tracked in the first pass', () => {
    const timed = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'chargeDamage', ref: 1 };
    expect(parseOne({ ...timed, durationShots: 10, durationRef: 2 })).toThrow(/either in seconds or in shots/);
    expect(parseOne({ ...timed, durationShots: 10, durationShotsRef: 2 })).toThrow(/at most one/);
    expect(parseOne({ ...timed, durationShots: 10, maxStacks: 3 })).toThrow(/cannot stack/);
    expect(parseOne({ ...timed, durationShots: 10, condition: { selfBuffed: 'attack' } })).toThrow(/condition/);
    for (const stat of ['attack', 'reloadSpeed', 'hitRate']) {
      expect(parseOne({ ...timed, stat, durationShots: 10 })).toThrow(/first pass/);
    }
    expect(parseOne({ ...timed, durationShots: 0 })).toThrow();
  });
});

describe('ヘルム（352）の定義の解決', () => {
  const character = readJson<CharacterData>('../../../data/characters/352.json');
  const base = parseSkillDefinition(readJson<unknown>('../../../data/skills/352.json'));
  const treasure = applyTreasure(character, base, 3);

  it('resolves the treasure version at Lv10 (段階 3)', () => {
    const timed = resolveTimed(treasure.definition!, treasure.character, MAX_SKILL_LEVELS);
    const crit = timed.find((e) => e.stat === 'normalCritRate')!;
    expect(crit.value).toBeCloseTo(0.1464, 12);
    expect(crit.target).toBe('allies');
    const charge = timed.find((e) => e.stat === 'chargeDamageMultiplier')!;
    expect(charge.value).toBeCloseTo(1.584, 12);
    expect(charge.durationShots).toBe(10);
    // 発数の維持は 1 パス目のループで追わない（窓は planBuffTimeline が射撃の列から作る）
    expect(charge.durationFrames).toBe(0);
    const gauge = resolveInstant(treasure.definition!, treasure.character, MAX_SKILL_LEVELS).find(
      (e) => e.kind === 'burstGauge',
    )!;
    expect(gauge.value).toBeCloseTo(0.1431, 12);
  });

  it('resolves the base version with the same vocabulary (C-0098)', () => {
    const timed = resolveTimed(base, character, MAX_SKILL_LEVELS);
    expect(timed.map((e) => e.stat).sort()).toEqual(['attackDamage', 'normalCritRate']);
    expect(resolveInstant(base, character, MAX_SKILL_LEVELS)).toEqual([]);
  });
});

describe('shotCountWindows（N 発間維持）', () => {
  it('lasts until the Nth shot at or after the start (inclusive)', () => {
    expect(shotCountWindows([10], [5, 10, 20, 30, 40], 2, 100)).toEqual([[10, 21]]);
  });

  it('runs to the end of the battle when fewer than N shots are left', () => {
    expect(shotCountWindows([10], [20, 30], 3, 100)).toEqual([[10, 100]]);
  });

  it('counts again from a refire during the window (union)', () => {
    expect(shotCountWindows([10, 25], [20, 30, 40, 50], 2, 100)).toEqual([[10, 41]]);
    expect(shotCountWindows([10, 60], [20, 30, 70, 80], 2, 100)).toEqual([
      [10, 31],
      [60, 81],
    ]);
  });
});

describe('ダメージの式（ヘルム編）', () => {
  it('multiplies the full charge multiplier by (1 + chargeDamageMultiplier), then adds chargeDamage (C-0122)', () => {
    expect(applyChargeBuffs(2.5, true, { ...ZERO_BUFFS, chargeDamageMultiplier: 1.584 })).toBeCloseTo(2.5 * 2.584, 12);
    expect(applyChargeBuffs(2.5, true, { ...ZERO_BUFFS, chargeDamage: 0.2, chargeDamageMultiplier: 1 })).toBeCloseTo(
      5.2,
      12,
    );
    expect(applyChargeBuffs(2.5, false, { ...ZERO_BUFFS, chargeDamageMultiplier: 1.584 })).toBe(1);
  });

  it('adds normalCritRate to the crit rate of normal attacks only, not to per-shot skill damage', () => {
    const character = makeCharacter({}, { bonusRange: null });
    const input = (buffs = ZERO_BUFFS) => ({
      character,
      growth: {},
      attackOverride: 1100,
      enemy: { defence: 100, element: null, hasCore: false },
      condition: { coreHitRate: 0, distanceBonus: false, fullCharge: false },
      buffs,
      perShot: [
        {
          source: { resourceId: 1, skill: 'skill2' as const, name: { ja: '', en: '' } },
          damageType: 'additional' as const,
          multiplier: 1,
        },
      ],
    });
    const base = computeTriggerDamage(input() as never);
    const up = computeTriggerDamage(input({ ...ZERO_BUFFS, normalCritRate: 0.2 }) as never);
    expect(up.boost.crit - base.boost.crit).toBeCloseTo(0.2 * (character.crit.damage - 1), 12);
    expect(up.normal).toBeGreaterThan(base.normal);
    expect(up.perShot).toBeCloseTo(base.perShot, 12);
  });
});
