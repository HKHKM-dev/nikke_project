// スキル関連の表示用ラベル（React 非依存）
import type { AppliedEffect, BuffStat, BurstDamageType, SkillSlot, SkillSupport } from '@nikke/core';
import { formatNumber, formatPercent } from './format.ts';

export const SKILL_SLOT_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル 1',
  skill2: 'スキル 2',
  burst: 'バースト',
};

export const BUFF_STAT_LABEL: Record<BuffStat, string> = {
  attack: '攻撃力',
  critRate: 'クリティカル確率',
  critDamage: 'クリティカルダメージ',
  attackDamage: '攻撃ダメージ',
  chargeDamage: 'チャージダメージ',
};

export const BURST_DAMAGE_TYPE_LABEL: Record<BurstDamageType, string> = {
  skill: 'バーストスキルダメージ',
  distributed: '分配ダメージ',
};

export type SupportBadge = { label: string; className: string };

export const SUPPORT_BADGE: Record<SkillSupport | 'undefined' | 'loading' | 'error', SupportBadge> = {
  supported: { label: '対応', className: 'supported' },
  partial: { label: '一部対応', className: 'partial' },
  unsupported: { label: '未対応', className: 'unsupported' },
  undefined: { label: '未定義', className: 'undefined' },
  loading: { label: '読み込み中', className: 'loading' },
  error: { label: '読み込み失敗', className: 'unsupported' },
};

/** 「攻撃力 +42.2%」「攻撃力 +3,105（発動者基準 14.1%）」 */
export function formatAppliedAmount(effect: AppliedEffect): string {
  const stat = BUFF_STAT_LABEL[effect.stat];
  if (effect.scaling === 'casterAttack') {
    return `${stat} +${formatNumber(effect.appliedAmount)}（発動者基準 ${formatPercent(effect.value, 2)}）`;
  }
  return `${stat} +${formatPercent(effect.appliedAmount, 2)}`;
}

/** 「枠 2 ノワール スキル 1」。ニケ名がまだ無い（読み込み中）ときは「枠 2（読み込み中）スキル 1」 */
export function formatEffectSource(effect: AppliedEffect, characterName: string | undefined): string {
  const who =
    characterName === undefined
      ? `枠 ${effect.sourceSlotIndex + 1}（読み込み中）`
      : `枠 ${effect.sourceSlotIndex + 1} ${characterName}`;
  return `${who} ${SKILL_SLOT_LABEL[effect.source.skill]}`;
}
