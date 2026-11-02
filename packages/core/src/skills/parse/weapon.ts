// スキル定義の読み込みの検査のうち、使用武器の変更（weaponChange）の読み込み。型は ../types.ts
import type { WeaponChangeEffect } from '../types.ts';
import {
  fail,
  type Json,
  parseDuration,
  parseLocalizedText,
  parseNonNegativeInt,
  parsePositiveInt,
  parseRef,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition, validateBurstStep } from './condition.ts';
import { parseTrigger } from './trigger.ts';

/** Stage 11 モダニア: 使用武器の変更 */
export function parseWeaponChangeEffect(v: Record<string, Json>, path: string): WeaponChangeEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'damageRef',
        'hitsPerShot',
        'trueDamage',
        'projectileExplosion',
        'chargeTimeSeconds',
        'fullChargeDamage',
        'chargeReleaseSeconds',
        'maxAmmoRef',
        'durationRef',
        'durationSeconds',
        'rateOfFire',
        'instantFire',
        'firstShotDelayFrames',
        'firstShotAfterSwapFrames',
        'infiniteAmmo',
        'condition',
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  // 使用武器変更の武器のパラメータ編: 最大装弾数を書いた変更は撃ち切りで終わる（維持の欄を書かない。design-true-damage-element.md 9 節）
  const untilEmpty = v.maxAmmoRef !== undefined;
  if (untilEmpty && (v.durationRef !== undefined || v.durationSeconds !== undefined)) {
    fail(
      path,
      'a weapon change with maxAmmoRef ends when its magazine is empty; durationRef/durationSeconds are not allowed',
    );
  }
  const effect: WeaponChangeEffect = {
    kind: 'weaponChange',
    // 2 段目の段 11: 状態のフルスタックで起こす変更（plan/design-skill-stage11.md 2.1 節）
    trigger: parseTrigger(v.trigger, `${path}.trigger`, false, false, false, true),
    damageRef: parseRef(v.damageRef, `${path}.damageRef`),
    ...(untilEmpty ? { maxAmmoRef: parseRef(v.maxAmmoRef, `${path}.maxAmmoRef`) } : parseDuration(v, path)),
  };
  if (v.chargeTimeSeconds !== undefined) {
    const seconds = v.chargeTimeSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.chargeTimeSeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
    effect.chargeTimeSeconds = seconds;
  }
  if (v.fullChargeDamage !== undefined) {
    const percent = v.fullChargeDamage;
    if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
      fail(`${path}.fullChargeDamage`, `expected a positive finite number, got ${JSON.stringify(percent)}`);
    }
    effect.fullChargeDamage = percent;
  }
  if (v.chargeReleaseSeconds !== undefined) {
    const seconds = v.chargeReleaseSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.chargeReleaseSeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
    effect.chargeReleaseSeconds = seconds;
  }
  if (v.hitsPerShot !== undefined) effect.hitsPerShot = parsePositiveInt(v.hitsPerShot, `${path}.hitsPerShot`);
  // レッドフード編（plan/design-red-hood.md 2.1 節）: 使った段階（『バーストⅢで使用時』）の条件だけ
  if (v.condition !== undefined) {
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.weaponChange);
    validateBurstStep(condition, effect.trigger, `${path}.condition`);
    effect.condition = condition;
  }
  // 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: CDN に無い変更後の武器の形（録画で読む即値）
  if (v.rateOfFire !== undefined) effect.rateOfFire = parsePositiveInt(v.rateOfFire, `${path}.rateOfFire`);
  if (v.instantFire !== undefined) {
    if (v.instantFire !== true) fail(`${path}.instantFire`, `expected true, got ${JSON.stringify(v.instantFire)}`);
    if (effect.chargeTimeSeconds !== undefined || effect.fullChargeDamage !== undefined) {
      fail(`${path}.instantFire`, 'instantFire cannot be combined with chargeTimeSeconds or fullChargeDamage');
    }
    effect.instantFire = true;
  }
  if (v.firstShotDelayFrames !== undefined) {
    effect.firstShotDelayFrames = parseNonNegativeInt(v.firstShotDelayFrames, `${path}.firstShotDelayFrames`);
  }
  if (v.firstShotAfterSwapFrames !== undefined) {
    if (effect.firstShotDelayFrames !== undefined) {
      fail(`${path}.firstShotAfterSwapFrames`, 'firstShotAfterSwapFrames cannot be combined with firstShotDelayFrames');
    }
    effect.firstShotAfterSwapFrames = parseNonNegativeInt(
      v.firstShotAfterSwapFrames,
      `${path}.firstShotAfterSwapFrames`,
    );
  }

  if (v.infiniteAmmo !== undefined) {
    if (v.infiniteAmmo !== true) fail(`${path}.infiniteAmmo`, `expected true, got ${JSON.stringify(v.infiniteAmmo)}`);
    if (untilEmpty) fail(`${path}.infiniteAmmo`, 'infiniteAmmo cannot be combined with maxAmmoRef');
    effect.infiniteAmmo = true;
  }
  if (v.trueDamage !== undefined) {
    if (v.trueDamage !== true) fail(`${path}.trueDamage`, `expected true, got ${JSON.stringify(v.trueDamage)}`);
    effect.trueDamage = true;
  }
  if (v.projectileExplosion !== undefined) {
    if (v.projectileExplosion !== true) {
      fail(`${path}.projectileExplosion`, `expected true, got ${JSON.stringify(v.projectileExplosion)}`);
    }
    effect.projectileExplosion = true;
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}
