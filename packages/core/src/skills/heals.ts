// Stage 11: 回復（heal 効果）の記録を作る 1 段目（plan/design-stage11.md 3.3 節）。
// 回復はダメージに関係しないが、「回復効果が適用された時」（トリガー healed）のきっかけになる。
// heal のトリガーに healed は書けない（types.ts の検証）ので、回復は「回復の無い出来事の列」だけで決まり、2 段で閉じる:
//   1. planHeals: 回復の無い出来事の列に各枠の heal 効果を流し、回復の記録を作る
//   2. replayEvents(…, heals): 回復を healed として出来事の列に書き込み、ほかの効果を流す
// 回復のフレームは heal の窓が始まるはずのフレーム（射撃の回数起点ならトリガーになった射撃の次のフレーム）。
// アスカ（plan/design-asuka.md 2.1 節）: 吸収回復（lifesteal）は、窓 [始まり, 始まり + 維持) の中の対象の枠の射撃（全弾命中の前提で
// 命中と同じ）ごとに、その次のフレームに回復を起こす。窓は heal と同じく healed に依らないので、2 段で閉じるのは変わらない。
import type { BurstSchedule } from '../burst/schedule.ts';
import type { ShotLog } from '../frame/shots.ts';
import { isResolvedShotCount, resolveInstant, resolveLifesteal, type ResolvedInstantEffect } from './resolve.ts';
import { isEffectTarget } from './targets.ts';
import type { TimelineSlot } from './timeline.ts';
import { replayEvents, trackTriggerFires, type FrameEvents, type HealRecord } from './triggers.ts';

/** 回復の起きるフレーム。射撃の回数起点ならトリガーの次のフレーム（窓の開始と同じ規則） */
export function healFrameOf(effect: Pick<ResolvedInstantEffect, 'trigger'>, fireFrame: number): number {
  return isResolvedShotCount(effect.trigger) ? fireFrame + 1 : fireFrame;
}

/** 編成に heal・lifesteal 効果があるか（無ければ回復の記録は常に空） */
export function hasHealEffects(slots: readonly TimelineSlot[]): boolean {
  return slots.some(
    (slot) =>
      slot !== null &&
      slot.definition !== null &&
      (resolveInstant(slot.definition, slot.character, slot.levels).some((e) => e.kind === 'heal') ||
        resolveLifesteal(slot.definition, slot.character, slot.levels).length > 0),
  );
}

/** 窓の列（[start, end)）を和集合にする（昇順） */
function unionRanges(ranges: readonly [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/** 吸収回復の窓 windows（和集合済み）の中の射撃 shotFrames の、次のフレーム（frames の外は捨てる） */
export function lifestealHealFrames(
  shotFrames: readonly number[],
  windows: readonly [number, number][],
  frames: number,
): number[] {
  const out: number[] = [];
  let w = 0;
  for (const f of shotFrames) {
    while (w < windows.length && windows[w]![1] <= f) w += 1;
    const win = windows[w];
    if (win === undefined) break;
    if (f < win[0] || f + 1 >= frames) continue;
    out.push(f + 1);
  }
  return out;
}

/**
 * 回復の記録（フレーム・出どころの枠・受けた枠の順に並べる）。戦闘時間 frames の外は捨てる。
 * events は回復の無い出来事の列（replayEvents(schedule, shots, frames)）。省略時はここで作る
 */
export function planHeals(
  slots: readonly TimelineSlot[],
  schedule: BurstSchedule | null,
  shots: readonly (ShotLog | null)[],
  frames: number,
  events: readonly FrameEvents[] = replayEvents(schedule, shots, frames),
): HealRecord[] {
  const heals: HealRecord[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveInstant(slot.definition, slot.character, slot.levels)) {
      if (effect.kind !== 'heal') continue;
      for (const fire of trackTriggerFires(effect.trigger, sourceSlotIndex, schedule, events)) {
        const frame = healFrameOf(effect, fire.frame);
        if (frame >= frames) continue;
        slots.forEach((target, slotIndex) => {
          if (target === null) return;
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, fire.context)) return;
          heals.push({ frame, sourceSlotIndex, slotIndex });
        });
      }
    }
    for (const effect of resolveLifesteal(slot.definition, slot.character, slot.levels)) {
      if (effect.durationFrames <= 0) continue;
      const windows: [number, number][][] = slots.map(() => []);
      for (const fire of trackTriggerFires(effect.trigger, sourceSlotIndex, schedule, events)) {
        const start = healFrameOf(effect, fire.frame);
        slots.forEach((target, slotIndex) => {
          if (target === null) return;
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, fire.context)) return;
          windows[slotIndex]!.push([start, start + effect.durationFrames]);
        });
      }
      windows.forEach((list, slotIndex) => {
        if (list.length === 0) return;
        for (const frame of lifestealHealFrames(shots[slotIndex]?.frames ?? [], unionRanges(list), frames)) {
          heals.push({ frame, sourceSlotIndex, slotIndex });
        }
      });
    }
  });
  return heals.sort((a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex);
}
