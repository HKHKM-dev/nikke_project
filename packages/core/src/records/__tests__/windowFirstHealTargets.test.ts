// 指標 windowFirstHealTargets（V-0752）: 枠の HP の割合が 1 未満の窓ごとの、最初の回復の対象の枠。録画 1121（I-DOLL・フラワー・ノワール・
// ミルク・ミサト・マスト。マストのバーストの最大HP のみ▲ の間にミサトの S1 の回復）のモデルで見る
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../../scripts/records-data.ts';
import { selfHpRatioOf } from '../../skills/holders.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput } from '../../team.ts';
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
const run = (args: Record<string, number>) => metric.sim(result, { args, input: input as TeamInput });

describe('windowFirstHealTargets', () => {
  it('takes the first heal inside each window where the window slot is below full', () => {
    const all = run({ slot: 4, windowSlot: 5 }) as number[];
    // 窓の中の回復だけを、窓ごとに 1 つまで数える
    const inside = result.history.heals.filter(
      (h) => h.sourceSlotIndex === 3 && selfHpRatioOf(result.history, 4, h.frame) < 1,
    );
    expect(inside.length).toBeGreaterThanOrEqual(all.length);
    expect(all.length).toBeGreaterThan(0);
    // マストの窓では、割合の最も低い 2 機（ノワール・ミルク。51.09%）のうち枠の若いノワール
    expect(new Set(all)).toEqual(new Set([2]));
    expect(metric.occurrences!(result, { args: { slot: 4, windowSlot: 5 }, input: input as TeamInput })).toBe(
      all.length,
    );
  });

  it('skips the head and cuts to count, and refuses when too few', () => {
    const all = run({ slot: 4, windowSlot: 5 }) as number[];
    expect(run({ slot: 4, windowSlot: 5, skip: 1, count: 2 })).toEqual(all.slice(1, 3));
    expect(() => run({ slot: 4, windowSlot: 5, count: all.length + 1 })).toThrow('回復の来た窓');
  });

  it('gives nothing when the window slot never drops below full', () => {
    // フラワー（1 枠目）には最大HP のみ▲ が付かない
    expect(run({ slot: 4, windowSlot: 1 })).toEqual([]);
  });
});
