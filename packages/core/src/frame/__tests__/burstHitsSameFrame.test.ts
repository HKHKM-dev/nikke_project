// 分かれたバーストのヒット（hitOffsets）が、ほかの発動のヒットと同じフレームに重なる場合の、1 パス目のフレームの出来事
// （frame/firstPass/frameEvents.ts の collectFrameEvents）。流し直し（skills/triggers.ts の replayEvents）と同じ発動の列になり、
// トリガー burstHit はどちらの枠でも発火する（plan/design-burst-hit-reapply.md 5 節）
import { describe, expect, it } from 'vitest';
import { hitFramesOf, type BurstActivation, type BurstSchedule } from '../../burst/schedule.ts';
import { createTriggerTracker, replayEvents, type FrameEvents } from '../../skills/triggers.ts';
import { createFrameEvents } from '../firstPass/frameEvents.ts';

const FRAMES = 200;

/** 1 パス目と同じく、フレームの出来事を 0 から順に集める（バーストのヒットだけを見るので、ほかの欄の材料は空） */
function firstPassEvents(activations: readonly BurstActivation[], slotCount: number): FrameEvents[] {
  const { collectFrameEvents } = createFrameEvents({
    activationsOf: () => activations,
    burstModel: 'dynamic',
    burstPauseAim: Array.from({ length: slotCount }, () => 0),
    burstUsePause: Array.from({ length: slotCount }, () => 0),
    coverHeals: [],
    skillFiredBefore: () => [],
    frames: FRAMES,
    gaugeFullOf: () => [],
    heals: [],
    instants: [],
    lists: { consumeFullStacks: () => [] },
    logs: Array.from({ length: slotCount }, () => null),
    pauseLeft: Array.from({ length: slotCount }, () => 0),
    shotEvents: Array.from({ length: slotCount }, () => null),
    slots: Array.from({ length: slotCount }, () => null),
    targetsAt: () => [],
    windowsOf: () => [],
  } as unknown as Parameters<typeof createFrameEvents>[0]);
  return Array.from({ length: FRAMES }, (_, f) => collectFrameEvents(f));
}

function scheduleOf(activations: BurstActivation[]): BurstSchedule {
  return {
    model: 'dynamic',
    activations,
    fullBurstWindows: [],
    fullBurstFramesTotal: 0,
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
  };
}

/** バーストのヒットのあるフレームと、そのフレームのヒットの枠（並びのまま） */
function burstHitSlots(events: readonly FrameEvents[]): [number, number[]][] {
  return events
    .filter((e) => e.burstHits !== undefined && e.burstHits.length > 0)
    .map((e) => [e.frame, e.burstHits!.map((a) => a.slotIndex)]);
}

const base = { step: 'Step1' as const, startsFullBurst: false, enteredStep: null };

describe('1 パス目の、同じフレームに重なるバーストのヒット', () => {
  // 枠 0 の 2 ヒット目と、枠 1 の（遅れのある）1 ヒット目が 130 に重なる
  const a: BurstActivation = { ...base, frame: 100, slotIndex: 0, hitFrame: 110, hitOffsets: [0, 20] };
  const b: BurstActivation = { ...base, frame: 105, slotIndex: 1, hitFrame: 130, hitOffsets: [0, 15] };
  // 枠 2 の遅れの無い 1 ヒットが、発動のフレーム 145 で枠 1 の 2 ヒット目に重なる（発動と同じフレームに積んで、同じフレームに出す）
  const c: BurstActivation = { ...base, frame: 145, slotIndex: 2 };
  // 枠 0 の 2 ヒット目は戦闘の終わり（200）より後なので出さない
  const late: BurstActivation = { ...base, frame: 180, slotIndex: 0, hitFrame: 190, hitOffsets: [0, 12] };
  const activations = [a, b, c, late];

  it('lists every activation hitting on the frame, in the order of the activations', () => {
    expect(hitFramesOf(a)).toEqual([110, 130]);
    expect(hitFramesOf(b)).toEqual([130, 145]);
    expect(burstHitSlots(firstPassEvents(activations, 3))).toEqual([
      [110, [0]],
      [130, [0, 1]],
      [145, [1, 2]],
      [190, [0]],
    ]);
  });

  it('matches the replayed events', () => {
    expect(burstHitSlots(firstPassEvents(activations, 3))).toEqual(
      burstHitSlots(replayEvents(scheduleOf(activations), [null, null, null], FRAMES)),
    );
  });

  it('fires burstHit for each slot hitting on the shared frame', () => {
    const events = firstPassEvents(activations, 3);
    const firesOf = (slotIndex: number) => {
      const tracker = createTriggerTracker('burstHit', slotIndex, 'dynamic');
      return events.filter((e) => tracker(e)).map((e) => e.frame);
    };
    expect(firesOf(0)).toEqual([110, 130, 190]);
    expect(firesOf(1)).toEqual([130, 145]);
    expect(firesOf(2)).toEqual([145]);
  });
});
