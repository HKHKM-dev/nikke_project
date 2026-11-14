// 1 体が受けるバフの合計と、ダメージ式への適用（純関数）。computeTriggerDamage（damage.ts）はここの関数を呼ぶだけにする。
import type { CharacterData, ShotParams } from '../types.ts';
import type { ResolvedEffect } from './resolve.ts';
import type { BuffStat } from './types.ts';

/**
 * 使用武器の変更（殲滅モード）で持ち替えた武器。shot は基礎の武器を写して、1 発のダメージとレートを差し替えたもの
 * （CDN に無いパラメータは仮の定数。skills/resolve.ts の changedWeaponShot）
 */
export type ChangedWeapon = {
  /** 区間の鍵・同一性の判定用（resourceId.slot.effectIndex） */
  id: string;
  /** 1 発のヒット数（shot.damage はヒット数ぶんを合計した武器倍率。表示用に残す） */
  hits: number;
  shot: ShotParams;
  /** 変更後の武器の 1 発が防御力無視ダメージか（WeaponChangeEffect.trueDamage） */
  trueDamage?: true;
  /** 変更後の武器の発が発射体の爆発を持つか（WeaponChangeEffect.projectileExplosion。発射体爆発ダメージ▲が乗る） */
  projectileExplosion?: true;
  /** 変更後の武器の発が貫通特化か（WeaponChangeEffect.pierce。貫通ダメージ▲が乗る） */
  pierce?: true;
  /**
   * 変更の窓が射手に見える最初のフレームから最初の発までの待ち
   * （WeaponChangeEffect.firstShotDelayFrames。plan/design-skill-stage11.md 2.1 節）。省略は weaponChangeShooter の待ち
   */
  firstShotDelayFrames?: number;
  /** 持ち替えから最初の発まで（WeaponChangeEffect.firstShotAfterSwapFrames） */
  firstShotAfterSwapFrames?: number;
  /** 変更後の武器は撃っても残弾を減らさない（WeaponChangeEffect.infiniteAmmo） */
  infiniteAmmo?: true;
  /** 変更後の武器の解放の長さ（フレーム。端数あり。WeaponChangeEffect.chargeReleaseSeconds） */
  chargeReleaseFrames?: number;
  /**
   * 同: 的の表の変更後の武器の行の鍵（`<resourceId>:<スロット>`。coreHitRate.weaponChanges・bulletHitRate.weaponChanges）。どの変更も
   * 持ち、行のある変更（即着弾に替えた変更と、チャージ武器に替えた変更）は通常攻撃のコア命中率・弾丸命中率をこの行から引く
   * （行が無ければ基礎の武器の行のまま）
   */
  targetRowKey?: string;
  /** チャージ時間の固定（WeaponChangeEffect.chargeTimeFixed。plan/design-nayuta.md 2.4 節）。shot.chargeTime がチャージ速度▲を受けない */
  fixedChargeTime?: true;
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

/** チャージ速度▲の 1 件（超過分の変換の丸め用。V-0640）。source は出どころ（`<resourceId>.<スロット>`。育成の効果層は `build`） */
export type ChargeSpeedPart = Pick<AttackPart, 'source' | 'ratio'>;

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
   * チャージダメージ倍率の加算。素のフルチャージ倍率に (1 + chargeDamageMultiplier) を掛けて四捨五入する（スキルと
   * コレクションの「チャージダメージ X% 倍率▲」。C-0099・C-0122・C-0126）
   */
  chargeDamageMultiplier: number;
  /** 分配ダメージの加算。distributed の倍率ダメージにだけ (1 + distributedDamage + damageTaken) ÷ (1 + damageTaken) を掛ける（録画 0021 で攻撃ダメージ▲と別枠の乗数と確認。受けるダメージ▲とは 1 つの和。C-0767） */
  distributedDamage: number;
  /**
   * 敵の受けるダメージの加算。与ダメージのすべて（通常攻撃・射撃ごとの倍率ダメージ・倍率ダメージ・持続ダメージ）に
   * 別枠の乗数 (1 + damageTaken) を掛ける（C-0138）
   */
  damageTaken: number;
  /**
   * 敵の防御力▼の加算（割合。plan/design-skill-stage2.md）。与ダメージの式で、敵の防御力を (1 − Σ) 倍にしてから
   * 引く（damage.ts の defenceAfterDown。0〜1 に収める）
   */
  enemyDefenseDown: number;
  /**
   * 発動者基準の敵の防御力▼の加算（防御力の値。Σ(発動者のバフ前防御力 × value)。plan/design-mast.md 2.2 節）。割合の▼の後に
   * 引き、0 で止める（damage.ts の defenceAfterDown。順と 0 で止めるのは未確定の仮の形）
   */
  enemyDefenseDownFlat: number;
  /**
   * 発射体爆発ダメージの加算。発射体の爆発を持つ武器（RL）の通常攻撃にだけ掛ける（式の中の置き場所は
   * damage.ts の PROJECTILE_EXPLOSION_BUCKET。plan/design-anis-star-s2-burst.md 2.1 節）
   */
  projectileExplosionDamage: number;
  /**
   * 発射体付着ダメージの加算（plan/design-skill-stage12.md 2.3 節）。projectileStick の印の付いた倍率ダメージ
   * （粘着榴弾の付着）にだけ掛ける（式の中の置き場所は damage.ts の PROJECTILE_STICK_BUCKET）
   */
  projectileStickDamage: number;
  /**
   * 「有利コードのダメージ適用」の窓の数（> 0 なら、敵のコードが自分の
   * コードの有利でなくても有利として扱う。効果の enemyElement でそのコードの敵に限ってある。element.ts。plan/design-skill-stage12.md 2.4 節）
   */
  elementAdvantage: number;
  /**
   * 持続ダメージの加算。その枠の持続ダメージ（dot）の tick にだけ掛ける（式の中の置き場所は skills/burstDamage.ts の
   * SUSTAINED_DAMAGE_PLACEMENT。plan/design-sustained-damage-up.md 3 節）
   */
  sustainedDamage: number;
  /** バーストゲージのチャージ速度の加算。この枠の射撃で溜まるゲージに (1 + burstGaugeSpeed) を掛ける（passive のみ） */
  burstGaugeSpeed: number;
  /**
   * 順番攻撃ダメージの加算（plan/design-new-chars-1029.md 5.5 節）。「N 回順番に攻撃」の倍率ダメージにだけ
   * 攻撃ダメージ▲と同じ和に足す（skills/burstDamage.ts の computeBurstHit。V-0545）
   */
  sequentialAttackDamage: number;
  /**
   * 「〜敵1機に」で終わるバーストスキルダメージの加算（plan/design-jackal.md 2 節）。印 oneEnemy の付いた burstDamage にだけ
   * 攻撃ダメージ▲と同じ和に足す（skills/burstDamage.ts の computeBurstHit）
   */
  oneEnemyBurstDamage: number;
  /** 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.3 節）: 蓄積爆破のダメージ蓄積割合の加算。accumulate（capOrExpire）の割合に足す（C-0903） */
  accumulateRatio: number;
  /**
   * バーストスキルのクールタイム▼ の秒（維持の付いた形。T4。scaling 'flat'。plan/design-skill-stage11.md 3.3 節）。
   * 1 パス目が発動のフレームに件の一覧から読む（frame/firstPass.ts）。区間の合計は表示だけで、ダメージの式は読まない
   */
  burstCooldown: number;
  /** 最大装弾数の比率の加算（frame/firing.ts の effectiveMaxAmmo）。ダメージの式は読まない */
  maxAmmoRatio: number;
  /**
   * 最大HP▲ の比率の加算（plan/design-skill-stage6.md 2.4 節）。その枠の最終最大HP = バフ前の最大HP ×
   * (1 + maxHpRatio)。ダメージの式は読まず、その枠が発動者の casterFinalMaxHp だけが読む（skills/timeline.ts・skills/holders.ts）
   */
  maxHpRatio: number;
  /**
   * 防御力▲ の比率の加算（plan/design-skill-stage7.md 1.2 節）。その枠の最終防御力 = バフ前の防御力 × (1 + defenseRatio)。
   * ダメージの式は読まず、対象の絞り込み「自分より最終防御力が低い味方」だけが読む（skills/holders.ts）
   */
  defenseRatio: number;
  /** 最大装弾数の発数の加算（scaling 'flat'） */
  maxAmmoFlat: number;
  /** リロード速度の加算 */
  reloadSpeed: number;
  /** リロード比率の加算（分割リロードの 1 段の割合に (1 + Σ) を掛ける。▼は負。plan/design-grave.md 2.3 節） */
  reloadRatio: number;
  /** チャージ速度の加算 */
  chargeSpeed: number;
  /** チャージ速度▲の内訳（足した順）。chargeSpeed と同じものを 1 件ずつ持つ。超過分の変換（chargeSpeedOverflowDamage）だけが読む */
  chargeSpeedParts: readonly ChargeSpeedPart[];
  /**
   * チャージ速度の超過分の変換の割合の加算（「超過した値の X% のチャージダメージ▲」の X。plan/design-red-hood.md 2.4 節）。
   * フルチャージの発で max(0, chargeSpeed − 1) × この値をチャージダメージ▲に足す（applyChargeBuffs）
   */
  chargeSpeedOverflow: number;
  /**
   * 最終最大装弾数 1 発ごとのチャージダメージ▲の比率の加算（scaling perFinalMaxAmmo。plan/design-emilia.md 2.1 節）。
   * フルチャージの発で min(50, 最終最大装弾数) × この値をチャージダメージ▲に足す（applyChargeBuffs）
   */
  chargeDamagePerMaxAmmo: number;
  /**
   * 攻撃速度の加算（plan/design-skill-stage9.md 1.2 節）。レートを蓄積して撃つ武器の発と発の間を、レート × (1 + Σ) に
   * する（frame/firing.ts の FiringParams.rateScale。C-0600）。ダメージの式は読まない
   */
  attackSpeed: number;
  /**
   * マシンガン立ち上げ速度の加算（plan/design-new-chars-1029.md 5.6 節）。MG のレートの上がり方に (1 + Σ) を
   * 掛ける（frame/firing.ts の FiringParams.spinUpScale。読みは仮説）。ダメージの式は読まない
   */
  spinUpSpeed: number;
  /** チャージ時間から引く秒数（発動者基準のチャージ速度。scaling casterChargeTime） */
  chargeTimeFlat: number;
  /**
   * 固定したチャージ時間の秒数（0 は固定なし）。有ればチャージ速度・発動者基準のチャージ速度を無視して
   * この秒数でチャージする（frame/firing.ts。plan/design-anis-star-s2-burst.md 2.3 節）。足し合わせず、状態の中身の
   * 固定が timed の固定より勝つ（applyResolvedEffect）
   */
  fixedChargeTime: number;
  /**
   * 射撃の姿勢の長さの倍率（掛け合わせ。1 は縮めない。plan/design-a2-bmode-stance.md 3.2 節）。射撃姿勢維持型の武器の姿勢と満ちてから
   * 撃つまでを、丸める前の長さに掛けて縮める（frame/firing.ts の stanceFrames）。ダメージの式は読まない
   */
  fireStanceScale: number;
  /**
   * 命中率の加算。ダメージの式も射手も読まない（全弾命中の前提）。区間の鍵にも入れず、
   * 「自分が命中率増加状態なら」の条件（timed の condition）と表示にだけ使う
   */
  hitRate: number;
  /**
   * hitRate のうちの命中率▲（正の値）の和。条件が自動の枠で、▲と同時に効いている区間に的の▼の表を使わないのに使う（HitRateN。
   * plan/design-maids.md 8.4 節）
   */
  hitRateUp: number;
  /** 装弾数無限の窓の数（> 0 なら残弾を減らさない。射撃に効く） */
  infiniteAmmo: number;
  /** 有利コードの攻撃ダメージの加算。属性有利のときだけ (1.1 + elementDamage)（element.ts） */
  elementDamage: number;
  /** コアダメージの加算。コア命中の加算項 (コア倍率 − 1 + coreDamage)（通常攻撃だけ） */
  coreDamage: number;
  /** 通常攻撃ダメージ倍率の加算。通常攻撃の武器倍率に (1 + normalAttackDamage) を掛けて四捨五入する（C-0121。damage.ts） */
  normalAttackDamage: number;
  /** 通常攻撃のクリティカル確率の加算。通常攻撃の会心率にだけ足す（倍率ダメージ・バーストスキルには足さない。damage.ts） */
  normalCritRate: number;
  /**
   * 防御力無視ダメージ▲の加算。防御力無視ダメージの発（trueDamageConversion の窓の通常攻撃・trueDamage の
   * 使用武器の変更）にだけ掛ける（式の中の置き場所は damage.ts の TRUE_DAMAGE_BUCKET。plan/design-true-damage-element.md 3.1 節）
   */
  trueDamage: number;
  /** 「通常攻撃が防御力無視ダメージに変化」の窓の数（> 0 なら通常攻撃の基礎に防御力を引かない） */
  trueDamageConversion: number;
  /**
   * 適正最小射程距離▲の和（plan/design-agent-bunny.md 2.1 節）。状態だけの stat で、条件が自動の枠の
   * 距離ボーナスを出し直すのに使う（frame/landing.ts の landingPartsWith）
   */
  minEffectiveRange: number;
  /** 同 2.3 節: 貫通特化の窓の数（> 0 なら通常攻撃に pierceDamage を攻撃ダメージ▲の和に足す） */
  pierce: number;
  /** 同: 貫通ダメージ▲の和（貫通特化の効いている通常攻撃にだけ。damage.ts） */
  pierceDamage: number;
  /**
   * ペレット数▲の和（個。plan/design-dorothy-serendipity.md 2.2 節）。与ダメージの式は読まない（1 発の
   * 総ダメージは変わらない）。1 パス目のペレットの命中の量・ゲージと、照合の 1 ペレットの値が読む（pelletsPerShot）
   */
  pelletCount: number;
  /** 同 2.1 節: 「ペレットの数を 1 個に固定」の窓の数（> 0 なら 1 発のペレットは 1 個。ペレット数▲より勝つ） */
  singlePellet: number;
  /** 使用武器の変更（無ければ null）。射手とダメージの式が基礎の武器の代わりに使う */
  weapon: ChangedWeapon | null;
};

