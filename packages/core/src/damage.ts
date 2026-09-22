// Stage 2: 通常攻撃のみの静的 DPS。Stage 4 で常時発動パッシブのバフ（buffs）を差し込めるようにした。
// Stage 5 で「1 トリガーの式」（computeTriggerDamage）を発射サイクルから切り離し、sim がフレームごとに使えるようにした。
// フルバースト区間は condition.fullBurst で倍率グループに +0.5 が乗る。時間変化するバフはまだ含まない。
import { computeCadence, type CadenceResult } from './cadence.ts';
import { elementMultiplier } from './element.ts';
import {
  ZERO_BUFFS,
  applyAttackBuffs,
  applyAttackDamageBuffs,
  applyChargeBuffs,
  applyCritBuffs,
  type BuffTotals,
} from './skills/buffs.ts';
import { computeStat, type GrowthInput } from './stats.ts';
import type { CharacterData, Element, LocalizedText, ShotParams } from './types.ts';
import { DEFAULT_WEAPON_MODEL, hasSpinUp, isChargeWeapon, type WeaponModel } from './weapons.ts';

/** フルバースト区間中の通常攻撃に、倍率グループ (1 + コア + 会心 + 距離) へ加算される補正 */
export const FULL_BURST_BOOST = 0.5;

export type EnemyInput = {
  defence: number;
  element: Element | null;
  hasCore: boolean;
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
};

export type DamageInput = TriggerDamageInput & {
  condition: ConditionInput;
  model?: WeaponModel;
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
  chargeMultiplier: number;
  /** 加算グループ 1 + コア + 会心 + 距離 + フルバースト。攻撃ダメージバフはここに入らない */
  boost: { core: number; crit: number; distance: number; fullBurst: number; total: number };
  /** 攻撃ダメージバフの乗数 1 + Σ attackDamage（倍率グループとは別枠。射撃場の実測で確認） */
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** 1 トリガー（SG は全ペレット）あたりの期待ダメージ */
  perTrigger: number;
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
  if (shot.maintainFireStance !== 0)
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

/** 1 トリガーの期待ダメージ。sim はフレームごとにこの値を加算し、calc は秒間トリガー数を掛ける */
export function computeTriggerDamage(input: TriggerDamageInput): TriggerDamage {
  const { character, enemy, condition } = input;
  const buffs = input.buffs ?? ZERO_BUFFS;
  const shot = character.shot;
  if (condition.coreHitRate < 0 || condition.coreHitRate > 1) {
    throw new RangeError(`coreHitRate must be in [0, 1], got ${condition.coreHitRate}`);
  }

  const baseAttack = baseAttackOf(input);
  const attack = applyAttackBuffs(baseAttack, buffs);
  const baseHit = Math.max(1, attack - enemy.defence);
  const weaponMultiplier = shot.damage / 10000;
  const charge = isChargeWeapon(shot) && condition.fullCharge;
  const chargeMultiplier = applyChargeBuffs(shot.fullChargeDamage, charge, buffs);

  const coreRate = enemy.hasCore ? condition.coreHitRate : 0;
  const boostCore = coreRate * (shot.coreDamageRate - 1);
  const crit = applyCritBuffs(character.crit, buffs);
  const boostCrit = crit.rate * (crit.damage - 1);
  const boostDistance = condition.distanceBonus && character.bonusRange !== null ? 0.3 : 0;
  const boostFullBurst = condition.fullBurst ? FULL_BURST_BOOST : 0;
  const boostTotal = 1 + boostCore + boostCrit + boostDistance + boostFullBurst;
  const attackDamageMultiplier = applyAttackDamageBuffs(buffs);

  const element = elementMultiplier(character.element, enemy.element);
  const perTrigger = baseHit * weaponMultiplier * chargeMultiplier * boostTotal * attackDamageMultiplier * element;

  return {
    baseAttack,
    attack,
    buffs,
    baseHit,
    weaponMultiplier,
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
    perTrigger,
  };
}

/** 1 区間の静的 DPS。1 トリガーの式 × 発射サイクルの平均トリガー数 × 秒数 */
export function computeDamage(input: DamageInput): DamageResult {
  const { character, condition } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  if (condition.durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const trigger = computeTriggerDamage(input);
  const cadence = computeCadence(character.shot, model);
  const dps = trigger.perTrigger * cadence.triggersPerSecond;

  return {
    ...trigger,
    cadence,
    dps,
    totalDamage: dps * condition.durationSeconds,
    notes: modelNotes(character.shot),
  };
}
