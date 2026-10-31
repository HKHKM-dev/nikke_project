// スノーホワイト：ヘビーアームズ（471）を含む編成（2 段目の段 14。plan/design-skill-stage14.md）。定義・単騎とリター + デルタの編成の
// 細かい動き（オートファイア・七つの小人：フルアクティブ）は skills/__tests__/stage14SnowWhiteHa.test.ts。ここでは味方と組んだ時に:
// S1: チャージの 0.2 秒ごとに付く受けるダメージ▲は敵の件なので、どの味方の区間にも乗る（C-0758）。
// バースト: 自分の攻撃ダメージ▲（10 秒）は、使うたびに付く（C-0762）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { effectWindows, expectEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const SWHA = 471;

const TEAMS = {
  '単騎（バーストなし）': fixedTeam([SWHA], 0, { burst: false }),
  'リター + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([82, 20, SWHA], 2),
  'ミルク + デルタ + スノーホワイト：ヘビーアームズ': fixedTeam([141, 20, SWHA], 2),
};

describe('ミルク + デルタ + スノーホワイト：ヘビーアームズ', () => {
  const plan = planTeamRun(TEAMS['ミルク + デルタ + スノーホワイト：ヘビーアームズ']);
  const fromSwha = (skill: string, stat: string) => (slot: number) =>
    effectWindows(
      plan,
      slot,
      (p) => p.effect.source.resourceId === SWHA && p.effect.source.skill === skill && p.effect.stat === stat,
    );

  it('puts the S1 damage taken increase on every ally, from the first charge tick to the end of the battle', () => {
    const own = fromSwha('skill1', 'damageTaken')(2);
    expect(own).toHaveLength(1);
    // 最初のチャージの刻み（最初の発より前）から、チャージが続くかぎり切れない
    expect(own[0]!.start).toBeGreaterThan(0);
    expect(own[0]!.start).toBeLessThan(plan.shots[2]!.frames[0]!);
    expect(own[0]!.end).toBe(plan.frames);
    for (const slot of [0, 1]) expect(fromSwha('skill1', 'damageTaken')(slot)).toEqual(own);
  });

  it('raises her own attack damage for 10 s from every burst use, and not the allies', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 2);
    expect(uses.length).toBeGreaterThan(2);
    expect(fromSwha('burst', 'attackDamage')(2)).toEqual(
      uses.map((a) => ({ start: a.frame, end: Math.min(a.frame + gameSecondsToFrames(10), plan.frames) })),
    );
    for (const slot of [0, 1]) expect(fromSwha('burst', 'attackDamage')(slot)).toEqual([]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    expectEveryShotInOneGroup(input, planTeamRun(input));
  });
});
