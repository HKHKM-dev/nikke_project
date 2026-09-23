// Stage 7: 動的サイクルの時刻表（純関数）。sim と calc が同じ時刻表を使う。
// 各枠の射手（sim/shooter.ts）を 1 フレームずつ回し、撃ったフレームにゲージを入れて状態機械（controller.ts）を進める。
// Stage 7 の範囲では射撃のタイミングがバフにもバーストにも依存しない（弾数・リロード・チャージ速度のバフは段階 C / D）ので、
// 時刻表は編成だけで決まり、sim の本体（2 パス目）の射撃列とも 1 フレームも違わない。
// 射撃がバフに依存するようになったら（Stage 8 / 9）、sim を 1 パスにして状態機械をフレームループの中で回す。
import { initialShooter, stepShooter } from '../sim/shooter.ts';
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
 * muzzleCount = 2 は未対応で銃口 1 つとして数える。
 */
export function energyPerTrigger(shot: ShotParams, controlled: boolean): number {
  const charge = controlled && shot.chargeTime > 0 ? shot.fullChargeBurstEnergy : 1;
  const pellets = shot.shotCount > 1 ? shot.shotCount * SG_PELLET_GAUGE_HIT_RATE : shot.shotCount;
  return shot.targetBurstEnergyPerShot * BURST_ENERGY_MULTIPLIER * pellets * charge;
}

export function burstUnitOf(character: CharacterData): NonNullable<BurstUnit> {
  return {
    burstStep: character.burstStep,
    nextStep: character.burstSkill.nextStep,
    cooldownFrames: durationToFrames(character.burstSkill.cooldownSeconds),
  };
}

/**
 * @param controlledSlot 操作キャラの枠（フルチャージ倍率がゲージに乗る）。null は全員 AI 扱い
 */
export function planDynamicSchedule(
  slots: readonly ({ character: CharacterData } | null)[],
  frames: number,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  timing: Readonly<BurstTiming> = DEFAULT_BURST_TIMING,
  controlledSlot: number | null = null,
): BurstSchedule {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const controller = initialBurstController(
    slots.map((s) => (s === null ? null : burstUnitOf(s.character))),
    timing,
  );
  const shooters = slots.map((s, index) =>
    s === null
      ? null
      : {
          shot: s.character.shot,
          state: initialShooter(s.character.shot, model),
          energy: energyPerTrigger(s.character.shot, index === controlledSlot),
        },
  );
  for (let f = 0; f < frames; f++) {
    let gauge = 0;
    for (const shooter of shooters) {
      if (shooter !== null && stepShooter(shooter.state, shooter.shot, model)) gauge += shooter.energy;
    }
    stepBurstController(controller, f, gauge);
  }
  return finishSchedule(controller, frames);
}
