// 1 体が受けるバフの合計と、ダメージ式への適用（純関数）。computeDamage はここの関数を呼ぶだけにする。
import type { CharacterData } from '../types.ts';
import type { BuffScaling, BuffStat } from './types.ts';

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
  /** 攻撃ダメージの加算。boost の加算項 */
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

/** totals に 1 効果分を足した新しいオブジェクトを返す。amount は ratio なら比率、casterAttack なら攻撃力の実数 */
export function addBuff(totals: BuffTotals, stat: BuffStat, scaling: BuffScaling, amount: number): BuffTotals {
  if (stat === 'attack') {
    return scaling === 'casterAttack'
      ? { ...totals, attackFlat: totals.attackFlat + amount }
      : { ...totals, attackRatio: totals.attackRatio + amount };
  }
  return { ...totals, [stat]: totals[stat] + amount };
}

/** base × (1 + attackRatio) + attackFlat */
export function applyAttackBuffs(baseAttack: number, buffs: BuffTotals): number {
  return baseAttack * (1 + buffs.attackRatio) + buffs.attackFlat;
}

/** { rate: crit.rate + critRate, damage: crit.damage + critDamage } */
export function applyCritBuffs(crit: CharacterData['crit'], buffs: BuffTotals): CharacterData['crit'] {
  return { rate: crit.rate + buffs.critRate, damage: crit.damage + buffs.critDamage };
}

/** charge ? fullChargeDamage + chargeDamage : 1 */
export function applyChargeBuffs(fullChargeDamage: number, charge: boolean, buffs: BuffTotals): number {
  return charge ? fullChargeDamage + buffs.chargeDamage : 1;
}