/**
 * 命中率の和（plan/design-maids.md 8.4 節）。n は▲▼を足した符号つきの和 N（BuffTotals.hitRate）、up はそのうちの▲の側（正の値）の和
 * （BuffTotals.hitRateUp）。的の▼の表は、▼だけが効く N（up = 0 で n < 0）にだけ使う（frame/landing.ts の coreHitRateAt）
 */
export type HitRateN = { readonly n: number; readonly up: number };

export const ZERO_HIT_RATE: HitRateN = Object.freeze({ n: 0, up: 0 });

/** 状態の合計の命中率の和 */
export function hitRateNOf(buffs: Pick<BuffTotals, 'hitRate' | 'hitRateUp'>): HitRateN {
  return { n: buffs.hitRate, up: buffs.hitRateUp };
}

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
  enemyDefenseDown: 0,
  enemyDefenseDownFlat: 0,
  projectileExplosionDamage: 0,
  projectileStickDamage: 0,
  elementAdvantage: 0,
  sustainedDamage: 0,
  burstGaugeSpeed: 0,
  sequentialAttackDamage: 0,
  oneEnemyBurstDamage: 0,
  accumulateRatio: 0,
  burstCooldown: 0,
  maxAmmoRatio: 0,
  maxHpRatio: 0,
  defenseRatio: 0,
  maxAmmoFlat: 0,
  reloadSpeed: 0,
  reloadRatio: 0,
  chargeSpeed: 0,
  chargeSpeedParts: Object.freeze([]) as readonly ChargeSpeedPart[],
  chargeSpeedOverflow: 0,
  chargeDamagePerMaxAmmo: 0,
  attackSpeed: 0,
  spinUpSpeed: 0,
  chargeTimeFlat: 0,
  fixedChargeTime: 0,
  fireStanceScale: 1,
  hitRate: 0,
  hitRateUp: 0,
  infiniteAmmo: 0,
  elementDamage: 0,
  coreDamage: 0,
  normalAttackDamage: 0,
  normalCritRate: 0,
  trueDamage: 0,
  trueDamageConversion: 0,
  minEffectiveRange: 0,
  pierce: 0,
  pierceDamage: 0,
  pelletCount: 0,
  singlePellet: 0,
  weapon: null,
});

