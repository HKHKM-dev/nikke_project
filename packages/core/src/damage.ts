// Stage 2: 通常攻撃のみの静的 DPS。Stage 4 で常時発動パッシブのバフ（buffs）を差し込めるようにした。
// Stage 5 で「1 トリガーの式」（computeTriggerDamage）を発射サイクルから切り離し、sim がフレームごとに使えるようにした。
// フルバースト区間は condition.fullBurst で倍率グループに +0.5 が乗る。時間変化するバフはまだ含まない。
// Stage 11 モダニア: 射撃ごとの倍率ダメージ（「通常攻撃が命中した時、最終攻撃力の X% の追加ダメージ」）を 1 トリガーの値に足す（perShot）。
// 使用武器の変更（殲滅モード）が効いている区間は、武器倍率・コア倍率を変更後の武器（buffs.weapon）から取る。
import { computeCadence, type CadenceResult } from './cadence.ts';
import { measuredChargeCadence, type FiringParams } from './frame/firing.ts';
import { elementMultiplier } from './element.ts';
import type { ResolvedSkillDamage } from './skills/burstDamage.ts';
import {
  ZERO_BUFFS,
  applyAttackBuffs,
  applyAttackDamageBuffs,
  applyChargeBuffs,
  applyCritBuffs,
  type BuffTotals,
} from './skills/buffs.ts';
import { computeStat, type GrowthInput } from './stats.ts';
import type { CharacterData, Element, LocalizedText, ShotParams, TargetProfile } from './types.ts';
import { DEFAULT_WEAPON_MODEL, hasSpinUp, isChargeWeapon, type WeaponModel } from './weapons.ts';

/** フルバースト区間中の通常攻撃に、倍率グループ (1 + コア + 会心 + 距離) へ加算される補正 */
export const FULL_BURST_BOOST = 0.5;

/**
 * Stage 8: バースト以外の倍率ダメージ（damage）が**フルバースト中に出たとき**、フルバースト補正 +0.5 を乗せるか。
 * **2026-09-23 の射撃場実測で「乗せる」と確定**（plan/verification.md Stage 8 節、録画 36〜38）:
 * ドレイク S2 は通常時 118,059 = (攻撃力 − 防御力) × 98.55%、フルバースト中 409,932 で、どちらもペレットとの比が 4.5987 と同じ
 * （ペレットの倍率グループは 1.0 → 1.5）。イサベルの段階 2 の追加ダメージ 758,766 = 299.7% × 1.5 × 受けるダメージ 1.3996。
 * バーストスキルダメージ（burstDamage）には乗らない（BURST_SKILL_FULL_BURST_BONUS）のと違う。
 * Stage 11 モダニア: 射撃ごとの倍率ダメージ（perShot）にも同じ規則を使うので、skills/burstDamage.ts からここへ移した
 */
export const SKILL_HIT_FULL_BURST_BONUS = true;

/**
 * Stage 11 モダニア: 射撃ごとの倍率ダメージ（perShot）にコアの補正を乗せるか（仮）。
 * Stage 8 の倍率ダメージ（コアは乗らない）に合わせて false。録画 44 の 1 で確かめる（plan/design-stage11-modernia.md 7.5 節）
 */
export const PER_SHOT_DAMAGE_CORE = false;

/**
 * Stage 13: 有利コードの攻撃ダメージ▲（elementDamage）を倍率ダメージ（damage / perShot / burstDamage）にも乗せるか（仮定）。
 * 設計時点の仮定は「乗る」（plan/design-stage12.md 3.3 節）。射撃場の実測 3.5 節の 7 で確かめる
 */
export const ELEMENT_DAMAGE_APPLIES_TO_SKILL_DAMAGE = true;

/** Stage 13: 倍率ダメージに使う属性の乗数（ELEMENT_DAMAGE_APPLIES_TO_SKILL_DAMAGE で有利コードの攻撃ダメージ▲を乗せるか決める） */
export function skillElementMultiplier(character: CharacterData, enemy: EnemyInput, buffs: BuffTotals): number {
  return elementMultiplier(
    character.element,
    enemy.element,
    ELEMENT_DAMAGE_APPLIES_TO_SKILL_DAMAGE ? buffs.elementDamage : 0,
  );
}

/**
 * Stage 16-B: 敵の出来事の種類（plan/design-stage16.md 9.2 節）。
 * untargetable = 狙えない（射撃場 3 分モードの的のジャンプなど）。invulnerable・barrier は型と表示だけで、数値には効かせない
 */
export type EnemyEventKind = 'untargetable' | 'invulnerable' | 'barrier';

/** Stage 16-B: 敵の出来事 1 つ。秒で [start, end) */
export type EnemyEvent = { kind: EnemyEventKind; start: number; end: number };

