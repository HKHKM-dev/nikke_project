// V-0119: 1 発の通常攻撃のヒット数（的の表の hitsPerShot）と、爆発の範囲まで書いた弾の種類の行。
// V-0186（C-0282）: アニス：スターの 2 ヒットはコアの 1 ヒットだったので、実データの表に hitsPerShot の行は無い。語彙はテスト用の表で見る。
//   1. データと検証: `<fireType>:<弾速>:<爆発の範囲>` の行は範囲が合うキャラだけが先に引き、ほかは今までの行のまま
//   2. 自動の条件: 範囲 750 の誘導弾はコア 0・距離帯ごとのヒット数、範囲 500 は今までどおり（ヒット数なし）
//   3. 1 トリガーの式: ヒット数は通常攻撃の分にだけ掛かり、射撃ごとの倍率ダメージとゲージには掛からない
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage, hitsPerShotOf, type EnemyInput } from '../damage.ts';
import { parseEnemyPresets } from '../enemies.ts';
import { autoConditionAt, rateRowOf, targetRateOf } from '../frame/landing.ts';
import type { SlotCondition } from '../team.ts';
import type { CharacterData, LandingPoint } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const raw = JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as Record<
  string,
  unknown
>;
const master = parseEnemyPresets(raw);
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 };

function homingRl(explosionRange: number): CharacterData {
  return makeCharacter(
    { fireType: 'HomingProjectile', projectile: { speed: 100, homing: 'lv1', radius: 50, explosionRange } },
    { weaponType: 'RL', bonusRange: null },
  );
}
const R500 = homingRl(500);
const R750 = homingRl(750);
const anis = JSON.parse(
  readFileSync(new URL('../../data/characters/17.json', import.meta.url), 'utf8'),
) as CharacterData;

// テスト用の hitsPerShot の表（実データには無い）
const TEST_HITS = { RL: { byProjectile: { 'HomingProjectile:100:750': { near: 2, far: 1.3922 } } } };
const at = (band: string): LandingPoint => profile.landings.find((l) => l.band === band)!;

describe('爆発の範囲まで書いた弾の種類の行', () => {
  it('looks up the explosion-range row first and falls back to the speed row', () => {
    expect(rateRowOf(profile.coreHitRate, R750)).toEqual({ near: 1, midNear: 0.8958, far: 0.3922, midFar: 0.875 });
    expect(rateRowOf(profile.coreHitRate, R500)).toBe(rateRowOf(profile.coreHitRate, homingRl(300)));
    expect(targetRateOf(profile.coreHitRate, R500, at('near'))).toBeCloseTo(0.9817, 12);
    expect(targetRateOf(profile.coreHitRate, anis, at('far'))).toBeCloseTo(0.3922, 12);
  });

  it('has no hits per shot row in the data (C-0282), and looks up a test row like the other tables', () => {
    expect(profile.hitsPerShot).toBeUndefined();
    const hits = TEST_HITS;
    expect(targetRateOf(hits, R750, at('near'))).toBe(2);
    expect(targetRateOf(hits, R750, at('far'))).toBeCloseTo(1.3922, 12);
    expect(targetRateOf(hits, R500, at('near'))).toBeNull();
  });

  it('accepts the three-part key and rejects hit counts below 1', () => {
    const base = raw.targetProfiles as Record<string, unknown>[];
    const p = base[0]!;
    const parse = (extra: Record<string, unknown>) => () =>
      parseEnemyPresets({ ...raw, targetProfiles: [{ ...p, ...extra }] });
    const rl = (row: unknown) => ({ RL: { byProjectile: { 'HomingProjectile:100:750': row } } });
    expect(parse({ coreHitRate: rl({ all: 0 }) })).not.toThrow();
    expect(parse({ hitsPerShot: rl({ near: 2 }) })).not.toThrow();
    expect(parse({ hitsPerShot: rl({ near: 0.5 }) })).toThrow(/>= 1/);
    expect(parse({ coreHitRate: { RL: { byProjectile: { 'HomingProjectile:100:750:1': { all: 0 } } } } })).toThrow(
      /<fireType>:<speed>\[:<explosionRange>\]/,
    );
  });
});

describe('自動の条件と 1 トリガーの式', () => {
  it('puts hits per shot into the auto condition only where the table has it', () => {
    const withHits = { ...profile, hitsPerShot: TEST_HITS };
    expect(autoConditionAt(withHits, at('near'), R750, 0, MANUAL)).toMatchObject({ coreHitRate: 1, hitsPerShot: 2 });
    expect(autoConditionAt(withHits, at('near'), R500, 0, MANUAL).hitsPerShot).toBeUndefined();
    expect(autoConditionAt(profile, at('near'), R750, 0, MANUAL).hitsPerShot).toBeUndefined();
  });

  it('multiplies the normal attack only (not the per-shot skill damage)', () => {
    const enemy: EnemyInput = { defence: 100, element: null, hasCore: true };
    const base = { character: R750, growth: { level: 1, grade: 0, core: 0 }, enemy, attackOverride: 10_000 };
    const perShot = [
      {
        source: { resourceId: 1, skill: 'skill1' as const, name: { ja: '', en: '' } },
        damageType: 'additional' as const,
        multiplier: 1,
      },
    ];
    const one = computeTriggerDamage({ ...base, condition: { ...MANUAL, coreHitRate: 0 }, perShot });
    const two = computeTriggerDamage({ ...base, condition: { ...MANUAL, coreHitRate: 0, hitsPerShot: 2 }, perShot });
    expect(two.normal).toBeCloseTo(one.normal * 2, 9);
    expect(two.perShot).toBeCloseTo(one.perShot, 9);
    expect(two.hitsPerShot).toBe(2);
    expect(one.hitsPerShot).toBe(1);
  });

  it('rejects hit counts below 1', () => {
    expect(() => hitsPerShotOf({ hitsPerShot: 0.5 })).toThrow(RangeError);
    expect(hitsPerShotOf({})).toBe(1);
  });
});