/** stat に対応する BuffTotals の比率フィールド */
const RATIO_FIELD: Record<BuffStat, Exclude<keyof BuffTotals, 'weapon' | 'attackParts' | 'chargeSpeedParts'>> = {
  attack: 'attackRatio',
  critRate: 'critRate',
  critDamage: 'critDamage',
  attackDamage: 'attackDamage',
  chargeDamage: 'chargeDamage',
  chargeDamageMultiplier: 'chargeDamageMultiplier',
  distributedDamage: 'distributedDamage',
  damageTaken: 'damageTaken',
  enemyDefenseDown: 'enemyDefenseDown',
  projectileExplosionDamage: 'projectileExplosionDamage',
  projectileStickDamage: 'projectileStickDamage',
  elementAdvantage: 'elementAdvantage',
  sustainedDamage: 'sustainedDamage',
  sequentialAttackDamage: 'sequentialAttackDamage',
  oneEnemyBurstDamage: 'oneEnemyBurstDamage',
  accumulateRatio: 'accumulateRatio',
  fixedChargeTime: 'fixedChargeTime',
  fireStanceScale: 'fireStanceScale',
  burstGaugeSpeed: 'burstGaugeSpeed',
  burstCooldown: 'burstCooldown',
  maxAmmo: 'maxAmmoRatio',
  maxHp: 'maxHpRatio',
  // 最大HP のみ▲ も最終最大HP には同じに足す（HP の割合を下げる読みは未実装。skills/types.ts の BUFF_STATS）
  maxHpOnly: 'maxHpRatio',
  defense: 'defenseRatio',
  reloadSpeed: 'reloadSpeed',
  reloadRatio: 'reloadRatio',
  chargeSpeed: 'chargeSpeed',
  chargeSpeedOverflow: 'chargeSpeedOverflow',
  attackSpeed: 'attackSpeed',
  spinUpSpeed: 'spinUpSpeed',
  hitRate: 'hitRate',
  infiniteAmmo: 'infiniteAmmo',
  elementDamage: 'elementDamage',
  coreDamage: 'coreDamage',
  normalAttackDamage: 'normalAttackDamage',
  normalCritRate: 'normalCritRate',
  trueDamage: 'trueDamage',
  trueDamageConversion: 'trueDamageConversion',
  minEffectiveRange: 'minEffectiveRange',
  pierce: 'pierce',
  pierceDamage: 'pierceDamage',
  pelletCount: 'pelletCount',
  singlePellet: 'singlePellet',
};

