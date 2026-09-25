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
//
// Stage 11（plan/design-stage11.md 3 節）: 対象 burstUsers（「直前にバーストスキルを使用した味方」）は発火ごとに対象が変わるので、
// 窓を対象の枠ごとに持つ。回復（heal）は手順 3 の最初に当て、射撃の回数起点なら次のフレームに送って healed を立てる
// （planBuffTimeline 側の skills/heals.ts の planHeals と同じ規則）。
//
// Stage 11 アリス編（plan/design-stage11.md 19.3 節）: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の射撃系・即時効果があるときだけ、
// 攻撃力の timed 効果の窓も同じ TriggerTracker で追い（射撃には使わず順位のためだけ）、発火のフレームで順位を出して対象を決める。
// 手順 3 の順番は 回復 → 攻撃力の窓 → 射撃に効く窓 → 即時効果 で、同じフレームに付いた攻撃力の窓も順位に入る
// （planBuffTimeline の 2 段目と同じ意味。skills/ranking.ts）。
//
// Stage 11 モダニア（plan/design-stage11-modernia.md 3 節）: スタックする効果（最大装弾数▼）は段ごとの窓で登録する（skills/stacks.ts）。
// 条件「自分が 〈stat〉 増加状態なら」の効果を追うときは、条件の stat の窓（状態の窓）も追い、手順 3 の順番は
// 回復 → 状態の窓 → 攻撃力の窓 → 射撃に効く窓 → 即時効果。使用武器の変更（殲滅モード）の間は、変更後の武器を別の射手の状態で撃ち、
// 終わったら基礎の武器を最大装弾数まで込め直して戻す（frame/shooter.ts の resumeShooter。録画 44 で確定）。武器の窓は持ち替えるフレーム（発火の次のフレーム）から。
//
// Stage 16-B（plan/design-stage16.md 9.3 節）: 敵を狙えない窓（options.untargetable）の間は、全員が撃たず（ハイドしてリロード）、
// オートバーストも発動しない。ゲージは射撃が無いので溜まらない。持続バフ・CT・フルバーストの時間はそのまま進む。
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
import { healFrameOf } from '../skills/heals.ts';
import { attackRankFor, finalAttacksAt, type AttackWindow } from '../skills/ranking.ts';
import { canEverTarget, dependsOnRank, isEffectTarget, type FireContext } from '../skills/targets.ts';
import { stackWindows } from '../skills/stacks.ts';
import {
  rankSlotsOf,
  resolvePassiveStates,
  selfBuffedAt,
  weaponStartTrim,
  type TimelineSlot,
} from '../skills/timeline.ts';
import {
  createTriggerTracker,
  fireContextOf,
  type FrameEvents,
  type ShotEvent,
  type TriggerTracker,
} from '../skills/triggers.ts';
import { isFiringStat, type BuffStat } from '../skills/types.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { firingParams, isZeroFiring, type FiringParams } from './firing.ts';
import {
  hideShooter,
  initialShooter,
  refillAmmo,
  resumeShooter,
  stepShooter,
  unhideShooter,
  type ShooterState,
} from './shooter.ts';
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
  /** Stage 16-B: 敵を狙えない窓（昇順・重なりなし。frame/events.ts の untargetableRanges）。省略・空なら今までと同じ */
  untargetable?: readonly FrameRange[];
};

/** 射撃に効く timed 効果の窓（Stage 11 から対象の枠ごと。発火ごとに対象が変わる効果があるため） */
export type FiringWindow = {
  /** 効果を受ける枠 */
  slotIndex: number;
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  end: number;
  /** Stage 11 モダニア: 効果のあるスタックの段（1 始まり）。スタックしない効果はキーごと無い */
  stack?: number;
};

/** 即時効果を 1 枠に当てた記録 */
export type InstantApplication = {
  frame: number;
  sourceSlotIndex: number;
  slotIndex: number;
  effect: ResolvedInstantEffect;
  /** CT 短縮なら縮めたフレーム数（実際に縮んだ分）、弾丸チャージなら足した弾数（最大で止めた後）、回復は 0 */
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
  /** Stage 11 アリス編: 順位のためだけに追った攻撃力の窓（topAttack の射撃系・即時効果が無ければ空）。テスト用 */
  rankAttackWindows: FiringWindow[];
};

