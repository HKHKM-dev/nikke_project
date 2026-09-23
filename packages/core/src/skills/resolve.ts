// スキル定義の ref を Lv の数値に解決する。単位変換（% → 比率）はここで一律に行う。
// Stage 11 モダニア: スタックの最大数・「▼」・条件・使用武器の変更（stat 'weapon' の持続効果として解決する）を足した。
import type { CharacterData, Locale, LocalizedText, ShotParams, SkillRaw, WeaponType } from '../types.ts';
import { durationToFrames } from '../burst/fixedCycle.ts';
import type { ChangedWeapon } from './buffs.ts';
import {
  SKILL_SLOTS,
  isFlagStat,
  isShotCountTrigger,
  type BuffScaling,
  type BuffStat,
  type BuffTarget,
  type BuffTrigger,
  type EffectCondition,
  type EffectTrigger,
  type EventCountKind,
  type InstantKind,
  type ShotCountKind,
  type SkillDefinition,
  type SkillSlot,
  type TargetCountFields,
} from './types.ts';

/**
 * Stage 8: Lv の数値に解決したトリガー。射撃の回数トリガーは every（1 以上の整数）に解決済み。
 * 文字列のトリガーと発動回数のトリガーはそのまま。
 */
export type ResolvedTrigger = BuffTrigger | ResolvedShotCountTrigger | { count: EventCountKind; atLeast: number };

/**
 * 射撃の回数トリガー（解決済み）。every は発火の間隔（回）。
 * Stage 11: stacksRef があれば every = 1 スタックの回数 × スタック数 で、stacks にスタック数を残す（表示用）
 */
export type ResolvedShotCountTrigger = { count: ShotCountKind; every: number; stacks?: number };

export function isResolvedShotCount(t: ResolvedTrigger): t is ResolvedShotCountTrigger {
  return typeof t === 'object' && 'every' in t;
}

export function isResolvedEventCount(t: ResolvedTrigger): t is { count: EventCountKind; atLeast: number } {
  return typeof t === 'object' && 'atLeast' in t;
}

/** everyRef・stacksRef を Lv の数値に解決する。回数・スタック数は整数でなければ RangeError */
export function resolveTrigger(trigger: EffectTrigger, skill: SkillRaw, level: number): ResolvedTrigger {
  if (!isShotCountTrigger(trigger)) return typeof trigger === 'object' ? { ...trigger } : trigger;
  const every = trigger.everyRef === undefined ? (trigger.every ?? 1) : skillValue(skill, trigger.everyRef, level);
  if (!Number.isInteger(every) || every < 1) {
    throw new RangeError(`skill ${skill.id}: count trigger must be a positive integer, got ${every}`);
  }
  if (trigger.stacksRef === undefined) return { count: trigger.count, every };
  const stacks = skillValue(skill, trigger.stacksRef, level);
  if (!Number.isInteger(stacks) || stacks < 1) {
    throw new RangeError(`skill ${skill.id}: stack count must be a positive integer, got ${stacks}`);
  }
  // 数えるだけのスタック（効果なし）なので、N 回 × スタック数 ごとの発火と同じ（plan/design-stage11.md 2.2 節）
  return { count: trigger.count, every: every * stacks, stacks };
}

/** Stage 11 アリス編: 「最終攻撃力が最も高い味方 N 機」の N を Lv の数値に解決する。無ければ undefined、整数でなければ RangeError */
export function resolveTargetCount(effect: TargetCountFields, skill: SkillRaw, level: number): number | undefined {
  if (effect.targetCount === undefined && effect.targetCountRef === undefined) return undefined;
  const n = effect.targetCount ?? skillValue(skill, effect.targetCountRef!, level);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`skill ${skill.id}: target count must be a positive integer, got ${n}`);
  }
  return n;
}

export const SKILL_LEVEL_MIN = 1;
export const SKILL_LEVEL_MAX = 10;

/** 各スキルの Lv（1..10） */
export type SkillLevels = Record<SkillSlot, number>;

export const MAX_SKILL_LEVELS: Readonly<SkillLevels> = Object.freeze({
  skill1: SKILL_LEVEL_MAX,
  skill2: SKILL_LEVEL_MAX,
  burst: SKILL_LEVEL_MAX,
});