/** stat の合計（「自分が 〈stat〉 増加状態なら」の判定用） */
export function statTotal(totals: BuffTotals, stat: BuffStat): number {
  return totals[RATIO_FIELD[stat]];
}

/** 比率の加算（0.2 = +20%）。新しいオブジェクトを返す。攻撃力とチャージ速度は内訳にも出どころ source で足す */
export function addRatioBuff(
  totals: BuffTotals,
  stat: BuffStat,
  ratio: number,
  source = 'build',
  self = false,
): BuffTotals {
  const field = RATIO_FIELD[stat];
  const next: BuffTotals = { ...totals, [field]: totals[field] + ratio };
  if (stat === 'hitRate' && ratio > 0) next.hitRateUp = totals.hitRateUp + ratio;
  if (stat === 'chargeSpeed') next.chargeSpeedParts = [...totals.chargeSpeedParts, { source, ratio }];
  if (stat === 'attack') {
    next.attackParts = [...totals.attackParts, { source, ratio, flat: 0, ...(self ? { self } : {}) }];
  }
  return next;
}

/** 内訳を key ごとに足し、まとめた値ごとに四捨五入してから足した和（攻撃力▲・チャージ速度▲の丸め） */
function sumRoundedGroups<T>(parts: readonly T[], keyOf: (part: T) => string, amountOf: (part: T) => number): number {
  const groups = new Map<string, number>();
  for (const part of parts) {
    const key = keyOf(part);
    groups.set(key, (groups.get(key) ?? 0) + amountOf(part));
  }
  let sum = 0;
  for (const amount of groups.values()) sum += Math.round(amount);
  return sum;
}

