// Stage 6: 持続バフのタイムライン（純関数）。sim と calc が同じ区間分割を使う。
// 時刻表（burst/schedule.ts の BurstSchedule）は戦闘前に決まるので、バフの付与・失効のフレームも静的に決まる。
// Stage 7 で固定サイクル専用の形から BurstSchedule に一般化した（固定・動的どちらの時刻表でも同じ作り方）。
//
// 流れ: トリガーの発火フレーム → バフ窓 [start, end)（同一効果の再発火は和集合 = 上書き延長）
//       → 境界を集めて区間に割る → 区間ごとに枠の BuffTotals を作る → 同じバフ状態の区間をグループにまとめる。
//
// calc はグループごとに computeDamage を 1 回呼び、sim はフレームループで区間をまたぐたびに 1 トリガーの値を差し替える。
// timed 効果が 1 つもなければグループは「通常区間 / フルバースト区間」の 2 つに退化し、Stage 5 とまったく同じ計算になる。
// Stage 8: 射撃の回数（sim/shots.ts の射撃の列から）・発動の回数・バースト N 段階突入時のトリガーを足した。
// 射撃の回数で付くバフの窓は発火フレームの次のフレームから始める（トリガーになった射撃自身には乗らない）。
// Stage 10: トリガーの判定を skills/triggers.ts の TriggerTracker に移し、1 パス目のフレームループと同じコードを通す。
// Stage 11: 対象「直前にバーストスキルを使用した味方」（burstUsers）は発火ごとに対象が変わるので、対象の枠ごとに窓を和集合にする。
// 回復（heal）を 1 段目に planHeals（skills/heals.ts）で集め、「回復効果が適用された時」（healed）の出来事として流し直す。
// Stage 11 アリス編: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の効果は 2 段目に回し、1 段目の攻撃力の窓で順位を付けて
// 対象を決める（skills/ranking.ts。plan/design-stage11.md 19.2 節）。
import { isInFullBurst, type BurstSchedule } from '../burst/schedule.ts';
import type { ShotLog } from '../sim/shots.ts';
import type { CharacterData } from '../types.ts';
import { FPS } from '../weapons.ts';
import { ZERO_BUFFS, applyResolvedEffect, type BuffTotals } from './buffs.ts';
import {
  isResolvedShotCount,
  resolvePassives,
  resolveTimed,
  type AppliedEffect,
  type AppliedTimedEffect,
  type ResolvedEffect,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type SkillLevels,
} from './resolve.ts';
import { hasHealEffects, planHeals } from './heals.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type RankSlot, type RankingRecord } from './ranking.ts';
import { dependsOnContext, dependsOnRank, isEffectTarget } from './targets.ts';
import { replayEvents, trackTriggerFires, type FrameEvents, type HealRecord, type TriggerFire } from './triggers.ts';
import type { SkillDefinition } from './types.ts';

/** 枠 1 つ分の入力。TeamSlotInput ではなく必要な情報だけを受けて循環 import を避ける（planFixedCycle と同じ流儀） */
export type TimelineSlot = {
  character: CharacterData;
  /** null = 定義ファイルなし。自分の効果は出ないが、味方の allies 効果は受ける */
  definition: SkillDefinition | null;
  levels: SkillLevels;
  /** 発動者基準の固定加算に使うバフ前攻撃力（team.ts の baseAttackOf と同じ値） */
  casterBaseAttack: number;
} | null;

/** 1 つの効果が 1 人に効いているフレーム区間 */
export type BuffWindow = {
  /** 効果を受ける枠 */
  slotIndex: number;
  /** 効果を出した枠 */
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  /** 戦闘時間で切る */
  end: number;
};

/** 枠ごとのバフ合計と、そこに効いた効果（発生順） */
export type SlotBuffState = {
  buffs: BuffTotals;
  /** 常時パッシブ（Stage 4）の分 */
  passiveEffects: AppliedEffect[];
  /** この区間で効いている持続バフの分 */
  timedEffects: AppliedTimedEffect[];
};

