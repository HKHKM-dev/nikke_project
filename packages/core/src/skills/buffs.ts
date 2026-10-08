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
  /** 防御力無視ダメージ編: 変更後の武器の 1 発が防御力無視ダメージか（WeaponChangeEffect.trueDamage） */
  trueDamage?: true;
  /** 変更後の武器の発が発射体の爆発を持つか（WeaponChangeEffect.projectileExplosion。発射体爆発ダメージ▲が乗る） */
  projectileExplosion?: true;
};

/**
 * 攻撃力▲の丸め（V-0265）。最終攻撃力を整数にする所:
 * - 'total': ▲を全部足した最終攻撃力を四捨五入する（C-0027。いまのモデル）
 * - 'effect': ▲を効果ごとに四捨五入してから足す（同じスキルの同じ値の効果＝スタックは 1 つにまとめる）
 * - 'skill': ▲を出どころのスキル（キャラ × スロット）ごとに足して四捨五入してから足す
 * - 'self': 対象が自分（target self）の▲だけ効果ごとに四捨五入し、ほかの▲と合わせた最終攻撃力を四捨五入する（V-0266）
 * 'effect'・'skill' は検証の予測の仮説（records/predictions の setup）だけが使う。利用者の計算には出さない
 */
export type AttackRounding = 'total' | 'effect' | 'skill' | 'self';

/** いまのモデルの攻撃力▲の丸め（C-0027・C-0400） */
export const ATTACK_ROUNDING: AttackRounding = 'self';

/**
 * 攻撃力▲の 1 件（丸めの仮説用）。source は出どころ（`<resourceId>.<スロット>`。育成の効果層は `build`）。
 * self は対象が自分（target self）の効果
 */
export type AttackPart = { source: string; ratio: number; flat: number; self?: true };

/** 1 体が受けるバフの合計。attackFlat 以外はすべて比率の加算（0.2 = +20%） */
export type BuffTotals = {
  /** 攻撃力の比率加算。Σ(stat attack, scaling ratio) */
  attackRatio: number;
  /** 攻撃力の固定加算（実数）。Σ(発動者のバフ前攻撃力 × value) */
  attackFlat: number;
  /** 攻撃力▲の内訳（足した順）。attackRatio・attackFlat と同じものを 1 件ずつ持つ。丸めの仮説（AttackRounding）だけが読む */
  attackParts: readonly AttackPart[];
  /** 会心率の加算。crit.rate に足す */
  critRate: number;
  /** 会心ダメージ倍率の加算。crit.damage − 1 に足す */
  critDamage: number;
  /** 攻撃ダメージの加算。コア・会心・距離の加算グループとは別の乗数 (1 + attackDamage)（2026-09-22 実測で確認） */
  attackDamage: number;
  /**
   * チャージダメージの加算。倍率▲を掛けて丸めたフルチャージ倍率に足す（フルチャージ時のみ。「チャージダメージ X%▲」、OL の
   * 「チャージダメージ増加」。C-0020・C-0122）
   */
  chargeDamage: number;
  /**
   * ヘルム編: チャージダメージ倍率の加算。素のフルチャージ倍率に (1 + chargeDamageMultiplier) を掛けて四捨五入する（スキルと
   * コレクションの「チャージダメージ X% 倍率▲」。C-0099・C-0122・C-0126）
   */
  chargeDamageMultiplier: number;
  /** Stage 8: 分配ダメージの加算。distributed の倍率ダメージにだけ (1 + distributedDamage) を掛ける（録画 21 で別枠の乗数と確認） */
  distributedDamage: number;
  /**
   * 受けるダメージ編: 敵の受けるダメージの加算。与ダメージのすべて（通常攻撃・射撃ごとの倍率ダメージ・倍率ダメージ・持続ダメージ）に
   * 別枠の乗数 (1 + damageTaken) を掛ける（C-0138）
   */
  damageTaken: number;
  /**
   * アニス：スター S2・バースト編: 発射体爆発ダメージの加算。発射体の爆発を持つ武器（RL）の通常攻撃にだけ掛ける（式の中の置き場所は
   * damage.ts の PROJECTILE_EXPLOSION_BUCKET。plan/design-anis-star-s2-burst.md 2.1 節）
   */
  projectileExplosionDamage: number;
  /**
   * 持続ダメージ▲編: 持続ダメージの加算。その枠の持続ダメージ（dot）の tick にだけ掛ける（式の中の置き場所は skills/burstDamage.ts の
   * SUSTAINED_DAMAGE_PLACEMENT。plan/design-sustained-damage-up.md 3 節）
   */
  sustainedDamage: number;
  /** Stage 8: バーストゲージのチャージ速度の加算。この枠の射撃で溜まるゲージに (1 + burstGaugeSpeed) を掛ける（passive のみ） */
  burstGaugeSpeed: number;
  /** Stage 10: 最大装弾数の比率の加算（frame/firing.ts の effectiveMaxAmmo）。ダメージの式は読まない */
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
   * アニス：スター S2・バースト編: 固定したチャージ時間の秒数（0 は固定なし）。有ればチャージ速度・発動者基準のチャージ速度を無視して
   * この秒数でチャージする（frame/firing.ts。plan/design-anis-star-s2-burst.md 2.3 節）
   */
  fixedChargeTime: number;
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
  /** Stage 13: 通常攻撃ダメージ倍率の加算。通常攻撃の武器倍率に (1 + normalAttackDamage) を掛けて四捨五入する（C-0121。damage.ts） */
  normalAttackDamage: number;
  /** ヘルム編: 通常攻撃のクリティカル確率の加算。通常攻撃の会心率にだけ足す（倍率ダメージ・バーストスキルには足さない。damage.ts） */
  normalCritRate: number;
  /**
   * 防御力無視ダメージ編: 防御力無視ダメージ▲の加算。防御力無視ダメージの発（trueDamageConversion の窓の通常攻撃・trueDamage の
   * 使用武器の変更）にだけ掛ける（式の中の置き場所は damage.ts の TRUE_DAMAGE_BUCKET。plan/design-true-damage-element.md 3.1 節）
   */
  trueDamage: number;
  /** 防御力無視ダメージ編: 「通常攻撃が防御力無視ダメージに変化」の窓の数（> 0 なら通常攻撃の基礎に防御力を引かない） */
  trueDamageConversion: number;
  /** Stage 11 モダニア: 使用武器の変更（無ければ null）。射手とダメージの式が基礎の武器の代わりに使う */
  weapon: ChangedWeapon | null;
};