/** 攻撃力▲の 1 件の「効果」の鍵（同じスキルの同じ値の効果＝スタックは 1 つにまとめる） */
const attackEffectKey = (part: AttackPart): string => `${part.source}|${part.ratio}|${part.flat}`;

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
 * 攻撃力の固定加算の元のバフ前攻撃力（V-0627）。copyTopAttack は、枠のうちバフ前攻撃力が最も高い枠の値
 * （自分も候補。空枠は除く。編成で決まり、戦闘の間は動かない）、ほかは発動者の値
 */
export function fixedAttackBaseOf(
  effect: Pick<ResolvedEffect, 'scaling'>,
  casterBaseAttack: number,
  slots: readonly ({ casterBaseAttack: number } | null | undefined)[],
): number {
  if (effect.scaling !== 'copyTopAttack') return casterBaseAttack;
  let top = 0;
  for (const slot of slots) if (slot && slot.casterBaseAttack > top) top = slot.casterBaseAttack;
  return top;
}

/**
 * 解決済みの効果 1 件を totals に足す。単位の判断（比率か実数か）はここに閉じ込める。
 * casterAttack は 発動者のバフ前攻撃力 × value を固定加算し、flat（maxAmmo だけ）は value を発数として
 * maxAmmoFlat に加算し、それ以外は value を比率として加算する。
 * casterFinalMaxHp は 発動者の最終最大HP（casterMaxHp）× value を攻撃力に
 * 固定加算する（casterAttack と同じ置き場所。plan/design-skill-stage6.md 1.3 節）。casterMaxHp が無ければ RangeError（黙って 0 にしない）。
 * casterDefence は 発動者のバフ前防御力（casterBaseDefence）× value を敵の防御力から引く量
 * （enemyDefenseDownFlat）に足す（plan/design-mast.md 2.2 節）。casterBaseDefence が無ければ RangeError
 */
