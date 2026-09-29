// ニヒリスター（261）: 持続ダメージ（dot）の DSL・解決・tick のフレーム（plan/design-nihilister.md 2.1 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dotTickFrames } from '../../frame/plan.ts';
import type { CharacterData } from '../../types.ts';
import { resolveDamageEffects, resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const nihilister = readJson<CharacterData>('../../../data/characters/261.json');
const raw261 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/261.json');

/** 261.json を写して、burst の effects を差し替えた定義を検証にかける */
function withBurst(effects: unknown[]): unknown {
  const copy = structuredClone(raw261) as { skills: Record<string, { effects: unknown[] }> };
  copy.skills.burst!.effects = effects;
  return copy;
}

const BURN = { kind: 'dot', trigger: 'burstUse', ref: 2, intervalSeconds: 1, durationRef: 3 };

describe('dot の検証', () => {
  it('parses the burn of the definition', () => {
    const def = parseSkillDefinition(raw261);
    expect(def.skills.burst.effects[1]).toMatchObject(BURN);
  });

  it('rejects unknown fields, a bad interval and a missing or double duration', () => {
    expect(() => parseSkillDefinition(withBurst([{ ...BURN, target: 'self' }]))).toThrow(/target: unknown field/);
    expect(() => parseSkillDefinition(withBurst([{ ...BURN, intervalSeconds: 0 }]))).toThrow(
      /intervalSeconds: expected a positive finite number/,
    );
    expect(() => parseSkillDefinition(withBurst([{ ...BURN, intervalSeconds: '1' }]))).toThrow(
      /intervalSeconds: expected a positive finite number/,
    );
    const { durationRef: _, ...noDuration } = BURN;
    expect(() => parseSkillDefinition(withBurst([noDuration]))).toThrow(
      /exactly one of durationRef and durationSeconds/,
    );
    expect(() => parseSkillDefinition(withBurst([{ ...BURN, durationSeconds: 10 }]))).toThrow(
      /exactly one of durationRef and durationSeconds/,
    );
  });

  it('rejects an interval longer than an immediate duration', () => {
    const { durationRef: _, ...rest } = BURN;
    expect(() => parseSkillDefinition(withBurst([{ ...rest, intervalSeconds: 3, durationSeconds: 2 }]))).toThrow(
      /intervalSeconds: must not exceed the duration/,
    );
  });
});

describe('dot の解決', () => {
  const def = parseSkillDefinition(raw261);

  it('resolves 1 tick, the interval and the duration by level', () => {
    const [lv10] = resolveDotEffects(def, nihilister, MAX_SKILL_LEVELS);
    expect(lv10).toMatchObject({
      damageType: 'skill',
      trigger: 'burstUse',
      effectIndex: 1,
      dot: { intervalSeconds: 1, durationSeconds: 10 },
    });
    expect(lv10!.multiplier).toBeCloseTo(0.1319, 10);
    const [lv1] = resolveDotEffects(def, nihilister, { skill1: 1, skill2: 1, burst: 1 });
    expect(lv1!.multiplier).toBeCloseTo(0.0748, 10);
  });

  it('is not a damage effect (the burst hit stays in burstDamage)', () => {
    const burst = resolveDamageEffects(def, nihilister, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'burst');
    expect(burst).toEqual([]);
  });

  it('rejects an interval longer than a referenced duration', () => {
    const long = parseSkillDefinition(withBurst([{ ...BURN, intervalSeconds: 11 }]));
    expect(() => resolveDotEffects(long, nihilister, MAX_SKILL_LEVELS)).toThrow(/exceeds the duration/);
  });
});

describe('dotTickFrames（付いた瞬間と、1.5 秒後から 1 秒ごと。C-0101）', () => {
  // 1 秒 = 1 ÷ 0.017 ≒ 58.82f。0 と、k + 0.5 秒後（k = 1 … 9）の時刻を四捨五入する（録画 081 は 0・88・147・205・264・323・382・441・499・558）
  const OFFSETS = [0, 88, 147, 206, 265, 324, 382, 441, 500, 559];

  it('gives 10 ticks: one at the fire, then from 1.5 s every second, rounding each time', () => {
    expect(dotTickFrames([1000], 1, 10, 10588)).toEqual(OFFSETS.map((o) => 1000 + o));
  });

  it('keeps the tick cadence and extends the end when re-applied before it runs out (C-0129)', () => {
    // 1300 の再発火は 1000 の維持（10 秒）のうち。刻みは 1000 のまま、1300 + 559 までの tick が続く
    const extended = [0, 88, 147, 206, 265, 324, 382, 441, 500, 559, 618, 676, 735, 794, 853];
    expect(dotTickFrames([1000, 1300], 1, 10, 10588)).toEqual(extended.map((o) => 1000 + o));
    expect(1000 + extended.at(-1)!).toBeLessThanOrEqual(1300 + 559);
  });

  it('chains several re-applications and starts a new cadence after it runs out', () => {
    // 5 秒維持を 3 秒おきに付け直すと、刻みは 1000 のまま、最後の 1353 + 4.5 秒（265f）= 1618 まで続く。
    // 6588 は 1353 + 5 秒（294f）より後なので新しい刻み
    const ticks = dotTickFrames([1000, 1176, 1353, 6588], 1, 5, 10588);
    expect(ticks.filter((t) => t < 6588)).toEqual(
      [0, 88, 147, 206, 265, 324, 382, 441, 500, 559, 618].map((o) => 1000 + o),
    );
    expect(ticks.filter((t) => t >= 6588)).toEqual([0, 88, 147, 206, 265].map((o) => 6588 + o));
  });

  it('leaves a single fire as it was (10 ticks for 10 s)', () => {
    expect(dotTickFrames([1000, 1000 + 588], 1, 10, 10588)).toEqual([
      ...OFFSETS.map((o) => 1000 + o),
      ...OFFSETS.map((o) => 1588 + o),
    ]);
  });

  it('cuts the ticks at the end of the battle', () => {
    expect(dotTickFrames([10300], 1, 10, 10588)).toEqual(
      OFFSETS.filter((o) => 10300 + o < 10588).map((o) => 10300 + o),
    );
  });

  it('counts floor(duration / interval) ticks', () => {
    expect(dotTickFrames([0], 2, 5, 10588)).toEqual([0, 147]);
  });
});
