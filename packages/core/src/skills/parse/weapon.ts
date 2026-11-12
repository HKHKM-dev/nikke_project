// スキル定義の読み込みの検査のうち、使用武器の変更（weaponChange）の読み込み。型は ../types.ts
import type { WeaponChangeEffect } from '../types.ts';
import {
  assertPositiveFinite,
  fail,
  type Json,
  parseAssumes,
  parseDuration,
  parseNamedStateId,
  parseNonNegativeInt,
  parsePositiveInt,
  parseRef,
  parseTrue,
  rejectUnknownKeys,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition, validateBurstStep } from './condition.ts';
import { parseTrigger } from './trigger.ts';

/** 使用武器の変更 */
export function parseWeaponChangeEffect(v: Record<string, Json>, path: string): WeaponChangeEffect {
  rejectUnknownKeys(
    v,
    [
      'kind',
      'trigger',
      'damageRef',
      'hitsPerShot',
      'trueDamage',
      'projectileExplosion',
      'pierce',
      'shotCount',
      'chargeTimeSeconds',
      'chargeTimeFixed',
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
      'state',
      'condition',
      'assumes',
      'claims',
    ],
    path,
  );
  // 最大装弾数を書いた変更は撃ち切りで終わる（維持の欄を書かない。design-true-damage-element.md 9 節）
  const untilEmpty = v.maxAmmoRef !== undefined;
  if (untilEmpty && (v.durationRef !== undefined || v.durationSeconds !== undefined)) {
    fail(
      path,
      'a weapon change with maxAmmoRef ends when its magazine is empty; durationRef/durationSeconds are not allowed',
    );
  }
  const effect: WeaponChangeEffect = {
    kind: 'weaponChange',
    // 状態のフルスタックで起こす変更（plan/design-skill-stage11.md 2.1 節）
    trigger: parseTrigger(v.trigger, `${path}.trigger`, { fullStack: true }),
    damageRef: parseRef(v.damageRef, `${path}.damageRef`),
    ...(untilEmpty ? { maxAmmoRef: parseRef(v.maxAmmoRef, `${path}.maxAmmoRef`) } : parseDuration(v, path)),
  };
  if (v.chargeTimeSeconds !== undefined) {
    const seconds = v.chargeTimeSeconds;
    assertPositiveFinite(seconds, `${path}.chargeTimeSeconds`);
    effect.chargeTimeSeconds = seconds;
  }
  // チャージ時間の固定（チャージ速度▲を受けない。plan/design-nayuta.md 2.4 節）
  if (v.chargeTimeFixed !== undefined) {
    parseTrue(v.chargeTimeFixed, `${path}.chargeTimeFixed`);
    if (effect.chargeTimeSeconds === undefined)
      fail(`${path}.chargeTimeFixed`, 'chargeTimeFixed needs chargeTimeSeconds');
    effect.chargeTimeFixed = true;
  }
  if (v.fullChargeDamage !== undefined) {
    const percent = v.fullChargeDamage;
    assertPositiveFinite(percent, `${path}.fullChargeDamage`);
    effect.fullChargeDamage = percent;
  }
  if (v.chargeReleaseSeconds !== undefined) {
    const seconds = v.chargeReleaseSeconds;
    assertPositiveFinite(seconds, `${path}.chargeReleaseSeconds`);
    effect.chargeReleaseSeconds = seconds;
  }
  if (v.hitsPerShot !== undefined) effect.hitsPerShot = parsePositiveInt(v.hitsPerShot, `${path}.hitsPerShot`);
  // 使った段階（『バーストⅢで使用時』）の条件だけ（plan/design-red-hood.md 2.1 節）
  if (v.condition !== undefined) {
    const condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.weaponChange);
    validateBurstStep(condition, effect.trigger, `${path}.condition`);
    effect.condition = condition;
  }
  // CDN に無い変更後の武器の形（録画で読む即値。plan/design-skill-stage11.md 2.1 節）
  if (v.rateOfFire !== undefined) effect.rateOfFire = parsePositiveInt(v.rateOfFire, `${path}.rateOfFire`);
  if (v.instantFire !== undefined) {
    parseTrue(v.instantFire, `${path}.instantFire`);
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
    parseTrue(v.infiniteAmmo, `${path}.infiniteAmmo`);
    if (untilEmpty) fail(`${path}.infiniteAmmo`, 'infiniteAmmo cannot be combined with maxAmmoRef');
    effect.infiniteAmmo = true;
  }
  // 追加効果「貫通特化」（pierce）も、true だけを受ける旗（plan/design-zwei.md 2.1 節）
  for (const key of ['trueDamage', 'projectileExplosion', 'pierce'] as const) {
    if (v[key] === undefined) continue;
    effect[key] = parseTrue(v[key], `${path}.${key}`);
  }
  // 持ち替えた武器の弾の数（録画で読む即値。plan/design-zwei.md 2.2 節）
  if (v.shotCount !== undefined) effect.shotCount = parsePositiveInt(v.shotCount, `${path}.shotCount`);
  // 変更の窓の間の状態（付与は parse/definition.ts の parseEntry が足す。plan/design-nayuta.md 2.5 節）
  if (v.state !== undefined) {
    if (untilEmpty)
      fail(`${path}.state`, 'state cannot be combined with maxAmmoRef (the window ends on the last shot)');
    effect.state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  }
  parseAssumes(v, effect, path);
  return effect;
}
