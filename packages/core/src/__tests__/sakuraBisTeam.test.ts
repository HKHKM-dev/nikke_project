// サクラ：ブルーム・イン・サマー編（plan/design-sakura-bis.md）: サクラ：ブルーム・イン・サマー（284）を含む編成で、S2 のクールタイムごとの
// 花の舞（攻撃ダメージ▲）と桜かんむり（クールタイムの印のある dot）、S1 の戦闘開始時の強制使用、バーストのヒットごとにスタックする
// 持続ダメージ（dot の perBurstHit）が意図どおりに出るか（V-0884）
import { describe, expect, it } from 'vitest';
import { hitFramesOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { dotTickFrames } from '../frame/dot.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { gameSecondsToFirstFrame } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const SAKURA_BIS = 284;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

/** 撮影の編成（ココア + ソルジャーF.A. + サクラ：ブルーム・イン・サマー（操作））。サクラは 3 枠目 */
function rangeTeam(): TeamInput {
  const slots = [311, 301, SAKURA_BIS].map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemy });
}

const CASES: Record<string, TeamInput> = {
  撮影の編成: rangeTeam(),
  '実戦寄り（リター + ドレイク + サクラ：ブルーム・イン・サマー + アリス + クラウン）': fixedTeam(
    [82, 101, SAKURA_BIS, 191, 330],
    2,
  ),
};
const S = 2;
/** 定義の S2 のクールタイム（録画で読んだ 30 秒）。発動は時刻に達した最初のフレーム */
const S2_PERIOD = gameSecondsToFirstFrame(30);

describe.each(Object.entries(CASES))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const hitsOf = (skill: string) =>
    plan.skillHits.filter((h) => h.slotIndex === S && h.effect.source.skill === skill && h.effect.dot !== undefined);
  const activations = plan.schedule!.activations.filter((a) => a.slotIndex === S);

  it('applies Dancing Flower at the start of battle and every cooldown', () => {
    const items = itemsOf(plan.history, {
      sourceSlotIndex: S,
      holder: S,
      kind: 'timed',
      skill: 'skill2',
      stat: 'attackDamage',
    });
    const starts = [...new Set(items.map((w) => w.start))].sort((a, b) => a - b);
    // 戦闘開始時の強制使用は 0 から、周期の発動は発動の次のフレームから付く
    expect(starts[0]).toBe(0);
    expect(starts[1]).toBe(S2_PERIOD + 1);
    starts.slice(2).forEach((f, k) => expect(f - starts[k + 1]!).toBe(S2_PERIOD));
    expect(starts.length).toBe(6);
  });

  it('ticks Sakura Petals on application and every second from 1.5 s later, at the start of battle and each cooldown fire', () => {
    const ticks = hitsOf('skill2').map((h) => h.frame);
    // 戦闘開始の付与の 15 秒（15 tick）は次の発動（30 秒）より前に切れる
    const first = ticks.filter((f) => f < S2_PERIOD);
    expect(first.length).toBe(15);
    expect(first[0]).toBe(0);
    // 刻みは持続ダメージの atApplication の形（frame/dot.ts）
    expect(first).toEqual(dotTickFrames([0], 1, 15, S2_PERIOD, 'atApplication'));
    // クールタイムの発動は 1 パス目の記録のフレーム（周期の発火）に付く
    const next = ticks.filter((f) => f >= S2_PERIOD && f < 2 * S2_PERIOD);
    expect(next.length).toBe(15);
    expect(next[0]).toBe(S2_PERIOD);
  });

  it('stacks the Burst sustained damage once per Burst hit, up to 10', () => {
    const ticks = hitsOf('burst');
    expect(activations.length).toBeGreaterThan(0);
    expect(ticks.length).toBeGreaterThan(0);
    for (const t of ticks) {
      // 直前の発動の、tick より前のヒットの数がスタックの数（上限 10）
      const a = activations.filter((x) => hitFramesOf(x)[0]! < t.frame).at(-1)!;
      const before = hitFramesOf(a).filter((f) => f < t.frame).length;
      expect(t.stacks ?? 1).toBe(Math.min(before, 10));
    }
  });
});

describeEveryShotInOneGroup(CASES);