export function validateSkillLevel(level: number): void {
  if (!Number.isInteger(level) || level < SKILL_LEVEL_MIN || level > SKILL_LEVEL_MAX) {
    throw new RangeError(`skill level must be an integer in [${SKILL_LEVEL_MIN}, ${SKILL_LEVEL_MAX}], got ${level}`);
  }
}

/**
 * values[ref-1][level-1] を Number() した生の値を返す（"20.1" → 20.1）。単位変換はしない。
 * 段階 B 以降で「秒」「発」を参照するときもこの関数を使う。無ければ RangeError
 */
export function skillValue(skill: SkillRaw, ref: number, level: number): number {
  validateSkillLevel(level);
  if (!Number.isInteger(ref) || ref < 1 || ref > skill.values.length) {
    throw new RangeError(`skill ${skill.id}: ref must be in [1, ${skill.values.length}], got ${ref}`);
  }
  const entry = skill.values[ref - 1];
  if (entry === null || entry === undefined)
    throw new RangeError(`skill ${skill.id}: description_value_${ref} is empty`);
  const text = entry[level - 1];
  if (text === undefined) throw new RangeError(`skill ${skill.id}: description_value_${ref} has no level ${level}`);
  const value = Number(text);
  if (!Number.isFinite(value))
    throw new RangeError(`skill ${skill.id}: description_value_${ref} is not numeric: ${text}`);
  return value;
}

/**
 * % 表記の値を比率にする。flat（Stage 10。最大装弾数の発数）はそのまま。
 * casterChargeTime（Stage 11 アリス編）は 発動者の基礎チャージ時間 × 比率 の秒数にする。
 * Stage 11 モダニア: decrease（「▼」）なら符号を反転する
 */
function scaledValue(
  raw: number,
  scaling: BuffScaling | undefined,
  caster: CharacterData,
  decrease: boolean | undefined,
): number {
  const sign = decrease ? -1 : 1;
  if (scaling === 'flat') return sign * raw;
  if (scaling === 'casterChargeTime') return (raw / 100) * caster.shot.chargeTime;
  return (sign * raw) / 100;
}

/**
 * Stage 11 モダニア: 解決後の stat。'weapon' は使用武器の変更（weaponChange）を持続効果として解決したもの
 * （BuffTotals.weapon を差し替える。DSL の timed には書けない）
 */
export type EffectStat = BuffStat | 'weapon';

export type ResolvedEffect = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  target: BuffTarget;
  /** Stage 9: 「〈武器〉を所持する味方」。定義に無ければキーごと無い */
  targetWeapon?: WeaponType;
  /** Stage 11 アリス編: target が topAttack のときの N（解決済み）。それ以外はキーごと無い */
  targetCount?: number;
  stat: EffectStat;
  /** 省略を 'ratio' に埋めた後の値 */
  scaling: BuffScaling;
  /**
   * 比率。0.201 のように 100 で割った後の値（% 表記の stat は一律に割る）。scaling 'flat' は発数のまま。
   * Stage 11 モダニア: 「▼」（decrease）は負の値。フラグの stat（装弾数無限）は 1、使用武器の変更は変更後の 1 発の比率（0.0224）
   */
  value: number;
  /** Stage 11 モダニア: stat が 'weapon' のときの変更後の武器 */
  weapon?: ChangedWeapon;
  assumes?: LocalizedText;
};

/** 解決済みの効果が実際に枠へ適用された記録。発動元の枠と、BuffTotals へ足した量を添える */
export type AppliedEffect = ResolvedEffect & {
  /** 発動元の枠（slots 内の位置） */
  sourceSlotIndex: number;
  /** 実際に BuffTotals へ足した量。ratio なら value そのもの（0.1535）、casterAttack なら攻撃力の実数 */
  appliedAmount: number;
};

/** 定義の各 passive 効果を Lv の数値に解決する。support が 'unsupported' のスキルは空。burstDamage は resolveBurstDamage が扱う */
export function resolvePassives(def: SkillDefinition, character: CharacterData, levels: SkillLevels): ResolvedEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    for (const effect of entry.effects) {
      if (effect.kind !== 'passive') continue;
      const r: ResolvedEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        target: effect.target,
        stat: effect.stat,
        scaling: effect.scaling ?? 'ratio',
        value: scaledValue(skillValue(skill, effect.ref, levels[slot]), effect.scaling, character, effect.decrease),
      };
      if (effect.targetWeapon) r.targetWeapon = effect.targetWeapon;
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    }
  }
  return resolved;
}

