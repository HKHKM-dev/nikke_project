// 効果を持ち主ごとの一覧で持つ（plan/design-holder-effects.md）。
// 段 A: 1 パス目のループ（frame/firstPass.ts）が、スキルによる効果を、効果を受ける枠（持ち主）ごとの件の列で持つ。
// 件の列は、出どころ × 効果 × 持ち主ごとの窓の始まりの列（昇順）で、件（窓）は段 A までの窓と同じ規則で作る（2.3 節）: 和集合の上書き延長
// （終わりのフレームちょうどの付き直しも続き）、スタックの段（skills/stacks.ts）、N 発間維持、フルバーストの終わり、撃ち切り、
// 吸収回復の付き直し（終わりのフレームちょうどに付けば新しく付いた）。件は、始まりの列とループで分かった出来事（射撃・使用武器の
// 変更の終わり・フルバーストの窓）から作り直すので、同じフレームの中で始まりが前後して登録されても（射撃の回数のきっかけは次の
// フレームから）、和集合とスタックと同じ件になる。ループの中の判定（射手・当たり・条件・順位）は件を読み、段 A までの段（1・1.5・2・
// 2.5 段目）の見え方は件の列の段の印で再現する（2.5 節）。強化（2.5 段目）の受け付けと値は、参照する件の一生が要るので、ループの後に
// 履歴を閉じる時に決める（amplify。ループの中で強化の件を読む所は無い）。ループの後は、履歴の値の小片から区間を作る（buffTimelineOf。
// 2.9 節）。値の小片の並びは時刻の順（論点 5）。段 B で 2 パス目（planBuffTimeline）を消し、件を作るのはここだけになった。段 E で、
// 窓と記録の書き出し（BuffTimeline の窓と記録の欄）を消し、読む側は履歴を直接読む。
import type { BurstScheduleModel, FullBurstWindow, BurstSchedule } from '../burst/schedule.ts';
import { dotActiveSpans, groupDotsByState } from '../frame/dot.ts';
import type { ShotLog } from '../frame/shots.ts';
import { resolveDotEffects, type ResolvedDamageEffect } from './burstDamage.ts';
import {
  ZERO_BUFFS,
  addRatioBuff,
  applyResolvedEffect,
  fixedAttackBaseOf,
  statTotal,
  type BuffTotals,
} from './buffs.ts';
import { chancePieces, chanceValueOf, type ChanceOpportunity } from './chance.ts';
import { resolveCycleEvery, type ResolvedCycleEvery } from './cycles.ts';
import {
  isResolvedApplied,
  isResolvedSelfHpAtMost,
  isResolvedChance,
  isResolvedFullStack,
  isResolvedShotCount,
  isResolvedTimer,
  isStateContent,
  resolveCounterChanges,
  resolveDotCancels,
  resolveInstant,
  resolveMaxStacksUps,
  resolvePassives,
  resolveRemoveStates,
  resolveStackChanges,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  resolveWhileEffects,
  type AppliedEffect,
  type ResolvedCounterChange,
  type ResolvedEffect,
  type ResolvedInstantEffect,
  type ResolvedRemoveState,
  type ResolvedStackChange,
  type ResolvedStateContent,
  type ResolvedStateGrant,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type ResolvedWhileEffect,
  type ResolvedCounterWhileEffect,
  isCounterWhileEffect,
  isTimedItem,
  resolveCounterWhileEffects,
  type ItemEffect,
} from './resolve.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type AttackItem, type RankingRecord } from './ranking.ts';
import { counterMax, type CounterId } from './counters.ts';
import { createSpanMemo } from './spanMemo.ts';
import { stackItems, STACK_REFRESH, type MaxStacksAt, type StackDecrease } from './stacks.ts';
import { stateMatches, statesMatching, type NamedStateId } from './states.ts';
import { canEverTarget, dependsOnDefense, dependsOnRank, isEffectTarget, type FireContext } from './targets.ts';
import {
  createTriggerTracker,
  fireContextOf,
  burstStepHolds,
  shotCountWeight,
  type FrameEvents,
  type FullStackEvent,
  type HealRecord,
  type ShotCountEveryAt,
  type TriggerTracker,
} from './triggers.ts';
import {
  SKILL_SLOTS,
  conditionReadsItems,
  isEndedTrigger,
  isMaxHpStat,
  isCounterFullTrigger,
  isEnemyHeldStat,
  isFiringStat,
  isHitStateStat,
  isStateStat,
  staticStatesOf,
  type BuffStat,
  type EndedTrigger,
  type EdgeShift,
  type EffectCondition,
  type TimerTrigger,
} from './types.ts';
import type { SkillSlot } from '../types.ts';
import {
  buildSegments,
  effectItems,
  rankSlotsOf,
  resolvePassiveStates,
  shotCountItems,
  timerFramesOf,
  unionItems,
  untilNextEndItems,
  weaponStartTrim,
  type AppliedRecord,
  type BuffTimeline,
  type ConditionSkip,
  type SlotBuffState,
  type TimelineLandings,
  type TimelineSlot,
} from './timeline.ts';

/**
 * 敵を持ち主にする（plan/design-holder-effects.md 2.8 節。段 C）: 件の列の持ち主。0 以上は味方の枠、ENEMY は敵（1 体の前提）。
 * 敵の件は、敵の受けるダメージ▲（damageTaken の timed）と、持続ダメージが付ける敵の状態
 */
export const ENEMY = -1;

/**
 * 敵が持つ効果か: 敵の受けるダメージ▲（damageTaken）と、2 段目の段 2 の敵の防御力▼（enemyDefenseDown）。値は、敵が受ける全ダメージに
 * 効くので、味方の各枠の区間の値に足す（値の小片で味方の各枠に写す。C-0138）
 */
export function isEnemyEffect(effect: { stat: string }): boolean {
  return isEnemyHeldStat(effect.stat);
}

/** 段の印（plan/design-holder-effects.md 2.5 節）。段 A までの 2 パス目の 1・1.5・2・2.5 段目 */
export type HeldStage = 1 | 1.5 | 2 | 2.5;

/** 件の列の出どころ */
export type HeldOrigin =
  | { kind: 'passive'; effect: ResolvedEffect }
  | { kind: 'timed'; effect: ResolvedTimedEffect }
  | { kind: 'state'; state: NamedStateId; grant: ResolvedStateGrant; contents: readonly ResolvedStateContent[] }
  | { kind: 'healWindow'; effect: ResolvedInstantEffect }
  | { kind: 'cycleEvery'; effect: ResolvedCycleEvery }
  /** 段 C: 持続ダメージが付ける敵の状態（持ち主は ENEMY。同じ状態の持続ダメージの効果をまとめる。frame/dot.ts の groupDotsByState） */
  | { kind: 'enemyState'; state: NamedStateId; effects: readonly ResolvedDamageEffect[] }
  /**
   * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果（while）。件は、出どころの枠のその状態の段 1 の件
   * から作る（whileItems。始まりの列を持たない）。2 段目の段 11 の PR 2: カウンタの while は、出どころの枠のカウンタの記録から作る
   */
  | { kind: 'while'; effect: ResolvedWhileEffect | ResolvedCounterWhileEffect };

/** 件（窓 [start, end)）。stack はスタックの段（1 始まり）、scale は確率のきっかけの付いている確率 */
export type HeldItem = { start: number; end: number; stack?: number; scale?: number };

/** 件の列: 1 つの出どころの、1 人の持ち主への件 */
export type HeldTrack = {
  /** 持ち主の枠（敵は ENEMY） */
  holder: number;
  /** 付けた枠 */
  sourceSlotIndex: number;
  /** 付けた枠のバフ前攻撃力（発動者基準の固定加算） */
  casterBaseAttack: number;
  /** 2 段目の段 6: 付けた枠の最終最大HP（casterFinalMaxHp の固定加算。skills/timeline.ts の TimelineSlot.casterMaxHp） */
  casterMaxHp?: number;
  origin: HeldOrigin;
  stage: HeldStage;
  /** 窓の始まり（昇順）。確率のきっかけは機会（opportunities）で持つ */
  starts: number[];
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 状態の件の列を閉じる解除の発火のフレーム（昇順・重なりなし）。発火の f に
   * 効いている件を f + 1 で切る（同じフレーム f に始まりのある列は閉じない）。状態のほかは空
   */
  closes: number[];
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フルスタックの消費のフレーム（昇順）。その時に付いている件を、同じフレームに
   * 始まった件も含めて次のフレームで切る（解除と違い、付与が勝つ規則を当てない）。状態のほかは空
   */
  consumes: number[];
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.5 節）: スタック量の減少（フレームの昇順）。そのフレームに効いている段の上から
   * N 段を次のフレームで切る（skills/stacks.ts）。スタックする状態のほかは空
   */
  decreases: StackDecrease[];
  /** 確率のきっかけの機会（出どころで共有。ほかは null） */
  opportunities: ChanceOpportunity[] | null;
  /**
   * マスト編（plan/design-mast.md 8 節）: durationUntil "selfHpAbove" の窓の終わり（発動者の HP の割合が閾値を上回ったフレーム。昇順。
   * 同じ発動者・閾値の件の列で共有する）。ほかは無い
   */
  untilEnds?: number[];
  /** 作った件（入力が変わったら作り直す。readItems で読む） */
  items: HeldItem[];
};

/** 強化（amplifies）の出どころ。受け付けと値は、ループの後に履歴を閉じる時に決める（amplify） */
export type AmplifierSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  /** 発火の窓の始まり（受け付ける前） */
  starts: number[];
};

/**
 * 強化の値の小片（plan/design-holder-effects.md 2.9 節）。受け付けた発火の窓の中で、参照する件が効いている所は
 * 割合 × その件の値、切れた所は (1 + 割合) × 発動の瞬間の値（段 A までの 2.5 段目と同じ作り方。V-0230）
 */
export type AmplifiedPiece = {
  holder: number;
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  end: number;
  value: number;
};

/** 履歴（plan/design-holder-effects.md 2.9 節）。件の列と、判定の記録 */
export type HolderHistory = {
  frames: number;
  slots: readonly TimelineSlot[];
  /** 常時パッシブだけの状態（skills/timeline.ts の resolvePassiveStates） */
  passive: readonly (SlotBuffState | null)[];
  /** 件の列（作った順: 常時 → timed → 状態 → 循環の間隔の変更 → 吸収回復） */
  tracks: readonly HeldTrack[];
  /** 強化の値の小片（受け付けた発火の分） */
  amplified: readonly AmplifiedPiece[];
  /** 状態が付いた記録（静的な状態はフレーム 0） */
  applications: readonly AppliedRecord[];
  /** 条件を満たさずに発火しなかった記録（フレームの順。強化の受け付けなかった発火も入る） */
  conditionSkips: readonly ConditionSkip[];
  rankings: readonly RankingRecord[];
  /** 回復の記録（回復を起こした適用。吸収回復の付き直しは入らない） */
  heals: readonly HealRecord[];
  /** ループで分かったフルバーストの窓（終わりで閉じる件を作り直すのに使う） */
  fullBurstWindows: readonly FullBurstWindow[];
  logs: readonly (ShotLog | null)[];
  /** 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの値が変わった記録（フレームの順。value は変わった後の値） */
  counters: readonly CounterRecord[];
};

/** 2 段目の段 10: カウンタの値が変わった記録 1 つ */
/**
 * カウンタの増減の記録。値はそのフレームのすべての判定の後に足したものなので、読む側には次のフレームから効く。battleStart は戦闘開始時の
 * 増減（フレーム 0 の記録で、フレーム 0 から効く）。効き始めは counterEffectiveFrom
 */
export type CounterRecord = { frame: number; slotIndex: number; counter: CounterId; value: number; battleStart?: true };

/** カウンタの記録が効き始めるフレーム（戦闘開始時の記録は 0、ほかは記録の次のフレーム） */
export function counterEffectiveFrom(record: CounterRecord): number {
  return record.battleStart === true ? 0 : record.frame + 1;
}

/**
 * 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.2 節）: 枠のカウンタの { counterFull } が発火するフレーム（上限に届いた記録の次の
 * フレーム。戦闘開始時の記録は 1。createHolderLists の counterFullAt と同じ）。damage・dot の { counterFull } が読む
 */
export function counterFullFrames(records: readonly CounterRecord[], slotIndex: number, counter: CounterId): number[] {
  return records
    .filter((r) => r.slotIndex === slotIndex && r.counter === counter && r.value === counterMax(counter))
    .map((r) => r.frame + 1);
}

export type HolderListsOptions = {
  frames: number;
  /** トリガーの判定に使う（バースト 1 段階突入時の意味） */
  scheduleModel: BurstScheduleModel | null;
  /** ループが書く射撃の列（N 発間維持・撃ち切りの件の終わりに読む） */
  logs: readonly (ShotLog | null)[];
  /** いま分かっているフルバーストの窓（始まりの順） */
  fullBurstWindows: () => readonly FullBurstWindow[];
  /**
   * テスト用（plan/design-first-pass-perf.md 4 節）: 件の列を読むたびに、いまの入力から作り直した件と比べ、違えば投げる。
   * 作り直す判定（readItems）が、件を作る関数の読む入力を落としていないことを確かめる。フレームごとに全部の件の列を読む
   */
  verifyItems?: boolean;
  /**
   * 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節の案 1）: leadFrames のある付与の、前の回で発火した発の
   * フレーム（leadShotKey ごと）。渡された発は、発 − leadFrames のフレームで件を登録し、発のフレームでは足さない（frame/firstPass.ts の
   * runFirstPass が回し直すときに渡す）
   */
  leadShots?: LeadShots;
};

/** leadFrames のある付与ごとの、発火した発のフレーム（昇順。leadShotKey ごと。発火の無い付与は入らない） */
export type LeadShots = Readonly<Record<string, readonly number[]>>;

/** leadFrames のある付与の鍵（出どころの枠・スロット・効果の番号） */
function leadShotKey(g: GrantSource): string {
  return `${g.group.sourceSlotIndex}.${g.grant.source.skill}.${g.grant.effectIndex}`;
}

/** 1 つの出どころ（timed の効果） */
type TimedSource = {
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  stage: HeldStage;
  fires: TriggerTracker;
  chance: boolean;
  /** 持ち主ごとの件の列（対象になりうる枠だけ）。敵の件の効果では、すべて null */
  tracks: (HeldTrack | null)[];
  /** 段 C: 敵の件の効果（isEnemyEffect）の、敵の件の列。ほかは null */
  enemy: HeldTrack | null;
};

/** 段 C: 持続ダメージが付ける敵の状態（出どころ × 状態）。発火は効果ごと */
type EnemyStateSource = { effects: { effect: ResolvedDamageEffect; fires: TriggerTracker }[]; track: HeldTrack };

/** 状態の付与 1 つ */
type GrantSource = { grant: ResolvedStateGrant; stage: HeldStage; fires: TriggerTracker; group: StateGroup };

/** 出どころ × 状態ごとの、時間で変わる状態（静的な付与の中身は常時パッシブ） */
type StateGroup = {
  sourceSlotIndex: number;
  state: NamedStateId;
  grants: GrantSource[];
  contents: ResolvedStateContent[];
  /** 状態の件が確定する段（付与のいちばん後の段） */
  stage: HeldStage;
  tracks: (HeldTrack | null)[];
  /**
   * エレグのバースト編（plan/design-elegg.md 8.2 節）: 敵に付く状態（付与の enemy）の、敵の 1 つの件の列。味方の tracks は全部 null。
   * 中身は敵の件の timed と同じく、対象の味方の各枠の区間の値に写す（piecesOfTrack）。ほかは null
   */
  enemy: HeldTrack | null;
};

type CycleSource = { slotIndex: number; effect: ResolvedCycleEvery; fires: TriggerTracker; track: HeldTrack };

/** 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除 1 つ（対象は自分） */
type RemoveSource = { sourceSlotIndex: number; effect: ResolvedRemoveState; stage: HeldStage; fires: TriggerTracker };