/**
 * Stage 18-C: 着地点の区間 1 つ。秒で [start, end)。landing は TargetProfile の着地点か配分（中遠の 3 か所など）の id。
 * null は「着地点が未測定」（出来事のセットの並びより後の区間）
 */
export type LandingSpan = { start: number; end: number; landing: string | null };

export type EnemyInput = {
  defence: number;
  element: Element | null;
  hasCore: boolean;
  /** Stage 16-B: 敵の出来事（省略・空なら出来事なし = Stage 16-A と 1 フレームも違わない） */
  events?: readonly EnemyEvent[];
  /**
   * Stage 18-C: 的の条件の表（射撃場の BigArms など）。条件が「自動」の枠だけが読む。省略は「この敵の条件は未測定」
   * （自動の枠も手入力の値で計算する）
   */
  target?: TargetProfile;
  /** Stage 18-C: 着地点の時間割り（enemies.ts の enemyLandingsOf）。省略は戦闘時間全体を target の初期位置とする */
  landings?: readonly LandingSpan[];
};

/** 1 トリガーの式に効く条件（時間を含まない） */
export type TriggerCondition = {
  /** コア命中率 0..1（敵にコアがない場合は無視） */
  coreHitRate: number;
  /** 距離ボーナス（キャラに bonusRange がない場合は無視） */
  distanceBonus: boolean;
  /** チャージ武器をフルチャージで撃つ前提か */
  fullCharge: boolean;
  /** フルバースト区間中か。省略 false。true なら倍率グループに FULL_BURST_BOOST を足す */
  fullBurst?: boolean;
  /**
   * Stage 15: 弾丸命中率 0..1（省略 1。Stage 18 で「命中率」から呼び名を変えた。命中率▲とは別物）。**射撃場（静止の的）を 1 とした相対値**で、通常攻撃の期待ダメージ（射撃ごとの倍率ダメージを含む）と
   * ゲージ（burst/dynamic.ts の energyPerTrigger）に掛ける。SG のペレットのゲージの割合（SG_PELLET_GAUGE_HIT_RATE）はこの外側の較正値のまま。
   * スキルの倍率ダメージ・バーストスキルには掛けない。命中を数えるトリガーは全弾命中で数える（近似。conditionNotes）
   */
  hitRate?: number;
};

export type ConditionInput = TriggerCondition & {
  durationSeconds: number;
};

export type TriggerDamageInput = {
  character: CharacterData;
  growth: GrowthInput;
  enemy: EnemyInput;
  condition: TriggerCondition;
  /** 戦闘中の攻撃力（バフ前）を直接指定する（射撃場スペック固定など）。指定時は growth からの算出をしない */
  attackOverride?: number;
  /** 常時発動パッシブなどのバフ合計。省略は ZERO_BUFFS */
  buffs?: BuffTotals;
  /** Stage 11 モダニア: その枠の射撃ごとの倍率ダメージ（resolvePerShotDamage の結果）。省略は無し */
  perShot?: readonly ResolvedSkillDamage[];
};

export type DamageInput = TriggerDamageInput & {
  condition: ConditionInput;
  model?: WeaponModel;
  /** Stage 10: 発射サイクルに使う射撃の実効値（常時分の射撃バフを畳み込んだもの）。省略は基礎値 */
  firing?: FiringParams;
};

export type ModelNoteLevel = 'unsupported' | 'approx';
export type ModelNote = { level: ModelNoteLevel; code: string; message: LocalizedText };

/** 1 トリガー（SG は全ペレット）の期待ダメージと内訳。発射サイクルには依らない */
export type TriggerDamage = {
  /** バフ前の攻撃力（素、またはスペック固定値） */
  baseAttack: number;
  /** バフ後の攻撃力 */
  attack: number;
  buffs: BuffTotals;
  /** max(1, 攻撃力 − 防御力) */
  baseHit: number;
  weaponMultiplier: number;
  /** Stage 13: 通常攻撃ダメージ倍率の乗数 1 + Σ normalAttackDamage（通常攻撃だけ。perShot には掛けない） */
  normalAttackMultiplier: number;
  chargeMultiplier: number;
  /** 加算グループ 1 + コア + 会心 + 距離 + フルバースト。攻撃ダメージバフはここに入らない */
  boost: { core: number; crit: number; distance: number; fullBurst: number; total: number };
  /** 攻撃ダメージバフの乗数 1 + Σ attackDamage（倍率グループとは別枠。射撃場の実測で確認） */
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** Stage 11 モダニア: 通常攻撃の分（Stage 10 までの perTrigger） */
  normal: number;
  /** Stage 11 モダニア: 射撃ごとの倍率ダメージの分（無ければ 0）。倍率グループは 1 + 会心 + フルバースト（コア・距離なし） */
  perShot: number;
  /** 1 トリガー（SG は全ペレット）あたりの期待ダメージ = normal + perShot */
  perTrigger: number;
  /** Stage 15: 掛けた命中率（condition.hitRate。省略は 1）。normal と perShot に含まれている */
  hitRate: number;
};

