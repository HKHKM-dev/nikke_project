// スキル定義の対応状況の索引（data/skills/support.json。生成物。npm run records:check）。画面のキャラの選択肢で、未対応の項目がある
// キャラに印を付けるのに使う。定義を全部読まずに済むよう、すべてのスロットに未実装が無いキャラ（完全対応）の一覧だけを持つ。
// 完全対応は、基礎版と、宝物があれば宝物版（全段階で差し替えたもの。宝物版の定義が無いスロットは unsupported。skills/treasure.ts）の
// どのスロットの対応状況（読み込みで決まる support）も partial・unsupported でないもの。定義の無いキャラは載らない。
import type { CharacterData } from '../types.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from './treasure.ts';
import { SKILL_SLOTS, type SkillDefinition } from './types.ts';

export type SkillSupportIndex = {
  formatVersion: 1;
  /** すべてのスロットに未実装が無いキャラ（昇順） */
  fullySupported: number[];
};

/** 定義のどのスロットにも未実装が無いか */
function fullySupportedDefinition(definition: SkillDefinition): boolean {
  return SKILL_SLOTS.every((slot) => {
    const support = definition.skills[slot].support;
    return support !== 'partial' && support !== 'unsupported';
  });
}

/** 定義とキャラデータの組から、対応状況の索引を作る */
export function buildSkillSupportIndex(
  entries: readonly { definition: SkillDefinition; character: CharacterData }[],
): SkillSupportIndex {
  const fullySupported = entries
    .filter(({ definition, character }) => {
      if (!fullySupportedDefinition(definition)) return false;
      if (character.treasure === null) return true;
      const applied = applyTreasure(character, definition, TREASURE_PHASE_MAX).definition;
      return applied !== null && fullySupportedDefinition(applied);
    })
    .map(({ definition }) => definition.resourceId)
    .sort((a, b) => a - b);
  return { formatVersion: 1, fullySupported };
}

/** 索引のファイルの中身（data/ は prettier の対象外なので、ここで形を決める） */
export function renderSkillSupportIndex(index: SkillSupportIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}

/** 索引の読み込み。不正なら Error */
export function parseSkillSupportIndex(raw: unknown): SkillSupportIndex {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('skill support: expected an object');
  const v = raw as Record<string, unknown>;
  if (v.formatVersion !== 1)
    throw new Error(`skill support.formatVersion: expected 1, got ${JSON.stringify(v.formatVersion)}`);
  const ids = v.fullySupported;
  if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && (id as number) > 0)) {
    throw new Error('skill support.fullySupported: expected an array of positive integers');
  }
  return { formatVersion: 1, fullySupported: ids as number[] };
}