export const ZERO_BUFFS: Readonly<BuffTotals> = Object.freeze({
  attackRatio: 0,
  attackFlat: 0,
  attackParts: Object.freeze([]) as readonly AttackPart[],
  critRate: 0,
  critDamage: 0,
  attackDamage: 0,
  chargeDamage: 0,
  chargeDamageMultiplier: 0,
  distributedDamage: 0,
  damageTaken: 0,
  projectileExplosionDamage: 0,
  sustainedDamage: 0,
  burstGaugeSpeed: 0,
  maxAmmoRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  chargeSpeed: 0,
  chargeTimeFlat: 0,
  fixedChargeTime: 0,
  hitRate: 0,
  infiniteAmmo: 0,
  elementDamage: 0,
  coreDamage: 0,
  normalAttackDamage: 0,
  normalCritRate: 0,
  trueDamage: 0,
  trueDamageConversion: 0,
  weapon: null,
});

/** stat に対応する BuffTotals の比率フィールド */
const RATIO_FIELD: Record<BuffStat, Exclude<keyof BuffTotals, 'weapon' | 'attackParts'>> = {
  attack: 'attackRatio',
  critRate: 'critRate',
  critDamage: 'critDamage',
  attackDamage: 'attackDamage',
  chargeDamage: 'chargeDamage',
  chargeDamageMultiplier: 'chargeDamageMultiplier',
  distributedDamage: 'distributedDamage',
  damageTaken: 'damageTaken',
  projectileExplosionDamage: 'projectileExplosionDamage',
  sustainedDamage: 'sustainedDamage',
  fixedChargeTime: 'fixedChargeTime',
  burstGaugeSpeed: 'burstGaugeSpeed',
  maxAmmo: 'maxAmmoRatio',
  reloadSpeed: 'reloadSpeed',
  chargeSpeed: 'chargeSpeed',
  hitRate: 'hitRate',
  infiniteAmmo: 'infiniteAmmo',
  elementDamage: 'elementDamage',
  coreDamage: 'coreDamage',
  normalAttackDamage: 'normalAttackDamage',
  normalCritRate: 'normalCritRate',
  trueDamage: 'trueDamage',
  trueDamageConversion: 'trueDamageConversion',
};

