// 順位の対象の同値の向き（plan/design-rank-tie-break.md）: 録画（V-0901・V-0634）と同じ編成で、同値の味方のどちらに付くか。
// ナガの S2 は枠の遅い方（C-1627）、プロダクト08 の S2 は枠の若い方（C-1628）、ソーダ：トゥインクルバニーの S1 は枠の遅い方（C-0882）
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { fixedSlot, rangeEnemyWithEvents } from './teamHelpers.ts';

const DELTA = 20;
const PRODUCT08 = 302;
const SUN = 308;
const SODA_TB = 314;
const ZWEI = 390;
const NAGA = 450;
const RAM = 822;
const ASUKA = 830;

function team(ids: (number | null)[], controlledSlot: number, burst: boolean): TeamInput {
  return {
    slots: ids.map((id) => (id === null ? null : { ...fixedSlot(id), conditionMode: 'auto' as const })),
    enemy: rangeEnemyWithEvents(),
    durationSeconds: 180,
    burst,
    controlledSlot,
  };
}

/** 枠 source の skill の効果 effectIndex の順位の記録 */
function rankingsOf(input: TeamInput, source: number, skill: string, effectIndex: number) {
  return planTeamRun(input).history.rankings.filter(
    (r) => r.sourceSlotIndex === source && r.effect.source.skill === skill && r.effect.effectIndex === effectIndex,
  );
}

describe('ナガの S2（2 位の同値は枠の遅い方。C-1627）', () => {
  it('picks Naga in slot 2 over Zwei in slot 1 (recordings 1074, 1075)', () => {
    const rankings = rankingsOf(team([ZWEI, NAGA, ASUKA], 2, true), 1, 'skill2', 0);
    expect(rankings.length).toBeGreaterThan(10);
    for (const r of rankings) {
      expect(r.targets).toEqual([2, 1]);
      expect(r.tied).toBe(true);
      expect(r.rankTie).toBe('lastSlot');
    }
  });

  it('picks Zwei in slot 2 over Naga in slot 1 (recording 1452)', () => {
    const rankings = rankingsOf(team([NAGA, ZWEI, ASUKA], 2, false), 0, 'skill2', 0);
    expect(rankings.length).toBeGreaterThan(10);
    for (const r of rankings) expect(r.targets).toEqual([2, 1]);
  });
});

describe('プロダクト08 の S2（同値は枠の若い方。C-1628）', () => {
  it('picks Sun in slot 2 over Product 08 in slot 3 (recording 0697)', () => {
    const rankings = rankingsOf(team([DELTA, SUN, PRODUCT08], 2, true), 2, 'skill2', 0);
    expect(rankings.length).toBe(10);
    for (const r of rankings) {
      expect(r.targets).toEqual([1]);
      expect(r.tied).toBe(true);
      expect(r.rankTie).toBeUndefined();
    }
  });

  it('picks Product 08 in slot 3 over Sun in slot 4 (recording 1451)', () => {
    const rankings = rankingsOf(team([null, null, PRODUCT08, SUN], 2, false), 2, 'skill2', 0);
    expect(rankings.length).toBe(10);
    for (const r of rankings) expect(r.targets).toEqual([2]);
  });
});

describe('ソーダ：トゥインクルバニーの S1 の味方への攻撃ダメージ▲（自分を除く。同値は枠の遅い方）', () => {
  it('picks Delta in slot 2 over Rumani in slot 1 inside Full Burst (C-0882)', () => {
    const rankings = rankingsOf(team([RAM, DELTA, SODA_TB], 2, true), 2, 'skill1', 3);
    expect(rankings.length).toBeGreaterThan(10);
    for (const r of rankings) {
      expect(r.targets).toEqual([1]);
      expect(r.tied).toBe(true);
    }
  });
});