export type TimelineSegment = {
  start: number;
  end: number;
  /** (end − start) / FPS */
  seconds: number;
  fullBurst: boolean;
  /** 枠ごとの状態。空枠は null */
  slots: (SlotBuffState | null)[];
  /**
   * 枠ごとの「同じバフ状態」をまとめるための鍵（fullBurst + その枠の BuffTotals）。空枠は null。
   * 枠ごとに持つのが要点で、ある枠のバフが変わっても他の枠の区間はまとまったままになる。
   * グループ化にしか使わない（計算には丸める前の buffs を使う）。
   */
  slotKeys: (string | null)[];
};

export type BuffTimeline = {
  frames: number;
  /** [0, frames) を隙間・重なりなく覆う */
  segments: TimelineSegment[];
  /** 発生順。UI とテスト用 */
  windows: BuffWindow[];
  /** 常時パッシブだけの状態（Stage 4 互換の表示用）。空枠は null */
  passive: (SlotBuffState | null)[];
  /** Stage 11: 回復の記録（skills/heals.ts の planHeals）。heal 効果が無ければ空 */
  heals: HealRecord[];
  /** Stage 11 アリス編: topAttack の効果の発火ごとの順位（効果ごと・発生順）。topAttack の効果が無ければ空 */
  rankings: RankingRecord[];
};

/** 1 枠ぶんの「同じバフ状態の区間」をまとめたもの。calc はこの単位で computeDamage を呼ぶ */
export type TimelineGroup = {
  key: string;
  fullBurst: boolean;
  /** その枠の状態（グループ内のどの区間でも同じ） */
  state: SlotBuffState;
  /** この状態でいた合計秒数 */
  seconds: number;
  /** 含まれる区間（出現順） */
  segments: TimelineSegment[];
};

/** 空枠・未計算のときに使う「バフなし」の状態 */
export const EMPTY_BUFF_STATE: Readonly<SlotBuffState> = Object.freeze({
  buffs: ZERO_BUFFS,
  passiveEffects: [],
  timedEffects: [],
});

/** key に使う BuffTotals のフィールド（並び順を固定する） */
const BUFF_FIELDS = [
  'attackRatio',
  'attackFlat',
  'critRate',
  'critDamage',
  'attackDamage',
  'chargeDamage',
  'distributedDamage',
  'burstGaugeSpeed',
  'maxAmmoRatio',
  'maxAmmoFlat',
  'reloadSpeed',
  'chargeSpeed',
] as const satisfies readonly (keyof BuffTotals)[];

/** key の桁数。最下位ビットのずれで同一状態が別グループに割れないよう固定桁で文字列化する */
export const KEY_DIGITS = 6;

function keyOf(fullBurst: boolean, state: SlotBuffState): string {
  const parts: string[] = [fullBurst ? 'FB' : '--'];
  for (const field of BUFF_FIELDS) parts.push(state.buffs[field].toFixed(KEY_DIGITS));
  // 効いている効果の出どころも鍵に入れる。合計が同じでも別の効果なら別の状態として扱い、UI のラベルが混ざらないようにする
  // （例: クイーン（真）の battleStart と fullBurstEnd はどちらも攻撃力 +50.28%）
  for (const e of state.timedEffects) parts.push(`${e.sourceSlotIndex}.${e.source.skill}.${e.effectIndex}`);
  return parts.join('|');
}

/**
 * 同じ射撃の列・時刻表で何度も呼ばれる（効果ごと）ので、直前の出来事の列を使い回す。
 * Stage 11: 回復の記録（heals）も鍵に入れる（回復の無い列と有る列は別物）。どれも参照の一致で見る
 */
let replayCache: {
  schedule: BurstSchedule | null;
  shots: readonly (ShotLog | null)[];
  frames: number;
  heals: readonly HealRecord[];
  events: FrameEvents[];
} | null = null;

const NO_HEALS: readonly HealRecord[] = Object.freeze([]);

