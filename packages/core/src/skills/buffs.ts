// 1 体が受けるバフの合計と、ダメージ式への適用（純関数）。computeDamage はここの関数を呼ぶだけにする。
import type { CharacterData, ShotParams } from '../types.ts';
import type { ResolvedEffect } from './resolve.ts';
import type { BuffStat } from './types.ts';

/**
 * Stage 11 モダニア: 使用武器の変更（殲滅モード）で持ち替えた武器。shot は基礎の武器を写して、1 発のダメージとレートを差し替えたもの
 * （CDN に無いパラメータは仮の定数。skills/resolve.ts の changedWeaponShot）
 */
export type ChangedWeapon = {
  /** 区間の鍵・同一性の判定用（resourceId.slot.effectIndex） */
  id: string;
  /** 1 発のヒット数（shot.damage はヒット数ぶんを合計した武器倍率。表示用に残す） */
  hits: number;
  shot: ShotParams;
};

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
  /** Stage 8: 分配ダメージの加算。distributed の倍率ダメージにだけ (1 + distributedDamage) を掛ける（録画 21 で別枠の乗数と確認） */
  distributedDamage: number;
  /** Stage 8: バーストゲージのチャージ速度の加算。この枠の射撃で溜まるゲージに (1 + burstGaugeSpeed) を掛ける（passive のみ） */
  burstGaugeSpeed: number;
  /** Stage 10: 最大装弾数の比率の加算（sim/firing.ts の effectiveMaxAmmo）。ダメージの式は読まない */
  maxAmmoRatio: number;
  /** Stage 10: 最大装弾数の発数の加算（scaling 'flat'） */
  maxAmmoFlat: number;
  /** Stage 10: リロード速度の加算 */
  reloadSpeed: number;
  /** Stage 10: チャージ速度の加算 */
  chargeSpeed: number;
  /** Stage 11 アリス編: チャージ時間から引く秒数（発動者基準のチャージ速度。scaling casterChargeTime） */
  chargeTimeFlat: number;
  /**
   * Stage 11 モダニア: 命中率の加算。ダメージの式も射手も読まない（全弾命中の前提）。区間の鍵にも入れず、
   * 「自分が命中率増加状態なら」の条件（timed の condition）と表示にだけ使う
   */
  hitRate: number;
  /** Stage 11 モダニア: 装弾数無限の窓の数（> 0 なら残弾を減らさない。射撃に効く） */
  infiniteAmmo: number;
  /** Stage 13: 有利コードの攻撃ダメージの加算。属性有利のときだけ (1.1 + elementDamage)（element.ts） */
  elementDamage: number;
  /** Stage 13: コアダメージの加算。コア命中の加算項 (コア倍率 − 1 + coreDamage)（通常攻撃だけ） */
  coreDamage: number;
  /** Stage 13: 通常攻撃ダメージ倍率の加算。通常攻撃の武器倍率に (1 + normalAttackDamage) を掛ける（仮定。damage.ts） */
  normalAttackDamage: number;
  /** Stage 11 モダニア: 使用武器の変更（無ければ null）。射手とダメージの式が基礎の武器の代わりに使う */
  weapon: ChangedWeapon | null;
};

export const ZERO_BUFFS: Readonly<BuffTotals> = Object.freeze({
  attackRatio: 0,
  attackFlat: 0,
  critRate: 0,
  critDamage: 0,
  attackDamage: 0,
  chargeDamage: 0,
  distributedDamage: 0,
  burstGaugeSpeed: 0,
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  chargeSpeed: 0,
  chargeTimeFlat: 0,
  hitRate: 0,
  infiniteAmmo: 0,
  elementDamage: 0,
  coreDamage: 0,
  normalAttackDamage: 0,
  weapon: null,
});

/** stat に対応する BuffTotals の比率フィールド */
const RATIO_FIELD: Record<BuffStat, Exclude<keyof BuffTotals, 'weapon'>> = {
  attack: 'attackRatio',
  critRate: 'critRate',
  critDamage: 'critDamage',
  attackDamage: 'attackDamage',
  chargeDamage: 'chargeDamage',
  distributedDamage: 'distributedDamage',
  burstGaugeSpeed: 'burstGaugeSpeed',
  maxAmmo: 'maxAmmoRatio',
  reloadSpeed: 'reloadSpeed',
  chargeSpeed: 'chargeSpeed',
  hitRate: 'hitRate',
  infiniteAmmo: 'infiniteAmmo',
  elementDamage: 'elementDamage',
  coreDamage: 'coreDamage',
  normalAttackDamage: 'normalAttackDamage',
};

/** Stage 11 モダニア: stat の合計（「自分が 〈stat〉 増加状態なら」の判定用） */
export function statTotal(totals: BuffTotals, stat: BuffStat): number {
  return totals[RATIO_FIELD[stat]];
}

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
 * casterAttack は 発動者のバフ前攻撃力 × value を固定加算し、flat（Stage 10。maxAmmo だけ）は value を発数として
 * maxAmmoFlat に加算し、それ以外は value を比率として加算する。
 */
export function applyResolvedEffect(
  totals: BuffTotals,
  effect: Pick<ResolvedEffect, 'stat' | 'scaling' | 'value'> & { weapon?: ChangedWeapon },
  casterBaseAttack: number,
): AppliedBuff {
  // Stage 11 モダニア: 使用武器の変更は値を足さず、武器を差し替える（1 体に 1 つ。後から付いたほうを使う）
  if (effect.stat === 'weapon') {
    return { totals: { ...totals, weapon: effect.weapon ?? null }, appliedAmount: effect.value };
  }
  if (effect.scaling === 'casterAttack') {
    const appliedAmount = casterBaseAttack * effect.value;
    return { totals: addFlatAttack(totals, appliedAmount), appliedAmount };
  }
  if (effect.scaling === 'casterChargeTime') {
    // value は解決時に 発動者の基礎チャージ時間 × 比率 の秒数にしてある（skills/resolve.ts）
    return { totals: { ...totals, chargeTimeFlat: totals.chargeTimeFlat + effect.value }, appliedAmount: effect.value };
  }
  if (effect.scaling === 'flat') {
    return { totals: { ...totals, maxAmmoFlat: totals.maxAmmoFlat + effect.value }, appliedAmount: effect.value };
  }
  return { totals: addRatioBuff(totals, effect.stat as BuffStat, effect.value), appliedAmount: effect.value };
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
