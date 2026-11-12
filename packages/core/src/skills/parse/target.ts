// スキル定義の読み込みの検査のうち、対象（target と、武器種・属性・クラス・分隊・機数などの絞り込み）の読み込み。型は ../types.ts
import { ELEMENTS } from '../../element.ts';
import type { Element, NikkeClass, WeaponType } from '../../types.ts';
import { WEAPON_TYPES } from '../../weapons.ts';
import type { NamedStateId } from '../states.ts';
import {
  BASIC_BURST_STEPS,
  type BasicBurstStep,
  type BuffStat,
  type BuffTarget,
  BURST_USERS_TRIGGERS,
  burstUsersEventOf,
  type CoverHealEffect,
  type RemoveDebuffEffect,
  type EffectTrigger,
  isCountedTarget,
  isEnemyHeldStat,
  NIKKE_CLASSES,
  TARGET_SQUADS,
  type TargetCountFields,
  type TargetSquad,
} from '../types.ts';
import { fail, type Json, oneOf, parseNamedStateId, parsePositiveInt, parseRef } from './common.ts';

/** targetSquad は target が allies のときだけ */
export function parseTargetSquad(v: Record<string, Json>, target: BuffTarget, path: string): TargetSquad | undefined {
  if (v.targetSquad === undefined) return undefined;
  const squad = oneOf(TARGET_SQUADS, v.targetSquad, `${path}.targetSquad`);
  if (target !== 'allies') fail(`${path}.targetSquad`, `only allowed with target "allies", got "${target}"`);
  return squad;
}

/** targetState・targetBurstStep は target が allies のときだけ（targetBurstStep は burstUsers も） */
export function parsePersonaTargetFields(
  v: Record<string, Json>,
  target: BuffTarget,
  path: string,
): { targetState?: NamedStateId; includeSelf?: true; targetBurstStep?: BasicBurstStep } {
  const out: { targetState?: NamedStateId; includeSelf?: true; targetBurstStep?: BasicBurstStep } = {};
  if (v.targetState !== undefined) out.targetState = parseNamedStateId(v.targetState, `${path}.targetState`, 'ally');
  // 「自分と〈状態〉の味方」（plan/design-new-chars-1029.md 5.1 節）
  if (v.includeSelf !== undefined) {
    if (v.includeSelf !== true) fail(`${path}.includeSelf`, 'must be true');
    if (out.targetState === undefined) fail(`${path}.includeSelf`, 'only allowed with targetState');
    out.includeSelf = true;
  }
  const step = parseTargetBurstStep(v, target, path);
  if (step !== undefined) out.targetBurstStep = step;
  if (out.targetState !== undefined && target !== 'allies') {
    fail(`${path}.targetState`, `only allowed with target "allies", got "${target}"`);
  }
  return out;
}

/**
 * 「基本バースト段階が N の」。対象は allies と burstUsers（「直前に
 * バーストスキルを使用した基本バースト段階が N の味方全体」。エイダの S1。plan/design-skill-stage15.md 2.3 節）
 */
export function parseTargetBurstStep(
  v: Record<string, Json>,
  target: BuffTarget,
  path: string,
): BasicBurstStep | undefined {
  if (v.targetBurstStep === undefined) return undefined;
  if (target !== 'allies' && target !== 'burstUsers')
    fail(`${path}.targetBurstStep`, `only allowed with target "allies" or "burstUsers", got "${target}"`);
  return oneOf(BASIC_BURST_STEPS, v.targetBurstStep, `${path}.targetBurstStep`);
}

/**
 * damageTaken（敵の受けるダメージ▲）は敵へのデバフなので、味方全体（target 'allies'）にだけ書ける。
 * 武器種・属性で絞ることもできない（敵 1 体の前提で、敵が受ける全ダメージに掛かる）。
 * 敵の件なので、持ち主ごとに違いうる絞り込み（自分を除く・状態・
 * バースト段階）と維持（持ち主の発数）も書けない（plan/design-holder-effects.md 2.8 節）
 */
