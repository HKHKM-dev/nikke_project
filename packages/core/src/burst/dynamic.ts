// Stage 7: 動的サイクルの時刻表（純関数）。sim と calc が同じ時刻表を使う。
// 各枠の射手（frame/shooter.ts）を 1 フレームずつ回し、撃ったフレームにゲージを入れて状態機械（controller.ts）を進める。
// Stage 7 の範囲では射撃のタイミングがバフにもバーストにも依存しない（弾数・リロード・チャージ速度のバフは段階 C / D）ので、
// 時刻表は編成だけで決まり、sim の本体（2 パス目）の射撃列とも 1 フレームも違わない。
// 射撃がバフに依存するようになったら（Stage 10）、sim を 1 パスにして状態機械をフレームループの中で回す。
// Stage 8: 射手は frame/shots.ts の planShots で 1 回だけ回し、その射撃の列からゲージを溜める（回数トリガーと共有する）。
// 常時のゲージ速度（burstGaugeSpeed。マナ S2）は枠ごとの 1 トリガーのゲージに (1 + 速度) を掛ける。
import { planShots, type ShotLog } from '../frame/shots.ts';
import type { CharacterData, ShotParams } from '../types.ts';
import { DEFAULT_WEAPON_MODEL, type WeaponModel } from '../weapons.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  stepBurstController,
  type BurstTiming,
  type BurstUnit,
} from './controller.ts';
import { durationToFrames } from './fixedCycle.ts';
import type { BurstSchedule } from './schedule.ts';

/**
 * CDN の target_burst_energy_pershot に掛かる倍率。射撃場の的（BigArms）で実測した値（2026-09-23、単騎の録画 13 本）:
 * AR（ラピ）・MG（エマ）・RL（ベロータ）・SR（デルタ）のどれも 1 発の増分が CDN 値の 1.17〜1.21 倍だった。
 * コアと胴体で差はない。敵ごとに違う可能性はある（レイドボスは未確認）。
 */
export const BURST_ENERGY_MULTIPLIER = 1.2;

/**
 * ペレット武器（SG）のペレットのうち、ゲージになる割合。単騎のノワール（9,000 × 10）の 1 トリガーが
 * 操作時 平均 8.1%・AI 時 8.4% で、全ペレット命中の予測 10.8%（× 1.2）の 0.75〜0.78 倍だった（射撃場の距離）。
 * ダメージ側は全ペレット命中のまま（Stage 2 以来の仮定）。
 */
export const SG_PELLET_GAUGE_HIT_RATE = 0.75;

/**
 * 1 トリガーで溜まるゲージ量。targetBurstEnergyPerShot は 1 ペレットあたりなので shotCount（SG のペレット数）を掛ける。
 * フルチャージ倍率（fullChargeBurstEnergy）は**操作キャラのチャージ武器にだけ**乗る。AI のデルタ（SR）は
 * 82f ごとにフルチャージの間隔で撃っていても 1 発 6.2〜7.1% で、倍率なし（53,000 × 1.2 = 6.4%）だった（2026-09-23 実測）。
 * muzzleCount = 2 は未対応で銃口 1 つとして数える。Stage 15: hitRate（省略 1）を掛ける。
 */
export function energyPerTrigger(shot: ShotParams, controlled: boolean, hitRate = 1): number {
  const charge = controlled && shot.chargeTime > 0 ? shot.fullChargeBurstEnergy : 1;
  const pellets = shot.shotCount > 1 ? shot.shotCount * SG_PELLET_GAUGE_HIT_RATE : shot.shotCount;
  // Stage 15: 命中率（射撃場 = 1 の相対値）。外れた弾はゲージにならない
  return shot.targetBurstEnergyPerShot * BURST_ENERGY_MULTIPLIER * pellets * charge * hitRate;
}

export function burstUnitOf(character: CharacterData): NonNullable<BurstUnit> {
  return {
    burstStep: character.burstStep,
    nextStep: character.burstSkill.nextStep,
    cooldownFrames: durationToFrames(character.burstSkill.cooldownSeconds),
    // Stage 8: フルバースト時間は StepFull に入る発動をしたニケの burst_duration（イサベル 5 秒、モダニア 15 秒）
    fullBurstFrames: durationToFrames(character.burstSkill.durationSeconds),
  };
}

export type DynamicScheduleOptions = {
  /** 射撃の列（planShots の結果）。省略時はここで回す。sim / calc は 1 パス目の列を渡して共有する */
  shots?: readonly (ShotLog | null)[];
  /** 枠ごとのゲージ速度 Σ burstGaugeSpeed（常時パッシブ）。省略は全員 0 */
  gaugeSpeed?: readonly number[];
};

/**
 * @param controlledSlot 操作キャラの枠（フルチャージ倍率がゲージに乗る）。null は全員 AI 扱い
 */
export function planDynamicSchedule(
  slots: readonly ({ character: CharacterData; condition?: { hitRate?: number } } | null)[],
  frames: number,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  timing: Readonly<BurstTiming> = DEFAULT_BURST_TIMING,
  controlledSlot: number | null = null,
  options: DynamicScheduleOptions = {},
): BurstSchedule {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const controller = initialBurstController(
    slots.map((s) => (s === null ? null : burstUnitOf(s.character))),
    timing,
  );
  const shots = options.shots ?? planShots(slots, frames, model);
  const feeds = slots.map((s, index) => {
    const log = shots[index];
    if (s === null || !log) return null;
    const speed = options.gaugeSpeed?.[index] ?? 0;
    return {
      frames: log.frames,
      next: 0,
      energy: energyPerTrigger(s.character.shot, index === controlledSlot, s.condition?.hitRate ?? 1) * (1 + speed),
    };
  });
  for (let f = 0; f < frames; f++) {
    let gauge = 0;
    for (const feed of feeds) {
      if (feed !== null && feed.frames[feed.next] === f) {
        gauge += feed.energy;
        feed.next += 1;
      }
    }
    stepBurstController(controller, f, gauge);
  }
  return finishSchedule(controller, frames);
}
