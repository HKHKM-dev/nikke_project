// Stage 10: 1 パス目のフレームループ（純関数。sim と calc で共有）。plan/design-stage10.md 1 節。
// 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）と CT 短縮が入ると、射撃の列 → 時刻表 → バフ → 射撃の列…と循環する。
// ここではフレームを 1 つずつ進め、射手・ゲージ・バーストの状態機械・射撃に効く効果を同時に回して循環をほどく。
//
// フレーム f の中の順番（既存の 1 パス目と同じ順に、射撃に効く効果の処理を最後に足した）:
//   1. 射手を進める。射撃の実効値は「f − 1 までに登録済み」かつ「start ≤ f < end」の窓で決まる（1.1 節の表）。
//      戦闘開始時（battleStart）の窓だけはループの前に登録し、1 発目のマガジンから効かせる。
//   2. このフレームの射撃のゲージを足して状態機械を進める（Stage 7 の planDynamicSchedule と同じ）。
//   3. このフレームの出来事を TriggerTracker（skills/triggers.ts）に流し、射撃に効く timed 効果の窓を登録する
//      （窓の作り方は planBuffTimeline と同じ: 射撃の回数トリガーは f + 1 から、同じ効果の再発火は和集合）。
//      即時効果はその後に当てる: CT 短縮は発動の後（4 節）、弾丸チャージは同じフレームに付いた最大装弾数▲込みの最大で
//      （録画 19: ノワールのフルバースト開始で 9 → 14 になるのは、+5 発と 39.88% の弾丸チャージが同じフレームに来るため）。
//
// 射撃に効かない効果（攻撃力・会心など）はここでは扱わない。ループの後で planBuffTimeline が確定した射撃の列と時刻表から
// すべての窓を作り直す（トリガーは同じ TriggerTracker を通るので、射撃に効く効果の窓はここで登録したものと一致する）。
// 射撃に効く効果も即時効果も無い編成では、射撃の列は planShots、時刻表は planDynamicSchedule と 1 フレームも違わない（1.3 節）。
import { planFixedCycle, durationToFrames } from '../burst/fixedCycle.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  reduceCooldown,
  stepBurstController,
  type BurstControllerState,
  type BurstTiming,
} from '../burst/controller.ts';
import { burstUnitOf, energyPerTrigger } from '../burst/dynamic.ts';
import type { BurstActivation, BurstSchedule, BurstScheduleModel } from '../burst/schedule.ts';
import { ZERO_BUFFS, applyResolvedEffect, type BuffTotals } from '../skills/buffs.ts';
import {
  isResolvedShotCount,
  resolveInstant,
  resolveTimed,
  type ResolvedInstantEffect,
  type ResolvedTimedEffect,
} from '../skills/resolve.ts';
import { isEffectTarget } from '../skills/targets.ts';
import { resolvePassiveStates, type TimelineSlot } from '../skills/timeline.ts';
import { createTriggerTracker, type FrameEvents, type ShotEvent, type TriggerTracker } from '../skills/triggers.ts';
import { isFiringStat } from '../skills/types.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { firingParams, isZeroFiring, type FiringParams } from './firing.ts';
import { initialShooter, refillAmmo, stepShooter, type ShooterState } from './shooter.ts';
import type { ShotLog } from './shots.ts';

export type FirstPassOptions = {
  frames: number;
  model?: WeaponModel;
  /** バーストを回すか。false なら時刻表は null（射撃の回数・戦闘開始のトリガーだけが発火する） */
  burst: boolean;
  burstModel?: BurstScheduleModel;
  /** 操作キャラの枠（フルチャージ倍率がゲージに乗る）。null は全員 AI */
  controlledSlot?: number | null;
  timing?: Readonly<BurstTiming>;
};

/** 射撃に効く timed 効果の窓（効果ごと。対象の枠に配る前） */
export type FiringWindow = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  end: number;
};

/** 即時効果を 1 枠に当てた記録 */
export type InstantApplication = {
  frame: number;
  sourceSlotIndex: number;
  slotIndex: number;
  effect: ResolvedInstantEffect;
  /** CT 短縮なら縮めたフレーム数（実際に縮んだ分）、弾丸チャージなら足した弾数（最大で止めた後） */
  amount: number;
};

export type FirstPassResult = {
  frames: number;
  shots: (ShotLog | null)[];
  schedule: BurstSchedule | null;
  /** 射撃に効く timed 効果の窓（発生順）。テスト用（区間は planBuffTimeline が作る） */
  firingWindows: FiringWindow[];
  /** 即時効果（発生順） */
  instants: InstantApplication[];
};

type FiringSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  casterBaseAttack: number;
  /** 対象の枠 */
  targets: boolean[];
  fires: TriggerTracker;
  /** 窓（和集合済み。昇順） */
  windows: [number, number][];
};

type InstantSource = {
  sourceSlotIndex: number;
  effect: ResolvedInstantEffect;
  targets: number[];
  fires: TriggerTracker;
};

/**
 * 弾丸チャージの端数（仮）。録画 19 のノワール（14 × 39.88% = 5.58）は満タンに近く、切り捨て・四捨五入のどちらでも 14 になった
 */
export const AMMO_REFILL_ROUNDING: 'floor' | 'round' = 'floor';

function refillRounds(maxAmmo: number, ratio: number): number {
  const raw = maxAmmo * ratio;
  return AMMO_REFILL_ROUNDING === 'floor' ? Math.floor(raw + 1e-9) : Math.round(raw);
}

export function runFirstPass(slots: readonly TimelineSlot[], options: FirstPassOptions): FirstPassResult {
  const { frames } = options;
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const model = options.model ?? DEFAULT_WEAPON_MODEL;
  const burstModel = options.burstModel ?? 'dynamic';
  const controlledSlot = options.controlledSlot ?? null;
  const scheduleModel: BurstScheduleModel | null = options.burst ? burstModel : null;

  // ---- 効果の準備 ----
  const passive = resolvePassiveStates(slots);
  const firing: FiringSource[] = [];
  const instant: InstantSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    const targetsOf = (e: Parameters<typeof isEffectTarget>[0]) =>
      slots.map((t, i) => t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character.weaponType));
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      if (!isFiringStat(effect.stat) || effect.durationFrames <= 0) continue;
      firing.push({
        sourceSlotIndex,
        effect,
        casterBaseAttack: slot.casterBaseAttack,
        targets: targetsOf(effect),
        fires: createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel),
        windows: [],
      });
    }
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      instant.push({
        sourceSlotIndex,
        effect,
        targets: targetsOf(effect).flatMap((hit, i) => (hit ? [i] : [])),
        fires: createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel),
      });
    }
  });
  const trackEvents = firing.length > 0 || instant.length > 0;

  /** 窓を登録する（同じ効果の再発火は和集合 = 上書き延長。planBuffTimeline の unionWindows と同じ） */
  const register = (src: FiringSource, start: number): void => {
    if (start >= frames) return;
    const end = Math.min(start + src.effect.durationFrames, frames);
    const last = src.windows[src.windows.length - 1];
    if (last !== undefined && start <= last[1]) {
      if (end > last[1]) last[1] = end;
      return;
    }
    src.windows.push([start, end]);
  };
  // 戦闘開始時の窓はループの前に登録する（1 発目のマガジンから効く）
  for (const src of firing) if (src.effect.trigger === 'battleStart' && frames > 0) register(src, 0);

  // ---- 射手 ----
  const passiveFiring = passive.map((s) => s?.buffs ?? ZERO_BUFFS);
  const hasTimedFiring = slots.map((_, i) => firing.some((src) => src.targets[i]));
  const baseParams = slots.map((slot, i) =>
    slot === null ? null : firingParams(slot.character.shot, passiveFiring[i]!),
  );
  /**
   * 枠 i がフレーム f に使う実効値（登録済みの窓のうち start ≤ f < end のもの）。
   * 手順 1 で呼ぶときは f の窓はまだ登録されていないので「f − 1 までに登録済み」になり、
   * 手順 3 の弾丸チャージで呼ぶときは f に付いた最大装弾数▲も含む
   */
  const paramsAt = (i: number, f: number): FiringParams => {
    const base = baseParams[i]!;
    if (!hasTimedFiring[i]) return base;
    let buffs: BuffTotals = passiveFiring[i]!;
    let changed = false;
    for (const src of firing) {
      if (!src.targets[i]) continue;
      const w = src.windows.find(([s, e]) => s <= f && f < e);
      if (w === undefined) continue;
      buffs = applyResolvedEffect(buffs, src.effect, src.casterBaseAttack).totals;
      changed = true;
    }
    if (!changed || isZeroFiring(buffs)) return base;
    return firingParams(slots[i]!.character.shot, buffs);
  };
  const shooters: (ShooterState | null)[] = slots.map((slot, i) =>
    slot === null ? null : initialShooter(slot.character.shot, model, paramsAt(i, 0)),
  );
  const logs: (ShotLog | null)[] = slots.map((slot) =>
    slot === null ? null : { frames: [], fullCharge: isChargeWeapon(slot.character.shot), lastShotFrames: [] },
  );

  // ---- バースト ----
  const gaugeSpeed = passive.map((s) => s?.buffs.burstGaugeSpeed ?? 0);
  const energies = slots.map((slot, i) =>
    slot === null ? 0 : energyPerTrigger(slot.character.shot, i === controlledSlot) * (1 + gaugeSpeed[i]!),
  );
  let controller: BurstControllerState | null = null;
  let fixed: BurstSchedule | null = null;
  if (options.burst) {
    if (burstModel === 'fixed') {
      fixed = planFixedCycle(
        slots.map((s) => (s === null ? null : { burstStep: s.character.burstStep })),
        frames,
      );
    } else {
      controller = initialBurstController(
        slots.map((s) => (s === null ? null : burstUnitOf(s.character))),
        options.timing ?? DEFAULT_BURST_TIMING,
      );
    }
  }
  let nextActivation = 0;
  let nextWindowStart = 0;
  let nextWindowEnd = 0;
  let gaugeFullSeen = 0;
  const activationsOf = (): readonly BurstActivation[] => controller?.activations ?? fixed?.activations ?? [];
  const windowsOf = () => controller?.windows ?? fixed?.fullBurstWindows ?? [];
  const gaugeFullOf = (): readonly number[] => controller?.gaugeFullFrames ?? [];

  const instants: InstantApplication[] = [];
  const shotEvents: (ShotEvent | null)[] = slots.map(() => null);

  for (let f = 0; f < frames; f++) {
    // 1. 射手
    let gauge = 0;
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      const state = shooters[i];
      if (slot === null || !state) return;
      const shot = slot.character.shot;
      if (!stepShooter(state, shot, model, paramsAt(i, f))) return;
      const log = logs[i]!;
      log.frames.push(f);
      if (state.lastShot) log.lastShotFrames!.push(f);
      shotEvents[i] = { lastShot: state.lastShot, fullCharge: log.fullCharge };
      gauge += energies[i]!;
    });
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    if (controller !== null) stepBurstController(controller, f, gauge);
    if (!trackEvents) continue;

    // 3. 出来事 → 射撃に効く窓の登録 → 即時効果
    const activations = activationsOf();
    const now: BurstActivation[] = [];
    while (nextActivation < activations.length && activations[nextActivation]!.frame <= f) {
      if (activations[nextActivation]!.frame === f) now.push(activations[nextActivation]!);
      nextActivation += 1;
    }
    const windows = windowsOf();
    let fullBurstStart = false;
    while (nextWindowStart < windows.length && windows[nextWindowStart]!.start <= f) {
      if (windows[nextWindowStart]!.start === f) fullBurstStart = true;
      nextWindowStart += 1;
    }
    let fullBurstEnd = false;
    while (nextWindowEnd < windows.length && windows[nextWindowEnd]!.end <= f) {
      if (windows[nextWindowEnd]!.end === f) fullBurstEnd = true;
      nextWindowEnd += 1;
    }
    const gaugeFulls = gaugeFullOf();
    let gaugeFull = false;
    while (gaugeFullSeen < gaugeFulls.length) {
      if (gaugeFulls[gaugeFullSeen] === f) gaugeFull = true;
      gaugeFullSeen += 1;
    }
    const ev: FrameEvents = { frame: f, shots: shotEvents, activations: now, fullBurstStart, fullBurstEnd, gaugeFull };

    for (const src of firing) {
      if (src.effect.trigger === 'battleStart') continue; // ループの前に登録済み
      if (!src.fires(ev)) continue;
      register(src, isResolvedShotCount(src.effect.trigger) ? f + 1 : f);
    }
    for (const src of instant) {
      if (!src.fires(ev)) continue;
      for (const target of src.targets) {
        if (src.effect.kind === 'cooldownReduction') {
          if (controller === null) continue; // 固定サイクル・バーストなしでは CT を見ない
          const before = controller.cooldownReductions.length;
          reduceCooldown(controller, target, durationToFrames(src.effect.value), f, src.sourceSlotIndex);
          const applied = controller.cooldownReductions[before]?.applied ?? 0;
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: applied,
          });
          continue;
        }
        const state = shooters[target];
        const slot = slots[target];
        if (!state || !slot) continue;
        const params = paramsAt(target, f);
        const before = state.ammo;
        refillAmmo(state, refillRounds(params.maxAmmo, src.effect.value), slot.character.shot, model, params);
        instants.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: target,
          effect: src.effect,
          amount: state.ammo - before,
        });
      }
    }
  }

  const schedule = controller !== null ? finishSchedule(controller, frames) : fixed;
  const firingWindows: FiringWindow[] = firing.flatMap((src) =>
    src.windows.map(([start, end]) => ({ sourceSlotIndex: src.sourceSlotIndex, effect: src.effect, start, end })),
  );
  return { frames, shots: logs, schedule, firingWindows, instants };
}
