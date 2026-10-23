// Stage 10: 1 パス目のフレームループ（純関数。sim と calc で共有）。plan/design-stage10.md 1 節。
// 射撃に効くバフ（最大装弾数・リロード速度・チャージ速度）と CT 短縮が入ると、射撃の列 → 時刻表 → バフ → 射撃の列…と循環する。
// ここではフレームを 1 つずつ進め、射手・ゲージ・バーストの状態機械・射撃に効く効果を同時に回して循環をほどく。
//
// フレーム f の中の順番（既存の 1 パス目と同じ順に、射撃に効く効果の処理を最後に足した）:
//   1. 射手を進める。射撃の実効値は「f − 1 までに登録済み」かつ「start ≤ f < end」の窓で決まる（1.1 節の表）。
//      戦闘開始時（battleStart）の窓だけはループの前に登録し、1 発目のマガジンから効かせる。
//   2. このフレームの射撃のゲージを足して状態機械を進める（Stage 7 の planDynamicSchedule と同じ）。
//   3. このフレームの出来事を TriggerTracker（skills/triggers.ts）に流し、スキルの効果の件を登録する
//      （持ち主ごとの件の一覧。skills/holders.ts: 射撃の回数トリガーは f + 1 から、同じ効果の再発火は和集合）。
//      即時効果はその後に当てる: CT 短縮は発動の後（4 節）、弾丸チャージは同じフレームに付いた最大装弾数▲込みの最大で
//      （録画 19: ノワールのフルバースト開始で 9 → 14 になるのは、+5 発と 39.88% の弾丸チャージが同じフレームに来るため）。
//
// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 A・B）: 射撃に効かない効果（攻撃力・会心など）も、すべて件の一覧で持つ。
// ループの後の区間は、planTeamRun が履歴から作る（skills/holders.ts の buffTimelineOf。2 パス目の作り直しはやめ、段 B で 2 パス目の
// 入口 planBuffTimeline も消した）。読む側（calc・sim・観測値の指標・画面）は履歴を読む（段 D。段 E で窓と記録の書き出しを消した）。
// 射撃に効く効果も即時効果も無い編成では、射撃の列は planShots、時刻表は planDynamicSchedule と 1 フレームも違わない（1.3 節）。
//
// Stage 11（plan/design-stage11.md 3 節）: 対象 burstUsers（「直前にバーストスキルを使用した味方」）は発火ごとに対象が変わるので、
// 窓を対象の枠ごとに持つ。回復（heal）は手順 3 の最初に当て、射撃の回数起点なら次のフレームに送って healed を立てる
// （skills/heals.ts の healFrameOf）。
//
// Stage 11 アリス編（plan/design-stage11.md 19.3 節）: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の射撃系・即時効果があるときだけ、
// 攻撃力の timed 効果の窓も同じ TriggerTracker で追い（射撃には使わず順位のためだけ）、発火のフレームで順位を出して対象を決める。
// 手順 3 の順番は 回復 → 攻撃力の窓 → 射撃に効く窓 → 即時効果 で、同じフレームに付いた攻撃力の窓も順位に入る
// （段の 2 段目。skills/ranking.ts）。
//
// Stage 11 モダニア（plan/design-stage11-modernia.md 3 節）: スタックする効果（最大装弾数▼）は段ごとの窓で登録する（skills/stacks.ts）。
// 条件「自分が 〈stat〉 増加状態なら」の効果を追うときは、条件の stat の窓（状態の窓）も追い、手順 3 の順番は
// 回復 → 状態の窓 → 攻撃力の窓 → 射撃に効く窓 → 即時効果。使用武器の変更（殲滅モード）の間は、変更後の武器を別の射手の状態で撃ち、
// 終わったら基礎の武器を最大装弾数まで込め直して戻す（frame/shooter.ts の resumeShooter。録画 44 で確定）。武器の窓は持ち替えるフレーム（発火の次のフレーム）から。
//
// Stage 16-B（plan/design-stage16.md 9.3 節）: 敵を狙えない窓（options.untargetable）の間は、全員が撃たず（ハイドしてリロード）、
// オートバーストも発動しない。ゲージは射撃が無いので溜まらない。持続バフ・CT・フルバーストの時間はそのまま進む。
//
// V-0030: 段の循環（cycle）の段に gaugeHits があれば、手順 2 の後にその枠の射撃を数えて段を追い（skills/cycles.ts の cycleFires と
// 同じ規則）、段のヒットのゲージを当たるフレームに予約して、そのフレームの手順 2 で足す（紅蓮BS。C-0085）。
// この編成では、時刻表は射撃のゲージだけの planDynamicSchedule とは違う。
//
// フラワー編（plan/design-flower-s2-gauge.md 3 節）: 周期でゲージだけを溜める効果（burstGaugeHit）は、ループの前に発火のフレームへ
// 射手の 1 ヒットぶんのゲージを予約し、段のヒットと同じく手順 2 で足す（I-DOLL・フラワーの S2。C-0178）。
// モラン編（plan/design-moran.md 3 節）: 射撃の回数のトリガーの burstGaugeHit は、射撃を数えて発火した射撃のフレームのゲージに足す。
//
// 持続の命中率▲（plan/design-sustained-hit-rate-gauge.md）: 当たりに効く状態の stat（HIT_STATE_STATS）の timed 効果の窓（当たりの窓）
// を追い、条件が自動の枠の発のゲージと命中の期待値を、常時の N + 効いている持続の▲で出し直す（options.hitRateWith。2 パス目の
// landingPartsWith と同じ式）。窓は射撃に効く窓と同じく「f − 1 までに登録済み」のものが f の発に効く。手順 3 の順番は
// 回復 → 状態の窓 → 当たりの窓 → 攻撃力の窓 → 射撃に効く窓 → 即時効果。
//
// 名前の付いた状態の語彙編（plan/design-named-state-impl.md 1.5 節）: 状態の中身に 1 パス目で追う stat（射撃に効く stat・当たりの stat・
// 条件の stat・順位が要るときの攻撃力）があれば、その状態の付与も追う。同じ出どころ × 状態の付与は窓の配列を共有し（状態の窓）、
// 中身はその配列をそのまま読む（同じ stat の timed の窓と同じ列で、同じフレームの判定に入る）。手順 3 の順番は
// 回復 → 条件なしの付与 → 状態の窓 → 条件つきの付与 → 当たりの窓 → 攻撃力の窓 → 順位の対象の付与 → 射撃に効く窓 → 即時効果。
// 条件つきの付与の中身は、ほかの条件の判定に使わない（連鎖の禁止。1.5 段目）
//
// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 A）: 上で「窓」と書いた追い方は、skills/holders.ts の件の一覧に置き換えた
// （射撃に効く窓・当たりの窓・攻撃力の窓・状態の付与・吸収回復の窓・段の循環の窓）。手順 3 の順は
// 回復 → 段 1 → 段 1.5 → 段 2 → 強化（貯めるだけ）→ 即時効果 で、上の順と同じ結果になる（同 2.4 節）。段の循環のゲージ（V-0030）は、
// このフレームに付いた間隔の変更の件も見るように、手順 3 の後で数える（ゲージは先のフレームに予約するので、数える位置で値は変わらない）。
import { burstDelaysFieldOf, burstDelaysOf } from '../burst/landing.ts';
import { planFixedCycle } from '../burst/fixedCycle.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  reduceCooldown,
  stepBurstController,
  type BurstControllerState,
  type BurstTiming,
} from '../burst/controller.ts';
import { SG_PELLET_GAUGE_HIT_RATE, burstUnitOf, energyPerTrigger, partialGaugeRatio } from '../burst/dynamic.ts';
import { resolveCycleEvery, resolveCycles } from '../skills/cycles.ts';
import {
  resolveDamageGauges,
  resolveDotEffects,
  resolveShotGauges,
  resolveTimerGauges,
} from '../skills/burstDamage.ts';
import {
  effectFrameOf,
  hexagonFrameOf,
  type BurstActivation,
  type BurstSchedule,
  type BurstScheduleModel,
} from '../burst/schedule.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { isResolvedShotCount, isResolvedTimer, resolveInstant, type ResolvedInstantEffect } from '../skills/resolve.ts';
import { healFrameOf } from '../skills/heals.ts';
import { createHolderLists, type HolderHistory } from '../skills/holders.ts';
import { isEffectTarget, type FireContext } from '../skills/targets.ts';
import { resolvePassiveStates, triggerFrames, type TimelineSlot } from '../skills/timeline.ts';
import {
  advanceShotCount,
  createTriggerTracker,
  fireContextOf,
  type FrameEvents,
  type ShotEvent,
  shotCountWeight,
  type TriggerTracker,
} from '../skills/triggers.ts';
import { hasReloadEndEffect, type ShotCountKind } from '../skills/types.ts';
import { dotTickTracker, groupDotsByState, type DotTickTracker } from './dot.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { timerFrames, type FrameRange } from '../skills/timeline.ts';
import { firingParams, isZeroFiring, type FiringParams } from './firing.ts';
import {
  hideShooter,
  initialShooter,
  refillAmmo,
  resumeAfterLastShotRefill,
  resumeShooter,
  partialChargeShot,
  stepShooter,
  unhideShooter,
  weaponChangeShooter,
  type ShooterState,
} from './shooter.ts';
import type { ShotLog } from './shots.ts';
import { flightFramesAt, type FlightFrameSpan, type LandingHitRateSpan, type SlotFlight } from './landing.ts';
import type { SkillSlot } from '../types.ts';
import type { ObstacleBreak, PelletHits } from '../team.ts';