/** 窓 [start, end) と、スタックする効果なら段（1 始まり） */
type LoopWindow = [start: number, end: number, stack?: number];

type FiringSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  casterBaseAttack: number;
  /** 対象になりうる枠（burstUsers は発火の文脈を除いた判定。実際に掛かるかは発火ごとに決まる） */
  canTarget: boolean[];
  fires: TriggerTracker;
  /** 対象の枠ごとの窓（和集合済み。昇順）。上書き延長はその枠が受けた発火どうしでだけ起きる（Stage 11） */
  windows: LoopWindow[][];
  /** Stage 11 モダニア: スタックする効果の、対象の枠ごとの窓の始まり（段ごとの窓はここから作り直す） */
  starts: number[][];
};

type InstantSource = {
  sourceSlotIndex: number;
  effect: ResolvedInstantEffect;
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
  const untargetable = options.untargetable ?? [];
  const scheduleModel: BurstScheduleModel | null = options.burst ? burstModel : null;

  // ---- 効果の準備 ----
  const passive = resolvePassiveStates(slots);
  const firing: FiringSource[] = [];
  const instant: InstantSource[] = [];
  /** 発火の文脈 context のとき、効果 e が掛かる枠（Stage 11: burstUsers は発火ごとに変わる） */
  const targetsAt = (e: Parameters<typeof isEffectTarget>[0], sourceSlotIndex: number, context: FireContext) =>
    slots.flatMap((t, i) =>
      t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character.weaponType, context) ? [i] : [],
    );
  /** 窓を持ちうる枠（burstUsers・topAttack は武器種の条件だけ）で FiringSource を作る */
  const sourceOf = (effect: ResolvedTimedEffect, sourceSlotIndex: number, casterBaseAttack: number): FiringSource => ({
    sourceSlotIndex,
    effect,
    casterBaseAttack,
    canTarget: slots.map((t, i) => t !== null && canEverTarget(effect, sourceSlotIndex, i, t.character.weaponType)),
    fires: createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel),
    windows: slots.map(() => []),
    starts: slots.map(() => []),
  });
  /** 攻撃力の timed 効果（順位の要らないもの）。topAttack の射撃系・即時効果があるときだけ使う */
  const attackCandidates: FiringSource[] = [];
  /** Stage 11 モダニア: 条件の無い・順位の要らない timed 効果（条件の stat の窓を追うときの候補） */
  const plainTimed: { effect: ResolvedTimedEffect; sourceSlotIndex: number; casterBaseAttack: number }[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      if (effect.durationFrames <= 0) continue;
      if (!dependsOnRank(effect) && effect.condition === undefined) {
        plainTimed.push({ effect, sourceSlotIndex, casterBaseAttack: slot.casterBaseAttack });
      }
      if (effect.stat === 'attack' && !dependsOnRank(effect)) {
        attackCandidates.push(sourceOf(effect, sourceSlotIndex, slot.casterBaseAttack));
      }
      if (!isFiringStat(effect.stat)) continue;
      firing.push(sourceOf(effect, sourceSlotIndex, slot.casterBaseAttack));
    }
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      instant.push({
        sourceSlotIndex,
        effect,
        fires: createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel),
      });
    }
  });
  // 回復は healed の出来事を作るので先に当てる（heal のトリガーに healed は書けないので順番で閉じる。plan/design-stage11.md 3.3 節）
  const heals = instant.filter((src) => src.effect.kind === 'heal');
  const otherInstants = instant.filter((src) => src.effect.kind !== 'heal');
  const trackEvents = firing.length > 0 || instant.length > 0;
  // Stage 11 アリス編: 順位が要るときだけ攻撃力の窓を追う（無ければクラウン編までのループと同じ）
  const needsRank =
    firing.some((src) => dependsOnRank(src.effect)) || otherInstants.some((src) => dependsOnRank(src.effect));
  const attackTrack = needsRank ? attackCandidates : [];
  const rankSlots = needsRank ? rankSlotsOf(slots, passive) : [];
  // Stage 11 モダニア: ループで追う条件付きの効果（射撃に効くもの、順位のために追う攻撃力のもの）があるときだけ、条件の stat の窓を追う
  const conditionStats = new Set<BuffStat>(
    [...firing, ...attackTrack].flatMap((src) =>
      src.effect.condition === undefined ? [] : [src.effect.condition.selfBuffed],
    ),
  );
  const stateTrack: FiringSource[] = plainTimed
    .filter(({ effect }) => effect.stat !== 'weapon' && conditionStats.has(effect.stat))
    .map(({ effect, sourceSlotIndex, casterBaseAttack }) => sourceOf(effect, sourceSlotIndex, casterBaseAttack));
  /** 効果 src の条件を、フレーム f の状態の窓（同じフレームに付いたものも入れる）で判定する。条件の無い効果は常に true */
  const conditionOk = (src: FiringSource, f: number): boolean => {
    const condition = src.effect.condition;
    if (condition === undefined) return true;
    const windows = stateTrack.flatMap((st) =>
      st.windows.flatMap((list, slotIndex) =>
        list.map(([start, end]) => ({ slotIndex, effect: st.effect, start, end })),
      ),
    );
    return selfBuffedAt(passive, windows, src.sourceSlotIndex, condition.selfBuffed, f);
  };
  /** 効果 e の発火の文脈に、フレーム f の攻撃力の順位を足す（topAttack の効果だけ） */
  const withRank = (e: ResolvedTimedEffect | ResolvedInstantEffect, context: FireContext, f: number): FireContext => {
    if (!dependsOnRank(e)) return context;
    const attackWindows: AttackWindow[] = attackTrack.flatMap((src) =>
      src.windows.flatMap((list, slotIndex) =>
        list.map(([start, end]) => ({
          slotIndex,
          sourceSlotIndex: src.sourceSlotIndex,
          effect: src.effect,
          start,
          end,
        })),
      ),
    );
    const finalAttacks = finalAttacksAt(rankSlots, attackWindows, f);
    return { ...context, attackRank: attackRankFor(e, rankSlots, finalAttacks) };
  };

  /**
   * 窓を登録する（同じ効果の再発火は和集合 = 上書き延長。planBuffTimeline の unionWindows と同じ）。
   * Stage 11: 対象の枠ごとに、その枠が対象になった発火だけで和集合にする。
   * Stage 11 モダニア: スタックする効果は、その枠の窓の始まりの列から段ごとの窓を作り直す（skills/stacks.ts。planBuffTimeline と同じ関数）
   */
  const register = (src: FiringSource, start: number, context: FireContext): void => {
    if (start >= frames) return;
    const end = Math.min(start + src.effect.durationFrames, frames);
    for (const i of targetsAt(src.effect, src.sourceSlotIndex, context)) {
      if (src.effect.maxStacks !== undefined) {
        src.starts[i]!.push(start);
        src.windows[i] = stackWindows(src.starts[i]!, src.effect.durationFrames, frames, src.effect.maxStacks).map(
          (w): LoopWindow => [w.start, w.end, w.stack],
        );
        continue;
      }
      const list = src.windows[i]!;
      const last = list[list.length - 1];
      if (last !== undefined && start <= last[1]) {
        if (end > last[1]) last[1] = end;
        continue;
      }
      // Stage 11 モダニア: 使用武器の変更は持ち替えるフレーム（発火の次）から（planBuffTimeline の weaponStartTrim と同じ）
      const trimmed = start + weaponStartTrim(src.effect);
      if (trimmed < end) list.push([trimmed, end]);
    }
  };
  /** フレーム f の発火で付く窓の始まり。射撃の回数トリガーは次のフレームから（Stage 8） */
  const startOf = (src: FiringSource, f: number): number => (isResolvedShotCount(src.effect.trigger) ? f + 1 : f);
  // 戦闘開始時の窓はループの前に登録する（1 発目のマガジンから効く）
  for (const src of [...stateTrack, ...attackTrack, ...firing]) {
    if (src.effect.trigger !== 'battleStart' || frames <= 0) continue;
    if (!conditionOk(src, 0)) continue;
    register(src, 0, withRank(src.effect, null, 0));
  }

  // ---- 射手 ----
  const passiveFiring = passive.map((s) => s?.buffs ?? ZERO_BUFFS);
  const hasTimedFiring = slots.map((_, i) => firing.some((src) => src.canTarget[i]));
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
      if (!src.canTarget[i]) continue;
      // 和集合の窓は重ならないので効いているのは多くて 1 つ。スタックする効果は効いている段の数だけ足す
      for (const [s, e] of src.windows[i]!) {
        if (s > f || f >= e) continue;
        buffs = applyResolvedEffect(buffs, src.effect, src.casterBaseAttack).totals;
        changed = true;
      }
    }
    if (!changed || isZeroFiring(buffs)) return base;
    return firingParams(slots[i]!.character.shot, buffs);
  };
  const shooters: (ShooterState | null)[] = slots.map((slot, i) =>
    slot === null ? null : initialShooter(slot.character.shot, model, paramsAt(i, 0)),
  );
  /** Stage 11 モダニア: 使用武器の変更中の射手の状態と、その武器の識別子（変更していなければ null） */
  const changedShooters: (ShooterState | null)[] = slots.map(() => null);
  const activeWeapon: (string | null)[] = slots.map(() => null);
  const logs: (ShotLog | null)[] = slots.map((slot) =>
    slot === null ? null : { frames: [], fullCharge: isChargeWeapon(slot.character.shot), lastShotFrames: [] },
  );

  // ---- バースト ----
  const gaugeSpeed = passive.map((s) => s?.buffs.burstGaugeSpeed ?? 0);
  const energies = slots.map((slot, i) =>
    slot === null
      ? 0
      : energyPerTrigger(slot.character.shot, i === controlledSlot, slot.hitRate ?? 1) * (1 + gaugeSpeed[i]!),
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
  /** Stage 11: 次のフレーム以降に起きる回復（射撃の回数起点）。フレーム → 受ける枠 */
  const pendingHeals = new Map<
    number,
    { sourceSlotIndex: number; slotIndex: number; effect: ResolvedInstantEffect }[]
  >();
  /** このフレームに回復を受けた枠（FrameEvents.healed）。毎フレーム作らずに使い回す */
  const healed: boolean[] = slots.map(() => false);
  let healedDirty = false;
  const shotEvents: (ShotEvent | null)[] = slots.map(() => null);

  /** Stage 16-B: いま見ている（または次に来る）狙えない窓の添字 */
  let nextBlock = 0;

  for (let f = 0; f < frames; f++) {
    // Stage 16-B: 狙えない窓。入るフレームで hide、明けるフレームで unhide（どちらも射手を進める前）
    while (nextBlock < untargetable.length && untargetable[nextBlock]!.end < f) nextBlock += 1;
    const block = untargetable[nextBlock];
    const blocked = block !== undefined && block.start <= f && f < block.end;
    const hideNow = blocked && block.start === f;
    const unhideNow = block !== undefined && block.end === f;
    // 1. 射手
    let gauge = 0;
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      if (slot === null || !shooters[i]) return;
      const params = paramsAt(i, f);
      // Stage 11 モダニア: 使用武器の変更。始まったら変更後の武器を新しい状態で撃ち、終わったら基礎の武器の状態に戻す
      const weaponId = params.weapon?.id ?? null;
      if (weaponId !== activeWeapon[i]) {
        activeWeapon[i] = weaponId;
        if (params.weapon !== null) changedShooters[i] = initialShooter(params.weapon.shot, model, params);
        else {
          changedShooters[i] = null;
          resumeShooter(shooters[i]!, slot.character.shot, model, params);
        }
      }
      const state = params.weapon !== null ? changedShooters[i]! : shooters[i]!;
      const shot = params.weapon?.shot ?? slot.character.shot;
      if (hideNow) hideShooter(state, shot, model, params);
      if (unhideNow) unhideShooter(state, shot, block!.end - block!.start, model, params);
      if (!stepShooter(state, shot, model, params, blocked)) return;
      const log = logs[i]!;
      log.frames.push(f);
      if (state.lastShot) log.lastShotFrames!.push(f);
      shotEvents[i] = { lastShot: state.lastShot, fullCharge: log.fullCharge };
      gauge += energies[i]!;
    });
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    if (controller !== null) stepBurstController(controller, f, gauge, blocked);
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
    let fullBurstStartUsers: readonly number[] = [];
    while (nextWindowStart < windows.length && windows[nextWindowStart]!.start <= f) {
      if (windows[nextWindowStart]!.start === f) {
        fullBurstStart = true;
        fullBurstStartUsers = windows[nextWindowStart]!.burstUsers;
      }
      nextWindowStart += 1;
    }
    let fullBurstEnd = false;
    let fullBurstEndUsers: readonly number[] = [];
    while (nextWindowEnd < windows.length && windows[nextWindowEnd]!.end <= f) {
      if (windows[nextWindowEnd]!.end === f) {
        fullBurstEnd = true;
        fullBurstEndUsers = windows[nextWindowEnd]!.burstUsers;
      }
      nextWindowEnd += 1;
    }
    const gaugeFulls = gaugeFullOf();
    let gaugeFull = false;
    while (gaugeFullSeen < gaugeFulls.length) {
      if (gaugeFulls[gaugeFullSeen] === f) gaugeFull = true;
      gaugeFullSeen += 1;
    }
    // 前のフレームの射撃で起きた回復（射撃の回数起点）はこのフレームの healed になる。
    // 出来事はこのフレームの判定にしか使わないので、配列は使い回す（立てたフレームの次に戻す）
    if (healedDirty) {
      healed.fill(false);
      healedDirty = false;
    }
    const due = pendingHeals.size > 0 ? pendingHeals.get(f) : undefined;
    for (const h of due ?? []) {
      healed[h.slotIndex] = true;
      healedDirty = true;
      instants.push({
        frame: f,
        sourceSlotIndex: h.sourceSlotIndex,
        slotIndex: h.slotIndex,
        effect: h.effect,
        amount: 0,
      });
    }
    if (due !== undefined) pendingHeals.delete(f);
    const ev: FrameEvents = {
      frame: f,
      shots: shotEvents,
      activations: now,
      fullBurstStart,
      fullBurstEnd,
      gaugeFull,
      fullBurstStartUsers,
      fullBurstEndUsers,
      healed,
    };

    // 回復を先に当てる。射撃の回数起点は次のフレームに送り（窓の開始と同じ規則）、それ以外はこのフレームの healed に立てる
    for (const src of heals) {
      if (!src.fires(ev)) continue;
      const at = healFrameOf(src.effect, f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev))) {
        if (at === f) {
          healed[target] = true;
          healedDirty = true;
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: 0,
          });
        } else if (at < frames) {
          const list = pendingHeals.get(at) ?? [];
          list.push({ sourceSlotIndex: src.sourceSlotIndex, slotIndex: target, effect: src.effect });
          pendingHeals.set(at, list);
        }
      }
    }

    // Stage 11 モダニア: 条件の stat の窓（状態の窓）を先に登録し、同じフレームの条件の判定に入れる
    for (const src of stateTrack) {
      if (src.effect.trigger === 'battleStart') continue; // ループの前に登録済み
      if (!src.fires(ev)) continue;
      register(src, startOf(src, f), fireContextOf(src.effect.trigger, ev));
    }
    // 攻撃力の窓（順位のためだけ）を先に登録し、同じフレームに付いたものも順位に入れる
    for (const src of attackTrack) {
      if (src.effect.trigger === 'battleStart') continue; // ループの前に登録済み
      if (!src.fires(ev) || !conditionOk(src, f)) continue;
      register(src, startOf(src, f), fireContextOf(src.effect.trigger, ev));
    }
    for (const src of firing) {
      if (src.effect.trigger === 'battleStart') continue; // ループの前に登録済み
      if (!src.fires(ev) || !conditionOk(src, f)) continue;
      const context = withRank(src.effect, fireContextOf(src.effect.trigger, ev), f);
      register(src, startOf(src, f), context);
    }
    for (const src of otherInstants) {
      if (!src.fires(ev)) continue;
      const context = withRank(src.effect, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
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
  const windowsOfSources = (sources: readonly FiringSource[]): FiringWindow[] =>
    sources.flatMap((src) =>
      src.windows.flatMap((list, slotIndex) =>
        list.map(([start, end, stack]) => {
          const w: FiringWindow = { slotIndex, sourceSlotIndex: src.sourceSlotIndex, effect: src.effect, start, end };
          if (stack !== undefined) w.stack = stack;
          return w;
        }),
      ),
    );
  return {
    frames,
    shots: logs,
    schedule,
    firingWindows: windowsOfSources(firing),
    instants,
    rankAttackWindows: windowsOfSources(attackTrack),
  };
}
