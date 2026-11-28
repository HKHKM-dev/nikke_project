// シラツル編（V-0899）: シラツル（620）を含む編成で、バーストの自分への貫通特化（10 秒。C-1621）と味方全体の回復、S2 のフルチャージ 3 回ごとの
// 味方全体の回復（C-1622）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { healsOf } from './historyHelpers.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const SHIRATSURU = 620;
const ZWEI = 390;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ element: 'Iron' });

const autoSlot = (id: number): TeamSlotInput =>
  fixedSlot(id, { conditionMode: 'auto', ...(id === ZWEI ? { treasurePhase: 3 } : {}) });

const TEAMS: Record<string, TeamInput> = {
  'ツバイ + シラツル（V-0899 の撮影の編成）': fixedTeam([ZWEI, SHIRATSURU].map(autoSlot), 1, { enemy: rangeEnemy }),
  // ツバイ（I）・エード：エージェントバニー（II）・アリス（III）・アスカ（III）
  '実戦寄り（ツバイ + シラツル + エード：EB + アリス + アスカ）': fixedTeam([ZWEI, SHIRATSURU, 315, 191, 830], 3),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === SHIRATSURU);
  const allies = input.slots.flatMap((x, i) => (x === null || x === undefined ? [] : [i]));
  const plan = planTeamRun(input);
  const uses = plan
    .schedule!.activations.filter((a) => a.slotIndex === s)
    .map(effectFrameOf)
    .filter((f) => f < plan.frames);
  const heals = healsOf(plan).filter((h) => h.sourceSlotIndex === s);

  it('gives Pierce only to Snow Crane for 10 s from each Burst', () => {
    expect(uses.length).toBeGreaterThan(2);
    const pierce = itemsOf(plan.history, { sourceSlotIndex: s, kind: 'timed', skill: 'burst', stat: 'pierce' });
    expect(new Set(pierce.map((w) => w.holder))).toEqual(new Set([s]));
    expect(pierce.map((w) => [w.start, w.end])).toEqual(
      uses.map((f) => [f, Math.min(f + gameSecondsToFrames(10), plan.frames)]),
    );
  });

  it('heals every ally at each Burst and on every 3rd full-charge shot', () => {
    const log = plan.shots[s]!;
    const partial = new Set((log.partialShots ?? []).map((p) => p.frame));
    const fullCharge = log.frames.filter((f) => !partial.has(f));
    const third = fullCharge.filter((f, k) => (k + 1) % 3 === 0 && f + 1 < plan.frames);
    expect(third.length).toBeGreaterThan(10);
    // 射撃の回数起点の回復は、後ろの枠には発と同じフレーム、自分と前の枠には次のフレーム（skills/heals.ts の healFrameOf）
    const expected = [
      ...uses.flatMap((f) => allies.map((slotIndex) => ({ frame: f, slotIndex }))),
      ...third.flatMap((f) => allies.map((slotIndex) => ({ frame: slotIndex > s ? f : f + 1, slotIndex }))),
    ];
    const key = (h: { frame: number; slotIndex: number }) => `${h.frame}:${h.slotIndex}`;
    expect(heals.map(key).sort()).toEqual(expected.map(key).sort());
  });
});
