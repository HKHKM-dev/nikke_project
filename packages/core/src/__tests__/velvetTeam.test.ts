// ベルベット（316）を含む編成（plan/design-velvet.md）。語彙と単騎の S1 は skills/__tests__/velvet.test.ts。ここでは味方と組んだ時に:
// S1: フルバーストの外のフルチャージだけで起き、S2: フルバーストの中のフルチャージと 50 回の命中だけで起きる。弾丸ポーチはバースト 2 段階
// 突入時に満タンに戻る。バースト: 10 秒の使用武器変更（発動の 12f 後から 1 フレーム 1 発。V-0767）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { isInFullBurst } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, rawDefinition, skillValueOf } from './teamHelpers.ts';

const VELVET = 316;

const TEAMS = {
  単騎: fixedTeam([VELVET], 0, { burst: false }),
  'プロダクト08 + ベルベット + アリス': fixedTeam([302, VELVET, 191], 2),
  // ベルベットはバーストを使わず、II はグレイブだけ（撮影 C）
  'プロダクト08 + グレイブ + ベルベット + アリス（ベルベットはバーストなし）': fixedTeam([302, 514, VELVET, 191], 2, {
    noBurstSlots: [2],
  }),
};

/**
 * 枠 v が受けるベルベットの skill の stat の窓が、どれもベルベットの発の次のフレームに始まり、その発がフルバーストの中（inFullBurst）か
 * 外かを確かめる
 */
function expectFiredOnShots(
  plan: ReturnType<typeof planTeamRun>,
  v: number,
  skill: string,
  stat: string,
  inFullBurst: boolean,
): void {
  const windows = effectWindows(plan, v, { resourceId: VELVET, skill, stat });
  expect(windows.length).toBeGreaterThan(0);
  for (const w of windows) {
    expect(plan.shots[v]!.frames).toContain(w.start - 1);
    expect(isInFullBurst(plan.schedule!, w.start - 1)).toBe(inFullBurst);
  }
}

describe('プロダクト08 + ベルベット + アリス', () => {
  const v = 1;
  const plan = planTeamRun(TEAMS['プロダクト08 + ベルベット + アリス']);
  const shots = plan.shots[v]!.frames;
  const fullBursts = plan.schedule!.fullBurstWindows;
  const hits = plan.skillHits.filter((h) => h.effect.source.resourceId === VELVET);

  it('gives the S1 up only from full charges outside Full Burst', () => {
    for (const stat of ['attack', 'attackDamage']) expectFiredOnShots(plan, v, 'skill1', stat, false);
  });

  it('fires the S2 additional damage every 50 hits inside Full Burst only, 10 or more times in each Full Burst (refill at stage 2)', () => {
    const every = skillValueOf(VELVET, 'skill2', 6);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => isInFullBurst(plan.schedule!, h.frame))).toBe(true);
    const perFullBurst = fullBursts.map((w) => hits.filter((h) => w.start <= h.frame && h.frame < w.end));
    // 回数は 50 の倍数の位相で 10〜12 回に揺れる。補充が無ければ、2 回目からのフルバーストはポーチが尽きて 3 回以下になる
    expect(perFullBurst.every((hs) => hs.length >= 10)).toBe(true);
    for (const hs of perFullBurst) {
      for (let k = 1; k < hs.length; k++) {
        expect(countShotsInRanges(shots, [{ start: hs[k - 1]!.frame + 1, end: hs[k]!.frame + 1 }])).toBe(every);
      }
    }
  });

  it('fires one shot per frame for 10 s from 12 frames after her burst (weapon change. V-0767)', () => {
    const changed = plan.shots[v]!.weaponChangeShotFrames ?? [];
    const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === v);
    const duration = gameSecondsToFrames(skillValueOf(VELVET, 'burst', 2));
    const delay = rawDefinition<{ skills: { burst: { effects: { firstShotDelayFrames?: number }[] } } }>(VELVET).skills
      .burst.effects[0]!.firstShotDelayFrames!;
    expect(bursts.length).toBeGreaterThan(0);
    for (const b of bursts) {
      const own = changed.filter((f) => b.frame <= f && f < b.frame + duration);
      expect(own[0]).toBe(b.frame + 1 + delay);
      expect(own.length).toBeGreaterThan(duration - delay - 5);
      own.slice(1).forEach((f, k) => expect(f - own[k]!).toBe(1));
    }
  });
});

describe('プロダクト08 + グレイブ + ベルベット + アリス（ベルベットはバーストなし）', () => {
  const v = 2;
  const input = TEAMS['プロダクト08 + グレイブ + ベルベット + アリス（ベルベットはバーストなし）'];
  const plan = planTeamRun(input);

  it('does not use her burst', () => {
    expect(plan.schedule!.activations.filter((a) => a.slotIndex === v)).toEqual([]);
    expect(plan.schedule!.fullBurstWindows.length).toBeGreaterThan(0);
  });

  it('gives the S2 ups to all allies from her full charges inside Full Burst only', () => {
    for (const stat of ['attack', 'chargeDamage']) {
      expectFiredOnShots(plan, v, 'skill2', stat, true);
      const own = effectWindows(plan, v, { resourceId: VELVET, skill: 'skill2', stat });
      input.slots.forEach((_, i) =>
        expect(effectWindows(plan, i, { resourceId: VELVET, skill: 'skill2', stat })).toEqual(own),
      );
    }
  });

  it('gives the S1 up only from full charges outside Full Burst', () => {
    expectFiredOnShots(plan, v, 'skill1', 'attack', false);
  });
});

describeEveryShotInOneGroup(TEAMS);
