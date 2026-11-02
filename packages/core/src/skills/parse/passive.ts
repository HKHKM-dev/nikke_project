// スキル定義の読み込みの検査のうち、常時の効果（passive）の読み込み。型は ../types.ts
import {
  BUFF_SCALINGS,
  BUFF_STATS,
  BUFF_TARGETS,
  isEnemyHeldStat,
  isFlagStat,
  isPassiveFlagStat,
  type PassiveEffect,
} from '../types.ts';
import { fail, type Json, oneOf, parseLocalizedText, parseRef } from './common.ts';
import { CONDITION_KEYS_OF, parseCondition, parseWhileCondition } from './condition.ts';
import {
  LOWEST_HP_RATIO_HEAL_ONLY,
  parseTargetClass,
  parseTargetElement,
  parseTargetSquad,
  parseTargetWeapon,
  validateDamageTaken,
} from './target.ts';
import { NAME_REPLACED, parseDecrease, validateAttackSpeed, validateFlatChargeTime, validateScaling } from './timed.ts';

export function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'burstUsers') fail(`${path}.target`, 'burstUsers is not allowed in passive (it needs a full burst)');
  // 常時の効果の対象が戦闘中に入れ替わるのは持続バフの窓の仕組みの外（plan/design-stage11.md 17 節）
  if (target === 'topAttack')
    fail(`${path}.target`, 'topAttack is not allowed in passive (the ranking changes during battle)');
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  if (target === 'lowestHpRatio') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const targetSquad = parseTargetSquad(v, target, path);
  if (v.excludeSelf !== undefined) fail(`${path}.excludeSelf`, 'excludeSelf is only allowed in timed');
  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 最終防御力の比べは発火の瞬間に決めるので、常時の効果には書けない
  if (v.targetDefense !== undefined) fail(`${path}.targetDefense`, 'targetDefense is only allowed in timed');
  for (const key of ['targetState', 'includeSelf', 'targetBurstStep'] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `${key} is only allowed in timed and state`);
  }
  if (v.name !== undefined) fail(`${path}.name`, NAME_REPLACED);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  const passiveFlag = isPassiveFlagStat(stat);
  if ((isFlagStat(stat) && !passiveFlag) || stat === 'fixedChargeTime')
    fail(`${path}.stat`, `${stat} is only allowed in timed`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  validateFlatChargeTime(stat, scaling, v, path);
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 常時の受けるダメージ▲（観測値の比べる設定が使う）は、いまのまま
  // 味方の各枠の常時の値に足す（敵の常時の件にするのは、敵の効果を外す語彙を足す時）
  validateDamageTaken(stat, target, v, path);
  validateAttackSpeed(stat, v, path);
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 有利コードのダメージ適用は値を持たないフラグで、自分だけ。
  // レッドフード編（plan/design-red-hood.md 2.4 節）: チャージ速度の超過分の変換も自分だけ（持ち主の発にだけ効く。比率の scaling だけ）
  const overflow = stat === 'chargeSpeedOverflow';
  if ((passiveFlag || overflow) && target !== 'self')
    fail(`${path}.target`, `${stat} is only allowed with target "self"`);
  if (overflow && scaling !== undefined) fail(`${path}.scaling`, `${stat} takes no scaling`);
  if (passiveFlag) {
    if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value`);
    if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value`);
    if (v.while !== undefined) fail(`${path}.while`, `${stat} cannot have while`);
  }
  const effect: PassiveEffect = { kind: 'passive', target, stat };
  if (!passiveFlag) effect.ref = parseRef(v.ref, `${path}.ref`);
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  if (targetSquad !== undefined) effect.targetSquad = targetSquad;
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) effect.decrease = true;
  if (v.condition !== undefined)
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.passive);
  if (v.while !== undefined) {
    // 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: HP の条件（編成の段で決まる）とは組み合わせない（使い手がいない）。
    // 敵が持つ stat は、敵の件に写すので、自分の状態の件で切れない
    if (v.condition !== undefined) fail(`${path}.while`, 'while cannot be combined with condition');
    if (isEnemyHeldStat(stat)) fail(`${path}.while`, `${stat} is held by the enemy, so it cannot have while`);
    effect.while = parseWhileCondition(v.while, `${path}.while`);
  }
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}