export type DamageResult = TriggerDamage & {
  cadence: CadenceResult;
  dps: number;
  totalDamage: number;
  notes: ModelNote[];
};

/** バフ前の攻撃力。attackOverride（射撃場スペック固定など）があればそれ、無ければ育成値から算出する */
export function baseAttackOf(input: Pick<TriggerDamageInput, 'character' | 'growth' | 'attackOverride'>): number {
  return input.attackOverride ?? computeStat(input.character, 'attack', input.growth);
}

export function modelNotes(shot: ShotParams): ModelNote[] {
  const notes: ModelNote[] = [];
  const unsupported = (code: string, ja: string, en: string): void => {
    notes.push({ level: 'unsupported', code, message: { ja, en } });
  };
  const approx = (code: string, ja: string, en: string): void => {
    notes.push({ level: 'approx', code, message: { ja, en } });
  };
  if (shot.muzzleCount !== 1)
    unsupported('multi-muzzle', '複数銃口（二丁持ち）は未対応', 'Multiple muzzles not modeled');
  if (shot.inputType === 'DOWN_Charge')
    unsupported('down-charge', '押下チャージ型の入力は未対応', 'DOWN_Charge input not modeled');
  // Stage 11 紅蓮BS: 射撃の刻みを実測で較正した武器（frame/firing.ts の MEASURED_CHARGE_CADENCE）は近似として扱う
  if (shot.maintainFireStance !== 0 && measuredChargeCadence(shot) !== null)
    approx(
      'measured-cadence',
      '射撃の刻みは射撃場の実測で較正（射撃姿勢維持型。紅蓮：ブラックシャドウは 43f 間隔・リロードをまたいで 172f）',
      'Shot cadence calibrated on range recordings (fire-stance weapon)',
    );
  else if (shot.maintainFireStance !== 0)
    unsupported('fire-stance', '射撃姿勢維持型の武器は未対応', 'Fire-stance weapons not modeled');
  if (shot.fireType === 'ProjectileCurve')
    unsupported('projectile-curve', '曲射型の弾は未対応', 'Curved projectiles not modeled');
  if (shot.penetration > 0) unsupported('penetration', '貫通は未対応', 'Penetration not modeled');
  if (shot.reloadBullet < 1)
    approx(
      'chunked-reload',
      '分割リロードは「回数 × リロード時間」で近似',
      'Chunked reload approximated as chunks × reload time',
    );
  if (hasSpinUp(shot))
    approx(
      'spin-up',
      'MG のスピンアップはレート蓄積モデル（エマの録画で較正、誤差 1% 程度）',
      'MG spin-up uses an accumulator model calibrated on one recording',
    );
  return notes;
}

/** Stage 15: 条件の弾丸命中率（省略は 1 = 射撃場）。0..1 の外は RangeError */
export function hitRateOf(condition: Pick<TriggerCondition, 'hitRate'>): number {
  const hitRate = condition.hitRate ?? 1;
  if (!Number.isFinite(hitRate) || hitRate < 0 || hitRate > 1) {
    throw new RangeError(`hitRate must be in [0, 1], got ${hitRate}`);
  }
  return hitRate;
}

/** Stage 15: 条件から来る注記。弾丸命中率が 1 未満なら、命中を数えるトリガーを全弾命中で数える近似を知らせる */
export function conditionNotes(condition: Pick<TriggerCondition, 'hitRate'>): ModelNote[] {
  const hitRate = hitRateOf(condition);
  if (hitRate >= 1) return [];
  return [
    {
      level: 'approx',
      code: 'hit-rate',
      message: {
        ja: `弾丸命中率 ${Math.round(hitRate * 1000) / 10}%: 通常攻撃のダメージとゲージに掛ける。命中を数えるトリガー（通常攻撃の命中 N 回ごと等）とスキルの倍率ダメージは全弾命中のまま`,
        en: `Bullet hit rate ${Math.round(hitRate * 1000) / 10}%: applied to normal-attack damage and gauge; hit-count triggers and skill damage assume every shot hits`,
      },
    },
  ];
}

/** 距離ボーナス（適正距離のとき倍率グループに足す。キャラに bonusRange がなければ乗らない） */
export const DISTANCE_BONUS = 0.3;

