// Stage 2: 通常攻撃のみの静的 DPS。スキル・バースト・バフは一切含まない。
import { computeCadence, type CadenceResult } from './cadence.ts';
import { elementMultiplier } from './element.ts';
import { computeStat, type GrowthInput } from './stats.ts';
import type { CharacterData, Element, LocalizedText, ShotParams } from './types.ts';
import { DEFAULT_WEAPON_MODEL, hasSpinUp, isChargeWeapon, type WeaponModel } from './weapons.ts';

export type EnemyInput = {
  defence: number;
  element: Element | null;
  hasCore: boolean;
};

export type ConditionInput = {
  /** コア命中率 0..1（敵にコアがない場合は無視） */
  coreHitRate: number;
  /** 距離ボーナス（キャラに bonusRange がない場合は無視） */
  distanceBonus: boolean;
  /** チャージ武器をフルチャージで撃つ前提か */
  fullCharge: boolean;
  durationSeconds: number;
};

export type DamageInput = {
  character: CharacterData;
  growth: GrowthInput;
  enemy: EnemyInput;
  condition: ConditionInput;
  model?: WeaponModel;
};

export type ModelNoteLevel = 'unsupported' | 'approx';
export type ModelNote = { level: ModelNoteLevel; code: string; message: LocalizedText };

export type DamageResult = {
  attack: number;
  /** max(1, 攻撃力 − 防御力) */
  baseHit: number;
  weaponMultiplier: number;
  chargeMultiplier: number;
  boost: { core: number; crit: number; distance: number; total: number };
  elementMultiplier: number;
  /** 1 トリガー（SG は全ペレット）あたりの期待ダメージ */
  perTrigger: number;
  cadence: CadenceResult;
  dps: number;
  totalDamage: number;
  notes: ModelNote[];
};

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
    approx('spin-up', 'MG のスピンアップは 1 発ごとのレート上昇で近似', 'MG spin-up approximated per shot');
  if (isChargeWeapon(shot))
    approx(
      'charge-release',
      'チャージ武器の発射間隔は較正前（解放遅延 0f）',
      'Charge cadence not yet calibrated (release delay 0f)',
    );
  return notes;
}

export function computeDamage(input: DamageInput): DamageResult {
  const { character, growth, enemy, condition } = input;
  const model = input.model ?? DEFAULT_WEAPON_MODEL;
  const shot = character.shot;
  if (condition.coreHitRate < 0 || condition.coreHitRate > 1) {
    throw new RangeError(`coreHitRate must be in [0, 1], got ${condition.coreHitRate}`);
  }
  if (condition.durationSeconds < 0) throw new RangeError('durationSeconds must be >= 0');

  const attack = computeStat(character, 'attack', growth);
  const baseHit = Math.max(1, attack - enemy.defence);
  const weaponMultiplier = shot.damage / 10000;
  const charge = isChargeWeapon(shot) && condition.fullCharge;
  const chargeMultiplier = charge ? shot.fullChargeDamage : 1;

  const coreRate = enemy.hasCore ? condition.coreHitRate : 0;
  const boostCore = coreRate * (shot.coreDamageRate - 1);
  const boostCrit = character.crit.rate * (character.crit.damage - 1);
  const boostDistance = condition.distanceBonus && character.bonusRange !== null ? 0.3 : 0;
  const boostTotal = 1 + boostCore + boostCrit + boostDistance;

  const element = elementMultiplier(character.element, enemy.element);
  const perTrigger = baseHit * weaponMultiplier * chargeMultiplier * boostTotal * element;

  const cadence = computeCadence(shot, model);
  const dps = perTrigger * cadence.triggersPerSecond;

  return {
    attack,
    baseHit,
    weaponMultiplier,
    chargeMultiplier,
    boost: { core: boostCore, crit: boostCrit, distance: boostDistance, total: boostTotal },
    elementMultiplier: element,
    perTrigger,
    cadence,
    dps,
    totalDamage: dps * condition.durationSeconds,
    notes: modelNotes(shot),
  };
}
