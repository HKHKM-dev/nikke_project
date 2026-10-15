// 効果を持ち主ごとの一覧で持つ（plan/design-holder-effects.md）。
// 段 A: 1 パス目のループ（frame/firstPass.ts）が、スキルによる効果を、効果を受ける枠（持ち主）ごとの件の列で持つ。
// 件の列は、出どころ × 効果 × 持ち主ごとの窓の始まりの列（昇順）で、件（窓）は段 A までの窓と同じ規則で作る（2.3 節）: 和集合の上書き延長
// （終わりのフレームちょうどの付き直しも続き）、スタックの段（skills/stacks.ts）、N 発間維持、フルバーストの終わり、撃ち切り、
// 吸収回復の付き直し（終わりのフレームちょうどに付けば新しく付いた）。件は、始まりの列とループで分かった出来事（射撃・使用武器の
// 変更の終わり・フルバーストの窓）から作り直すので、同じフレームの中で始まりが前後して登録されても（射撃の回数のきっかけは次の
// フレームから）、和集合とスタックと同じ件になる。ループの中の判定（射手・当たり・条件・順位）は件を読み、段 A までの段（1・1.5・2・
// 2.5 段目）の見え方は件の列の段の印で再現する（2.5 節）。強化（2.5 段目）の受け付けと値は、参照する件の一生が要るので、ループの後に
// 履歴を閉じる時に決める（amplify。ループの中で強化の件を読む所は無い）。ループの後は、履歴から窓・区間・記録を書き出す（2.6 節。
// 段 E で消す）。並びは時刻の順（論点 5）。段 B で 2 パス目（planBuffTimeline）を消し、件を作るのはここだけになった。
import type { BurstScheduleModel, FullBurstWindow, BurstSchedule } from '../burst/schedule.ts';
import { dotActiveSpans, groupDotsByState } from '../frame/dot.ts';
import type { ShotLog } from '../frame/shots.ts';
import { resolveDotEffects, type ResolvedDamageEffect } from './burstDamage.ts';
import { ZERO_BUFFS, addRatioBuff, applyResolvedEffect, statTotal, type BuffTotals } from './buffs.ts';
import { chancePieces, chanceValueOf, type ChanceOpportunity } from './chance.ts';
import { resolveCycleEvery, type CycleWindow, type ResolvedCycleEvery } from './cycles.ts';
import {
  isResolvedChance,
  isResolvedShotCount,
  isResolvedTimer,
  isStateContent,
  resolveInstant,
  resolvePassives,
  resolveStateContents,
  resolveStateGrants,
  resolveTimed,
  type AppliedEffect,
  type ResolvedEffect,
  type ResolvedInstantEffect,
  type ResolvedStateContent,
  type ResolvedStateGrant,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type WindowEffect,
} from './resolve.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type AttackWindow, type RankingRecord } from './ranking.ts';
import { stackWindows } from './stacks.ts';
import type { NamedStateId } from './states.ts';
import { canEverTarget, dependsOnRank, isEffectTarget, type FireContext } from './targets.ts';
import {
  createTriggerTracker,
  fireContextOf,
  shotCountWeight,
  type FrameEvents,
  type HealRecord,
  type TriggerTracker,
} from './triggers.ts';
import {
  SKILL_SLOTS,
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
  type BuffWindow,
  type ConditionSkip,
  type NamedStateWindow,
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
 * 敵が持つ効果か: 敵の受けるダメージ▲（damageTaken）。値は、敵が受ける全ダメージに掛かるので、味方の各枠の区間の値に足す
 * （書き出しで味方の各枠の窓に写す。C-0138）
 */
export function isEnemyEffect(effect: { stat: string }): boolean {
  return effect.stat === 'damageTaken';
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
  /** 状態: 射撃の回数のきっかけの付与が発火を足したか（書き出しの NamedStateWindow.shotCount） */
  shotCount: boolean;
  /** 確率のきっかけの機会（出どころで共有。ほかは null） */
  opportunities: ChanceOpportunity[] | null;
  /** 作った件（入力が変わったら作り直す。readItems で読む） */
  items: HeldItem[];
  /** items を作った時の入力の長さ（始まり・機会・射撃・使用武器の変更の終わり・フルバーストの窓） */
  seen: [number, number, number, number, number];
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

/** 件の列の書き出しの並びの鍵（段 → 出どころの枠 → 定義の順 → 持ち主） */
function orderKeyOf(track: HeldTrack): number[] {
  const o = track.origin;
  const source = o.kind === 'state' ? o.grant.source : o.kind === 'enemyState' ? o.effects[0]!.source : o.effect.source;
  const effectIndex =
    o.kind === 'state'
      ? o.grant.effectIndex
      : o.kind === 'enemyState'
        ? o.effects[0]!.effectIndex
        : o.kind === 'passive'
          ? 0
          : 'effectIndex' in o.effect
            ? o.effect.effectIndex
            : 0;
  return [
    STAGE_RANK[track.stage],
    track.sourceSlotIndex,
    SKILL_ORDER[source?.skill ?? 'skill1'] ?? 0,
    effectIndex,
    track.holder,
  ];
}

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
      const stage: HeldStage = dependsOnRank(grant) ? 2 : grant.condition !== undefined ? 1.5 : 1;
      group.grants.push({ grant, stage, fires: firesOf(grant.trigger, sourceSlotIndex), group });
      if (STAGE_RANK[stage] > STAGE_RANK[group.stage]) group.stage = stage;
    }
  });
  return groups;
}

