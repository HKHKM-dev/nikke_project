// 1 パス目の入口（planTeamRun）。射撃の列 → 時刻表 → バフの区間 → 倍率ダメージの発動を作り、2 パス目（sim/engine.ts）に渡す。
// 射撃の列と時刻表は frame/firstPass.ts のフレームループで作る。
// バフの区間は、そのループの件の一覧の履歴（TeamPlan.history）から作る（plan/design-holder-effects.md 2.7 節）。
// 倍率ダメージの発動は、確定した射撃の列と時刻表から作る。
import { burstDelaysOf, isSplit, sameActivationBuffsOnHit } from '../burst/landing.ts';
import { battleSecondsToFrames } from '../time.ts';
import { effectFrameOf, hitFramesOf, isInFullBurst, type BurstSchedule } from '../burst/schedule.ts';
import {
  computeTriggerDamage,
  partialChargeTriggerDamage,
  type EnemyDebuffTiming,
  type EnemyInput,
  type TriggerDamage,
} from '../damage.ts';
import {
  SKILL_HIT_FULL_BURST_BONUS,
  computeSkillHit,
  damageHitFramesOf,
  effectHitFrames,
  perCountFrames,
  resolveDamageEffects,
  resolveDotEffects,
  resolvePerShotDamage,
  type ResolvedDamageEffect,
  type ResolvedSkillDamage,
  type SkillHitResult,
  type SustainedDamagePlacement,
} from '../skills/burstDamage.ts';
import { cycleFires, cycleShotFrames, resolveCycles } from '../skills/cycles.ts';
import {
  MAX_SKILL_LEVELS,
  isResolvedApplied,
  isResolvedTimer,
  isResolvedEventCount,
  isResolvedShotCount,
  resolveDotCancels,
  resolveDotStackUps,
  type ResolvedTrigger,
} from '../skills/resolve.ts';
import {
  EMPTY_BUFF_STATE,
  appliedFrames,
  timerDamageFrames,
  resolvePassiveStates,
  segmentIndexAt,
  triggerFrames,
  type BuffTimeline,
  type SlotBuffState,
} from '../skills/timeline.ts';
import {
  ENEMY,
  buffTimelineOf,
  counterEffectiveFrom,
  counterFullFrames,
  itemsOf,
  selfHpRatioOf,
  stacksHold,
  valuePiecesOf,
  type HolderHistory,
  type ValuePiece,
} from '../skills/holders.ts';
import {
  applyResolvedEffect,
  hitRateNOf,
  type AttackRounding,
  type BuffTotals,
  type HitRateN,
} from '../skills/buffs.ts';
import type { CounterId } from '../skills/counters.ts';
import { stateMatches, statesMatching, type NamedStateId } from '../skills/states.ts';
import { everyAtOf, type ShotCountEveryAt } from '../skills/triggers.ts';
import {
  isCounterFullTrigger,
  isSummonAttackTrigger,
  ENEMY_HELD_STATS,
  isEnemyHeldStat,
  isFixedAttackScaling,
  isStateStat,
  selfHpHolds,
  splitsPerCount,
  staticStatesOf,
  type EffectCondition,
  type SelfStateCondition,
} from '../skills/types.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import {
  toTimelineSlots,
  validateControlledSlot,
  validateObstacleBreaks,
  validatePelletHits,
  validateTeamSlots,
  type TeamInput,
  type TeamSlotInput,
} from '../team.ts';
import { untargetableRanges } from './events.ts';
import type { FrameRange } from '../skills/timeline.ts';
import { dotStacksAt, dotTicks, groupDotsByState } from './dot.ts';
export {
  DOT_LATER_TICK_DELAY_SECONDS,
  dotTickFrames,
  dotTickTracker,
  dotTicks,
  groupDotsByState,
  type DotTick,
  type DotTickTracker,
} from './dot.ts';
import { runFirstPass, type FirstPassResult, type InstantApplication } from './firstPass.ts';
import {
  flightFramesAt,
  hitRateSpanWith,
  hitRateSpansOf,
  landingPartsWith,
  inEffectiveRangeAt,
  landingTriggerDamage,
  planLandings,
  slotAutoAttackCoreRatesOf,
  slotDistanceRatesOf,
  slotFlightsOf,
  slotWeaponChangeFirstHitsOf,
  weaponChangeParts,
  type FlightFrameSpan,
  type LandingHitRateSpan,
  type LandingPlan,
} from './landing.ts';
import type { ShotLog } from './shots.ts';
import type { SkillSlot } from '../types.ts';

/** 倍率ダメージ 1 回の発動（1 パス目で決まる） */
export type SkillHitEvent = {
  frame: number;
  slotIndex: number;
  effect: ResolvedDamageEffect;
  hit: SkillHitResult;
  /** スタックする持続ダメージ（dot の maxStacks > 1）の tick なら、その tick の時点のスタックの数。hit はこの数倍の値 */
  stacks?: number;
  /** 持続ダメージの、付けた時の 1 スタックぶんのヒット（dot の hitOnApply）。tick ではない */
  onApply?: true;
  /**
   * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.2 節）: 累計の窓 [start, end) と最大量。2 パス目（sim/engine.ts）が、
   * hit の値を窓の中に的が受けたダメージの和（最大量で切る）に置き換える（1 パス目の hit の値は式の値で、使わない）
   */
  accumulate?: AccumulateWindow;
};

/**
 * 蓄積して爆発するダメージの累計の窓（plan/design-accumulate-explosion.md 2.2〜2.4 節）。source team は窓 [start, end) に的が受けた味方全員の
 * ダメージ、self は窓の中の発動者の発の値 × (ratio + 蓄積割合▲)。2 パス目が、その和を最大量 cap で切って爆発の値にする
 */
export type AccumulateWindow = {
  start: number;
  end: number;
  cap: number;
  source: 'team' | 'self';
  ratio: number;
  /** 窓を開けた（付けた）フレーム。team は start、self は付けた発（溜めない） */
  opened: number;
  /** self: 最大量に届いた爆発か（届かなければ切れた時の爆発） */
  capped?: true;
};

/**
 * 枠 index の 1 発の値（区間の 1 トリガー値）。2 パス目の区間（sim/engine.ts）と、1 パス目の蓄積爆破の発の値（plan/design-accumulate-
 * explosion.md 2.4 節）が同じ関数で出す。segmentLanding は区間の頭の着地点（frame/landing.ts の landingPartsWith）
 */
export function slotTriggerDamage(
  slot: TeamSlotInput,
  index: number,
  enemy: EnemyInput,
  landing: LandingPlan | null,
  segmentLanding: string | null | undefined,
  buffs: BuffTotals,
  fullBurst: boolean,
  perShot: ResolvedSkillDamage[],
  attackRounding: AttackRounding | undefined,
): TriggerDamage {
  return landingTriggerDamage(
    {
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
      attackRounding,
      buffs,
      perShot,
    },
    // C-0170: 持続の命中率▲が効いている区間は、その区間の N でコア命中率を出し直す。即着弾に替えた使用武器の
    // 変更の区間は、的の表の変更後の武器の行のコア命中率。適正最小射程距離▲ の区間は距離ボーナスも出し直す
    weaponChangeParts(
      enemy,
      landingPartsWith(landing, slot, index, segmentLanding, hitRateNOf(buffs), buffs.minEffectiveRange),
      buffs.weapon?.targetRowKey,
    ),
    fullBurst,
  );
}