export type FirstPassOptions = {
  frames: number;
  model?: WeaponModel;
  /** バーストを回すか。false なら時刻表は null（射撃の回数・戦闘開始のトリガーだけが発火する） */
  burst: boolean;
  burstModel?: BurstScheduleModel;
  /** 操作キャラの枠（フルチャージ倍率がゲージに乗る）。null は全員 AI */
  controlledSlot?: number | null;
  timing?: Readonly<BurstTiming>;
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 3.2 節）: 手で撃ったチェーンの始まり（I の本当の発動）のフレームの並び
   * （TeamInput.manualBursts）。動的サイクルだけ。省略はオートバースト
   */
  manualBursts?: readonly number[];
  /** Stage 16-B: 敵を狙えない窓（昇順・重なりなし。frame/events.ts の untargetableRanges）。省略・空なら今までと同じ */
  untargetable?: readonly FrameRange[];
  /**
   * Stage 18-C: 枠ごとの弾丸命中率の区間（条件が自動の枠。frame/landing.ts の hitRateSpansOf）。null・省略の枠は
   * TimelineSlot.hitRate の定数のまま。区間は昇順で [0, frames) を覆う
   */
  hitRates?: readonly (readonly LandingHitRateSpan[] | null)[];
  /** ルドミラ：ウィンターオーナー編: 敵にコアがあるか（省略 true）。無ければ coreHit の回数は増えない */
  enemyHasCore?: boolean;
  /**
   * plan/design-anis-star-gauge-timing.md 3・4 節: 枠ごとの飛ぶ時間（frame/landing.ts の slotFlightsOf）。発のゲージ（弾と射撃ごとの
   * 倍率ダメージのヒット）と自動攻撃のヒットのゲージを、着弾のフレーム（発射・刻み + 飛ぶ時間）に溜める。省略・null の枠は 0
   */
  flights?: readonly (SlotFlight | null)[];
  /**
   * 炸裂弾の時刻編（plan/design-eunhwa-tu-burst-shot-timing.md 4 節）: 枠ごと・スキルのスロットごとの、使用武器変更の最初の発の、発動の印
   * （hexagonFrameOf）から着弾までのフレームの区間（frame/landing.ts の slotWeaponChangeFirstHitsOf）。省略・null・行の無いスロットは、
   * チャージ武器の最初の発の待ち
   */
  weaponChangeFirstHits?: readonly (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[];
  /** 同 2 節: 発が壊した障害物（録画で数えた入力）。その発のゲージに物の分を足す。省略は無し */
  obstacleBreaks?: readonly ObstacleBreak[];
  /**
   * ペレットの命中編（plan/design-pellet-hit.md 3 節）: 枠ごとの、発ごとに的に当たったペレットの数（録画で数えた入力）。
   * 有る発は pelletHit の回数に期待値の代わりにこの数を足す。省略は無し（期待値）
   */
  pelletHits?: readonly PelletHits[];
  /**
   * plan/design-sustained-hit-rate-gauge.md: 枠 slotIndex の区間 span の弾丸命中率とコアの命中の期待値を、持続の命中率▲
   * timedHitRateUp を足した N で出し直す（frame/landing.ts の hitRateSpanWith）。省略なら持続の▲の窓を追わない（計画の値のまま）
   */
  hitRateWith?: (
    slotIndex: number,
    span: LandingHitRateSpan,
    timedHitRateUp: number,
  ) => { hitRate: number; coreHits: number };
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
  /** 即時効果（発生順） */
  instants: InstantApplication[];
  /** V-0030: 段の循環のヒットで溜めたゲージ（予約した順）。frame は当たるフレーム、shotFrame は段を出した射撃。テスト用 */
  cycleGaugeHits: { slotIndex: number; shotFrame: number; frame: number; energy: number }[];
  /**
   * レイヴン編: 持続ダメージで溜めたゲージ（発生順）。apply は付けたとき（発火のフレーム）、tick は予約した tick のフレーム。テスト用
   */
  dotGauges: { slotIndex: number; kind: 'apply' | 'tick'; frame: number; energy: number }[];
  /**
   * 発と、射撃ごとの倍率ダメージのヒットで溜めたゲージ（予約した順）。shotFrame は発射、frame は着弾（飛ぶ時間を足したフレーム）。
   * フルバーストの終わりを跨ぐ発の照合用（plan/design-anis-star-gauge-timing.md 3.5 節）
   */
  shotGauges: { slotIndex: number; shotFrame: number; frame: number; energy: number }[];
  /**
   * フラワー編（V-0483）: 周期のゲージ（burstGaugeHit）で溜めたゲージ（予約した順）。fireFrame は発火、frame は足すフレーム（発火 +
   * delayFrames）。照合用
   */
  timerGauges: { slotIndex: number; fireFrame: number; frame: number; energy: number }[];
  /**
   * 持ち主ごとの一覧編（plan/design-holder-effects.md 段 A）: 件の一覧の履歴。planTeamRun が区間を作る
   * （skills/holders.ts の buffTimelineOf）
   */
  history: HolderHistory;
};

/**
 * V-0030: ゲージを溜める段の循環を 1 パス目で追う状態。規則は skills/cycles.ts の cycleFires と同じ
 * （通算の射撃回数 n、間隔の変更の件の中は件の every。件は持ち主ごとの一覧の、循環の間隔の変更）
 */
type CycleGaugeTracker = {
  slotIndex: number;
  /** 段の循環のスロット（間隔の変更の件を引く） */
  skill: SkillSlot;
  every: number;
  gaugeHits: number[][];
  energy: number;
  count: number;
  step: number;
  /** Stage 22-B: fullChargeShot の循環は部分チャージの発を数えない */
  fullChargeOnly: boolean;
};

type InstantSource = {
  sourceSlotIndex: number;
  effect: ResolvedInstantEffect;
  fires: TriggerTracker;
};

/**
 * 弾丸チャージの端数（C-0558）。トーブの代用弾丸（最大装弾数 × 5.31%）が、最大装弾数 60〜64 で 3 発、66 で 4 発入る（録画 467・468）。
 * 録画 19 のノワール（14 × 39.88% = 5.58）は満タンに近く、切り捨て・四捨五入のどちらでも 14 になった
 */
export const AMMO_REFILL_ROUNDING: 'floor' | 'round' = 'round';

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

  // ---- バーストの状態機械（件の一覧がフルバーストの窓を読むので、効果の準備の前に作る） ----
  let controller: BurstControllerState | null = null;
  let fixed: BurstSchedule | null = null;
  if (options.manualBursts !== undefined && !options.burst) throw new RangeError('manualBursts needs burst');
  if (options.burst) {
    if (burstModel === 'fixed') {
      if (options.manualBursts !== undefined) throw new RangeError('manualBursts needs the dynamic burst model');
      fixed = planFixedCycle(
        slots.map((s) =>
          s === null ? null : { burstStep: s.character.burstStep, ...burstDelaysFieldOf(s.character) },
        ),
        frames,
      );
    } else {
      controller = initialBurstController(
        slots.map((s) => (s === null ? null : burstUnitOf(s.character, s.definition))),
        options.timing ?? DEFAULT_BURST_TIMING,
        options.manualBursts ?? null,
      );
    }
  }
  const activationsOf = (): readonly BurstActivation[] => controller?.activations ?? fixed?.activations ?? [];
  const windowsOf = () => controller?.windows ?? fixed?.fullBurstWindows ?? [];
  const gaugeFullOf = (): readonly number[] => controller?.gaugeFullFrames ?? [];

  // ---- 効果の準備 ----
  const passive = resolvePassiveStates(slots);
  const instant: InstantSource[] = [];
  /** 発火の文脈 context のとき、効果 e が掛かる枠（Stage 11: burstUsers は発火ごとに変わる） */
  const targetsAt = (e: Parameters<typeof isEffectTarget>[0], sourceSlotIndex: number, context: FireContext) =>
    slots.flatMap((t, i) => (t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character, context) ? [i] : []));
  // F5（plan/design-heal-vocabulary.md 3.3 節）: 時間の周期のトリガー（heal だけ書ける）は出来事の列に無いので、
  // 周期のフレーム（atStart ならフレーム 0 も。skills/timeline.ts の triggerFires）で発火する
  const instantTracker = (effect: ResolvedInstantEffect, sourceSlotIndex: number): TriggerTracker => {
    if (!isResolvedTimer(effect.trigger)) return createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel);
    const at = new Set(triggerFrames(effect.trigger, null, sourceSlotIndex, frames));
    return (ev) => at.has(ev.frame);
  };
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      instant.push({
        sourceSlotIndex,
        effect,
        fires: instantTracker(effect, sourceSlotIndex),
      });
    }
  });
  // 回復は healed の出来事を作るので先に当てる（heal のトリガーに healed は書けないので順番で閉じる。plan/design-stage11.md 3.3 節）
  // V-0024: 維持時間のある heal は、件の付いている対象への付き直しでは healed を起こさない（件の一覧の吸収回復の件。applyHeal）
  const heals = instant.filter((src) => src.effect.kind === 'heal');
  // V-0034: 射撃の回数トリガーのバーストゲージのチャージは、発と同じフレームのゲージに足す（手順 2 の前。下のループ）
  const isShotGaugeCharge = (src: InstantSource): boolean =>
    src.effect.kind === 'burstGauge' && isResolvedShotCount(src.effect.trigger);
  const shotGaugeCharges = instant.filter(isShotGaugeCharge);
  const otherInstants = instant.filter((src) => src.effect.kind !== 'heal' && !isShotGaugeCharge(src));
  const logs: (ShotLog | null)[] = slots.map((slot) =>
    slot === null
      ? null
      : {
          frames: [],
          fullCharge: isChargeWeapon(slot.character.shot),
          lastShotFrames: [],
          hits: [],
          coreHits: [],
          pelletHits: [],
        },
  );
  // シンデレラ S1 編: リロードの込め終わりは、それで終わる効果（durationUntil: reloadEnd。対象は自分）を持つ枠だけが書く
  const writesReloadEnds = slots.map((slot) => slot?.definition != null && hasReloadEndEffect(slot.definition));
  // 持ち主ごとの件の一覧（plan/design-holder-effects.md 段 A）。スキルの効果をすべて、受ける枠ごとの件の列で持つ
  const lists = createHolderLists(slots, { frames, scheduleModel, logs, fullBurstWindows: windowsOf });
  const trackEvents = lists.hasSources || instant.length > 0;
  // 戦闘開始時の件はループの前に登録する（1 発目のマガジンから効く）。ソルジャーE.G. 編: 周期のトリガーの atStart も
  lists.registerBattleStart();

  // ---- 射手 ----
  const passiveFiring = passive.map((s) => s?.buffs ?? ZERO_BUFFS);
  const baseParams = slots.map((slot, i) =>
    slot === null ? null : firingParams(slot.character.shot, passiveFiring[i]!),
  );
  /**
   * 枠 i がフレーム f に使う実効値（件の一覧のうち、射撃に効く stat の件で start ≤ f < end のもの）。
   * 手順 1 で呼ぶときは f の件はまだ登録されていないので「f − 1 までに登録済み」になり、
   * 手順 3 の弾丸チャージで呼ぶときは f に付いた最大装弾数▲も含む（射撃の回数のきっかけの弾丸チャージは f + 1 で呼ぶ。C-0561）
   */
  const paramsAt = (i: number, f: number): FiringParams => {
    const base = baseParams[i]!;
    const buffs = lists.firingBuffsAt(i, f, passiveFiring[i]!);
    if (buffs === null || isZeroFiring(buffs)) return base;
    return firingParams(slots[i]!.character.shot, buffs);
  };
  const shooters: (ShooterState | null)[] = slots.map((slot, i) =>
    slot === null ? null : initialShooter(slot.character.shot, model, paramsAt(i, 0)),
  );
  /** Stage 11 モダニア: 使用武器の変更中の射手の状態と、その武器の識別子（変更していなければ null） */
  const changedShooters: (ShooterState | null)[] = slots.map(() => null);
  const activeWeapon: (string | null)[] = slots.map(() => null);

  // ---- バースト ----
  const gaugeSpeed = passive.map((s) => s?.buffs.burstGaugeSpeed ?? 0);
  // 2 段目の段 1（plan/design-skill-stage1.md 1.6 節）: 時間で変わるゲージ速度（timed・状態の中身）の件を持ちうる枠は、フレームの頭で
  // (1 + 常時の速度 + 効いている件の速度) を読み（f − 1 までに付いた件。射手と同じ見え方）、そのフレームに溜めるゲージに掛ける。
  // 持たない枠は常時の値だけで、今までと同じ値（下の energies などを前もって作る）
  const timedGauge = slots.map((_, i) => lists.hasGaugeSpeedTracks(i));
  const timedGaugeSlots = slots.flatMap((_, i) => (timedGauge[i] ? [i] : []));
  const gaugeScale = slots.map((_, i) => 1 + gaugeSpeed[i]!);
  const targetEnergies = slots.map((slot) => slot?.character.shot.targetBurstEnergyPerShot ?? 0);
  /** 枠 i の、射手の 1 ヒットぶんのゲージ（targetBurstEnergyPerShot）のこのフレームの量。前もって作った値 fixed は速度が変わらない枠の分 */
  const targetEnergyNow = (i: number, fixed: number): number =>
    timedGauge[i] ? targetEnergies[i]! * gaugeScale[i]! : fixed;
  // Stage 18-C: 弾丸命中率が着地点で変わる枠は、1 発のゲージを命中率 1 で持ち、撃ったフレームの区間の命中率を掛ける。
  // SG はペレットの割合も 1 で持ち、区間の弾丸命中率が的の表の値ならそのまま（当たったペレットの割合。C-0150）、
  // 手入力の値なら置き値 SG_PELLET_GAUGE_HIT_RATE を掛ける（plan/design-sg-hit-rate.md 3 節）
  const hitRateSpans = slots.map((_, i) => options.hitRates?.[i] ?? null);
  const hitRateAt = slots.map(() => 0);
  const baseEnergies = slots.map((slot, i) =>
    slot === null
      ? 0
      : hitRateSpans[i]
        ? energyPerTrigger(slot.character.shot, i === controlledSlot, 1, 1)
        : energyPerTrigger(slot.character.shot, i === controlledSlot, slot.hitRate ?? 1),
  );
  const energies = baseEnergies.map((e, i) => e * (1 + gaugeSpeed[i]!));
  const pellets = slots.map((slot) => slot !== null && slot.character.shot.shotCount > 1);
  /** 枠 i のフレーム f の弾丸命中率の区間（自動でない枠は undefined。f は単調に増える） */
  const spanAt = (i: number, f: number): LandingHitRateSpan | undefined => {
    const spans = hitRateSpans[i];
    if (!spans) return undefined;
    while (hitRateAt[i]! + 1 < spans.length && spans[hitRateAt[i]!]!.end <= f) hitRateAt[i]! += 1;
    return spans[hitRateAt[i]!];
  };
  /** 枠 i がフレーム f の区間の値（持続の命中率▲が効いていれば出し直した値。▲は件の一覧の当たりの件。スタックは段の数だけ） */
  const spanValueAt = (
    i: number,
    f: number,
  ): LandingHitRateSpan | { hitRate: number; coreHits: number } | undefined => {
    const span = spanAt(i, f);
    if (span === undefined || options.hitRateWith === undefined || !lists.hasHitTracks) return span;
    const up = lists.hitUpAt(i, f);
    return up === 0 ? span : options.hitRateWith(i, span, up);
  };
  /** 枠 i がフレーム f に撃った 1 発のゲージ */
  const energyAt = (i: number, f: number): number => {
    const energy = timedGauge[i] ? baseEnergies[i]! * gaugeScale[i]! : energies[i]!;
    if (!hitRateSpans[i]) return energy;
    const span = spanAt(i, f);
    const pelletRate = pellets[i] && span?.measured !== true ? SG_PELLET_GAUGE_HIT_RATE : 1;
    return energy * (spanValueAt(i, f)?.hitRate ?? 1) * pelletRate;
  };
  // plan/design-anis-star-gauge-timing.md 3 節: 枠 i がフレーム f に撃った発の飛ぶ時間（ゲージはその後のフレームに溜まる）
  const flights = slots.map((_, i) => options.flights?.[i] ?? null);
  /**
   * 炸裂弾の時刻編（plan/design-eunhwa-tu-burst-shot-timing.md 4 節）: フレーム f に始まった枠 i の使用武器変更（識別子
   * `<resourceId>.<スロット>.<効果の番号>`）の最初の発を撃つフレーム。窓を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）の
   * 印 + 的の表の値（f の着地点で引く）。表の行が無ければ null
   */
  const weaponChangeFirstHitAt = (i: number, weaponId: string, f: number): number | null => {
    const skill = weaponId.split('.')[1] as SkillSlot;
    const spans = options.weaponChangeFirstHits?.[i]?.[skill];
    if (spans === undefined) return null;
    const opened = activationsOf()
      .filter((a) => a.slotIndex === i && effectFrameOf(a) <= f)
      .at(-1);
    if (opened === undefined) return null;
    return hexagonFrameOf(opened) + flightFramesAt(spans, f);
  };
  const shotFlightAt = (i: number, f: number): number => flightFramesAt(flights[i]?.shot, f);
  // 同 2 節（C-0177・C-0243）: 枠ごとの「発の番号 → 壊した障害物の数」と、物 1 個のゲージ
  const obstacles = slots.map(() => new Map<number, number>());
  for (const b of options.obstacleBreaks ?? []) obstacles[b.slotIndex]?.set(b.shot, b.count);
  const obstacleBases = slots.map((slot, i) =>
    slot === null
      ? 0
      : slot.character.shot.burstEnergyPerShot *
        (i === controlledSlot && slot.character.shot.chargeTime > 0 ? slot.character.shot.fullChargeBurstEnergy : 1),
  );
  const obstacleEnergies = obstacleBases.map((e, i) => e * (1 + gaugeSpeed[i]!));
  const obstacleEnergyAt = (i: number): number =>
    timedGauge[i] ? obstacleBases[i]! * gaugeScale[i]! : obstacleEnergies[i]!;
  const shotCounts = slots.map(() => 0);
  // ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.2・2.3 節）: 発ごとの命中・コアの命中の期待値。
  // 区間はゲージと同じ値（常時の命中率▲ + 効いている持続の▲）。SG の命中は 1 トリガーを 1 回（ペレットのどれかが当たる）
  const enemyHasCore = options.enemyHasCore ?? true;
  const hitsAt = (i: number, f: number): { hits: number; coreHits: number } => {
    const slot = slots[i]!;
    const span = spanValueAt(i, f);
    const hitRate = span?.hitRate ?? slot.hitRate ?? 1;
    const coreHits = span !== undefined ? span.coreHits : (slot.hitRate ?? 1) * (slot.coreHitRate ?? 0);
    return { hits: pellets[i] ? 1 : hitRate, coreHits: enemyHasCore ? coreHits : 0 };
  };
  // ペレットの命中編（plan/design-pellet-hit.md 2・3 節）: 発ごとに的に当たったペレットの数。録画で数えた入力があればその数、
  // 無ければ期待値（SG は shotCount × 当たったペレットの割合。割合はゲージと同じ: 的の表の区間はその値、手入力は
  // 弾丸命中率 × SG_PELLET_GAUGE_HIT_RATE。C-0150。SG 以外は命中の期待値と同じ）
  const pelletInputs = slots.map(() => new Map<number, number>());
  for (const p of options.pelletHits ?? []) p.counts.forEach((n, k) => pelletInputs[p.slotIndex]?.set(k, n));
  const pelletsAt = (i: number, f: number, k: number, hits: number): number => {
    const input = pelletInputs[i]!.get(k);
    if (input !== undefined) return input;
    if (!pellets[i]) return hits;
    const slot = slots[i]!;
    const span = spanAt(i, f);
    const rate =
      span === undefined
        ? (slot.hitRate ?? 1) * SG_PELLET_GAUGE_HIT_RATE
        : (spanValueAt(i, f)?.hitRate ?? 1) * (span.measured === true ? 1 : SG_PELLET_GAUGE_HIT_RATE);
    return slot.character.shot.shotCount * rate;
  };
  // V-0030: 段のヒットでゲージを溜める循環。溜めるゲージは当たるフレームに予約する（pendingGauge）
  const cycleTrackers: CycleGaugeTracker[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const log = logs[i]!;
    for (const cycle of resolveCycles(slot.definition, slot.character, slot.levels)) {
      if (cycle.gaugeHits.every((d) => d.length === 0)) continue;
      if (cycle.trigger.count === 'fullChargeShot' && !log.fullCharge) continue;
      for (const e of resolveCycleEvery(slot.definition, slot.character, slot.levels)) {
        if (e.targetSkill !== cycle.source.skill) continue;
        if (e.trigger !== 'burstUse') {
          throw new RangeError(`cycle gauge hits support only a burstUse cycleEvery, got ${JSON.stringify(e.trigger)}`);
        }
        // 着弾編: 循環の窓は発動のフレームから数えるので、効果の発火が遅れるキャラ（burst/landing.ts）には使えない
        if (burstDelaysOf(slot.character).effectFrames !== 0) {
          throw new RangeError('cycleEvery is not supported for a character with a burst effect delay');
        }
      }
      cycleTrackers.push({
        slotIndex: i,
        skill: cycle.source.skill,
        every: cycle.trigger.every,
        gaugeHits: cycle.gaugeHits,
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        count: 0,
        step: 0,
        fullChargeOnly: cycle.trigger.count === 'fullChargeShot',
      });
    }
  });
  // ヘルム編（V-0034）: ゲージを溜める倍率ダメージ（damage の gaugeHits）。射撃を数えて、段と同じく当たるフレームに予約する
  const damageGaugeTrackers: {
    slotIndex: number;
    count: ShotCountKind;
    every: number;
    gaugeHits: number[];
    energy: number;
    n: number;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const g of resolveDamageGauges(slot.definition, slot.character, slot.levels)) {
      if (g.trigger.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      damageGaugeTrackers.push({
        slotIndex: i,
        count: g.trigger.count,
        every: g.trigger.every,
        gaugeHits: g.gaugeHits,
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        n: 0,
      });
    }
  });
  // モラン編（plan/design-moran.md 3 節）: 射撃の回数でゲージだけを溜める効果（burstGaugeHit）。射撃を数えて、発火した射撃の
  // フレームのゲージに足す（付けるのは撃った時でヒットではないので、飛ぶ時間は足さない）
  const shotGaugeTrackers: { slotIndex: number; count: ShotCountKind; every: number; energy: number; n: number }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const t of resolveShotGauges(slot.definition, slot.character, slot.levels)) {
      if (t.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      shotGaugeTrackers.push({
        slotIndex: i,
        count: t.count,
        every: t.every,
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        n: 0,
      });
    }
  });
  // レイヴン編（plan/design-raven-s1.md 4 節）: ゲージを溜める持続ダメージ（dot の gaugeOnApply・gaugeOnTick）。射撃を数えて
  // 発火を追い、付けたときの分は発火のフレームに、tick の分は dotTickTracker が返した tick のフレームに予約する。
  // V-0113（10 節）: バースト使用時に付く効果（burstUse。クルミのハッキング）も同じまとまりの発火として、手順 3 の出来事で追う
  const dotGaugeTrackers: {
    slotIndex: number;
    effects: { count: ShotCountKind; every: number; n: number; onApply: boolean }[];
    onBurstUse: boolean;
    tracker: DotTickTracker;
    onTick: boolean;
    energy: number;
    /** 自動攻撃のヒットの飛ぶ時間（plan/design-anis-star-gauge-timing.md 4 節。持続ダメージ・表に無いものは null） */
    flight: FlightFrameSpan[] | null;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const group of groupDotsByState(resolveDotEffects(slot.definition, slot.character, slot.levels))) {
      const dot = group[0]!.dot!;
      // tick のゲージは同じ状態でそろっている（groupDotsByState）。付けたときのゲージは効果ごと
      const onTick = dot.gaugeOnTick === true;
      if (!onTick && !group.some((e) => e.dot!.gaugeOnApply === true)) continue;
      const effects: { count: ShotCountKind; every: number; n: number; onApply: boolean }[] = [];
      let onBurstUse = false;
      for (const e of group) {
        if (isResolvedShotCount(e.trigger)) {
          effects.push({ count: e.trigger.count, every: e.trigger.every, n: 0, onApply: e.dot!.gaugeOnApply === true });
        } else if (e.trigger === 'burstUse' && e.dot!.gaugeOnApply !== true) {
          onBurstUse = true;
        } else {
          throw new RangeError('a dot with gauge needs shot count triggers or burstUse (without the apply gauge)');
        }
      }
      if (!onBurstUse && effects.every((e) => e.count === 'fullChargeShot') && !logs[i]!.fullCharge) continue;
      dotGaugeTrackers.push({
        slotIndex: i,
        effects,
        onBurstUse,
        tracker: dotTickTracker(dot.intervalSeconds, dot.durationSeconds, frames, dot.firstTick),
        onTick,
        energy: slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!),
        flight: dot.autoAttack === true ? (flights[i]?.autoAttacks[group[0]!.source.skill] ?? null) : null,
      });
    }
  });
  const dotGauges: FirstPassResult['dotGauges'] = [];
  const pendingGauge = new Map<number, number>();
  const shotGauges: FirstPassResult['shotGauges'] = [];
  /** 枠 i の発のゲージを、着弾のフレーム（f + 飛ぶ時間）に入れる。f のフレームならこのフレームのゲージに返す */
  const landingGauge = (i: number, at: number, f: number, energy: number): number => {
    if (energy > 0 && at < frames) shotGauges.push({ slotIndex: i, shotFrame: f, frame: at, energy });
    if (at === f) return energy;
    if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
    return 0;
  };
  const trackDotBurstUse = dotGaugeTrackers.some((t) => t.onBurstUse);
  /** 持続ダメージがフレーム f に付いた。新しく決まった tick の分を、tick のフレームに予約する（どれも f より後） */
  const reserveDotTicks = (t: (typeof dotGaugeTrackers)[number], f: number): void => {
    const { ticks } = t.tracker.fire(f);
    if (!t.onTick) return;
    // 2 段目の段 1: 時間で変わるゲージ速度は、付いたフレームの速度で tick の分も決める
    const energy = targetEnergyNow(t.slotIndex, t.energy);
    for (const tick of ticks) {
      if (tick <= f) throw new RangeError(`dot gauge tick at ${tick} is not after the fire at ${f}`);
      // 自動攻撃のヒットは、刻みのフレーム + 飛ぶ時間に着く（C-0504。ダメージの tick のフレームは変えない）
      const at = tick + flightFramesAt(t.flight, tick);
      pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      dotGauges.push({ slotIndex: t.slotIndex, kind: 'tick', frame: at, energy });
    }
  };
  // フラワー編: 周期のゲージ（burstGaugeHit）。射撃に依らないので、発火のフレームにループの前に予約する。
  // delayFrames があれば発火の後のヒットのフレームに足し、戦闘の終わりを越えるものは足さない（C-0453。plan/design-timer-ceil.md 7 節）
  // 2 段目の段 1: 時間で変わるゲージ速度の枠の周期のゲージは、発火のフレームの頭でその速度で予約する（発火のフレーム → 枠と遅れ）
  const timedTimerGauges = new Map<number, { slotIndex: number; delayFrames: number }[]>();
  const timerGauges: FirstPassResult['timerGauges'] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const energy = slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!);
    for (const { everySeconds, delayFrames } of resolveTimerGauges(slot.definition)) {
      for (const fire of timerFrames(everySeconds, frames)) {
        const at = fire + delayFrames;
        if (at >= frames) continue;
        if (timedGauge[i])
          timedTimerGauges.set(fire, [...(timedTimerGauges.get(fire) ?? []), { slotIndex: i, delayFrames }]);
        else {
          timerGauges.push({ slotIndex: i, fireFrame: fire, frame: at, energy });
          pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
        }
      }
    }
  });
  /** 着弾編: 先のフレームに効果が発火するバーストの発動（フレーム → 発動） */
  const pendingBurstEffects = new Map<number, BurstActivation[]>();
  const cycleGaugeHits: FirstPassResult['cycleGaugeHits'] = [];
  /**
   * V-0030: 段の循環。このフレームの射撃を数え、段のヒットのゲージを当たるフレームに予約する。間隔の変更の件は、このフレームに
   * 付いたもの（発動のフレームから）も見るので、手順 3 の後に呼ぶ
   */
  const countCycles = (f: number): void => {
    for (const t of cycleTrackers) {
      const ev = shotEvents[t.slotIndex];
      if (ev === null || ev === undefined) continue;
      if (t.fullChargeOnly && !ev.fullCharge) continue;
      t.count += 1;
      let e = t.every;
      for (const every of lists.cycleEveryAt(t.slotIndex, t.skill, f)) e = Math.min(e, every);
      if (t.count % e !== 0) continue;
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      for (const d of t.gaugeHits[t.step]!) {
        const at = f + d;
        cycleGaugeHits.push({ slotIndex: t.slotIndex, shotFrame: f, frame: at, energy });
        if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
      }
      t.step = (t.step + 1) % t.gaugeHits.length;
    }
  };

  let nextActivation = 0;
  let nextWindowStart = 0;
  let nextWindowEnd = 0;
  let gaugeFullSeen = 0;

  const instants: InstantApplication[] = [];
  /** Stage 11: 次のフレーム以降に起きる回復（射撃の回数起点）。フレーム → 受ける枠 */
  const pendingHeals = new Map<
    number,
    { sourceSlotIndex: number; slotIndex: number; effect: ResolvedInstantEffect }[]
  >();
  /** ヘルム編: 次のフレーム以降にゲージへ足すチャージ（射撃の回数トリガーでない burstGauge）。フレーム → 効果 */
  const pendingGaugeCharges = new Map<number, { sourceSlotIndex: number; effect: ResolvedInstantEffect }[]>();
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
    // 2 段目の段 1: 時間で変わるゲージ速度の枠の、このフレームの (1 + 速度)（f − 1 までに付いた件）と、その速度の周期のゲージ
    for (const i of timedGaugeSlots) gaugeScale[i] = 1 + gaugeSpeed[i]! + lists.gaugeSpeedAt(i, f);
    for (const t of timedTimerGauges.get(f) ?? []) {
      const at = f + t.delayFrames;
      const energy = targetEnergies[t.slotIndex]! * gaugeScale[t.slotIndex]!;
      timerGauges.push({ slotIndex: t.slotIndex, fireFrame: f, frame: at, energy });
      pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
    }
    // 1. 射手（V-0030: 前のフレームまでに予約した段のヒットのゲージも、このフレームのゲージに入れる）
    let gauge = pendingGauge.get(f) ?? 0;
    pendingGauge.delete(f);
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      if (slot === null || !shooters[i]) return;
      const params = paramsAt(i, f);
      // Stage 11 モダニア: 使用武器の変更。始まったら変更後の武器を新しい状態で撃ち、終わったら基礎の武器の状態に戻す
      const weaponId = params.weapon?.id ?? null;
      if (weaponId !== activeWeapon[i]) {
        activeWeapon[i] = weaponId;
        if (params.weapon !== null) {
          changedShooters[i] = weaponChangeShooter(params.weapon.shot, model, params);
          const firstHit = weaponChangeFirstHitAt(i, params.weapon.id, f);
          if (firstHit !== null) changedShooters[i]!.wait = Math.max(0, firstHit - f);
        } else {
          changedShooters[i] = null;
          resumeShooter(shooters[i]!, slot.character.shot, model, params);
        }
      }
      const state = params.weapon !== null ? changedShooters[i]! : shooters[i]!;
      const shot = params.weapon?.shot ?? slot.character.shot;
      // Stage 22-B: 窓に入るフレームに、チャージの途中ならその時点のチャージで撃ってから、ハイドする（C-0109）
      const partial = hideNow ? partialChargeShot(state, shot, model, params) : null;
      if (hideNow) hideShooter(state, shot, model, params);
      if (unhideNow) unhideShooter(state, shot, block!.end - block!.start, model, params);
      const reloading = state.phase === 'reloading';
      const fired = stepShooter(state, shot, model, params, blocked);
      const log = logs[i]!;
      // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 基礎の武器のリロードを込め終えた。込め終えたフレームまでが
      // 「リロード完了時に解除」の窓（件の終わりは次のフレーム）
      if (writesReloadEnds[i] && reloading && state.phase !== 'reloading' && params.weapon === null)
        (log.reloadEnds ??= []).push(f + 1);
      if (!fired && partial === null) return;
      log.frames.push(f);
      if (state.lastShot) log.lastShotFrames!.push(f);
      if (params.weapon !== null) (log.weaponChangeShotFrames ??= []).push(f);
      // 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9 節の論点 8）: 撃ち切りで終わる変更は、最後の弾丸を
      // 撃ったら次のフレームで基礎の武器に戻す（変更後の武器はリロードしない）。件の終わりも同じ列から作る（skills/holders.ts）
      if (params.weapon !== null && state.lastShot && lists.openWeaponChange(i, params.weapon.id, f + 1)) {
        (log.weaponChangeEnds ??= []).push(f + 1);
      }
      const isPartial = partial !== null && partial < 1;
      if (isPartial) (log.partialShots ??= []).push({ frame: f, progress: partial });
      const { hits, coreHits } = hitsAt(i, f);
      const pelletCount = pelletsAt(i, f, shotCounts[i]!, hits);
      log.hits!.push(hits);
      log.coreHits!.push(coreHits);
      log.pelletHits!.push(pelletCount);
      shotEvents[i] = {
        lastShot: state.lastShot,
        fullCharge: log.fullCharge && !isPartial,
        hits,
        coreHits,
        pellets: pelletCount,
      };
      if (params.weapon !== null) shotEvents[i]!.weaponChange = true;
      shotCounts[i]! += 1;
      const energy =
        energyAt(i, f) * (isPartial ? partialGaugeRatio(slot.character.shot, i === controlledSlot, partial) : 1) +
        (obstacles[i]!.get(shotCounts[i]!) ?? 0) * obstacleEnergyAt(i);
      gauge += landingGauge(i, f + shotFlightAt(i, f), f, energy);
    });
    // ヘルム編: ゲージを溜める倍率ダメージ。遅れ 0（V-0035 のモダニア。発と同じフレームに当たる）はこのフレームのゲージに足す
    for (const t of damageGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      // 射撃ごとの倍率ダメージのヒット（S1 の追加ダメージなど）も、発の着弾から数える（飛ぶ時間。plan/design-anis-star-gauge-timing.md 3.1 節）
      const flight = shotFlightAt(t.slotIndex, f);
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      for (const d of t.gaugeHits) gauge += landingGauge(t.slotIndex, f + flight + d, f, energy);
    }
    // モラン編: 射撃の回数でゲージだけを溜める効果。発火した射撃のフレームのゲージに足す
    for (const t of shotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (counted.fired) gauge += targetEnergyNow(t.slotIndex, t.energy);
    }
    // レイヴン編: ゲージを溜める持続ダメージ。この射撃で付いたら、付けたときの分はこのフレームのゲージに足し、
    // 新しく決まった tick の分は tick のフレームに予約する（どれもこのフレームより後。resolveDotEffects が形を限っている）
    for (const t of dotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      let fired = false;
      let apply = false;
      for (const e of t.effects) {
        const counted = advanceShotCount(e.n, shotCountWeight(e.count, shot), e.every);
        e.n = counted.count;
        if (!counted.fired) continue;
        fired = true;
        if (e.onApply) apply = true;
      }
      if (!fired) continue;
      if (apply) {
        const energy = targetEnergyNow(t.slotIndex, t.energy);
        gauge += energy;
        dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f, energy });
      }
      reserveDotTicks(t, f);
    }
    // ヘルム編: バーストゲージのチャージ（最大値 × X%）。射撃の回数トリガーはこのフレームの射撃で発火し、このフレームのゲージに足す
    // （V-0034: バーは発のフレームで 1 回に跳ぶ）。ほかのトリガーは前のフレームまでに発火したものを足す
    const charges = pendingGaugeCharges.get(f) ?? [];
    pendingGaugeCharges.delete(f);
    if (shotGaugeCharges.length > 0) {
      // 射撃の回数トリガーの判定（skills/triggers.ts）は射撃だけを見る。手順 3 の出来事はまだ無いので空で渡す
      const ev: FrameEvents = {
        frame: f,
        shots: shotEvents,
        activations: [],
        burstEffects: [],
        fullBurstStart: false,
        fullBurstEnd: false,
        gaugeFull: false,
        fullBurstStartUsers: [],
        fullBurstEndUsers: [],
        healed: [],
      };
      for (const src of shotGaugeCharges) {
        if (src.fires(ev) && controller !== null) charges.push(src);
      }
    }
    if (charges.length > 0 && controller !== null) {
      for (const c of charges) {
        gauge += c.effect.value * controller.timing.gaugeMax;
        instants.push({
          frame: f,
          sourceSlotIndex: c.sourceSlotIndex,
          slotIndex: c.sourceSlotIndex,
          effect: c.effect,
          amount: c.effect.value,
        });
      }
    }
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    if (controller !== null) stepBurstController(controller, f, gauge, blocked);
    // 2b. V-0030: 段の循環の射撃は、手順 3 の後に数える（countCycles）
    if (!trackEvents && !trackDotBurstUse) {
      countCycles(f);
      continue;
    }

    // 3. 出来事 → 射撃に効く窓の登録 → 即時効果
    const activations = activationsOf();
    const now: BurstActivation[] = [];
    while (nextActivation < activations.length && activations[nextActivation]!.frame <= f) {
      if (activations[nextActivation]!.frame === f) now.push(activations[nextActivation]!);
      nextActivation += 1;
    }
    // 着弾編: 効果の発火は発動 + 遅れのフレーム。先のフレームなら積んでおく（遅れの無いキャラはこのフレーム）
    const burstEffects: BurstActivation[] = pendingBurstEffects.get(f) ?? [];
    if (burstEffects.length > 0) pendingBurstEffects.delete(f);
    for (const a of now) {
      const at = effectFrameOf(a);
      if (at === f) burstEffects.push(a);
      else if (at < frames) pendingBurstEffects.set(at, [...(pendingBurstEffects.get(at) ?? []), a]);
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
    // 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: このフレームにフルスタックになった状態を消費する（回復のきっかけ { fullStack }）。
    // フルスタックになる件は、射撃の回数のきっかけの付与なので前のフレームまでに登録済み
    const fullStacks = lists.consumeFullStacks(f);
    const ev: FrameEvents = {
      frame: f,
      shots: shotEvents,
      activations: now,
      burstEffects,
      fullBurstStart,
      fullBurstEnd,
      gaugeFull,
      fullBurstStartUsers,
      fullBurstEndUsers,
      healed,
      ...(fullStacks.length > 0 ? { fullStacks } : {}),
    };
    // V-0113: バースト使用時に付く持続ダメージ（クルミのハッキング）。付け直しと同じで、延びた tick のゲージを予約する
    // （burstUse のトリガーの判定と同じく、このフレームの効果の発火 burstEffects で見る）
    for (const t of dotGaugeTrackers) {
      if (t.onBurstUse && burstEffects.some((a) => a.slotIndex === t.slotIndex)) reserveDotTicks(t, f);
    }

    // 回復を先に当てる。射撃の回数起点は次のフレームに送り（窓の開始と同じ規則）、それ以外はこのフレームの healed に立てる
    for (const src of heals) {
      if (!src.fires(ev)) continue;
      const at = healFrameOf(src.effect, f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev))) {
        if (at < frames && !lists.applyHeal(src.effect, src.sourceSlotIndex, target, at)) continue;
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

    // 持ち主ごとの件の一覧: 段 1 → 段 1.5 → 段 2 → 強化の順に件を登録する（plan/design-holder-effects.md 2.4 節）
    lists.registerFrame(ev);
    for (const src of otherInstants) {
      if (!src.fires(ev)) continue;
      // ヘルム編: 射撃の回数トリガーでないバーストゲージのチャージは、対象によらず 1 回だけ、次のフレームのゲージに足す
      if (src.effect.kind === 'burstGauge') {
        if (controller === null || f + 1 >= frames) continue; // 固定サイクル・バーストなしではゲージを見ない
        const list = pendingGaugeCharges.get(f + 1) ?? [];
        list.push({ sourceSlotIndex: src.sourceSlotIndex, effect: src.effect });
        pendingGaugeCharges.set(f + 1, list);
        continue;
      }
      const context = lists.rankContext(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
        if (src.effect.kind === 'cooldownReduction') {
          if (controller === null) continue; // 固定サイクル・バーストなしでは CT を見ない
          const before = controller.cooldownReductions.length;
          reduceCooldown(controller, target, gameSecondsToFrames(src.effect.value), f, src.sourceSlotIndex);
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
        // 2 段目の段 4（C-0561。仮説）: 射撃の回数のきっかけの弾丸チャージは、同じ発のきっかけで付く件（f + 1 から。`{ applied }` の
        // 付与で付く応急改造を含む）を入れた最大装弾数で数える。残弾に足すのは発のフレーム f のまま
        const params = paramsAt(target, isResolvedShotCount(src.effect.trigger) ? f + 1 : f);
        const before = state.ammo;
        // ルドミラ：ウィンターオーナー編: 発数の弾丸チャージ（scaling 'flat'）は値をそのまま足す
        const rounds =
          src.effect.scaling === 'flat' ? src.effect.value : refillRounds(params.maxAmmo, src.effect.value);
        refillAmmo(state, rounds, slot.character.shot, model, params);
        // V-0163: このフレームの最後の弾丸と同じ発の弾丸チャージは、リロードを取り消して撃ち続ける（その発は最後の弾丸に数えない）
        const fired = shotEvents[target];
        if (fired?.lastShot === true && resumeAfterLastShotRefill(state, slot.character.shot, model, params)) {
          fired.lastShot = false;
          const log = logs[target]!;
          if (log.lastShotFrames![log.lastShotFrames!.length - 1] === f) log.lastShotFrames!.pop();
        }
        instants.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: target,
          effect: src.effect,
          amount: state.ammo - before,
        });
      }
    }
    countCycles(f);
  }

  const schedule = controller !== null ? finishSchedule(controller, frames) : fixed;
  const history = lists.history();
  return {
    frames,
    shots: logs,
    schedule,
    instants,
    cycleGaugeHits,
    dotGauges,
    shotGauges,
    timerGauges,
    history,
  };
}