/** timed の効果の段（強化は書き出しで扱う） */
function stageOfTimed(effect: ResolvedTimedEffect): HeldStage {
  if (effect.amplifies !== undefined) return 2.5;
  if (dependsOnRank(effect)) return 2;
  if (effect.condition !== undefined) return 1.5;
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
      shotCount: false,
      opportunities,
      items: [],
      seen: [-1, -1, -1, -1, -1],
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
      case 'state':
        track.items = stateItems(o.grant, track.starts, log?.frames ?? [], fullBurstEnds(), frames);
        break;
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

  const holdsAt = (condition: EffectCondition, sourceSlotIndex: number, frame: number): boolean => {
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

  const ampFires = new Map(amplifiers.map((amp) => [amp, firesOf(amp.effect.trigger, amp.sourceSlotIndex)]));

  /** 段 1〜2 と強化の発火（手順 3。battleStartOnly ならループの前の戦闘開始時の分だけ） */
  const register = (ev: FrameEvents, battleStartOnly: boolean): void => {
    const f = ev.frame;
    const take = (trigger: ResolvedTrigger): boolean =>
      battleStartOnly ? atBattleStart(trigger) : trigger !== 'battleStart';
    // 段 1: 条件なし・順位の対象でない付与と効果（確率のきっかけは機会を貯める）
    for (const g of stage1Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
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
      fireTimed(src, battleStartOnly ? 0 : startOfFire(src.effect.trigger, f), fireContextOf(src.effect.trigger, ev));
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
      if (!holdsAt(g.grant.condition!, g.group.sourceSlotIndex, f)) {
        conditionSkips.push({
          frame: f,
          sourceSlotIndex: g.group.sourceSlotIndex,
          effect: { source: g.grant.source, effectIndex: g.grant.effectIndex },
          state: g.group.state,
        });
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : startOfFire(g.grant.trigger, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage15Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (!holdsAt(src.effect.condition!, src.sourceSlotIndex, f)) {
        conditionSkips.push({
          frame: f,
          sourceSlotIndex: src.sourceSlotIndex,
          effect: { source: src.effect.source, effectIndex: src.effect.effectIndex },
        });
        continue;
      }
      fireTimed(src, battleStartOnly ? 0 : startOfFire(src.effect.trigger, f), fireContextOf(src.effect.trigger, ev));
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
    // 2.5 段目: 強化は発火の窓の始まりだけを貯める（受け付けと値は書き出し）
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
      enemyStateSources.length > 0,
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

// ---- 書き出し（plan/design-holder-effects.md 2.6 節。段 E で消す） ----

/** 件の列の窓（timed・状態の中身・確率のきっかけ。強化は別）。並びは作った順 */
function windowsOfTrack(
  track: HeldTrack,
  slots: readonly TimelineSlot[],
): { windows: BuffWindow[]; stateWindows: BuffWindow[] } {
  const windows: BuffWindow[] = [];
  const stateWindows: BuffWindow[] = [];
  const push = (effect: WindowEffect, item: HeldItem): void => {
    // 段 C: 敵の件は、効果の対象の味方の各枠の窓に写す（区間の値は味方の各枠に足す。C-0138）
    const holders =
      track.holder === ENEMY && !isStateContent(effect)
        ? alliesOf(effect, track.sourceSlotIndex, slots)
        : [track.holder];
    for (const slotIndex of holders) {
      const w: BuffWindow = {
        slotIndex,
        sourceSlotIndex: track.sourceSlotIndex,
        effect: item.scale === undefined ? effect : { ...effect, value: chanceValueOf(effect.value, item.scale) },
        start: item.start,
        end: item.end,
      };
      if (item.stack !== undefined) w.stack = item.stack;
      (isStateStat(effect.stat) ? stateWindows : windows).push(w);
    }
  };
  const o = track.origin;
  if (o.kind === 'timed') for (const item of track.items) push(o.effect, item);
  if (o.kind === 'state') for (const item of track.items) for (const c of o.contents) push(c, item);
  return { windows, stateWindows };
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

/** 窓の並びの鍵（時刻の順。同じフレームは段 → 出どころの枠 → 定義の順 → 持ち主 → スタックの段。論点 5） */
function windowKey(w: BuffWindow, stage: HeldStage): number[] {
  const subIndex = isStateContent(w.effect) ? w.effect.subIndex : -1;
  return [
    w.start,
    STAGE_RANK[stage],
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

/**
 * 履歴から BuffTimeline を書き出す（段 A までの planBuffTimeline の出力と同じ形。並びは時刻の順）。
 * 区間は、書き出した窓から組み立てる（skills/timeline.ts の buildSegments。段 D の 1 で履歴から作る形に移す）
 */
export function buffTimelineOf(
  history: HolderHistory,
  schedule: BurstSchedule | null,
  landings: TimelineLandings | null = null,
  sustainedHitRateUp = true,
): BuffTimeline {
  const { frames } = history;
  const keyed: { window: BuffWindow; key: number[] }[] = [];
  const keyedState: { window: BuffWindow; key: number[] }[] = [];
  const namedStateWindows: { window: NamedStateWindow; key: number[] }[] = [];
  const cycleWindows: CycleWindow[] = [];
  for (const track of history.tracks) {
    const o = track.origin;
    if (o.kind === 'timed' || o.kind === 'state') {
      const { windows, stateWindows } = windowsOfTrack(track, history.slots);
      for (const w of windows) keyed.push({ window: w, key: windowKey(w, track.stage) });
      for (const w of stateWindows) keyedState.push({ window: w, key: windowKey(w, track.stage) });
    }
    if (o.kind === 'state') {
      for (const item of track.items) {
        const record: NamedStateWindow = {
          state: o.state,
          slotIndex: track.holder,
          sourceSlotIndex: track.sourceSlotIndex,
          start: item.start,
          end: item.end,
        };
        if (item.stack !== undefined) record.stack = item.stack;
        if (track.shotCount) record.shotCount = true;
        namedStateWindows.push({ window: record, key: [item.start, ...orderKeyOf(track), item.stack ?? 0] });
      }
    }
    if (o.kind === 'cycleEvery') {
      for (const item of track.items) {
        cycleWindows.push({
          slotIndex: track.holder,
          source: o.effect.source,
          effectIndex: o.effect.effectIndex,
          targetSkill: o.effect.targetSkill,
          every: o.effect.every,
          start: item.start,
          end: item.end,
        });
      }
    }
  }
  // 強化は、履歴を閉じる時に作った値の小片から
  for (const p of history.amplified) {
    const holders = p.holder === ENEMY ? alliesOf(p.effect, p.sourceSlotIndex, history.slots) : [p.holder];
    for (const slotIndex of holders) {
      const w: BuffWindow = {
        slotIndex,
        sourceSlotIndex: p.sourceSlotIndex,
        effect: { ...p.effect, value: p.value },
        start: p.start,
        end: p.end,
      };
      keyed.push({ window: w, key: windowKey(w, 2.5) });
    }
  }
  const sortByKey = <T>(xs: { window: T; key: number[] }[]): T[] =>
    xs.sort((a, b) => compareKeys(a.key, b.key)).map((x) => x.window);
  const windows = sortByKey(keyed);
  const stateWindows = sortByKey(keyedState);
  const passive = passiveStatesOf(history);
  const conditionSkips = [...history.conditionSkips];
  const rankings = [...history.rankings]
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.frame - b.x.frame || a.i - b.i)
    .map(({ x }) => x);
  const segments = buildSegments({
    slots: history.slots,
    schedule,
    frames,
    windows,
    stateWindows,
    passive,
    landings,
    sustainedHitRateUp,
  });
  return {
    frames,
    segments,
    windows,
    passive,
    heals: [...history.heals].sort(
      (a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex,
    ),
    rankings,
    stateWindows,
    conditionSkips,
    cycleWindows: cycleWindows.sort((a, b) => a.start - b.start || a.slotIndex - b.slotIndex),
    applications: [...history.applications].sort(
      (a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex,
    ),
    namedStateWindows: sortByKey(namedStateWindows),
  };
}
