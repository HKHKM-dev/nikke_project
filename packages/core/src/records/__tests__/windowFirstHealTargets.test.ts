// 指標 windowFirstHealTargets（V-0752）: 枠の HP の割合が 1 未満の窓ごとの、最初の回復の対象の枠。録画 1121（I-DOLL・フラワー・ノワール・
// ミルク・ミサト・マスト。マストのバーストの最大HP のみ▲ の間にミサトの S1 の回復）のモデルで見る
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { runSimulation } from '../../sim/engine.ts';
import { METRICS } from '../observations/metrics/index.ts';
import type { CompareSetup } from '../observations/setup.ts';
import { buildTeamInput } from '../observations/teamInput.ts';

const file = loadRecordingsFile();
const setup: CompareSetup = {
  enemy: 'range-bigarms-fire',
  events: ['range-3min-jump'],
  burst: true,
  noBurstSlots: [2, 3, 4],
  noFireSlots: [3],
};
const input = buildTeamInput(recordingMap(file).get('1121')!, setup, loadRecordsData(file));
const result = runSimulation(input);
const metric = METRICS.windowFirstHealTargets!;
const mastWindows = { slot: 4, windowSlot: 5 };
const run = (args: Record<string, number>) => metric.sim(result, { args: { ...mastWindows, ...args }, input });
const all = run({}) as number[];

describe('windowFirstHealTargets', () => {
  it('takes the first heal of each window where the window slot is below full', () => {
    // マストの窓 10 回とも回復が来て、割合の最も低い 2 機（ノワール・ミルク。51.09%）のうち枠の若いノワールに当たる
    expect(all).toEqual(Array(10).fill(2));
    expect(metric.occurrences!(result, { args: mastWindows, input })).toBe(all.length);
  });

  it('skips the head and cuts to count, and refuses when too few', () => {
    expect(run({ skip: 1, count: 2 })).toEqual(all.slice(1, 3));
    expect(() => run({ count: all.length + 1 })).toThrow('回復の来た窓');
  });

  it('gives nothing when the window slot never drops below full', () => {
    // フラワー（1 枠目）には最大HP のみ▲ が付かない
    expect(run({ windowSlot: 1 })).toEqual([]);
  });
});