export function applyResolvedEffect(
  totals: BuffTotals,
  effect: Pick<ResolvedEffect, 'stat' | 'scaling' | 'value'> & {
    weapon?: ChangedWeapon;
    source?: ResolvedEffect['source'];
    target?: ResolvedEffect['target'];
    /** 状態の中身（isStateContent）なら付いている状態。チャージ時間の固定の勝ち負けに使う */
    whileState?: string;
  },
  casterBaseAttack: number,
  casterMaxHp?: number,
  casterBaseDefence?: number,
): AppliedBuff {
  // 使用武器の変更は値を足さず、武器を差し替える（1 体に 1 つ。後から付いたほうを使う）
  if (effect.stat === 'weapon') {
    return { totals: { ...totals, weapon: effect.weapon ?? null }, appliedAmount: effect.value };
  }
  // copyTopAttack は呼ぶ側が写す元の値を casterBaseAttack に渡す（fixedAttackBaseOf）
  if (effect.scaling === 'casterAttack' || effect.scaling === 'copyTopAttack') {
    const appliedAmount = casterBaseAttack * effect.value;
    return {
      totals: addFlatAttack(totals, appliedAmount, sourceKeyOf(effect), effect.target === 'self'),
      appliedAmount,
    };
  }
  if (effect.scaling === 'casterFinalMaxHp') {
    if (casterMaxHp === undefined) throw new RangeError('casterFinalMaxHp needs the max HP of the caster');
    const appliedAmount = casterMaxHp * effect.value;
    return {
      totals: addFlatAttack(totals, appliedAmount, sourceKeyOf(effect), effect.target === 'self'),
      appliedAmount,
    };
  }
  if (effect.scaling === 'casterDefence') {
    if (casterBaseDefence === undefined) throw new RangeError('casterDefence needs the base defence of the caster');
    const appliedAmount = casterBaseDefence * effect.value;
    return {
      totals: { ...totals, enemyDefenseDownFlat: totals.enemyDefenseDownFlat + appliedAmount },
      appliedAmount,
    };
  }
  // 最終最大装弾数 1 発ごとのチャージダメージ▲は、発の時点の装弾数を掛けるまで別の和に置く（applyChargeBuffs）
  if (effect.scaling === 'perFinalMaxAmmo') {
    return {
      totals: { ...totals, chargeDamagePerMaxAmmo: totals.chargeDamagePerMaxAmmo + effect.value },
      appliedAmount: effect.value,
    };
  }
  if (effect.scaling === 'casterChargeTime') {
    // value は解決時に 発動者の基礎チャージ時間 × 比率 の秒数にしてある（skills/resolve.ts）
    return { totals: { ...totals, chargeTimeFlat: totals.chargeTimeFlat + effect.value }, appliedAmount: effect.value };
  }
  // 「チャージ時間 X 秒▼」（chargeSpeed の flat。値は秒）は、発動者基準のチャージ速度と同じく秒数を引く
  if (effect.scaling === 'flat' && effect.stat === 'chargeSpeed') {
    return { totals: { ...totals, chargeTimeFlat: totals.chargeTimeFlat + effect.value }, appliedAmount: effect.value };
  }
  // 射撃の姿勢の長さの倍率は足し合わせず掛け合わせる（plan/design-a2-bmode-stance.md 3.2 節。スタックは書けない）
  if (effect.stat === 'fireStanceScale') {
    return {
      totals: { ...totals, fireStanceScale: totals.fireStanceScale * effect.value },
      appliedAmount: effect.value,
    };
  }
  // チャージ時間の固定は秒を足し合わせない（plan/design-skill-stage14.md 2.7 節）。状態の中身の固定（whileState を持つ。
  // セブンスドワーフ・フルアクティブの 3.2 秒）は上書きし、timed の固定（S2 の戦闘開始時の 1.2 秒）は固定がまだ無い時だけ入れる。どちらも
  // 自分にだけ付き、1 つの定義に 1 つずつまで（skills/parse/crossChecks.ts の validateFixedChargeTimeCount）なので、当てる順によらず「状態が付いている間は状態の秒」になる。
  // 状態のスタック（使用回数）の段の数だけ当てても同じ値
  if (effect.stat === 'fixedChargeTime') {
    const fixed =
      effect.whileState !== undefined || totals.fixedChargeTime === 0 ? effect.value : totals.fixedChargeTime;
    return { totals: { ...totals, fixedChargeTime: fixed }, appliedAmount: effect.value };
  }
  // 「バーストスキルクールタイム X 秒▼」（burstCooldown の flat。値は秒）と、ペレット数▲
  // （pelletCount の flat。値は個の数）。どちらも同じ名前の欄に足す
  if (effect.scaling === 'flat' && (effect.stat === 'burstCooldown' || effect.stat === 'pelletCount')) {
    const stat = effect.stat;
    return { totals: { ...totals, [stat]: totals[stat] + effect.value }, appliedAmount: effect.value };
  }
  if (effect.scaling === 'flat') {
    return { totals: { ...totals, maxAmmoFlat: totals.maxAmmoFlat + effect.value }, appliedAmount: effect.value };
  }
  return {
    totals: addRatioBuff(totals, effect.stat as BuffStat, effect.value, sourceKeyOf(effect), effect.target === 'self'),
    appliedAmount: effect.value,
  };
}

