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
//      （録画 0019: ノワールのフルバースト開始で 9 → 14 になるのは、+5 発と 39.88% の弾丸チャージが同じフレームに来るため）。
//
// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 A・B）: 射撃に効かない効果（攻撃力・会心など）も、すべて件の一覧で持つ。
// ループの後の区間は、planTeamRun が履歴から作る（skills/holders.ts の buffTimelineOf。2 パス目の作り直しはやめ、段 B で 2 パス目の
// 入口 planBuffTimeline も消した）。読む側（calc・sim・観測値の指標・画面）は履歴を読む（段 D。段 E で窓と記録の書き出しを消した）。
// 射撃に効く効果も即時効果も無い編成では、射撃の列は planShots、時刻表は planDynamicSchedule と 1 フレームも違わない（1.3 節）。
//
// Stage 11（plan/design-stage11.md 3 節）: 対象 burstUsers（「直前にバーストスキルを使用した味方」）は発火ごとに対象が変わるので、
// 窓を対象の枠ごとに持つ。回復（heal）は手順 3 の最初に当て、射撃の回数起点なら、撃った枠より後ろの枠にはこのフレーム、
// 自分と前の枠には次のフレームに送って healed を立てる（skills/heals.ts の healFrameOf。V-0490、C-0628）。
//
// Stage 11 アリス編（plan/design-stage11.md 19.3 節）: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の射撃系・即時効果があるときだけ、
// 攻撃力の timed 効果の窓も同じ TriggerTracker で追い（射撃には使わず順位のためだけ）、発火のフレームで順位を出して対象を決める。
// 手順 3 の順番は 回復 → 攻撃力の窓 → 射撃に効く窓 → 即時効果 で、同じフレームに付いた攻撃力の窓も順位に入る
// （段の 2 段目。skills/ranking.ts）。
// 回復の対象の順位は、回復が手順 3 の最初なので、そのフレームに付く窓を入れない（循環を順番で断つ。plan/design-heal-top-attack.md 2 節）。
//
// Stage 11 モダニア（plan/design-stage11-modernia.md 3 節）: スタックする効果（最大装弾数▼）は段ごとの窓で登録する（skills/stacks.ts）。
// 条件「自分が 〈stat〉 増加状態なら」の効果を追うときは、条件の stat の窓（状態の窓）も追い、手順 3 の順番は
// 回復 → 状態の窓 → 攻撃力の窓 → 射撃に効く窓 → 即時効果。使用武器の変更（殲滅モード）の間は、変更後の武器を別の射手の状態で撃ち、
// 終わったら基礎の武器を最大装弾数まで込め直して戻す（frame/shooter.ts の resumeShooter。録画 0044 で確定）。武器の窓は持ち替えるフレーム（発火の次のフレーム）から。
//
// Stage 16-B（plan/design-stage16.md 9.3 節）: 敵を狙えない窓（options.untargetable）の間は、全員が撃たず（ハイドしてリロード）、
// オートバーストも発動しない。ゲージは射撃が無いので溜まらない。持続バフ・CT・フルバーストの時間はそのまま進む。
// ただしチャージの無い武器は、窓の始まりから D（WeaponModel.hideDetectFrames）までは撃ち続ける（plan/design-hide-reload-detect.md 10 節）。
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
import { burstDelaysOf } from '../burst/landing.ts';
import { planFixedCycle } from '../burst/fixedCycle.ts';
import { FRAMES_PER_GAME_SECOND, gameSecondsToFirstFrame, gameSecondsToFrames } from '../time.ts';
import {
  DEFAULT_BURST_TIMING,
  finishSchedule,
  initialBurstController,
  reduceCooldown,
  reserveFullBurstExtension,
  shortenCooldown,
  stunSlot,
  stepBurstController,
  type BurstControllerState,
  type BurstTiming,
} from '../burst/controller.ts';
import {
  SG_PELLET_GAUGE_HIT_RATE,
  burstCandidateOf,
  burstUnitOf,
  energyPerTrigger,
  fullChargeGaugeOf,
  partialGaugeRatio,
} from '../burst/dynamic.ts';
import { resolveCycleEvery, resolveCycles } from '../skills/cycles.ts';
import {
  damageHitFramesOf,
  effectHitFrames,
  resolveDamageEffects,
  resolveDamageGauges,
  resolveAllyGaugeAdd,
  resolveDotEffects,
  resolveShotGauges,
  resolveAppliedPauses,
  resolveBurstUsePause,
  resolveShotPauses,
  resolveTimerGauges,
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
import { capCritRate, pelletsPerShot, ZERO_BUFFS, type BuffTotals, type HitRateN } from '../skills/buffs.ts';
import {
  firesChargeShots,
  isResolvedShotCount,
  isResolvedTimer,
  isResolvedWeaponChangeEnd,
  resolveCoverHeals,
  resolveInstant,
  resolveSkillCooldownDowns,
  type ResolvedCoverHeal,
  type ResolvedInstantEffect,
  type ResolvedTrigger,
} from '../skills/resolve.ts';
import { healFrameOf } from '../skills/heals.ts';
import { createHolderLists, type HolderHistory, type LeadShots } from '../skills/holders.ts';
import { isEffectTarget, type FireContext } from '../skills/targets.ts';
import {
  cooldownTimer,
  resolvePassiveStates,
  shortenedTimer,
  triggerFrames,
  type TimelineSlot,
} from '../skills/timeline.ts';
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
import {
  chargeTriggersOf,
  hasReloadEndEffect,
  isSummonAttackTrigger,
  isTimerTrigger,
  SKILL_SLOTS,
  type ShotCountKind,
  type SummonAttackTrigger,
  type SummonEffect,
} from '../skills/types.ts';
import type { SummonId } from '../skills/summons.ts';
import { dotTickTracker, groupDotsByState, type DotTickTracker } from './dot.ts';
import { DEFAULT_WEAPON_MODEL, isChargeWeapon, muzzleHitsOf, type WeaponModel } from '../weapons.ts';
import { timerFramesOf, type FrameRange } from '../skills/timeline.ts';
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
import type { NamedStateId } from '../skills/states.ts';
import type { HoldFire, ObstacleBreak, PelletHits } from '../team.ts';
import { unionRanges } from './events.ts';
import { reloadStartOffset } from '../cadence.ts';

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
  /** Stage 16-B: 敵を狙えない窓（昇順・重なりなし。frame/events.ts の untargetableRanges）。省略・空なら今までと同じ */
  untargetable?: readonly FrameRange[];
  /**
   * V-0605: 枠ごとの、撃たずにハイドする時間（TeamInput.holdFire）。その枠だけ untargetable と同じに扱い（重なれば合わせた区間）、
   * 入るフレームに部分チャージの発は撃たない（狙えない窓の始まりと重なるフレームは撃つ）。ゲージとバーストの使用は止めない
   */
  holdFire?: readonly HoldFire[];
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
  /** テスト用: 件の列を読むたびに作り直した件と比べる（skills/holders.ts の HolderListsOptions.verifyItems） */
  verifyItems?: boolean;
  /**
   * ペレットの命中編（plan/design-pellet-hit.md 3 節）: 枠ごとの、発ごとに的に当たったペレットの数（録画で数えた入力）。
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
   * エード：エージェントバニー編（plan/design-agent-bunny.md 2.2 節）: 条件 inEffectiveRange の判定（skills/holders.ts の
   * HolderListsOptions.effectiveRangeAt にそのまま渡す。frame/landing.ts の inEffectiveRangeAt）
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
   * アインのニアフェザー編（plan/design-ein-near-feather.md 1.3 節）: 召喚の攻撃（damage のきっかけ { summon }）の発火のフレーム（発生順）。
   * 1 パス目が機数と進みを追って決め、2 パス目（frame/plan.ts の planSkillHits）がこの列で倍率ダメージを出す
   */
  summonHits: { slotIndex: number; summon: SummonId; frame: number }[];
  /** 蓄積爆破の爆発（発生順）。2 パス目（frame/plan.ts の planSkillHits）がこの列で爆発のヒットを出す */
  accumulateReleases: AccumulateRelease[];
  /**
   * 魔術師のカード編（plan/design-arcana-magician.md 2.1 節）: クールタイムを縮める状態（中身の skillCooldownDown）が編成にある時の、
   * 枠 × スロットのクールタイムの印（cooldown）のある周期の発火のフレーム（昇順）。2 パス目（frame/plan.ts の planSkillHits）が、
   * 印のある周期の damage をこの列で出す。縮める状態の無い編成では空（静的な周期のまま）
   */
  cooldownTimerFires: { slotIndex: number; skill: SkillSlot; frames: number[] }[];
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
  /** 発火の文脈 context のとき、効果 e が掛かる枠（Stage 11: burstUsers は発火ごとに変わる） */
  const targetsAt = (e: Parameters<typeof isEffectTarget>[0], sourceSlotIndex: number, context: FireContext) =>
    slots.flatMap((t, i) => (t !== null && isEffectTarget(e, sourceSlotIndex, i, t.character, context) ? [i] : []));
  // F5（plan/design-heal-vocabulary.md 3.3 節）: 時間の周期のトリガー（heal だけ書ける）は出来事の列に無いので、
  // 周期のフレーム（atStart ならフレーム 0 も。skills/timeline.ts の triggerFires）で発火する
  // A2 の B モード編（plan/design-hp-down-interval.md 2.1 節）: 状態の付いた時から数える周期（since。currentHpDown）は、件の一覧の
  // 自分のその状態の付いたフレーム（付いた最後のフレームが起点）と、効いているかで決める（counterChange の sinceFires と同じ数え方）。
  // 件の登録（registerFrame）の後に毎フレーム呼ぶ
  const instantTracker = (effect: { trigger: ResolvedTrigger }, sourceSlotIndex: number): TriggerTracker => {
    if (!isResolvedTimer(effect.trigger)) return createTriggerTracker(effect.trigger, sourceSlotIndex, scheduleModel);
    const since = effect.trigger.since?.applied;
    if (since !== undefined) {
      const offsets = new Set(timerFramesOf(effect.trigger, frames));
      // A2 の B モード編（V-0729）: atStart なら付いたフレームにも発火する
      if (effect.trigger.atStart === true) offsets.add(0);
      let start: number | undefined;
      return (ev) => {
        if (lists.stateStartedAt(sourceSlotIndex, since, ev.frame)) start = ev.frame;
        return (
          start !== undefined && offsets.has(ev.frame - start) && lists.stateHeldAt(sourceSlotIndex, since, ev.frame)
        );
      };
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
  // 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節）: 遮蔽物 HP 回復。受けた枠に coverHealed の出来事を、回復と同じフレームの
  // 規則（healFrameOf）で立てる。回復量は計算に効かないので、件も記録も作らない
  // 対象の枠は編成だけで決まるので、始めに 1 回求めておく
  const coverHeals: {
    sourceSlotIndex: number;
    effect: ResolvedCoverHeal;
    fires: TriggerTracker;
    targets: readonly number[];
  }[] = [];
  // 段 17 の PR 2（plan/design-skill-stage17.md 2.1 節。論点 3）: 遮蔽物 HP が最も低い味方 N 機は、編成が N 体以下なら全員、N 体より多ければ
  // 選び方を確かめていないので誰も選ばない（未実装）
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
  // 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: バースト使用時のフルバーストタイムの延長（D）は、状態機械が発動の時に聞く
  // （extensionAtActivation。件の一覧が窓の終わりを読む前に足す）ので、下の即時効果のループでは扱わない
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
  // シンデレラ S1 編: リロードの込め終わりは、それで終わる効果（durationUntil: reloadEnd。対象は自分）か、それで発火する解除
  // （{ reloadEnd }。2 段目の段 16 の PR 2）を持つ枠だけが書く
  const writesReloadEnds = slots.map((slot) => slot?.definition != null && hasReloadEndEffect(slot.definition));
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 溜めのきっかけ（{ chargeTick }・{ chargeFull }）を持つ枠だけ、溜めを追い、
  // 周期と満ちたフレームを射撃の記録に書く（流し直しも、このフレームの出来事も同じ列を読む）。ticks の k はいまの溜めで発火した周期の数、
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
  /** 段 14 の PR 2: 溜めを数え直す（撃った・溜めていないフレーム） */
  const restartCharge = (w: NonNullable<(typeof chargeWatches)[number]>): void => {
    for (const t of w.ticks) {
      if (t.k === 0) continue;
      t.k = 0;
      t.nextAt = gameSecondsToFrames(t.entry.everySeconds);
    }
    w.fullDone = false;
  };
  /**
   * 段 14 の PR 2: 枠 i のフレーム f の溜め。progress は撃つ前の溜めの進み（chargeProgressFrames。溜めていなければ null）、shot は
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
  // 持ち主ごとの件の一覧（plan/design-holder-effects.md 段 A）。スキルの効果をすべて、受ける枠ごとの件の列で持つ
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
  /**
   * 撃ち切りで終わった使用武器の変更の、最後の発の本当の発の時刻の、そのフレームからのずれ（変更後の武器の発射レートの蓄積の余りから。
   * 撃ち切りの残弾数減少のリロードの始まりに使う。plan/design-reload-rounding.md 案 F）
   */
  const weaponChangeEndOffset: number[] = slots.map(() => 0);

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
  // 二丁持ち（muzzleHitsOf）は 1 発 2 ヒットで、2 ヒットともゲージを溜める（plan/design-quency-eq.md 2 節の論点 1。SMG は C-1023、RL は C-1019）
  const muzzleHits = slots.map((slot) =>
    slot === null ? 1 : muzzleHitsOf(slot.character.weaponType, slot.character.shot),
  );
  const baseEnergies = slots.map((slot, i) =>
    slot === null
      ? 0
      : hitRateSpans[i]
        ? energyPerTrigger(slot.character.shot, i === controlledSlot, 1, 1, muzzleHits[i])
        : energyPerTrigger(
            slot.character.shot,
            i === controlledSlot,
            slot.hitRate ?? 1,
            SG_PELLET_GAUGE_HIT_RATE,
            muzzleHits[i],
          ),
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
    return options.hitRateWith(i, span, lists.hitRateAt(i, f));
  };
  /**
   * ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.1・2.2 節）: 枠 i のフレーム f の発の、基礎のペレットの数に対する
   * 実効のペレットの数の比（固定なら 1 ÷ 基礎、▲なら (基礎 + Σ) ÷ 基礎）。ゲージとペレットの命中の量は、当たったペレットの数に比例する
   * （C-0150・C-1075）。ペレットの数の件の無い枠は 1。同じ発のゲージとペレットの命中の量が同じフレームで読むので、枠ごとに最後の値を覚える
   */
  const pelletTracked = slots.map((_, i) => pellets[i]! && lists.hasPelletTracks(i));
  const lastPelletRatio = slots.map(() => ({ frame: -1, ratio: 1 }));
  const pelletRatioAt = (i: number, f: number): number => {
    if (!pelletTracked[i]) return 1;
    const last = lastPelletRatio[i]!;
    if (last.frame !== f) {
      const count = slots[i]!.character.shot.shotCount;
      last.frame = f;
      last.ratio = pelletsPerShot(count, lists.pelletsAt(i, f)) / count;
    }
    return last.ratio;
  };
  /** 枠 i がフレーム f に撃った 1 発のゲージ */
  const energyAt = (i: number, f: number): number => {
    const energy = (timedGauge[i] ? baseEnergies[i]! * gaugeScale[i]! : energies[i]!) * pelletRatioAt(i, f);
    if (!hitRateSpans[i]) return energy;
    const span = spanAt(i, f);
    const pelletRate = pellets[i] && span?.measured !== true ? SG_PELLET_GAUGE_HIT_RATE : 1;
    return energy * (spanValueAt(i, f)?.hitRate ?? 1) * pelletRate;
  };
  /** 枠 i の 1 発のゲージに乗るフルチャージ倍率（C-0007。操作キャラのチャージ武器だけ。energyPerTrigger が掛ける値） */
  const chargeGaugeOf = (i: number): number => fullChargeGaugeOf(slots[i]!.character.shot, i === controlledSlot);
  /**
   * アニス：スター S1 の味方のゲージ編: 枠 i の 1 発のゲージ（energyAt の値）が、ゲージ何回ぶんか（弾のヒットの期待値。SG は当たった
   * ペレットの数）。1 回のゲージ（targetBurstEnergyPerShot × フルチャージ倍率 × いまのゲージ速度）で割る
   */
  const gaugeHitsOf = (i: number, shotEnergy: number): number => {
    const unit = targetEnergies[i]! * chargeGaugeOf(i) * (timedGauge[i] ? gaugeScale[i]! : 1 + gaugeSpeed[i]!);
    return unit > 0 ? shotEnergy / unit : 0;
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
  /**
   * レッドフード編（plan/design-red-hood.md 7.1 節の論点 13。V-0639）: フレーム f に始まった枠 i の使用武器変更の最初の発のフレーム。
   * 持ち替えは、変更を開いた発動（効果の発火が f 以前の、枠 i の最後の発動）がフルバーストに入るなら窓の始まり、ほかは f。持ち替えの時の
   * 基礎の武器が、リロード中ならそのまま、構え解除の途中（最後の発から aimOutFrames 未満）なら構え解除の終わりから after を数え、
   * 構え直し・チャージの途中（まだ撃っていない枠も）なら構え解除 1 回分を足す
   */
  const firstShotAfterSwap = (i: number, f: number, after: number): number => {
    const opened = activationsOf().findLast((a) => a.slotIndex === i && effectFrameOf(a) <= f);
    const swap = opened?.startsFullBurst ? Math.max(f, hexagonFrameOf(opened)) : f;
    return weaponFreeFrameAtSwap(shooters[i]!, logs[i]?.frames.at(-1), swap, model) + after;
  };
  const shotFlightAt = (i: number, f: number): number => flightFramesAt(flights[i]?.shot, f);
  // 同 2 節（C-0177・C-0243）: 枠ごとの「発の番号 → 壊した障害物の数」と、物 1 個のゲージ
  const obstacles = slots.map(() => new Map<number, number>());
  for (const b of options.obstacleBreaks ?? []) obstacles[b.slotIndex]?.set(b.shot, b.count);
  const obstacleBases = slots.map((slot, i) =>
    slot === null ? 0 : slot.character.shot.burstEnergyPerShot * chargeGaugeOf(i),
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
    // 二丁持ちは 1 発 2 ヒット（命中・コアの命中の期待値もヒットごと）
    const m = muzzleHits[i]!;
    return { hits: pellets[i] ? 1 : hitRate * m, coreHits: enemyHasCore ? coreHits * m : 0 };
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
    return slot.character.shot.shotCount * pelletRatioAt(i, f) * rate;
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
  // フレームのゲージに足す（付けるのは撃った時でヒットではないので、飛ぶ時間は足さない）。回数トリガーの遅れ編
  // （plan/design-shot-count-trigger-frame.md 6 節）: delayFrames があれば、発火した射撃の delayFrames 後のゲージに足す（C-0480）
  const shotGaugeTrackers: {
    slotIndex: number;
    count: ShotCountKind;
    every: number;
    energy: number;
    n: number;
    delayFrames: number;
  }[] = [];
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
        delayFrames: t.delayFrames ?? 0,
      });
    }
  });
  // V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717・C-0718）: 射撃の止まり（shotPause）。射撃を数えて、発火した射撃の次のフレームから
  // 止めるフレーム数のあいだ射手を進めない（pauseLeft。手順 1 で減らす）。発火した射撃がマガジンの最後の弾丸なら framesOnLastShot
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 回数の間隔の変更（cycleEvery の shotCounts）の窓の中は、通算の回数が窓の
  // 間隔の倍数に届いた発で止める（C-0727）。窓の件はこのフレームに付いたものも見るので、段の循環と同じく手順 3 の後に数える（countShotPauses）
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
  // プリバティ編（plan/design-privaty-burst-pause.md 2 節）: 自分のバーストの発動の次のフレームから止めるフレーム数（手順 3 で立てる）
  // 立っている止まりの、明けで構え直すときに unhideShooter に渡す止めたフレーム数（0 は立っていない。射撃の回数の止まりと区別する）
  const burstPauseAim = slots.map(() => 0);
  const burstUsePause = slots.map((slot) =>
    slot === null || slot.definition === null ? 0 : resolveBurstUsePause(slot.definition),
  );
  // メイド編（plan/design-maids.md 2.2 節）: 状態が付いた時の止まり（気絶）。手順 1 で、前のフレームに無かった状態が付いていれば立て、
  // 明けまでバーストの候補からも外す（論点 2）。明けは、バーストの発動の止まりと同じく構え直す
  const appliedPauses = slots.map((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveAppliedPauses(slot.definition).map((p) => ({ ...p, was: false })),
  );
  // レイヴン編（plan/design-raven-s1.md 4 節）: ゲージを溜める持続ダメージ（dot の gaugeOnApply・gaugeOnTick）。射撃を数えて
  // 発火を追い、付けたときの分は発火のフレームに、tick の分は dotTickTracker が返した tick のフレームに予約する。
  // V-0113（10 節）: バースト使用時に付く効果（burstUse。クルミのハッキング）も同じまとまりの発火として、手順 3 の出来事で追う
  const dotGaugeTrackers: {
    slotIndex: number;
    effects: { count: ShotCountKind; every: number; n: number; onApply: boolean }[];
    /** 回数トリガーの遅れ編の第 2 段: 付けたときのゲージを発火の何フレーム後に足すか（0 は発火のフレーム。C-0181） */
    applyDelay: number;
    /** tick の刻みを発火の何フレーム後から数えるか（skills/types.ts の DotEffect.tickDelayFrames。0 は発火のフレーム） */
    tickDelay: number;
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
        applyDelay: Math.max(0, ...group.map((e) => e.dot!.gaugeOnApplyDelayFrames ?? 0)),
        tickDelay: dot.tickDelayFrames ?? 0,
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
  // アニス：スター S1 の味方のゲージ編（plan/design-anis-star-ally-gauge.md 3 節）: allyGaugeAdd を持つ枠（1 つまで）は、ほかの枠の
  // ゲージ 1 回（弾のヒット・射撃ごとの倍率ダメージのゲージのヒット）ごとに、自分の 1 発のゲージ × 割合を足す。1 発のゲージは自分の
  // 最初の発の着弾のフレームから targetBurstEnergyPerShot、その前は burstEnergyPerShot（C-0246・C-0620）。回数は着くフレームに数え、
  // そのフレームの射撃の後に、そのフレームの量で足す（着弾と同じフレームの回は切り替わった後の量。境のフレームは確かめていない）
  const allyAdd = (() => {
    for (const [i, slot] of slots.entries()) {
      if (slot === null || slot.definition === null) continue;
      const ratio = resolveAllyGaugeAdd(slot.definition, slot.character, slot.levels);
      if (ratio === null || ratio === 0) continue;
      const shot = slot.character.shot;
      return { slotIndex: i, before: shot.burstEnergyPerShot * ratio, after: shot.targetBurstEnergyPerShot * ratio };
    }
    return null;
  })();
  /** 持つ枠の最初の発の着弾のフレーム（まだ撃っていなければ null） */
  let allyAddLanding: number | null = null;
  /** フレーム → そのフレームに着く、ほかの枠のゲージの回数（期待値） */
  const pendingAllyHits = new Map<number, number>();
  const reserveAllyHits = (i: number, at: number, hits: number): void => {
    if (allyAdd === null) return;
    if (i === allyAdd.slotIndex) {
      if (allyAddLanding === null || at < allyAddLanding) allyAddLanding = at;
      return;
    }
    if (hits > 0 && at < frames) pendingAllyHits.set(at, (pendingAllyHits.get(at) ?? 0) + hits);
  };
  /** 枠 i の発のゲージを、着弾のフレーム（f + 飛ぶ時間）に入れる。f のフレームならこのフレームのゲージに返す。hits はその回数（期待値） */
  const landingGauge = (i: number, at: number, f: number, energy: number, hits: number): number => {
    reserveAllyHits(i, at, hits);
    if (energy > 0 && at < frames) shotGauges.push({ slotIndex: i, shotFrame: f, frame: at, energy });
    if (at === f) return energy;
    if (at < frames) pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
    return 0;
  };
  const trackDotBurstUse = dotGaugeTrackers.some((t) => t.onBurstUse);
  /** 持続ダメージがフレーム f に付いた。新しく決まった tick の分を、tick のフレームに予約する（どれも f より後） */
  const reserveDotTicks = (t: (typeof dotGaugeTrackers)[number], f: number): void => {
    const { ticks } = t.tracker.fire(f + t.tickDelay);
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
  // 魔術師のカード編（plan/design-arcana-magician.md 2.1 節）: クールタイムの印のある周期は、枠 × スロットごとに発火をフレームの順に追う
  // （cooldownTimer）。縮めるのは、編成のどれかの定義の状態の中身の「スキル N クールタイム X%▼」で、そのフレームまでに登録した状態の件で決める。
  // 縮める状態が無ければ静的な周期と同じ列になる。2 パス目とゲージはこの記録だけを読む
  const cooldownDowns = slots.flatMap((slot) =>
    slot === null || slot.definition === null
      ? []
      : resolveSkillCooldownDowns(slot.definition, slot.character, slot.levels),
  );
  const cooldownTrackers: {
    slotIndex: number;
    skill: SkillSlot;
    /** そのスロットを縮める状態と、その縮めた周期（フレーム） */
    downs: { state: NamedStateId; short: number }[];
    tick: (f: number, started: number | undefined, held: () => number | undefined) => boolean;
    /** 同じスロットの印のある burstGaugeHit の遅れ（ループの前の予約の代わりに、発火で予約する） */
    gaugeDelays: number[];
    fires: number[];
  }[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const skill of SKILL_SLOTS) {
      const marked = slot.definition.skills[skill].effects.filter(
        (e) => 'trigger' in e && isTimerTrigger(e.trigger) && e.trigger.cooldown === true,
      );
      const first = marked[0];
      if (first === undefined || !('trigger' in first) || !isTimerTrigger(first.trigger)) continue;
      const { everySeconds } = first.trigger;
      cooldownTrackers.push({
        slotIndex,
        skill,
        downs: cooldownDowns
          .filter((d) => d.slot === skill)
          .map((d) => ({ state: d.state, short: gameSecondsToFirstFrame(everySeconds * (1 - d.percent / 100)) })),
        tick: cooldownTimer(gameSecondsToFirstFrame(everySeconds)),
        gaugeDelays: marked.flatMap((e) => (e.kind === 'burstGaugeHit' ? [e.delayFrames!] : [])),
        fires: [],
      });
    }
  });
  // フラワー編: 周期のゲージ（burstGaugeHit）。射撃に依らないので、発火のフレームにループの前に予約する。
  // delayFrames があれば発火の後のヒットのフレームに足し、戦闘の終わりを越えるものは足さない（C-0453。plan/design-timer-ceil.md 7 節）
  // 2 段目の段 1: 時間で変わるゲージ速度の枠の周期のゲージは、発火のフレームの頭でその速度で予約する（発火のフレーム → 枠と遅れ）
  const timedTimerGauges = new Map<number, { slotIndex: number; delayFrames: number }[]>();
  const timerGauges: FirstPassResult['timerGauges'] = [];
  /** 周期のゲージを、発火 fireFrame の後のフレーム at のゲージに予約する（timerGauges にも残す） */
  const reserveTimerGauge = (slotIndex: number, fireFrame: number, at: number, energy: number): void => {
    timerGauges.push({ slotIndex, fireFrame, frame: at, energy });
    pendingGauge.set(at, (pendingGauge.get(at) ?? 0) + energy);
  };
  slots.forEach((slot, i) => {
    if (slot === null || slot.definition === null) return;
    const energy = slot.character.shot.targetBurstEnergyPerShot * (1 + gaugeSpeed[i]!);
    for (const { delayFrames, ...timer } of resolveTimerGauges(slot.definition)) {
      // 魔術師のカード編: クールタイムの印のある周期は、ループの中で発火を追って予約する（countCooldownTimers）
      if (timer.cooldown === true) continue;
      for (const fire of timerFramesOf(timer, frames)) {
        const at = fire + delayFrames;
        if (at >= frames) continue;
        if (timedGauge[i])
          timedTimerGauges.set(fire, [...(timedTimerGauges.get(fire) ?? []), { slotIndex: i, delayFrames }]);
        else reserveTimerGauge(i, fire, at, energy);
      }
    }
  });
  // V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 周期の倍率ダメージのヒットごとのゲージ（gaugePerHit）。発火をフレームの順に
  // 追い（periodShorten の短縮は、そのフレームまでに登録した自分の状態で決める。2 パス目の shortenedTimerFrames と同じ規則）、
  // N ヒットのフレームのゲージに予約する（delayFrames は 1 以上なので、どのヒットも発火より後のフレーム）
  const damageTimerGauges: { slotIndex: number; effect: ResolvedDamageEffect; fires: (f: number) => boolean }[] = [];
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節。C-0426）: 射撃の回数のきっかけの倍率ダメージのヒットごとのゲージ
  // （gaugePerHit。オートファイア）。射撃を数えて発火を追い、ヒットのフレーム（perCount { state } の数だけ 1 つずつ出すヒットは、発火の
  // フレームより前に付いたスタック数。2 パス目の planSkillHits と同じ見え方）のゲージに予約する（delayFrames は 1 以上なので、どのヒットも
  // 発火より後のフレーム）。射撃ごとの倍率ダメージのゲージと同じく発のゲージの記録（shotGauges）に残し、味方のゲージの回数にも数える
  const shotDamageGauges: {
    slotIndex: number;
    effect: ResolvedDamageEffect;
    count: ShotCountKind;
    every: number;
    /**
     * V-0692（ラピ：レッドフードの粘着榴弾の付着。C-0991）: 回数の間隔の変更（cycleEvery の shotCounts）の窓の中の間隔。射撃の止まり
     * （shotPauseTrackers）と同じく、窓の中は通算の回数が窓の間隔の倍数に届いた発で発火する（C-0727）
     */
    everyAt: ShotCountEveryAt | undefined;
    n: number;
    /** エレグの S1（C-0773）: 条件 enemyState（発火のフレームに敵がその状態なら予約する） */
    enemyState?: NamedStateId;
  }[] = [];
  /** 枠ごとの倍率ダメージ（ヒットごとのゲージと召喚の攻撃が読む。枠ごとに 1 回だけ解く） */
  const damageEffects = slots.map((slot) =>
    slot === null || slot.definition === null ? [] : resolveDamageEffects(slot.definition, slot.character, slot.levels),
  );
  damageEffects.forEach((effects, i) => {
    for (const effect of effects) {
      if (effect.gaugePerHit === undefined || isSummonAttackTrigger(effect.trigger)) continue;
      const { trigger } = effect;
      if (isResolvedTimer(trigger)) {
        // 2 段目の段 15 の PR 3: periodShorten の名前の無い窓（window）は gaugePerHit と組まない（読み込みで落とす）ので、鍵は状態だけ
        const shorten = effect.periodShorten;
        const state = shorten?.state;
        const shortened = (frame: number) => state !== undefined && lists.selfStateAt(i, state, frame);
        const fires = shortenedTimer(trigger, shorten?.seconds ?? 0, frames, shortened);
        damageTimerGauges.push({ slotIndex: i, effect, fires });
      } else if (isResolvedShotCount(trigger)) {
        if (trigger.count === 'fullChargeShot' && !logs[i]!.fullCharge) continue;
        const enemyState = effect.condition?.enemyState;
        shotDamageGauges.push({
          slotIndex: i,
          effect,
          count: trigger.count,
          every: trigger.every,
          everyAt: lists.shotCountEveryOf(i, effect.source.skill),
          n: 0,
          ...(enemyState === undefined ? {} : { enemyState }),
        });
      }
    }
  });
  /** 枠 i のヒットごとのゲージの、このフレームの 1 ヒットの量 */
  const hitGaugeEnergy = (i: number): number => targetEnergyNow(i, targetEnergies[i]! * (1 + gaugeSpeed[i]!));
  // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.3・2.4 節）: 蓄積爆破（damage の accumulate の self）。フルチャージの発で、
  // 付いていなければ付ける（付けた発は溜めない）。付けた後、切れる capDelayFrames 前までの発（C-0927）の値 × (割合 + 蓄積割合▲) を、
  // 次のフレームの頭に（その発のフレームまでに付いた件と、2 パス目と同じ 1 発の値の関数で）数えて溜め、最大量に届いた発の
  // capDelayFrames 後に最大量を出して解除する。付くのは付けた発の applyDelayFrames 後で、最大量はそのフレームの値で決め（C-0916）、
  // 届かなければ付いてから窓の長さで切れ、射手の 1 ヒットぶんのゲージを溜める（C-0430）。付くまでの発は、最大量が決まってから溜める
  const accumulators = damageEffects.flatMap((effects, slotIndex) =>
    effects.flatMap((effect) => {
      const acc = effect.accumulate;
      if (acc?.source !== 'self') return [];
      return [
        {
          slotIndex,
          effect,
          acc,
          active: null as null | {
            applied: number;
            expire: number;
            cap: number | null;
            stored: number;
            reached: number | null;
          },
          pending: [] as { frame: number; progress: number | undefined }[],
        },
      ];
    }),
  );
  const shotValueAt = options.shotValueAt;
  if (accumulators.length > 0 && shotValueAt === undefined) throw new Error('accumulate (self) needs shotValueAt');
  const accumulateReleases: AccumulateRelease[] = [];
  /** 枠 i がフレーム frame に撃った発の値と最終攻撃力、そのフレームの件の合計（frame より後のフレームに呼ぶ） */
  const accumulateShotAt = (i: number, frame: number, progress: number | undefined) => {
    let buffs = lists.damageBuffsAt(i, frame, passive[i]?.buffs ?? ZERO_BUFFS);
    // 持続の命中率▲を区間に足すとき（2 パス目の区間と同じ。frame/plan.ts の planTeamRun が hitRateWith を渡す時）
    if (options.hitRateWith !== undefined && lists.hasHitTracks) {
      const timed = lists.hitRateAt(i, frame);
      buffs = { ...buffs, hitRate: buffs.hitRate + timed.n, hitRateUp: buffs.hitRateUp + timed.up };
    }
    // エード：エージェントバニー編: 時間で変わる適正最小射程距離▲も、2 パス目の区間と同じに足す（距離ボーナスの出し直し）
    const range = lists.minEffectiveRangeAt(i, frame);
    if (range !== 0) buffs = { ...buffs, minEffectiveRange: buffs.minEffectiveRange + range };
    const fullBurst = windowsOf().some((w) => w.start <= frame && frame < w.end);
    return { ...shotValueAt!(i, frame, buffs, fullBurst, progress), buffs };
  };
  /** フレーム f の頭: 前のフレームまでの発を溜め、爆発があれば記録する。切れたら溜めるゲージを返す */
  const stepAccumulator = (a: (typeof accumulators)[number], f: number): number => {
    const s = a.active;
    if (s === null) return 0;
    if (s.cap === null) {
      const attached = s.applied + a.acc.applyDelayFrames;
      if (f <= attached) return 0;
      const at = accumulateShotAt(a.slotIndex, attached, undefined);
      s.cap = at.attack * a.effect.multiplier * (1 + at.buffs.distributedDamage);
    }
    // 切れるフレームの capDelayFrames 前より後に撃った発は溜めない（C-0927。発が溜まるのは約 13f 後とみた形）
    const lastStored = s.expire - a.acc.capDelayFrames;
    for (const p of a.pending) {
      if (s.reached !== null || p.frame > lastStored) break;
      const at = accumulateShotAt(a.slotIndex, p.frame, p.progress);
      s.stored += at.value * (a.acc.ratio + at.buffs.accumulateRatio);
      if (s.stored >= s.cap) s.reached = p.frame;
    }
    a.pending.length = 0;
    // 届いた発が付くより前でも、爆発は届いた発の capDelayFrames 後（最大量が決まったフレームより前なら、そのフレーム）
    const capped = s.reached !== null && f >= s.reached + a.acc.capDelayFrames;
    if (!capped && (s.reached !== null || f !== s.expire)) return 0;
    accumulateReleases.push({
      slotIndex: a.slotIndex,
      effect: a.effect,
      applied: s.applied,
      end: (capped ? s.reached! : lastStored) + 1,
      frame: f,
      capped,
      cap: s.cap,
      stored: s.stored,
    });
    a.active = null;
    return capped ? 0 : hitGaugeEnergy(a.slotIndex);
  };
  // アインのニアフェザー編（plan/design-ein-near-feather.md 1.2・1.3 節）: 召喚の機数と攻撃の進み。展開（戦闘開始と、その枠のバーストの
  // 効果のフレーム）で組を置き換えて進みを 0 に戻し、フレームごとに、いまの機数の間隔の逆数を進みに積む。1 に届いたフレームに攻撃が
  // 発火し（余りは持ち越す）、gaugePerHit の効果はそのフレームのゲージに射手の 1 ヒットぶん × 倍数を足す
  const summonHits: FirstPassResult['summonHits'] = [];
  const summonTrackers: {
    slotIndex: number;
    summon: SummonId;
    onBurstUse: SummonEffect | undefined;
    /** 機数ごとの、1 フレームに積む進み（間隔の逆数） */
    ratePerFrame: Readonly<Record<number, number>>;
    delayFrames: number;
    /** ヒットごとのゲージの倍数（gaugePerHit の効果ごと） */
    gaugeScales: number[];
    /** 進みを積み始めるフレーム（展開 + 遅れ。この後のフレームから積む）。展開の前は null */
    activeFrom: number | null;
    /** いまの組の、1 機ずつの消えるフレーム（昇順。消えない機は入れない）と、消えない機の数 */
    expiries: number[];
    stays: number;
    progress: number;
    /** 次に見るバーストの発動（activationsOf() の添字） */
    nextActivation: number;
  }[] = [];
  const deploySummon = (t: (typeof summonTrackers)[number], at: number, effect: SummonEffect): void => {
    const finite = effect.lifetimesSeconds.filter((x): x is number => x !== null);
    t.activeFrom = at + t.delayFrames;
    t.expiries = finite.map((x) => at + gameSecondsToFrames(x)).sort((a, b) => a - b);
    t.stays = effect.lifetimesSeconds.length - finite.length;
    t.progress = 0;
  };
  damageEffects.forEach((effects, i) => {
    const byId = new Map<SummonId, ResolvedDamageEffect[]>();
    for (const e of effects) {
      if (isSummonAttackTrigger(e.trigger)) byId.set(e.trigger.summon, [...(byId.get(e.trigger.summon) ?? []), e]);
    }
    if (byId.size === 0) return;
    const deploys = SKILL_SLOTS.flatMap((s) => slots[i]!.definition!.skills[s].effects).filter(
      (e): e is SummonEffect => e.kind === 'summon',
    );
    for (const [summon, attacks] of byId) {
      const trigger = attacks[0]!.trigger as SummonAttackTrigger;
      const t: (typeof summonTrackers)[number] = {
        slotIndex: i,
        summon,
        onBurstUse: deploys.find((d) => d.summon === summon && d.trigger === 'burstUse'),
        ratePerFrame: Object.fromEntries(
          Object.entries(trigger.intervalSeconds).map(([n, sec]) => [Number(n), 1 / (sec * FRAMES_PER_GAME_SECOND)]),
        ),
        delayFrames: gameSecondsToFrames(trigger.startDelaySeconds),
        gaugeScales: attacks.flatMap((e) => (e.gaugePerHit === undefined ? [] : [e.gaugePerHit])),
        activeFrom: null,
        expiries: [],
        stays: 0,
        progress: 0,
        nextActivation: 0,
      };
      // 戦闘開始時の展開はフレーム 0（フレーム 0 の終わりに、次のフレームの進みから積む）
      const atStart = deploys.find((d) => d.summon === summon && d.trigger === 'battleStart');
      if (atStart !== undefined) deploySummon(t, 0, atStart);
      summonTrackers.push(t);
    }
  });
  /** フレーム f の終わりに、f のバーストの展開を入れ、次のフレームの攻撃の進みを積む（発火したら次のフレームのゲージに予約する） */
  const countSummons = (f: number): void => {
    const activations = activationsOf();
    const g = f + 1;
    for (const t of summonTrackers) {
      while (t.nextActivation < activations.length) {
        const a = activations[t.nextActivation]!;
        if (a.slotIndex === t.slotIndex) {
          const at = effectFrameOf(a);
          if (at > f) break;
          if (t.onBurstUse !== undefined) deploySummon(t, at, t.onBurstUse);
        }
        t.nextActivation += 1;
      }
      if (g >= frames || t.activeFrom === null || g <= t.activeFrom) continue;
      while (t.expiries.length > 0 && t.expiries[0]! <= g) t.expiries.shift();
      const n = t.expiries.length + t.stays;
      if (n === 0) continue;
      t.progress += t.ratePerFrame[n]!;
      if (t.progress < 1 - 1e-9) continue;
      t.progress -= 1;
      summonHits.push({ slotIndex: t.slotIndex, summon: t.summon, frame: g });
      for (const scale of t.gaugeScales) reserveTimerGauge(t.slotIndex, f, g, hitGaugeEnergy(t.slotIndex) * scale);
    }
  };
  /**
   * 魔術師のカード編: フレーム f の終わりに、印のある周期の発火を決める（f に付いた縮める状態の件も見る）。発火したら記録し、その枠の
   * 印のある burstGaugeHit のゲージを遅れの後のフレームに予約する（ループの前の予約と同じ量）
   */
  const countCooldownTimers = (f: number): void => {
    for (const t of cooldownTrackers) {
      const i = t.slotIndex;
      const started = t.downs.find((d) => lists.stateStartedAt(i, d.state, f))?.short;
      const held = (): number | undefined => {
        const on = t.downs.filter((d) => lists.stateHeldAt(i, d.state, f));
        // 同じスロットを縮める状態が 2 つ同時に効く時の重ね方は確かめていない（使い手がいない。設計書 2.1 節）
        if (on.length > 1)
          throw new RangeError(`two or more states shorten the cooldown of ${t.skill} at once (not implemented)`);
        return on[0]?.short;
      };
      if (!t.tick(f, started, held)) continue;
      t.fires.push(f);
      const energy = hitGaugeEnergy(i);
      for (const d of t.gaugeDelays) if (f + d < frames) reserveTimerGauge(i, f, f + d, energy);
    }
  };
  const countDamageHitGauges = (f: number): void => {
    for (const t of damageTimerGauges) {
      if (!t.fires(f)) continue;
      const energy = hitGaugeEnergy(t.slotIndex) * t.effect.gaugePerHit!;
      for (const at of damageHitFramesOf(t.effect, f, frames)) reserveTimerGauge(t.slotIndex, f, at, energy);
    }
    for (const t of shotDamageGauges) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.everyAt?.(f) ?? t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      if (t.enemyState !== undefined && !lists.enemyStateAt(t.enemyState, f)) continue;
      const per = t.effect.perCount;
      const count = per !== undefined && 'state' in per ? lists.selfStackCountAt(t.slotIndex, per.state, f) : undefined;
      const energy = hitGaugeEnergy(t.slotIndex) * t.effect.gaugePerHit!;
      for (const hit of effectHitFrames(t.effect, f, count, frames)) landingGauge(t.slotIndex, hit, f, energy, 1);
    }
  };
  /** 着弾編: 先のフレームに効果が発火するバーストの発動（フレーム → 発動） */
  const pendingBurstEffects = new Map<number, BurstActivation[]>();
  /** エレグのバースト編（plan/design-elegg.md 8.9 節）: 先のフレームのバーストのヒット（トリガー burstHit） */
  const pendingBurstHits = new Map<number, BurstActivation[]>();
  /** 2 段目の段 14 の PR 1: 先のフレームの段階のきっかけ（stageEnterFrameOf。段階 3 は替わり目） */
  const pendingStageEntries = new Map<number, BurstStepKey[]>();
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

  /**
   * V-0534: 射撃の止まり。このフレームの射撃で発火したら、次のフレームから止める。2 段目の段 12 の PR 2: 回数の間隔の変更の窓を
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
  // 2 段目の段 15 の PR 2: T4 の▼ の件を持ちうる枠の、最後の発動（発動の後に付いた▼ の縮めた長さを足す先）
  const lastActivationOf = new Map<number, BurstActivation>();

  const instants: InstantApplication[] = [];
  // レッドフード編（plan/design-red-hood.md 2.3 節）: 戦闘中の発火の回数に上限（maxFires）のある即時効果の、効いた発火の回数
  const instantFireCounts = new Map<object, number>();
  // 2 段目の段 21: まだ窓に足していない延長（予約）の記録。窓を作ったら残し、窓を作らずにチェーンが切れたら（状態機械が予約を捨てる）か
  // 戦闘の終わりまで残ったら、即時効果の記録から外す（効かなかった延長を画面と trace に出さない）
  let pendingExtensions: InstantApplication[] = [];
  const discardedExtensions = new Set<InstantApplication>();
  const reserveExtension = (x: InstantApplication): void => {
    instants.push(x);
    pendingExtensions.push(x);
  };
  // 2 段目の段 21: バースト使用時の延長は、発動のたびに状態機械が聞く（条件は発動のフレームの件で見る。窓を作る発動ならその窓に、
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
  /** 段 17 の PR 1: 次のフレーム以降に遮蔽物 HP 回復を受ける枠（射撃の回数起点で、撃った枠と同じか前の枠）。フレーム → 受ける枠 */
  const pendingCoverHeals = new Map<number, number[]>();
  /** 段 17 の PR 1: このフレームに遮蔽物 HP 回復を受けた枠（FrameEvents.coverHealed）。healed と同じく使い回す */
  const coverHealed: boolean[] = slots.map(() => false);
  let coverHealedDirty = false;
  const shotEvents: (ShotEvent | null)[] = slots.map(() => null);

  /** Stage 16-B: いま見ている（または次に来る）狙えない窓の添字 */
  let nextBlock = 0;
  // V-0605: 枠ごとの撃たない区間（狙えない窓と、その枠の holdFire を合わせたもの）と、いま見ている区間の添字
  const slotBlocks = slotBlockRanges(slots.length, untargetable, options.holdFire);
  const slotNextBlock = slots.map(() => 0);

  for (let f = 0; f < frames; f++) {
    // Stage 16-B: 狙えない窓（バーストの制御が見る。射手のハイドは枠ごとの slotBlocks で、下の射手の中）
    while (nextBlock < untargetable.length && untargetable[nextBlock]!.end < f) nextBlock += 1;
    const block = untargetable[nextBlock];
    const blocked = block !== undefined && block.start <= f && f < block.end;
    // 2 段目の段 1: 時間で変わるゲージ速度の枠の、このフレームの (1 + 速度)（f − 1 までに付いた件）と、その速度の周期のゲージ
    for (const i of timedGaugeSlots) gaugeScale[i] = 1 + gaugeSpeed[i]! + lists.gaugeSpeedAt(i, f);
    for (const t of timedTimerGauges.get(f) ?? []) {
      reserveTimerGauge(t.slotIndex, f, f + t.delayFrames, targetEnergies[t.slotIndex]! * gaugeScale[t.slotIndex]!);
    }
    // 1. 射手（V-0030: 前のフレームまでに予約した段のヒットのゲージも、このフレームのゲージに入れる）
    let gauge = pendingGauge.get(f) ?? 0;
    pendingGauge.delete(f);
    for (const a of accumulators) gauge += stepAccumulator(a, f);
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
          // 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: 定義の即値の待ち（録画で読む）
          else if (params.weapon.firstShotDelayFrames !== undefined) {
            changedShooters[i]!.wait = params.weapon.firstShotDelayFrames;
          }
          // レッドフード編（plan/design-red-hood.md 7.1 節の論点 13。V-0639）: 持ち替え（フルバーストに入る発動なら窓の始まり）の時の
          // 基礎の武器の状態で、最初の発を決める
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
        // プリバティ編（plan/design-privaty-burst-pause.md 3 節の論点 4）: バーストの発動の止まりの明けは、狙えない窓の明けと同じく構え直す
        if (pauseLeft[i] === 0 && burstPauseAim[i]! > 0) {
          reaimShooter(state, shot, burstPauseAim[i]!, model, params);
          burstPauseAim[i] = 0;
        }
        return;
      }
      const reloading = state.phase === 'reloading';
      // 段 14 の PR 2: 撃つ前の溜めの進み（部分チャージの進みと同じ見え方）。リロード中・狙えない窓の間は溜めていない
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
      // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 基礎の武器のリロードを込め終えた。込め終えたフレームまでが
      // 「リロード完了時に解除」の窓（件の終わりは次のフレーム）
      // 2 段目の段 17 の PR 4（V-0601）: 1 回分が 0 フレームのリロード（リロード速度 100% 近く）は、最終弾の発の中で込め終える
      // （shooter.ts の fire）。フレームの始めにリロード中でなくても、最終弾を撃ってリロード中でなければ込め終えている
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
      // 2 段目の段 11: チャージしない変更後の武器の発は fullChargeShot に数えない。ナユタ編（plan/design-nayuta.md 2.6 節）: チャージ武器への
      // 変更を持つチャージしない基礎の武器の発も数えない（どちらも、発の武器がチャージ武器でない）
      const uncharged = log.fullCharge && !isChargeWeapon(shot);
      if (uncharged) (log.unchargedShotFrames ??= []).push(f);
      // 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9 節の論点 8）: 撃ち切りで終わる変更は、最後の弾丸を
      // 撃ったら次のフレームで基礎の武器に戻す（変更後の武器はリロードしない）。件の終わりも同じ列から作る（skills/holders.ts）
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
      // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 発のクリティカルの命中の期待値。会心率は基礎 + 常時の▲ +
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
      // 2 段目の段 11: チャージしない変更後の武器の発には、基礎の武器のフルチャージ倍率を掛けない（2026-10-27 のオーナー決定。
      // 変更後の武器の発のゲージは確かめていない。V-0528）。ヒットの数（gaugeHitsOf）は 1 発 1 ヒットのまま
      const gainEnergy = uncharged ? shotEnergy / chargeGaugeOf(i) : shotEnergy;
      const energy =
        gainEnergy * (isPartial ? partialGaugeRatio(slot.character.shot, i === controlledSlot, partial) : 1) +
        (obstacles[i]!.get(shotCounts[i]!) ?? 0) * obstacleEnergyAt(i);
      gauge += landingGauge(i, f + shotFlightAt(i, f), f, energy, gaugeHitsOf(i, shotEnergy));
    });
    // 蓄積爆破: 付いていなければフルチャージの発で付け、付いていれば発を次のフレームの頭に溜める（最大量に届いた後の発は溜めない）
    for (const a of accumulators) {
      const shot = shotEvents[a.slotIndex];
      if (shot === null || shot === undefined) continue;
      if (a.active === null) {
        if (shot.fullCharge)
          a.active = {
            applied: f,
            expire: f + a.acc.applyDelayFrames + a.acc.durationFrames,
            cap: null,
            stored: 0,
            reached: null,
          };
      } else if (a.active.reached === null) {
        const last = logs[a.slotIndex]!.partialShots?.at(-1);
        a.pending.push({ frame: f, progress: last?.frame === f ? last.progress : undefined });
      }
    }
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
      for (const d of t.gaugeHits) gauge += landingGauge(t.slotIndex, f + flight + d, f, energy, 1);
    }
    // モラン編: 射撃の回数でゲージだけを溜める効果。発火した射撃のフレームのゲージに足す（遅れがあれば、そのフレームに予約する）
    for (const t of shotGaugeTrackers) {
      const shot = shotEvents[t.slotIndex];
      if (shot === null || shot === undefined) continue;
      const counted = advanceShotCount(t.n, shotCountWeight(t.count, shot), t.every);
      t.n = counted.count;
      if (!counted.fired) continue;
      const energy = targetEnergyNow(t.slotIndex, t.energy);
      if (t.delayFrames === 0) gauge += energy;
      else if (f + t.delayFrames < frames) {
        pendingGauge.set(f + t.delayFrames, (pendingGauge.get(f + t.delayFrames) ?? 0) + energy);
      }
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
        // 回数トリガーの遅れ編の第 2 段（plan/design-shot-count-trigger-frame.md 6.6 節）: 付けたのは撃った 6f 後（C-0181）。
        // モデルの射撃のフレームは撃ったフレーム（C-0661）なので、その applyDelay 後のゲージに足す
        if (t.applyDelay === 0) {
          gauge += energy;
          dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f, energy });
        } else if (f + t.applyDelay < frames) {
          pendingGauge.set(f + t.applyDelay, (pendingGauge.get(f + t.applyDelay) ?? 0) + energy);
          dotGauges.push({ slotIndex: t.slotIndex, kind: 'apply', frame: f + t.applyDelay, energy });
        }
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
    // アニス：スター S1 の味方のゲージ編: このフレームに着いたほかの枠のゲージの回数に、このフレームの量を足す
    if (allyAdd !== null) {
      const hits = pendingAllyHits.get(f);
      if (hits !== undefined) {
        pendingAllyHits.delete(f);
        gauge += hits * (allyAddLanding !== null && f >= allyAddLanding ? allyAdd.after : allyAdd.before);
      }
    }
    // 2. ゲージと状態機械（planDynamicSchedule と同じく、このフレームの射撃のゲージを枠順に足してから 1 フレーム進める）
    if (controller !== null) {
      const before = controller.activations.length;
      const windowsBefore = controller.windows.length;
      const timeoutsBefore = controller.chainTimeouts.length;
      stepBurstController(controller, f, gauge, blocked);
      // 2 段目の段 21: 予約した延長は、窓を作ったら足され、窓を作らずにチェーンが切れたら捨てられる（burst/controller.ts の resetChain）
      if (pendingExtensions.length > 0) {
        const timedOut = controller.chainTimeouts.length > timeoutsBefore;
        if (timedOut) for (const x of pendingExtensions) discardedExtensions.add(x);
        if (timedOut || controller.windows.length > windowsBefore) pendingExtensions = [];
      }
      // 2 段目の段 11 の PR 3（plan/design-skill-stage11.md 3.3 節。V-0530）: バーストスキルのクールタイム▼ の維持の付いた形（T4。
      // 「その間スキル自体のクールタイムを変える」）。このフレームに発動した枠に効いている秒（f − 1 までに付いた件）だけ、その発動の
      // CT を短くする（明けるのは発動のフレームより前にしない）。常時（戦闘開始から持続の静的な状態の中身も）と時間で変わる件の和。
      // 即時の CT▼（reduceCooldown）とは別で、cooldownReductions に残さず、縮めた長さは発動の cooldownShortenedFrames に残す
      // 2 段目の段 15 の PR 2（plan/design-skill-stage15.md 2.2 節。V-0566）: 時間で変わる件は、発動の前のフレームに効いていた件だけ
      // （発動のフレームより後に付いた件は、下の「発動の後に付いた▼」が縮める。同じ件を 2 回数えない）
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
      // 2 段目の段 15 の PR 2: 発動の後に付いた T4 の▼（ティアの S1 のように、同じ発動から付いたものも）は、走っている CT をその場で
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
    // 着弾編: 効果の発火は発動 + 遅れのフレーム。先のフレームなら積んでおく（遅れの無いキャラはこのフレーム）
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
    // エレグのバースト編: ヒットのフレームも同じに積む（遅れの無いキャラは本当の発動か、III なら 00.00。hitFrameOf）
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
    // 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: このフレームにフルスタックになった状態を消費する（回復のきっかけ { fullStack }）。
    // フルスタックになる件は、射撃の回数のきっかけの付与なので前のフレームまでに登録済み
    const fullStacks = lists.consumeFullStacks(f);
    // 2 段目の段 11（plan/design-skill-stage11.md 2.2.1 節）: このフレームに使用武器の変更（撃ち切り）が終わった枠
    const weaponChangeEnds = logs.flatMap((log, i) => (log?.weaponChangeEnds?.at(-1) === f ? [i] : []));
    // 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: このフレームがリロードの込め終わりの次のフレームの枠
    const reloadEnds = logs.flatMap((log, i) => (log?.reloadEnds?.at(-1) === f ? [i] : []));
    // 2 段目の段 14 の PR 2: このフレームの溜めの周期と満ちた時（手順 1 の射手が射撃の記録に書いた）
    const chargeTicks = logs.flatMap(
      (log, i) =>
        log?.chargeTicks?.flatMap((t) =>
          t.frames.at(-1) === f ? [{ slotIndex: i, everySeconds: t.everySeconds }] : [],
        ) ?? [],
    );
    const chargeFulls = logs.flatMap((log, i) => (log?.chargeFullFrames?.at(-1) === f ? [i] : []));
    // 段 17 の PR 1: このフレームに遮蔽物 HP 回復を受けた枠（前のフレームの射撃で起きたものから。このフレームの分は下で足す）
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
    // V-0113: バースト使用時に付く持続ダメージ（クルミのハッキング）。付け直しと同じで、延びた tick のゲージを予約する
    // （burstUse のトリガーの判定と同じく、このフレームの効果の発火 burstEffects で見る）
    for (const t of dotGaugeTrackers) {
      if (t.onBurstUse && burstEffects.some((a) => a.slotIndex === t.slotIndex)) reserveDotTicks(t, f);
    }

    // 回復を先に当てる。射撃の回数起点は、撃った枠より後ろの枠にはこのフレーム、ほかの枠には次のフレームに送り（V-0490）、
    // それ以外はこのフレームの healed に立てる。対象の順位（topAttack）は、このフレームの件を登録する前に出す（回復を受けた時の
    // 攻撃力▲を含め、このフレームに付く窓は入れない。plan/design-heal-top-attack.md 2 節の A）
    for (const src of heals) {
      if (!src.fires(ev)) continue;
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

    // 段 17 の PR 1: 遮蔽物 HP 回復も回復と同じく件の登録の前に当てる（同じフレームの { coverHealed } の timed が読む）
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
      // 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6 節）: 発火の条件（いまは cooldownReduction の selfState だけ）
      if (!lists.instantConditionHolds(src.effect, src.sourceSlotIndex, f)) continue;
      // レッドフード編（plan/design-red-hood.md 2.1・2.3 節）: 使った段階（発火の文脈）と、戦闘中の発火の回数の上限。どちらで出なかった
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
      // ヘルム編: 射撃の回数トリガーでないバーストゲージのチャージは、対象によらず 1 回だけ、次のフレームのゲージに足す
      if (src.effect.kind === 'burstGauge') {
        if (controller === null || f + 1 >= frames) continue; // 固定サイクル・バーストなしではゲージを見ない
        const list = pendingGaugeCharges.get(f + 1) ?? [];
        list.push({ sourceSlotIndex: src.sourceSlotIndex, effect: src.effect });
        pendingGaugeCharges.set(f + 1, list);
        continue;
      }
      // 2 段目の段 21: 窓の外で発火したフルバーストタイムの延長（バースト 3 段階突入時）は、対象によらず 1 回だけ、次に作る窓に予約する
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
      // 紅蓮編（plan/design-scarlet.md 2.1 節）: 現在の HP▼ は自分の HP の割合を下げるだけ（次のフレームから読む）
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
        // 2 段目の段 11（plan/design-skill-stage11.md 2.2 節）: 残弾数減少は基礎の武器の残弾から残弾 × X% を減らす（端数は切り上げ）
        if (src.effect.kind === 'ammoDecrease') {
          const params = paramsAt(target, f);
          const before = state.ammo;
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
          instants.push({
            frame: f,
            sourceSlotIndex: src.sourceSlotIndex,
            slotIndex: target,
            effect: src.effect,
            amount: state.ammo - before,
          });
          continue;
        }
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
