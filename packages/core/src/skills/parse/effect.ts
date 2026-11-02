// スキル定義の読み込みの検査のうち、効果 1 件の読み込み（種類ごとのモジュールへの振り分けと、どの種類にも共通の欄）。型は ../types.ts
import { ELEMENTS } from '../../element.ts';
import type { SkillSlot } from '../../types.ts';
import type { SkillEffect } from '../types.ts';
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
import { parseCoverHealEffect, parseInstantEffect } from './instant.ts';
import { parseIndirectReads } from './notes.ts';
import { parsePassiveEffect } from './passive.ts';
import {
  parseCancelStateEffect,
  parseCounterChangeEffect,
  parseRemoveStateEffect,
  parseStackChangeEffect,
  parseStateGrantEffect,
} from './state.ts';
import { parseTimedEffect } from './timed.ts';
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
      // 2 段目の段 12（plan/design-skill-stage12.md 2.1 節）: damage は burstStepMix だけ。PR 2（2.4 節）: cycleEvery も
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
  // 防御力無視ダメージ編: 編成に特定のキャラがいる条件・敵の属性の条件（passive・timed・damage。名前の付いた状態の語彙編: 付与も）
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

function parseEffectBody(v: Record<string, Json>, path: string, slot: SkillSlot): SkillEffect {
  if (v.kind === 'passive') {
    if (slot === 'burst')
      fail(`${path}.kind`, 'passive effects are not allowed in burst (use timed with trigger "burstUse")');
    return parsePassiveEffect(v, path);
  }
  if (v.kind === 'burstDamage') {
    if (slot !== 'burst') fail(`${path}.kind`, `burstDamage is only allowed in burst, found in ${slot}`);
    return parseBurstDamageEffect(v, path);
  }
  if (v.kind === 'timed') return parseTimedEffect(v, path);
  if (v.kind === 'damage') return parseDamageEffect(v, path);
  if (
    v.kind === 'cooldownReduction' ||
    v.kind === 'ammoRefill' ||
    v.kind === 'heal' ||
    v.kind === 'burstGauge' ||
    v.kind === 'ammoDecrease' ||
    v.kind === 'fullBurstExtend'
  ) {
    return parseInstantEffect(v, path, v.kind);
  }
  if (v.kind === 'weaponChange') return parseWeaponChangeEffect(v, path);
  if (v.kind === 'cycle') return parseCycleEffect(v, path);
  if (v.kind === 'cycleEvery') return parseCycleEveryEffect(v, path);
  if (v.kind === 'dot') return parseDotEffect(v, path);
  if (v.kind === 'autoAttack') return parseAutoAttackEffect(v, path);
  if (v.kind === 'burstGaugeHit') return parseBurstGaugeHitEffect(v, path);
  if (v.kind === 'shotPause') return parseShotPauseEffect(v, path);
  if (v.kind === 'burstReentry') return parseBurstReentryEffect(v, path);
  if (v.kind === 'coverHeal') return parseCoverHealEffect(v, path);
  if (v.kind === 'burstStepChange') return parseBurstStepChangeEffect(v, path);
  if (v.kind === 'allyGaugeAdd') return parseAllyGaugeAddEffect(v, path);
  if (v.kind === 'state') return parseStateGrantEffect(v, path);
  if (v.kind === 'removeState') return parseRemoveStateEffect(v, path);
  if (v.kind === 'cancelState') return parseCancelStateEffect(v, path);
  if (v.kind === 'stackChange') return parseStackChangeEffect(v, path);
  if (v.kind === 'counterChange') return parseCounterChangeEffect(v, path);
  if (v.kind === 'summon') return parseSummonEffect(v, path, slot);
  fail(
    `${path}.kind`,
    `expected "passive", "burstDamage", "timed", "damage", "cooldownReduction", "ammoRefill", "heal", "burstGauge", "ammoDecrease", "fullBurstExtend", "weaponChange", "cycle", "cycleEvery", "dot", "autoAttack", "burstGaugeHit", "shotPause", "burstReentry", "coverHeal", "burstStepChange", "allyGaugeAdd", "state", "removeState", "stackChange", "counterChange" or "summon", got ${JSON.stringify(v.kind)}`,
  );
}
