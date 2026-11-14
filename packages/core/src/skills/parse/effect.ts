// スキル定義の読み込みの検査のうち、効果 1 件の読み込み（種類ごとのモジュールへの振り分けと、どの種類にも共通の欄）。型は ../types.ts
import { ELEMENTS } from '../../element.ts';
import { INSTANT_KINDS, type InstantKind, SKILL_EFFECT_KINDS, type SkillEffect, type SkillSlot } from '../types.ts';
import { parseAutoAttackEffect, parseShotPauseEffect, parseSummonEffect } from './attack.ts';
import { fail, isRecord, type Json, oneOf, parseClaimRefs } from './common.ts';
import { parseBurstStepMixCondition, parseSquadCondition, parseWithCharacterCondition } from './condition.ts';
import { parseCycleEffect, parseCycleEveryEffect } from './cycle.ts';
import { parseBurstDamageEffect, parseDamageEffect } from './damage.ts';
import { parseDotEffect } from './dot.ts';
import {
  parseAllyGaugeAddEffect,
  parseBurstGaugeHitEffect,
  parseBurstReentryEffect,
  parseBurstStepChangeEffect,
} from './gauge.ts';
import { parseCoverHealEffect, parseInstantEffect, parseSkillCooldownReductionEffect } from './instant.ts';
import { parseIndirectReads } from './notes.ts';
import {
  parseCancelStateEffect,
  parseStateExtendEffect,
  parseCounterChangeEffect,
  parseRemoveDebuffEffect,
  parseRemoveStateEffect,
  parseStackChangeEffect,
  parseStateGrantEffect,
} from './state.ts';
import { parsePassiveEffect, parseTimedEffect } from './timed.ts';
import { parseWeaponChangeEffect } from './weapon.ts';

/**
 * passive は skill1 / skill2 にだけ、burstDamage は burst にだけ、timed・damage・即時効果・weaponChange・cycle・cycleEvery・dot・
 * burstGaugeHit・shotPause はどのスロットにも書ける
 */
export function parseEffect(v: Json, path: string, slot: SkillSlot): SkillEffect {
  if (!isRecord(v)) fail(path, 'expected an object');
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 1.2 節）: 読む側の印はどの種類の効果にも書ける（計算は読まない）
  const { reads, ...body } = v;
  const effect: SkillEffect = parseEffectBody(body, path, slot);
  if (reads !== undefined) effect.reads = parseIndirectReads(reads, `${path}.reads`);
  for (const key of ['burstStepMix', 'squad'] as const) {
    if (v[key] === undefined) continue;
    if (
      effect.kind !== 'passive' &&
      effect.kind !== 'timed' &&
      effect.kind !== 'state' &&
      effect.kind !== 'cooldownReduction' &&
      effect.kind !== 'heal' &&
      effect.kind !== 'burstReentry' &&
      effect.kind !== 'burstStepChange' &&
      // damage と cycleEvery は burstStepMix だけ（plan/design-skill-stage12.md 2.1・2.4 節）
      !((effect.kind === 'damage' || effect.kind === 'cycleEvery') && key === 'burstStepMix')
    ) {
      fail(
        `${path}.${key}`,
        `only allowed in passive, timed, state, cooldownReduction, heal, burstReentry and burstStepChange (burstStepMix also in damage and cycleEvery), found in ${effect.kind}`,
      );
    }
    if (key === 'burstStepMix') effect.burstStepMix = parseBurstStepMixCondition(v[key], `${path}.${key}`);
    // damage・cycleEvery の squad は上で弾いてある
    else if (effect.kind !== 'damage' && effect.kind !== 'cycleEvery')
      effect.squad = parseSquadCondition(v[key], `${path}.${key}`);
  }
  // 編成に特定のキャラがいる条件・敵の属性の条件（passive・timed・damage・付与）
  for (const key of ['withCharacter', 'enemyElement'] as const) {
    if (v[key] === undefined) continue;
    // F5（plan/design-heal-vocabulary.md 3.3 節）: withCharacter は heal にも書ける（エマ：TU の S1 の持続回復の周期。ウンファ：TU の有無）
    if (key === 'withCharacter' && effect.kind === 'heal') {
      effect.withCharacter = parseWithCharacterCondition(v[key], `${path}.${key}`);
      continue;
    }
    if (effect.kind !== 'passive' && effect.kind !== 'timed' && effect.kind !== 'state' && effect.kind !== 'damage') {
      fail(
        `${path}.${key}`,
        `only allowed in passive, timed, state and damage (withCharacter also in heal), found in ${effect.kind}`,
      );
    }
    if (key === 'withCharacter') effect.withCharacter = parseWithCharacterCondition(v[key], `${path}.${key}`);
    else effect.enemyElement = oneOf(ELEMENTS, v[key], `${path}.${key}`);
  }
  if (v.claims !== undefined) effect.claims = parseClaimRefs(v.claims, `${path}.claims`);
  return effect;
}

