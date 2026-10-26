import { SKILL_SLOTS, type SkillDefinition } from '@nikke/core';

// Vite の eager glob import で全キャラのスキル定義を取得する
const skillModules = import.meta.glob<{ default: SkillDefinition } | SkillDefinition>(
  '../../../packages/core/data/skills/*.json',
  { eager: true },
);

/**
 * 完全対応しているニケの ID セット。
 * スキル定義が存在し、かつ skills と treasureSkills の全スロットで
 * unimplemented な note が 1 つもないキャラが完全対応。
 */
export const fullySupportedCharacterIds: ReadonlySet<number> = (() => {
  const supported = new Set<number>();
  for (const path in skillModules) {
    if (path.endsWith('index.json')) continue;
    const mod = skillModules[path];
    const def: SkillDefinition | undefined =
      mod && 'default' in mod ? mod.default : (mod as SkillDefinition | undefined);
    if (!def || typeof def.resourceId !== 'number') continue;

    let hasUnimplemented = false;

    // 通常スキル
    for (const slot of SKILL_SLOTS) {
      const entry = def.skills?.[slot];
      if (entry?.notes?.some((n) => n.kind === 'unimplemented')) {
        hasUnimplemented = true;
        break;
      }
    }

    // 宝物スキル
    if (!hasUnimplemented && def.treasureSkills) {
      for (const slot of SKILL_SLOTS) {
        const entry = def.treasureSkills[slot];
        if (entry?.notes?.some((n) => n.kind === 'unimplemented')) {
          hasUnimplemented = true;
          break;
        }
      }
    }

    if (!hasUnimplemented) {
      supported.add(def.resourceId);
    }
  }
  return supported;
})();

/**
 * 未対応項目があるニケ（スキル定義がない、または未対応の注記がある）かどうかを返す
 */
export function hasUnsupportedSkill(resourceId: number): boolean {
  return !fullySupportedCharacterIds.has(resourceId);
}
