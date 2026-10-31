// エイダ（840）を含む編成（2 段目の段 15 の PR 3。plan/design-skill-stage15.md 2.3 節。V-0569）。語彙と単騎の動きは
// skills/__tests__/stage15Ada.test.ts。ここでは味方と組んだ時に:
// S1: フルバーストの始まりに、直前にバーストを使った III（エイダ自身とは限らない）に攻撃力▲・防御力無視ダメージ▲（10 秒。C-0784）。
// S2: 閃光手榴弾投擲はフルバーストの中だけ（周期 2 秒。自分のバーストの後の 10 秒は 1 秒。C-0787・C-0788）。ヒットは周期の 6f 後。
// 射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { effectWindows, expectEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

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
  effectWindows(
    plan,
    slot,
    (p) => p.effect.source.resourceId === ADA && p.effect.source.skill === 'skill1' && p.effect.stat === stat,
  );
const fromFullBurstStarts = (plan: Plan) =>
  plan.schedule!.fullBurstWindows.map((w) => ({
    start: w.start,
    end: Math.min(w.start + gameSecondsToFrames(10), plan.frames),
  }));
/** S2 のヒットの、周期のフレーム（ヒットの 6f 前）のフルバーストの窓ごとの並び */
const s2TicksByWindow = (plan: Plan) =>
  plan.schedule!.fullBurstWindows.map((w) =>
    plan.skillHits
      .filter((h) => h.effect.source.resourceId === ADA && h.effect.source.skill === 'skill2')
      .map((h) => h.frame - 6)
      .filter((f) => w.start <= f && f < w.end),
  );

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
    const hits = plan.skillHits.filter((h) => h.effect.source.resourceId === ADA && h.effect.source.skill === 'skill2');
    const ticks = s2TicksByWindow(plan);
    expect(ticks.flat()).toHaveLength(hits.length);
    for (const window of ticks) {
      expect(window.length).toBeGreaterThan(1);
      for (let k = 1; k < window.length; k++) expect([58, 59]).toContain(window[k]! - window[k - 1]!);
    }
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
    for (const window of s2TicksByWindow(plan)) {
      expect(window.length).toBeGreaterThan(1);
      for (let k = 1; k < window.length; k++) expect([117, 118]).toContain(window[k]! - window[k - 1]!);
    }
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    expectEveryShotInOneGroup(input, planTeamRun(input));
  });
});
