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
import { ZERO_BUFFS, addRatioBuff, applyResolvedEffect, statTotal, type BuffTotals } from './buffs.ts';
import { chancePieces, chanceValueOf, type ChanceOpportunity } from './chance.ts';
import { resolveCycleEvery, type ResolvedCycleEvery } from './cycles.ts';
import {
  isResolvedChance,
  isResolvedFullStack,
  isResolvedShotCount,
  isResolvedTimer,
  isStateContent,
  resolveInstant,
  resolvePassives,
  resolveRemoveStates,
  resolveStackChanges,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  type AppliedEffect,
  type ResolvedEffect,
  type ResolvedInstantEffect,
  type ResolvedRemoveState,
  type ResolvedStackChange,
  type ResolvedStateContent,
  type ResolvedStateGrant,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type WindowEffect,
} from './resolve.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type AttackWindow, type RankingRecord } from './ranking.ts';
import { stackWindows } from './stacks.ts';
import { statesMatching, type NamedStateId } from './states.ts';
import { canEverTarget, dependsOnRank, isEffectTarget, type FireContext } from './targets.ts';
import {
  createTriggerTracker,
  fireContextOf,
  shotCountWeight,
  type FrameEvents,
  type FullStackEvent,
  type HealRecord,
  type TriggerTracker,
} from './triggers.ts';
import {
  SKILL_SLOTS,
  conditionReadsItems,
  isEnemyHeldStat,
  isFiringStat,
  isHitStateStat,
  isStateStat,
  staticStatesOf,
  type BuffStat,
  type EffectCondition,
} from './types.ts';
import type { SkillSlot } from '../types.ts';
import {
  buildSegments,
  effectWindows,
  rankSlotsOf,
  resolvePassiveStates,
  shotCountWindows,
  timerFrames,
  unionWindows,
  untilNextEndWindows,
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
  | { kind: 'enemyState'; state: NamedStateId; effects: readonly ResolvedDamageEffect[] };

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
  /** 状態: 射撃の回数のきっかけの付与が発火を足したか（calc の射撃の数え方の判定 hasOwnShotCountItem が読む） */
  shotCount: boolean;
  /** 確率のきっかけの機会（出どころで共有。ほかは null） */
  opportunities: ChanceOpportunity[] | null;
  /** 作った件（入力が変わったら作り直す。readItems で読む） */
  items: HeldItem[];
  /** items を作った時の入力の長さ（始まり・機会・射撃・使用武器の変更の終わり・フルバーストの窓・閉じるフレーム・消費のフレーム） */
  seen: [number, number, number, number, number, number, number];
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
};

export type HolderListsOptions = {
  frames: number;
  /** トリガーの判定に使う（バースト 1 段階突入時の意味） */
  scheduleModel: BurstScheduleModel | null;
  /** ループが書く射撃の列（N 発間維持・撃ち切りの件の終わりに読む） */
  logs: readonly (ShotLog | null)[];
  /** いま分かっているフルバーストの窓（始まりの順） */
  fullBurstWindows: () => readonly FullBurstWindow[];
};

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
};

type CycleSource = { slotIndex: number; effect: ResolvedCycleEvery; fires: TriggerTracker; track: HeldTrack };

/** 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除 1 つ（対象は自分） */
type RemoveSource = { sourceSlotIndex: number; effect: ResolvedRemoveState; stage: HeldStage; fires: TriggerTracker };

