// 1 パス目のフレームループ（純関数。plan/design-stage10.md 1 節）。
// 射撃に効くバフ（frame/firing.ts の FiringParams）と CT 短縮があると、射撃の列 → 時刻表 → バフ → 射撃の列…と循環する。
// ここではフレームを 1 つずつ進め、射手・ゲージ・バーストの状態機械・スキルの効果を同時に回して循環をほどく。
// 効果はすべて持ち主ごとの件の一覧（skills/holders.ts）で持つ。ループの後の区間は planTeamRun が履歴から作り（skills/holders/history.ts の buffTimelineOf）、
// 読む側（sim・観測値の指標・画面）は履歴を読む（plan/design-holder-effects.md 2.9 節）。
//
// フレーム f の中の順番:
//   1. 射手を進める。射撃の実効値は「f − 1 までに登録済み」かつ「start ≤ f < end」の件で決まる（plan/design-stage10.md 1.1 節の表）。
//      戦闘開始時（battleStart）の件だけはループの前に登録し、1 発目のマガジンから効かせる。
//      使用武器の変更の間は、変更後の武器を別の射手の状態で撃ち、終わったら基礎の武器を最大装弾数まで込め直して戻す
//      （frame/shooter.ts の resumeShooter。録画 0044）。武器の件は持ち替えるフレーム（発火の次のフレーム）から。
//   2. このフレームの射撃のゲージと、このフレームに予約したゲージ（段のヒット・周期のゲージ）を足して、状態機械を進める。
//   3. このフレームの出来事を TriggerTracker（skills/triggers.ts）に流し、回復 → 段 1 → 段 1.5 → 段 2 → 強化（貯めるだけ）
//      → 即時効果 の順に、効果の件を登録して当てる（plan/design-holder-effects.md 2.4 節）。射撃の回数トリガーの件は f + 1 から効き、
//      同じ効果の再発火は和集合。スタックする効果は段ごとの件で持つ（skills/stacks.ts）。
//      - 回復を受ける枠とフレームは skills/heals.ts の healFrameOf、「最終攻撃力が最も高い味方 N 機」（topAttack）の順位は
//        skills/ranking.ts。回復を先に当てるので、回復の対象の順位にはこのフレームに付く件が入らない（循環を順番で断つ）。
//      - 条件つきの状態の付与の中身は、ほかの条件の判定に使わない（連鎖の禁止。plan/design-named-state-impl.md 1.5 節）。
//      - 即時効果: CT 短縮は発動の後（plan/design-stage10.md 4 節）、弾丸チャージは同じフレームに付いた最大装弾数▲込みの最大で
//        （録画 0019: ノワールのフルバースト開始で 9 → 14 になるのは、+5 発と 39.88% の弾丸チャージが同じフレームに来るため）。
//   段の循環（cycle）の段に gaugeHits があれば、手順 3 の後にその枠の射撃を数えて段を追い（skills/cycles.ts の cycleFires と
//   同じ規則）、段のヒットのゲージを当たるフレームに予約する（紅蓮BS。V-0030、C-0085）。手順 3 の後に数えるのは、このフレームに
//   付いた間隔の変更の件も見るため（ゲージは先のフレームに予約するので、数える位置で値は変わらない）。
//
// 周期でゲージだけを溜める効果（burstGaugeHit）は、ループの前に発火のフレームへ射手の 1 ヒットぶんのゲージを予約する
// （I-DOLL・フラワーの S2。C-0178）。射撃の回数のトリガーの burstGaugeHit は、発火した射撃のフレームのゲージに足す。
// 当たりに効く状態の stat（HIT_STATE_STATS）の件があれば、条件が自動の枠の発のゲージと命中の期待値を、常時の N + 効いている持続の▲
// で出し直す（options.hitRateWith。2 パス目の landingPartsWith と同じ式。plan/design-sustained-hit-rate-gauge.md）。
// 敵を狙えない窓（options.untargetable）の間は、全員が撃たず（ハイドしてリロード）、オートバーストも発動しない。ゲージは射撃が無い
// ので溜まらず、持続バフ・CT・フルバーストの時間はそのまま進む。チャージの無い武器は、窓の始まりから D（WeaponModel.hideDetectFrames）
// までは撃ち続ける（plan/design-hide-reload-detect.md 10 節）。
// 射撃に効く効果も即時効果も予約したゲージも無い編成では、射撃の列は planShots、時刻表は planDynamicSchedule と 1 フレームも違わない
// （plan/design-stage10.md 1.3 節）。
import { planFixedCycle } from '../burst/fixedCycle.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  extendCooldown,
  reduceCooldown,
  reserveFullBurstExtension,
  shortenCooldown,
  stunSlot,
  stepBurstController,
  type BurstControllerState,
  type BurstTiming,
} from '../burst/controller.ts';
import { burstCandidateOf, burstUnitOf, partialGaugeRatio } from '../burst/dynamic.ts';
import {
  resolveAppliedPauses,
  resolveBurstUsePause,
  resolveShotPauses,
  type ResolvedDamageEffect,
} from '../skills/burstDamage.ts';
import {
  effectFrameOf,
  hexagonFrameOf,
  hitFrameOf,
  stageEnterFrameOf,
  type BurstActivation,
  type BurstSchedule,
  type BurstScheduleModel,
  type BurstStepKey,
} from '../burst/schedule.ts';
import { capCritRate, ZERO_BUFFS, type BuffTotals, type HitRateN } from '../skills/buffs.ts';
import {
  firesChargeShots,
  isResolvedShotCount,
  isResolvedApplied,
  isResolvedTimer,
  isResolvedWeaponChangeEnd,
  resolveCoverHeals,
  resolveInstant,
  type ResolvedCoverHeal,
  type ResolvedInstantEffect,
  type ResolvedTrigger,
} from '../skills/resolve.ts';
import { healFrameOf } from '../skills/heals.ts';
import { createHolderLists, type HolderHistory, type LeadShots } from '../skills/holders.ts';
import { isEffectTarget, type FireContext } from '../skills/targets.ts';
import { resolvePassiveStates, triggerFrames, type TimelineSlot } from '../skills/timeline.ts';
import {
  advanceShotCount,
  burstStepHolds,
  createTriggerTracker,
  fireContextOf,
  type FrameEvents,
  type ShotCountEveryAt,
  type ShotEvent,
  shotCountWeight,
  type TriggerTracker,
} from '../skills/triggers.ts';
import { chargeTriggersOf, hasReloadEndEffect, isEndedTrigger, type ShotCountKind } from '../skills/types.ts';
import type { SummonId } from '../skills/summons.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, type WeaponModel } from '../weapons.ts';
import { type FrameRange } from '../skills/timeline.ts';
import { firingParams, isZeroFiring, type FiringParams } from './firing.ts';
import {
  beginHide,
  hideShooter,
  initialShooter,
  refillAmmo,
  drainAmmo,
  resumeAfterLastShotRefill,
  resumeShooter,
  chargeProgressFrames,
  stepShooter,
  stepHide,
  reaimShooter,
  unhideShooter,
  weaponChangeShooter,
  weaponFreeFrameAtSwap,
  type ShooterState,
} from './shooter.ts';
import type { ShotLog } from './shots.ts';
import { flightFramesAt, type FlightFrameSpan, type LandingHitRateSpan, type SlotFlight } from './landing.ts';
import type { SkillSlot } from '../types.ts';
import type { HoldFire, ObstacleBreak, PelletHits } from '../team.ts';
import { unionRanges } from './events.ts';
import { reloadStartOffset } from '../cadence.ts';
import type { FirstPassBase } from './firstPass/base.ts';
import { createGauge } from './firstPass/gauge.ts';
import { createGaugeEffects } from './firstPass/gaugeEffects.ts';
import { createAccumulate } from './firstPass/accumulate.ts';
import { createSummons } from './firstPass/summons.ts';

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
  /** バーストを使わない枠（0 始まり。TeamInput.noBurstSlots）。動的サイクルだけ。省略は全員使う */
  noBurstSlots?: readonly number[];
  /** 敵を狙えない窓（昇順・重なりなし。frame/events.ts の untargetableRanges）。省略・空なら今までと同じ */
  untargetable?: readonly FrameRange[];
  /**
   * V-0605: 枠ごとの、撃たずにハイドする時間（TeamInput.holdFire）。その枠だけ untargetable と同じに扱い（重なれば合わせた区間）、
   * 入るフレームに部分チャージの発は撃たない（狙えない窓の始まりと重なるフレームは撃つ）。ゲージとバーストの使用は止めない
   */
  holdFire?: readonly HoldFire[];
  /**
   * 枠ごとの弾丸命中率の区間（条件が自動の枠。frame/landing.ts の hitRateSpansOf）。null・省略の枠は
   * TimelineSlot.hitRate の定数のまま。区間は昇順で [0, frames) を覆う
   */
  hitRates?: readonly (readonly LandingHitRateSpan[] | null)[];
  /** 敵にコアがあるか（省略 true）。無ければ coreHit の回数は増えない */
  enemyHasCore?: boolean;
  /**
   * plan/design-anis-star-gauge-timing.md 3・4 節: 枠ごとの飛ぶ時間（frame/landing.ts の slotFlightsOf）。発のゲージ（弾と射撃ごとの
   * 倍率ダメージのヒット）と自動攻撃のヒットのゲージを、着弾のフレーム（発射・刻み + 飛ぶ時間）に溜める。省略・null の枠は 0
   */
  flights?: readonly (SlotFlight | null)[];
  /**
   * 枠ごと・スキルのスロットごとの、使用武器変更の最初の発の、発動の印
   * （hexagonFrameOf）から着弾までのフレームの区間（frame/landing.ts の slotWeaponChangeFirstHitsOf。
   * plan/design-eunhwa-tu-burst-shot-timing.md 4 節）。省略・null・行の無いスロットは、チャージ武器の最初の発の待ち
   */
  weaponChangeFirstHits?: readonly (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[];
  /** 同 2 節: 発が壊した障害物（録画で数えた入力）。その発のゲージに物の分を足す。省略は無し */
  obstacleBreaks?: readonly ObstacleBreak[];
  /** テスト用: 件の列を読むたびに作り直した件と比べる（skills/holders/types.ts の HolderListsOptions.verifyItems） */
  verifyItems?: boolean;
  /**
   * 枠ごとの、発ごとに的に当たったペレットの数（録画で数えた入力。plan/design-pellet-hit.md 3 節）。
   * 有る発は pelletHit の回数に期待値の代わりにこの数を足す。省略は無し（期待値）
   */
  pelletHits?: readonly PelletHits[];
  /**
   * plan/design-sustained-hit-rate-gauge.md: 枠 slotIndex の区間 span の弾丸命中率とコアの命中の期待値を、持続の命中率▲▼の和
   * timed を足した和で出し直す（frame/landing.ts の hitRateSpanWith。timed が▲も▼も 0 なら span の値のまま）。省略なら持続の▲の窓を
   * 追わない（計画の値のまま）
   */
  hitRateWith?: (slotIndex: number, span: LandingHitRateSpan, timed: HitRateN) => { hitRate: number; coreHits: number };
  /**
   * 条件 inEffectiveRange の判定（skills/holders.ts の
   * HolderListsOptions.effectiveRangeAt にそのまま渡す。frame/landing.ts の inEffectiveRangeAt。plan/design-agent-bunny.md 2.2 節）
   */
  effectiveRangeAt?: (slotIndex: number, frame: number, minRange: number) => boolean;
  /**
   * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.4 節）: 枠 slotIndex がフレーム frame に撃った 1 発の値（2 パス目と同じ
   * 関数。progress は部分チャージの発の進み）と、そのフレームの最終攻撃力。buffs は、そのフレームに効いている件を常時の値に足した合計。
   * 蓄積爆破（damage の accumulate の self）を持つ枠があれば要る（frame/plan.ts の planTeamRun が渡す）
   */
  shotValueAt?: (
    slotIndex: number,
    frame: number,
    buffs: BuffTotals,
    fullBurst: boolean,
    progress: number | undefined,
  ) => { value: number; attack: number };
};