function eventsOf(
  schedule: BurstSchedule | null,
  shots: readonly (ShotLog | null)[],
  frames: number,
  heals: readonly HealRecord[] = NO_HEALS,
): FrameEvents[] {
  const c = replayCache;
  if (c !== null && c.schedule === schedule && c.shots === shots && c.frames === frames && c.heals === heals) {
    return c.events;
  }
  const events = replayEvents(schedule, shots, frames, heals);
  replayCache = { schedule, shots, frames, heals, events };
  return events;
}

/**
 * トリガーが起きたフレーム列（昇順）。schedule が null（バーストなし）なら battleStart と射撃の回数だけ発火する。
 * burstUse はその枠が実際に撃った発動のフレーム（動的サイクルでは段階ごとに別フレーム、同じ段階の 2 体は交互になりうる）。
 * 射撃の回数（Stage 8）は shots[slotIndex] の every・2 × every…番目の射撃のフレーム。バフ窓の開始は buffStartFrames が 1 つ後ろにずらす。
 * Stage 10: 判定は skills/triggers.ts の TriggerTracker（1 パス目のフレームループと共通）に出来事の列を流し直して行う。
 */
export function triggerFrames(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): number[] {
  return triggerFires(trigger, schedule, slotIndex, frames, shots, heals).map((f) => f.frame);
}

/** Stage 11: triggerFrames の文脈つき版（対象 burstUsers の判定に使う）。heals は healed の出来事（planHeals の結果） */
export function triggerFires(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): TriggerFire[] {
  return trackTriggerFires(trigger, slotIndex, schedule, eventsOf(schedule, shots, frames, heals));
}

/** バフ窓が始まるフレーム。射撃の回数トリガーだけ、トリガーになった射撃の次のフレームから（その射撃自身には乗らない） */
export function buffStartFrames(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): number[] {
  return buffStartFires(trigger, schedule, slotIndex, frames, shots, heals).map((f) => f.frame);
}

/** Stage 11: buffStartFrames の文脈つき版 */
export function buffStartFires(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): TriggerFire[] {
  const fired = triggerFires(trigger, schedule, slotIndex, frames, shots, heals);
  if (!isResolvedShotCount(trigger)) return fired;
  return fired.map((f) => ({ frame: f.frame + 1, context: f.context })).filter((f) => f.frame < frames);
}

/** 同一効果の窓を和集合にする（上書き延長。重ねない）。frames が上限 */
function unionWindows(fireFrames: readonly number[], durationFrames: number, frames: number): [number, number][] {
  if (durationFrames <= 0) return [];
  const merged: [number, number][] = [];
  for (const f of [...fireFrames].sort((a, b) => a - b)) {
    if (f >= frames) continue;
    const end = Math.min(f + durationFrames, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && f <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([f, end]);
  }
  return merged;
}

type PassiveSource = { slotIndex: number; casterBaseAttack: number; effect: ResolvedEffect };

/** 常時パッシブだけの状態（Stage 4 の resolveTeamBuffs と同じ結果になる）。空枠は null */
export function resolvePassiveStates(slots: readonly TimelineSlot[]): (SlotBuffState | null)[] {
  const sources: PassiveSource[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolvePassives(slot.definition, slot.character, slot.levels)) {
      sources.push({ slotIndex, casterBaseAttack: slot.casterBaseAttack, effect });
    }
  });
  return slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const passiveEffects: AppliedEffect[] = [];
    for (const { slotIndex, casterBaseAttack, effect } of sources) {
      if (!isEffectTarget(effect, slotIndex, index, slot.character.weaponType)) continue;
      const applied = applyResolvedEffect(buffs, effect, casterBaseAttack);
      buffs = applied.totals;
      passiveEffects.push({ ...effect, sourceSlotIndex: slotIndex, appliedAmount: applied.appliedAmount });
    }
    return { buffs, passiveEffects, timedEffects: [] };
  });
}

/**
 * 持続バフの区間分割。
 * 境界は {0, frames} ∪ 全バフ窓の端 ∪ フルバースト区間の端 ∪ バースト発動フレーム。
 * shots（Stage 8）は射撃の回数トリガーに使う射撃の列。省略すると射撃の回数トリガーは発火しない。
 */
