// スキル定義の ref を Lv の数値に解決する。単位変換（% → 比率）はここで一律に行う。
import type { CharacterData, Locale, LocalizedText, SkillRaw } from '../types.ts';
import {
  SKILL_SLOTS,
  type BuffScaling,
  type BuffStat,
  type BuffTarget,
  type SkillDefinition,
  type SkillSlot,
} from './types.ts';

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

export type ResolvedEffect = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  target: BuffTarget;
  stat: BuffStat;
  /** 省略を 'ratio' に埋めた後の値 */
  scaling: BuffScaling;
  /** 比率。0.201 のように 100 で割った後の値（段階 A の stat はすべて % 表記なので一律に割る） */
  value: number;
  assumes?: LocalizedText;
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
        value: skillValue(skill, effect.ref, levels[slot]) / 100,
      };
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    }
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