/** 2 段目の段 3（plan/design-skill-stage3.md 1.1 節）: スタック量の増加 1 つ（対象は自分。足す先は同じ定義の付与の状態の件の列） */
type StackSource = {
  sourceSlotIndex: number;
  effect: ResolvedStackChange;
  stage: HeldStage;
  fires: TriggerTracker;
  track: HeldTrack;
};

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
   * 2 段目の段 1（plan/design-skill-stage1.md 1.6 節）: 枠 holder にフレーム frame に効いている、時間で変わるバーストゲージの
   * チャージ速度の和（timed・状態の中身。常時の値は含まない）。ゲージを足す手順 2 で呼べば f − 1 までに付いた件になる
   */
  gaugeSpeedAt(holder: number, frame: number): number;
  /** 時間で変わるバーストゲージのチャージ速度の件の列を持ちうるか */
  hasGaugeSpeedTracks(holder: number): boolean;
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フレーム frame にフルスタックになった状態（定義にその状態のフルスタックの消費の
   * きっかけを持つ枠の、自分の状態だけ）を返し、その状態の件を消費する（次のフレームで切る）。回復を当てる前（手順 3 の最初）に呼ぶ
   */
  consumeFullStacks(frame: number): FullStackEvent[];
  /** ループの後の履歴 */
  history(): HolderHistory;
};

/** 窓の始まり。射撃の回数のきっかけは次のフレームから */
export function startOfFire(trigger: ResolvedTrigger, frame: number): number {
  return isResolvedShotCount(trigger) ? frame + 1 : frame;
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

/** 状態の件（段 A までの planBuffTimeline の stateWindowsOf と同じ規則） */
function stateItems(
  grant: ResolvedStateGrant,
  starts: readonly number[],
  shotFrames: readonly number[],
  fullBurstEnds: readonly number[],
  frames: number,
): HeldItem[] {
  if (grant.durationShots !== undefined) {
    return itemsOfPairs(shotCountWindows(starts, shotFrames, grant.durationShots, frames));
  }
  if (grant.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndWindows(starts, fullBurstEnds, frames));
  }
  if (grant.maxStacks !== undefined) {
    return stackWindows(starts, grant.durationFrames, frames, grant.maxStacks).map((w) => ({
      start: w.start,
      end: w.end,
      stack: w.stack,
    }));
  }
  return itemsOfPairs(unionWindows(starts, grant.durationFrames, frames));
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除で閉じる状態の件。閉じる発火のフレーム c のうち、同じフレームに始まりの
 * 無いもの（付与が勝つ）で始まりの列を区切り、区切りごとに今と同じ規則で件を作って、c より前の区切りの件を c + 1 で切る。
 * 区切りの後の件は c + 1 以降に始まる。スタックしない件は、切った件と後の区切りの件がちょうど続けば 1 つにする（和集合の上書き延長と
 * 同じ見え方）。スタックする件は段ごとに切り、後の区切りは段 1 から数え直す
 */
function closedStateItems(
  starts: readonly number[],
  closes: readonly number[],
  build: (starts: readonly number[]) => HeldItem[],
  consumes: readonly number[] = [],
): HeldItem[] {
  // 2 段目の段 3: フルスタックの消費は、同じフレームに始まった件も切る（区切りの前に入れる）。解除の区切りには同じフレームの始まりが無い
  const effective = [...new Set([...closes.filter((c) => !starts.includes(c)), ...consumes])].sort((a, b) => a - b);
  if (effective.length === 0) return build(starts);
  const out: HeldItem[] = [];
  let lower = -Infinity;
  for (const c of [...effective, Infinity]) {
    const segment = starts.filter((s) => s > lower && s <= c);
    lower = c;
    for (const item of build(segment)) {
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

/** timed の件（段 A までの planBuffTimeline の distribute と同じ規則）。確率のきっかけと強化は呼ぶ側 */
function timedItems(
  effect: ResolvedTimedEffect,
  starts: readonly number[],
  log: ShotLog | null | undefined,
  fullBurstEnds: readonly number[],
  frames: number,
): HeldItem[] {
  if (effect.durationShots !== undefined) {
    return itemsOfPairs(shotCountWindows(starts, log?.frames ?? [], effect.durationShots, frames));
  }
  if (effect.durationUntil === 'ammoSpent') {
    // 和集合は発火のフレームで取り、頭は後で削る（段 A までの planBuffTimeline・1 パス目の register と同じ順）
    const trim = weaponStartTrim(effect);
    return untilNextEndWindows(starts, log?.weaponChangeEnds ?? [], frames)
      .filter(([start, end]) => start + trim < end)
      .map(([start, end]) => ({ start: start + trim, end }));
  }
  if (effect.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndWindows(starts, fullBurstEnds, frames));
  }
  return effectWindows(starts, effect, frames).map((w) => {
    const item: HeldItem = { start: w.start, end: w.end };
    if (w.stack !== undefined) item.stack = w.stack;
    return item;
  });
}

/** 昇順の列 xs に x を入れる（同じ値は後ろ） */
function insertSorted(xs: number[], x: number): void {
  let i = xs.length;
  while (i > 0 && xs[i - 1]! > x) i--;
  xs.splice(i, 0, x);
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
        };
        groups.push(group);
      }
      // 2 段目の段 1: 件を見ない条件（usedBurst だけ）は段を上げない（plan/design-skill-stage1.md 1.5 節）
      const stage: HeldStage = dependsOnRank(grant) ? 2 : conditionReadsItems(grant.condition) ? 1.5 : 1;
      group.grants.push({ grant, stage, fires: firesOf(grant.trigger, sourceSlotIndex), group });
      if (STAGE_RANK[stage] > STAGE_RANK[group.stage]) group.stage = stage;
    }
  });
  return groups;
}

