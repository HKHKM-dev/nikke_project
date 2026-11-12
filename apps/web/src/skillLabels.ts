// スキルと育成の表示用ラベル（React 非依存）
import type { BuildEffectSource, BurstStep, GearPart, NikkeClass, SkillSlot } from '@nikke/core';

/** クラスの表示名（「〈クラス〉型の味方」の絞り込みにも使う） */
export const CLASS_LABEL: Record<NikkeClass, string> = { Attacker: '火力型', Defender: '防御型', Supporter: '支援型' };

/** バースト段階の表示名 */
export const BURST_STEP_LABEL: Record<BurstStep, string> = { Step1: 'Ⅰ', Step2: 'Ⅱ', Step3: 'Ⅲ', AllStep: 'ALL' };

export const SKILL_SLOT_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル 1',
  skill2: 'スキル 2',
  burst: 'バースト',
};

/** 宝物の段階の選択肢のラベル。「1 段階（スキル 1）」「2 段階（+スキル 2）」 */
export function treasurePhaseLabel(unlockOrder: readonly SkillSlot[], phase: number): string {
  if (phase === 0) return 'なし';
  const slot = unlockOrder[phase - 1];
  const what = slot === undefined ? '' : SKILL_SLOT_LABEL[slot];
  return `${phase} 段階（${phase === 1 ? '' : '+'}${what}）`;
}

// ---- 育成入力の効果層（OL・キューブ・コレクション） ----

export const GEAR_PART_LABEL: Record<GearPart, string> = { head: '頭', body: '胴', arm: '腕', leg: '足' };

/** 「OL 頭 1 行目（攻撃力増加 LV15）」「キューブ（アンチコードHC 段階 6）」「コレクション（…段階 4）」 */
export function formatBuildEffectSource(source: BuildEffectSource): string {
  switch (source.kind) {
    case 'overload':
      return `OL ${source.part ? GEAR_PART_LABEL[source.part] : ''} ${(source.line ?? 0) + 1} 行目（${source.name.ja} LV${source.level}）`;
    case 'cube':
      return `キューブ（${source.name.ja} 段階 ${source.level}）`;
    case 'collection':
      return `コレクション（${source.name.ja} 段階 ${source.level}）`;
  }
}