/** Stage 6: トリガー付きの持続バフ。ResolvedEffect に「いつ付いて、何フレーム続くか」が付いた形 */
export type ResolvedTimedEffect = ResolvedEffect & {
  trigger: ResolvedTrigger;
  /** durationToFrames(維持秒数)。0 なら効果なし */
  durationFrames: number;
  /** 上書き延長の同一性判定に使う（同じスロットの何番目の効果か） */
  effectIndex: number;
  /** Stage 11 モダニア: 効果のあるスタックの最大数（解決済み）。無ければスタックしない（和集合 = 上書き延長） */
  maxStacks?: number;
  /** Stage 11 モダニア: 「自分が 〈stat〉 増加状態なら」 */
  condition?: EffectCondition;
};

/** 持続バフが枠へ適用された記録 */
export type AppliedTimedEffect = ResolvedTimedEffect & {
  sourceSlotIndex: number;
  appliedAmount: number;
};

/** 定義の各 timed 効果を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
export function resolveTimed(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedTimedEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedTimedEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind === 'weaponChange') {
        resolved.push(resolveWeaponChange(effect, character, slot, levels[slot], effectIndex));
        return;
      }
      if (effect.kind !== 'timed') return;
      const seconds = durationSecondsOf(effect, skill, levels[slot]);
      const value =
        effect.ref === undefined
          ? 1 // フラグの stat（装弾数無限）
          : scaledValue(skillValue(skill, effect.ref, levels[slot]), effect.scaling, character, effect.decrease);
      if (effect.ref === undefined && !isFlagStat(effect.stat)) {
        throw new RangeError(`skill ${skill.id}: timed ${effect.stat} needs ref`);
      }
      const r: ResolvedTimedEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        target: effect.target,
        stat: effect.stat,
        scaling: effect.scaling ?? 'ratio',
        value,
        trigger: resolveTrigger(effect.trigger, skill, levels[slot]),
        durationFrames: durationToFrames(seconds),
        effectIndex,
      };
      if (effect.targetWeapon) r.targetWeapon = effect.targetWeapon;
      const count = resolveTargetCount(effect, skill, levels[slot]);
      if (count !== undefined) r.targetCount = count;
      const maxStacks = resolveMaxStacks(effect, skill, levels[slot]);
      if (maxStacks !== undefined) r.maxStacks = maxStacks;
      if (effect.condition) r.condition = effect.condition;
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
  }
  return resolved;
}

function durationSecondsOf(
  effect: { durationRef?: number; durationSeconds?: number },
  skill: SkillRaw,
  level: number,
): number {
  const seconds =
    effect.durationRef === undefined ? (effect.durationSeconds ?? 0) : skillValue(skill, effect.durationRef, level);
  if (seconds < 0) throw new RangeError(`skill ${skill.id}: duration must be >= 0, got ${seconds}`);
  return seconds;
}

/** Stage 11 モダニア: スタックの最大数を Lv の数値に解決する。無ければ undefined、整数でなければ RangeError */
function resolveMaxStacks(
  effect: { maxStacks?: number; maxStacksRef?: number },
  skill: SkillRaw,
  level: number,
): number | undefined {
  if (effect.maxStacks === undefined && effect.maxStacksRef === undefined) return undefined;
  const n = effect.maxStacks ?? skillValue(skill, effect.maxStacksRef!, level);
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`skill ${skill.id}: max stacks must be a positive integer, got ${n}`);
  }
  return n;
}

/**
 * Stage 11 モダニア: 使用武器の変更で、CDN に無い変更後の武器のパラメータをどう置くか（plan/design-stage11-modernia.md 3.4 節）。
 * 変更後の武器は基礎の武器を写し、1 発のダメージを damageRef の値 × ヒット数に、レートを changeWeapon.rateOfFire（スピンアップなし）に
 * 差し替える。コア倍率・装弾数・リロード・ゲージの量は基礎の武器のまま。
 * **2026-09-24 の録画 44 で確定**: 殲滅モードのコア 6,753 = (120,694 − 100) × 2.24% × (1 + コア 1.0 + FB 0.5)（コア倍率は基礎と同じ）、
 * 1 発目から毎フレーム 1 発（スピンアップなし・4200 rpm は 1 フレーム 1 発で止まる）。1 発に 2 ヒット（hitsPerShot）
 */
