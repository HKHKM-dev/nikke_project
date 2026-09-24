// スキル関連の表示用ラベル（React 非依存）
import type {
  AppliedEffect,
  BuildEffect,
  BuildEffectSource,
  GearPart,
  AppliedTimedEffect,
  ResolvedInstantEffect,
  BuffStat,
  BuffTrigger,
  ResolvedTrigger,
  SkillDamageType,
  SkillSlot,
  SkillSupport,
} from '@nikke/core';
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
  distributedDamage: '分配ダメージ',
  burstGaugeSpeed: 'バーストゲージのチャージ速度',
  maxAmmo: '最大装弾数',
  reloadSpeed: 'リロード速度',
  chargeSpeed: 'チャージ速度',
  hitRate: '命中率',
  infiniteAmmo: '装弾数無限',
  elementDamage: '有利コードの攻撃ダメージ',
  coreDamage: 'コアダメージ',
  normalAttackDamage: '通常攻撃ダメージ倍率',
};

export const BUFF_TRIGGER_LABEL: Record<BuffTrigger, string> = {
  battleStart: '戦闘開始時',
  burstUse: 'バースト使用時',
  fullBurstStart: 'フルバースト発動時',
  fullBurstEnd: 'フルバースト終了時',
  burstStage1Enter: 'バースト 1 段階突入時',
  burstStage2Enter: 'バースト 2 段階突入時',
  burstStage3Enter: 'バースト 3 段階突入時',
  healed: '回復を受けた時',
};

/** Stage 8: 「通常攻撃 10 回ごと」「バースト使用 2 回目以降」。文字列のトリガーは BUFF_TRIGGER_LABEL */
export function formatTrigger(trigger: ResolvedTrigger): string {
  if (typeof trigger === 'string') return BUFF_TRIGGER_LABEL[trigger];
  if ('every' in trigger) {
    const what = {
      normalShot: '通常攻撃',
      normalHit: '通常攻撃の命中',
      fullChargeShot: 'フルチャージ攻撃',
      lastShot: '最後の弾丸',
    }[trigger.count];
    // Stage 11: 数えるだけのスタック（クラウン S2）は「通常攻撃 43 回 × 20 スタックごと」
    if (trigger.stacks !== undefined) {
      return `${what} ${formatNumber(trigger.every / trigger.stacks)} 回 × ${trigger.stacks} スタックごと`;
    }
    return trigger.every === 1 ? `${what}ごと` : `${what} ${trigger.every} 回ごと`;
  }
  const what = trigger.count === 'burstUse' ? 'バースト使用' : 'フルバースト';
  return trigger.atLeast === 1 ? `${what}時` : `${what} ${trigger.atLeast} 回目以降`;
}

/** 「バースト使用時 →」 */
export function formatTimedTrigger(trigger: ResolvedTrigger): string {
  return `${formatTrigger(trigger)} →`;
}

/** バーストスロットの倍率ダメージ（burstDamage）の種別 */
export const BURST_DAMAGE_TYPE_LABEL: Record<SkillDamageType, string> = {
  skill: 'バーストスキルダメージ',
  distributed: '分配ダメージ',
  additional: '追加ダメージ',
};