/** 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: スタック量の増減 1 つ（対象は自分。足す・減らす先は同じ定義の付与の状態の件の列） */
type StackSource = {
  sourceSlotIndex: number;
  effect: ResolvedStackChange;
  stage: HeldStage;
  fires: TriggerTracker;
  track: HeldTrack;
};

/** 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減 1 つ（対象は自分）。{ ended } のトリガーは fires を持たない */
type CounterSource = { sourceSlotIndex: number; effect: ResolvedCounterChange; fires: TriggerTracker | null };

/** 1 パス目のループが使う、持ち主ごとの件の一覧 */
export type HolderLists = {
  /** timed・状態・循環の間隔の変更のどれかがあるか（無ければ手順 3 の出来事は要らない） */
  readonly hasSources: boolean;
  /** ループの前（フレーム 0）に付く件（戦闘開始時・周期の atStart）を登録する */
  registerBattleStart(): void;
  /** 手順 3: フレーム ev.frame の出来事で件を登録する（回復と即時効果は呼ぶ側） */
  registerFrame(ev: FrameEvents): void;
  /** 枠 holder がフレーム frame に使う、射撃に効く stat の合計（常時の値に足す）。効いている件が無ければ null */
  firingBuffsAt(holder: number, frame: number, base: BuffTotals): BuffTotals | null;
  /** 射撃に効く件を持ちうるか */
  hasFiringTracks(holder: number): boolean;
  /** 枠 holder にフレーム frame に効いている持続の命中率▲の和 */
  hitUpAt(holder: number, frame: number): number;
  /** 当たりの stat の件の列があるか */
  readonly hasHitTracks: boolean;
  /**
   * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 枠 holder にフレーム frame に効いている、時間で変わる会心率▲と
   * 通常攻撃のクリティカル確率▲の和（timed・状態の中身。常時の値は含まない）。critHit の回数の量に使う
   */
  critUpAt(holder: number, frame: number): number;
  /** 効果 e の発火の文脈に、フレーム frame の攻撃力の順位を足す（topAttack の効果だけ） */
  rankContext(
    e: Parameters<typeof dependsOnRank>[0] & Parameters<typeof attackRankFor>[0],
    sourceSlotIndex: number,
    context: FireContext,
    frame: number,
  ): FireContext;
  /** 回復の効果 effect がフレーム frame に枠 holder に付く。回復を起こすなら true（吸収回復の付き直しなら false） */
  applyHeal(effect: ResolvedInstantEffect, sourceSlotIndex: number, holder: number, frame: number): boolean;
  /** 枠 holder の、撃ち切りで終わる使用武器の変更（weaponId）の開いている件があるか（閉じる前に見る） */
  openWeaponChange(holder: number, weaponId: string, end: number): boolean;
  /** 枠 slotIndex の、段の循環 targetSkill に効く間隔の変更の件のうち、フレーム frame に効いているものの間隔 */
  cycleEveryAt(slotIndex: number, targetSkill: string, frame: number): number[];
  /**
   * 2 段目の段 12 の PR 2: 枠 slotIndex のスロット skill の射撃の回数のきっかけの、フレームごとの間隔（cycleEvery の shotCounts の窓の
   * 中ならその間隔、外なら undefined。窓の無い組は undefined）。窓の件はそのフレームに付いたものも見るので、手順 3 の後に呼ぶ
   */
  shotCountEveryOf(slotIndex: number, skill: SkillSlot): ShotCountEveryAt | undefined;
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.6 節）: 枠 holder にフレーム frame に効いている、時間で変わるバーストゲージの
   * チャージ速度の和（timed・状態の中身。常時の値は含まない）。ゲージを足す手順 2 で呼べば f − 1 までに付いた件になる
   */
  gaugeSpeedAt(holder: number, frame: number): number;
  /** 時間で変わるバーストゲージのチャージ速度の件の列を持ちうるか */
  hasGaugeSpeedTracks(holder: number): boolean;
  /**
   * 2 段目の段 11 の PR 3（plan/design-skill-stage11.md 3.3 節）: 枠 holder にフレーム frame に効いている、バーストスキルの
   * クールタイム▼ の秒の和（burstCooldown。timed・状態の中身）。発動したフレームに呼ぶ（frame/firstPass.ts）
   */
  burstCooldownAt(holder: number, frame: number): number;
  /**
   * 2 段目の段 15 の PR 2（plan/design-skill-stage15.md 2.2 節）: 枠 holder の、バーストスキルのクールタイム▼ の件のうち、フレーム
   * frame に始まったものの秒の和（発動の後に付いた▼。frame/firstPass.ts が、走っている CT をその場で縮めるのに使う）
   */
  burstCooldownStartedAt(holder: number, frame: number): number;
  /** 同: バーストスキルのクールタイム▼ の件の列を持ちうるか */
  hasBurstCooldownTracks(holder: number): boolean;
  /**
   * 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6 節）: 即時効果 effect の発火の条件（cooldownReduction の selfState）が、
   * 出どころの枠 sourceSlotIndex でフレーム frame に満たされるか。timed の段 1.5 の条件と同じ件を見る。満たさなければ条件で出なかった
   * 記録を残す。手順 3 の後に呼ぶ
   */
  instantConditionHolds(effect: ResolvedInstantEffect, sourceSlotIndex: number, frame: number): boolean;
  /**
   * V-0545（plan/design-new-chars-1029.md 11.2 節の b）: 枠 holder が自分の状態 state（家族の根なら家族のどれか）をフレーム frame に
   * 持つか。frame/plan.ts の damage の selfState と同じく、静的な状態か、frame より前に付いて frame に続いている件を見る。1 パス目が
   * 周期の短縮（periodShorten）を追うのに、frame までに登録した件で呼ぶ
   */
  selfStateAt(holder: number, state: NamedStateId, frame: number): boolean;
  /**
   * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 枠 holder の自分の状態 state のスタック数（selfStateAt と同じ件の段の最大。
   * 静的な状態は 1、無ければ 0）。frame/plan.ts の damage の perCount { state } と同じ見え方で、1 パス目がオートファイアの順番の攻撃の
   * ヒットごとのゲージ（gaugePerHit）を予約するのに、frame までに登録した件で呼ぶ
   */
  selfStackCountAt(holder: number, state: NamedStateId, frame: number): number;
  /**
   * エレグの S1（C-0773）: 敵が状態 state をフレーム frame に持つか（条件 enemyState と同じ見え方。そのフレームに付いた件も入れる）。
   * 1 パス目が、条件 enemyState の付いた射撃の回数の倍率ダメージのヒットごとのゲージ（gaugePerHit）を予約するのに、frame までに登録した件で呼ぶ
   */
  enemyStateAt(state: NamedStateId, frame: number): boolean;
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フレーム frame にフルスタックになった状態（定義にその状態のフルスタックの消費の
   * きっかけを持つ枠の、自分の状態だけ）を返し、その状態の件を消費する（次のフレームで切る）。回復を当てる前（手順 3 の最初）に呼ぶ
   */
  consumeFullStacks(frame: number): FullStackEvent[];
  /** ループの後の、leadFrames のある付与が発火した発のフレーム（HolderListsOptions.leadShots に渡す形） */
  leadShots(): LeadShots;
  /** ループの後の履歴 */
  history(): HolderHistory;
};

/**
 * 窓の始まり。射撃の回数のきっかけは次のフレームから。回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）:
 * timed の delayFrames があれば、きっかけの delayFrames 後から（ナガ S2 は 6。C-0593・C-0653）。2026-10-29 のキャラの編
 * （plan/design-new-chars-1029.md 10.2 節の e）: 時間の周期のきっかけの付与の delayFrames は、周期の発火の delayFrames 後から（C-0736）
 */
export function startOfFire(trigger: ResolvedTrigger, frame: number, delayFrames?: number): number {
  if (isResolvedTimer(trigger)) return frame + (delayFrames ?? 0);
  if (!isResolvedShotCount(trigger)) return frame;
  return frame + (delayFrames ?? 1);
}

/**
 * 状態の付与の件の始まり（startOfFire）。徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: leadFrames のある付与は、
 * きっかけの発のフレームの leadFrames 前から（戦闘の始まりより前にはしない）
 */
function grantStartOf(grant: ResolvedStateGrant, frame: number): number {
  if (grant.leadFrames !== undefined) return Math.max(0, frame - grant.leadFrames);
  return startOfFire(grant.trigger, frame, grant.delayFrames);
}

/** 戦闘開始時の窓（ループの前に登録する）か */
function atBattleStart(t: ResolvedTrigger): boolean {
  return t === 'battleStart' || (isResolvedTimer(t) && 'atStart' in t && t.atStart === true);
}

/** 窓を [start, end) の件にする */
function itemsOfPairs(pairs: readonly (readonly [number, number])[]): HeldItem[] {
  return pairs.map(([start, end]) => ({ start, end }));
}

/** 吸収回復の窓（V-0024）: 付き直しは終わりを延ばし、終わりのフレームちょうどに付けば新しい件 */
/**
 * 最小構成の検査の窓の端編（plan/design-minimal-edge.md 3.3 節）: 件ごとに始まりと終わりを動かす（戦闘の範囲に切り詰め、長さ 0 以下は消す）。
 * 1 パス目は前から進むので、始まりを早めた分は、きっかけより前のフレームの 1 パス目の読みには効かない（バフの区間の表には効く）
 */
export function shiftEdges(items: readonly HeldItem[], shift: EdgeShift, frames: number): HeldItem[] {
  return items.flatMap((it) => {
    const start = Math.max(0, it.start + shift.start);
    const end = Math.min(frames, it.end + shift.end);
    return start < end ? [{ ...it, start, end }] : [];
  });
}

function healWindowItems(starts: readonly number[], durationFrames: number | undefined, frames: number): HeldItem[] {
  if (durationFrames === undefined) return [];
  const items: HeldItem[] = [];
  for (const s of starts) {
    if (s >= frames) continue;
    const end = Math.min(s + durationFrames, frames);
    const last = items[items.length - 1];
    if (last !== undefined && s < last.end) {
      last.end = Math.max(last.end, end);
      continue;
    }
    items.push({ start: s, end });
  }
  return items;
}

/**
 * 状態の件（段 A までの planBuffTimeline の stateWindowsOf と同じ規則）。2 段目の段 3: decreases はスタックする状態だけ。
 * 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: maxStacksAt は、最大スタック数▲の中身で上がる上限（無ければ付与の上限）
 */
function stateItems(
  grant: ResolvedStateGrant,
  starts: readonly number[],
  shotFrames: readonly number[],
  fullBurstEnds: readonly number[],
  frames: number,
  decreases: readonly StackDecrease[] = [],
  maxStacksAt?: MaxStacksAt,
): HeldItem[] {
  if (grant.durationShots !== undefined) {
    return itemsOfPairs(shotCountItems(starts, shotFrames, grant.durationShots, frames));
  }
  if (grant.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndItems(starts, fullBurstEnds, frames));
  }
  if (grant.maxStacks !== undefined) {
    return stackItems(
      starts,
      grant.durationFrames,
      frames,
      maxStacksAt ?? grant.maxStacks,
      grant.stackRefresh ?? STACK_REFRESH,
      decreases,
    ).map((w) => ({
      start: w.start,
      end: w.end,
      stack: w.stack,
    }));
  }
  return itemsOfPairs(unionItems(starts, grant.durationFrames, frames));
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除で閉じる状態の件。閉じる発火のフレーム c のうち、同じフレームに始まりの
 * 無いもの（付与が勝つ）で始まりの列を区切り、区切りごとに今と同じ規則で件を作って、c より前の区切りの件を c + 1 で切る。
 * 区切りの後の件は c + 1 以降に始まる。スタックしない件は、切った件と後の区切りの件がちょうど続けば 1 つにする（和集合の上書き延長と
 * 同じ見え方）。スタックする件は段ごとに切り、後の区切りは段 1 から数え直す。
 * 2 段目の段 3: スタック量の減少（decreases）は、そのフレームを含む区切り（前の区切りのフレームより後で、区切りのフレーム以前）に渡す
 */
