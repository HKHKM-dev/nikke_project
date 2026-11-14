// リバーレリオ（262。V-0780）を含む編成: S2 の激流（最初のフルチャージの発の次のフレームから戦闘の終わりまで。C-1237）、S1 のコア命中の
// 攻撃ダメージ▲（C-1237）、フルチャージの発ごとの 12・18・24・30・36f 後の 5 ヒットの追加ダメージ（C-1238）、フルバーストの入りからの
// 攻撃力▲（3 秒）・バーストの攻撃ダメージ▲（10 秒。C-1241）と、発動の 60f 後のバーストの追加ダメージ（C-1240）。射撃の列のグループ分け
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, skillValueOf, windowsFrom } from './teamHelpers.ts';

const LIBERALIO = 262;
const COCOA = 311;
const SOLDIER_FA = 301;
const ADDITIONAL_DELAYS = [12, 18, 24, 30, 36];
const BURST_HIT_DELAY = 60;

const TEAMS = {
  単騎: fixedTeam([LIBERALIO], 0),
  'ココア + ソルジャーF.A. + リバーレリオ（操作。撮影の編成）': fixedTeam([COCOA, SOLDIER_FA, LIBERALIO], 2),
};

type Plan = ReturnType<typeof planTeamRun>;
const windowsOf = (plan: Plan, slot: number, skill: string, stat: string) =>
  effectWindows(plan, slot, { resourceId: LIBERALIO, skill, stat });

const { 単騎: SOLO, ...WITH_BURST } = TEAMS;

describe('単騎', () => {
  it('never enters Full Burst (a lone Burst III), so the S1 attack up never applies', () => {
    const plan = planTeamRun(SOLO);
    expect(plan.schedule?.fullBurstWindows ?? []).toEqual([]);
    expect(windowsOf(plan, 0, 'skill1', 'attack')).toEqual([]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === LIBERALIO);
  const plan = planTeamRun(input);
  const shots = plan.shots[s]!.frames;

  it('gives Raging Current and the S1 core-hit attack damage up from the frame after the first shot', () => {
    expect(shots.length).toBeGreaterThan(50);
    expect(windowsOf(plan, s, 'skill2', 'attackDamage')).toEqual([{ start: shots[0]! + 1, end: plan.frames }]);
    // 射撃場の的のコア命中率は 1 なので、どの発でも付き直し、60 秒は切れない
    expect(windowsOf(plan, s, 'skill1', 'attackDamage')).toEqual([{ start: shots[0]! + 1, end: plan.frames }]);
  });

  it('fires the S1 additional damage 5 times after every shot, 6 f apart', () => {
    const hits = plan.skillHits
      .filter((h) => h.slotIndex === s && h.effect.source.skill === 'skill1')
      .map((h) => h.frame)
      .sort((a, b) => a - b);
    const expected = shots
      .flatMap((f) => ADDITIONAL_DELAYS.map((d) => f + d))
      .filter((f) => f < plan.frames)
      .sort((a, b) => a - b);
    expect(hits).toEqual(expected);
  });
});

describe.each(Object.entries(WITH_BURST))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === LIBERALIO);
  const plan = planTeamRun(input);

  it('gives the S1 attack up for 3 s from every Full Burst start, the burst attack damage up for 10 s and the burst hit 60 f after use', () => {
    const fullBursts = plan.schedule?.fullBurstWindows ?? [];
    const uses = (plan.schedule?.activations ?? []).filter((a) => a.slotIndex === s).map((a) => a.frame);
    expect(fullBursts.length).toBeGreaterThan(3);
    expect(windowsOf(plan, s, 'skill1', 'attack')).toEqual(
      windowsFrom(
        fullBursts.map((w) => w.start),
        skillValueOf(LIBERALIO, 'skill1', 2),
        plan.frames,
      ),
    );
    expect(windowsOf(plan, s, 'burst', 'attackDamage')).toEqual(
      windowsFrom(uses, skillValueOf(LIBERALIO, 'burst', 2), plan.frames),
    );
    const burstHits = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'burst');
    expect(burstHits.map((h) => h.frame)).toEqual(uses.map((u) => u + BURST_HIT_DELAY));
  });
});

describeEveryShotInOneGroup(TEAMS);