/** Stage 8: トリガー付きの倍率ダメージ（damage）の種別 */
export const SKILL_DAMAGE_TYPE_LABEL: Record<SkillDamageType, string> = {
  skill: 'ダメージ',
  distributed: '分配ダメージ',
  additional: '追加ダメージ',
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

/**
 * 「攻撃力 +42.2%」「攻撃力 +3,105（発動者基準 14.1%）」「最大装弾数 +5 発」「チャージ時間 −0.175 秒（発動者基準のチャージ速度）」。
 * Stage 11 モダニア: 「最大装弾数 −5.04%」（▼）、「装弾数無限」、「使用武器の変更（1 発 2.24%・4200 rpm）」
 */
export function formatAppliedAmount(effect: AppliedEffect): string {
  if (effect.stat === 'weapon') {
    const shot = effect.weapon?.shot;
    const hits = effect.weapon && effect.weapon.hits > 1 ? ` × ${effect.weapon.hits} ヒット` : '';
    return `使用武器の変更（1 発 ${formatPercent(effect.value, 2)}${hits}${shot ? `・${formatNumber(shot.rateOfFire)} rpm` : ''}）`;
  }
  const stat = BUFF_STAT_LABEL[effect.stat];
  if (effect.stat === 'infiniteAmmo') return stat;
  const sign = effect.appliedAmount < 0 ? '−' : '+';
  const amount = Math.abs(effect.appliedAmount);
  if (effect.scaling === 'casterAttack') {
    return `${stat} +${formatNumber(effect.appliedAmount)}（発動者基準 ${formatPercent(effect.value, 2)}）`;
  }
  if (effect.scaling === 'flat') return `${stat} ${sign}${formatNumber(amount)} 発`;
  // Stage 11 アリス編: 発動者基準のチャージ速度は秒数でチャージ時間から引く
  if (effect.scaling === 'casterChargeTime')
    return `チャージ時間 −${formatNumber(effect.appliedAmount, 3)} 秒（発動者基準のチャージ速度）`;
  return `${stat} ${sign}${formatPercent(amount, 2)}`;
}

/**
 * Stage 11 モダニア: 持続効果の付き方の補足。「最大 5 スタック」「自分が命中率増加状態なら」。無ければ空文字
 */
export function formatTimedExtras(effect: AppliedTimedEffect): string {
  const parts: string[] = [];
  if (effect.maxStacks !== undefined) parts.push(`最大 ${effect.maxStacks} スタック`);
  if (effect.condition !== undefined) parts.push(`自分が${BUFF_STAT_LABEL[effect.condition.selfBuffed]}増加状態なら`);
  return parts.length === 0 ? '' : `（${parts.join('・')}）`;
}

/** Stage 10: 即時効果。「バースト CT −2.34 秒」「弾丸チャージ 39.88%」。Stage 11: 「回復（最大 HP の 5.23%）」 */
export function formatInstant(effect: ResolvedInstantEffect): string {
  switch (effect.kind) {
    case 'cooldownReduction':
      return `バースト CT −${formatNumber(effect.value, 2)} 秒`;
    case 'ammoRefill':
      return `弾丸チャージ ${formatPercent(effect.value, 2)}`;
    case 'heal':
      return `回復（最大 HP の ${formatPercent(effect.value, 2)}）`;
  }
}

/** 「枠 2 ノワール スキル 1」。ニケ名がまだ無い（読み込み中）ときは「枠 2（読み込み中）スキル 1」 */
export function formatEffectSource(effect: AppliedEffect, characterName: string | undefined): string {
  const who =
    characterName === undefined
      ? `枠 ${effect.sourceSlotIndex + 1}（読み込み中）`
      : `枠 ${effect.sourceSlotIndex + 1} ${characterName}`;
  // Stage 9: 「〈武器〉を所持する味方」だけに掛かる効果。Stage 11: 「直前にバーストを使った味方」「最終攻撃力が最も高い味方 N 機」
  const weapon = effect.targetWeapon ? `${effect.targetWeapon} の` : '';
  const only =
    effect.target === 'burstUsers'
      ? `（直前にバーストを使った${weapon}味方）`
      : effect.target === 'topAttack'
        ? `（最終攻撃力が最も高い${weapon}味方 ${effect.targetCount ?? 1} 機）`
        : effect.targetWeapon
          ? `（${weapon}味方）`
          : '';
  return `${who} ${SKILL_SLOT_LABEL[effect.source.skill]}${only}`;
}

/** Stage 9: 宝物の段階の選択肢のラベル。「1 段階（スキル 1）」「2 段階（+スキル 2）」 */
export function treasurePhaseLabel(unlockOrder: readonly SkillSlot[], phase: number): string {
  if (phase === 0) return 'なし';
  const slot = unlockOrder[phase - 1];
  const what = slot === undefined ? '' : SKILL_SLOT_LABEL[slot];
  return `${phase} 段階（${phase === 1 ? '' : '+'}${what}）`;
}

// ---- Stage 13: 育成入力の効果層（OL・キューブ・コレクション） ----

export const GEAR_PART_LABEL: Record<GearPart, string> = { head: '頭', body: '胴', arm: '腕', leg: '足' };

/** 「攻撃力 +14.63%」 */
export function formatBuildEffect(effect: BuildEffect): string {
  return `${BUFF_STAT_LABEL[effect.stat]} +${formatPercent(effect.value, 2)}`;
}

/** 「OL 頭 1 行目（攻撃力増加 Lv15）」「キューブ（アンチコードHC 段階 6）」「コレクション（…段階 4）」 */
export function formatBuildEffectSource(source: BuildEffectSource): string {
  switch (source.kind) {
    case 'overload':
      return `OL ${source.part ? GEAR_PART_LABEL[source.part] : ''} ${(source.line ?? 0) + 1} 行目（${source.name.ja} Lv${source.level}）`;
    case 'cube':
      return `キューブ（${source.name.ja} 段階 ${source.level}）`;
    case 'collection':
      return `コレクション（${source.name.ja} 段階 ${source.level}）`;
  }
}