export function planBuffTimeline(
  slots: readonly TimelineSlot[],
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
): BuffTimeline {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const passive = resolvePassiveStates(slots);
  // Stage 11: 回復の記録（1 段目）。heal 効果が無ければ空のまま（出来事の列は今までと同じ）
  const heals = hasHealEffects(slots) ? planHeals(slots, schedule, shots, frames) : [];
  const healsKey: readonly HealRecord[] = heals.length === 0 ? NO_HEALS : heals;

  // 1〜2. 発火フレーム → 窓（同一効果は和集合）→ 対象の枠に配る
  const windows: BuffWindow[] = [];
  /** 2 段目に回す効果（対象が攻撃力の順位で決まる） */
  const ranked: { sourceSlotIndex: number; effect: ResolvedTimedEffect }[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      if (dependsOnRank(effect)) {
        ranked.push({ sourceSlotIndex, effect });
        continue;
      }
      const fires = buffStartFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey);
      if (!dependsOnContext(effect)) {
        const merged = unionWindows(
          fires.map((f) => f.frame),
          effect.durationFrames,
          frames,
        );
        if (merged.length === 0) continue;
        slots.forEach((target, slotIndex) => {
          if (target === null || !isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character.weaponType)) {
            return;
          }
          for (const [start, end] of merged) windows.push({ slotIndex, sourceSlotIndex, effect, start, end });
        });
        continue;
      }
      // Stage 11: 対象が発火ごとに変わる効果（burstUsers）は、対象の枠ごとに「その枠が対象だった発火」だけで和集合にする
      // （上書き延長はその枠が受けた発火どうしでだけ起きる。plan/design-stage11.md 3.2 節）
      slots.forEach((target, slotIndex) => {
        if (target === null) return;
        const mine = fires
          .filter((f) => isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character.weaponType, f.context))
          .map((f) => f.frame);
        for (const [start, end] of unionWindows(mine, effect.durationFrames, frames)) {
          windows.push({ slotIndex, sourceSlotIndex, effect, start, end });
        }
      });
    }
  });

  // 2 段目（Stage 11 アリス編）: 1 段目の攻撃力の窓で発火ごとに順位を付け、対象の枠ごとに和集合にする
  const rankings: RankingRecord[] = [];
  if (ranked.length > 0) {
    const rankSlots = rankSlotsOf(slots, passive);
    const attackWindows = windows.filter((w) => w.effect.stat === 'attack');
    const rankedWindows: BuffWindow[] = [];
    for (const { sourceSlotIndex, effect } of ranked) {
      const perTarget: number[][] = slots.map(() => []);
      // 順位はトリガーが起きたフレームで出し、窓は射撃の回数起点なら次のフレームから（1 パス目と同じ）
      for (const fire of triggerFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey)) {
        const start = isResolvedShotCount(effect.trigger) ? fire.frame + 1 : fire.frame;
        if (start >= frames) continue;
        const finalAttacks = finalAttacksAt(rankSlots, attackWindows, fire.frame);
        const attackRank = attackRankFor(effect, rankSlots, finalAttacks);
        const context = { ...fire.context, attackRank };
        const targets: number[] = [];
        slots.forEach((target, slotIndex) => {
          if (target === null) return;
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character.weaponType, context)) return;
          perTarget[slotIndex]!.push(start);
          targets.push(slotIndex);
        });
        rankings.push({
          frame: fire.frame,
          sourceSlotIndex,
          effect: { source: effect.source, effectIndex: effect.effectIndex },
          finalAttacks,
          targets: attackRank.filter((i) => targets.includes(i)),
          tied: tiedAtCutoff(attackRank, finalAttacks, effect.targetCount ?? 1),
        });
      }
      perTarget.forEach((starts, slotIndex) => {
        for (const [start, end] of unionWindows(starts, effect.durationFrames, frames)) {
          rankedWindows.push({ slotIndex, sourceSlotIndex, effect, start, end });
        }
      });
    }
    windows.push(...rankedWindows);
  }

  // 3. 境界
  const bounds = new Set<number>([0, frames]);
  for (const w of windows) {
    bounds.add(w.start);
    bounds.add(w.end);
  }
  if (schedule !== null) {
    for (const w of schedule.fullBurstWindows) {
      bounds.add(w.start);
      bounds.add(w.end);
    }
    for (const a of schedule.activations) bounds.add(a.frame);
  }
  const sorted = [...bounds].filter((b) => b >= 0 && b <= frames).sort((a, b) => a - b);

  // 4〜5. 区間ごとに状態を組む
  const segments: TimelineSegment[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (start >= end) continue;
    // 境界にフルバースト区間の端が入っているので、区間の先頭で判定すれば区間全体で同じ値になる
    const fullBurst = schedule !== null && isInFullBurst(schedule, start);
    const slotStates = passive.map((base) =>
      base === null
        ? null
        : { buffs: { ...base.buffs }, passiveEffects: base.passiveEffects, timedEffects: [] as AppliedTimedEffect[] },
    );
    // 窓の発生順に足して浮動小数の加算順を決定的にする
    for (const w of windows) {
      if (w.start > start || w.end <= start) continue;
      const state = slotStates[w.slotIndex];
      if (!state) continue;
      const applied = applyResolvedEffect(state.buffs, w.effect, slots[w.sourceSlotIndex]?.casterBaseAttack ?? 0);
      state.buffs = applied.totals;
      state.timedEffects.push({
        ...w.effect,
        sourceSlotIndex: w.sourceSlotIndex,
        appliedAmount: applied.appliedAmount,
      });
    }
    segments.push({
      start,
      end,
      seconds: (end - start) / FPS,
      fullBurst,
      slots: slotStates,
      slotKeys: slotStates.map((state) => (state === null ? null : keyOf(fullBurst, state))),
    });
  }

  return { frames, segments, windows, passive, heals, rankings };
}

