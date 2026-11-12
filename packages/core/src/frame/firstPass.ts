// 1 パス目のフレームループ（純関数。plan/design-stage10.md 1 節）。
// 射撃に効くバフ（frame/firing.ts の FiringParams）と CT 短縮があると、射撃の列 → 時刻表 → バフ → 射撃の列…と循環する。
// ここではフレームを 1 つずつ進め、射手・ゲージ・バーストの状態機械・スキルの効果を同時に回して循環をほどく。
// 効果はすべて持ち主ごとの件の一覧（skills/holders.ts）で持つ。仕組みごとの準備とフレームの中の手順は frame/firstPass/ の作り手に置き、
// ここはそれを準備の文の順に作って、フレームのループで手順を呼ぶ。ループの後の区間は planTeamRun が履歴から作り（skills/holders/history.ts の buffTimelineOf）、
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
import { finishSchedule, type BurstTiming } from '../burst/controller.ts';
import { type ResolvedDamageEffect } from '../skills/burstDamage.ts';
import { type BurstSchedule, type BurstScheduleModel } from '../burst/schedule.ts';
import { type BuffTotals, type HitRateN } from '../skills/buffs.ts';
import { type ResolvedInstantEffect } from '../skills/resolve.ts';
import { createHolderLists, type HolderHistory, type LeadShots } from '../skills/holders.ts';
import { resolvePassiveStates, type FrameRange, type TimelineSlot } from '../skills/timeline.ts';
import { type ShotEvent } from '../skills/triggers.ts';
import type { SummonId } from '../skills/summons.ts';
import { DEFAULT_WEAPON_MODEL, type WeaponModel } from '../weapons.ts';
import type { ShotLog } from './shots.ts';
import { flightFramesAt, type FlightFrameSpan, type LandingHitRateSpan, type SlotFlight } from './landing.ts';
import type { SkillSlot } from '../types.ts';
import type { HoldFire, ObstacleBreak, PelletHits } from '../team.ts';
import type { FirstPassBase } from './firstPass/base.ts';
import { createGauge } from './firstPass/gauge.ts';
import { createGaugeEffects, createShotGaugeTrackers } from './firstPass/gaugeEffects.ts';
import { createShotPauses } from './firstPass/shotPauses.ts';
import { createAccumulate } from './firstPass/accumulate.ts';
import { createSummons } from './firstPass/summons.ts';
import { createBurstSchedule, createBurstStep } from './firstPass/burst.ts';
import { createInstantSources, createInstants } from './firstPass/instants.ts';
import { createShotLogs } from './firstPass/shotLogs.ts';
import { createShooterStates, createShooters } from './firstPass/shooters.ts';
import { createFrameEvents } from './firstPass/frameEvents.ts';

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