/** 1 パス目の結果 */
export type TeamPlan = {
  frames: number;
  /** 各枠の射撃の列（空枠は null） */
  shots: (ShotLog | null)[];
  schedule: BurstSchedule | null;
  timeline: BuffTimeline;
  /** 倍率ダメージ（damage）の発動（フレーム順） */
  skillHits: SkillHitEvent[];
  /** 即時効果（CT 短縮・弾丸チャージ）を当てた記録（発生順） */
  instants: InstantApplication[];
  /** 敵を狙えない窓（フレーム。出来事が無ければ空） */
  untargetable: FrameRange[];
  /** 着地点の計画（条件が自動の枠が無い、または的の表の無い敵では null） */
  landing: LandingPlan | null;
  /** V-0030: 段の循環のヒットで溜めたゲージ（1 パス目の記録。frame/firstPass.ts） */
  cycleGaugeHits: FirstPassResult['cycleGaugeHits'];
  /** 持続ダメージで溜めたゲージ（1 パス目。テスト用） */
  dotGauges: FirstPassResult['dotGauges'];
  /** 発のゲージ（着弾のフレーム。1 パス目の記録。frame/firstPass.ts） */
  shotGauges: FirstPassResult['shotGauges'];
  /** 周期のゲージ（1 パス目の記録。V-0483） */
  timerGauges: FirstPassResult['timerGauges'];
  /** 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.4 節）: 蓄積爆破の爆発（1 パス目の記録。テスト用） */
  accumulateReleases: FirstPassResult['accumulateReleases'];
  /** 1 パス目の件の一覧の履歴（plan/design-holder-effects.md 2.9 節） */
  history: HolderHistory;
};

/**
 * 1 パス目。射撃の列 → 時刻表（常時のゲージ速度込み）→ バフの区間（射撃の回数トリガー込み）→ 倍率ダメージの発動。
 * 射撃の列と時刻表は runFirstPass のフレームループで同時に作る（射撃に効くバフ・CT 短縮・弾丸チャージ込み）。
 * バフの区間と倍率ダメージは、確定した射撃の列と時刻表から作る。バフの区間は 1 パス目の履歴から作る。
 */
export function planTeamRun(teamInput: TeamInput): TeamPlan {
  // 直接呼ばれても宝物の段階が効くように。最上位で適用済みなら何もしない（同じオブジェクト）
  const input = applyCompositionToTeam(applyTreasureToTeam(teamInput));
  const { slots, enemy, model } = input;
  validateTeamSlots(slots);
  validateControlledSlot(slots, input.controlledSlot);
  validateObstacleBreaks(slots, input.obstacleBreaks);
  validatePelletHits(slots, input.pelletHits);
  const frames = battleSecondsToFrames(input.durationSeconds);
  const timelineSlots = toTimelineSlots(slots);
  const untargetable = untargetableRanges(enemy.events, frames);
  // 条件が自動の枠の着地点（敵の出来事だけで決まるので、射撃より前に決まる）
  const landing = planLandings(slots, enemy, frames, resolvePassiveStates(timelineSlots));
  // 蓄積爆破の発の値（下の shotValueAt）: 枠ごとの着弾の区間のカーソルと、1 発の倍率ダメージの解決
  const shotSpanAt: number[] = [];
  const perShotOf: ResolvedSkillDamage[][] = [];
  const first = runFirstPass(timelineSlots, {
    frames,
    model,
    burst: input.burst ?? false,
    burstModel: input.burstModel ?? 'dynamic',
    controlledSlot: input.controlledSlot ?? null,
    ...(input.manualBursts === undefined ? {} : { manualBursts: input.manualBursts }),
    ...(input.noBurstSlots === undefined ? {} : { noBurstSlots: input.noBurstSlots }),
    untargetable,
    ...(input.holdFire === undefined ? {} : { holdFire: input.holdFire }),
    hitRates: landing === null ? undefined : hitRateSpansOf(landing, slots.length),
    enemyHasCore: enemy.hasCore,
    // plan/design-anis-star-gauge-timing.md: 飛ぶ時間（的の表）と、発が壊した障害物（録画で数えた入力）
    flights: slotFlightsOf(slots, enemy, frames),
    // plan/design-eunhwa-tu-burst-shot-timing.md: 使用武器変更の最初の発の時刻（的の表）
    weaponChangeFirstHits: slotWeaponChangeFirstHitsOf(slots, enemy, frames),
    obstacleBreaks: input.obstacleBreaks ?? [],
    pelletHits: input.pelletHits ?? [],
    // plan/design-sustained-hit-rate-gauge.md: 持続の命中率▲を 1 パス目のゲージと命中の期待値にも効かせる（2 パス目と同じ切り替え）
    ...(landing === null || input.sustainedHitRateUp === false
      ? {}
      : {
          hitRateWith: (slotIndex: number, span: LandingHitRateSpan, timed: HitRateN) =>
            hitRateSpanWith(landing, slots[slotIndex]!, slotIndex, span, timed),
        }),
    // 条件「適正射程距離内なら」（着地点の計画が無ければ手入力の距離ボーナス。plan/design-agent-bunny.md 2.2 節）
    effectiveRangeAt: (slotIndex: number, frame: number, minRange: number) =>
      inEffectiveRangeAt(landing, slots[slotIndex]!, slotIndex, frame, minRange),
    // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.4 節）: 蓄積爆破の発の値は、2 パス目の区間と同じ関数で数える
    shotValueAt: (slotIndex, frame, buffs, fullBurst, progress) => {
      const slot = slots[slotIndex]!;
      // 溜める発のフレームは枠ごとに増えるだけなので、着弾の区間（[0, frames) を隙間なく覆う）は枠ごとのカーソルで進める
      let segmentLanding;
      if (landing !== null) {
        let at = shotSpanAt[slotIndex] ?? 0;
        while (at + 1 < landing.spans.length && landing.spans[at]!.end <= frame) at += 1;
        shotSpanAt[slotIndex] = at;
        segmentLanding = landing.spans[at]?.landing ?? null;
      }
      const trigger = slotTriggerDamage(
        slot,
        slotIndex,
        enemy,
        landing,
        segmentLanding,
        buffs,
        fullBurst,
        (perShotOf[slotIndex] ??= perShotDamageOf(slot)),
        input.attackRounding,
      );
      const value =
        progress === undefined ? trigger.perTrigger : partialChargeTriggerDamage(trigger, progress).perTrigger;
      return { value, attack: trigger.attack };
    },
  });
  const { shots, schedule, instants, cycleGaugeHits, dotGauges, shotGauges, timerGauges } = first;
  // バフの区間は、1 パス目の件の一覧の履歴から作る（plan/design-holder-effects.md 2.7 節）
  const sustainedHitRateUp = input.sustainedHitRateUp ?? true;
  const timeline = buffTimelineOf(first.history, schedule, landing, sustainedHitRateUp);
  const skillHits = planSkillHits(
    slots,
    enemy,
    timeline,
    first.history,
    schedule,
    frames,
    shots,
    first,
    input.sustainedDamagePlacement,
    slotAutoAttackCoreRatesOf(slots, enemy, frames),
    input.attackRounding,
    slotDistanceRatesOf(landing, slots, frames),
  );
  return {
    frames,
    shots,
    schedule,
    timeline,
    skillHits,
    instants,
    untargetable,
    landing,
    cycleGaugeHits,
    dotGauges,
    shotGauges,
    timerGauges,
    accumulateReleases: first.accumulateReleases,
    history: first.history,
  };
}

/** その枠の射撃ごとの倍率ダメージ（1 トリガーの値に畳み込む）。定義が無ければ空 */
export function perShotDamageOf(slot: TeamSlotInput): ResolvedSkillDamage[] {
  const definition = slot.skills?.definition;
  if (!definition) return [];
  return resolvePerShotDamage(definition, slot.character, slot.skills?.levels ?? MAX_SKILL_LEVELS);
}