/**
 * 蓄積爆破の爆発（plan/design-accumulate-explosion.md 2.3・2.4 節）。1 パス目が付け方と爆発のフレームを決め、2 パス目（sim/engine.ts）が
 * 溜めた発の窓 [applied + 1, end) の発の値から爆発の値を出す
 */
export type AccumulateRelease = {
  slotIndex: number;
  effect: ResolvedDamageEffect;
  /** 付けたフルチャージの発のフレーム（この発は溜めない。C-0903） */
  applied: number;
  /** 溜めた発の窓の終わり（含まない）。最大量に届いたら届いた発の次のフレーム、届かなければ切れたフレーム */
  end: number;
  /** 爆発のヒットのフレーム（届いた発の capDelayFrames 後か、切れたフレーム） */
  frame: number;
  /** 最大量に届いたか（届かなければ、切れる時に射手の 1 ヒットぶんのゲージを溜めた。C-0430） */
  capped: boolean;
  /** 最大量（付いたフレーム（付けた発の applyDelayFrames 後）の最終攻撃力 × 倍率 × (1 + 分配ダメージ▲)。爆発のヒットの上限） */
  cap: number;
  /** 1 パス目の溜めた値（2 パス目の値と突き合わせる。テスト用） */
  stored: number;
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
   * 持続ダメージで溜めたゲージ（発生順）。apply は付けたとき（発火のフレーム）、tick は予約した tick のフレーム。テスト用
   */
  dotGauges: { slotIndex: number; kind: 'apply' | 'tick'; frame: number; energy: number }[];
  /**
   * 発と、射撃ごとの倍率ダメージのヒットで溜めたゲージ（予約した順）。shotFrame は発射、frame は着弾（飛ぶ時間を足したフレーム）。
   * フルバーストの終わりを跨ぐ発の照合用（plan/design-anis-star-gauge-timing.md 3.5 節）
   */
  shotGauges: { slotIndex: number; shotFrame: number; frame: number; energy: number }[];
  /**
   * 周期のゲージ（burstGaugeHit）で溜めたゲージ（予約した順。V-0483）。fireFrame は発火、frame は足すフレーム（発火 +
   * delayFrames）。照合用
   */
  timerGauges: { slotIndex: number; fireFrame: number; frame: number; energy: number }[];
  /**
   * 召喚の攻撃（damage のきっかけ { summon }）の発火のフレーム（発生順。plan/design-ein-near-feather.md 1.3 節）。
   * 1 パス目が機数と進みを追って決め、2 パス目（frame/plan.ts の planSkillHits）がこの列で倍率ダメージを出す
   */
  summonHits: { slotIndex: number; summon: SummonId; frame: number }[];
  /** 蓄積爆破の爆発（発生順）。2 パス目（frame/plan.ts の planSkillHits）がこの列で爆発のヒットを出す */
  accumulateReleases: AccumulateRelease[];
  /**
   * クールタイムを縮める状態（中身の skillCooldownDown）が編成にある時の、
   * 枠 × スロットのクールタイムの印（cooldown）のある周期の発火のフレーム（昇順。
   * plan/design-arcana-magician.md 2.1 節）。2 パス目（frame/plan.ts の planSkillHits）が、
   * 印のある周期の damage をこの列で出す。縮める状態の無い編成では空（静的な周期のまま）
   */
  cooldownTimerFires: { slotIndex: number; skill: SkillSlot; frames: number[] }[];
  /**
   * 件の一覧の履歴（plan/design-holder-effects.md 2.9 節）。planTeamRun が区間を作る
   * （skills/holders/history.ts の buffTimelineOf）
   */
  history: HolderHistory;
};

type InstantSource = {
  sourceSlotIndex: number;
  effect: ResolvedInstantEffect;
  fires: TriggerTracker;
};

/**
 * 弾丸チャージの端数（C-0558）。トーブの代用弾丸（最大装弾数 × 5.31%）が、最大装弾数 60〜64 で 3 発、66 で 4 発入る（録画 0467・0468）。
 * 録画 0019 のノワール（14 × 39.88% = 5.58）は満タンに近く、切り捨て・四捨五入のどちらでも 14 になった
 */
export const AMMO_REFILL_ROUNDING: 'floor' | 'round' = 'round';

function refillRounds(maxAmmo: number, ratio: number): number {
  const raw = maxAmmo * ratio;
  return AMMO_REFILL_ROUNDING === 'floor' ? Math.floor(raw + 1e-9) : Math.round(raw);
}