/** 回し直しの上限（plan/design-explosive-round-lead.md 5.2 節。ふつうは 2 回で揃う） */
const MAX_LEAD_PASSES = 4;

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
  // 仕組みごとの作り手は、準備の文の順のとおりに呼ぶ（準備の中の検査が投げる順を変えない。plan/design-split-first-pass.md 3.1 節・3.4 節）
  const burstScheduleLayer = createBurstSchedule({ slots, options, frames, burstModel });
  const { activationsOf, controller, fixed, windowsOf } = burstScheduleLayer;

  // ---- 効果の準備 ----
  const passive = resolvePassiveStates(slots);
  // 件の一覧は即時効果の出どころの後に作るので、出どころは発火の時に listsOf で読む（作る前に読めば、宣言より前の読みで落ちる）
  const instantSourcesLayer = createInstantSources({ slots, frames, scheduleModel, listsOf: () => lists });
  const { instant } = instantSourcesLayer;
  const shotLogsLayer = createShotLogs({ slots });
  const { logs } = shotLogsLayer;
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
  // plan/design-anis-star-gauge-timing.md 3 節: 枠 i がフレーム f に撃った発の飛ぶ時間（ゲージはその後のフレームに溜まる）
  const flights = slots.map((_, i) => options.flights?.[i] ?? null);
  const shotFlightAt = (i: number, f: number): number => flightFramesAt(flights[i]?.shot, f);
  const shotEvents: (ShotEvent | null)[] = slots.map(() => null);
  const instants: InstantApplication[] = [];
  const layerBase: FirstPassBase = {
    slots,
    options,
    frames,
    passive,
    lists,
    logs,
    controlledSlot,
    model,
    untargetable,
    burstModel,
    flights,
    shotFlightAt,
    shotEvents,
    instants,
    activationsOf,
    windowsOf,
  };
  const shooterStatesLayer = createShooterStates(layerBase);
  const upToGauge = { ...layerBase, ...createGauge(layerBase) };
  const { updateTimedGaugeSpeed } = upToGauge;
  const upToShotGauges = { ...upToGauge, ...createShotGaugeTrackers(upToGauge) };
  const shotPausesLayer = createShotPauses(layerBase);
  const { countShotPauses } = shotPausesLayer;
  const upToGaugeEffects = { ...upToShotGauges, ...createGaugeEffects(upToShotGauges) };
  const {
    addAllyGauge,
    addShotGauges,
    cooldownTrackers,
    countCooldownTimers,
    countCycles,
    countDamageHitGauges,
    cycleGaugeHits,
    dotGauges,
    reserveBurstUseDotTicks,
    reserveTimerGauges,
    shotGauges,
    takeReservedGauge,
    timerGauges,
    trackDotBurstUse,
  } = upToGaugeEffects;
  const { accumulateReleases, addAccumulatedGauge, recordAccumulatorShots } = createAccumulate(upToGaugeEffects);
  const { countSummons, summonHits } = createSummons(upToGaugeEffects);
  const upToShooters = {
    ...upToGaugeEffects,
    ...shotPausesLayer,
    ...shotLogsLayer,
    ...shooterStatesLayer,
    ...burstScheduleLayer,
    ...instantSourcesLayer,
  };
  const { stepShooters } = createShooters(upToShooters);
  const burstStepLayer = createBurstStep(upToShooters);
  const { blockedAt, discardedExtensions, discardPendingExtensions, stepBurst } = burstStepLayer;
  const { addGaugeCharges, applyInstants } = createInstants({ ...upToShooters, ...burstStepLayer });
  const { applyHeals, collectFrameEvents } = createFrameEvents(upToShooters);

  for (let f = 0; f < frames; f++) {
    // 狙えない窓（バーストの制御が見る。射手のハイドは枠ごとの slotBlocks で、下の射手の中）
    const blocked = blockedAt(f);
    // 時間で変わるゲージ速度の枠の、このフレームの (1 + 速度)（f − 1 までに付いた件）と、その速度の周期のゲージ
    updateTimedGaugeSpeed(f);
    reserveTimerGauges(f);
    // 1. 射手（V-0030: 前のフレームまでに予約した段のヒットのゲージも、このフレームのゲージに入れる）
    let gauge = takeReservedGauge(f);
    gauge = addAccumulatedGauge(gauge, f);
    gauge = stepShooters(gauge, f);
    recordAccumulatorShots(f);
    gauge = addShotGauges(gauge, f);
    gauge = addGaugeCharges(gauge, f);
    gauge = addAllyGauge(gauge, f);
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    stepBurst(gauge, f, blocked);
    // 2b. V-0030: 段の循環の射撃は、手順 3 の後に数える（countCycles）
    if (trackEvents || trackDotBurstUse) {
      // 3. 出来事 → 射撃に効く窓の登録 → 即時効果
      const ev = collectFrameEvents(f);
      reserveBurstUseDotTicks(f, ev.burstEffects);
      applyHeals(ev, f);

      // 持ち主ごとの件の一覧: 段 1 → 段 1.5 → 段 2 → 強化の順に件を登録する（plan/design-holder-effects.md 2.4 節）
      lists.registerFrame(ev);
      applyInstants(ev, f);
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
  discardPendingExtensions();
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