function closedStateItems(
  starts: readonly number[],
  closes: readonly number[],
  build: (starts: readonly number[], decreases: readonly StackDecrease[]) => HeldItem[],
  consumes: readonly number[] = [],
  decreases: readonly StackDecrease[] = [],
): HeldItem[] {
  // 2 段目の段 3: フルスタックの消費は、同じフレームに始まった件も切る（区切りの前に入れる）。解除の区切りには同じフレームの始まりが無い
  const effective = [...new Set([...closes.filter((c) => !starts.includes(c)), ...consumes])].sort((a, b) => a - b);
  if (effective.length === 0) return build(starts, decreases);
  const out: HeldItem[] = [];
  let lower = -Infinity;
  for (const c of [...effective, Infinity]) {
    const segment = starts.filter((s) => s > lower && s <= c);
    const cuts = decreases.filter((d) => d.frame > lower && d.frame <= c);
    lower = c;
    for (const item of build(segment, cuts)) {
      const cut: HeldItem = { ...item, end: Math.min(item.end, c + 1) };
      if (cut.start >= cut.end) continue;
      const last = out[out.length - 1];
      if (last !== undefined && last.stack === undefined && cut.stack === undefined && cut.start <= last.end) {
        last.end = Math.max(last.end, cut.end);
        continue;
      }
      out.push(cut);
    }
  }
  return out;
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: スタック数の条件を満たすか。tracks は、持ち主のその状態の件の列ごとの出どころと、
 * そのフレームに効いている件。N はスタックの段の最大が N 以上、'full' はどれかの件の列の段の最大がその付与の上限に届いている。
 * 静的な状態（isStatic）は 1 段
 */
export function stacksHold(
  stacks: 'full' | number,
  isStatic: boolean,
  tracks: readonly { origin: HeldOrigin; items: readonly HeldItem[] }[],
): boolean {
  if (stacks === 'full') {
    return tracks.some(({ origin, items }) => {
      const max = origin.kind === 'state' ? origin.grant.maxStacks : undefined;
      return max !== undefined && items.some((it) => it.stack === max);
    });
  }
  let level = isStatic ? 1 : 0;
  for (const { items } of tracks) for (const it of items) level = Math.max(level, it.stack ?? 1);
  return level >= stacks;
}

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: while の件。効果を出した枠のその状態の件（段 1）のうち、スタックの条件を満たす
 * 段の件（'full' は付与の上限の段、N は N 段以上、条件が無ければ全部）の和で、重なる件と接した件は 1 つにする（和集合の上書き延長と同じ
 * 見え方）。スタックの条件の見方は stacksHold と同じ
 */
export function whileItems(
  own: readonly { origin: HeldOrigin; items: readonly HeldItem[] }[],
  stacks: 'full' | number | undefined,
): HeldItem[] {
  const spans: [number, number][] = [];
  for (const { origin, items } of own) {
    const max = origin.kind === 'state' ? origin.grant.maxStacks : undefined;
    for (const it of items) {
      if (it.start >= it.end) continue;
      const holds =
        stacks === undefined || (stacks === 'full' ? max !== undefined && it.stack === max : (it.stack ?? 1) >= stacks);
      if (holds) spans.push([it.start, it.end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: HeldItem[] = [];
  for (const [start, end] of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out;
}

/** timed の件（段 A までの planBuffTimeline の distribute と同じ規則）。確率のきっかけと強化は呼ぶ側 */
function timedItems(
  effect: ResolvedTimedEffect,
  starts: readonly number[],
  log: ShotLog | null | undefined,
  fullBurstEnds: readonly number[],
  frames: number,
  untilEnds: readonly number[] = [],
): HeldItem[] {
  // マスト編（plan/design-mast.md 8 節）: HP の割合が閾値を上回るフレームまで
  if (effect.durationUntil === 'selfHpAbove') return itemsOfPairs(untilNextEndItems(starts, untilEnds, frames));
  if (effect.durationShots !== undefined) {
    return itemsOfPairs(shotCountItems(starts, log?.frames ?? [], effect.durationShots, frames));
  }
  if (effect.durationUntil === 'ammoSpent') {
    // 和集合は発火のフレームで取り、頭は後で削る（段 A までの planBuffTimeline・1 パス目の register と同じ順）
    const trim = weaponStartTrim(effect);
    return untilNextEndItems(starts, log?.weaponChangeEnds ?? [], frames)
      .filter(([start, end]) => start + trim < end)
      .map(([start, end]) => ({ start: start + trim, end }));
  }
  if (effect.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndItems(starts, fullBurstEnds, frames));
  }
  // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 持ち主のリロードの込め終わりまで。まだ込め終わっていない件は
  // 戦闘の終わりまで開き、1 パス目が込め終わりを書いたら閉じる（読み直しが reloadEnds の長さを見る。trackReadsOf）
  if (effect.durationUntil === 'reloadEnd') {
    return itemsOfPairs(untilNextEndItems(starts, log?.reloadEnds ?? [], frames));
  }
  return effectItems(starts, effect, frames).map((w) => {
    const item: HeldItem = { start: w.start, end: w.end };
    if (w.stack !== undefined) item.stack = w.stack;
    return item;
  });
}

/**
 * 1 パス目の最適化の段 1（plan/design-first-pass-perf.md 3.1 節）: 件の列の件を作る関数（buildTrackItems）が、始まり・確率の機会・
 * 閉じるフレーム・消費のフレーム・減少のほかに読む入力。分かれ道は timedItems・stateItems と同じ。読まない入力の変化では作り直さない
 */
type TrackReads = {
  shots: boolean;
  weaponChangeEnds: boolean;
  reloadEnds: boolean;
  fullBurstWindows: boolean;
  untilEnds: boolean;
};

function trackReadsOf(origin: HeldOrigin): TrackReads {
  const reads = { shots: false, weaponChangeEnds: false, reloadEnds: false, fullBurstWindows: false, untilEnds: false };
  if (origin.kind !== 'timed' && origin.kind !== 'state') return reads;
  const { durationShots, durationUntil } = origin.kind === 'timed' ? origin.effect : origin.grant;
  if (durationShots !== undefined) {
    reads.shots = true;
    return reads;
  }
  // 尽くす（durationUntil が足されたら型検査で落ちる）。状態の件は fullBurstEnd のほかを読まない（stateItems）
  switch (durationUntil) {
    case 'ammoSpent':
      reads.weaponChangeEnds = true;
      break;
    case 'reloadEnd':
      reads.reloadEnds = origin.kind === 'timed';
      break;
    case 'fullBurstEnd':
      reads.fullBurstWindows = true;
      break;
    // マスト編: HP の割合の窓の終わり（件の列の untilEnds）
    case 'selfHpAbove':
      reads.untilEnds = true;
      break;
    case 'battleEnd':
    case undefined:
      break;
    default: {
      const never: never = durationUntil;
      throw new Error(`unknown durationUntil: ${String(never)}`);
    }
  }
  return reads;
}

/** テスト用（verifyItems）: 件を作る関数が読まない入力も見る */
const ALL_READS: TrackReads = {
  shots: true,
  weaponChangeEnds: true,
  reloadEnds: true,
  fullBurstWindows: true,
  untilEnds: true,
};

/** lengths[i] を n にし、前と違えば true */
function setLength(lengths: number[], i: number, n: number): boolean {
  if (lengths[i] === n) return false;
  lengths[i] = n;
  return true;
}

/**
 * 件の列（while のほか）の件を、いまの入力から作る。log は持ち主の射撃の記録（敵の件の列は null）。
 * 件は入力（追記・挿入だけで伸びる）と frames だけで決まるので、ループの後の件は、最後の入力から作り直した件と同じになる
 */
function buildTrackItems(
  track: HeldTrack,
  log: ShotLog | null | undefined,
  fullBurstWindows: readonly FullBurstWindow[],
  frames: number,
  /** 2 段目の段 14 の PR 3: 状態の件の列の、最大スタック数▲で上がる上限（無ければ付与の上限） */
  maxStacksAt?: MaxStacksAt,
): HeldItem[] {
  const o = track.origin;
  switch (o.kind) {
    case 'passive':
      return track.starts.length > 0 ? [{ start: 0, end: frames }] : [];
    case 'timed': {
      const items =
        track.opportunities !== null
          ? chancePieces(track.opportunities, o.effect.durationFrames, frames).map((p) => ({
              start: p.start,
              end: p.end,
              scale: p.scale,
            }))
          : timedItems(
              o.effect,
              track.starts,
              log,
              fullBurstWindows.map((w) => w.end),
              frames,
              track.untilEnds,
            );
      return o.effect.edgeShift !== undefined ? shiftEdges(items, o.effect.edgeShift, frames) : items;
    }
    case 'state': {
      const ends = fullBurstWindows.map((w) => w.end);
      return closedStateItems(
        track.starts,
        track.closes,
        (starts, decreases) => stateItems(o.grant, starts, log?.frames ?? [], ends, frames, decreases, maxStacksAt),
        track.consumes,
        track.decreases,
      );
    }
    case 'cycleEvery':
      return itemsOfPairs(unionItems(track.starts, o.effect.durationFrames, frames));
    case 'healWindow':
      return healWindowItems(track.starts, o.effect.durationFrames, frames);
    case 'enemyState': {
      // 付いている間は、最初の発火から最後の tick まで（frame/dot.ts の dotActiveSpans。クルミ S2 編の区間と同じ）。
      // 2 段目の段 13 の PR 2: 消去（cancelState）は、解除と同じく c + 1 で切り、後の付与から付き直す
      const { intervalSeconds, durationSeconds, firstTick } = o.effects[0]!.dot!;
      return closedStateItems(track.starts, track.closes, (starts) =>
        itemsOfPairs(
          dotActiveSpans(starts, intervalSeconds, durationSeconds, firstTick).map((sp) => [sp.start, sp.end]),
        ),
      );
    }
    case 'while':
      throw new Error('while items are built from the state items (readWhileItems)');
  }
}

/** 昇順の列 xs に x を入れる（同じ値は後ろ） */
function insertSorted(xs: number[], x: number): void {
  let i = xs.length;
  while (i > 0 && xs[i - 1]! > x) i--;
  xs.splice(i, 0, x);
}

/** 昇順の列 xs の、x 以下の最後の値（無ければ undefined。末尾から探す） */
function lastAtOrBefore(xs: readonly number[], x: number): number | undefined {
  let i = xs.length - 1;
  while (i >= 0 && xs[i]! > x) i--;
  return xs[i];
}

/** 段の印の並び（同じフレームの件の並び。段 → 出どころの枠 → 定義の順） */
const STAGE_RANK: Record<HeldStage, number> = { 1: 0, 1.5: 1, 2: 2, 2.5: 3 };

const SKILL_ORDER = Object.fromEntries(SKILL_SLOTS.map((s, i) => [s, i])) as Record<string, number>;

function compareKeys(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/** 出どころ × 状態ごとに、時間で変わる状態の付与をまとめる（段 A までの stateGroupsOf と同じ。静的な付与は常時パッシブ） */
function stateGroupsOf(
  slots: readonly TimelineSlot[],
  firesOf: (trigger: ResolvedTrigger, slotIndex: number) => TriggerTracker,
  appliedStageOf: (state: NamedStateId) => HeldStage,
): StateGroup[] {
  const groups: StateGroup[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    const contents = resolveStateContents(slot.definition, slot.character, slot.levels);
    for (const grant of resolveStateGrants(slot.definition, slot.character, slot.levels)) {
      if (grant.isStatic) continue;
      let group = groups.find((g) => g.sourceSlotIndex === sourceSlotIndex && g.state === grant.state);
      if (group === undefined) {
        group = {
          sourceSlotIndex,
          state: grant.state,
          grants: [],
          contents: contents.filter((c) => c.whileState === grant.state),
          stage: 1,
          tracks: slots.map(() => null),
          enemy: null,
        };
        groups.push(group);
      }
      // 2 段目の段 4: { applied } の付与は、見る状態を付ける付与の段（plan/design-skill-stage4.md 1.1 節）
      const stage: HeldStage = isResolvedApplied(grant.trigger)
        ? appliedStageOf(grant.trigger.applied)
        : stageOfGrant(grant);
      group.grants.push({ grant, stage, fires: firesOf(grant.trigger, sourceSlotIndex), group });
      if (STAGE_RANK[stage] > STAGE_RANK[group.stage]) group.stage = stage;
    }
  });
  return groups;
}

/** 状態の付与の段（{ applied } のほか）。2 段目の段 1: 件を見ない条件（usedBurst だけ）は段を上げない（plan/design-skill-stage1.md 1.5 節） */
function stageOfGrant(grant: ResolvedStateGrant): HeldStage {
  if (dependsOnRank(grant)) return 2;
  // 2 段目の段 10 の PR 3: 自分の状態のスタック数を数で読む付与も、件を見るので段 1.5
  return conditionReadsItems(grant.condition) || (grant.stacksFrom !== undefined && 'state' in grant.stacksFrom)
    ? 1.5
    : 1;
}

/** 2 段目の段 3: スタック量の増加の段（件を見る条件つきは段 1.5） */
function stageOfStackChange(effect: ResolvedStackChange): HeldStage {
  return conditionReadsItems(effect.condition) ? 1.5 : 1;
}

/**
 * 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: { applied } の効果の段。状態ごとに、その状態を付ける付与とスタック量の増加
 * （編成のどの枠でも。{ applied } のもの・静的な付与を除く）の段のいちばん後。無ければ（静的な状態だけ・付ける効果が無い）段 1
 */
function appliedStagesOf(slots: readonly TimelineSlot[]): (state: NamedStateId) => HeldStage {
  // { applied } の効果を持つ編成でだけ解く（初めて引かれた時）
  let stages: Map<NamedStateId, HeldStage> | null = null;
  const build = (): Map<NamedStateId, HeldStage> => {
    const out = new Map<NamedStateId, HeldStage>();
    const bump = (state: NamedStateId, stage: HeldStage): void => {
      const now = out.get(state);
      if (now === undefined || STAGE_RANK[stage] > STAGE_RANK[now]) out.set(state, stage);
    };
    for (const slot of slots) {
      if (slot === null || slot.definition === null) continue;
      for (const grant of resolveStateGrants(slot.definition, slot.character, slot.levels)) {
        if (!grant.isStatic && !isResolvedApplied(grant.trigger)) bump(grant.state, stageOfGrant(grant));
      }
      for (const effect of resolveStackChanges(slot.definition, slot.character, slot.levels)) {
        bump(effect.state, stageOfStackChange(effect));
      }
    }
    return out;
  };
  return (state) => (stages ??= build()).get(state) ?? 1;
}

/** timed の効果の段（強化の受け付けと値は、履歴を閉じる時に決める） */
function stageOfTimed(effect: ResolvedTimedEffect): HeldStage {
  if (effect.amplifies !== undefined) return 2.5;
  // 2 段目の段 7: 最終防御力の比べの対象も、順位と同じく段 1・1.5 の件（防御力▲）が出そろってから決める
  if (dependsOnRank(effect) || dependsOnDefense(effect)) return 2;
  // 2 段目の段 1: 件を見ない条件（usedBurst だけ）は段を上げない（plan/design-skill-stage1.md 1.5 節）
  if (conditionReadsItems(effect.condition)) return 1.5;
  return 1;
}

export function createHolderLists(slots: readonly TimelineSlot[], options: HolderListsOptions): HolderLists {
  const { frames, logs } = options;
  const passive = resolvePassiveStates(slots);
  const tracks: HeldTrack[] = [];
  const applications: AppliedRecord[] = [];
  const conditionSkips: ConditionSkip[] = [];
  const rankings: RankingRecord[] = [];
  const heals: HealRecord[] = [];
  const amplifiers: AmplifierSource[] = [];

  /**
   * 件の列ごとの、件を作る関数が読む入力（trackReadsOf）と、件を作った時の入力の長さ（始まり・機会・射撃・使用武器の変更の終わり・
   * リロードの込め終わり・フルバーストの窓・閉じるフレーム・消費のフレーム・減少・上限を上げる状態の件の列の入力。読まない入力は 0。
   * updateLengths）
   */
  const itemsSeen = new Map<HeldTrack, { reads: TrackReads; lengths: number[]; verified: number[] }>();
  const newTrack = (
    holder: number,
    sourceSlotIndex: number,
    origin: HeldOrigin,
    stage: HeldStage,
    opportunities: ChanceOpportunity[] | null = null,
  ): HeldTrack => {
    const track: HeldTrack = {
      holder,
      sourceSlotIndex,
      casterBaseAttack: slots[sourceSlotIndex]?.casterBaseAttack ?? 0,
      casterMaxHp: slots[sourceSlotIndex]?.casterMaxHp,
      origin,
      stage,
      starts: [],
      closes: [],
      consumes: [],
      decreases: [],
      opportunities,
      items: [],
    };
    tracks.push(track);
    // verified はテスト用（verifyItems）: 確かめた時の入力の長さ（件を作る関数が読まない入力も含む）
    itemsSeen.set(track, { reads: trackReadsOf(origin), lengths: new Array<number>(10).fill(-1), verified: [] });
    return track;
  };
  const counterKey = (slotIndex: number, counter: CounterId): string => `${slotIndex}:${counter}`;
  /** 件の列を frame で閉じる（同じフレームは 1 つ。戦闘の後は閉じない）。効果解除（fireRemove）とカウンタの 0（registerCounters） */
  const closeTrack = (track: HeldTrack, frame: number): void => {
    if (frame < frames && !track.closes.includes(frame)) insertSorted(track.closes, frame);
  };
  /** 2 段目の段 11 の PR 2: 枠のカウンタが上限に届いたフレームの次のフレーム（{ counterFull } の発火。届くたびに書き替える） */
  const counterFullAt = new Map<string, number>();
  /** 周期のトリガーは出来事の列に無いので、周期のフレームで発火する（atStart のフレーム 0 はループの前に登録する） */
  /**
   * マスト編（plan/design-mast.md 8 節）: 発動者 × 閾値ごとの、HP の割合の窓の追跡。毎フレームのきっかけの判定で 1 回だけ割合を求め、
   * 閾値以下に下がったフレーム（dropped）と、上回ったフレーム（ends。件の列の untilEnds と共有）を記録する
   */
  type SelfHpState = {
    slotIndex: number;
    threshold: number;
    frame: number;
    low: boolean;
    dropped: boolean;
    ends: number[];
  };
  const selfHpStates = new Map<string, SelfHpState>();
  const selfHpStateOf = (slotIndex: number, threshold: number): SelfHpState => {
    const key = `${slotIndex}:${threshold}`;
    let state = selfHpStates.get(key);
    if (state === undefined) {
      state = { slotIndex, threshold, frame: -1, low: false, dropped: false, ends: [] };
      selfHpStates.set(key, state);
    }
    return state;
  };
  const selfHpDropped = (state: SelfHpState, frame: number): boolean => {
    if (state.frame !== frame) {
      const low = selfHpRatioAt(state.slotIndex, frame) <= state.threshold + 1e-9;
      if (state.low && !low && frame < frames) state.ends.push(frame);
      state.dropped = low && !state.low;
      state.low = low;
      state.frame = frame;
    }
    return state.dropped;
  };
  const firesOf = (trigger: ResolvedTrigger, slotIndex: number, everyAt?: ShotCountEveryAt): TriggerTracker => {
    // 2 段目の段 4: { applied } は出来事では発火しない（段の登録の後に、付いた記録から発火する。dispatchApplied）
    if (isResolvedApplied(trigger)) return () => false;
    // マスト編（plan/design-mast.md 8 節）: 自分の HP の割合が閾値以下に下がったフレーム（上がったフレームは窓の終わりに書く）
    if (isResolvedSelfHpAtMost(trigger)) {
      const state = selfHpStateOf(slotIndex, trigger.selfHpAtMost);
      return (ev) => selfHpDropped(state, ev.frame);
    }
    // 2 段目の段 11 の PR 2・段 13 の PR 1: カウンタが上限に届いた次のフレーム（registerCounters が counterFullAt に書く）
    if (isCounterFullTrigger(trigger)) {
      const key = counterKey(slotIndex, trigger.counterFull);
      return (ev) => counterFullAt.get(key) === ev.frame;
    }
    if (!isResolvedTimer(trigger)) return createTriggerTracker(trigger, slotIndex, options.scheduleModel, everyAt);
    const at = new Set(timerFramesOf(trigger, frames));
    return (ev) => at.has(ev.frame);
  };

  // ---- 常時の件（スキルの常時パッシブと静的な状態の中身。論点 3）。戦闘の始めから終わりまで ----
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolvePassives(slot.definition, slot.character, slot.levels)) {
      slots.forEach((target, holder) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, holder, target.character)) return;
        const track = newTrack(holder, sourceSlotIndex, { kind: 'passive', effect }, 1);
        if (frames > 0) track.starts.push(0);
      });
    }
  });

  // ---- 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: { applied } の効果の段（見る状態を付ける付与の段） ----
  const appliedStageOf = appliedStagesOf(slots);

  // ---- timed の出どころ（持ち主ごとの件の列は、対象になりうる枠にだけ作る） ----
  const timedSources: TimedSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      const stage = isResolvedApplied(effect.trigger) ? appliedStageOf(effect.trigger.applied) : stageOfTimed(effect);
      if (stage === 2.5) {
        amplifiers.push({ sourceSlotIndex, effect, starts: [] });
        continue;
      }
      const chance = isResolvedChance(effect.trigger);
      const opportunities: ChanceOpportunity[] | null = chance ? [] : null;
      const canTarget = slots.map(
        (target, holder) => target !== null && canEverTarget(effect, sourceSlotIndex, holder, target.character),
      );
      // 段 C: 敵の件の効果は、味方ごとではなく敵の 1 つの件の列に付ける
      const enemy = isEnemyEffect(effect);
      const src: TimedSource = {
        sourceSlotIndex,
        effect,
        stage,
        fires: firesOf(effect.trigger, sourceSlotIndex),
        chance,
        tracks: canTarget.map((can, holder) =>
          can && !enemy ? newTrack(holder, sourceSlotIndex, { kind: 'timed', effect }, stage, opportunities) : null,
        ),
        enemy:
          enemy && canTarget.some(Boolean)
            ? newTrack(ENEMY, sourceSlotIndex, { kind: 'timed', effect }, stage, opportunities)
            : null,
      };
      // マスト編: HP の割合の窓の終わりは、発動者 × 閾値の追跡と共有する
      if (isResolvedSelfHpAtMost(effect.trigger)) {
        const ends = selfHpStateOf(sourceSlotIndex, effect.trigger.selfHpAtMost).ends;
        for (const track of [...src.tracks, src.enemy]) if (track !== null) track.untilEnds = ends;
      }
      timedSources.push(src);
    }
  });

  // ---- 時間で変わる状態（出どころ × 状態 × 持ち主ごとに 1 つの件の列） ----
  const stateGroups = stateGroupsOf(slots, firesOf, appliedStageOf);
  for (const group of stateGroups) {
    const grant = group.grants[0]!.grant;
    // エレグのバースト編: 敵に付く状態は、敵の 1 つの件の列（対象の味方が編成にいれば）
    if (grant.enemy === true) {
      if (slots.some((t, holder) => t !== null && canEverTarget(grant, group.sourceSlotIndex, holder, t.character))) {
        group.enemy = newTrack(
          ENEMY,
          group.sourceSlotIndex,
          { kind: 'state', state: group.state, grant, contents: group.contents },
          group.stage,
        );
      }
      continue;
    }
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!group.grants.some((g) => canEverTarget(g.grant, group.sourceSlotIndex, holder, target.character))) return;
      group.tracks[holder] = newTrack(
        holder,
        group.sourceSlotIndex,
        { kind: 'state', state: group.state, grant, contents: group.contents },
        group.stage,
      );
    });
  }

  // ---- 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果（while）。対象ごとに件の列（段 1.5）。
  // 件は出どころの枠の状態の件から作るので、始まりは登録しない（readWhileItems） ----
  const whileTracks: HeldTrack[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of [
      ...resolveWhileEffects(slot.definition, slot.character, slot.levels),
      ...resolveCounterWhileEffects(slot.definition, slot.character, slot.levels),
    ]) {
      slots.forEach((target, holder) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, holder, target.character)) return;
        whileTracks.push(newTrack(holder, sourceSlotIndex, { kind: 'while', effect }, 1.5));
      });
    }
  });

  // ---- 循環の間隔の変更（対象は自分） ----
  const cycleSources: CycleSource[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCycleEvery(slot.definition, slot.character, slot.levels)) {
      cycleSources.push({
        slotIndex,
        effect,
        fires: firesOf(effect.trigger, slotIndex),
        track: newTrack(slotIndex, slotIndex, { kind: 'cycleEvery', effect }, 1),
      });
    }
  });

  // ---- 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除（対象は自分。件を見る条件つきは段 1.5） ----
  const removeSources: RemoveSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveRemoveStates(slot.definition, slot.character, slot.levels)) {
      removeSources.push({
        sourceSlotIndex,
        effect,
        stage: conditionReadsItems(effect.condition) ? 1.5 : 1,
        fires: firesOf(effect.trigger, sourceSlotIndex),
      });
    }
  });

  // ---- 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: スタック量の増減（足す・減らす先は、同じ定義の付与の状態の、自分の件の列） ----
  const stackSources: StackSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveStackChanges(slot.definition, slot.character, slot.levels)) {
      const group = stateGroups.find((g) => g.sourceSlotIndex === sourceSlotIndex && g.state === effect.state);
      const track = group?.tracks[sourceSlotIndex] ?? null;
      if (track === null) {
        throw new Error(
          `no state track for ${effect.state} on slot ${sourceSlotIndex} (stackChange needs a grant on self)`,
        );
      }
      stackSources.push({
        sourceSlotIndex,
        effect,
        stage: stageOfStackChange(effect),
        fires: firesOf(effect.trigger, sourceSlotIndex),
        track,
      });
    }
  });

  /** フレーム frame がフルバーストの窓 [start, end) の中か（条件 inFullBurst） */
  const inFullBurstAt = (frame: number): boolean =>
    options.fullBurstWindows().some((w) => w.start <= frame && frame < w.end);

  /**
   * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 枠 slotIndex のスロット skill の射撃の回数のきっかけの、フレームごとの間隔
   * （cycleEvery の shotCounts の窓の中ならその間隔。重なれば小さいほう）。窓の件はそのフレームに付いたものも見る
   */
  const shotCountEveryOf = (slotIndex: number, skill: SkillSlot): ShotCountEveryAt | undefined => {
    const own = cycleSources.filter(
      (c) => c.slotIndex === slotIndex && c.effect.target === 'shotCounts' && c.effect.targetSkill === skill,
    );
    if (own.length === 0) return undefined;
    return (frame) => {
      let every: number | undefined;
      for (const c of own) {
        if (readItems(c.track).some((it) => it.start <= frame && frame < it.end))
          every = every === undefined ? c.effect.every : Math.min(every, c.effect.every);
      }
      return every;
    };
  };

  // ---- 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減（対象は自分。値は枠 × カウンタごとに 1 つ） ----
  /**
   * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節）: 枠 × 状態ごとの、その枠に付いた記録のフレーム（昇順）。counterChange の { applied } と
   * 周期の since が読む。読むたびに、まだ見ていない記録を足す
   */
  const ownApplied = new Map<string, number[]>();
  let ownAppliedSeen = 0;
  const ownAppliedOf = (slotIndex: number, state: NamedStateId): readonly number[] => {
    for (; ownAppliedSeen < applications.length; ownAppliedSeen++) {
      const r = applications[ownAppliedSeen]!;
      const key = `${r.slotIndex}:${r.state}`;
      const list = ownApplied.get(key) ?? [];
      if (!list.includes(r.frame)) insertSorted(list, r.frame);
      ownApplied.set(key, list);
    }
    return ownApplied.get(`${slotIndex}:${state}`) ?? [];
  };
  /** 同: 枠にその状態の件（段によらない）が効いているか */
  const ownStateActive = (slotIndex: number, state: NamedStateId, frame: number): boolean =>
    (stateTracks[slotIndex]?.get(state) ?? []).some((t) => activeAt(t, frame).length > 0);
  /**
   * 同（論点 2）: 状態の付いた時から数える周期（since）。起点はそのフレームまでに付いた最後の記録で、k 回目は起点から k × everySeconds 秒
   * （timerFramesOf と同じ数え方）。その状態が効いている間だけ
   */
  const sinceFires = (trigger: TimerTrigger, slotIndex: number): TriggerTracker => {
    const state = trigger.since!.applied;
    const offsets = new Set(timerFramesOf(trigger, frames));
    return (ev) => {
      const start = lastAtOrBefore(ownAppliedOf(slotIndex, state), ev.frame);
      return start !== undefined && offsets.has(ev.frame - start) && ownStateActive(slotIndex, state, ev.frame);
    };
  };
  const counterSources: CounterSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveCounterChanges(slot.definition, slot.character, slot.levels)) {
      const t = effect.trigger;
      counterSources.push({
        sourceSlotIndex,
        effect,
        fires:
          isEndedTrigger(t) || isResolvedApplied(t)
            ? null
            : isResolvedTimer(t) && t.since !== undefined
              ? sinceFires(t, sourceSlotIndex)
              : firesOf(t, sourceSlotIndex, shotCountEveryOf(sourceSlotIndex, effect.source.skill)),
      });
    }
  });
  const counterValues = new Map<string, number>();
  const counterRecords: CounterRecord[] = [];
  /** 枠のカウンタの、いまの値（そのフレームの増減は、すべての判定の後に足すので、前のフレームの終わりの値） */
  const counterValue = (slotIndex: number, counter: CounterId): number =>
    counterValues.get(counterKey(slotIndex, counter)) ?? 0;
  // ---- 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フルスタックの消費（定義の回復のきっかけ { fullStack } の状態。自分だけ）。
  // 段 11（plan/design-skill-stage11.md 2.1 節）: 使用武器の変更のきっかけ { fullStack } の状態も ----
  const consuming: { holder: number; state: NamedStateId }[] = [];
  slots.forEach((slot, holder) => {
    if (slot === null || slot.definition === null) return;
    const effects = [
      ...resolveInstant(slot.definition, slot.character, slot.levels),
      ...resolveTimed(slot.definition, slot.character, slot.levels).filter((e) => e.stat === 'weapon'),
    ];
    for (const effect of effects) {
      if (!isResolvedFullStack(effect.trigger)) continue;
      const state = effect.trigger.fullStack;
      if (!consuming.some((c) => c.holder === holder && c.state === state)) consuming.push({ holder, state });
    }
  });

  // ---- 吸収回復の窓（効果ごと・持ち主ごと。C-0082・C-0087） ----
  /** 効果は出どころの枠・スロット・効果の番号で引く（1 パス目は効果を別に解決するので、同じオブジェクトではない） */
  const healKey = (sourceSlotIndex: number, effect: ResolvedInstantEffect): string =>
    `${sourceSlotIndex}:${effect.source.skill}:${effect.effectIndex}`;
  const healTracks = new Map<string, (HeldTrack | null)[]>();
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      if (effect.kind !== 'heal') continue;
      healTracks.set(
        healKey(sourceSlotIndex, effect),
        slots.map((target, holder) =>
          target !== null && canEverTarget(effect, sourceSlotIndex, holder, target.character)
            ? newTrack(holder, sourceSlotIndex, { kind: 'healWindow', effect }, 1)
            : null,
        ),
      );
    }
  });

  // ---- 段 C: 持続ダメージが付ける敵の状態（出どころ × 状態ごとに 1 つの件の列。持ち主は敵） ----
  const enemyStateSources: EnemyStateSource[] = [];
  const dotCancelSources: { track: HeldTrack; fires: TriggerTracker }[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const group of groupDotsByState(resolveDotEffects(slot.definition, slot.character, slot.levels))) {
      const state = group[0]!.dot!.state;
      if (state === undefined) continue;
      enemyStateSources.push({
        effects: group.map((effect) => ({ effect, fires: firesOf(effect.trigger, sourceSlotIndex) })),
        track: newTrack(ENEMY, sourceSlotIndex, { kind: 'enemyState', state, effects: group }, 1),
      });
    }
    // 2 段目の段 13 の PR 2（plan/design-skill-stage13.md 2.5 節）: 消去（cancelState）は、同じ枠の持続ダメージの状態の件を閉じる
    for (const cancel of resolveDotCancels(slot.definition, slot.character, slot.levels)) {
      const source = enemyStateSources.find(
        ({ track }) =>
          track.sourceSlotIndex === sourceSlotIndex &&
          track.origin.kind === 'enemyState' &&
          track.origin.state === cancel.state,
      )!;
      dotCancelSources.push({ track: source.track, fires: firesOf(cancel.trigger, sourceSlotIndex) });
    }
  });

  // 静的な状態はフレーム 0 に付いた記録を作る（見る側の規則を状態の種類で分けない。plan/design-named-state.md 5.4 節）
  if (frames > 0) {
    slots.forEach((slot, slotIndex) => {
      for (const state of staticStatesOf(slot?.definition)) {
        applications.push({ frame: 0, state, sourceSlotIndex: slotIndex, slotIndex });
      }
    });
  }

  // ---- 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節。論点 5）: 状態の中身の最大スタック数▲ ----
  // 上限が上がる件の列（持ち主のその状態の、スタックする件の列）→ 上げる状態の件の列（同じ持ち主に、中身を持つ定義の枠が付けたもの）と量
  const capRaisers = new Map<HeldTrack, { base: number; raisers: { track: HeldTrack; amount: number }[] }>();
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const up of resolveMaxStacksUps(slot.definition, slot.character, slot.levels)) {
      for (const raiser of tracks) {
        const r = raiser.origin;
        if (r.kind !== 'state' || raiser.sourceSlotIndex !== sourceSlotIndex || r.state !== up.whileState) continue;
        for (const target of tracks) {
          const t = target.origin;
          if (target.holder !== raiser.holder || t.kind !== 'state' || t.state !== up.state) continue;
          if (t.grant.maxStacks === undefined) continue;
          const entry = capRaisers.get(target) ?? { base: t.grant.maxStacks, raisers: [] };
          entry.raisers.push({ track: raiser, amount: up.amount });
          capRaisers.set(target, entry);
        }
      }
    }
  });
  /**
   * 件の列の、始まりのフレームごとの上限（上げる状態の件がそのフレームに付いていれば量を足す。上げる状態のスタック数によらず 1 回）。
   * 上げる件の列が無ければ undefined（付与の上限のまま）。上げる件の列の件は、件を作る直前に 1 回だけ読む（その入力が変われば updateLengths
   * が作り直させる）
   */
  const maxStacksAtOf = (track: HeldTrack): MaxStacksAt | undefined => {
    const entry = capRaisers.get(track);
    if (entry === undefined) return undefined;
    const raisers = entry.raisers.map((r) => ({ items: readItems(r.track), amount: r.amount }));
    return (frame) => {
      let cap = entry.base;
      for (const r of raisers) if (r.items.some((it) => it.start <= frame && frame < it.end)) cap += r.amount;
      return cap;
    };
  };

  // ---- 件を作る ----
  /**
   * 件の列の、件を作る関数が読む入力（reads）の長さを lengths に書き、前に書いた長さと違えば true（読まない入力は 0）。
   * 毎フレーム読まれるので、配列を作らずに比べる（plan/design-first-pass-perf.md 3.1 節）
   */
  const updateLengths = (
    track: HeldTrack,
    log: ShotLog | null | undefined,
    reads: TrackReads,
    lengths: number[],
  ): boolean => {
    let changed = setLength(lengths, 0, track.starts.length);
    changed = setLength(lengths, 1, track.opportunities?.length ?? 0) || changed;
    changed = setLength(lengths, 2, reads.shots ? (log?.frames.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 3, reads.weaponChangeEnds ? (log?.weaponChangeEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 4, reads.reloadEnds ? (log?.reloadEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 5, reads.fullBurstWindows ? options.fullBurstWindows().length : 0) || changed;
    changed = setLength(lengths, 6, track.closes.length) || changed;
    changed = setLength(lengths, 7, track.consumes.length) || changed;
    changed = setLength(lengths, 8, track.decreases.length) || changed;
    changed = setLength(lengths, 10, reads.untilEnds ? (track.untilEnds?.length ?? 0) : 0) || changed;
    // 2 段目の段 14 の PR 3: 上限を上げる状態の件の列の入力（始まり・閉じる・消費・減少。その件の列は持続の付与で、ほかの入力を読まない）
    const raisers = capRaisers.get(track)?.raisers;
    if (raisers === undefined) return changed;
    let raised = 0;
    for (const r of raisers)
      raised += r.track.starts.length + r.track.closes.length + r.track.consumes.length + r.track.decreases.length;
    return setLength(lengths, 9, raised) || changed;
  };
  /** 件の列の件（件を作る関数が読む入力が変わったときだけ作り直す） */
  const readItems = (track: HeldTrack): HeldItem[] => {
    // 2 段目の段 9 の PR 2: while の件は、出どころの枠の状態の件から作る（入力の長さでなく、元の件が作り直されたかで見る）
    if (track.origin.kind === 'while') {
      const effect = track.origin.effect;
      return isCounterWhileEffect(effect) ? readCounterWhileItems(track, effect) : readWhileItems(track, effect);
    }
    const log = track.holder === ENEMY ? null : logs[track.holder];
    const { reads, lengths, verified } = itemsSeen.get(track)!;
    if (updateLengths(track, log, reads, lengths)) {
      track.items = buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track));
    } else if (options.verifyItems === true) {
      // 作り直さずに返す件が、いまの入力から作り直した件と同じか（入力のどれも変わっていなければ確かめ直さない）
      if (
        updateLengths(track, log, ALL_READS, verified) &&
        JSON.stringify(track.items) !==
          JSON.stringify(buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track)))
      )
        throw new Error(`stale items: track ${tracks.indexOf(track)}`);
    }
    return track.items;
  };
  const activeAt = (track: HeldTrack, frame: number): HeldItem[] =>
    readItems(track).filter((it) => it.start <= frame && frame < it.end);

  /**
   * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: while の件の列が見る、出どころの枠のその状態（家族の根なら家族のどれか）の
   * 段 1 の件の列（出どころは問わない。条件の selfState が見るものと同じ）
   */
  const whileOwn = new Map<HeldTrack, HeldTrack[]>();
  /** while の件を作った時の、元の状態の件（件の列ごとの items。作り直すと別の配列になる） */
  const whileSeen = new Map<HeldTrack, readonly HeldItem[][]>();
  const readWhileItems = (track: HeldTrack, effect: ResolvedWhileEffect): HeldItem[] => {
    let own = whileOwn.get(track);
    if (own === undefined) {
      const family = statesMatching(effect.whileState);
      own = tracks.filter(
        (t) =>
          t.holder === track.sourceSlotIndex &&
          t.stage === 1 &&
          t.origin.kind === 'state' &&
          family.includes(t.origin.state),
      );
      whileOwn.set(track, own);
    }
    const deps = own.map((t) => readItems(t));
    const seen = whileSeen.get(track);
    if (seen !== undefined && seen.length === deps.length && seen.every((d, i) => d === deps[i])) return track.items;
    whileSeen.set(track, deps);
    track.items = whileItems(
      own.map((t, i) => ({ origin: t.origin, items: deps[i]! })),
      effect.whileStacks,
    );
    return track.items;
  };

  /**
   * 2 段目の段 11 の PR 2（plan/design-skill-stage11.md 2.4 節）: カウンタの while の件。出どころの枠のそのカウンタが atLeast 以上の間。
   * 記録の値はそのフレームのすべての判定の後に足したものなので、効くのは次のフレームから（戦闘開始時の増減はフレーム 0 から）。
   * カウンタの記録が増えた時だけ作り直す
   */
  const counterWhileSeen = new Map<HeldTrack, number>();
  const readCounterWhileItems = (track: HeldTrack, effect: ResolvedCounterWhileEffect): HeldItem[] => {
    if (counterWhileSeen.get(track) === counterRecords.length) return track.items;
    counterWhileSeen.set(track, counterRecords.length);
    const { counter, atLeast } = effect.whileCounter;
    const items: HeldItem[] = [];
    let open: number | null = null;
    for (const r of counterRecords) {
      if (r.slotIndex !== track.sourceSlotIndex || r.counter !== counter) continue;
      const from = counterEffectiveFrom(r);
      if (r.value >= atLeast) open ??= from;
      else if (open !== null) {
        if (open < from) items.push({ start: open, end: Math.min(from, frames) });
        open = null;
      }
    }
    if (open !== null && open < frames) items.push({ start: open, end: frames });
    track.items = items;
    return track.items;
  };

  /** 件の効いている値（確率のきっかけは付いている確率を掛けて丸めた値） */
  const valueOf = (effect: ItemEffect, item: HeldItem): number =>
    item.scale === undefined ? effect.value : chanceValueOf(effect.value, item.scale);

  // ---- 読む側の索引（持ち主ごと。並びは作った順 = 段 A までの 1 パス目の窓を読む順） ----
  type View = { track: HeldTrack; effect: ItemEffect };
  const viewsOf = (test: (track: HeldTrack, effect: ItemEffect) => boolean): View[][] =>
    slots.map((_, holder) => {
      const views: View[] = [];
      for (const track of tracks) {
        if (track.holder !== holder) continue;
        const o = track.origin;
        // 2 段目の段 9 の PR 2: while の効果も、件を持つ効果として同じに読む（段 1.5）
        if (o.kind === 'timed' || o.kind === 'while') {
          if (test(track, o.effect)) views.push({ track, effect: o.effect });
        } else if (o.kind === 'state') {
          for (const c of o.contents) if (test(track, c)) views.push({ track, effect: c });
        }
      }
      return views;
    });
  // 射手: 射撃に効く stat（timed は段によらない。状態の中身も）
  const firingViews = viewsOf((_, e) => isFiringStat(e.stat));
  // 当たり: 順位の対象でない timed の当たりの stat と、状態の中身（段 A までの hitTrack・hitGroups）。2 段目の段 3: 条件つき（段 1.5）の
  // 命中率▲（ソーダ：トゥインクルバニーのバースト）も、区間（2 パス目）と同じ N にするため入れる（plan/design-skill-stage3.md 経過）
  const hitViews = viewsOf(
    (track, e) =>
      isHitStateStat(e.stat) && (track.origin.kind === 'state' || STAGE_RANK[track.stage] <= STAGE_RANK[1.5]),
  );
  // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 会心率▲・通常攻撃のクリティカル確率▲（当たりと同じ段の件）
  const critViews = viewsOf(
    (track, e) =>
      (e.stat === 'critRate' || e.stat === 'normalCritRate') &&
      (track.origin.kind === 'state' || STAGE_RANK[track.stage] <= STAGE_RANK[1.5]),
  );
  // 条件 selfBuffed: 段 1 の件（段 A までの 1.5 段目の判定に入る窓）
  const conditionViews = viewsOf((track) => track.stage === 1);
  // 順位: 段 1・1.5 の攻撃力の件（段 A までの 2 段目の材料）
  const rankViews = viewsOf((track, e) => e.stat === 'attack' && STAGE_RANK[track.stage] <= STAGE_RANK[1.5]);
  // 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 条件 selfState が見る、枠の静的な状態と、段 1 の状態の件の列（持ち主 → 状態）。
  // 静的な状態を見る selfState は編成の段（skills/composition.ts）で決まるので、ここに来るのは時間で変わる状態がほとんど
  const staticStates = slots.map((slot) => new Set(staticStatesOf(slot?.definition)));
  // 2 段目の段 10（plan/design-skill-stage10.md 3.2 節）: 段 1.5（条件つきの付与）の状態の件も入れ、前のフレームまでに付いた件だけを見る
  // （同じフレームの条件つきどうしは連鎖させない。超火力（カウンタの条件で付く）を、後のフルバーストの開始の条件が見る）
  const stateTracks = slots.map((_, holder) => {
    const byState = new Map<NamedStateId, HeldTrack[]>();
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== holder || (track.stage !== 1 && track.stage !== 1.5) || o.kind !== 'state') continue;
      byState.set(o.state, [...(byState.get(o.state) ?? []), track]);
    }
    return byState;
  });
  /**
   * 2 段目の段 19 の PR 1（論点 2）: 持ち主 × カウンタごとの、そのカウンタが 0 に届いたら閉じる自分の状態の件の列（付与の untilCounterEmpty。
   * 解除不可でも閉じる。registerCounters）
   */
  const counterEmptyTracks = new Map<string, HeldTrack[]>();
  for (const track of tracks) {
    const o = track.origin;
    if (o.kind !== 'state' || o.grant.untilCounterEmpty === undefined) continue;
    const key = counterKey(track.holder, o.grant.untilCounterEmpty);
    counterEmptyTracks.set(key, [...(counterEmptyTracks.get(key) ?? []), track]);
  }
  /** selfState が見る件: 段 1 はそのフレームに効いている件、段 1.5 は前のフレームまでに付いた件 */
  const selfStateItemsAt = (track: HeldTrack, frame: number): HeldItem[] =>
    track.stage === 1 ? activeAt(track, frame) : activeAt(track, frame).filter((it) => it.start < frame);
  /** 2 段目の段 10 の PR 3: 枠のその状態の、フレームのスタックの段の最大（selfState と同じ件。無ければ 0） */
  const stackLevelAt = (holder: number, state: NamedStateId, frame: number): number => {
    let level = 0;
    for (const t of stateTracks[holder]?.get(state) ?? []) {
      for (const it of selfStateItemsAt(t, frame)) level = Math.max(level, it.stack ?? 1);
    }
    return level;
  };

  // エレグの段 3（plan/design-elegg-s3.md 3.2 節）: 条件 enemyState が見る、敵の状態の件の列（付与で付いた状態と、持続ダメージの状態）。
  // damage の enemyState（frame/plan.ts の damageConditionHolds）と同じく、そのフレームに付いた件も入れる
  const enemyStateTracks = tracks.filter(
    (t) => t.holder === ENEMY && (t.origin.kind === 'state' || t.origin.kind === 'enemyState'),
  );
  const enemyStateAt = (state: NamedStateId, frame: number): boolean =>
    enemyStateTracks.some(
      (t) =>
        (t.origin.kind === 'state' || t.origin.kind === 'enemyState') &&
        stateMatches(state, t.origin.state) &&
        activeAt(t, frame).length > 0,
    );

  // ゲージ: 時間で変わるバーストゲージのチャージ速度の件（2 段目の段 1。plan/design-skill-stage1.md 1.6 節。段によらない。状態の中身も）
  const gaugeViews = viewsOf((_, e) => e.stat === 'burstGaugeSpeed');
  // 2 段目の段 11 の PR 3: バーストスキルのクールタイム▼ の維持の付いた形（T4）の件
  const cooldownViews = viewsOf((_, e) => e.stat === 'burstCooldown');
  /** 2 段目の段 15 の PR 2: 枠 holder の T4 の▼ の件のうち、pick に合うものの秒の和 */
  const cooldownSum = (holder: number, pick: (it: HeldItem) => boolean): number => {
    let sum = 0;
    for (const v of cooldownViews[holder] ?? [])
      for (const it of readItems(v.track)) if (pick(it)) sum += valueOf(v.effect, it);
    return sum;
  };

  const holdsAt = (condition: EffectCondition, sourceSlotIndex: number, frame: number): boolean => {
    if (condition.selfState !== undefined) {
      const { state, present, stacks } = condition.selfState;
      // 2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 家族の根なら、家族のどの状態でも当たる
      const family = statesMatching(state);
      const isStatic = family.some((s) => staticStates[sourceSlotIndex]?.has(s) === true);
      const own = family.flatMap((s) => stateTracks[sourceSlotIndex]?.get(s) ?? []);
      if (stacks === undefined) {
        const has = isStatic || own.some((t) => selfStateItemsAt(t, frame).length > 0);
        if (has !== present) return false;
      } else if (
        !stacksHold(
          stacks,
          isStatic,
          own.map((t) => ({ origin: t.origin, items: selfStateItemsAt(t, frame) })),
        )
      ) {
        // 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: スタック数の条件（段 1 の状態の件の、そのフレームの段の最大）
        return false;
      }
    }
    if (condition.selfBuffed !== undefined) {
      const stat = condition.selfBuffed;
      const base = passive[sourceSlotIndex];
      const buffed =
        (base !== null && base !== undefined && statTotal(base.buffs, stat) > 0) ||
        (conditionViews[sourceSlotIndex] ?? []).some(
          (v) => v.effect.stat === stat && activeAt(v.track, frame).some((it) => valueOf(v.effect, it) > 0),
        );
      if (!buffed) return false;
    }
    // 2 段目の段 14 の PR 3: 解除の「フルバースト状態でなければ」（inFullBurst: false）も
    if (condition.inFullBurst !== undefined && inFullBurstAt(frame) !== condition.inFullBurst) return false;
    if (condition.enemyState !== undefined && !enemyStateAt(condition.enemyState, frame)) return false;
    // 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの値（前のフレームの終わりの値）
    if (condition.selfCounter !== undefined) {
      const { counter, atLeast, below } = condition.selfCounter;
      const value = counterValue(sourceSlotIndex, counter);
      if (atLeast !== undefined && value < atLeast) return false;
      if (below !== undefined && value >= below) return false;
    }
    return true;
  };

  /**
   * 発火の文脈だけで決まる条件。2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: 条件の usedBurst（直前に自分がバーストスキルを使用していれば）。発火の文脈の
   * burstUsers に自分がいるか。件を見ないので、段 1 の効果でも発火の前に見る。鍵が無ければ true
   */
  const fireContextHolds = (
    condition: EffectCondition | undefined,
    trigger: ResolvedTrigger | EndedTrigger,
    ev: FrameEvents,
    sourceSlotIndex: number,
  ): boolean =>
    (condition?.usedBurst !== true || (fireContextOf(trigger, ev)?.burstUsers?.includes(sourceSlotIndex) ?? false)) &&
    // レッドフード編（plan/design-red-hood.md 2.1 節）: 使った段階（burstStep）も発火の文脈だけで決まる
    burstStepHolds(condition, ev, sourceSlotIndex);

  const rankSlots = rankSlotsOf(slots, passive);
  // 2 段目の段 6 の PR 2（plan/design-skill-stage6.md 2.4 節）: 枠のそのフレームの最終最大HP（常時 + 効いている最大HP▲ の件）。
  // 発動者の最終最大HP 基準の攻撃力▲（casterFinalMaxHp）の順位の値が読む
  const maxHpViews = viewsOf((_, e) => isMaxHpStat(e.stat));
  /**
   * 枠のフレーム frame の最大HP▲ の和（常時 + 効いている件。up）と、そのうちの最大HP のみ▲ の和（only）。startsBefore なら frame より前に
   * 始まった件だけ（同じフレームに付いた件は次のフレームから。マスト編の HP の割合）
   */
  const maxHpUpAt = (slotIndex: number, frame: number, startsBefore: boolean): { up: number; only: number } => {
    let up = passive[slotIndex]?.buffs.maxHpRatio ?? 0;
    let only = passiveMaxHpOnly[slotIndex] ?? 0;
    for (const v of maxHpViews[slotIndex] ?? []) {
      for (const it of readItems(v.track)) {
        if (!(startsBefore ? it.start < frame : it.start <= frame) || frame >= it.end) continue;
        const x = valueOf(v.effect, it);
        up += x;
        if (v.effect.stat === 'maxHpOnly') only += x;
      }
    }
    return { up, only };
  };
  const finalMaxHpAt = (slotIndex: number, frame: number): number | undefined => {
    const base = slots[slotIndex]?.casterMaxHp;
    if (base === undefined) return undefined;
    return base * (1 + maxHpUpAt(slotIndex, frame, false).up);
  };
  /**
   * マスト編（plan/design-mast.md 8 節。plan/design-skill-stage6.md 2.4 節の式）: 枠のフレーム frame の HP の割合。枠の想定の割合 ×
   * (1 + Σ 最大HP▲ − Σ 最大HP のみ▲) ÷ (1 + Σ 最大HP▲)（Σ 最大HP▲ は最大HP のみ▲ も含む）。常時の分と、frame より前に始まって frame に
   * 効いている件（同じフレームに付いた件は次のフレームから。論点 8）
   */
  const passiveMaxHpOnly = passive.map(
    (state) =>
      state?.passiveEffects.filter((e) => e.stat === 'maxHpOnly').reduce((sum, e) => sum + e.appliedAmount, 0) ?? 0,
  );
  // 最大HP のみ▲ を持ちうる枠（常時か件の列）だけ割合が動く。ほかの枠は想定の割合のまま（毎フレームの走査を省く）
  const hpRatioMoves = slots.map(
    (_, i) => (passiveMaxHpOnly[i] ?? 0) > 0 || (maxHpViews[i] ?? []).some((v) => v.effect.stat === 'maxHpOnly'),
  );
  const selfHpRatioAt = (slotIndex: number, frame: number): number => {
    const assumed = slots[slotIndex]?.hpRatio ?? 1;
    if (!hpRatioMoves[slotIndex]) return assumed;
    const { up, only } = maxHpUpAt(slotIndex, frame, true);
    return (assumed * (1 + up - only)) / (1 + up);
  };
  // 2 段目の段 7（plan/design-skill-stage7.md 1.2・1.4 節）: 枠のそのフレームの最終防御力（常時 + 効いている防御力▲ の件）と、
  // 発動者より低い枠（同値は含まない）と発動者自身
  const defenseViews = viewsOf((_, e) => e.stat === 'defense');
  const finalDefenceAt = (slotIndex: number, frame: number): number => {
    const base = slots[slotIndex]?.baseDefence;
    if (base === undefined)
      throw new RangeError(`slot ${slotIndex}: the base defence is needed to compare final defence`);
    let up = passive[slotIndex]?.buffs.defenseRatio ?? 0;
    for (const v of defenseViews[slotIndex] ?? [])
      for (const it of activeAt(v.track, frame)) up += valueOf(v.effect, it);
    return base * (1 + up);
  };
  const lowerDefenseAt = (sourceSlotIndex: number, frame: number): number[] => {
    const own = finalDefenceAt(sourceSlotIndex, frame);
    const out: number[] = [];
    slots.forEach((slot, i) => {
      if (slot !== null && (i === sourceSlotIndex || finalDefenceAt(i, frame) < own)) out.push(i);
    });
    return out;
  };
  const finalAttacksAtFrame = (frame: number): (number | null)[] => {
    const windows: AttackItem[] = [];
    rankViews.forEach((views, holder) => {
      for (const v of views) {
        for (const it of activeAt(v.track, frame)) {
          const casterMaxHp =
            v.effect.scaling === 'casterFinalMaxHp' ? finalMaxHpAt(v.track.sourceSlotIndex, frame) : undefined;
          windows.push({
            slotIndex: holder,
            sourceSlotIndex: v.track.sourceSlotIndex,
            effect: { stat: v.effect.stat, scaling: v.effect.scaling, value: valueOf(v.effect, it) },
            start: it.start,
            end: it.end,
            ...(casterMaxHp === undefined ? {} : { casterMaxHp }),
          });
        }
      }
    });
    return finalAttacksAt(rankSlots, windows, frame);
  };
  const rankContext: HolderLists['rankContext'] = (e, sourceSlotIndex, context, frame) => {
    if (!dependsOnRank(e)) return context;
    const finalAttacks = finalAttacksAtFrame(frame);
    return { ...context, attackRank: attackRankFor(e, rankSlots, finalAttacks, sourceSlotIndex) };
  };

  // ---- 登録 ----
  /** timed の発火 1 つを、対象の持ち主の件の列に足す。対象になった枠を返す */
  const fireTimed = (src: TimedSource, start: number, context: FireContext): number[] => {
    if (start >= frames) return [];
    const targets: number[] = [];
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(src.effect, src.sourceSlotIndex, holder, target.character, context)) return;
      // 段 C: 敵の件の効果は、対象の味方があれば敵の件の列に 1 回だけ足す
      if (src.enemy !== null) {
        if (targets.length === 0) insertSorted(src.enemy.starts, start);
        targets.push(holder);
        return;
      }
      const track = src.tracks[holder];
      if (!track)
        throw new Error(`no track for ${src.effect.source.skill}[${src.effect.effectIndex}] on slot ${holder}`);
      insertSorted(track.starts, start);
      targets.push(holder);
    });
    return targets;
  };
  /** 状態の付与の発火 1 つを、対象の持ち主の状態の件の列と、付いた記録に足す */
  const fireGrant = (g: GrantSource, start: number, context: FireContext): number[] => {
    if (start >= frames) return [];
    const group = g.group;
    // 2 段目の段 10（plan/design-skill-stage10.md 2.1 節）: スタックの数をカウンタの値か、自分の状態のスタック数（PR 3。発火のフレームの
    // 段の最大。条件 selfState と同じ件を見る）から取る（0 なら付けない）。付いた後は、数え元が変わっても段は変わらない（V-0523）
    const from = g.grant.stacksFrom;
    // 2 段目の段 14 の PR 3: 使用回数のある状態は、1 回の発火で stacksPerFire のスタック（セブンスドワーフ・フルアクティブの 2 回）
    const count =
      from === undefined
        ? (g.grant.stacksPerFire ?? 1)
        : 'counter' in from
          ? counterValue(group.sourceSlotIndex, from.counter)
          : stackLevelAt(group.sourceSlotIndex, from.state, start);
    if (count <= 0) return [];
    const targets: number[] = [];
    // エレグのバースト編: 敵に付く状態は、対象の味方があれば敵の件の列に 1 回だけ足す（付いた記録は作らない。{ applied } で見る
    // 語彙は味方の状態だけ）
    if (group.enemy !== null) {
      const on = slots.some(
        (target, holder) =>
          target !== null && isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context),
      );
      if (on) for (let k = 0; k < count; k++) insertSorted(group.enemy.starts, start);
      return targets;
    }
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context)) return;
      const track = group.tracks[holder];
      if (!track) throw new Error(`no state track for ${group.state} on slot ${holder}`);
      for (let k = 0; k < count; k++) insertSorted(track.starts, start);
      const record: AppliedRecord = {
        frame: start,
        state: group.state,
        sourceSlotIndex: group.sourceSlotIndex,
        slotIndex: holder,
      };
      applications.push(record);
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除の発火 1 つ。持ち主（自分）のその状態の件の列（出どころは問わない）に、
   * 閉じるフレームを足す。解除不可の件の列は閉じない
   */
  const fireRemove = (src: RemoveSource, frame: number): void => {
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== src.sourceSlotIndex || o.kind !== 'state' || o.state !== src.effect.state) continue;
      if (o.grant.undispellable === true) continue;
      closeTrack(track, frame);
    }
  };
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.1 節）: スタック量の増加の発火 1 つ。状態の件の列に、同じフレームの始まりを N 個入れる
   * （スタックの段は始まりの数で上がり、上限と維持は付与のもの）。付いた記録は 1 件。
   * 減少（同 1.5 節）は、件の列に減少（そのフレームに効いている段の上から N 段を次のフレームで切る）を入れる。付いた記録は作らない
   */
  const fireStackChange = (src: StackSource, start: number): void => {
    if (start >= frames) return;
    if (src.effect.decrease === true) {
      const decreases = src.track.decreases;
      let i = decreases.length;
      while (i > 0 && decreases[i - 1]!.frame > start) i--;
      // 2 段目の段 14 の PR 3: 0 になったら件を閉じる減少（使用回数を使い切った時）
      decreases.splice(i, 0, {
        frame: start,
        amount: src.effect.amount,
        ...(src.effect.closesAtZero === true ? { closesAtZero: true as const } : {}),
      });
      return;
    }
    for (let k = 0; k < src.effect.amount; k++) insertSorted(src.track.starts, start);
    const record: AppliedRecord = {
      frame: start,
      state: src.effect.state,
      sourceSlotIndex: src.sourceSlotIndex,
      slotIndex: src.sourceSlotIndex,
    };
    applications.push(record);
  };

  // ---- 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: { applied } の出どころ（timed・付与。見る状態が自分に付いた記録から発火する） ----
  type AppliedSource = {
    state: NamedStateId;
    sourceSlotIndex: number;
    stage: HeldStage;
    /** 最後に発火したフレーム。記録のフレームは呼び出しの順に減らないので、前の呼び出しと同じフレームの 2 回目を落とす */
    last: number;
    fire: (start: number) => void;
  };
  /** { applied } の付与で付いた記録（timed・付与の { applied } を起こさない。連鎖させない） */
  const chainedApplications = new Set<AppliedRecord>();
  const appliedSources: AppliedSource[] = [];
  for (const group of stateGroups) {
    for (const g of group.grants) {
      const t = g.grant.trigger;
      if (!isResolvedApplied(t)) continue;
      appliedSources.push({
        state: t.applied,
        sourceSlotIndex: group.sourceSlotIndex,
        stage: g.stage,
        last: -1,
        fire: (start) => {
          const before = applications.length;
          fireGrant(g, start, null);
          for (let k = before; k < applications.length; k++) chainedApplications.add(applications[k]!);
        },
      });
    }
  }
  for (const src of timedSources) {
    const t = src.effect.trigger;
    if (!isResolvedApplied(t)) continue;
    appliedSources.push({
      state: t.applied,
      sourceSlotIndex: src.sourceSlotIndex,
      stage: src.stage,
      last: -1,
      fire: (start) => {
        fireTimed(src, start, null);
      },
    });
  }
  /**
   * 段 stage の { applied } の出どころを、この呼び出しで付いた記録（applications の from から。{ applied } の付与の記録を除く）から
   * 発火する。窓は記録のフレームから。同じフレームに 2 つの出どころから付いても 1 回（appliedFrames と同じ）
   */
  const dispatchApplied = (stage: HeldStage, from: number): void => {
    for (const a of appliedSources) {
      if (a.stage !== stage) continue;
      const fires = new Set<number>();
      for (let k = from; k < applications.length; k++) {
        const r = applications[k]!;
        if (r.state !== a.state || r.slotIndex !== a.sourceSlotIndex || chainedApplications.has(r)) continue;
        fires.add(r.frame);
      }
      for (const frame of [...fires].sort((x, y) => x - y)) {
        if (frame <= a.last) continue;
        a.last = frame;
        a.fire(frame);
      }
    }
  };
  /** 2 段目の段 4: まだ dispatchApplied で読んでいない記録の始まり（静的な状態の記録は、戦闘開始時の呼び出しで読む） */
  let appliedFrom = 0;
  const recordRanking = (
    frame: number,
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number; targetCount?: number; excludeSelf?: string },
    attackRank: readonly number[],
    finalAttacks: (number | null)[],
    targets: readonly number[],
  ): void => {
    rankings.push({
      frame,
      sourceSlotIndex,
      effect: { source: e.source, effectIndex: e.effectIndex },
      finalAttacks,
      targets: attackRank.filter((i) => targets.includes(i)),
      // 対象の語彙編: unlessShort で末尾に足した自分は、同値の比べに入れない（順位ではなく足りない分の補い）
      tied: tiedAtCutoff(
        e.excludeSelf === 'unlessShort' ? attackRank.slice(0, -1) : attackRank,
        finalAttacks,
        e.targetCount ?? 1,
      ),
    });
  };

  // 2 段目の段 4: { applied } の出どころは出来事では発火しない（dispatchApplied）
  const timedAt = (stage: HeldStage): TimedSource[] =>
    timedSources.filter((s) => s.stage === stage && !isResolvedApplied(s.effect.trigger));
  const stage1Timed = timedAt(1);
  const stage15Timed = timedAt(1.5);
  const stage2Timed = timedAt(2);
  const grantsAt = (stage: HeldStage): GrantSource[] =>
    stateGroups.flatMap((group) =>
      group.grants.filter((g) => g.stage === stage && !isResolvedApplied(g.grant.trigger)),
    );
  const stage1Grants = grantsAt(1);
  // 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節）: leadFrames のある付与（段 1 だけ。types.ts が条件・
  // stacksFrom・順位の対象を止める）の、前の回の発（known）と、件の始まりのフレーム → その件の数（early）と、この回の発（fired）
  if (stateGroups.some((group) => group.grants.some((g) => g.grant.leadFrames !== undefined && g.stage !== 1)))
    throw new Error('a grant with leadFrames must be in stage 1');
  const leads = new Map(
    stage1Grants.flatMap((g) => {
      if (g.grant.leadFrames === undefined) return [];
      const known = options.leadShots?.[leadShotKey(g)] ?? [];
      const early = new Map<number, number>();
      for (const shot of known) {
        const at = grantStartOf(g.grant, shot);
        early.set(at, (early.get(at) ?? 0) + 1);
      }
      return [[g, { known: new Set(known), early, fired: [] as number[] }] as const];
    }),
  );
  const stage15Grants = grantsAt(1.5);
  const stage2Grants = grantsAt(2);
  const stage1Removes = removeSources.filter((r) => r.stage === 1);
  const stage15Removes = removeSources.filter((r) => r.stage === 1.5);
  const stage1Stacks = stackSources.filter((x) => x.stage === 1);
  const stage15Stacks = stackSources.filter((x) => x.stage === 1.5);
  const skipGrant = (g: GrantSource, frame: number): void => {
    conditionSkips.push({
      frame,
      sourceSlotIndex: g.group.sourceSlotIndex,
      effect: { source: g.grant.source, effectIndex: g.grant.effectIndex },
      state: g.group.state,
    });
  };
  const skipEffect = (
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number },
    frame: number,
  ): void => {
    conditionSkips.push({ frame, sourceSlotIndex, effect: { source: e.source, effectIndex: e.effectIndex } });
  };

  const ampFires = new Map(amplifiers.map((amp) => [amp, firesOf(amp.effect.trigger, amp.sourceSlotIndex)]));

  /**
   * 2 段目の段 10（plan/design-skill-stage4.md 1.3 節）: { ended } の発火。持ち主（自分）のその状態の件（段によらない）の終わりがこの
   * フレームで、このフレームに続く件が無い
   */
  const endedAt = (holder: number, state: NamedStateId, frame: number): boolean => {
    const own = tracks.filter(
      (t) => t.holder === holder && t.origin.kind === 'state' && statesMatching(state).includes(t.origin.state),
    );
    const items = own.flatMap((t) => readItems(t));
    return items.some((it) => it.end === frame) && !items.some((it) => it.start <= frame && frame < it.end);
  };
  /**
   * 2 段目の段 10: カウンタの増減の条件。selfState は段によらずそのフレームに効いている状態の件を見る（増減はすべての判定の後に足すので、
   * 同じフレームの付与も入れてよい）。selfCounter は前のフレームの終わりの値
   */
  const counterConditionHolds = (condition: EffectCondition, slotIndex: number, frame: number): boolean => {
    // 2 段目の段 12 の PR 2: フルバーストの中か外か（そのフレームの窓。[start, end)）
    if (condition.inFullBurst !== undefined && inFullBurstAt(frame) !== condition.inFullBurst) return false;
    if (condition.selfState !== undefined) {
      const { state, present } = condition.selfState;
      const own = tracks.filter(
        (t) => t.holder === slotIndex && t.origin.kind === 'state' && statesMatching(state).includes(t.origin.state),
      );
      const has =
        statesMatching(state).some((s) => staticStates[slotIndex]?.has(s) === true) ||
        own.some((t) => activeAt(t, frame).length > 0);
      if (has !== present) return false;
    }
    return condition.selfCounter === undefined || holdsAt({ selfCounter: condition.selfCounter }, slotIndex, frame);
  };
  /** 2 段目の段 10: このフレームのカウンタの増減を、すべての判定の後に足す（0 と上限の間で切る） */
  const registerCounters = (ev: FrameEvents, battleStartOnly: boolean): void => {
    if (counterSources.length === 0) return;
    const f = ev.frame;
    const deltas = new Map<string, { slotIndex: number; counter: CounterId; delta: number }>();
    for (const src of counterSources) {
      const t = src.effect.trigger;
      let fired: boolean;
      if (isEndedTrigger(t)) fired = !battleStartOnly && endedAt(src.sourceSlotIndex, t.ended, f);
      // 2 段目の段 19 の PR 1（論点 3）: 自分にその状態が付いたフレーム（このフレームのすべての付与の後。戦闘開始時の付与はフレーム 0 の
      // 出来事で読む）
      else if (isResolvedApplied(t))
        fired = !battleStartOnly && lastAtOrBefore(ownAppliedOf(src.sourceSlotIndex, t.applied), f) === f;
      else if (battleStartOnly) fired = atBattleStart(t);
      else fired = t !== 'battleStart' && src.fires!(ev);
      if (!fired) continue;
      const condition = src.effect.condition;
      if (
        !fireContextHolds(condition, t, ev, src.sourceSlotIndex) ||
        (condition !== undefined && !counterConditionHolds(condition, src.sourceSlotIndex, f))
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      const key = counterKey(src.sourceSlotIndex, src.effect.counter);
      const d = deltas.get(key) ?? { slotIndex: src.sourceSlotIndex, counter: src.effect.counter, delta: 0 };
      d.delta += src.effect.decrease === true ? -src.effect.amount : src.effect.amount;
      deltas.set(key, d);
    }
    for (const [key, { slotIndex, counter, delta }] of deltas) {
      const before = counterValues.get(key) ?? 0;
      const after = Math.max(0, Math.min(counterMax(counter), before + delta));
      if (after === before) continue;
      counterValues.set(key, after);
      counterRecords.push(
        battleStartOnly
          ? { frame: 0, slotIndex, counter, value: after, battleStart: true }
          : { frame: f, slotIndex, counter, value: after },
      );
      if (after === counterMax(counter)) counterFullAt.set(key, (battleStartOnly ? 0 : f) + 1);
      // 2 段目の段 19 の PR 1（論点 2）: 0 に届いたら、そのカウンタで続く自分の状態の件の列を次のフレームで閉じる（解除不可でも）
      if (after === 0)
        for (const track of counterEmptyTracks.get(key) ?? []) closeTrack(track, battleStartOnly ? 0 : f);
    }
  };

  /** 段 1〜2 と強化の発火（手順 3。battleStartOnly ならループの前の戦闘開始時の分だけ） */
  const register = (ev: FrameEvents, battleStartOnly: boolean): void => {
    const f = ev.frame;
    const from = appliedFrom;
    const take = (trigger: ResolvedTrigger): boolean =>
      battleStartOnly ? atBattleStart(trigger) : trigger !== 'battleStart';
    // 段 1: 条件なし・順位の対象でない付与と効果（確率のきっかけは機会を貯める）
    for (const g of stage1Grants) {
      const lead = leads.size > 0 ? leads.get(g) : undefined;
      // 前の回の発の件は、その始まりのフレームに登録する（同じフレームの段 1.5 の enemyState が見る）
      if (lead !== undefined && !battleStartOnly) {
        for (let k = lead.early.get(f) ?? 0; k > 0; k--) fireGrant(g, f, null);
      }
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (!fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex)) {
        skipGrant(g, f);
        continue;
      }
      if (lead !== undefined) {
        lead.fired.push(f);
        if (lead.known.has(f)) continue;
      }
      fireGrant(g, battleStartOnly ? 0 : grantStartOf(g.grant, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage1Timed) {
      if (src.chance) {
        if (battleStartOnly) continue;
        const shot = ev.shots[src.sourceSlotIndex];
        const trigger = src.effect.trigger;
        if (!shot || !isResolvedChance(trigger) || f + 1 >= frames) continue;
        const weight = shotCountWeight(trigger.count, shot);
        if (weight <= 0) continue;
        const opportunities = (src.enemy ?? src.tracks.find((t) => t !== null))?.opportunities;
        opportunities?.push({ start: f + 1, q: Math.min(1, trigger.chance * weight) });
        continue;
      }
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (!fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex)) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    // 2 段目の段 1: 解除（閉じるのは発火の次のフレームなので、段の中の順は同じフレームの判定に効かない。plan/design-skill-stage1.md 1.2 節）
    for (const r of stage1Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (!fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex)) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // 2 段目の段 3: スタック量の増減（増加は状態の件の列の始まりを足すだけなので、段 1 の付与と同じ見え方。減少は次のフレームで切るので、
    // 段の中の順は同じフレームの判定に効かない）
    for (const x of stage1Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 2 段目の段 4: 段 1 の { applied }（段 1 の付与・スタック量の増加で付いた記録から）
    dispatchApplied(1, from);
    // 段 C: 敵の状態（持続ダメージの発火のフレーム。ループの中の判定は読まない）
    for (const e of enemyStateSources) {
      for (const { effect, fires } of e.effects) {
        if (!take(effect.trigger) || !(battleStartOnly || fires(ev))) continue;
        const at = battleStartOnly ? 0 : f + (effect.dot!.applyDelayFrames ?? 0);
        if (at < frames) insertSorted(e.track.starts, at);
      }
    }
    // 2 段目の段 13 の PR 2: 消去（f の判定には付いている。dotActiveSpans が f + 1 で切る）
    if (!battleStartOnly) for (const c of dotCancelSources) if (c.fires(ev)) insertSorted(c.track.closes, f);
    if (!battleStartOnly) {
      // 循環の間隔の変更はループの中でしか読まないので、戦闘開始時もフレーム 0 の出来事で登録する
      for (const c of cycleSources) {
        if (!c.fires(ev)) continue;
        const start = startOfFire(c.effect.trigger, f);
        if (start < frames) insertSorted(c.track.starts, start);
      }
    }
    // 段 1.5: 条件つきの付与と効果（と、状態のスタック数を数で読む付与。2 段目の段 10 の PR 3）。判定は段 1 の件だけを見る（条件つきどうしは
    // 連鎖させない）
    for (const g of stage15Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (
        !fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex) ||
        (g.grant.condition !== undefined && !holdsAt(g.grant.condition, g.group.sourceSlotIndex, f))
      ) {
        skipGrant(g, f);
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : grantStartOf(g.grant, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage15Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (
        !fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex) ||
        !holdsAt(src.effect.condition!, src.sourceSlotIndex, f)
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    for (const r of stage15Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (
        !fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex) ||
        !holdsAt(r.effect.condition!, r.sourceSlotIndex, f)
      ) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    for (const x of stage15Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (
        !fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex) ||
        !holdsAt(x.effect.condition!, x.sourceSlotIndex, f)
      ) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    dispatchApplied(1.5, from);
    // 段 2: 順位の対象。発火のフレームの順位（段 1・1.5 の攻撃力の件。同じフレームに付いたものも入れる）
    for (const g of stage2Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(g.grant.trigger, f, g.grant.delayFrames);
      if (start >= frames) continue;
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(g.grant, rankSlots, finalAttacks, g.group.sourceSlotIndex);
      const targets = fireGrant(g, start, { ...fireContextOf(g.grant.trigger, ev), attackRank });
      recordRanking(f, g.group.sourceSlotIndex, g.grant, attackRank, finalAttacks, targets);
    }
    for (const src of stage2Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames);
      if (start >= frames) continue;
      // 2 段目の段 7: 最終防御力の比べの対象（発火のフレームの最終防御力。段 1・1.5 の防御力▲ の件。同じフレームに付いたものも入れる）
      if (dependsOnDefense(src.effect)) {
        fireTimed(src, start, {
          ...fireContextOf(src.effect.trigger, ev),
          lowerDefense: lowerDefenseAt(src.sourceSlotIndex, f),
        });
        continue;
      }
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(src.effect, rankSlots, finalAttacks, src.sourceSlotIndex);
      const targets = fireTimed(src, start, { ...fireContextOf(src.effect.trigger, ev), attackRank });
      recordRanking(f, src.sourceSlotIndex, src.effect, attackRank, finalAttacks, targets);
    }
    dispatchApplied(2, from);
    appliedFrom = applications.length;
    // 2.5 段目: 強化は発火の窓の始まりだけを貯める（受け付けと値は、履歴を閉じる時に amplify で決める）
    for (const amp of amplifiers) {
      if (!take(amp.effect.trigger)) continue;
      if (!battleStartOnly && !ampFires.get(amp)!(ev)) continue;
      const start = battleStartOnly ? 0 : startOfFire(amp.effect.trigger, f);
      if (start < frames) amp.starts.push(start);
    }
    // 2 段目の段 10: カウンタの増減は、このフレームのすべての判定の後
    registerCounters(ev, battleStartOnly);
  };
  const emptyEvents = (frame: number): FrameEvents => ({
    frame,
    shots: slots.map(() => null),
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: slots.map(() => false),
  });

  const hasFiring = slots.map((_, i) => (firingViews[i] ?? []).length > 0);
  /**
   * 射手の実効値（持ち主ごと）。毎フレーム × 枠で読まれるので、効いている件の組が変わらない間（件の境目まで）は前の値を使い回す
   * （plan/design-first-pass-perf.md 3.2 節）
   */
  const firingBuffs = firingViews.map((views) =>
    createSpanMemo(
      views.length,
      (i) => readItems(views[i]!.track),
      (frame, base: BuffTotals): BuffTotals | null => {
        let buffs = base;
        let changed = false;
        for (const v of views) {
          // 和集合の窓は重ならないので効いているのは多くて 1 つ。スタックする効果は効いている段の数だけ足す
          for (let k = activeAt(v.track, frame).length; k > 0; k--) {
            buffs = applyResolvedEffect(
              buffs,
              v.effect,
              fixedAttackBaseOf(v.effect, v.track.casterBaseAttack, slots),
              v.track.casterMaxHp,
            ).totals;
            changed = true;
          }
        }
        return changed ? buffs : null;
      },
    ),
  );

  // 毎フレーム読むので、消費する状態の持ち主の件の列は前もって引く（件の列はここまでに作り終わる。plan/design-first-pass-perf.md 3.1 節）
  const consumingTracks = consuming.map(({ holder, state }) => ({
    holder,
    state,
    own: tracks.filter((t) => t.holder === holder && t.origin.kind === 'state' && t.origin.state === state),
  }));

  const selfStackCountAt: HolderLists['selfStackCountAt'] = (holder, state, frame) => {
    let level = 0;
    for (const s of statesMatching(state)) {
      if (staticStates[holder]?.has(s) === true) level = Math.max(level, 1);
      for (const t of stateTracks[holder]?.get(s) ?? [])
        for (const it of activeAt(t, frame)) if (it.start < frame) level = Math.max(level, it.stack ?? 1);
    }
    return level;
  };

  return {
    hasSources:
      timedSources.length > 0 ||
      stateGroups.length > 0 ||
      cycleSources.length > 0 ||
      amplifiers.length > 0 ||
      enemyStateSources.length > 0 ||
      removeSources.length > 0 ||
      stackSources.length > 0 ||
      whileTracks.length > 0 ||
      counterSources.length > 0,
    registerBattleStart() {
      if (frames <= 0) return;
      register(emptyEvents(0), true);
    },
    registerFrame(ev) {
      register(ev, false);
      // テスト用: ループの中で読まれない件の列も、毎フレーム読んで確かめる（いまは読まない列を、後の定義が読んでも落とし漏れが分かる）
      if (options.verifyItems === true) for (const track of tracks) readItems(track);
    },
    firingBuffsAt(holder, frame, base) {
      return hasFiring[holder] ? firingBuffs[holder]!(frame, base) : null;
    },
    hasFiringTracks: (holder) => hasFiring[holder] === true,
    hitUpAt(holder, frame) {
      let sum = 0;
      for (const v of hitViews[holder] ?? []) {
        for (let k = activeAt(v.track, frame).length; k > 0; k--) sum += v.effect.value;
      }
      return sum;
    },
    hasHitTracks: hitViews.some((views) => views.length > 0),
    critUpAt(holder, frame) {
      let sum = 0;
      for (const v of critViews[holder] ?? []) {
        for (let k = activeAt(v.track, frame).length; k > 0; k--) sum += v.effect.value;
      }
      return sum;
    },
    rankContext,
    applyHeal(effect, sourceSlotIndex, holder, frame) {
      const track = healTracks.get(healKey(sourceSlotIndex, effect))?.[holder] ?? null;
      if (track === null)
        throw new Error(`no heal track for ${effect.source.skill}[${effect.effectIndex}] on ${holder}`);
      const opens = effect.durationFrames === undefined || activeAt(track, frame).length === 0;
      if (frame < frames) insertSorted(track.starts, frame);
      if (opens) heals.push({ frame, sourceSlotIndex, slotIndex: holder });
      return opens;
    },
    openWeaponChange(holder, weaponId, end) {
      for (const track of tracks) {
        const o = track.origin;
        if (track.holder !== holder || o.kind !== 'timed') continue;
        if (o.effect.durationUntil !== 'ammoSpent' || o.effect.weapon?.id !== weaponId) continue;
        const last = readItems(track).at(-1);
        if (last === undefined || last.start >= end || last.end < end) continue;
        return true;
      }
      return false;
    },
    cycleEveryAt(slotIndex, targetSkill, frame) {
      return cycleSources
        .filter((c) => c.slotIndex === slotIndex && c.effect.target === 'cycle' && c.effect.targetSkill === targetSkill)
        .flatMap((c) => activeAt(c.track, frame).map(() => c.effect.every));
    },
    shotCountEveryOf,
    gaugeSpeedAt(holder, frame) {
      let sum = 0;
      for (const v of gaugeViews[holder] ?? []) {
        for (const it of activeAt(v.track, frame)) sum += valueOf(v.effect, it);
      }
      return sum;
    },
    hasGaugeSpeedTracks: (holder) => (gaugeViews[holder] ?? []).length > 0,
    burstCooldownAt: (holder, frame) => cooldownSum(holder, (it) => it.start <= frame && frame < it.end),
    burstCooldownStartedAt: (holder, frame) => cooldownSum(holder, (it) => it.start === frame),
    hasBurstCooldownTracks: (holder) => (cooldownViews[holder] ?? []).length > 0,
    // holdsAt の selfState と違い、段によらず frame より前に付いた件だけを見る（frame/plan.ts の selfStateHolds と同じ規則にする）。
    // 段は 1 始まりなので、付いていればスタック数は 1 以上
    selfStateAt: (holder, state, frame) => selfStackCountAt(holder, state, frame) > 0,
    selfStackCountAt,
    enemyStateAt,
    instantConditionHolds(effect, sourceSlotIndex, frame) {
      if (effect.condition === undefined || holdsAt(effect.condition, sourceSlotIndex, frame)) return true;
      skipEffect(sourceSlotIndex, effect, frame);
      return false;
    },
    consumeFullStacks(frame) {
      const out: FullStackEvent[] = [];
      for (const { holder, state, own } of consumingTracks) {
        const full = own.some((t) => {
          const max = t.origin.kind === 'state' ? t.origin.grant.maxStacks : undefined;
          return max !== undefined && readItems(t).some((it) => it.stack === max && it.start === frame);
        });
        if (!full) continue;
        for (const t of own) if (!t.consumes.includes(frame)) insertSorted(t.consumes, frame);
        out.push({ slotIndex: holder, state });
      }
      return out;
    },
    leadShots() {
      return Object.fromEntries(
        [...leads].filter(([, l]) => l.fired.length > 0).map(([g, l]) => [leadShotKey(g), l.fired]),
      );
    },
    history() {
      for (const track of tracks) readItems(track);
      const amplified = amplify(tracks, amplifiers, slots, frames);
      return {
        frames,
        slots,
        passive,
        tracks,
        amplified: amplified.pieces,
        applications,
        conditionSkips: [...conditionSkips, ...amplified.skips]
          .map((x, i) => ({ x, i }))
          .sort((a, b) => a.x.frame - b.x.frame || a.i - b.i)
          .map(({ x }) => x),
        rankings,
        heals,
        fullBurstWindows: [...options.fullBurstWindows()],
        logs,
        counters: counterRecords,
      };
    },
  };
}

// ---- 履歴を読む（plan/design-holder-effects.md 2.9 節） ----

/** 件 1 つを読む形 */
export type HeldItemView = HeldItem & {
  holder: number;
  sourceSlotIndex: number;
  origin: HeldOrigin;
  stage: HeldStage;
};

/**
 * 件の絞り込み（どれも省略できる）。stat は効果の stat（状態は中身のどれかの stat）。skill・effectIndex は効果の定義の場所
 * （状態は件の列を作った付与）
 */
export type HeldItemFilter = {
  holder?: number;
  sourceSlotIndex?: number;
  kind?: HeldOrigin['kind'];
  skill?: SkillSlot;
  effectIndex?: number;
  stat?: BuffStat | 'weapon';
  state?: NamedStateId;
};

function trackMatches(track: HeldTrack, filter: HeldItemFilter): boolean {
  const o = track.origin;
  if (filter.holder !== undefined && track.holder !== filter.holder) return false;
  if (filter.sourceSlotIndex !== undefined && track.sourceSlotIndex !== filter.sourceSlotIndex) return false;
  if (filter.kind !== undefined && o.kind !== filter.kind) return false;
  const defined = o.kind === 'state' ? o.grant : o.kind === 'enemyState' ? o.effects[0]! : o.effect;
  if (filter.skill !== undefined && defined.source.skill !== filter.skill) return false;
  // 常時の効果は定義の中の番号を持たない（effectIndex で絞ると外れる）
  if (filter.effectIndex !== undefined && (!('effectIndex' in defined) || defined.effectIndex !== filter.effectIndex)) {
    return false;
  }
  if (filter.state !== undefined && ((o.kind !== 'state' && o.kind !== 'enemyState') || o.state !== filter.state)) {
    return false;
  }
  if (filter.stat !== undefined) {
    const stats =
      o.kind === 'state'
        ? o.contents.map((c) => c.stat)
        : o.kind === 'timed' || o.kind === 'passive' || o.kind === 'while'
          ? [o.effect.stat]
          : [];
    if (!stats.includes(filter.stat)) return false;
  }
  return true;
}

/** 絞り込んだ件（時刻の順。同じフレームは件の列を作った順 → スタックの段） */
export function itemsOf(history: Pick<HolderHistory, 'tracks'>, filter: HeldItemFilter = {}): HeldItemView[] {
  const out: HeldItemView[] = [];
  for (const track of history.tracks) {
    if (!trackMatches(track, filter)) continue;
    for (const item of track.items) {
      out.push({
        ...item,
        holder: track.holder,
        sourceSlotIndex: track.sourceSlotIndex,
        origin: track.origin,
        stage: track.stage,
      });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 持ち主 holder にフレーム frame に効いている件（時刻の順） */
export function activeItemsAt(
  history: Pick<HolderHistory, 'tracks'>,
  holder: number,
  frame: number,
  filter: HeldItemFilter = {},
): HeldItemView[] {
  return itemsOf(history, { ...filter, holder }).filter((i) => i.start <= frame && frame < i.end);
}

// ---- 値の小片と区間（plan/design-holder-effects.md 2.6・2.9 節） ----

/**
 * 値の小片（plan/design-holder-effects.md 2.9 節。段 D の 1）: 味方の枠ごとに、区間の値に足す効果と、その値が効いている区間 [start, end)。
 * 件（timed・状態の中身）と、確率のきっかけの期待値、強化の小片から作る。敵の件は、効果の対象の味方の各枠に写す（区間の値は味方の
 * 各枠に足す。C-0138）。状態だけの stat（命中率）の小片も入る（区間に足すのは、着地点の計画があり持続の命中率▲を使う時だけ）
 */
export type ValuePiece = {
  /** 値を足す味方の枠 */
  slotIndex: number;
  sourceSlotIndex: number;
  /** 効果（値は、確率のきっかけの期待値・強化の値に直したもの） */
  effect: ItemEffect;
  start: number;
  end: number;
  /** スタックの段（1 始まり）。スタックしない効果はキーごと無い */
  stack?: number;
  stage: HeldStage;
};

/** 件の列の値の小片（timed・状態の中身・確率のきっかけ。強化は別）。並びは作った順 */
function piecesOfTrack(track: HeldTrack, slots: readonly TimelineSlot[]): ValuePiece[] {
  const pieces: ValuePiece[] = [];
  const o = track.origin;
  const lead = o.kind === 'state' ? o.grant.leadFrames : undefined;
  const push = (effect: ItemEffect, item: HeldItem): void => {
    // 段 C: 敵の件は、効果の対象の味方の各枠に写す。エレグのバースト編: 敵に付く状態の中身も（対象は付与の対象）
    const holders =
      track.holder !== ENEMY
        ? [track.holder]
        : track.origin.kind === 'state'
          ? alliesOf(track.origin.grant, track.sourceSlotIndex, slots)
          : !isStateContent(effect)
            ? alliesOf(effect, track.sourceSlotIndex, slots)
            : [track.holder];
    for (const slotIndex of holders) {
      // 徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: 発より前から始める付与の、付けた枠の小片は、いままでどおり
      // 発の次のフレームから（きっかけの発自身には乗らない。C-0312）
      const start =
        lead !== undefined && slotIndex === track.sourceSlotIndex
          ? Math.min(item.end, item.start + lead + 1)
          : item.start;
      if (lead !== undefined && start >= item.end) continue;
      const piece: ValuePiece = {
        slotIndex,
        sourceSlotIndex: track.sourceSlotIndex,
        effect: item.scale === undefined ? effect : { ...effect, value: chanceValueOf(effect.value, item.scale) },
        start,
        end: item.end,
        stage: track.stage,
      };
      if (item.stack !== undefined) piece.stack = item.stack;
      pieces.push(piece);
    }
  };
  // 2 段目の段 9 の PR 2: while の効果は timed と同じく件ごとに 1 つ（値はスタックごとではない）
  if (o.kind === 'timed' || o.kind === 'while') for (const item of track.items) push(o.effect, item);
  if (o.kind === 'state') for (const item of track.items) for (const c of o.contents) push(c, item);
  return pieces;
}

/** 段 C: 敵の件の効果を写す味方の枠（効果の対象。敵の件の効果は味方全体で、絞り込みを持たない） */
function alliesOf(
  effect: Parameters<typeof isEffectTarget>[0],
  sourceSlotIndex: number,
  slots: readonly TimelineSlot[],
): number[] {
  return slots.flatMap((target, holder) =>
    target !== null && isEffectTarget(effect, sourceSlotIndex, holder, target.character) ? [holder] : [],
  );
}

/**
 * 強化の受け付けと値の小片（段 A までの 2.5 段目と同じ作り方）と、受け付けなかった記録。参照するのは、同じ出どころ・スロット・stat の、
 * 強化でない timed と状態の中身の件（段 1〜2。確率のきっかけは期待値）
 */
function amplify(
  tracks: readonly HeldTrack[],
  amplifiers: readonly AmplifierSource[],
  slots: readonly TimelineSlot[],
  frames: number,
): { pieces: AmplifiedPiece[]; skips: ConditionSkip[] } {
  const pieces: AmplifiedPiece[] = [];
  const skips: ConditionSkip[] = [];
  if (amplifiers.length === 0) return { pieces, skips };
  /** 参照の候補（件の列を作った順 → 件 → 中身の順。発動の瞬間の値はこの順に足す） */
  const references: { holder: number; sourceSlotIndex: number; effect: ItemEffect; item: HeldItem; value: number }[] =
    [];
  for (const track of tracks) {
    const o = track.origin;
    const effects: readonly ItemEffect[] = o.kind === 'timed' ? [o.effect] : o.kind === 'state' ? o.contents : [];
    for (const item of track.items) {
      for (const effect of effects) {
        if (isStateStat(effect.stat)) continue;
        const value = item.scale === undefined ? effect.value : chanceValueOf(effect.value, item.scale);
        references.push({ holder: track.holder, sourceSlotIndex: track.sourceSlotIndex, effect, item, value });
      }
    }
  }
  for (const { sourceSlotIndex, effect, starts } of amplifiers) {
    const { skill } = effect.amplifies!;
    const referenced = references.filter(
      (r) =>
        r.sourceSlotIndex === sourceSlotIndex &&
        r.effect.source.skill === skill &&
        r.effect.stat === effect.stat &&
        (!isTimedItem(r.effect) || r.effect.amplifies === undefined),
    );
    const activeAt = (holder: number, frame: number) =>
      referenced.filter((r) => r.holder === holder && r.item.start <= frame && frame < r.item.end);
    // 段 C: 敵の件の効果（受けるダメージ▲）は、発動の瞬間の判定も小片も敵の件で見る（参照する件も敵の件）
    const enemy = isEnemyEffect(effect);
    const targets = slots.flatMap((target, holder) =>
      target !== null && isEffectTarget(effect, sourceSlotIndex, holder, target.character) ? [holder] : [],
    );
    const holders = enemy ? (targets.length > 0 ? [ENEMY] : []) : targets;
    const accepted: number[] = [];
    for (const frame of starts) {
      if (activeAt(enemy ? ENEMY : sourceSlotIndex, frame).length === 0) {
        skips.push({ frame, sourceSlotIndex, effect: { source: effect.source, effectIndex: effect.effectIndex } });
        continue;
      }
      accepted.push(frame);
    }
    for (const [s, e] of unionItems(accepted, effect.durationFrames, frames)) {
      holders.forEach((holder) => {
        const atStart = activeAt(holder, s);
        if (atStart.length === 0) return;
        const startValue = atStart.reduce((sum, r) => sum + r.value, 0);
        const piece = (start: number, end: number, value: number): void => {
          pieces.push({ holder, sourceSlotIndex, effect, start, end, value });
        };
        const covered: [number, number][] = [];
        for (const r of referenced) {
          if (r.holder !== holder) continue;
          const start = Math.max(s, r.item.start);
          const end = Math.min(e, r.item.end);
          if (start >= end) continue;
          covered.push([start, end]);
          piece(start, end, effect.value * r.value);
        }
        let cursor = s;
        for (const [start, end] of covered.sort((a, b) => a[0] - b[0])) {
          if (cursor < start) piece(cursor, start, (1 + effect.value) * startValue);
          cursor = Math.max(cursor, end);
        }
        if (cursor < e) piece(cursor, e, (1 + effect.value) * startValue);
      });
    }
  }
  return { pieces, skips };
}

/** 値の小片の並びの鍵（時刻の順。同じフレームは段 → 出どころの枠 → 定義の順 → 持ち主 → スタックの段。論点 5） */
function pieceKey(w: ValuePiece): number[] {
  const subIndex = isStateContent(w.effect) ? w.effect.subIndex : -1;
  return [
    w.start,
    STAGE_RANK[w.stage],
    w.sourceSlotIndex,
    SKILL_ORDER[w.effect.source.skill] ?? 0,
    w.effect.effectIndex,
    subIndex,
    w.slotIndex,
    w.stack ?? 0,
  ];
}

/** 常時パッシブだけの状態を、常時の件から作る（resolvePassiveStates と同じ並び・同じ値） */
function passiveStatesOf(history: HolderHistory): (SlotBuffState | null)[] {
  // 2 段目の段 6 の PR 2: 発動者の最終最大HP は、発動者の常時の最大HP▲ を入れた値（resolvePassiveStates と同じ）
  const passiveMaxHp = history.slots.map(() => 0);
  for (const track of history.tracks) {
    if (track.origin.kind === 'passive' && isMaxHpStat(track.origin.effect.stat) && track.holder >= 0)
      passiveMaxHp[track.holder] = (passiveMaxHp[track.holder] ?? 0) + track.origin.effect.value;
  }
  return history.slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const passiveEffects: AppliedEffect[] = [];
    for (const track of history.tracks) {
      if (track.holder !== index || track.origin.kind !== 'passive') continue;
      const finalMaxHp =
        track.casterMaxHp === undefined
          ? undefined
          : track.casterMaxHp * (1 + (passiveMaxHp[track.sourceSlotIndex] ?? 0));
      const applied = applyResolvedEffect(
        buffs,
        track.origin.effect,
        fixedAttackBaseOf(track.origin.effect, track.casterBaseAttack, history.slots),
        finalMaxHp,
      );
      buffs = applied.totals;
      passiveEffects.push({
        ...track.origin.effect,
        sourceSlotIndex: track.sourceSlotIndex,
        appliedAmount: applied.appliedAmount,
      });
    }
    const buildEffects = slot.buildEffects ?? [];
    for (const e of buildEffects) {
      const { kind, part, line, skillId } = e.source;
      buffs = addRatioBuff(buffs, e.stat, e.value, `build:${kind}:${part ?? ''}:${line ?? skillId ?? ''}`);
    }
    return { buffs, passiveEffects, buildEffects, timedEffects: [] };
  });
}

/** 履歴の値の小片（味方の枠ごと。並びは時刻の順。区間の値はこの順に足す） */
export function valuePiecesOf(history: Pick<HolderHistory, 'tracks' | 'amplified' | 'slots'>): ValuePiece[] {
  const keyed: { piece: ValuePiece; key: number[] }[] = [];
  for (const track of history.tracks) {
    const kind = track.origin.kind;
    if (kind !== 'timed' && kind !== 'state' && kind !== 'while') continue;
    for (const piece of piecesOfTrack(track, history.slots)) keyed.push({ piece, key: pieceKey(piece) });
  }
  // 強化は、履歴を閉じる時に作った値の小片から（敵が持つ小片は、効果の対象の味方の各枠に写す）
  for (const p of history.amplified) {
    const holders = p.holder === ENEMY ? alliesOf(p.effect, p.sourceSlotIndex, history.slots) : [p.holder];
    for (const slotIndex of holders) {
      const piece: ValuePiece = {
        slotIndex,
        sourceSlotIndex: p.sourceSlotIndex,
        effect: { ...p.effect, value: p.value },
        start: p.start,
        end: p.end,
        stage: 2.5,
      };
      keyed.push({ piece, key: pieceKey(piece) });
    }
  }
  return keyed.sort((a, b) => compareKeys(a.key, b.key)).map((x) => x.piece);
}

/**
 * 履歴から区間と常時の値を作る（skills/timeline.ts の buildSegments。区間の値は、値の小片を時刻の順に足す）。段 E で、窓と記録の
 * 書き出しを消した（読む側は履歴を読む。plan/design-holder-effects.md 3 節の段 E）
 */
export function buffTimelineOf(
  history: HolderHistory,
  schedule: BurstSchedule | null,
  landings: TimelineLandings | null = null,
  sustainedHitRateUp = true,
): BuffTimeline {
  const { frames } = history;
  const passive = passiveStatesOf(history);
  const segments = buildSegments({
    slots: history.slots,
    schedule,
    frames,
    pieces: valuePiecesOf(history),
    passive,
    landings,
    sustainedHitRateUp,
  });
  return { frames, segments, passive };
}
