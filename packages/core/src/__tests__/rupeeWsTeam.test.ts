// ルピー：ウィンターショッパー編（plan/design-rupee-ws.md。V-0881）: ルピー：ウィンターショッパー（203）を含む編成で、S2 の味方の
// バーストのたびのショッピングのスタックと、フルバーストの終わりのフルスタックならのゲージ速度▲、バーストのリロード速度▲と
// バースト再突入 1 段階が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const RUPEE_WS = 203;
const PRODUCT08 = 302;
const DELTA = 20;
const ALICE = 191;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

const TEAMS: Record<string, TeamInput> = {
  'ルピー：ウィンターショッパー + プロダクト08 + デルタ + アリス（撮影の編成）': fixedTeam(
    [RUPEE_WS, PRODUCT08, DELTA, ALICE].map(autoSlot),
    0,
    { enemy: rangeEnemy },
  ),
  // I-DOLL・フラワー（I）・クラウン（II）・クロウ（III）。クラウンの S1 のリロード速度▲と重なる
  '実戦寄り（ルピー：ウィンターショッパー + I-DOLL・フラワー + クラウン + クロウ + アリス）': fixedTeam(
    [RUPEE_WS, 304, 330, 110, ALICE],
    1,
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const r = input.slots.findIndex((x) => x?.character.resourceId === RUPEE_WS);
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations;
  const effectFrames = [...new Set(activations.map(effectFrameOf))].sort((a, b) => a - b);
  const shopping = (holder: number) =>
    itemsOf(plan.history, { sourceSlotIndex: r, holder, kind: 'state', state: 'shopping' });
  const stackAt = (holder: number, f: number) =>
    Math.max(
      0,
      ...shopping(holder)
        .filter((w) => w.start <= f && f < w.end)
        .map((w) => w.stack ?? 1),
    );

  it('re-enters Burst I: another Burst I slot fires right after her in the same chain', () => {
    const mine = activations.filter((a) => a.slotIndex === r);
    expect(mine.length).toBeGreaterThan(3);
    for (const a of mine) {
      const next = activations[activations.indexOf(a) + 1];
      expect(next?.step).toBe('Step1');
      expect(next?.slotIndex).not.toBe(r);
    }
  });

  it('adds a Shopping stack to every ally on the effect frame of every Burst, her own included (capped at 4)', () => {
    for (const holder of input.slots.keys()) {
      // 段が変わるのはバーストの効果のフレームだけ。フルスタックの付与は維持を付け直すだけで、新しい段を作らない
      for (const w of shopping(holder)) expect(effectFrames).toContain(w.start);
      for (const f of effectFrames.filter((x) => x < plan.frames))
        expect(stackAt(holder, f)).toBe(Math.min(stackAt(holder, f - 1) + 1, 4));
      expect(Math.max(...shopping(holder).map((w) => w.stack ?? 1))).toBe(4);
    }
    // 1 回目のチェーンの発動ごとに 1 段ずつ上がる
    effectFrames.slice(0, 4).forEach((f, i) => expect(stackAt(r, f)).toBe(i + 1));
  });

  it('gives every ally gauge speed up for 5 s at each Full Burst end at which she is at full Shopping', () => {
    const ends = plan.schedule!.fullBurstWindows.map((w) => w.end).filter((f) => f < plan.frames);
    expect(ends.length).toBeGreaterThan(2);
    const full = ends.filter((f) => stackAt(r, f) === 4);
    expect(full).toEqual(ends);
    for (const holder of input.slots.keys()) {
      const up = itemsOf(plan.history, {
        sourceSlotIndex: r,
        holder,
        kind: 'timed',
        skill: 'skill2',
        stat: 'burstGaugeSpeed',
      });
      expect(up.map((w) => w.start)).toEqual(full);
      for (const w of up) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
    }
  });

  it('gives every ally reload speed up for 10 s on each of her Bursts', () => {
    const mine = activations.filter((a) => a.slotIndex === r).map(effectFrameOf);
    for (const holder of input.slots.keys()) {
      const up = itemsOf(plan.history, {
        sourceSlotIndex: r,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'reloadSpeed',
      });
      expect(up.map((w) => w.start)).toEqual(mine.filter((f) => f < plan.frames));
      for (const w of up) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });
});
