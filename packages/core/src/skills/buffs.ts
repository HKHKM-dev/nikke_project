// 1 体が受けるバフの合計と、ダメージ式への適用（純関数）。computeDamage はここの関数を呼ぶだけにする。
import type { CharacterData } from '../types.ts';
import type { ResolvedEffect } from './resolve.ts';
import type { BuffStat } from './types.ts';

/** 1 体が受けるバフの合計。attackFlat 以外はすべて比率の加算（0.2 = +20%） */
export type BuffTotals = {
  /** 攻撃力の比率加算。Σ(stat attack, scaling ratio) */
  attackRatio: number;
  /** 攻撃力の固定加算（実数）。Σ(発動者のバフ前攻撃力 × value) */
  attackFlat: number;
  /** 会心率の加算。crit.rate に足す */
  critRate: number;
  /** 会心ダメージ倍率の加算。crit.damage − 1 に足す */
  critDamage: number;
  /** 攻撃ダメージの加算。コア・会心・距離の加算グループとは別の乗数 (1 + attackDamage)（2026-09-22 実測で確認） */
  attackDamage: number;
  /** チャージダメージ倍率の加算。fullChargeDamage に足す（フルチャージ時のみ） */
  chargeDamage: number;
};

export const ZERO_BUFFS: Readonly<BuffTotals> = Object.freeze({
  attackRatio: 0,
  attackFlat: 0,
  critRate: 0,
  critDamage: 0,
  attackDamage: 0,
  chargeDamage: 0,
});

/** stat に対応する BuffTotals の比率フィールド */
const RATIO_FIELD: Record<BuffStat, keyof BuffTotals> = {
  attack: 'attackRatio',
  critRate: 'critRate',
  critDamage: 'critDamage',
  attackDamage: 'attackDamage',
  chargeDamage: 'chargeDamage',
};

/** 比率の加算（0.2 = +20%）。新しいオブジェクトを返す */
export function addRatioBuff(totals: BuffTotals, stat: BuffStat, ratio: number): BuffTotals {
  const field = RATIO_FIELD[stat];
  return { ...totals, [field]: totals[field] + ratio };
}

/** 攻撃力の固定加算（実数）。新しいオブジェクトを返す */
export function addFlatAttack(totals: BuffTotals, amount: number): BuffTotals {
  return { ...totals, attackFlat: totals.attackFlat + amount };
}

export type AppliedBuff = { totals: BuffTotals; appliedAmount: number };

/**
 * 解決済みの効果 1 件を totals に足す。単位の判断（比率か実数か）はここに閉じ込める。
 * casterAttack は 発動者のバフ前攻撃力 × value を固定加算し、それ以外は value を比率として加算する。
 */
export function applyResolvedEffect(
  totals: BuffTotals,
  effect: Pick<ResolvedEffect, 'stat' | 'scaling' | 'value'>,
  casterBaseAttack: number,
): AppliedBuff {
  if (effect.scaling === 'casterAttack') {
    const appliedAmount = casterBaseAttack * effect.value;
    return { totals: addFlatAttack(totals, appliedAmount), appliedAmount };
  }
  return { totals: addRatioBuff(totals, effect.stat, effect.value), appliedAmount: effect.value };
}

/** base × (1 + attackRatio) + attackFlat */
export function applyAttackBuffs(baseAttack: number, buffs: BuffTotals): number {
  return baseAttack * (1 + buffs.attackRatio) + buffs.attackFlat;
}

/** { rate: crit.rate + critRate, damage: crit.damage + critDamage } */
export function applyCritBuffs(crit: CharacterData['crit'], buffs: BuffTotals): CharacterData['crit'] {
  return { rate: crit.rate + buffs.critRate, damage: crit.damage + buffs.critDamage };
}

/** 1 + attackDamage。倍率グループ (1 + コア + 会心 + 距離) とは別に掛ける */
export function applyAttackDamageBuffs(buffs: BuffTotals): number {
  return 1 + buffs.attackDamage;
}

/** charge ? fullChargeDamage + chargeDamage : 1 */
export function applyChargeBuffs(fullChargeDamage: number, charge: boolean, buffs: BuffTotals): number {
  return charge ? fullChargeDamage + buffs.chargeDamage : 1;
}
