// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 B）: テストで、1 パス目から履歴と BuffTimeline を作る
// （planTeamRun と同じ作り方。段 A までの 2 パス目の入口 planBuffTimeline の代わり）。
import { runFirstPass, type FirstPassOptions, type FirstPassResult } from '../frame/firstPass.ts';
import { buffTimelineOf } from '../skills/holders.ts';
import type { BuffTimeline, TimelineLandings, TimelineSlot } from '../skills/timeline.ts';

export function firstPassTimeline(
  slots: readonly TimelineSlot[],
  options: FirstPassOptions,
  landings: TimelineLandings | null = null,
  sustainedHitRateUp = true,
): { first: FirstPassResult; timeline: BuffTimeline } {
  const first = runFirstPass(slots, options);
  return { first, timeline: buffTimelineOf(first.history, first.schedule, landings, sustainedHitRateUp) };
}