/** 順位の材料（skills/ranking.ts）。常時パッシブは resolvePassiveStates の結果 */
export function rankSlotsOf(slots: readonly TimelineSlot[], passive: readonly (SlotBuffState | null)[]): RankSlot[] {
  return slots.map((slot, i) =>
    slot === null
      ? null
      : {
          casterBaseAttack: slot.casterBaseAttack,
          weaponType: slot.character.weaponType,
          passive: passive[i]?.buffs ?? ZERO_BUFFS,
        },
  );
}

/**
 * 枠 slotIndex について、バフ状態が同じ区間をまとめる（出現順）。calc はこの単位で計算する。
 * 空枠なら空配列。持続バフがなければ「通常区間 / フルバースト区間」の 2 つに退化する。
 */
export function groupTimeline(timeline: BuffTimeline, slotIndex: number): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const byKey = new Map<string, TimelineGroup>();
  for (const segment of timeline.segments) {
    const key = segment.slotKeys[slotIndex];
    const state = segment.slots[slotIndex];
    if (key === null || key === undefined || state === undefined || state === null) continue;
    const found = byKey.get(key);
    if (found !== undefined) {
      found.seconds += segment.seconds;
      found.segments.push(segment);
      continue;
    }
    const group: TimelineGroup = {
      key,
      fullBurst: segment.fullBurst,
      state,
      seconds: segment.seconds,
      segments: [segment],
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

export type FrameRange = { start: number; end: number };

/** 連続する区間をひとつなぎにする（表示用）。他の枠のバフ切り替えで割れた境界を畳む */
export function mergeAdjacentRanges(ranges: readonly FrameRange[]): FrameRange[] {
  const merged: FrameRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.end === r.start) {
      last.end = r.end;
      continue;
    }
    merged.push({ start: r.start, end: r.end });
  }
  return merged;
}

/** フレーム frame を含む区間の添字。範囲外なら -1 */
export function segmentIndexAt(timeline: BuffTimeline, frame: number): number {
  return timeline.segments.findIndex((s) => s.start <= frame && frame < s.end);
}
