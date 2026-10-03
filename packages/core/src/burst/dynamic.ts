// Stage 7: 動的サイクルの時刻表（純関数）。sim と calc が同じ時刻表を使う。
// 各枠の射手（frame/shooter.ts）を 1 フレームずつ回し、撃ったフレームにゲージを入れて状態機械（controller.ts）を進める。
// Stage 7 の範囲では射撃のタイミングがバフにもバーストにも依存しない（弾数・リロード・チャージ速度のバフは段階 C / D）ので、
// 時刻表は編成だけで決まり、sim の本体（2 パス目）の射撃列とも 1 フレームも違わない。
// 射撃がバフに依存するようになったら（Stage 10）、sim を 1 パスにして状態機械をフレームループの中で回す。
// Stage 8: 射手は frame/shots.ts の planShots で 1 回だけ回し、その射撃の列からゲージを溜める（回数トリガーと共有する）。
// 常時のゲージ速度（burstGaugeSpeed。マナ S2）は枠ごとの 1 トリガーのゲージに (1 + 速度) を掛ける。
import { planShots, type ShotLog } from '../frame/shots.ts';
import type { CharacterData, ShotParams } from '../types.ts';
import { burstReentryStepOf, type SkillDefinition } from '../skills/types.ts';
import { DEFAULT_WEAPON_MODEL, type WeaponModel } from '../weapons.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  stepBurstController,
  type BurstTiming,
  type BurstUnit,
} from './controller.ts';
import { burstDelaysFieldOf } from './landing.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { BurstSchedule } from './schedule.ts';

/**
 * ペレット武器（SG）のペレットのうち、ゲージになる割合の置き値。SG の 1 トリガーのゲージは、的に当たったペレットの数 ×
 * targetBurstEnergyPerShot（C-0150）。当たる割合は射撃場で区間ごとに 0.68〜0.84・平均約 0.78（`074-12`）。
 * 弾丸命中率を的の表から取る枠（条件が自動）では、表の値が当たったペレットの割合なので掛けない（1）。
 * 手入力の枠（弾丸命中率の既定 1 = 射撃場の相対値）だけ、射撃場の平均に近いこの値を掛ける（plan/design-sg-hit-rate.md 7 節の 3）。
 */
export const SG_PELLET_GAUGE_HIT_RATE = 0.75;

/**
 * 1 トリガーで溜まるゲージ量。1 発は CDN の targetBurstEnergyPerShot そのまま（C-0083。Stage 7 の ×1.2 は
 * BURST バーの表示の縮尺を読んだものだった。V-0028）。targetBurstEnergyPerShot は 1 ペレットあたりなので
 * shotCount（SG のペレット数）を掛ける。フルチャージ倍率（fullChargeBurstEnergy）は**操作キャラのチャージ武器にだけ**乗る
 * （C-0007）。muzzleCount = 2 は未対応で銃口 1 つとして数える。Stage 15: hitRate（省略 1）を掛ける。
 * pelletGaugeRate は SG のペレットのうちゲージになる割合（省略は手入力の置き値 SG_PELLET_GAUGE_HIT_RATE。表の弾丸命中率を使う枠は 1）
 */
export function energyPerTrigger(
  shot: ShotParams,
  controlled: boolean,
  hitRate = 1,
  pelletGaugeRate = SG_PELLET_GAUGE_HIT_RATE,
): number {
  const charge = controlled && shot.chargeTime > 0 ? shot.fullChargeBurstEnergy : 1;
  const pellets = shot.shotCount > 1 ? shot.shotCount * pelletGaugeRate : shot.shotCount;
  // Stage 15: 命中率（射撃場 = 1 の相対値）。外れた弾はゲージにならない
  return shot.targetBurstEnergyPerShot * pellets * charge * hitRate;
}

/**
 * Stage 22-B: 部分チャージの発（チャージの進み progress）のゲージの、フルチャージの発に対する比。フルチャージ倍率 F が乗る枠
 * （操作キャラのチャージ武器）では (1 + (F − 1) × progress) / F、ほかは 1。ダメージと同じくチャージの進みに比例すると仮定した
 * （部分チャージの発のゲージは未確認。design-stage22.md 0.2 節・6 節の 3）
 */
export function partialGaugeRatio(shot: ShotParams, controlled: boolean, progress: number): number {
  const full = controlled && shot.chargeTime > 0 ? shot.fullChargeBurstEnergy : 1;
  if (full <= 1) return 1;
  return (1 + (full - 1) * Math.min(1, Math.max(0, progress))) / full;
}

/**
 * 枠のバースト。アニス：スター編: 定義にバースト再突入（burstReentry。部隊構成の条件で外した後）があれば、次の段階をそれに差し替える
 */
export function burstUnitOf(
  character: CharacterData,
  definition: SkillDefinition | null = null,
): NonNullable<BurstUnit> {
  return {
    burstStep: character.burstStep,
    nextStep: burstReentryStepOf(definition) ?? character.burstSkill.nextStep,
    cooldownFrames: gameSecondsToFrames(character.burstSkill.cooldownSeconds),
    // Stage 8: フルバースト時間は StepFull に入る発動をしたニケの burst_duration（イサベル 5 秒、モダニア 15 秒）
    fullBurstFrames: gameSecondsToFrames(character.burstSkill.durationSeconds),
    ...burstDelaysFieldOf(character.resourceId),
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
  slots: readonly ({
    character: CharacterData;
    condition?: { hitRate?: number };
    skills?: { definition: SkillDefinition | null };
  } | null)[],
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
    slots.map((s) => (s === null ? null : burstUnitOf(s.character, s.skills?.definition ?? null))),
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