/** Stage 11 モダニア: stat の合計（「自分が 〈stat〉 増加状態なら」の判定用） */
export function statTotal(totals: BuffTotals, stat: BuffStat): number {
  return totals[RATIO_FIELD[stat]];
}

/** 比率の加算（0.2 = +20%）。新しいオブジェクトを返す。攻撃力は内訳にも出どころ source で足す */
export function addRatioBuff(
  totals: BuffTotals,
  stat: BuffStat,
  ratio: number,
  source = 'build',
  self = false,
): BuffTotals {
  const field = RATIO_FIELD[stat];
  const next = { ...totals, [field]: totals[field] + ratio };
  if (stat !== 'attack') return next;
  return { ...next, attackParts: [...totals.attackParts, { source, ratio, flat: 0, ...(self ? { self } : {}) }] };
}

/** 攻撃力の固定加算（実数）。新しいオブジェクトを返す。内訳にも出どころ source で足す */
export function addFlatAttack(totals: BuffTotals, amount: number, source = 'build', self = false): BuffTotals {
  return {
    ...totals,
    attackFlat: totals.attackFlat + amount,
    attackParts: [...totals.attackParts, { source, ratio: 0, flat: amount, ...(self ? { self } : {}) }],
  };
}

/** 効果の出どころ（AttackPart.source） */
function sourceKeyOf(effect: { source?: ResolvedEffect['source'] }): string {
  return effect.source === undefined ? 'build' : `${effect.source.resourceId}.${effect.source.skill}`;
}

export type AppliedBuff = { totals: BuffTotals; appliedAmount: number };

/**
 * 解決済みの効果 1 件を totals に足す。単位の判断（比率か実数か）はここに閉じ込める。
 * casterAttack は 発動者のバフ前攻撃力 × value を固定加算し、flat（Stage 10。maxAmmo だけ）は value を発数として
 * maxAmmoFlat に加算し、それ以外は value を比率として加算する。
 */
export function applyResolvedEffect(
  totals: BuffTotals,
  effect: Pick<ResolvedEffect, 'stat' | 'scaling' | 'value'> & {
    weapon?: ChangedWeapon;
    source?: ResolvedEffect['source'];
    target?: ResolvedEffect['target'];
  },
  casterBaseAttack: number,
): AppliedBuff {
  // Stage 11 モダニア: 使用武器の変更は値を足さず、武器を差し替える（1 体に 1 つ。後から付いたほうを使う）
  if (effect.stat === 'weapon') {
    return { totals: { ...totals, weapon: effect.weapon ?? null }, appliedAmount: effect.value };
  }
  if (effect.scaling === 'casterAttack') {
    const appliedAmount = casterBaseAttack * effect.value;
    return {
      totals: addFlatAttack(totals, appliedAmount, sourceKeyOf(effect), effect.target === 'self'),
      appliedAmount,
    };
  }
  if (effect.scaling === 'casterChargeTime') {
    // value は解決時に 発動者の基礎チャージ時間 × 比率 の秒数にしてある（skills/resolve.ts）
    return { totals: { ...totals, chargeTimeFlat: totals.chargeTimeFlat + effect.value }, appliedAmount: effect.value };
  }
  // 対象の語彙編: 「チャージ時間 X 秒▼」（chargeSpeed の flat。値は秒）は、発動者基準のチャージ速度と同じく秒数を引く
  if (effect.scaling === 'flat' && effect.stat === 'chargeSpeed') {
    return { totals: { ...totals, chargeTimeFlat: totals.chargeTimeFlat + effect.value }, appliedAmount: effect.value };
  }
  if (effect.scaling === 'flat') {
    return { totals: { ...totals, maxAmmoFlat: totals.maxAmmoFlat + effect.value }, appliedAmount: effect.value };
  }
  return {
    totals: addRatioBuff(totals, effect.stat as BuffStat, effect.value, sourceKeyOf(effect), effect.target === 'self'),
    appliedAmount: effect.value,
  };
}