/** 1 トリガーの期待ダメージ。sim はフレームごとにこの値を加算し、calc は秒間トリガー数を掛ける */
export function computeTriggerDamage(input: TriggerDamageInput): TriggerDamage {
  const { character, enemy, condition } = input;
  const buffs = input.buffs ?? ZERO_BUFFS;
  // Stage 11 モダニア: 使用武器の変更が効いていれば、変更後の武器の倍率で撃つ
  const shot = buffs.weapon?.shot ?? character.shot;
  if (condition.coreHitRate < 0 || condition.coreHitRate > 1) {
    throw new RangeError(`coreHitRate must be in [0, 1], got ${condition.coreHitRate}`);
  }
  const hitRate = hitRateOf(condition);

  const baseAttack = baseAttackOf(input);
  const attack = applyAttackBuffs(baseAttack, buffs);
  const baseHit = Math.max(1, attack - enemy.defence);
  const weaponMultiplier = shot.damage / 10000;
  const charge = isChargeWeapon(shot) && condition.fullCharge;
  const chargeMultiplier = applyChargeBuffs(shot.fullChargeDamage, charge, buffs);

  // Stage 13: 通常攻撃ダメージ倍率▲（SG・SMG のコレクション）は通常攻撃の武器倍率に掛ける（仮定）
  const normalAttackMultiplier = 1 + buffs.normalAttackDamage;

  const coreRate = enemy.hasCore ? condition.coreHitRate : 0;
  // Stage 13: コアダメージ▲はコア倍率に加算する（殲滅モードなら変更後の武器のコア倍率が基点）
  const boostCore = coreRate * (shot.coreDamageRate - 1 + buffs.coreDamage);
  const crit = applyCritBuffs(character.crit, buffs);
  const boostCrit = crit.rate * (crit.damage - 1);
  const boostDistance = condition.distanceBonus && character.bonusRange !== null ? DISTANCE_BONUS : 0;
  const boostFullBurst = condition.fullBurst ? FULL_BURST_BOOST : 0;
  const boostTotal = 1 + boostCore + boostCrit + boostDistance + boostFullBurst;
  const attackDamageMultiplier = applyAttackDamageBuffs(buffs);

  const element = elementMultiplier(character.element, enemy.element, buffs.elementDamage);
  const normal =
    hitRate *
    baseHit *
    weaponMultiplier *
    normalAttackMultiplier *
    chargeMultiplier *
    boostTotal *
    attackDamageMultiplier *
    element;
  const perShot =
    hitRate *
    perShotDamage(
      input.perShot,
      baseHit,
      boostCore,
      boostCrit,
      boostFullBurst,
      buffs,
      skillElementMultiplier(character, enemy, buffs),
    );

  return {
    baseAttack,
    attack,
    buffs,
    baseHit,
    weaponMultiplier,
    normalAttackMultiplier,
    chargeMultiplier,
    boost: {
      core: boostCore,
      crit: boostCrit,
      distance: boostDistance,
      fullBurst: boostFullBurst,
      total: boostTotal,
    },
    attackDamageMultiplier,
    elementMultiplier: element,
    normal,
    perShot,
    perTrigger: normal + perShot,
    hitRate,
  };
}

/**
 * Stage 11 モダニア: 射撃ごとの倍率ダメージ。式は Stage 8 の倍率ダメージ（skills/burstDamage.ts の computeBurstHit）と同じ:
 * max(1, 攻撃力 − 防御力) × X × (1 + 会心期待値 + フルバースト補正) × (1 + Σ攻撃ダメージ) × 属性。距離は乗らず、コアは PER_SHOT_DAMAGE_CORE
 */
function perShotDamage(
  effects: readonly ResolvedSkillDamage[] | undefined,
  baseHit: number,
  boostCore: number,
  boostCrit: number,
  boostFullBurst: number,
  buffs: BuffTotals,
  element: number,
): number {
  if (effects === undefined || effects.length === 0) return 0;
  const boost =
    1 + boostCrit + (SKILL_HIT_FULL_BURST_BONUS ? boostFullBurst : 0) + (PER_SHOT_DAMAGE_CORE ? boostCore : 0);
  const common = baseHit * boost * applyAttackDamageBuffs(buffs) * element;
  let total = 0;
  for (const e of effects) {
    total += common * e.multiplier * (e.damageType === 'distributed' ? 1 + buffs.distributedDamage : 1);
  }
  return total;
}

/** 1 区間の静的 DPS。1 トリガーの式 × 発射サイクルの平均トリガー数 × 秒数 */
export function computeDamage(input: DamageInput): DamageResult {
  const { character, condition } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  if (condition.durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const trigger = computeTriggerDamage(input);
  const cadence = computeCadence(input.buffs?.weapon?.shot ?? character.shot, model, input.firing);
  const dps = trigger.perTrigger * cadence.triggersPerSecond;

  return {
    ...trigger,
    cadence,
    dps,
    totalDamage: dps * condition.durationSeconds,
    notes: modelNotes(character.shot),
  };
}