/**
 * 1 発のペレットの数（plan/design-dorothy-serendipity.md 2.1・2.2 節）。固定（singlePellet）が効いていれば 1、
 * 無ければ基礎の数にペレット数▲を足す（固定は▲より勝つ。C-1077）。ペレットが 1 個の武器（SG 以外）には▲を足さない
 */
export function pelletsPerShot(shotCount: number, buffs: Pick<BuffTotals, 'pelletCount' | 'singlePellet'>): number {
  if (shotCount <= 1) return shotCount;
  return buffs.singlePellet > 0 ? 1 : shotCount + buffs.pelletCount;
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
    const amountOf = (part: AttackPart) => baseAttack * part.ratio + part.flat;
    let rest = baseAttack;
    for (const part of buffs.attackParts) if (part.self !== true) rest += amountOf(part);
    rest += sumRoundedGroups(
      buffs.attackParts.filter((part) => part.self === true),
      attackEffectKey,
      amountOf,
    );
    return Math.round(rest);
  }
  const keyOf = rounding === 'skill' ? (part: AttackPart) => part.source : attackEffectKey;
  return (
    Math.round(baseAttack) + sumRoundedGroups(buffs.attackParts, keyOf, (part) => baseAttack * part.ratio + part.flat)
  );
}

/**
 * { rate: min(1, crit.rate + critRate), damage: crit.damage + critDamage }。
 * 会心率は確率なので 1 で頭打ち（plan/design-ranked-shot-duration.md 7 節の論点 2）
 */
