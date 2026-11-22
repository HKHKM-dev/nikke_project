// スキル定義の対応状況の索引（data/skills/support.json。生成物。npm run records:check）。画面のキャラの選択肢で、未対応の項目がある
// キャラに印を付けるのに使う。定義を全部読まずに済むよう、すべてのスロットに未実装が無いキャラ（完全対応）の一覧だけを持つ。
// 完全対応は、基礎版と、宝物があれば宝物版（全段階で差し替えたもの。宝物版の定義が無いスロットは unsupported。skills/treasure.ts）の
// どのスロットの対応状況（読み込みで決まる support）も partial・unsupported でないもの。定義の無いキャラは載らない。
import type { CharacterData } from '../types.ts';
import { applyTreasure, TREASURE_PHASE_MAX } from './treasure.ts';
import { SKILL_SLOTS, type SkillDefinition, type SkillSupport, type SkillSupportIndex } from './types.ts';

/** スロットに未実装がある（一部対応・未対応）か */
const hasUnimplemented = (support: SkillSupport): boolean => support === 'partial' || support === 'unsupported';

/** 定義のどのスロットにも未実装が無いか */
function fullySupportedDefinition(definition: SkillDefinition): boolean {
  return SKILL_SLOTS.every((slot) => !hasUnimplemented(definition.skills[slot].support));
}

/** 定義とキャラデータの組から、対応状況の索引を作る */
export function buildSkillSupportIndex(
  entries: readonly { definition: SkillDefinition; character: CharacterData }[],
): SkillSupportIndex {
  const fullySupported: number[] = [];
  for (const { definition, character } of [...entries].sort(
    (a, b) => a.definition.resourceId - b.definition.resourceId,
  )) {
    // 宝物があれば、基礎版と宝物版（全段階で差し替えたもの）の悪いほう
    const versions = [definition];
    // 宝物があるのに宝物版を作れなかったキャラは完全対応にしない
    let treasureMissing = false;
    if (character.treasure !== null) {
      const applied = applyTreasure(character, definition, TREASURE_PHASE_MAX).definition;
      if (applied === null) treasureMissing = true;
      else versions.push(applied);
    }
    if (!treasureMissing && versions.every(fullySupportedDefinition)) fullySupported.push(definition.resourceId);
  }
  return { formatVersion: 1, fullySupported };
}

/** 索引のファイルの中身（data/ は prettier の対象外なので、ここで形を決める） */
export function renderSkillSupportIndex(index: SkillSupportIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`;
}
