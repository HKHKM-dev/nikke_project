// Stage 6: 持続バフのタイムライン（純関数）。sim と calc が同じ区間分割を使う。
// 時刻表（burst/schedule.ts の BurstSchedule）は戦闘前に決まるので、バフの付与・失効のフレームも静的に決まる。
// Stage 7 で固定サイクル専用の形から BurstSchedule に一般化した（固定・動的どちらの時刻表でも同じ作り方）。
//
// 流れ: トリガーの発火フレーム → バフ窓 [start, end)（同一効果の再発火は和集合 = 上書き延長）
//       → 境界を集めて区間に割る → 区間ごとに枠の BuffTotals を作る → 同じバフ状態の区間をグループにまとめる。
//
// calc はグループごとに computeDamage を 1 回呼び、sim はフレームループで区間をまたぐたびに 1 トリガーの値を差し替える。
// timed 効果が 1 つもなければグループは「通常区間 / フルバースト区間」の 2 つに退化し、Stage 5 とまったく同じ計算になる。
import { activationFramesOfSlot, isInFullBurst, type BurstSchedule } from '../burst/schedule.ts';
import type { CharacterData } from '../types.ts';
import { FPS } from '../weapons.ts';
import { ZERO_BUFFS, applyResolvedEffect, type BuffTotals } from './buffs.ts';
import {
  resolvePassives,
  resolveTimed,
  type AppliedEffect,
  type AppliedTimedEffect,
  type ResolvedEffect,
  type ResolvedTimedEffect,
  type SkillLevels,
} from './resolve.ts';
import { isEffectTarget } from './targets.ts';
import type { BuffTrigger, SkillDefinition } from './types.ts';

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
 * トリガーの発火フレーム列。schedule が null（バーストなし）なら battleStart だけ発火する。
 * burstUse はその枠が実際に撃った発動のフレーム（動的サイクルでは段階ごとに別フレーム、同じ段階の 2 体は交互になりうる）。
 */
export function triggerFrames(
  trigger: BuffTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
): number[] {
  if (trigger === 'battleStart') return frames > 0 ? [0] : [];
  if (schedule === null) return [];
  switch (trigger) {
    case 'burstUse':
      return activationFramesOfSlot(schedule, slotIndex).filter((f) => f < frames);
    case 'fullBurstStart':
      return schedule.fullBurstWindows.map((w) => w.start).filter((f) => f < frames);
    case 'fullBurstEnd':
      // 戦闘時間で切られた最後の窓（end === frames）では発火しない
      return schedule.fullBurstWindows.map((w) => w.end).filter((f) => f < frames);
  }
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
      if (!isEffectTarget(effect.target, slotIndex, index)) continue;
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
 */
export function planBuffTimeline(
  slots: readonly TimelineSlot[],
  schedule: BurstSchedule | null,
  frames: number,
): BuffTimeline {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const passive = resolvePassiveStates(slots);

  // 1〜2. 発火フレーム → 窓（同一効果は和集合）→ 対象の枠に配る
  const windows: BuffWindow[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      const merged = unionWindows(
        triggerFrames(effect.trigger, schedule, sourceSlotIndex, frames),
        effect.durationFrames,
        frames,
      );
      if (merged.length === 0) continue;
      slots.forEach((target, slotIndex) => {
        if (target === null || !isEffectTarget(effect.target, sourceSlotIndex, slotIndex)) return;
        for (const [start, end] of merged) windows.push({ slotIndex, sourceSlotIndex, effect, start, end });
      });
    }
  });

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

  return { frames, segments, windows, passive };
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