/** バースト系のトリガー（burstDamage と同じく発動直前のバフで計算する）か */
function isBurstUseTrigger(trigger: ResolvedTrigger): boolean {
  return trigger === 'burstUse' || (isResolvedEventCount(trigger) && trigger.count === 'burstUse');
}

/**
 * 倍率ダメージ（damage）の発動を列挙し、発動フレームのバフで期待ダメージを計算する。
 * 射撃の回数トリガーはその射撃と同じバフ（その射撃で付くバフは次のフレームからなので含まない）、
 * バーストを使った時のもの（burstUse とその回数）は burstDamage と同じく発動直前のバフ。
 */
export function planSkillHits(
  slots: readonly (TeamSlotInput | null)[],
  enemy: EnemyInput,
  timeline: BuffTimeline,
  /**
   * 1 パス目の履歴（plan/design-holder-effects.md 2.8 節）。条件 enemyState は敵の状態の件、
   * 下位効果のスタック適用は値の小片、{ applied } は付いた記録、段の循環は間隔の変更の件を見る。条件 selfCounter と
   * perCount の { counter } はカウンタの記録を見る。条件 selfHp は HP の割合の段（hpRatios）を見る
   */
  history: SkillHitsHistory,
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[],
  /**
   * 1 パス目が決めた召喚の攻撃の発火（plan/design-ein-near-feather.md 1.3 節）。蓄積して爆発するダメージ
   * （plan/design-accumulate-explosion.md 2.4 節）: 1 パス目が決めた蓄積爆破の爆発
   */
  {
    summonHits,
    accumulateReleases,
    cooldownTimerFires,
  }: Pick<FirstPassResult, 'summonHits' | 'accumulateReleases' | 'cooldownTimerFires'>,
  sustainedDamagePlacement?: SustainedDamagePlacement,
  /** 枠ごとの自動攻撃のコアに当たる割合の区間（frame/landing.ts の slotAutoAttackCoreRatesOf）。省略はコアなし */
  autoAttackCoreRates: readonly (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[] = [],
  /** 攻撃力▲の丸め（TeamInput.attackRounding）。省略はいまのモデル */
  attackRounding?: AttackRounding,
  /**
   * 枠ごとの、通常攻撃に距離ボーナスの付く割合の区間（frame/landing.ts の slotDistanceRatesOf）。damage の distance の
   * ヒットが読む。省略は距離ボーナスなし
   */
  distanceRates: readonly (FlightFrameSpan[] | null)[] = [],
): SkillHitEvent[] {
  const hits: SkillHitEvent[] = [];
  // damage の条件 enemyState が見る、敵の状態ごとの「付いている」区間。敵の状態の件（どの出どころの件でもよい）
  const enemySpans = new Map<NamedStateId, { start: number; end: number }[]>();
  // 敵に付く状態の付与の件（ブームインストール）も同じ列に入れる（plan/design-elegg-s3.md 2 節の 2）
  // dot の stacksFrom が写す、敵にスタックで付く状態の付与の件（出どころの枠 × 状態。海風。plan/design-mast.md 2.3 節）
  const enemyGrantStacks = new Map<string, { start: number; end: number; stack?: number }[]>();
  for (const item of itemsOf(history, { holder: ENEMY })) {
    if (item.origin.kind !== 'enemyState' && item.origin.kind !== 'state') continue;
    enemySpans.set(item.origin.state, [...(enemySpans.get(item.origin.state) ?? []), item]);
    if (item.origin.kind !== 'state' || item.stack === undefined) continue;
    const key = `${item.sourceSlotIndex}:${item.origin.state}`;
    const list = enemyGrantStacks.get(key);
    if (list === undefined) enemyGrantStacks.set(key, [item]);
    else list.push(item);
  }
  /** フレーム frame に敵に付いている、枠 sourceSlotIndex の状態 state のスタックの数（そのフレームに付いた段も入れる。条件 enemyState と同じ見え方） */
  const enemyGrantStacksAt = (sourceSlotIndex: number, state: NamedStateId, frame: number): number => {
    let stacks = 0;
    for (const x of enemyGrantStacks.get(`${sourceSlotIndex}:${state}`) ?? [])
      if (x.start <= frame && frame < x.end) stacks = Math.max(stacks, x.stack ?? 0);
    return stacks;
  };
  // 下位効果のスタック適用が見る値の小片（区間に足すのと同じ。状態だけの stat は入れない）
  const pieces = valuePiecesOf(history).filter((p) => !isStateStat(p.effect.stat));
  const ctx: SkillHitsContext = {
    enemy,
    timeline,
    history,
    schedule,
    frames,
    shots,
    summonHits,
    accumulateReleases,
    cooldownTimerFires,
    sustainedDamagePlacement,
    autoAttackCoreRates,
    attackRounding,
    distanceRates,
    hits,
    enemySpans,
    enemyGrantStacksAt,
    pieces,
  };
  slots.forEach((slot, slotIndex) => {
    const s = slotReadersOf(ctx, slot, slotIndex);
    if (s === null) return;
    damageEffectHits(ctx, s);
    dotHits(ctx, s);
    cycleHits(ctx, s);
  });
  // フレーム順（同じフレームは枠順・定義順。sort は安定）
  return hits.sort((a, b) => a.frame - b.frame || a.slotIndex - b.slotIndex);
}

/** planSkillHits が読む 1 パス目の履歴 */
type SkillHitsHistory = Pick<
  HolderHistory,
  'tracks' | 'amplified' | 'slots' | 'applications' | 'counters' | 'hpRatios'
>;

/** planSkillHits の枠ごとの関数が読む、引数と、枠をまたいで共有するもの */
type SkillHitsContext = Pick<FirstPassResult, 'summonHits' | 'accumulateReleases' | 'cooldownTimerFires'> & {
  enemy: EnemyInput;
  timeline: BuffTimeline;
  history: SkillHitsHistory;
  schedule: BurstSchedule | null;
  frames: number;
  shots: readonly (ShotLog | null)[];
  sustainedDamagePlacement: SustainedDamagePlacement | undefined;
  autoAttackCoreRates: readonly (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[];
  attackRounding: AttackRounding | undefined;
  distanceRates: readonly (FlightFrameSpan[] | null)[];
  /** 積むヒット（すべての枠） */
  hits: SkillHitEvent[];
  /** 敵の状態ごとの「付いている」区間 */
  enemySpans: ReadonlyMap<NamedStateId, readonly { start: number; end: number }[]>;
  enemyGrantStacksAt: (sourceSlotIndex: number, state: NamedStateId, frame: number) => number;
  /** 下位効果のスタック適用が見る値の小片 */
  pieces: readonly ValuePiece[];
};

/**
 * 枠 slotIndex の、倍率ダメージ・持続ダメージ・段の循環のヒットを作るのに要る読み口（定義の無い枠は null）。同じ発動の順の
 * バーストの検査もここで行う。push はヒットを ctx.hits に積む
 */
function slotReadersOf(ctx: SkillHitsContext, slot: TeamSlotInput | null, slotIndex: number) {
  const {
    enemy,
    timeline,
    history,
    schedule,
    sustainedDamagePlacement,
    autoAttackCoreRates,
    attackRounding,
    distanceRates,
    hits,
    pieces,
  } = ctx;
  const definition = slot?.skills?.definition;
  if (!slot || !definition) return null;
  const levels = slot.skills?.levels ?? MAX_SKILL_LEVELS;
  const sequential = definition.skills.burst.sequential === true;
  // damage の条件 selfState が見る、自分の静的な状態と状態の件（段の印に依らない。
  // 発火のフレームより前に付いた件だけを見る。同じフレームに付いた件（同じ発動の付与を含む）は見ない（C-0160 と同じ読み。V-0432）。
  // 解除・消去で外れる件はそのフレームまで付いている。plan/design-skill-stage1.md 1.1 節）。家族の根なら、家族のどの
  // 状態でも当たる（plan/design-skill-stage5.md 1.2 節）。スタック数の条件は、同じ件の段の最大を見る（skills/holders/items.ts の stacksHold。
  // plan/design-skill-stage3.md 1.4 節）
  const ownStatics = new Set(staticStatesOf(definition));
  const ownStateItems = itemsOf(history, { holder: slotIndex, kind: 'state' });
  const selfStateHolds = (self: SelfStateCondition, frame: number): boolean => {
    const isStatic = [...ownStatics].some((s) => stateMatches(self.state, s));
    const active = ownStateItems.filter(
      (i) => i.origin.kind === 'state' && stateMatches(self.state, i.origin.state) && i.start < frame && frame < i.end,
    );
    if (self.stacks === undefined) return (isStatic || active.length > 0) === self.present;
    return stacksHold(
      self.stacks,
      isStatic,
      [...new Set(active.map((i) => i.origin))].map((origin) => ({
        origin,
        items: active.filter((i) => i.origin === origin),
      })),
    );
  };
  // perCount が読む、自分のその状態のスタック数（selfStateHolds と同じ件。静的な状態は 1）
  const selfStackCount = (state: NamedStateId, frame: number): number => {
    let level = [...ownStatics].some((s) => stateMatches(state, s)) ? 1 : 0;
    for (const i of ownStateItems) {
      if (i.origin.kind !== 'state' || !stateMatches(state, i.origin.state)) continue;
      if (i.start < frame && frame < i.end) level = Math.max(level, i.stack ?? 1);
    }
    return level;
  };
  // 条件 selfCounter と perCount の { counter } が読む、自分のカウンタの発火のフレームの値（前のフレームの終わりの
  // 値。1 パス目の判定と同じ見え方。戦闘開始時の増減はフレーム 0 から。counterEffectiveFrom。
  // plan/design-skill-stage11.md 2.5 節）
  const ownCounters = history.counters.filter((r) => r.slotIndex === slotIndex);
  const counterAt = (counter: CounterId, frame: number): number => {
    let value = 0;
    for (const r of ownCounters) if (r.counter === counter && counterEffectiveFrom(r) <= frame) value = r.value;
    return value;
  };
  // damage の条件の自分の側の読み口。selfHp（以上）は発火のフレームの HP の割合を見る（plan/design-soline.md 2.1 節）
  const self: SelfReaders = {
    stateHolds: selfStateHolds,
    counterAt,
    hpRatioAt: (frame) => selfHpRatioOf(history, slotIndex, frame),
  };
  // 同じ発動の順は、ヒットと効果の発火が同じフレームのキャラだけで決めてある（plan/design-burst-landing.md 3.2 節）
  const delays = burstDelaysOf(slot.character);
  if (sequential && delays.hitFrames !== delays.effectFrames) {
    throw new RangeError('a sequential burst needs the same hit and effect delays');
  }
  // 同じ発動の効果の順を、分かれたヒットにどう当てるかの根拠が無い（plan/design-burst-split-hits.md 4.1 節）
  if (sequential && isSplit(delays)) throw new RangeError('a sequential burst cannot have split hits');
  const push = (
    frame: number,
    effect: ResolvedDamageEffect,
    pre: boolean,
    stacks?: number,
    activationFrame = frame - delays.effectFrames,
    shooterAtHit = false,
    valueFrame = frame,
  ): { trigger: ReturnType<typeof computeTriggerDamage>; hit: SkillHitResult } => {
    // バースト使用時の倍率ダメージは、撃つ側のバフを発動の時点で固定する（burstHitBuffs）。発動は発火の effectFrames 前
    // （分かれたヒットごとに出す damage は、発動のフレームを渡す）。
    // バーストのヒットごとに出す追加ダメージ（perBurstHit）は、撃つ側のバフもヒットの時点の値で出す
    // （シンデレラの S1 の攻撃力▲は、ヒットの時の最終最大HP を読み直す。バーストのヒットは発動の時点のまま。C-0657。V-0527）
    // 敵の側のデバフ（受けるダメージ▲・防御力▼）は
    // 効果の発火の直前の値で見る（イサベルの段階 2・3 には、遅れの間に付いたブームインストールの▼が乗る。同じフレームの
    // バーストのヒットは発動の時点のまま。C-0837。plan/design-burst-landing.md 12 節の案 A。C-0838）。
    // 遅れ 0 のキャラは発動と発火が同じフレームなので変わらない
    const atFire = pre && !shooterAtHit;
    const enemyDebuffs = enemy.burstEffectEnemyDebuffs ?? 'hit';
    const atHit = atFire
      ? burstHitBuffs(timeline, activationFrame, frame, slotIndex, pre, undefined, enemyDebuffs)
      : burstSnapshotState(timeline, valueFrame, slotIndex, pre).buffs;
    // スキルのスロットの sequential は（plan/design-ludmilla-wo.md 2.4 節）、射撃の回数
    // トリガーの発火（窓は次のフレームから）の damage に、同じ発火で前に書いた timed を足す
    // 下位効果のスタック適用でないバーストでも、追加ダメージには、同じ発火で前に書いた敵の側の
    // デバフ（防御力▼）が乗る（ギルティのフルスタックの防御力▼。同じフレームのバーストスキルダメージには乗らない。C-0838 の続きなので、
    // 敵の側のデバフを発火の時点で見るとき（enemyDebuffs が 'hit'）だけ。V-0627）
    const skill = effect.source.skill;
    const buffs =
      atFire && skill === 'burst' && (sequential || enemyDebuffs === 'hit')
        ? withEarlierSequentialEffects(
            pieces,
            atHit,
            frame,
            slotIndex,
            skill,
            effect.effectIndex,
            sequential ? undefined : isEnemyHeldStat,
          )
        : skill !== 'burst' && definition.skills[skill].sequential === true && isResolvedShotCount(effect.trigger)
          ? withEarlierSequentialEffects(pieces, atHit, frame + 1, slotIndex, skill, effect.effectIndex)
          : atHit;
    const trigger = computeTriggerDamage({
      character: slot.character,
      growth: slot.growth,
      enemy,
      attackOverride: slot.attackOverride,
      attackRounding,
      buffs,
      condition: { ...slot.condition, fullBurst: false },
    });
    // フルバースト補正はフルバースト中に出た倍率ダメージにだけ乗る（2026-09-23 実測）
    const fullBurst = SKILL_HIT_FULL_BURST_BONUS && schedule !== null && isInFullBurst(schedule, valueFrame);
    // スタックする持続ダメージの tick は、1 スタックの倍率 × スタックの数（C-0182）
    const scaled = stacks === undefined ? effect : { ...effect, multiplier: effect.multiplier * stacks };
    // core の自動攻撃は、ヒットのフレームの着地点の行の割合（plan/design-anis-star-core-path.md 3.2 節）
    // コア命中ダメージは割合 1（plan/design-new-chars-1029.md 5.4 節）。damage の core も自動攻撃と同じ行
    const coreRate =
      effect.coreHit === true
        ? 1
        : effect.core === true
          ? flightFramesAt(autoAttackCoreRates[slotIndex]?.[effect.source.skill], frame)
          : 0;
    // distance のヒットは、ヒットのフレームの撃った枠の通常攻撃と同じ距離ボーナスの割合
    const distanceRate = effect.distance === true ? flightFramesAt(distanceRates[slotIndex], frame) : 0;
    const hit = computeSkillHit(
      [scaled],
      slot.character,
      enemy,
      trigger,
      buffs,
      fullBurst,
      sustainedDamagePlacement,
      coreRate,
      distanceRate,
    );
    hits.push({ frame, slotIndex, effect, hit, ...(stacks === undefined ? {} : { stacks }) });
    return { trigger, hit };
  };
  // 間隔の変更の件（持ち主はその枠。時刻の順）。窓が効く先（段の循環か、射撃の回数のきっかけか）とスロットで絞る（plan/design-skill-stage12.md 2.4 節）
  const everyWindows = (target: 'cycle' | 'shotCounts', skill: SkillSlot) =>
    itemsOf(history, { holder: slotIndex, kind: 'cycleEvery' }).flatMap((i) =>
      i.origin.kind === 'cycleEvery' && i.origin.effect.target === target && i.origin.effect.targetSkill === skill
        ? [{ start: i.start, end: i.end, every: i.origin.effect.every }]
        : [],
    );
  return {
    slot,
    slotIndex,
    counterAt,
    definition,
    everyWindows,
    levels,
    ownCounters,
    ownStateItems,
    push,
    self,
    selfStackCount,
    selfStateHolds,
    sequential,
  };
}

/** 枠の読み口（slotReadersOf が返す物） */
type SlotReaders = NonNullable<ReturnType<typeof slotReadersOf>>;

/** 枠の倍率ダメージ（damage）のヒットを積む */
function damageEffectHits(ctx: SkillHitsContext, s: SlotReaders): void {
  const { history, schedule, frames, shots, summonHits, accumulateReleases, hits, enemySpans, cooldownTimerFires } =
    ctx;
  const {
    slot,
    slotIndex,
    definition,
    levels,
    sequential,
    selfStateHolds,
    selfStackCount,
    ownCounters,
    counterAt,
    self,
    push,
    everyWindows,
  } = s;
  // 自分の発動（perBurstHit の damage が、発火のフレームからヒットのフレームの列を引く）
  const mine = (schedule?.activations ?? []).filter((a) => a.slotIndex === slotIndex);
  const everyAtFor = (skill: SkillSlot): ShotCountEveryAt | undefined => everyAtOf(everyWindows('shotCounts', skill));
  /** 1 パス目が追ったクールタイムの印のある周期の発火（どの印のある周期も 1 パス目が記録する） */
  const cooldownFiresOf = (slotIndex: number, skill: SkillSlot): number[] => {
    const record = cooldownTimerFires.find((c) => c.slotIndex === slotIndex && c.skill === skill);
    if (record === undefined)
      throw new Error(`the first pass has no cooldown timer fires for slot ${slotIndex} ${skill}`);
    return record.frames;
  };
  for (const effect of resolveDamageEffects(definition, slot.character, levels)) {
    // delayFrames があれば、きっかけの後のフレームに
    // そのフレームのバフで出す（発動の直前のバフで固定しない。plan/design-delayed-skill-hit.md 3.1 節）。戦闘の終わりを越えるヒットは出さない
    const delay = effect.delayFrames ?? 0;
    const pre = delay === 0 && isBurstUseTrigger(effect.trigger) && BURST_HIT_USES_PRE_ACTIVATION_BUFFS;
    // 同じ発動の効果の順を、分かれたヒットにどう当てるかの根拠が無い（分かれたヒットと同じ）
    if (sequential && effect.perBurstHit === true)
      throw new RangeError('a sequential burst cannot have perBurstHit damage');
    // 「〈状態名〉が適用された時」は、その状態がこの枠に付いたフレーム
    // （時刻表の applications。plan/design-persona.md 3.3 節・plan/design-named-state.md 5.3 節）
    // 状態の間だけ縮む周期は、前の発動のフレームの自分の状態で
    // 次の発動までの秒を決めて並べる（plan/design-new-chars-1029.md 5.3 節）
    const shorten = effect.periodShorten;
    // 蓄積爆破（plan/design-accumulate-explosion.md 2.3・2.4 節）: 1 パス目が決めた爆発のフレームに、1 パス目が付けた発のフレームで決めた最大量で
    // 爆発のヒットを置く。ヒットの値は 2 パス目（sim/engine.ts）が窓の中の発の値から出す
    const accumulate = effect.accumulate;
    if (accumulate?.source === 'self') {
      for (const r of accumulateReleases) {
        if (r.slotIndex !== slotIndex || r.effect.source.skill !== effect.source.skill) continue;
        if (r.effect.effectIndex !== effect.effectIndex) continue;
        push(r.frame, effect, false, undefined, undefined, false, r.applied);
        hits[hits.length - 1]!.accumulate = {
          start: r.applied + 1,
          end: r.end,
          cap: r.cap,
          source: 'self',
          ratio: accumulate.ratio,
          opened: r.applied,
          ...(r.capped ? { capped: true as const } : {}),
        };
      }
      continue;
    }
    // { counterFull } はカウンタが上限に届いた次のフレーム（1 パス目の記録。plan/design-skill-stage13.md 2.2 節）
    const t = effect.trigger;
    // 召喚の攻撃は 1 パス目が決めた発火のフレーム
    const fires = isSummonAttackTrigger(t)
      ? summonHits.filter((h) => h.slotIndex === slotIndex && h.summon === t.summon).map((h) => h.frame)
      : isCounterFullTrigger(t)
        ? counterFullFrames(ownCounters, slotIndex, t.counterFull)
        : isResolvedApplied(t)
          ? appliedFrames(history, t.applied, slotIndex)
          : isResolvedTimer(t)
            ? // クールタイムの印のある周期は 1 パス目の記録（plan/design-arcana-magician.md 2.1 節）
              t.cooldown === true
              ? cooldownFiresOf(slotIndex, effect.source.skill)
              : timerDamageFrames(t, shorten, frames, schedule, slotIndex, (state, f) =>
                  selfStateHolds({ state, present: true }, f),
                )
            : triggerFrames(t, schedule, slotIndex, frames, shots, undefined, everyAtFor(effect.source.skill));
    for (const frame of fires) {
      if (!damageConditionHolds(effect.condition, frame, schedule, enemySpans, self)) continue;
      // 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.2 節）: 発火のフレームから窓を開け、窓の終わりの遅れの後に
      // 爆発のヒットを置く。最大量は発火のフレームの最終攻撃力 × 倍率 × (1 + 分配ダメージ▲)（C-0904 と同じ形）。ヒットの値は
      // 2 パス目（sim/engine.ts）が窓の中のダメージの和にする
      const acc = effect.accumulate;
      if (acc?.source === 'team') {
        const end = frame + acc.durationFrames;
        if (end + acc.releaseDelayFrames >= frames) continue;
        const { trigger, hit } = push(end + acc.releaseDelayFrames, effect, false, undefined, undefined, false, frame);
        hits[hits.length - 1]!.accumulate = {
          start: frame,
          end,
          cap: trigger.attack * effect.multiplier * hit.distributedDamageMultiplier,
          source: 'team',
          ratio: 1,
          opened: frame,
        };
        continue;
      }
      // 「〈名前〉スタックコピー」は発火のフレームのスタック数を倍率に掛ける
      // （条件 selfState と同じく、発火のフレームより前に付いた件の段の最大。0 なら出さない。V-0502。plan/design-skill-stage10.md 2.1 節）。「× オーバー
      // エネルギー段階」は発火のフレームのカウンタの値（V-0532）
      const per = effect.perCount;
      const copied =
        per === undefined
          ? undefined
          : 'state' in per
            ? selfStackCount(per.state, frame)
            : counterAt(per.counter, frame);
      if (copied === 0) continue;
      // 数だけのヒットを、倍率を掛けずに 1 つずつ間隔を空けて出す
      // （粘着榴弾の起爆・キャプチャーチェーンの攻撃。perCountFrames。それぞれのフレームのバフとフルバースト補正。plan/design-skill-stage12.md 2.2 節）。
      // オートファイアの順番の攻撃（フルチャージの発のフレームのオートファイア
      // 準備のスタック数。発で外れる前の数。V-0552。plan/design-skill-stage14.md 2.5 節）も同じ形で、delayFrames の後から刻む。
      // 順番の攻撃（sequentialAttack）のヒットは、バフとフルバースト
      // 補正を発火のフレーム（オートファイアならフルチャージの発）の値で固定する
      // （plan/design-skill-stage14.md 2.7 節。V-0553）。「1 発間維持」の▲（窓は溜めが満ちたフレームから撃った
      // 発まで）は、その発の遅れて出る順番の攻撃の全部に乗り、次の発の順番の攻撃には乗らない
      if (splitsPerCount(effect) && copied !== undefined) {
        for (const at of effectHitFrames(effect, frame, copied, frames))
          push(at, effect, pre, undefined, undefined, false, effect.sequential === true ? frame : at);
        continue;
      }
      if (effect.perBurstHit === true) {
        // 条件は発火のフレームで 1 回判定し（C-0566）、
        // その発動のバーストの倍率ダメージのヒットのそれぞれに、等分しない倍率で出す（C-0565。plan/design-mihara-burst-hits.md 3.2 節）
        const activation = mine.find((a) => effectFrameOf(a) === frame);
        if (activation === undefined) throw new RangeError(`no burst activation fires at frame ${frame}`);
        for (const hit of hitFramesOf(activation)) {
          if (hit < frames) push(hit, effect, pre, copied, activation.frame, true);
        }
        continue;
      }
      // 「N 回順番に攻撃」は N ヒットを間をあけて出す（plan/design-new-chars-1029.md 5.2 節）。
      // 同 10.2 節の d: N ヒットとも発動（発火）のフレームのバフとフルバースト補正で出す（遅れ・間の後のヒットも。C-0735）。
      // N 回でない倍率ダメージは、遅れがあればヒットのフレームのバフ
      // エレグの S1（C-0766）: 値を決めるフレームのある効果（valueDelayFrames。N 回は 0）は、どのヒットも発火のその後の値で出す
      // （エレグの S1 は届いた発の次のフレームで、同じ発で付いた timed も乗る）
      // イサベルの S2（V-0632）: 値を決めるのが発火の直前の効果（valueBeforeFire）は、どのヒットも発火の 1 フレーム前の値で出す
      // （遅れの間と、発火のフレームで付いたたきなの S2 の▲は乗らない）
      for (const at of damageHitFramesOf(effect, frame, frames))
        push(
          at,
          effect,
          pre,
          copied,
          undefined,
          false,
          effect.valueDelayFrames !== undefined
            ? frame + effect.valueDelayFrames
            : effect.valueBeforeFire === true
              ? frame - 1
              : at,
        );
    }
  }
}

/** 枠の持続ダメージ（dot）の tick を積む */
function dotHits(ctx: SkillHitsContext, s: SlotReaders): void {
  const { history, schedule, frames, shots, hits, enemySpans, enemyGrantStacksAt } = ctx;
  const { slot, slotIndex, definition, levels, ownStateItems, self, ownCounters, counterAt, push } = s;
  // 持続ダメージの付くフレーム（plan/design-skill-stage13.md 2.3 節）。{ counterFull } の perCount は、発火の
  // applyDelayFrames 後から間隔ごとに、カウンタの数だけ 1 つずつ付く（キャプチャーチェーンの攻撃ごとのチェーンバインド）
  const dotApplicationFrames = (effect: ResolvedDamageEffect): number[] => {
    const t = effect.trigger;
    // 付くフレームの条件（自分の状態。damage と同じ判定。plan/design-skill-stage17.md 2.2 節）
    // 「〈状態〉が適用された時」は、その状態が自分に付いたフレーム（plan/design-skill-stage19.md 2.1 節。論点 4）
    if (isResolvedApplied(t)) return appliedFrames(history, t.applied, slotIndex);
    if (!isCounterFullTrigger(t)) {
      const at = triggerFrames(t, schedule, slotIndex, frames, shots);
      return effect.condition === undefined
        ? at
        : at.filter((f) => damageConditionHolds(effect.condition, f, schedule, enemySpans, self));
    }
    const per = effect.perCount;
    if (per === undefined || !('counter' in per) || effect.perCountIntervalFrames === undefined)
      throw new RangeError('a dot with { counterFull } needs perCount { counter } and perCountIntervalFrames');
    const step = { frames: effect.perCountIntervalFrames, delay: effect.dot!.applyDelayFrames };
    return counterFullFrames(ownCounters, slotIndex, t.counterFull).flatMap((f) =>
      perCountFrames(f, counterAt(per.counter, f), step, frames),
    );
  };
  // 持続ダメージ。付いた時から間隔ごとの tick を、倍率ダメージと同じ式で tick のフレームのバフで積む。
  // 同じ状態（state）の dot は 1 つの持続ダメージとして、発火をまとめて tick を出す（C-0136）。tick は、その時点で
  // 最後に付けた効果に帰属させる（値は同じ）。
  // スタックする持続ダメージ（maxStacks > 1）は、tick の時点のスタックの数を倍率に掛ける（dotTicks。C-0182）
  // 消去（cancelState）のフレームと、ほかの dot が写す元の付いたフレーム（plan/design-skill-stage13.md 2.5 節）
  const dotCancels = resolveDotCancels(definition, slot.character, levels);
  const cancelsOf = (state: NamedStateId | undefined): number[] =>
    state === undefined
      ? []
      : dotCancels
          .filter((c) => c.state === state)
          .flatMap((c) => triggerFrames(c.trigger, schedule, slotIndex, frames, shots))
          .sort((a, b) => a - b);
  // 敵のスタック量▲は、対象がその状態のフレーム（条件 enemyState。damage と同じ判定）だけ、同じ state の dot の付与として数える（1 スタックぶんの
  // ヒットと刻みの付け直しも付与と同じ。V-0548。plan/design-skill-stage13.md 2.6 節）。▲の付与は、その state の最初の dot の効果に帰属させる（値は同じ）
  const dotStackUps = resolveDotStackUps(definition, slot.character, levels);
  const dotGroups = groupDotsByState(resolveDotEffects(definition, slot.character, levels)).map((group) => {
    const fires = group
      .flatMap((effect) => dotApplicationFrames(effect).map((f) => ({ f, effect })))
      .sort((a, b) => a.f - b.f);
    const dot = group[0]!.dot!;
    const cancels = cancelsOf(dot.state);
    const ups = dotStackUps.filter((u) => u.state === dot.state);
    if (ups.length > 0) {
      for (const up of ups)
        for (const f of triggerFrames(up.trigger, schedule, slotIndex, frames, shots))
          if (damageConditionHolds(up.condition, f, schedule, enemySpans, self))
            for (let k = 0; k < up.amount; k++) fires.push({ f, effect: group[0]! });
      fires.sort((a, b) => a.f - b.f);
    }
    return { dot, fires, cancels };
  });
  for (const { dot, fires, cancels } of dotGroups) {
    const { maxStacks } = dot;
    // スタックコピー。付けた時に元の持続ダメージのスタックの数を写し、その数の tick を出す（0 なら付かない）
    const from = dot.stacksFrom;
    if (from !== undefined) {
      // 元は同じ定義の dot か、敵にスタックで付く状態の付与（skills/parse/crossChecks.ts の validateDotStateRefs）
      const source = dotGroups.find((g) => g.dot.state === from);
      const sourceFires = source?.fires.map((x) => x.f) ?? [];
      const stacksAt = (frame: number): number =>
        source !== undefined
          ? dotStacksAt(sourceFires, source.cancels, source.dot.maxStacks, frame)
          : enemyGrantStacksAt(slotIndex, from, frame);
      for (const { f, effect } of fires) {
        const copied = stacksAt(f);
        if (copied === 0) continue;
        for (const tick of dotTicks([f], dot.intervalSeconds, dot.durationSeconds, frames, dot.firstTick)) {
          // copyEachTick は tick ごとに写し直す（0 の tick は出さない。plan/design-mast.md 2.3 節）
          const stacks = dot.copyEachTick === true ? stacksAt(tick.frame) : copied;
          if (stacks > 0) push(tick.frame, effect, false, stacks);
        }
      }
      continue;
    }
    // 付けるたびに、付けた 1 スタックぶんの 1 ヒット（C-0411。plan/design-skill-stage13.md 2.3 節）
    if (dot.hitOnApply === true) {
      for (const { f, effect } of fires) {
        push(f, effect, false);
        hits[hits.length - 1]!.onApply = true;
      }
    }
    // 「〈状態〉解除まで」は、付いたフレームを含む自分のその状態の件ごとに、件の終わりまでの tick を出す
    // （件の続いている間の付き直しは、ほかの dot と同じく刻みを変えない）
    const until = dot.untilStateEnd;
    if (until !== undefined) {
      for (const item of ownStateItems) {
        if (item.origin.kind !== 'state' || item.origin.state !== until) continue;
        const first = fires.find(({ f }) => item.start <= f && f < item.end);
        if (first === undefined) continue;
        const end = Math.min(frames, item.end);
        for (const tick of dotTicks([first.f], dot.intervalSeconds, dot.durationSeconds, end, dot.firstTick))
          push(tick.frame, first.effect, false);
      }
      continue;
    }
    // tick の刻み・スタックの数・効果の帰属は、発火の tickDelayFrames 後（skills/types.ts の DotEffect.tickDelayFrames）を起点にする
    const starts = fires.map((x) => x.f + (dot.tickDelayFrames ?? 0));
    const ticks = dotTicks(
      starts,
      dot.intervalSeconds,
      dot.durationSeconds,
      frames,
      dot.firstTick,
      maxStacks,
      dot.tickIntervalFrames,
      cancels,
    );
    let last = 0;
    for (const tick of ticks) {
      while (last + 1 < starts.length && starts[last + 1]! <= tick.frame) last += 1;
      push(tick.frame, fires[last]!.effect, false, maxStacks > 1 ? tick.stacks : undefined);
    }
  }
}

/** 枠の段の循環のヒットを積む */
function cycleHits(ctx: SkillHitsContext, s: SlotReaders): void {
  const { frames, shots } = ctx;
  const { slot, slotIndex, definition, levels, push, everyWindows } = s;
  // 段の循環。射撃の列を通算で数え、間隔の変更の窓に入る射撃は窓の間隔で段を進める（skills/cycles.ts）。
  // 値は射撃の回数トリガーの倍率ダメージと同じく、ヒットのフレームのバフ（段の delayFrames があれば射撃の d 後）
  for (const cycle of resolveCycles(definition, slot.character, levels)) {
    const windows = everyWindows('cycle', cycle.source.skill);
    const shotFrames = cycleShotFrames(shots[slotIndex], cycle.trigger);
    for (const fire of cycleFires(cycle.trigger.every, cycle.steps.length, shotFrames, windows)) {
      // 段の delayFrames があれば、射撃の d 後に
      // そのフレームのバフで出す（紅蓮BS は A 10・B 9・C 9。C-0651。plan/design-shot-count-trigger-frame.md 6.6 節）。戦闘の終わりを越えるヒットは出さない
      const step = cycle.steps[fire.step]!;
      const at = fire.frame + (step.delayFrames ?? 0);
      if (at < frames) push(at, step, false);
    }
  }
}

/** damage の条件の、出どころの枠の自分の側の読み口（状態・カウンタ・HP の割合。どれも発火のフレームで読む） */
type SelfReaders = {
  stateHolds: (self: SelfStateCondition, frame: number) => boolean;
  counterAt: (counter: CounterId, frame: number) => number;
  hpRatioAt: (frame: number) => number;
};

/**
 * damage の発火の条件（plan/design-kurumi-s2.md 2.2・2.3 節）。条件が無ければ true。キーはすべてを満たすこと
 * （timed と同じ条件の型。damage が受ける鍵は inFullBurst・enemyState・selfState。plan/design-named-state.md 5.6 節。
 * selfState は plan/design-skill-stage1.md 1.1 節）
 */
function damageConditionHolds(
  condition: EffectCondition | undefined,
  frame: number,
  schedule: BurstSchedule | null,
  enemySpans: ReadonlyMap<NamedStateId, readonly { start: number; end: number }[]>,
  self: SelfReaders,
): boolean {
  if (condition === undefined) return true;
  // 自分の HP の割合が閾値以上か（resolveCondition が atLeastRef を解いてある。plan/design-soline.md 2.1 節）
  if (condition.selfHp !== undefined && !selfHpHolds(condition.selfHp, self.hpRatioAt(frame))) return false;
  if (condition.selfState !== undefined && !self.stateHolds(condition.selfState, frame)) return false;
  if (condition.selfCounter !== undefined) {
    const { counter, atLeast, below } = condition.selfCounter;
    const value = self.counterAt(counter, frame);
    if (atLeast !== undefined && value < atLeast) return false;
    if (below !== undefined && value >= below) return false;
  }
  if (condition.inFullBurst === true && (schedule === null || !isInFullBurst(schedule, frame))) return false;
  if (condition.enemyState !== undefined && !enemyStateSpansHold(enemySpans, condition.enemyState, frame)) return false;
  return true;
}

/**
 * 2 パス目の条件 enemyState: 敵の状態の区間 enemySpans のうち、state に当たる状態（家族の根なら家族のどの状態でも。1 パス目の
 * skills/holders/views.ts の enemyStateAt と同じ stateMatches の規則）の区間が frame を含むか
 */
export function enemyStateSpansHold(
  enemySpans: ReadonlyMap<NamedStateId, readonly { start: number; end: number }[]>,
  state: NamedStateId,
  frame: number,
): boolean {
  return statesMatching(state).some((s) => (enemySpans.get(s) ?? []).some((x) => x.start <= frame && frame < x.end));
}

/**
 * 発動の時点の値に足す小片は、スタック・固定加算の攻撃力・発動者基準の防御力▼の無い timed だけ（what は拒否の文言の主語）。
 * 足すときに発動者の攻撃力・防御力を渡さないので、それを読む小片は黙って誤らずにここで止める。使用武器の変更の小片は、足す前に
 * isWeaponPiece で飛ばす
 */
function assertPlainTimed(w: ValuePiece, what: string): void {
  if (w.stack !== undefined || isFixedAttackScaling(w.effect.scaling) || w.effect.scaling === 'casterDefence') {
    throw new RangeError(
      `${what} supports only plain timed effects (no stacks, fixed attack scalings or casterDefence)`,
    );
  }
}

/**
 * 使用武器の変更の小片か（V-0666）。変更は通常攻撃の武器を替えるだけで、バーストの倍率ダメージの値に効かないので、
 * 同じ発動・同じスロットの前の効果を足すときに飛ばす
 */
function isWeaponPiece(w: ValuePiece): boolean {
  return w.effect.stat === 'weapon';
}

/**
 * 「下位効果のスタック適用」（sequential）の damage が見るバフ（plan/design-burst-landing.md 3.2 節）。
 * 発動の直前のバフに、同じ枠の同じスロットで前に書いた timed のうち、start（同じ発動の効果の窓の始まり）に始まって
 * この枠に掛かる値の小片を足す（イサベルの段階 2・3 の追加ダメージに、同じ発動の段階 1 の受けるダメージ▲が乗る。C-0163。
 * 受けるダメージ▲は敵の件で、値の小片はこの枠にも写る）。
 * 前の発動の窓が続いていれば、直前のバフにもう入っている（窓が和集合で、start に始まらない）。
 * スキルのスロットでは、射撃の回数トリガーの窓の始まり（発火の次のフレーム）を start に渡す。
 * only を渡すと、その stat の小片だけを足す（下位効果のスタック適用でないバーストの追加ダメージは、
 * 敵の側のデバフだけ。V-0627）
 */
function withEarlierSequentialEffects(
  pieces: readonly ValuePiece[],
  buffs: BuffTotals,
  start: number,
  slotIndex: number,
  skill: SkillSlot,
  effectIndex: number,
  only?: (stat: string) => boolean,
): BuffTotals {
  let out = buffs;
  for (const w of pieces) {
    if (w.start !== start || w.slotIndex !== slotIndex || w.sourceSlotIndex !== slotIndex) continue;
    if (w.effect.source.skill !== skill || w.effect.effectIndex >= effectIndex) continue;
    if (only !== undefined && !only(w.effect.stat)) continue;
    if (isWeaponPiece(w)) continue;
    assertPlainTimed(w, 'a sequential burst');
    out = applyResolvedEffect(out, w.effect, 0).totals;
  }
  return out;
}

/**
 * 発動フレーム f のバーストヒットが見るバフ状態。
 * BURST_HIT_USES_PRE_ACTIVATION_BUFFS が true なら「f を終端に持つ区間」（= その発動で付くバフは乗らない）。
 */
export function burstSnapshotState(
  timeline: BuffTimeline,
  frame: number,
  slotIndex: number,
  preActivation: boolean,
): SlotBuffState {
  const index = preActivation ? segmentIndexAt(timeline, frame - 1) : segmentIndexAt(timeline, frame);
  if (index < 0) return EMPTY_BUFF_STATE;
  return timeline.segments[index]!.slots[slotIndex] ?? EMPTY_BUFF_STATE;
}

/**
 * バーストのヒットが見るバフ（plan/design-burst-landing.md 9 節・11 節、C-0167・C-0795）。
 * 撃つ側のバフも敵の側のデバフ（受けるダメージ▲・防御力▼）も、発動のフレーム activationFrame の時点（preActivation なら直前）で
 * 固定する。ヘルムのヒットは発動から 59f 後でフルバーストの中に入るが、フルバーストの始まりで付く S2 の攻撃ダメージ▲は乗らない
 * （`0079-07`）。ノワールのヒットには、III の発動の後・ヒットの前に付いた鈴原サクラの受けるダメージ▲は乗らず、発動の時に付いていて
 * ヒットの前に切れた▲は乗る（C-0795）。I・II の受け手（ルドミラ・ユニ）でも同じ（C-0813）。hitFrame は、sameActivation の小片が
 * ヒットまで続いているかを見るのと、enemyDebuffs が 'hit' のときにだけ使う。バースト使用時の追加ダメージ（planSkillHits の damage）は、
 * enemyDebuffs を 'hit' にして、敵の側のデバフを効果の発火の直前の値で見る（plan/design-burst-landing.md 12 節。C-0838）。
 * sameActivation（同じ発動の▲がヒットに乗る行のキャラだけ。plan/design-burst-landing.md 10 節の案 1、C-0582）を渡すと、
 * 撃つ側のバフに、同じ発動で自分に付いた burst スロットの効果を足す（withSameActivationEffects）。
 * enemyDebuffs が 'hit'（EnemyInput.burstHitEnemyDebuffs。検証の予測の仮説だけが使う）なら、敵の側のデバフだけヒットの直前の値で
 * 上書きする（C-0795 の前の形）
 */
export function burstHitBuffs(
  timeline: BuffTimeline,
  activationFrame: number,
  hitFrame: number,
  slotIndex: number,
  preActivation: boolean,
  sameActivation?: readonly ValuePiece[],
  enemyDebuffs: EnemyDebuffTiming = 'activation',
): BuffTotals {
  let buffs = burstSnapshotState(timeline, activationFrame, slotIndex, preActivation).buffs;
  if (enemyDebuffs === 'hit') {
    const atHit = burstSnapshotState(timeline, hitFrame, slotIndex, preActivation).buffs;
    buffs = { ...buffs };
    for (const stat of ENEMY_HELD_STATS) buffs[stat] = atHit[stat];
  }
  if (sameActivation === undefined) return buffs;
  return withSameActivationEffects(
    sameActivation,
    buffs,
    activationFrame,
    preActivation ? hitFrame - 1 : hitFrame,
    slotIndex,
  );
}

/** 同じ発動の▲がヒットに乗るキャラ（plan/design-burst-landing.md 10 節）なら、burstHitBuffs の sameActivation に渡す値の小片 */
export function sameActivationPiecesOf(
  history: Parameters<typeof valuePiecesOf>[0],
  character: Parameters<typeof sameActivationBuffsOnHit>[0],
): readonly ValuePiece[] | undefined {
  return sameActivationBuffsOnHit(character) ? valuePiecesOf(history) : undefined;
}

/**
 * 同じ発動の▲がヒットに乗るキャラ（plan/design-burst-landing.md 10 節の案 1）: この枠が自分に付けた burst スロットの値の小片のうち、
 * 発動のフレーム以後に始まり、ヒットが見るフレーム at に続いているものを足す。遅れは CT（20 秒以上）より短いので、発動のフレーム
 * 以後に始まる burst スロットの小片は、この発動のものだけ。敵が持つ stat（受けるダメージ▲・防御力▼）は、発動の時点の値で見る
 * ので足さない（C-0795）
 */
function withSameActivationEffects(
  pieces: readonly ValuePiece[],
  buffs: BuffTotals,
  activationFrame: number,
  at: number,
  slotIndex: number,
): BuffTotals {
  let out = buffs;
  for (const w of pieces) {
    if (w.slotIndex !== slotIndex || w.sourceSlotIndex !== slotIndex || w.effect.source.skill !== 'burst') continue;
    if (w.start < activationFrame || w.start > at || w.end <= at) continue;
    if (isStateStat(w.effect.stat) || isEnemyHeldStat(w.effect.stat)) continue;
    if (isWeaponPiece(w)) continue;
    assertPlainTimed(w, 'same-activation buffs on a burst hit');
    out = applyResolvedEffect(out, w.effect, 0).totals;
  }
  return out;
}

/**
 * バーストヒットに「発動直前」のバフを使うか。false なら発動フレームの区間（その発動で付くバフ込み）を使う。
 * **射撃場の実測で true と確定**（plan/verification.md Stage 6 節、録画 0018）:
 * ラピのバーストは自分に攻撃力 +60.75%（10 秒）を付けるが、そのバーストのダメージは 208,131 × 3 = 624,393 で
 * 素の攻撃力基準だった（バフ込みなら 1 発 334,704 になるはず）。
 */
export const BURST_HIT_USES_PRE_ACTIVATION_BUFFS = true;