/**
 * V-0605: 枠の撃たない区間。untargetable は区間の始まりが狙えない窓の始まりか（そのときだけ窓の始まりの D を待ち、部分チャージの発を撃つ。
 * holdFire の区間は待たずにハイドする。plan/design-hide-reload-detect.md 案 A）
 */
type SlotBlock = FrameRange & { untargetable: boolean };

/**
 * V-0605: 枠ごとの撃たない区間。狙えない窓に枠の holdFire を合わせて 1 つにする（同じフレームに始まれば狙えない窓の側）。
 * holdFire の無い枠は、狙えない窓の列を共有する
 */
function slotBlockRanges(
  slotCount: number,
  untargetable: readonly FrameRange[],
  holdFire: readonly HoldFire[] | undefined,
): (readonly SlotBlock[])[] {
  const shared: SlotBlock[] = untargetable.map((r) => ({ start: r.start, end: r.end, untargetable: true }));
  return Array.from({ length: slotCount }, (_, i) => {
    const holds = (holdFire ?? []).filter((h) => h.slotIndex === i).flatMap((h) => h.ranges);
    if (holds.length === 0) return shared;
    const all = [...shared, ...holds.map((r) => ({ start: r.start, end: r.end, untargetable: false }))];
    return unionRanges(all.sort((a, b) => a.start - b.start || Number(b.untargetable) - Number(a.untargetable)));
  });
}

/** 回し直しの上限（plan/design-explosive-round-lead.md 5.2 節。ふつうは 2 回で揃う） */
const MAX_LEAD_PASSES = 4;

/** 撃ち切りで終わる使用武器の変更を、最後の発から何フレーム後に終えるか（ShotLog.weaponChangeEnds） */
const WEAPON_CHANGE_END_DELAY = 1;

/**
 * 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節の案 1）: leadFrames のある付与が発火したら、その発のフレームを
 * 渡して回し直し、発 − leadFrames のフレームから件を見せる。発のフレームが渡したものと同じになるまで回す（揃わなければ例外）
 */
export function runFirstPass(slots: readonly TimelineSlot[], options: FirstPassOptions): FirstPassResult {
  return settleLeadShots((known) => runFirstPassOnce(slots, options, known));
}

/** runFirstPass の回し直し。1 回分（runOnce）を受け取るのは、揃わないときの例外をテストで確かめるため */
export function settleLeadShots<T>(runOnce: (known: LeadShots) => { result: T | null; leadShots: LeadShots }): T {
  let known: LeadShots = {};
  for (let pass = 1; ; pass++) {
    const { result, leadShots } = runOnce(known);
    if (result !== null) return result;
    if (pass >= MAX_LEAD_PASSES) {
      throw new Error(`the shots of the grants with leadFrames did not settle in ${MAX_LEAD_PASSES} passes`);
    }
    known = leadShots;
  }
}

/**
 * 1 回分。この回の leadFrames の付与の発が渡したもの（known）と違えば、結果を作らずに（result: null）この回の発だけ返す。どちらも
 * HolderLists.leadShots が作る形（鍵は付与の順、発は昇順）なので、JSON の文字列で比べる
 */