export const WEAPON_CHANGE_CORE = 'base' as const;

/** 変更後の武器の ShotParams（WEAPON_CHANGE_CORE と、スピンアップなし = rateOfFire と endRateOfFire を同じにする） */
export function changedWeaponShot(
  base: ShotParams,
  damageRatio: number,
  rateOfFire: number,
  hitsPerShot = 1,
): ShotParams {
  return {
    ...base,
    damage: Math.round(damageRatio * 10000) * hitsPerShot,
    rateOfFire,
    endRateOfFire: rateOfFire,
    rateOfFireChangePerShot: 0,
  };
}

/** Stage 11 モダニア: 使用武器の変更を、自分に付く stat 'weapon' の持続効果に解決する */
function resolveWeaponChange(
  effect: Extract<SkillDefinition['skills'][SkillSlot]['effects'][number], { kind: 'weaponChange' }>,
  character: CharacterData,
  slot: SkillSlot,
  level: number,
  effectIndex: number,
): ResolvedTimedEffect {
  const skill = character.skills[slot];
  const change = character.burstSkill.changeWeapon;
  if (change === undefined || change === null) {
    throw new RangeError(`character ${character.resourceId}: weaponChange needs burstSkill.changeWeapon (CDN data)`);
  }
  const damage = skillValue(skill, effect.damageRef, level) / 100;
  const hits = effect.hitsPerShot ?? 1;
  const r: ResolvedTimedEffect = {
    source: { resourceId: character.resourceId, skill: slot, name: skill.name },
    target: 'self',
    stat: 'weapon',
    scaling: 'ratio',
    value: damage,
    weapon: {
      id: `${character.resourceId}.${slot}.${effectIndex}`,
      hits,
      shot: changedWeaponShot(character.shot, damage, change.rateOfFire, hits),
    },
    trigger: resolveTrigger(effect.trigger, skill, level),
    durationFrames: durationToFrames(durationSecondsOf(effect, skill, level)),
    effectIndex,
  };
  if (effect.assumes) r.assumes = effect.assumes;
  return r;
}

/**
 * Stage 10: 即時効果（CT 短縮・弾丸チャージ）。value は CT 短縮なら秒、弾丸チャージなら比率（0.3988）。
 * Stage 11: 回復（heal）の value は最大 HP に対する比率（0.0523。表示用で計算には使わない）
 */
export type ResolvedInstantEffect = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  kind: InstantKind;
  trigger: ResolvedTrigger;
  target: BuffTarget;
  targetWeapon?: WeaponType;
  /** Stage 11 アリス編: target が topAttack のときの N */
  targetCount?: number;
  value: number;
  /** 同じスロットの何番目の効果か（識別用） */
  effectIndex: number;
  assumes?: LocalizedText;
};

/** 定義の各即時効果を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
export function resolveInstant(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedInstantEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedInstantEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind !== 'cooldownReduction' && effect.kind !== 'ammoRefill' && effect.kind !== 'heal') return;
      const raw = skillValue(skill, effect.ref, levels[slot]);
      if (raw < 0) throw new RangeError(`skill ${skill.id}: ${effect.kind} must be >= 0, got ${raw}`);
      const r: ResolvedInstantEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        kind: effect.kind,
        trigger: resolveTrigger(effect.trigger, skill, levels[slot]),
        target: effect.target,
        value: effect.kind === 'cooldownReduction' ? raw : raw / 100,
        effectIndex,
      };
      if (effect.targetWeapon) r.targetWeapon = effect.targetWeapon;
      const count = effect.kind === 'heal' ? undefined : resolveTargetCount(effect, skill, levels[slot]);
      if (count !== undefined) r.targetCount = count;
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
  }
  return resolved;
}

const PLACEHOLDER = /\{description_value_(\d+)\}/g;
const TAG = /<\/?(?:color|word_group)(?:=[^>]*)?>/g;

/** 説明文の {description_value_NN} を Lv の値に置き換え、<color> / <word_group> タグを除いた文字列（UI の確認用）。値が無い箇所は "?" */
export function renderSkillDescription(skill: SkillRaw, level: number, locale: Locale): string {
  validateSkillLevel(level);
  return skill.description[locale]
    .replace(PLACEHOLDER, (_m, digits: string) => skill.values[Number(digits) - 1]?.[level - 1] ?? '?')
    .replace(TAG, '');
}