export function validateDamageTaken(stat: BuffStat, target: BuffTarget, v: Record<string, Json>, path: string): void {
  if (!isEnemyHeldStat(stat)) return;
  if (target !== 'allies') fail(`${path}.target`, `${stat} must target "allies" (an enemy debuff), got "${target}"`);
  if (
    v.targetWeapon !== undefined ||
    v.targetElement !== undefined ||
    v.targetClass !== undefined ||
    v.targetSquad !== undefined
  )
    fail(path, `${stat} cannot narrow its target by weapon, element, class or squad (an enemy debuff)`);
  for (const key of [
    'excludeSelf',
    'targetState',
    'includeSelf',
    'targetBurstStep',
    'durationShots',
    'durationShotsRef',
  ] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `${stat} is held by the enemy, so it cannot have ${key}`);
  }
}

/** targetWeapon は target が self 以外のときだけ（burstUsers・topAttack も） */
export function parseTargetWeapon(v: Record<string, Json>, target: BuffTarget, path: string): WeaponType | undefined {
  if (v.targetWeapon === undefined) return undefined;
  const weapon = oneOf(WEAPON_TYPES, v.targetWeapon, `${path}.targetWeapon`);
  if (target === 'self')
    fail(`${path}.targetWeapon`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return weapon;
}

/** アスカ: targetElement は targetWeapon と同じく target が self 以外のときだけ */
export function parseTargetElement(v: Record<string, Json>, target: BuffTarget, path: string): Element | undefined {
  if (v.targetElement === undefined) return undefined;
  const element = oneOf(ELEMENTS, v.targetElement, `${path}.targetElement`);
  if (target === 'self')
    fail(`${path}.targetElement`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return element;
}

/** targetClass は targetWeapon・targetElement と同じく target が self 以外のときだけ（plan/design-skill-stage9.md 1.1 節） */
export function parseTargetClass(v: Record<string, Json>, target: BuffTarget, path: string): NikkeClass | undefined {
  if (v.targetClass === undefined) return undefined;
  const nikkeClass = oneOf(NIKKE_CLASSES, v.targetClass, `${path}.targetClass`);
  if (target === 'self')
    fail(`${path}.targetClass`, `only allowed with target "allies", "burstUsers" or "topAttack", got "${target}"`);
  return nikkeClass;
}

/** burstUsers はトリガーが fullBurstStart / fullBurstEnd（とその出来事の回数のきっかけ。burstUsersEventOf）のときだけ */
export function validateBurstUsersTarget(target: BuffTarget, trigger: EffectTrigger, path: string): void {
  if (target !== 'burstUsers') return;
  if (burstUsersEventOf(trigger) !== undefined) return;
  fail(
    `${path}.target`,
    `burstUsers is only allowed with trigger ${BURST_USERS_TRIGGERS.join(' or ')} (or { count } of them), got ${JSON.stringify(trigger)}`,
  );
}

/** topAttack の N（targetCount / targetCountRef）。topAttack・longestChargeTime のときだけ、ちょうど片方 */
export function parseTargetCount(
  v: Record<string, Json>,
  target: BuffTarget | CoverHealEffect['target'] | RemoveDebuffEffect['target'],
  path: string,
): TargetCountFields {
  const hasCount = v.targetCount !== undefined;
  const hasRef = v.targetCountRef !== undefined;
  if (!isCountedTarget(target)) {
    if (hasCount || hasRef)
      fail(
        path,
        `targetCount / targetCountRef are only allowed with target "topAttack", "longestChargeTime", "lowestHpRatio", "lowestCoverHp" or "debuffedRandom", got "${target}"`,
      );
    return {};
  }
  if (hasCount === hasRef)
    fail(path, `exactly one of targetCount and targetCountRef is required with target "${target}"`);
  return hasCount
    ? { targetCount: parsePositiveInt(v.targetCount, `${path}.targetCount`) }
    : { targetCountRef: parseRef(v.targetCountRef, `${path}.targetCountRef`) };
}

/** HP の割合の低い順の対象は、使い手のいる heal にだけ書ける（plan/design-skill-stage8.md 1.1 節） */
export const LOWEST_HP_RATIO_HEAL_ONLY = 'lowestHpRatio is only allowed in heal';