type EffectBodyParser = (v: Record<string, Json>, path: string, slot: SkillSlot) => SkillEffect;

/**
 * 効果の種類ごとの読み込み（即時効果の種類は parseInstantEffect にまとめて渡す）。新しい種類はこの表に足す。
 * 値は関数の宣言だけを指す（最上位で types.ts の値を読まない。types.ts と parse/ は循環 import）
 */
const EFFECT_BODY_PARSERS = {
  passive: (v, path, slot) => {
    if (slot === 'burst')
      fail(`${path}.kind`, 'passive effects are not allowed in burst (use timed with trigger "burstUse")');
    return parsePassiveEffect(v, path);
  },
  burstDamage: (v, path, slot) => {
    if (slot !== 'burst') fail(`${path}.kind`, `burstDamage is only allowed in burst, found in ${slot}`);
    return parseBurstDamageEffect(v, path);
  },
  timed: (v, path) => parseTimedEffect(v, path),
  damage: (v, path) => parseDamageEffect(v, path),
  weaponChange: (v, path) => parseWeaponChangeEffect(v, path),
  cycle: (v, path) => parseCycleEffect(v, path),
  cycleEvery: (v, path) => parseCycleEveryEffect(v, path),
  dot: (v, path) => parseDotEffect(v, path),
  autoAttack: (v, path) => parseAutoAttackEffect(v, path),
  burstGaugeHit: (v, path) => parseBurstGaugeHitEffect(v, path),
  shotPause: (v, path, slot) => parseShotPauseEffect(v, path, slot),
  burstReentry: (v, path) => parseBurstReentryEffect(v, path),
  coverHeal: (v, path) => parseCoverHealEffect(v, path),
  burstStepChange: (v, path) => parseBurstStepChangeEffect(v, path),
  allyGaugeAdd: (v, path) => parseAllyGaugeAddEffect(v, path),
  state: (v, path) => parseStateGrantEffect(v, path),
  removeState: (v, path) => parseRemoveStateEffect(v, path),
  removeDebuff: (v, path) => parseRemoveDebuffEffect(v, path),
  cancelState: (v, path) => parseCancelStateEffect(v, path),
  stateExtend: (v, path) => parseStateExtendEffect(v, path),
  skillCooldownReduction: (v, path) => parseSkillCooldownReductionEffect(v, path),
  stackChange: (v, path) => parseStackChangeEffect(v, path),
  counterChange: (v, path) => parseCounterChangeEffect(v, path),
  summon: (v, path, slot) => parseSummonEffect(v, path, slot),
} satisfies Record<Exclude<SkillEffect['kind'], InstantKind>, EffectBodyParser>;

function parseEffectBody(v: Record<string, Json>, path: string, slot: SkillSlot): SkillEffect {
  const kind = v.kind;
  if ((INSTANT_KINDS as readonly Json[]).includes(kind)) return parseInstantEffect(v, path, kind as InstantKind);
  if (typeof kind === 'string' && Object.hasOwn(EFFECT_BODY_PARSERS, kind)) {
    return EFFECT_BODY_PARSERS[kind as keyof typeof EFFECT_BODY_PARSERS](v, path, slot);
  }
  const kinds = SKILL_EFFECT_KINDS.map((k) => JSON.stringify(k));
  fail(`${path}.kind`, `expected ${kinds.slice(0, -1).join(', ')} or ${kinds.at(-1)}, got ${JSON.stringify(kind)}`);
}
