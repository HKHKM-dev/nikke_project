// ループの後に、件の一覧の履歴（HolderHistory）を閉じる関数（createHistory）と、履歴を読む関数: 件の絞り込み（itemsOf）、値の小片
// （valuePiecesOf。強化の受け付けと値は amplify で決める）、区間と常時の値（buffTimelineOf。plan/design-holder-effects.md 2.9 節）。
import type { BurstSchedule } from '../../burst/schedule.ts';
import { ZERO_BUFFS, addRatioBuff, applyResolvedEffect, fixedAttackBaseOf, type BuffTotals } from '../buffs.ts';
import { isStateContent, type AppliedEffect, isTimedItem, type ItemEffect } from '../resolve.ts';
import type { NamedStateId } from '../states.ts';
import { isEffectTarget } from '../targets.ts';
import { SKILL_SLOTS, isMaxHpStat, isStateStat, type BuffStat } from '../types.ts';
import type { SkillSlot } from '../../types.ts';
import {
  buildSegments,
  unionItems,
  type BuffTimeline,
  type ConditionSkip,
  type SlotBuffState,
  type TimelineLandings,
  type TimelineSlot,
} from '../timeline.ts';
import {
  type AmplifiedPiece,
  type AmplifierSource,
  ENEMY,
  type HeldItem,
  type HeldOrigin,
  type HeldStage,
  type HeldTrack,
  type HolderHistory,
  type HolderLists,
  isEnemyEffect,
} from './types.ts';
import { STAGE_RANK, scaledEffect, valueOf } from './items.ts';
import type { HolderBase, Records } from './records.ts';
import type { Sources } from './sources.ts';
import type { Read } from './read.ts';
import type { Views } from './views.ts';

/** ループの後に履歴を閉じる関数（件の一覧の history） */
export function createHistory({
  amplifiers,
  applications,
  conditionSkips,
  counterRecords,
  frames,
  heals,
  hpRatioStepsOf,
  logs,
  options,
  passive,
  rankings,
  readItems,
  removeDebuffGuesses,
  slots,
  tracks,
}: HolderBase & Records & Sources & Read & Views): HolderLists['history'] {
  return () => {
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
      removeDebuffGuesses,
      heals,
      fullBurstWindows: [...options.fullBurstWindows()],
      logs,
      counters: counterRecords,
      hpRatios: slots.map((_, i) => hpRatioStepsOf(i)),
    };
  };
}

const SKILL_ORDER = Object.fromEntries(SKILL_SLOTS.map((s, i) => [s, i])) as Record<string, number>;

function compareKeys(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i]! - b[i]!;
    if (d !== 0) return d;
  }
  return a.length - b.length;
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
 * 値の小片（plan/design-holder-effects.md 2.9 節）: 味方の枠ごとに、区間の値に足す効果と、その値が効いている区間 [start, end)。
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
  const leadFires = track.leadFires;
  /**
   * 始まりごとの、読んだ件の数。同じ始まりの件には、件を作る関数の並び（スタックの段の順）で発を当てる（和集合にまとまった件は最初の発）
   */
  const seen = new Map<number, number>();
  /** 件のきっかけの発のフレーム（leadFrames のある付与だけ） */
  const fireOf = (item: HeldItem): number | undefined => {
    const fires = leadFires?.get(item.start);
    if (fires === undefined) return undefined;
    const k = seen.get(item.start) ?? 0;
    seen.set(item.start, k + 1);
    return fires[Math.min(k, fires.length - 1)];
  };
  const push = (effect: ItemEffect, item: HeldItem, fire?: number): void => {
    // 敵の件は、効果の対象の味方の各枠に写す。敵に付く状態の中身も（対象は付与の対象）
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
      // 発の次のフレームから（きっかけの発自身には乗らない。C-0312）。件の始まりが戦闘の始まりで止まっても、発から数える
      const start =
        fire !== undefined && slotIndex === track.sourceSlotIndex ? Math.min(item.end, fire + 1) : item.start;
      if (fire !== undefined && start >= item.end) continue;
      const piece: ValuePiece = {
        slotIndex,
        sourceSlotIndex: track.sourceSlotIndex,
        effect: scaledEffect(effect, item),
        start,
        end: item.end,
        stage: track.stage,
      };
      if (item.stack !== undefined) piece.stack = item.stack;
      pieces.push(piece);
    }
  };
  // while の効果は timed と同じく件ごとに 1 つ（値はスタックごとではない）
  if (o.kind === 'timed' || o.kind === 'while') for (const item of track.items) push(o.effect, item);
  if (o.kind === 'state')
    for (const item of track.items) {
      const fire = fireOf(item);
      for (const c of o.contents) push(c, item, fire);
    }
  return pieces;
}

/** 敵の件の効果を写す味方の枠（効果の対象。敵の件の効果は味方全体で、絞り込みを持たない） */
export function alliesOf(
  effect: Parameters<typeof isEffectTarget>[0],
  sourceSlotIndex: number,
  slots: readonly TimelineSlot[],
): number[] {
  return slots.flatMap((target, holder) =>
    target !== null && isEffectTarget(effect, sourceSlotIndex, holder, target.character) ? [holder] : [],
  );
}

/**
 * 強化の受け付けと値の小片と、受け付けなかった記録。参照するのは、同じ出どころ・スロット・stat の、
 * 強化でない timed と状態の中身の件（段 1〜2。確率のきっかけは期待値）
 */
export function amplify(
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
        const value = valueOf(effect, item);
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
    // 敵の件の効果（受けるダメージ▲）は、発動の瞬間の判定も小片も敵の件で見る（参照する件も敵の件）
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
  // 発動者の最終最大HP は、発動者の常時の最大HP▲ を入れた値（resolvePassiveStates と同じ）
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
 * 履歴から区間と常時の値を作る（skills/timeline.ts の buildSegments。区間の値は、値の小片を時刻の順に足す）
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
