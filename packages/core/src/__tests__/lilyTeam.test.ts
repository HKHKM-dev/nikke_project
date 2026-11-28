// リリー（852）のバースト（遮蔽物が壊れていない時の、ランダムな味方 1 機への発動者基準の攻撃力▲）を、撮影（V-0898）と同じ編成で見る。
// 「ランダムな味方 N 機」は plan/design-lily.md 2 節
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { piecesOf } from './historyHelpers.ts';
import { fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const LILY = 852;
const LUDMILLA = 190;

const enemy = fixedEnemy({ element: 'Electronic' });

// 撮影 A: リリー単騎（II なのでバーストは起きない）
const SOLO: TeamInput = fixedTeam([fixedSlot(LILY)], 0, { enemy });
// 撮影 B: ルドミラ（I）・リリー（II・操作）
const DUO: TeamInput = fixedTeam(
  [LUDMILLA, LILY].map((id) => fixedSlot(id)),
  1,
  { enemy },
);

const TEN_SECONDS = gameSecondsToFrames(10);

const burstUps = (team: TeamInput) =>
  piecesOf(planTeamRun(team)).filter(
    (p) => p.sourceSlotIndex === team.slots.length - 1 && p.effect.source.skill === 'burst',
  );
const codes = (team: TeamInput) => runSimulation(team).slots[team.slots.length - 1]!.notes.map((n) => n.code);

describe('リリー単騎（撮影 A）', () => {
  it('has no burst, so no attack up from the burst', () => {
    expect(planTeamRun(SOLO).schedule!.activations).toEqual([]);
    expect(burstUps(SOLO)).toEqual([]);
    expect(codes(SOLO)).not.toContain('random-allies-expected');
  });
});

describe('ルドミラ + リリー（撮影 B）', () => {
  const plan = planTeamRun(DUO);
  const lilyBursts = plan.schedule!.activations.filter((a) => a.slotIndex === 1);
  const ups = burstUps(DUO);

  it('gives half the value to each of the 2 allies (expected value), for 10 s from each burst of Lily', () => {
    expect(lilyBursts.length).toBeGreaterThan(1);
    for (const slot of [0, 1]) {
      const mine = ups.filter((p) => p.slotIndex === slot);
      expect(mine).toHaveLength(lilyBursts.length);
      expect(mine.every((p) => p.end - p.start === TEN_SECONDS)).toBe(true);
      mine.forEach((p) => expect(p.effect.value).toBeCloseTo(0.2, 12));
    }
    expect(codes(DUO)).toContain('random-allies-expected');
  });

  it('gives the whole value only to randomTargetSlot when it is given', () => {
    const pinned = burstUps({ ...DUO, randomTargetSlot: 0 });
    expect(new Set(pinned.map((p) => p.slotIndex))).toEqual(new Set([0]));
    pinned.forEach((p) => expect(p.effect.value).toBeCloseTo(0.4, 12));
  });
});
