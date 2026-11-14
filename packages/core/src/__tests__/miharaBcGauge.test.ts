// ミハラ：ボンディングチェーン（162）の { counterFull } のきっかけのヒットのゲージ（plan/design-mihara-bc-gauge.md。V-0761）:
// S1 の攻撃・チェーンバインドの付けた時のヒット・刻みが、どれも射手の 1 ヒットぶんのゲージを溜める
import { describe, expect, it } from 'vitest';
import { loadRecordingsFile, loadRecordsData, recordingMap } from '../../scripts/records-data.ts';
import { planTeamRun } from '../frame/plan.ts';
import { buildTeamInput } from '../records/observations/teamInput.ts';
import type { CompareSetup } from '../records/observations/setup.ts';
import { runSimulation } from '../sim/engine.ts';

const file = loadRecordingsFile();
const recordings = recordingMap(file);
const data = loadRecordsData(file);
const setup: CompareSetup = { enemy: 'range-bigarms-fire', events: ['range-3min-jump'], burst: true };
const inputOf = (id: string, extra: Partial<CompareSetup> = {}) =>
  buildTeamInput(recordings.get(id)!, { ...setup, ...extra }, data);

describe('ミハラ：ボンディングチェーンのスキルのヒットのゲージ（V-0761）', () => {
  it('reserves one hit of the shooter on each attack, application and tick before the first full gauge', () => {
    // 撮り方 B2（単騎・操作）: 攻撃 10・付けた時 10・刻み 29 の 49 ヒットで、満タンまでの発は 1000 から 951（設計書 4 節）
    const plan = planTeamRun(inputOf('1119'));
    const full = plan.schedule!.gaugeFullFrames[0]!;
    const before = plan.counterGauges.filter((g) => g.frame <= full);
    expect(before.filter((g) => g.kind === 'attack')).toHaveLength(10);
    expect(before.filter((g) => g.kind === 'apply')).toHaveLength(10);
    expect(before.filter((g) => g.kind === 'tick')).toHaveLength(29);
    for (const g of plan.counterGauges) expect(g.energy).toBe(1000);
    expect(plan.shots[0]!.frames.filter((f) => f <= full)).toHaveLength(951);
  });

  it('charges the same amount when she does not fire (撮り方 C1)', () => {
    const shotsToFull = (id: string) => {
      const r = runSimulation(inputOf(id, { noFireSlots: [2] }));
      const full = r.schedule!.gaugeFullFrames[0]!;
      return r.shots[0]!.frames.filter((f) => f <= full).length;
    };
    expect(shotsToFull('1155')).toBe(951);
    expect(shotsToFull('1157')).toBe(1000);
  });

  it('fills the gauge of 0754 as early as 0755 (C-1142)', () => {
    expect(runSimulation(inputOf('0754')).schedule!.gaugeFullFrames[0]).toBe(398);
    expect(runSimulation(inputOf('0755')).schedule!.gaugeFullFrames[0]).toBe(398);
  });

  // 1 パス目がループの中で予約したヒットは、2 パス目（planSkillHits）が出すヒットと同じ列（バーストの使用の消去・フルバーストの終わりのチャージ・
  // S2 のスタック量▲の刻みの付け直しを含む）。付けた時のヒットのうち、フルバーストの中のものは S2 のスタック量▲（ゲージを溜めない。設計書 1 節）
  it.each(['0747', '0754', '0755'])('reserves the same frames as the hits of the second pass (%s)', (id) => {
    const plan = planTeamRun(inputOf(id));
    const slot = plan.counterGauges[0]!.slotIndex;
    const hits = plan.skillHits.filter((h) => h.slotIndex === slot && h.effect.source.skill === 'skill1');
    const inFullBurst = (f: number) => plan.schedule!.fullBurstWindows.some((w) => w.start <= f && f < w.end);
    const framesOf = (kind: string) => plan.counterGauges.filter((g) => g.kind === kind).map((g) => g.frame);
    expect(framesOf('attack')).toEqual(hits.filter((h) => h.effect.dot === undefined).map((h) => h.frame));
    const applies = hits.filter((h) => h.effect.dot !== undefined && h.onApply);
    expect(applies.some((h) => inFullBurst(h.frame))).toBe(id !== '0747');
    expect(framesOf('apply')).toEqual(applies.filter((h) => !inFullBurst(h.frame)).map((h) => h.frame));
    // 刻みは、フルバーストの外（ゲージが溜まる間）で同じ。フルバーストの中は、S2 のスタック量▲と同じフレームの刻みを 1 パス目だけが
    // 予約する（2 パス目は出さない。状態機械はフルバーストの中のゲージを足さないので効かない。設計書 3 節）
    const ticks = hits.filter((h) => h.effect.dot !== undefined && h.onApply !== true).map((h) => h.frame);
    expect(framesOf('tick').filter((f) => !inFullBurst(f))).toEqual(ticks.filter((f) => !inFullBurst(f)));
    for (const f of ticks) expect(framesOf('tick')).toContain(f);
  });
});