export function applyCritBuffs(crit: CharacterData['crit'], buffs: BuffTotals): CharacterData['crit'] {
  return { rate: capCritRate(crit.rate + buffs.critRate), damage: crit.damage + buffs.critDamage };
}

/** 会心率（確率）の上限 1 */
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
 * スキルの足し算の▲（C-0020）も OL と同じく倍率▲の後に足す（C-0134。アリスのフルバースト中）。
 * チャージ速度の超過分の変換は、足し算の▲に max(0, チャージ速度の和 − 1) × 割合 を足す
 * （和は効果ごとに整数の % に丸めてから足す。chargeSpeedOverflowDamage。plan/design-red-hood.md 2.4 節）。
 * 最終最大装弾数 1 発ごとの▲は、足し算の▲に min(50, finalMaxAmmo) × 比率の和 を足す（plan/design-emilia.md 2.1 節。
 * finalMaxAmmo は呼ぶ側がその発の時点のバフで出す。▲が無ければ読まない）
 */
export function applyChargeBuffs(
  fullChargeDamage: number,
  charge: boolean,
  buffs: BuffTotals,
  finalMaxAmmo?: number,
): number {
  if (!charge) return 1;
  return (
    scaleBasisPoints(fullChargeDamage * 10000, buffs.chargeDamageMultiplier) / 10000 +
    buffs.chargeDamage +
    chargeSpeedOverflowDamage(buffs) +
    perMaxAmmoChargeDamage(buffs, finalMaxAmmo)
  );
}

/** 最終最大装弾数 1 発ごとのチャージダメージ▲の上限の発数（ツールチップ。plan/design-skill-catalog-tooltips.md 4 節） */
export const PER_MAX_AMMO_CAP = 50;

function perMaxAmmoChargeDamage(
  buffs: Pick<BuffTotals, 'chargeDamagePerMaxAmmo'>,
  finalMaxAmmo: number | undefined,
): number {
  if (buffs.chargeDamagePerMaxAmmo === 0) return 0;
  if (finalMaxAmmo === undefined) throw new RangeError('chargeDamagePerMaxAmmo needs the final max ammo of the shot');
  return Math.min(PER_MAX_AMMO_CAP, finalMaxAmmo) * buffs.chargeDamagePerMaxAmmo;
}

/**
 * チャージ速度の超過分から変換したチャージダメージ▲（変換が無いか、超えていなければ 0）。チャージ速度▲は
 * 効果ごと（同じ出どころの同じ値＝スタックは 1 つにまとめる）に整数の % に四捨五入してから足す（V-0640。丸めの単位と、
 * 味方からの▲を和に入れることは未確定）。チャージの長さ（chargeSpeed）は丸めない
 */
export function chargeSpeedOverflowDamage(buffs: Pick<BuffTotals, 'chargeSpeedParts' | 'chargeSpeedOverflow'>): number {
  if (buffs.chargeSpeedOverflow === 0) return 0;
  const percent = sumRoundedGroups(
    buffs.chargeSpeedParts,
    (part) => `${part.source}|${part.ratio}`,
    (part) => part.ratio * 100,
  );
  return (Math.max(0, percent - 100) / 100) * buffs.chargeSpeedOverflow;
}
