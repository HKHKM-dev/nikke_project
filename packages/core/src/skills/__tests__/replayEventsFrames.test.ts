// 流し直し（skills/triggers.ts の replayEvents）は、整数でないか負のフレームで止まる。バーストの発動のヒット・効果の発火のフレームを
// 作る遅れ（遅れの表 MEASURED_BURST_DELAYS と、観測値の比べる設定の burstDelays の上書き）が、そうしたフレームを作らないことを確かめる
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { MEASURED_BURST_DELAYS, withBurstDelays } from '../../burst/landing.ts';
import type { BurstActivation, BurstSchedule } from '../../burst/schedule.ts';
import { validateObservations } from '../../records/observations/validate.ts';
import type { BurstDelayOverrideSetup } from '../../records/observations/setup.ts';
import type { Observation } from '../../records/observations/types.ts';
import { replayEvents } from '../triggers.ts';

const activation: BurstActivation = {
  frame: 0,
  step: 'Step1',
  slotIndex: 0,
  startsFullBurst: false,
  enteredStep: null,
};

function scheduleOf(a: BurstActivation): BurstSchedule {
  return {
    model: 'dynamic',
    activations: [a],
    fullBurstWindows: [],
    fullBurstFramesTotal: 0,
    gaugeFullFrames: [],
    chainTimeouts: [],
    cooldownReductions: [],
  };
}

describe('replayEvents のフレーム', () => {
  it('stops on a burst hit at a non-integer frame', () => {
    const half = withBurstDelays(activation, { hitFrames: 10, effectFrames: 0, hitOffsets: [0, 7.5] });
    expect(() => replayEvents(scheduleOf(half), [null], 300)).toThrow(RangeError);
  });

  it('cannot get a negative frame from a delay: a frame before the activation stops', () => {
    expect(() => withBurstDelays(activation, { hitFrames: 0, effectFrames: -1, origin: 'activation' })).toThrow(
      /before the activation/,
    );
  });
});

describe('遅れの表の行', () => {
  it('writes integer delays and offsets in every row', () => {
    for (const row of MEASURED_BURST_DELAYS) {
      const d = row.delays;
      expect([d.hitFrames, d.effectFrames, ...(d.hitOffsets ?? [])].every(Number.isInteger), row.claim).toBe(true);
    }
  });
});

describe('観測値の比べる設定の burstDelays', () => {
  const file = loadRecordingsFile();
  const recordings = recordingMap(file);
  const data = loadRecordsData(file);
  const errorsOf = (row: NonNullable<BurstDelayOverrideSetup['row']>) => {
    const o: Observation = {
      id: '0400-91',
      recording: '0400',
      kind: 'hit',
      use: 'compare',
      value: 1,
      description: 'x',
      source: 'V-0001',
      compare: {
        model: 'sim',
        metric: 'teamTotalDamage',
        args: {},
        tolerance: { abs: 1 },
        setup: { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burstDelays: [{ rid: 172, row }] },
      },
    };
    return validateObservations([o], recordings, data.enemies);
  };

  it('accepts integer delays and ascending integer offsets from 0', () => {
    expect(errorsOf({ hitFrames: 3, effectFrames: -2, hitOffsets: [0, 7] })).toEqual([]);
  });

  it.each([
    ['a non-integer hit delay', { hitFrames: 2.5, effectFrames: 0 }, 'burstDelays の hitFrames・effectFrames は整数'],
    [
      'a non-integer effect delay',
      { hitFrames: 0, effectFrames: 0.5 },
      'burstDelays の hitFrames・effectFrames は整数',
    ],
    [
      'a non-integer offset',
      { hitFrames: 0, effectFrames: 0, hitOffsets: [0, 7.5] },
      'burstDelays の hitOffsets は 0 から始まる昇順の整数',
    ],
    [
      'a negative offset',
      { hitFrames: 0, effectFrames: 0, hitOffsets: [0, -3] },
      'burstDelays の hitOffsets は 0 から始まる昇順の整数',
    ],
    [
      'offsets not starting at 0',
      { hitFrames: 0, effectFrames: 0, hitOffsets: [-2, 5] },
      'burstDelays の hitOffsets は 0 から始まる昇順の整数',
    ],
  ])('rejects %s', (_, row, error) => {
    expect(errorsOf(row)).toContain(`0400-91: ${error}`);
  });
});