/** timed の効果の段（強化の受け付けと値は、履歴を閉じる時に決める） */
function stageOfTimed(effect: ResolvedTimedEffect): HeldStage {
  if (effect.amplifies !== undefined) return 2.5;
  if (dependsOnRank(effect)) return 2;
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
      origin,
      stage,
      starts: [],
      closes: [],
      consumes: [],
      shotCount: false,
      opportunities,
      items: [],
      seen: [-1, -1, -1, -1, -1, -1, -1],
    };
    tracks.push(track);
    return track;
  };
  /** 周期のトリガーは出来事の列に無いので、周期のフレームで発火する（atStart のフレーム 0 はループの前に登録する） */
  const firesOf = (trigger: ResolvedTrigger, slotIndex: number): TriggerTracker => {
    if (!isResolvedTimer(trigger)) return createTriggerTracker(trigger, slotIndex, options.scheduleModel);
    const at = new Set(timerFrames(trigger.everySeconds, frames));
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

  // ---- timed の出どころ（持ち主ごとの件の列は、対象になりうる枠にだけ作る） ----
  const timedSources: TimedSource[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      const stage = stageOfTimed(effect);
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
      timedSources.push(src);
    }
  });

  // ---- 時間で変わる状態（出どころ × 状態 × 持ち主ごとに 1 つの件の列） ----
  const stateGroups = stateGroupsOf(slots, firesOf);
  for (const group of stateGroups) {
    const grant = group.grants[0]!.grant;
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

  // ---- 2 段目の段 3（plan/design-skill-stage3.md 1.1 節）: スタック量の増加（足す先は、同じ定義の付与の状態の、自分の件の列） ----
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
        stage: conditionReadsItems(effect.condition) ? 1.5 : 1,
        fires: firesOf(effect.trigger, sourceSlotIndex),
        track,
      });
    }
  });

  // ---- 2 段目の段 3（plan/design-skill-stage3.md 1.3 節）: フルスタックの消費（定義の回復のきっかけ { fullStack } の状態。自分だけ） ----
  const consuming: { holder: number; state: NamedStateId }[] = [];
  slots.forEach((slot, holder) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
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
  });

  // 静的な状態はフレーム 0 に付いた記録を作る（見る側の規則を状態の種類で分けない。plan/design-named-state.md 5.4 節）
  if (frames > 0) {
    slots.forEach((slot, slotIndex) => {
      for (const state of staticStatesOf(slot?.definition)) {
        applications.push({ frame: 0, state, sourceSlotIndex: slotIndex, slotIndex });
      }
    });
  }

  // ---- 件を作る ----
  const fullBurstEnds = (): number[] => options.fullBurstWindows().map((w) => w.end);
  /** 件の列の件（入力が変わったときだけ作り直す） */
  const readItems = (track: HeldTrack): HeldItem[] => {
    const log = track.holder === ENEMY ? null : logs[track.holder];
    const windows = options.fullBurstWindows();
    const seen: HeldTrack['seen'] = [
      track.starts.length,
      track.opportunities?.length ?? 0,
      log?.frames.length ?? 0,
      log?.weaponChangeEnds?.length ?? 0,
      windows.length,
      track.closes.length,
      track.consumes.length,
    ];
    if (seen.every((v, i) => v === track.seen[i])) return track.items;
    track.seen = seen;
    const o = track.origin;
    switch (o.kind) {
      case 'passive':
        track.items = track.starts.length > 0 ? [{ start: 0, end: frames }] : [];
        break;
      case 'timed':
        track.items =
          track.opportunities !== null
            ? chancePieces(track.opportunities, o.effect.durationFrames, frames).map((p) => ({
                start: p.start,
                end: p.end,
                scale: p.scale,
              }))
            : timedItems(o.effect, track.starts, log, fullBurstEnds(), frames);
        break;
      case 'state': {
        const ends = fullBurstEnds();
        track.items = closedStateItems(
          track.starts,
          track.closes,
          (starts) => stateItems(o.grant, starts, log?.frames ?? [], ends, frames),
          track.consumes,
        );
        break;
      }
      case 'cycleEvery':
        track.items = itemsOfPairs(unionWindows(track.starts, o.effect.durationFrames, frames));
        break;
      case 'healWindow':
        track.items = healWindowItems(track.starts, o.effect.durationFrames, frames);
        break;
      case 'enemyState': {
        // 付いている間は、最初の発火から最後の tick まで（frame/dot.ts の dotActiveSpans。クルミ S2 編の区間と同じ）
        const { intervalSeconds, durationSeconds, firstTick } = o.effects[0]!.dot!;
        track.items = itemsOfPairs(
          dotActiveSpans(track.starts, intervalSeconds, durationSeconds, firstTick).map((sp) => [sp.start, sp.end]),
        );
        break;
      }
    }
    return track.items;
  };
  const activeAt = (track: HeldTrack, frame: number): HeldItem[] =>
    readItems(track).filter((it) => it.start <= frame && frame < it.end);

  /** 件の効いている値（確率のきっかけは付いている確率を掛けて丸めた値） */
  const valueOf = (effect: WindowEffect, item: HeldItem): number =>
    item.scale === undefined ? effect.value : chanceValueOf(effect.value, item.scale);

  // ---- 読む側の索引（持ち主ごと。並びは作った順 = 段 A までの 1 パス目の窓を読む順） ----
  type View = { track: HeldTrack; effect: WindowEffect };
  const viewsOf = (test: (track: HeldTrack, effect: WindowEffect) => boolean): View[][] =>
    slots.map((_, holder) => {
      const views: View[] = [];
      for (const track of tracks) {
        if (track.holder !== holder) continue;
        const o = track.origin;
        if (o.kind === 'timed') {
          if (test(track, o.effect)) views.push({ track, effect: o.effect });
        } else if (o.kind === 'state') {
          for (const c of o.contents) if (test(track, c)) views.push({ track, effect: c });
        }
      }
      return views;
    });
  // 射手: 射撃に効く stat（timed は段によらない。状態の中身も）
  const firingViews = viewsOf((_, e) => isFiringStat(e.stat));
  // 当たり: 条件なし・順位の対象でない timed の当たりの stat と、状態の中身（段 A までの hitTrack・hitGroups）
  const hitViews = viewsOf(
    (track, e) => isHitStateStat(e.stat) && (track.origin.kind === 'state' || track.stage === 1),
  );
  // 条件 selfBuffed: 段 1 の件（段 A までの 1.5 段目の判定に入る窓）
  const conditionViews = viewsOf((track) => track.stage === 1);
  // 順位: 段 1・1.5 の攻撃力の件（段 A までの 2 段目の材料）
  const rankViews = viewsOf((track, e) => e.stat === 'attack' && STAGE_RANK[track.stage] <= STAGE_RANK[1.5]);
  // 2 段目の段 1（plan/design-skill-stage1.md 1.1 節）: 条件 selfState が見る、枠の静的な状態と、段 1 の状態の件の列（持ち主 → 状態）。
  // 静的な状態を見る selfState は編成の段（skills/composition.ts）で決まるので、ここに来るのは時間で変わる状態がほとんど
  const staticStates = slots.map((slot) => new Set(staticStatesOf(slot?.definition)));
  const stateTracks = slots.map((_, holder) => {
    const byState = new Map<NamedStateId, HeldTrack[]>();
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== holder || track.stage !== 1 || o.kind !== 'state') continue;
      byState.set(o.state, [...(byState.get(o.state) ?? []), track]);
    }
    return byState;
  });

  // ゲージ: 時間で変わるバーストゲージのチャージ速度の件（2 段目の段 1。plan/design-skill-stage1.md 1.6 節。段によらない。状態の中身も）
  const gaugeViews = viewsOf((_, e) => e.stat === 'burstGaugeSpeed');

  const holdsAt = (condition: EffectCondition, sourceSlotIndex: number, frame: number): boolean => {
    if (condition.selfState !== undefined) {
      const { state, present } = condition.selfState;
      // 2 段目の段 5（plan/design-skill-stage5.md 1.2 節）: 家族の根なら、家族のどの状態でも当たる
      const has = statesMatching(state).some(
        (s) =>
          staticStates[sourceSlotIndex]?.has(s) === true ||
          (stateTracks[sourceSlotIndex]?.get(s) ?? []).some((t) => activeAt(t, frame).length > 0),
      );
      if (has !== present) return false;
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
    if (condition.inFullBurst === true) {
      if (!options.fullBurstWindows().some((w) => w.start <= frame && frame < w.end)) return false;
    }
    return true;
  };

  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: 条件の usedBurst（直前に自分がバーストスキルを使用していれば）。発火の文脈の
   * burstUsers に自分がいるか。件を見ないので、段 1 の効果でも発火の前に見る。鍵が無ければ true
   */
  const usedBurstHolds = (
    condition: EffectCondition | undefined,
    trigger: ResolvedTrigger,
    ev: FrameEvents,
    sourceSlotIndex: number,
  ): boolean =>
    condition?.usedBurst !== true || (fireContextOf(trigger, ev)?.burstUsers?.includes(sourceSlotIndex) ?? false);

  const rankSlots = rankSlotsOf(slots, passive);
  const finalAttacksAtFrame = (frame: number): (number | null)[] => {
    const windows: AttackWindow[] = [];
    rankViews.forEach((views, holder) => {
      for (const v of views) {
        for (const it of activeAt(v.track, frame)) {
          windows.push({
            slotIndex: holder,
            sourceSlotIndex: v.track.sourceSlotIndex,
            effect: { stat: v.effect.stat, scaling: v.effect.scaling, value: valueOf(v.effect, it) },
            start: it.start,
            end: it.end,
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
    const targets: number[] = [];
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context)) return;
      const track = group.tracks[holder];
      if (!track) throw new Error(`no state track for ${group.state} on slot ${holder}`);
      insertSorted(track.starts, start);
      if (isResolvedShotCount(g.grant.trigger)) track.shotCount = true;
      applications.push({
        frame: start,
        state: group.state,
        sourceSlotIndex: group.sourceSlotIndex,
        slotIndex: holder,
      });
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除の発火 1 つ。持ち主（自分）のその状態の件の列（出どころは問わない）に、
   * 閉じるフレームを足す。解除不可の件の列は閉じない
   */
  const fireRemove = (src: RemoveSource, frame: number): void => {
    if (frame >= frames) return;
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== src.sourceSlotIndex || o.kind !== 'state' || o.state !== src.effect.state) continue;
      if (o.grant.undispellable === true) continue;
      if (!track.closes.includes(frame)) insertSorted(track.closes, frame);
    }
  };
  /**
   * 2 段目の段 3（plan/design-skill-stage3.md 1.1 節）: スタック量の増加の発火 1 つ。状態の件の列に、同じフレームの始まりを N 個入れる
   * （スタックの段は始まりの数で上がり、上限と維持は付与のもの）。付いた記録は 1 件
   */
  const fireStackChange = (src: StackSource, start: number): void => {
    if (start >= frames) return;
    for (let k = 0; k < src.effect.amount; k++) insertSorted(src.track.starts, start);
    if (isResolvedShotCount(src.effect.trigger)) src.track.shotCount = true;
    applications.push({
      frame: start,
      state: src.effect.state,
      sourceSlotIndex: src.sourceSlotIndex,
      slotIndex: src.sourceSlotIndex,
    });
  };
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

  const stage1Timed = timedSources.filter((s) => s.stage === 1);
  const stage15Timed = timedSources.filter((s) => s.stage === 1.5);
  const stage2Timed = timedSources.filter((s) => s.stage === 2);
  const grantsAt = (stage: HeldStage): GrantSource[] =>
    stateGroups.flatMap((group) => group.grants.filter((g) => g.stage === stage));
  const stage1Grants = grantsAt(1);
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

  /** 段 1〜2 と強化の発火（手順 3。battleStartOnly ならループの前の戦闘開始時の分だけ） */
  const register = (ev: FrameEvents, battleStartOnly: boolean): void => {
    const f = ev.frame;
    const take = (trigger: ResolvedTrigger): boolean =>
      battleStartOnly ? atBattleStart(trigger) : trigger !== 'battleStart';
    // 段 1: 条件なし・順位の対象でない付与と効果（確率のきっかけは機会を貯める）
    for (const g of stage1Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (!usedBurstHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex)) {
        skipGrant(g, f);
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : startOfFire(g.grant.trigger, f), fireContextOf(g.grant.trigger, ev));
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
      if (!usedBurstHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex)) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(src, battleStartOnly ? 0 : startOfFire(src.effect.trigger, f), fireContextOf(src.effect.trigger, ev));
    }
    // 2 段目の段 1: 解除（閉じるのは発火の次のフレームなので、段の中の順は同じフレームの判定に効かない。plan/design-skill-stage1.md 1.2 節）
    for (const r of stage1Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (!usedBurstHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex)) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // 2 段目の段 3: スタック量の増加（状態の件の列の始まりを足すだけなので、段 1 の付与と同じ見え方）
    for (const x of stage1Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!usedBurstHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 段 C: 敵の状態（持続ダメージの発火のフレーム。ループの中の判定は読まない）
    for (const e of enemyStateSources) {
      for (const { effect, fires } of e.effects) {
        if (!take(effect.trigger) || !(battleStartOnly || fires(ev))) continue;
        const at = battleStartOnly ? 0 : f;
        if (at < frames) insertSorted(e.track.starts, at);
      }
    }
    if (!battleStartOnly) {
      // 循環の間隔の変更はループの中でしか読まないので、戦闘開始時もフレーム 0 の出来事で登録する
      for (const c of cycleSources) {
        if (!c.fires(ev)) continue;
        const start = startOfFire(c.effect.trigger, f);
        if (start < frames) insertSorted(c.track.starts, start);
      }
    }
    // 段 1.5: 条件つきの付与と効果。判定は段 1 の件だけを見る（条件つきどうしは連鎖させない）
    for (const g of stage15Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (
        !usedBurstHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex) ||
        !holdsAt(g.grant.condition!, g.group.sourceSlotIndex, f)
      ) {
        skipGrant(g, f);
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : startOfFire(g.grant.trigger, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage15Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (
        !usedBurstHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex) ||
        !holdsAt(src.effect.condition!, src.sourceSlotIndex, f)
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(src, battleStartOnly ? 0 : startOfFire(src.effect.trigger, f), fireContextOf(src.effect.trigger, ev));
    }
    for (const r of stage15Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (
        !usedBurstHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex) ||
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
        !usedBurstHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex) ||
        !holdsAt(x.effect.condition!, x.sourceSlotIndex, f)
      ) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 段 2: 順位の対象。発火のフレームの順位（段 1・1.5 の攻撃力の件。同じフレームに付いたものも入れる）
    for (const g of stage2Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(g.grant.trigger, f);
      if (start >= frames) continue;
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(g.grant, rankSlots, finalAttacks, g.group.sourceSlotIndex);
      const targets = fireGrant(g, start, { ...fireContextOf(g.grant.trigger, ev), attackRank });
      recordRanking(f, g.group.sourceSlotIndex, g.grant, attackRank, finalAttacks, targets);
    }
    for (const src of stage2Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(src.effect.trigger, f);
      if (start >= frames) continue;
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(src.effect, rankSlots, finalAttacks, src.sourceSlotIndex);
      const targets = fireTimed(src, start, { ...fireContextOf(src.effect.trigger, ev), attackRank });
      recordRanking(f, src.sourceSlotIndex, src.effect, attackRank, finalAttacks, targets);
    }
    // 2.5 段目: 強化は発火の窓の始まりだけを貯める（受け付けと値は、履歴を閉じる時に amplify で決める）
    for (const amp of amplifiers) {
      if (!take(amp.effect.trigger)) continue;
      if (!battleStartOnly && !ampFires.get(amp)!(ev)) continue;
      const start = battleStartOnly ? 0 : startOfFire(amp.effect.trigger, f);
      if (start < frames) amp.starts.push(start);
    }
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

  return {
    hasSources:
      timedSources.length > 0 ||
      stateGroups.length > 0 ||
      cycleSources.length > 0 ||
      amplifiers.length > 0 ||
      enemyStateSources.length > 0 ||
      removeSources.length > 0 ||
      stackSources.length > 0,
    registerBattleStart() {
      if (frames <= 0) return;
      register(emptyEvents(0), true);
    },
    registerFrame(ev) {
      register(ev, false);
    },
    firingBuffsAt(holder, frame, base) {
      if (!hasFiring[holder]) return null;
      let buffs = base;
      let changed = false;
      for (const v of firingViews[holder]!) {
        // 和集合の窓は重ならないので効いているのは多くて 1 つ。スタックする効果は効いている段の数だけ足す
        for (let k = activeAt(v.track, frame).length; k > 0; k--) {
          buffs = applyResolvedEffect(buffs, v.effect, v.track.casterBaseAttack).totals;
          changed = true;
        }
      }
      return changed ? buffs : null;
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
        .filter((c) => c.slotIndex === slotIndex && c.effect.targetSkill === targetSkill)
        .flatMap((c) => activeAt(c.track, frame).map(() => c.effect.every));
    },
    gaugeSpeedAt(holder, frame) {
      let sum = 0;
      for (const v of gaugeViews[holder] ?? []) {
        for (const it of activeAt(v.track, frame)) sum += valueOf(v.effect, it);
      }
      return sum;
    },
    hasGaugeSpeedTracks: (holder) => (gaugeViews[holder] ?? []).length > 0,
    consumeFullStacks(frame) {
      const out: FullStackEvent[] = [];
      for (const { holder, state } of consuming) {
        const own = tracks.filter((t) => t.holder === holder && t.origin.kind === 'state' && t.origin.state === state);
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
        : o.kind === 'timed' || o.kind === 'passive'
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

/**
 * 段 D の 3（ルドミラ：ウィンターオーナー編。plan/design-ludmilla-wo.md 2.5 節）: 枠 slotIndex に、枠自身の射撃の回数で開いた件があるか
 * （calc の射撃の数え方。calc/model.ts）。timed（強化を含む）は自分の射撃の回数のトリガー、状態は自分の射撃の回数のトリガーの付与が
 * 発火を足した件（shotCount）。区間に足す件だけを見る（状態だけの stat は除く）。敵の件は、効果の対象の味方の枠の件として見る
 */
export function hasOwnShotCountItem(
  history: Pick<HolderHistory, 'tracks' | 'amplified' | 'slots'>,
  slotIndex: number,
): boolean {
  const onSlot = (holder: number, effect: ResolvedTimedEffect): boolean =>
    holder === slotIndex || (holder === ENEMY && alliesOf(effect, slotIndex, history.slots).includes(slotIndex));
  const timed = history.tracks.some((track) => {
    if (track.sourceSlotIndex !== slotIndex || !track.items.some((i) => i.start < i.end)) return false;
    const o = track.origin;
    if (o.kind === 'timed') {
      return !isStateStat(o.effect.stat) && isResolvedShotCount(o.effect.trigger) && onSlot(track.holder, o.effect);
    }
    if (o.kind === 'state') {
      return track.holder === slotIndex && track.shotCount && o.contents.some((c) => !isStateStat(c.stat));
    }
    return false;
  });
  return (
    timed ||
    history.amplified.some(
      (p) =>
        p.sourceSlotIndex === slotIndex &&
        p.start < p.end &&
        isResolvedShotCount(p.effect.trigger) &&
        onSlot(p.holder, p.effect),
    )
  );
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
  effect: WindowEffect;
  start: number;
  end: number;
  /** スタックの段（1 始まり）。スタックしない効果はキーごと無い */
  stack?: number;
  stage: HeldStage;
};

/** 件の列の値の小片（timed・状態の中身・確率のきっかけ。強化は別）。並びは作った順 */
function piecesOfTrack(track: HeldTrack, slots: readonly TimelineSlot[]): ValuePiece[] {
  const pieces: ValuePiece[] = [];
  const push = (effect: WindowEffect, item: HeldItem): void => {
    // 段 C: 敵の件は、効果の対象の味方の各枠に写す
    const holders =
      track.holder === ENEMY && !isStateContent(effect)
        ? alliesOf(effect, track.sourceSlotIndex, slots)
        : [track.holder];
    for (const slotIndex of holders) {
      const piece: ValuePiece = {
        slotIndex,
        sourceSlotIndex: track.sourceSlotIndex,
        effect: item.scale === undefined ? effect : { ...effect, value: chanceValueOf(effect.value, item.scale) },
        start: item.start,
        end: item.end,
        stage: track.stage,
      };
      if (item.stack !== undefined) piece.stack = item.stack;
      pieces.push(piece);
    }
  };
  const o = track.origin;
  if (o.kind === 'timed') for (const item of track.items) push(o.effect, item);
  if (o.kind === 'state') for (const item of track.items) for (const c of o.contents) push(c, item);
  return pieces;
}

/** 段 C: 敵の件の効果を写す味方の枠（効果の対象。敵の件の効果は味方全体で、絞り込みを持たない） */
function alliesOf(effect: ResolvedTimedEffect, sourceSlotIndex: number, slots: readonly TimelineSlot[]): number[] {
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
  const references: { holder: number; sourceSlotIndex: number; effect: WindowEffect; item: HeldItem; value: number }[] =
    [];
  for (const track of tracks) {
    const o = track.origin;
    const effects: readonly WindowEffect[] = o.kind === 'timed' ? [o.effect] : o.kind === 'state' ? o.contents : [];
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
        (isStateContent(r.effect) || r.effect.amplifies === undefined),
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
    for (const [s, e] of unionWindows(accepted, effect.durationFrames, frames)) {
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
  return history.slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const passiveEffects: AppliedEffect[] = [];
    for (const track of history.tracks) {
      if (track.holder !== index || track.origin.kind !== 'passive') continue;
      const applied = applyResolvedEffect(buffs, track.origin.effect, track.casterBaseAttack);
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
    if (track.origin.kind !== 'timed' && track.origin.kind !== 'state') continue;
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
