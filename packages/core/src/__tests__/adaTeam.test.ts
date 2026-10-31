// エイダ（840）を含む編成（2 段目の段 15 の PR 3。plan/design-skill-stage15.md 2.3 節。V-0569）。語彙と単騎の動きは
// skills/__tests__/stage15Ada.test.ts。ここでは味方と組んだ時に:
// S1: フルバーストの始まりに、直前にバーストを使った III（エイダ自身とは限らない）に攻撃力▲・防御力無視ダメージ▲（10 秒。C-0784）。
// S2: 閃光手榴弾投擲はフルバーストの中だけ（周期 2 秒。自分のバーストの後の 10 秒は 1 秒。C-0787・C-0788）。ヒットは周期の遅れの後。
// 射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { GAME_SECONDS_PER_FRAME } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  rawDefinition,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const ADA = 840;
const SWHA = 471;

const TEAMS = {
  単騎: fixedTeam([ADA], 0),
  'リター + デルタ + エイダ': fixedTeam([82, 20, ADA], 2),
  // エイダはバーストを使わず、III はスノーホワイト：ヘビーアームズだけ
  'リター + デルタ + エイダ + スノーホワイト：ヘビーアームズ（エイダはバーストなし）': fixedTeam(
    [82, 20, ADA, SWHA],
    3,
    {
      noBurstSlots: [2],
    },
  ),
};

type Plan = ReturnType<typeof planTeamRun>;
const s1Windows = (plan: Plan, slot: number, stat: string) =>
  effectWindows(plan, slot, { resourceId: ADA, skill: 'skill1', stat });
const fromFullBurstStarts = (plan: Plan) =>
  windowsFrom(
    plan.schedule!.fullBurstWindows.map((w) => w.start),
    10,
    plan.frames,
  );
// S2 の周期の効果（周期の秒・ヒットの遅れ）
const s2 = rawDefinition<{
  skills: { skill2: { effects: { trigger: { everySeconds: number }; delayFrames: number }[] } };
}>(ADA).skills.skill2.effects[0]!;
/** 周期 seconds 秒の刻みの間隔（端数を持ち越すので、切り捨てか切り上げのフレーム数） */
const stepsOf = (seconds: number) => [
  Math.floor(seconds / GAME_SECONDS_PER_FRAME),
  Math.ceil(seconds / GAME_SECONDS_PER_FRAME),
];
const s2Hits = (plan: Plan) =>
  plan.skillHits.filter((h) => h.effect.source.resourceId === ADA && h.effect.source.skill === 'skill2');
/** S2 のヒットの、周期のフレーム（ヒットの遅れの前）のフルバーストの窓ごとの並び */
const s2TicksByWindow = (plan: Plan) =>
  plan.schedule!.fullBurstWindows.map((w) =>
    s2Hits(plan)
      .map((h) => h.frame - s2.delayFrames)
      .filter((f) => w.start <= f && f < w.end),
  );
const expectSteps = (plan: Plan, seconds: number) => {
  for (const window of s2TicksByWindow(plan)) {
    expect(window.length).toBeGreaterThan(1);
    for (let k = 1; k < window.length; k++) expect(stepsOf(seconds)).toContain(window[k]! - window[k - 1]!);
  }
};

describe('リター + デルタ + エイダ', () => {
  const plan = planTeamRun(TEAMS['リター + デルタ + エイダ']);

  it.each(['attack', 'trueDamage'])(
    'gives the S1 %s to herself (the III who used the burst) from every Full Burst start',
    (stat) => {
      expect(plan.schedule!.fullBurstWindows.length).toBeGreaterThan(2);
      expect(s1Windows(plan, 2, stat)).toEqual(fromFullBurstStarts(plan));
      for (const slot of [0, 1]) expect(s1Windows(plan, slot, stat)).toEqual([]);
    },
  );

  it('throws Flash Grenades only inside Full Burst, every 1 s after her own burst', () => {
    expect(s2TicksByWindow(plan).flat()).toHaveLength(s2Hits(plan).length);
    // フルバースト（10 秒）は、どれも自分のバーストの後の短縮の窓（10 秒）の中。短縮の秒は S2 の値 03
    expectSteps(plan, s2.trigger.everySeconds - skillValueOf(ADA, 'skill2', 3));
  });
});

describe('リター + デルタ + エイダ + スノーホワイト：ヘビーアームズ（エイダはバーストなし）', () => {
  const plan = planTeamRun(TEAMS['リター + デルタ + エイダ + スノーホワイト：ヘビーアームズ（エイダはバーストなし）']);

  it.each(['attack', 'trueDamage'])('gives the S1 %s to the III who used the burst, not to Ada', (stat) => {
    expect(plan.schedule!.activations.some((a) => a.slotIndex === 2)).toBe(false);
    expect(plan.schedule!.fullBurstWindows.length).toBeGreaterThan(2);
    expect(s1Windows(plan, 3, stat)).toEqual(fromFullBurstStarts(plan));
    for (const slot of [0, 1, 2]) expect(s1Windows(plan, slot, stat)).toEqual([]);
  });

  it('throws Flash Grenades every 2 s inside Full Burst without her own burst', () => {
    expectSteps(plan, s2.trigger.everySeconds);
  });
});

describeEveryShotInOneGroup(TEAMS);
