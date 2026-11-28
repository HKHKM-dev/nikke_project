// アビスタ編（V-0887）: アビスタ（441）を含む編成で、バースト再突入 1 段階とスターゲイザー、S2 のフルバーストの発動の時の
// 自分のアイドル（アニス：スター）への▲（フルバーストの終わりまで）、S1 のフルバーストの終わりのアフターショー（次のフルバーストの発動で解除）と
// スターゲイザーの解除が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const ABYSSTA = 441;
const ANIS_STAR = 17;
const DELTA = 20;
const ALICE = 191;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

const TEAMS: Record<string, TeamInput> = {
  'アビスタ + アニス：スター + デルタ + アリス（録画 1425 の編成）': fixedTeam(
    [ABYSSTA, ANIS_STAR, DELTA, ALICE].map(autoSlot),
    1,
    {
      enemy: rangeEnemy,
    },
  ),
  // クラウン（II）・クロウ（III）・アリス（III）
  '実戦寄り（アビスタ + アニス：スター + クラウン + クロウ + アリス）': fixedTeam(
    [ABYSSTA, ANIS_STAR, 330, 110, ALICE],
    1,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const slotOf = (id: number) => input.slots.findIndex((x) => x?.character.resourceId === id);
  const a = slotOf(ABYSSTA);
  const idol = slotOf(ANIS_STAR);
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations;
  const windows = plan.schedule!.fullBurstWindows.filter((w) => w.start < plan.frames);
  const fromAbyssta = (filter: Parameters<typeof itemsOf>[1]) =>
    itemsOf(plan.history, { sourceSlotIndex: a, ...filter });
  const stargazerAt = (f: number) =>
    fromAbyssta({ holder: a, kind: 'state', state: 'stargazer' }).some((w) => w.start <= f && f < w.end);

  it('re-enters Burst I: another Burst I slot fires right after her in the same chain', () => {
    const mine = activations.filter((x) => x.slotIndex === a);
    expect(mine.length).toBeGreaterThan(3);
    for (const x of mine) {
      const next = activations[activations.indexOf(x) + 1];
      if (next === undefined) continue;
      expect(next.step).toBe('Step1');
      expect(next.slotIndex).not.toBe(a);
    }
  });

  it('puts Stargazer on herself at each Burst and removes it on the frame after a Full Burst ends', () => {
    const stargazer = fromAbyssta({ kind: 'state', state: 'stargazer' });
    expect(new Set(stargazer.map((w) => w.holder))).toEqual(new Set([a]));
    const mine = activations.filter((x) => x.slotIndex === a).map(effectFrameOf);
    for (const f of mine.filter((x) => x < plan.frames)) expect(stargazerAt(f)).toBe(true);
    for (const w of windows.filter((x) => x.end < plan.frames)) {
      expect(stargazerAt(w.end)).toBe(true);
      expect(stargazerAt(w.end + 1)).toBe(false);
    }
  });

  it('gives only Anis: Star projectile explosion damage and attack damage up at each Full Burst entry in Stargazer, until that Full Burst ends', () => {
    const inStargazer = windows.filter((w) => stargazerAt(w.start));
    expect(inStargazer.length).toBeGreaterThan(2);
    for (const stat of ['projectileExplosionDamage', 'attackDamage'] as const) {
      const up = fromAbyssta({ kind: 'timed', skill: 'skill2', stat });
      expect(new Set(up.map((w) => w.holder))).toEqual(new Set([idol]));
      expect(up.map((w) => [w.start, w.end])).toEqual(inStargazer.map((w) => [w.start, Math.min(w.end, plan.frames)]));
    }
  });

  it('gives only Anis: Star Aftershow at each Full Burst end, removed on the frame after the next Full Burst entry', () => {
    const aftershow = fromAbyssta({ kind: 'state', state: 'aftershow' });
    expect(new Set(aftershow.map((w) => w.holder))).toEqual(new Set([idol]));
    const ends = windows.map((w) => w.end).filter((f) => f < plan.frames);
    expect(aftershow.map((w) => w.start)).toEqual(ends);
    for (const w of aftershow) {
      const next = windows.find((x) => x.start > w.start);
      if (next === undefined) expect(w.end).toBeGreaterThanOrEqual(plan.frames);
      else expect(w.end).toBe(next.start + 1);
    }
  });
});

describe('アニス：スターのいない編成（アビスタ + I-DOLL・フラワー + クラウン + クロウ + アリス）', () => {
  const input = fixedTeam([ABYSSTA, 304, 330, 110, ALICE], 1);
  const plan = planTeamRun(input);

  it('gives nobody the effects on her favorite pop star', () => {
    expect(plan.schedule!.fullBurstWindows.length).toBeGreaterThan(2);
    expect(itemsOf(plan.history, { sourceSlotIndex: 0, kind: 'state', state: 'aftershow' })).toEqual([]);
    expect(itemsOf(plan.history, { sourceSlotIndex: 0, kind: 'timed', skill: 'skill2' })).toEqual([]);
  });
});

describeEveryShotInOneGroup(TEAMS);
