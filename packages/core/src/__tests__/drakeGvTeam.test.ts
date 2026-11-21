// ドレイク：グレイトヴィラン編（plan/design-drake-gv.md）: ドレイク：グレイトヴィラン（104）を含む編成で、S1 の使用武器変更（オーバーオーバードライブ）が
// フルバーストの始まりに付いて撃ち切りで終わり（的のジャンプでハイドしても込め直さない）、終わるフレームに残弾数 100% 低下が元の SG に起きること、S2 の最大HP のみ▲ が
// フルバーストの終わりごとに 1 スタック足されて 4 で止まり、遅刻の攻撃力▲がその最終最大HP を追うこと、バーストスキルダメージが 1 ヒットで
// 出ることを見る（C-1427〜C-1430）。射撃の列のグループ分け
import { describe, expect, it } from 'vitest';
import { hitFramesOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const DRAKE_GV = 104;
const SHOTS = 6;
const MAX_HP_ONLY = 0.105;
const LATE = 0.0623;

/** 撮影の編成。ドレイク：グレイトヴィランは 3 枠目（操作） */
function rangeTeam(ids: readonly number[]): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemyWithEvents() });
}

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ココア + ソルジャーF.A. + ドレイク：グレイトヴィラン）': rangeTeam([311, 301, DRAKE_GV]),
  '実戦寄り（リター + クラウン + ドレイク：グレイトヴィラン + 紅蓮 + ソルジャーE.G.）': fixedTeam(
    [82, 330, DRAKE_GV, 222, 300],
    2,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const d = input.slots.findIndex((s) => s?.character.resourceId === DRAKE_GV);
  const plan = planTeamRun(input);
  const windows = plan.schedule!.fullBurstWindows;
  const changeShots = plan.shots[d]!.weaponChangeShotFrames ?? [];
  const ends = (plan.shots[d]!.weaponChangeEnds ?? []).filter((f) => f < plan.frames);
  // 変更ごとの発（前の変更の終わりから、その変更の終わりまで）
  const runs = ends.map((e, k) => changeShots.filter((f) => f >= (ends[k - 1] ?? 0) && f < e));

  it('switches to Over Overdrive at each Full Burst start and returns after the last shot', () => {
    expect(windows.length).toBeGreaterThanOrEqual(2);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    runs.forEach((run, k) => {
      // 最初の発は窓が射手に見えてから 112f（firstShotDelayFrames）。戻るのは最後の発の次のフレーム
      expect(run[0]! - windows[k]!.start).toBe(113);
      expect(ends[k]).toBe(run.at(-1)! + 1);
      // 味方の最大装弾数▲が無ければ 6 発（的のジャンプでハイドしても込め直さない）
      if (input.slots.every((s) => s === null || [311, 301, DRAKE_GV].includes(s.character.resourceId)))
        expect(run).toHaveLength(SHOTS);
      else expect(run.length).toBeGreaterThanOrEqual(SHOTS);
    });
  });

  it('empties the base SG on the frame the change ends', () => {
    const decreases = plan.instants
      .filter((a) => a.slotIndex === d && a.effect.kind === 'ammoDecrease')
      .map((a) => a.frame);
    expect(decreases).toEqual(ends);
  });

  it('adds one max HP only stack at each Full Burst end up to four, and the Late ATK increase follows', () => {
    const stacks = itemsOf(plan.history, { holder: d, kind: 'timed', skill: 'skill2', stat: 'maxHpOnly' });
    const fbEnds = windows.map((w) => w.end).filter((f) => f < plan.frames);
    expect(stacks.length).toBeGreaterThan(0);
    expect([...new Set(stacks.map((w) => w.start))].sort((a, b) => a - b)).toEqual(fbEnds.slice(0, 4));
    const sim = runSimulation(input);
    const lateAt = (f: number) =>
      sim.slots[d]!.segments.find((g) => g.start <= f && f < g.end)!.buffs.attackParts.find(
        (x) => x.source === '104.skill2',
      )!.flat;
    // 戦闘開始の▲から、枠のバフ前の最大HP を逆に出す（スタックの無い間の値）
    const hp = lateAt(0) / LATE;
    expect(hp).toBeGreaterThan(1_000_000);
    fbEnds.slice(0, 4).forEach((f, k) => {
      expect(lateAt(f + 1)).toBeCloseTo(hp * (1 + MAX_HP_ONLY * (k + 1)) * LATE, 3);
    });
  });

  it('hits the Burst skill damage once per Burst', () => {
    const mine = plan.schedule!.activations.filter((a) => a.slotIndex === d);
    expect(mine.length).toBeGreaterThan(0);
    for (const a of mine) expect(hitFramesOf(a)).toHaveLength(1);
  });
});

describeEveryShotInOneGroup(TEAMS);
