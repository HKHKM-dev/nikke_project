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
 * 1 トリガーで溜まるゲージ量。targetBurstEnergyPerShot は 1 ペレットあたりなので shotCount（SG のペレット数）を掛け、
 * チャージ武器は常にフルチャージで撃つモデルなので fullChargeBurstEnergy（倍率）を掛ける。
 * 全ペレットが敵に当たると仮定する（ダメージ式と同じ。設計書 9 節 6）。muzzleCount = 2 は未対応で銃口 1 つとして数える。
 */
export function energyPerTrigger(shot: ShotParams): number {
  const charge = shot.chargeTime > 0 ? shot.fullChargeBurstEnergy : 1;
  return shot.targetBurstEnergyPerShot * shot.shotCount * charge;
}

export function burstUnitOf(character: CharacterData): NonNullable<BurstUnit> {
  return {
    burstStep: character.burstStep,
    nextStep: character.burstSkill.nextStep,
    cooldownFrames: durationToFrames(character.burstSkill.cooldownSeconds),
  };
}

export function planDynamicSchedule(
  slots: readonly ({ character: CharacterData } | null)[],
  frames: number,
  model: WeaponModel = DEFAULT_WEAPON_MODEL,
  timing: Readonly<BurstTiming> = DEFAULT_BURST_TIMING,
): BurstSchedule {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const controller = initialBurstController(
    slots.map((s) => (s === null ? null : burstUnitOf(s.character))),
    timing,
  );
  const shooters = slots.map((s) =>
    s === null
      ? null
      : {
          shot: s.character.shot,
          state: initialShooter(s.character.shot, model),
          energy: energyPerTrigger(s.character.shot),
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