function runFirstPassOnce(
  slots: readonly TimelineSlot[],
  options: FirstPassOptions,
  known: LeadShots,
): { result: FirstPassResult | null; leadShots: LeadShots } {
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
  if (options.noBurstSlots !== undefined && !options.burst) throw new RangeError('noBurstSlots needs burst');
  if (options.burst) {
    if (burstModel === 'fixed') {
      if (options.manualBursts !== undefined) throw new RangeError('manualBursts needs the dynamic burst model');
      if (options.noBurstSlots !== undefined) throw new RangeError('noBurstSlots needs the dynamic burst model');
      fixed = planFixedCycle(
        slots.map((s) => (s === null ? null : burstCandidateOf(s.character, s.definition))),
        frames,
      );
    } else {
      controller = initialBurstController(
        slots.map((s, i) =>
          s === null || options.noBurstSlots?.includes(i) === true ? null : burstUnitOf(s.character, s.definition),
        ),
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
  /** 発火の文脈 context のとき、効果 e が掛かる枠（burstUsers は発火ごとに変わる） */
  const targetsAt = (e: Parameters<typeof isEffectTarget>[0], sourceSlotIndex: number, context: FireContext) =>
    slots.flatMap((t, i) => (t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character, context) ? [i] : []));
  // F5（plan/design-heal-vocabulary.md 3.3 節）: 時間の周期のトリガー（heal だけ書ける）は出来事の列に無いので、
  // 周期のフレーム（atStart ならフレーム 0 も。skills/timeline.ts の triggerFires）で発火する
  // 状態の付いた時から数える周期（since。currentHpDown。plan/design-hp-down-interval.md 2.1 節）は、件の一覧の sinceFires
  // （counterChange と同じ数え方）で決める
  const instantTracker = (effect: { trigger: ResolvedTrigger }, sourceSlotIndex: number): TriggerTracker => {
    // 「〈状態〉が適用された時」は、件の一覧がそのフレームに付けた記録で見る（件を
    // 登録した後に読む。即時効果のループは lists.registerFrame の後。plan/design-mint-prika.md 2.6 節）
    if (isResolvedApplied(effect.trigger)) {
      const state = effect.trigger.applied;
      return (ev) => lists.appliedAt(sourceSlotIndex, state, ev.frame);
    }
    // 「〈状態〉が終了した時」（ammoDecrease）は件の一覧の endedAt で決める（plan/design-grave.md 2.1 節）
    const trigger = effect.trigger;
    if (isEndedTrigger(trigger)) return (ev) => lists.endedAt(sourceSlotIndex, trigger.ended, ev.frame);
    if (!isResolvedTimer(effect.trigger)) return createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel);
    // 件の一覧（lists）は即時効果の後に作るので、最初の呼び出しで作る
    if (effect.trigger.since !== undefined) {
      const trigger = effect.trigger;
      let fires: TriggerTracker | undefined;
      return (ev) => (fires ??= lists.sinceFires(trigger, sourceSlotIndex))(ev);
    }
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
  // 遮蔽物 HP 回復（plan/design-skill-stage17.md 2.1 節）。受けた枠に coverHealed の出来事を、回復と同じフレームの
  // 規則（healFrameOf）で立てる。回復量は計算に効かないので、件も記録も作らない
  // 対象の枠は編成だけで決まるので、始めに 1 回求めておく
  const coverHeals: {
    sourceSlotIndex: number;
    effect: ResolvedCoverHeal;
    fires: TriggerTracker;
    targets: readonly number[];
  }[] = [];
  // 遮蔽物 HP が最も低い味方 N 機は、編成が N 体以下なら全員、N 体より多ければ
  // 選び方を確かめていないので誰も選ばない（未実装。plan/design-skill-stage17.md 2.1 節の論点 3）
  const present = slots.flatMap((s, i) => (s === null ? [] : [i]));
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCoverHeals(slot.definition, slot.character, slot.levels)) {
      const targets =
        effect.target === 'lowestCoverHp'
          ? present.length <= effect.targetCount!
            ? present
            : []
          : targetsAt({ ...effect, target: effect.target }, sourceSlotIndex, null);
      coverHeals.push({ sourceSlotIndex, effect, fires: instantTracker(effect, sourceSlotIndex), targets });
    }
  });
  // 回復は healed の出来事を作るので先に当てる（heal のトリガーに healed は書けないので順番で閉じる。plan/design-stage11.md 3.3 節）
  // V-0024: 維持時間のある heal は、件の付いている対象への付き直しでは healed を起こさない（件の一覧の吸収回復の件。applyHeal）
  const heals = instant.filter((src) => src.effect.kind === 'heal');
  // V-0034: 射撃の回数トリガーのバーストゲージのチャージは、発と同じフレームのゲージに足す（手順 2 の前。下のループ）
  const isShotGaugeCharge = (src: InstantSource): boolean =>
    src.effect.kind === 'burstGauge' && isResolvedShotCount(src.effect.trigger);
  const shotGaugeCharges = instant.filter(isShotGaugeCharge);
  // バースト使用時のフルバーストタイムの延長（D）は、状態機械が発動の時に聞く
  // （extensionAtActivation。件の一覧が窓の終わりを読む前に足す。plan/design-skill-stage21.md 2.1 節）ので、下の即時効果のループでは扱わない
  const isActivationExtension = (src: InstantSource): boolean =>
    src.effect.kind === 'fullBurstExtend' && src.effect.trigger === 'burstUse';
  const activationExtensions = instant.filter(isActivationExtension);
  const otherInstants = instant.filter(
    (src) => src.effect.kind !== 'heal' && !isShotGaugeCharge(src) && !isActivationExtension(src),
  );
  const logs: (ShotLog | null)[] = slots.map((slot) =>
    slot === null
      ? null
      : {
          frames: [],
          fullCharge: firesChargeShots(slot.definition, slot.character),
          lastShotFrames: [],
          hits: [],
          coreHits: [],
          critHits: [],
          pelletHits: [],
        },
  );
  // リロードの込め終わりは、それで終わる効果（durationUntil: reloadEnd。対象は自分）か、それで発火する解除
  // （{ reloadEnd }）を持つ枠だけが書く
  const writesReloadEnds = slots.map((slot) => slot?.definition != null && hasReloadEndEffect(slot.definition));
  // 溜めのきっかけ（{ chargeTick }・{ chargeFull }）を持つ枠だけ、溜めを追い、
  // 周期と満ちたフレームを射撃の記録に書く（流し直しも、このフレームの出来事も同じ列を読む。
  // plan/design-skill-stage14.md 2.1・2.6 節）。ticks の k はいまの溜めで発火した周期の数、
  // nextAt は k + 1 回目の周期の溜めの進み、fullDone はいまの溜めで満ちた時が発火したか（{ chargeFull } を持つ枠だけ chargeFullFrames を書く）
  const chargeWatches = slots.map((slot, i) => {
    if (slot?.definition == null) return null;
    const { tickSeconds, full } = chargeTriggersOf(slot.definition);
    if (tickSeconds.length === 0 && !full) return null;
    const log = logs[i]!;
    const ticks = tickSeconds.map((everySeconds) => {
      const entry = { everySeconds, frames: [] as number[] };
      (log.chargeTicks ??= []).push(entry);
      return { entry, k: 0, nextAt: gameSecondsToFrames(everySeconds) };
    });
    if (full) log.chargeFullFrames = [];
    return { ticks, fullDone: false };
  });
  /** 溜めを数え直す（撃った・溜めていないフレーム） */
  const restartCharge = (w: NonNullable<(typeof chargeWatches)[number]>): void => {
    for (const t of w.ticks) {
      if (t.k === 0) continue;
      t.k = 0;
      t.nextAt = gameSecondsToFrames(t.entry.everySeconds);
    }
    w.fullDone = false;
  };
  /**
   * 枠 i のフレーム f の溜め。progress は撃つ前の溜めの進み（chargeProgressFrames。溜めていなければ null）、shot は
   * このフレームに撃ったか（fullShot はフルチャージの発か）。撃ったフレームは周期を出さずに数え直し、満ちた時がまだならフルチャージの発の
   * フレームに出す（チャージ時間が縮んで満ちたフレームを飛ばした発も、その発に乗る）
   */
  const watchCharge = (
    i: number,
    f: number,
    progress: number | null,
    shot: boolean,
    fullShot: boolean,
    chargeFrames: number,
  ): void => {
    const w = chargeWatches[i]!;
    const log = logs[i]!;
    const charging = !shot && progress !== null && progress > 0;
    if (charging) {
      for (const t of w.ticks) {
        if (progress < t.nextAt) continue;
        // k + 1 回目の周期は溜め始めの floor((k + 1) × 間隔 ÷ 0.017) フレーム後（端数を持ち越す）。溜めが跳んでも 1 フレームに 1 回
        do {
          t.k += 1;
          t.nextAt = gameSecondsToFrames((t.k + 1) * t.entry.everySeconds);
        } while (progress >= t.nextAt);
        t.entry.frames.push(f);
      }
    }
    const full = shot ? fullShot : charging && progress >= chargeFrames;
    if (full && !w.fullDone && log.chargeFullFrames !== undefined) {
      w.fullDone = true;
      log.chargeFullFrames.push(f);
    }
    if (!charging) restartCharge(w);
  };
  // 持ち主ごとの件の一覧（plan/design-holder-effects.md 2 節）。スキルの効果をすべて、受ける枠ごとの件の列で持つ
  const lists = createHolderLists(slots, {
    frames,
    scheduleModel,
    logs,
    fullBurstWindows: windowsOf,
    verifyItems: options.verifyItems,
    leadShots: known,
    ...(options.effectiveRangeAt === undefined ? {} : { effectiveRangeAt: options.effectiveRangeAt }),
  });
  const trackEvents = lists.hasSources || instant.length > 0;
  // 戦闘開始時の件と周期のトリガーの atStart は、ループの前に登録する（1 発目のマガジンから効く）
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
  /** 使用武器の変更中の射手の状態と、その武器の識別子（変更していなければ null） */
  const changedShooters: (ShooterState | null)[] = slots.map(() => null);
  const activeWeapon: (string | null)[] = slots.map(() => null);
  /**
   * 撃ち切りで終わった使用武器の変更の、最後の発の本当の発の時刻の、そのフレームからのずれ（変更後の武器の発射レートの蓄積の余りから。
   * 撃ち切りの残弾数減少のリロードの始まりに使う。plan/design-reload-rounding.md 案 F）
   */
  const weaponChangeEndOffset: number[] = slots.map(() => 0);
  // plan/design-anis-star-gauge-timing.md 3 節: 枠 i がフレーム f に撃った発の飛ぶ時間（ゲージはその後のフレームに溜まる）
  const flights = slots.map((_, i) => options.flights?.[i] ?? null);
  const shotFlightAt = (i: number, f: number): number => flightFramesAt(flights[i]?.shot, f);
  const shotEvents: (ShotEvent | null)[] = slots.map(() => null);
  const layerBase: FirstPassBase = {
    slots,
    options,
    frames,
    passive,
    lists,
    logs,
    controlledSlot,
    flights,
    shotFlightAt,
    shotEvents,
    activationsOf,
    windowsOf,
  };
  const gaugeLayer = createGauge({ ...layerBase });
  const {
    chargeGaugeOf,
    energyAt,
    gaugeHitsOf,
    hitsAt,
    obstacleEnergyAt,
    obstacles,
    pelletsAt,
    shotCounts,
    updateTimedGaugeSpeed,
  } = gaugeLayer;
  /**
   * フレーム f に始まった枠 i の使用武器変更（識別子
   * `<resourceId>.<スロット>.<効果の番号>`）の最初の発を撃つフレーム
   * （plan/design-eunhwa-tu-burst-shot-timing.md 4 節）。窓を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）の
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
  /**
   * フレーム f に始まった枠 i の使用武器変更の最初の発のフレーム（plan/design-red-hood.md 7.1 節の論点 13。V-0639）。
   * 持ち替えは、変更を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）がフルバーストに入るなら窓の始まり、ほかは f。持ち替えの時の
   * 基礎の武器が、リロード中ならそのまま、構え解除の途中（最後の発から aimOutFrames 未満）なら構え解除の終わりから after を数え、
   * 構え直し・チャージの途中（まだ撃っていない枠も）なら構え解除 1 回分を足す
   */
  const firstShotAfterSwap = (i: number, f: number, after: number): number => {
    const opened = activationsOf().findLast((a) => a.slotIndex === i && effectFrameOf(a) <= f);
    const swap = opened?.startsFullBurst ? Math.max(f, hexagonFrameOf(opened)) : f;
    return weaponFreeFrameAtSwap(shooters[i]!, logs[i]?.frames.at(-1), swap, model) + after;
  };
  const gaugeEffectsLayer = createGaugeEffects({ ...layerBase, ...gaugeLayer });
  const {
    addAllyGauge,
    addShotGauges,
    cooldownTrackers,
    countCooldownTimers,
    countCycles,
    countDamageHitGauges,
    cycleGaugeHits,
    dotGauges,
    landingGauge,
    reserveBurstUseDotTicks,
    reserveTimerGauges,
    shotGauges,
    takeReservedGauge,
    timerGauges,
    trackDotBurstUse,
  } = gaugeEffectsLayer;
  // V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717・C-0718）: 射撃の止まり（shotPause）。射撃を数えて、発火した射撃の次のフレームから
  // 止めるフレーム数のあいだ射手を進めない（pauseLeft。手順 1 で減らす）。発火した射撃がマガジンの最後の弾丸なら framesOnLastShot
  // 回数の間隔の変更（cycleEvery の shotCounts）の窓の中は、通算の回数が窓の
  // 間隔の倍数に届いた発で止める（C-0727。plan/design-skill-stage12.md 2.4 節）。
  // 窓の件はこのフレームに付いたものも見るので、段の循環と同じく手順 3 の後に数える（countShotPauses）
  const shotPauseTrackers: {
    slotIndex: number;
    everyAt: ShotCountEveryAt | undefined;
    count: ShotCountKind;
    every: number;
    frames: number;
    framesOnLastShot: number;
    n: number;
  }[] = [];
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    for (const t of resolveShotPauses(slot.definition, slot.character, slot.levels)) {
      if (t.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
      const { skill, ...rest } = t;
      shotPauseTrackers.push({ slotIndex: i, ...rest, everyAt: lists.shotCountEveryOf(i, skill), n: 0 });
    }
  });
  const pauseLeft = slots.map(() => 0);
  // 自分のバーストの発動の次のフレームから止めるフレーム数（手順 3 で立てる）
  // 立っている止まりの、明けで構え直すときに unhideShooter に渡す止めたフレーム数（0 は立っていない。
  // 射撃の回数の止まりと区別する。plan/design-privaty-burst-pause.md 2 節）
  const burstPauseAim = slots.map(() => 0);
  const burstUsePause = slots.map((slot) =>
    slot === null || slot.definition === null ? 0 : resolveBurstUsePause(slot.definition),
  );
  // 状態が付いた時の止まり（気絶。plan/design-maids.md 2.2 節）。手順 1 で、前のフレームに無かった状態が付いていれば立て、
  // 明けまでバーストの候補からも外す（論点 2）。明けは、バーストの発動の止まりと同じく構え直す
  const appliedPauses = slots.map((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveAppliedPauses(slot.definition).map((p) => ({ ...p, was: false })),
  );
  const accumulateLayer = createAccumulate({ ...layerBase, ...gaugeLayer, ...gaugeEffectsLayer });
  const { accumulateReleases, addAccumulatedGauge, recordAccumulatorShots } = accumulateLayer;
  const summonsLayer = createSummons({ ...layerBase, ...gaugeLayer, ...gaugeEffectsLayer, ...accumulateLayer });
  const { countSummons, summonHits } = summonsLayer;
  /** 先のフレームに効果が発火するバーストの発動（フレーム → 発動） */
  const pendingBurstEffects = new Map<number, BurstActivation[]>();
  /** 先のフレームのバーストのヒット（トリガー burstHit。plan/design-elegg.md 8.9 節） */
  const pendingBurstHits = new Map<number, BurstActivation[]>();
  /** 先のフレームの段階のきっかけ（stageEnterFrameOf。段階 3 は替わり目） */
  const pendingStageEntries = new Map<number, BurstStepKey[]>();

  /**
   * V-0534: 射撃の止まり。このフレームの射撃で発火したら、次のフレームから止める。回数の間隔の変更の窓を
   * このフレームに付いたものも見るので、手順 3 の後に呼ぶ（止まりは次のフレームからなので、数える位置で射撃は変わらない）
   */
  const countShotPauses = (f: number): void => {
    for (const t of shotPauseTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.everyAt?.(f) ?? t.every);
      t.n = counted.count;
      if (counted.fired) pauseLeft[t.slotIndex] = shot.lastShot ? t.framesOnLastShot : t.frames;
    }
  };

  let nextActivation = 0;
  let nextWindowStart = 0;
  let nextWindowEnd = 0;
  let gaugeFullSeen = 0;
  // T4 の▼ の件を持ちうる枠の、最後の発動（発動の後に付いた▼ の縮めた長さを足す先）
  const lastActivationOf = new Map<number, BurstActivation>();

  const instants: InstantApplication[] = [];
  // 戦闘中の発火の回数に上限（maxFires）のある即時効果の、効いた発火の回数（plan/design-red-hood.md 2.3 節）
  const instantFireCounts = new Map<object, number>();
  // まだ窓に足していない延長（予約）の記録。窓を作ったら残し、窓を作らずにチェーンが切れたら（状態機械が予約を捨てる）か
  // 戦闘の終わりまで残ったら、即時効果の記録から外す（効かなかった延長を画面と trace に出さない）
  let pendingExtensions: InstantApplication[] = [];
  const discardedExtensions = new Set<InstantApplication>();
  const reserveExtension = (x: InstantApplication): void => {
    instants.push(x);
    pendingExtensions.push(x);
  };
  // バースト使用時の延長は、発動のたびに状態機械が聞く（条件は発動のフレームの件で見る。窓を作る発動ならその窓に、
  // 作らない発動なら次の窓に足す）
  if (controller !== null && activationExtensions.length > 0) {
    controller.extensionAtActivation = (slotIndex, frame) => {
      let seconds = 0;
      for (const src of activationExtensions) {
        if (src.sourceSlotIndex !== slotIndex) continue;
        if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, frame)) continue;
        seconds += src.effect.value;
        reserveExtension({
          frame,
          sourceSlotIndex: slotIndex,
          slotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
      }
      return seconds;
    };
  }
  /** 次のフレーム以降に起きる回復（射撃の回数起点）。フレーム → 受ける枠 */
  const pendingHeals = new Map<
    number,
    { sourceSlotIndex: number; slotIndex: number; effect: ResolvedInstantEffect }[]
  >();
  /** 次のフレーム以降にゲージへ足すチャージ（射撃の回数トリガーでない burstGauge）。フレーム → 効果 */
  const pendingGaugeCharges = new Map<number, { sourceSlotIndex: number; effect: ResolvedInstantEffect }[]>();
  /** このフレームに回復を受けた枠（FrameEvents.healed）。毎フレーム作らずに使い回す */
  const healed: boolean[] = slots.map(() => false);
  let healedDirty = false;
  /** 次のフレーム以降に遮蔽物 HP 回復を受ける枠（射撃の回数起点で、撃った枠と同じか前の枠）。フレーム → 受ける枠 */
  const pendingCoverHeals = new Map<number, number[]>();
  /** このフレームに遮蔽物 HP 回復を受けた枠（FrameEvents.coverHealed）。healed と同じく使い回す */
  const coverHealed: boolean[] = slots.map(() => false);
  let coverHealedDirty = false;

  /** いま見ている（または次に来る）狙えない窓の添字 */
  let nextBlock = 0;
  // V-0605: 枠ごとの撃たない区間（狙えない窓と、その枠の holdFire を合わせたもの）と、いま見ている区間の添字
  const slotBlocks = slotBlockRanges(slots.length, untargetable, options.holdFire);
  const slotNextBlock = slots.map(() => 0);

  for (let f = 0; f < frames; f++) {
    // 狙えない窓（バーストの制御が見る。射手のハイドは枠ごとの slotBlocks で、下の射手の中）
    while (nextBlock < untargetable.length && untargetable[nextBlock]!.end < f) nextBlock += 1;
    const block = untargetable[nextBlock];
    const blocked = block !== undefined && block.start <= f && f < block.end;
    // 時間で変わるゲージ速度の枠の、このフレームの (1 + 速度)（f − 1 までに付いた件）と、その速度の周期のゲージ
    updateTimedGaugeSpeed(f);
    reserveTimerGauges(f);
    // 1. 射手（V-0030: 前のフレームまでに予約した段のヒットのゲージも、このフレームのゲージに入れる）
    let gauge = takeReservedGauge(f);
    gauge = addAccumulatedGauge(gauge, f);
    slots.forEach((slot, i) => {
      shotEvents[i] = null;
      if (slot === null || !shooters[i]) return;
      const params = paramsAt(i, f);
      // 使用武器の変更。始まったら変更後の武器を新しい状態で撃ち、終わったら基礎の武器の状態に戻す
      const weaponId = params.weapon?.id ?? null;
      if (weaponId !== activeWeapon[i]) {
        activeWeapon[i] = weaponId;
        if (params.weapon !== null) {
          changedShooters[i] = weaponChangeShooter(params.weapon.shot, model, params);
          const firstHit = weaponChangeFirstHitAt(i, params.weapon.id, f);
          if (firstHit !== null) changedShooters[i]!.wait = Math.max(0, firstHit - f);
          // 定義の即値の待ち（録画で読む。plan/design-skill-stage11.md 2.1 節）
          else if (params.weapon.firstShotDelayFrames !== undefined) {
            changedShooters[i]!.wait = params.weapon.firstShotDelayFrames;
          }
          // 持ち替え（フルバーストに入る発動なら窓の始まり）の時の
          // 基礎の武器の状態で、最初の発を決める（plan/design-red-hood.md 7.1 節の論点 13。V-0639）
          else if (params.weapon.firstShotAfterSwapFrames !== undefined) {
            const first = firstShotAfterSwap(i, f, params.weapon.firstShotAfterSwapFrames);
            changedShooters[i]!.wait = Math.max(0, first - f);
          }
        } else {
          changedShooters[i] = null;
          resumeShooter(shooters[i]!, slot.character.shot, model, params);
        }
      }
      const state = params.weapon !== null ? changedShooters[i]! : shooters[i]!;
      const shot = params.weapon?.shot ?? slot.character.shot;
      // 枠の撃たない区間。入るフレームで hide、明けるフレームで unhide（どちらも射手を進める前）
      const own = slotBlocks[i]!;
      let k = slotNextBlock[i]!;
      while (k < own.length && own[k]!.end < f) k += 1;
      slotNextBlock[i] = k;
      const ownBlock = own[k];
      const slotBlocked = ownBlock !== undefined && ownBlock.start <= f && f < ownBlock.end;
      const slotHideNow = slotBlocked && ownBlock.start === f;
      // 狙えない窓（plan/design-hide-reload-detect.md 案 A）: 入るフレームにチャージが満ちていればふだんの刻みの時刻に撃って
      // ハイドし（同 11 節）、ほかの枠は D まで待つ（チャージの途中なら D の H 後に部分チャージで撃つ）。holdFire の区間は待たずにハイドする（V-0605）
      let windowShot: number | null = null;
      if (slotHideNow && ownBlock.untargetable) windowShot = beginHide(state, shot, model, params);
      else if (slotHideNow) hideShooter(state, shot, model, params);
      else if (slotBlocked) windowShot = stepHide(state, shot, model, params);
      const partial = windowShot;
      if (state.hideReloadStartIn !== undefined) {
        (logs[i]!.hideReloadStarts ??= []).push(f + state.hideReloadStartIn);
        delete state.hideReloadStartIn;
      }
      if (ownBlock !== undefined && ownBlock.end === f)
        unhideShooter(state, shot, ownBlock.end - ownBlock.start, model, params);
      for (const p of appliedPauses[i]!) {
        const on = lists.selfStateAt(i, p.state, f);
        if (on && !p.was) {
          pauseLeft[i] = Math.max(pauseLeft[i]!, p.frames);
          burstPauseAim[i] = p.frames;
          if (controller !== null) stunSlot(controller, i, f + p.frames);
        }
        p.was = on;
      }
      // V-0534: 射撃の止まりの間は射手を進めない（撃たず、待ち・リロードも進めない）
      if (pauseLeft[i]! > 0) {
        pauseLeft[i]! -= 1;
        // バーストの発動の止まりの明けは、狙えない窓の明けと同じく構え直す（plan/design-privaty-burst-pause.md 3 節の論点 4）
        if (pauseLeft[i] === 0 && burstPauseAim[i]! > 0) {
          reaimShooter(state, shot, burstPauseAim[i]!, model, params);
          burstPauseAim[i] = 0;
        }
        return;
      }
      const reloading = state.phase === 'reloading';
      // 撃つ前の溜めの進み（部分チャージの進みと同じ見え方）。リロード中・狙えない窓の間は溜めていない
      const progress =
        chargeWatches[i] !== null && isChargeWeapon(shot) && !reloading && !slotBlocked
          ? chargeProgressFrames(state, params, model)
          : null;
      const fired = stepShooter(state, shot, model, params, slotBlocked);
      const log = logs[i]!;
      if (chargeWatches[i] !== null) {
        const shotNow = fired || partial !== null;
        const fullShot = shotNow && isChargeWeapon(shot) && (partial === null || partial >= 1);
        watchCharge(i, f, progress, shotNow, fullShot, params.chargeFrames);
      }
      // 基礎の武器のリロードを込め終えた（plan/design-cinderella-s1-charge.md 1.1 節）。込め終えたフレームまでが
      // 「リロード完了時に解除」の窓（件の終わりは次のフレーム）
      // 1 回分が 0 フレームのリロード（リロード速度 100% 近く）は、最終弾の発の中で込め終える
      // （shooter.ts の fire。V-0601）。フレームの始めにリロード中でなくても、最終弾を撃ってリロード中でなければ込め終えている
      if (
        writesReloadEnds[i] &&
        params.weapon === null &&
        state.phase !== 'reloading' &&
        (reloading || (fired && state.lastShot))
      )
        (log.reloadEnds ??= []).push(f + 1);
      if (!fired && partial === null) return;
      log.frames.push(f);
      if (state.lastShot) log.lastShotFrames!.push(f);
      if (params.weapon !== null) (log.weaponChangeShotFrames ??= []).push(f);
      // チャージしない変更後の武器の発は fullChargeShot に数えない。チャージ武器への変更を持つチャージしない基礎の武器の発も
      // 数えない（どちらも、発の武器がチャージ武器でない。plan/design-nayuta.md 2.6 節）
      const uncharged = log.fullCharge && !isChargeWeapon(shot);
      if (uncharged) (log.unchargedShotFrames ??= []).push(f);
      // 撃ち切りで終わる変更は、最後の弾丸を撃ったら次のフレームで基礎の武器に戻す（変更後の武器はリロードしない。
      // plan/design-true-damage-element.md 9 節の論点 8）。件の終わりも同じ列から作る（skills/holders.ts）
      if (
        params.weapon !== null &&
        state.lastShot &&
        lists.openWeaponChange(i, params.weapon.id, f + WEAPON_CHANGE_END_DELAY)
      ) {
        (log.weaponChangeEnds ??= []).push(f + WEAPON_CHANGE_END_DELAY);
        weaponChangeEndOffset[i] = reloadStartOffset(shot, model, params, state.acc, state.shotsInMagazine - 1);
      }
      const isPartial = partial !== null && partial < 1;
      if (isPartial) (log.partialShots ??= []).push({ frame: f, progress: partial });
      const { hits, coreHits } = hitsAt(i, f);
      const pelletCount = pelletsAt(i, f, shotCounts[i]!, hits);
      log.hits!.push(hits);
      log.coreHits!.push(coreHits);
      // 発のクリティカルの命中の期待値（plan/design-new-chars-1029.md 5.7 節）。会心率は基礎 + 常時の▲ +
      // 時間で変わる▲（f − 1 までに付いた件）で、通常攻撃のクリティカル確率▲も足す（上限 1）
      const critRate = capCritRate(
        slot.character.crit.rate + passiveFiring[i]!.critRate + passiveFiring[i]!.normalCritRate + lists.critUpAt(i, f),
      );
      const critHits = hits * critRate;
      log.critHits!.push(critHits);
      log.pelletHits!.push(pelletCount);
      shotEvents[i] = {
        lastShot: state.lastShot,
        fullCharge: log.fullCharge && !isPartial && !uncharged,
        hits,
        coreHits,
        critHits,
        pellets: pelletCount,
      };
      if (params.weapon !== null) shotEvents[i]!.weaponChange = true;
      shotCounts[i]! += 1;
      const shotEnergy = energyAt(i, f);
      // チャージしない変更後の武器の発には、基礎の武器のフルチャージ倍率を掛けない（変更後の武器の発のゲージは確かめていない。
      // V-0528）。ヒットの数（gaugeHitsOf）は 1 発 1 ヒットのまま
      const gainEnergy = uncharged ? shotEnergy / chargeGaugeOf(i) : shotEnergy;
      const energy =
        gainEnergy * (isPartial ? partialGaugeRatio(slot.character.shot, i === controlledSlot, partial) : 1) +
        (obstacles[i]!.get(shotCounts[i]!) ?? 0) * obstacleEnergyAt(i);
      gauge += landingGauge(i, f + shotFlightAt(i, f), f, energy, gaugeHitsOf(i, shotEnergy));
    });
    recordAccumulatorShots(f);
    gauge = addShotGauges(gauge, f);
    // バーストゲージのチャージ（最大値 × X%）。射撃の回数トリガーはこのフレームの射撃で発火し、このフレームのゲージに足す
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
    gauge = addAllyGauge(gauge, f);
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    if (controller !== null) {
      const before = controller.activations.length;
      const windowsBefore = controller.windows.length;
      const timeoutsBefore = controller.chainTimeouts.length;
      stepBurstController(controller, f, gauge, blocked);
      // 予約した延長は、窓を作ったら足され、窓を作らずにチェーンが切れたら捨てられる（burst/controller.ts の resetChain）
      if (pendingExtensions.length > 0) {
        const timedOut = controller.chainTimeouts.length > timeoutsBefore;
        if (timedOut) for (const x of pendingExtensions) discardedExtensions.add(x);
        if (timedOut || controller.windows.length > windowsBefore) pendingExtensions = [];
      }
      // バーストスキルのクールタイム▼ の維持の付いた形（T4。
      // 「その間スキル自体のクールタイムを変える」。plan/design-skill-stage11.md 3.3 節。V-0530）。
      // このフレームに発動した枠に効いている秒（f − 1 までに付いた件）だけ、その発動の
      // CT を短くする（明けるのは発動のフレームより前にしない）。常時（戦闘開始から持続の静的な状態の中身も）と時間で変わる件の和。
      // 即時の CT▼（reduceCooldown）とは別で、cooldownReductions に残さず、縮めた長さは発動の cooldownShortenedFrames に残す
      // 時間で変わる件は、発動の前のフレームに効いていた件だけ
      // （発動のフレームより後に付いた件は、下の「発動の後に付いた▼」が縮める。同じ件を 2 回数えない。plan/design-skill-stage15.md 2.2 節。V-0566）
      const shorten = (a: BurstActivation, seconds: number) => {
        const applied = shortenCooldown(controller!, a.slotIndex, gameSecondsToFrames(seconds), f);
        if (applied > 0) a.cooldownShortenedFrames = (a.cooldownShortenedFrames ?? 0) + applied;
      };
      for (let i = before; i < controller.activations.length; i++) {
        const a = controller.activations[i]!;
        const seconds = (passive[a.slotIndex]?.buffs.burstCooldown ?? 0) + lists.burstCooldownAt(a.slotIndex, f - 1);
        if (seconds > 0) shorten(a, seconds);
        if (lists.hasBurstCooldownTracks(a.slotIndex)) lastActivationOf.set(a.slotIndex, a);
      }
      // 発動の後に付いた T4 の▼（ティアの S1 のように、同じ発動から付いたものも）は、走っている CT をその場で
      // 縮める（V-0566。単騎のティアの発動の間隔が 40 秒より短い）。前のフレームに始まった件を、そのフレームより前に発動した CT に当てる
      // （このフレームに発動した枠は、上の発動の前のフレームの件で数えた）
      for (const last of lastActivationOf.values()) {
        if (last.frame >= f || controller.cooldownEnd[last.slotIndex]! <= f) continue;
        const seconds = lists.burstCooldownStartedAt(last.slotIndex, f - 1);
        if (seconds > 0) shorten(last, seconds);
      }
    }
    // 2b. V-0030: 段の循環の射撃は、手順 3 の後に数える（countCycles）
    if (!trackEvents && !trackDotBurstUse) {
      countCycles(f);
      countShotPauses(f);
      countDamageHitGauges(f);
      countCooldownTimers(f);
      countSummons(f);
      continue;
    }

    // 3. 出来事 → 射撃に効く窓の登録 → 即時効果
    const activations = activationsOf();
    const now: BurstActivation[] = [];
    while (nextActivation < activations.length && activations[nextActivation]!.frame <= f) {
      if (activations[nextActivation]!.frame === f) now.push(activations[nextActivation]!);
      nextActivation += 1;
    }
    // 効果の発火は発動 + 遅れのフレーム。先のフレームなら積んでおく（遅れの無いキャラはこのフレーム）
    const burstEffects: BurstActivation[] = pendingBurstEffects.get(f) ?? [];
    if (burstEffects.length > 0) pendingBurstEffects.delete(f);
    for (const a of now) {
      const pause = burstUsePause[a.slotIndex]!;
      if (pause > 0) {
        pauseLeft[a.slotIndex] = Math.max(pauseLeft[a.slotIndex]!, pause);
        burstPauseAim[a.slotIndex] = pause;
      }
      const at = effectFrameOf(a);
      if (at === f) burstEffects.push(a);
      else if (at < frames) pendingBurstEffects.set(at, [...(pendingBurstEffects.get(at) ?? []), a]);
    }
    // ヒットのフレームも同じに積む（遅れの無いキャラは本当の発動か、III なら 00.00。hitFrameOf）
    for (const a of now) {
      const at = hitFrameOf(a);
      if (at < frames) pendingBurstHits.set(at, [...(pendingBurstHits.get(at) ?? []), a]);
    }
    const burstHits = pendingBurstHits.get(f);
    if (burstHits !== undefined) pendingBurstHits.delete(f);
    for (const a of now) {
      if (a.enteredStep === null) continue;
      const at = stageEnterFrameOf(a, burstModel);
      if (at < frames) pendingStageEntries.set(at, [...(pendingStageEntries.get(at) ?? []), a.enteredStep]);
    }
    const stageEntries = pendingStageEntries.get(f);
    if (stageEntries !== undefined) pendingStageEntries.delete(f);
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
    // このフレームにフルスタックになった状態を消費する（回復のきっかけ { fullStack }。plan/design-skill-stage3.md 1.3 節）。
    // フルスタックになる件は、射撃の回数のきっかけの付与なので前のフレームまでに登録済み
    const fullStacks = lists.consumeFullStacks(f);
    // このフレームに使用武器の変更（撃ち切り）が終わった枠（plan/design-skill-stage11.md 2.2.1 節）
    const weaponChangeEnds = logs.flatMap((log, i) => (log?.weaponChangeEnds?.at(-1) === f ? [i] : []));
    // このフレームがリロードの込め終わりの次のフレームの枠（plan/design-skill-stage16.md 2.2 節）
    const reloadEnds = logs.flatMap((log, i) => (log?.reloadEnds?.at(-1) === f ? [i] : []));
    // このフレームの溜めの周期と満ちた時（手順 1 の射手が射撃の記録に書いた）
    const chargeTicks = logs.flatMap(
      (log, i) =>
        log?.chargeTicks?.flatMap((t) =>
          t.frames.at(-1) === f ? [{ slotIndex: i, everySeconds: t.everySeconds }] : [],
        ) ?? [],
    );
    const chargeFulls = logs.flatMap((log, i) => (log?.chargeFullFrames?.at(-1) === f ? [i] : []));
    // このフレームに遮蔽物 HP 回復を受けた枠（前のフレームの射撃で起きたものから。このフレームの分は下で足す）
    if (coverHealedDirty) {
      coverHealed.fill(false);
      coverHealedDirty = false;
    }
    const dueCover = pendingCoverHeals.size > 0 ? pendingCoverHeals.get(f) : undefined;
    if (dueCover !== undefined) {
      for (const i of dueCover) coverHealed[i] = true;
      coverHealedDirty = true;
      pendingCoverHeals.delete(f);
    }
    const ev: FrameEvents = {
      frame: f,
      shots: shotEvents,
      activations: now,
      burstEffects,
      ...(burstHits !== undefined ? { burstHits } : {}),
      fullBurstStart,
      fullBurstEnd,
      gaugeFull,
      fullBurstStartUsers,
      fullBurstEndUsers,
      healed,
      ...(fullStacks.length > 0 ? { fullStacks } : {}),
      ...(weaponChangeEnds.length > 0 ? { weaponChangeEnds } : {}),
      ...(reloadEnds.length > 0 ? { reloadEnds } : {}),
      ...(coverHeals.length > 0 ? { coverHealed } : {}),
      ...(chargeTicks.length > 0 ? { chargeTicks } : {}),
      ...(chargeFulls.length > 0 ? { chargeFulls } : {}),
      ...(stageEntries !== undefined ? { stageEntries } : {}),
    };
    reserveBurstUseDotTicks(f, burstEffects);

    // 回復を先に当てる。射撃の回数起点は、撃った枠より後ろの枠にはこのフレーム、ほかの枠には次のフレームに送り（V-0490）、
    // それ以外はこのフレームの healed に立てる。対象の順位（topAttack）は、このフレームの件を登録する前に出す（回復を受けた時の
    // 攻撃力▲を含め、このフレームに付く窓は入れない。plan/design-heal-top-attack.md 2 節の A）
    for (const src of heals) {
      if (!src.fires(ev)) continue;
      // 発火の条件（自分の状態。plan/design-mint-prika.md 2.7 節）。回復は件の登録の前に当てる（healed のきっかけが読む）ので、
      // このフレームの件の登録より前に見る（同じフレームに付いた状態は見えない。ミントのダンスはバーストで付き、条件を読むフルチャージは後の発）
      if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, f)) continue;
      const context = lists.rankContext(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
        const at = healFrameOf(src.effect, f, src.sourceSlotIndex, target);
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

    // 遮蔽物 HP 回復も回復と同じく件の登録の前に当てる（同じフレームの { coverHealed } の timed が読む）
    for (const src of coverHeals) {
      if (!src.fires(ev)) continue;
      for (const target of src.targets) {
        const at = healFrameOf(src.effect, f, src.sourceSlotIndex, target);
        if (at === f) {
          coverHealed[target] = true;
          coverHealedDirty = true;
        } else if (at < frames) {
          const list = pendingCoverHeals.get(at) ?? [];
          if (!list.includes(target)) list.push(target);
          pendingCoverHeals.set(at, list);
        }
      }
    }

    // 持ち主ごとの件の一覧: 段 1 → 段 1.5 → 段 2 → 強化の順に件を登録する（plan/design-holder-effects.md 2.4 節）
    lists.registerFrame(ev);
    for (const src of otherInstants) {
      if (!src.fires(ev)) continue;
      // 発火の条件（いまは cooldownReduction の selfState だけ。plan/design-skill-stage12.md 2.6 節）
      if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, f)) continue;
      // 使った段階（発火の文脈）と、戦闘中の発火の回数の上限（plan/design-red-hood.md 2.1・2.3 節）。どちらで出なかった
      // 発火も、件の条件と同じく不発に数える（timed の burstStep は件の一覧の fireContextHolds が数える。上限の後の発火は「条件を
      // 満たさない発火と同じ」。2.3 節）
      if (!burstStepHolds(src.effect.condition, ev, src.sourceSlotIndex)) {
        lists.skipInstant(src.effect, src.sourceSlotIndex, f);
        continue;
      }
      if (src.effect.maxFires !== undefined) {
        const fired = instantFireCounts.get(src) ?? 0;
        if (fired >= src.effect.maxFires) {
          lists.skipInstant(src.effect, src.sourceSlotIndex, f);
          continue;
        }
        instantFireCounts.set(src, fired + 1);
      }
      // 射撃の回数トリガーでないバーストゲージのチャージは、対象によらず 1 回だけ、次のフレームのゲージに足す
      if (src.effect.kind === 'burstGauge') {
        if (controller === null || f + 1 >= frames) continue; // 固定サイクル・バーストなしではゲージを見ない
        const list = pendingGaugeCharges.get(f + 1) ?? [];
        list.push({ sourceSlotIndex: src.sourceSlotIndex, effect: src.effect });
        pendingGaugeCharges.set(f + 1, list);
        continue;
      }
      // 窓の外で発火したフルバーストタイムの延長（バースト 3 段階突入時）は、対象によらず 1 回だけ、次に作る窓に予約する
      if (src.effect.kind === 'fullBurstExtend') {
        if (controller === null) continue; // 固定サイクル・バーストなしでは窓を延ばさない
        reserveFullBurstExtension(controller, src.effect.value);
        reserveExtension({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: src.sourceSlotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
        continue;
      }
      // 現在の HP▼ は自分の HP の割合を下げるだけ（次のフレームから読む。plan/design-scarlet.md 2.1 節）
      if (src.effect.kind === 'currentHpDown') {
        lists.lowerCurrentHp(src.sourceSlotIndex, f, src.effect.value);
        instants.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          slotIndex: src.sourceSlotIndex,
          effect: src.effect,
          amount: src.effect.value,
        });
        continue;
      }
      const context = lists.rankContext(src.effect, src.sourceSlotIndex, fireContextOf(src.effect.trigger, ev), f);
      for (const target of targetsAt(src.effect, src.sourceSlotIndex, context)) {
        if (src.effect.kind === 'cooldownReduction') {
          if (controller === null) continue; // 固定サイクル・バーストなしでは CT を見ない
          const before = controller.cooldownReductions.length;
          // CT▲は走っている CT の残りに足す（記録の applied は負。plan/design-mint-prika.md 2.6 節）
          const change = src.effect.increase === true ? extendCooldown : reduceCooldown;
          change(controller, target, gameSecondsToFrames(src.effect.value), f, src.sourceSlotIndex);
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
        // 残弾数減少は基礎の武器の残弾から残弾 × X% を減らす（端数は切り上げ。plan/design-skill-stage11.md 2.2 節）
        if (src.effect.kind === 'ammoDecrease') {
          const params = paramsAt(target, f);
          const before = state.ammo;
          const wasReloading = state.phase === 'reloading';
          // 使用武器の変更の撃ち切りで起きる残弾数減少は、最後の発の次のフレーム（ShotLog.weaponChangeEnds）に来るが、ゲームの
          // リロードは変更後の武器の最後の発の本当の発の時刻（発射レートの蓄積の上の時刻。見える最終弾は 0〜1f 遅れることがある）から
          // 始まる（V-0695 のラプラス）。始まりを最後の発のフレームに戻し、その発の蓄積の余りのぶん前にする
          drainAmmo(
            state,
            Math.ceil(state.ammo * src.effect.value - 1e-9),
            params.weapon?.shot ?? slot.character.shot,
            model,
            params,
            isResolvedWeaponChangeEnd(src.effect.trigger)
              ? weaponChangeEndOffset[target]! - WEAPON_CHANGE_END_DELAY
              : 0,
          );
          // 減少でリロードを始めたら、その前の最後の発を記録に書く（照合のリロードの回。V-0735）
          const lastFired = logs[target]?.frames.at(-1);
          if (!wasReloading && state.phase === 'reloading' && lastFired !== undefined)
            (logs[target]!.drainReloadShotFrames ??= []).push(lastFired);
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: state.ammo - before,
          });
          continue;
        }
        // 射撃の回数のきっかけの弾丸チャージは、同じ発のきっかけで付く件（f + 1 から。`{ applied }` の
        // 付与で付く応急改造を含む。C-0561。仮説）を入れた最大装弾数で数える。残弾に足すのは発のフレーム f のまま
        const params = paramsAt(target, isResolvedShotCount(src.effect.trigger) ? f + 1 : f);
        const before = state.ammo;
        // 発数の弾丸チャージ（scaling 'flat'）は値をそのまま足す
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
    countShotPauses(f);
    countDamageHitGauges(f);
    countCooldownTimers(f);
    countSummons(f);
  }

  const leadShots = lists.leadShots();
  if (JSON.stringify(leadShots) !== JSON.stringify(known)) return { result: null, leadShots };
  const schedule = controller !== null ? finishSchedule(controller, frames) : fixed;
  const history = lists.history();
  for (const x of pendingExtensions) discardedExtensions.add(x);
  const result = {
    frames,
    shots: logs,
    schedule,
    instants: discardedExtensions.size === 0 ? instants : instants.filter((x) => !discardedExtensions.has(x)),
    cycleGaugeHits,
    dotGauges,
    shotGauges,
    timerGauges,
    summonHits,
    accumulateReleases,
    cooldownTimerFires: cooldownTrackers.map((t) => ({ slotIndex: t.slotIndex, skill: t.skill, frames: t.fires })),
    history,
  };
  return { result, leadShots };
}
