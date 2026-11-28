// 対象の語彙編（plan/design-target-vocab.md）: エマ：TU・ウンファ：TU の S2 の「同じ部隊の味方全体に」（targetSquad。C-0266・C-0268）と、
// マナの S2 の「基本チャージ時間が一番長い味方 1 機にチャージ時間 0.18 秒▼」（longestChargeTime・chargeSpeed の flat。C-0267）を
// 含む編成の対象の枠を見る。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { piecesOf } from './historyHelpers.ts';
import { fixedEnemy, fixedSlot, fixedTeam, describeRuns } from './teamHelpers.ts';

const enemy: EnemyInput = fixedEnemy();

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return fixedTeam(slots, controlledSlot, { enemy });
}

const EMMA = 93;
const EUNHWA = 95;
const MANA = 290;

/** 常時パッシブのうち、枠 from の効果が枠 to に足した stat の量 */
function passiveFrom(input: TeamInput, from: number, to: number, stat: string): number {
  const state = planTeamRun(input).timeline.passive[to]!;
  return state.passiveEffects
    .filter((e) => e.sourceSlotIndex === from && e.stat === stat)
    .reduce((sum, e) => sum + e.appliedAmount, 0);
}

describe('同じ部隊の味方全体に（targetSquad）', () => {
  it('gives Emma: TU S2 critical damage to herself but not to Delta (録画 0022 の編成。C-0266)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(20)], 1);
    expect(passiveFrom(input, 0, 0, 'critDamage')).toBeCloseTo(0.2351, 6);
    expect(passiveFrom(input, 0, 1, 'critDamage')).toBe(0);
  });

  it('gives both S2 to the Absolute slots only (C-0266・C-0268)', () => {
    const input = team([fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(20), fixedSlot(225)], 3);
    for (const to of [0, 1]) {
      expect(passiveFrom(input, 0, to, 'critDamage')).toBeCloseTo(0.2351, 6);
      expect(passiveFrom(input, 1, to, 'critRate')).toBeCloseTo(0.0816, 6);
    }
    for (const to of [2, 3]) {
      expect(passiveFrom(input, 0, to, 'critDamage')).toBe(0);
      expect(passiveFrom(input, 1, to, 'critRate')).toBe(0);
    }
    // チャージダメージ▲（効果 2）は味方全体のまま
    expect(passiveFrom(input, 1, 3, 'chargeDamage')).toBeGreaterThan(0);
  });
});

describe('基本チャージ時間が一番長い味方（longestChargeTime）', () => {
  const chargeWindows = (input: TeamInput) =>
    piecesOf(planTeamRun(input)).filter((w) => w.effect.source.resourceId === MANA && w.effect.stat === 'chargeSpeed');

  it('cuts 0.18 s from Delta at every full burst start (録画 0020 の編成。C-0267)', () => {
    const input = team([fixedSlot(291), fixedSlot(20), fixedSlot(MANA)], 2);
    const windows = chargeWindows(input);
    const sim = runSimulation(input);
    const starts = sim.schedule!.fullBurstWindows.map((w) => w.start);
    expect(windows.map((w) => w.start)).toEqual(starts);
    expect(windows.every((w) => w.slotIndex === 1 && w.effect.value === 0.18)).toBe(true);
  });

  it('picks the slot with the longest base charge time (録画 0043 の編成: アリスの 1.5 秒)', () => {
    const input = team([fixedSlot(304), fixedSlot(330), fixedSlot(191), fixedSlot(MANA), fixedSlot(172)], 2);
    const windows = chargeWindows(input);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.every((w) => w.slotIndex === 2)).toBe(true);
  });
});

const TEAMS: Record<string, TeamInput> = {
  'エマ：TU + ウンファ：TU + デルタ + 紅蓮BS': team(
    [fixedSlot(EMMA), fixedSlot(EUNHWA), fixedSlot(20), fixedSlot(225)],
    3,
  ),
  '録画 0043 の編成（フラワー + クラウン + アリス + マナ + アドミ）': team(
    [fixedSlot(304), fixedSlot(330), fixedSlot(191), fixedSlot(MANA), fixedSlot(172)],
    2,
  ),
};

describeRuns(TEAMS);
