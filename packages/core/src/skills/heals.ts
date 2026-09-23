// Stage 11: 回復（heal 効果）の記録を作る 1 段目（plan/design-stage11.md 3.3 節）。
// 回復はダメージに関係しないが、「回復効果が適用された時」（トリガー healed）のきっかけになる。
// heal のトリガーに healed は書けない（types.ts の検証）ので、回復は「回復の無い出来事の列」だけで決まり、2 段で閉じる:
//   1. planHeals: 回復の無い出来事の列に各枠の heal 効果を流し、回復の記録を作る
//   2. replayEvents(…, heals): 回復を healed として出来事の列に書き込み、ほかの効果を流す
// 回復のフレームは heal の窓が始まるはずのフレーム（射撃の回数起点ならトリガーになった射撃の次のフレーム）。
import type { BurstSchedule } from '../burst/schedule.ts';
import type { ShotLog } from '../sim/shots.ts';
import { isResolvedShotCount, resolveInstant, type ResolvedInstantEffect } from './resolve.ts';
import { isEffectTarget } from './targets.ts';
import type { TimelineSlot } from './timeline.ts';
import { replayEvents, trackTriggerFires, type FrameEvents, type HealRecord } from './triggers.ts';

/** 回復の起きるフレーム。射撃の回数起点ならトリガーの次のフレーム（窓の開始と同じ規則） */
export function healFrameOf(effect: Pick<ResolvedInstantEffect, 'trigger'>, fireFrame: number): number {
  return isResolvedShotCount(effect.trigger) ? fireFrame + 1 : fireFrame;
}

/** 編成に heal 効果があるか（無ければ回復の記録は常に空） */
export function hasHealEffects(slots: readonly TimelineSlot[]): boolean {
  return slots.some(
    (slot) =>
      slot !== null &&
      slot.definition !== null &&
      resolveInstant(slot.definition, slot.character, slot.levels).some((e) => e.kind === 'heal'),
  );
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
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character.weaponType, fire.context)) return;
          heals.push({ frame, sourceSlotIndex, slotIndex });
        });
      }
    }
  });
  return heals.sort((a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex);
}