/** base × (1 + attackRatio) + attackFlat */
export function applyAttackBuffs(baseAttack: number, buffs: BuffTotals): number {
  return baseAttack * (1 + buffs.attackRatio) + buffs.attackFlat;
}

/**
 * 整数の最終攻撃力（C-0027）。rounding が 'total' なら applyAttackBuffs を四捨五入し、'effect'・'skill' なら
 * ▲の内訳（attackParts）を効果ごと・出どころのスキルごとにまとめて四捨五入してから足す（AttackRounding）
 */
export function roundedAttack(
  baseAttack: number,
  buffs: BuffTotals,
  rounding: AttackRounding = ATTACK_ROUNDING,
): number {
  if (rounding === 'total') return Math.round(applyAttackBuffs(baseAttack, buffs));
  if (rounding === 'self') {
    if (buffs.attackParts.length === 0) return Math.round(applyAttackBuffs(baseAttack, buffs));
    const own = new Map<string, number>();
    let rest = baseAttack;
    for (const part of buffs.attackParts) {
      const amount = baseAttack * part.ratio + part.flat;
      if (part.self !== true) rest += amount;
      else {
        const key = `${part.source}|${part.ratio}|${part.flat}`;
        own.set(key, (own.get(key) ?? 0) + amount);
      }
    }
    for (const amount of own.values()) rest += Math.round(amount);
    return Math.round(rest);
  }
  const groups = new Map<string, number>();
  for (const part of buffs.attackParts) {
    const key = rounding === 'skill' ? part.source : `${part.source}|${part.ratio}|${part.flat}`;
    groups.set(key, (groups.get(key) ?? 0) + baseAttack * part.ratio + part.flat);
  }
  let attack = Math.round(baseAttack);
  for (const amount of groups.values()) attack += Math.round(amount);
  return attack;
}

/**
 * { rate: min(1, crit.rate + critRate), damage: crit.damage + critDamage }。
 * 順位の発数編: 会心率は確率なので 1 で頭打ち（plan/design-ranked-shot-duration.md 7 節の論点 2）
 */
export function applyCritBuffs(crit: CharacterData['crit'], buffs: BuffTotals): CharacterData['crit'] {
  return { rate: capCritRate(crit.rate + buffs.critRate), damage: crit.damage + buffs.critDamage };
}

/** 順位の発数編: 会心率（確率）の上限 1 */
export function capCritRate(rate: number): number {
  return Math.min(1, rate);
}

/** 1 + attackDamage。倍率グループ (1 + コア + 会心 + 距離) とは別に掛ける */
export function applyAttackDamageBuffs(buffs: BuffTotals): number {
  return 1 + buffs.attackDamage;
}

/**
 * 1e-4 単位の整数 units に (1 + ratio) を掛けて四捨五入した整数（C-0127）。ratio も 1e-4 単位に直してから掛けるので、
 * 端数がちょうど 0.5 の値（2.5 × 1.0947 = 2.73675 など）も浮動小数の誤差なく切り上がる
 */
export function scaleBasisPoints(units: number, ratio: number): number {
  return Math.round((Math.round(units) * (10000 + Math.round(ratio * 10000))) / 10000);
}

/**
 * charge ? 四捨五入(fullChargeDamage × (1 + chargeDamageMultiplier)) + chargeDamage : 1。倍率▲（スキル・コレクション）は
 * 足し合わせてから素のフルチャージ倍率に掛けて 1e-4 単位で丸め、足し算の▲（OL の増加など）はその後に足す（C-0122・C-0126）。
 * スキルの足し算の▲（C-0020）も OL と同じく倍率▲の後に足す（C-0134。アリスのフルバースト中）
 */
export function applyChargeBuffs(fullChargeDamage: number, charge: boolean, buffs: BuffTotals): number {
  if (!charge) return 1;
  return scaleBasisPoints(fullChargeDamage * 10000, buffs.chargeDamageMultiplier) / 10000 + buffs.chargeDamage;
}
