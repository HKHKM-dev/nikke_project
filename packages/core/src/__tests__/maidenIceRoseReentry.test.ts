// メイデン：アイスローズ（plan/design-maiden-ice-rose.md 9 節）と再突入（burstStepChange）を持つキャラを組んだ編成: 1 パス目は MP 0 で
// バーストを撃つ形を例外で止めるので、再突入でチェーンの形が変わっても、計算が通り、メイデンが撃つ時の MP が 1 以上であること
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { effectFrameOf } from '../burst/schedule.ts';
import { counterEffectiveFrom } from '../skills/holders/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MAIDEN = 183;
/** ラピ：レッドフード。基本バースト段階 I の味方がいなければ、戦闘補助でバースト I に変わる（再突入） */
const RED_HOOD = 16;

function rangeTeam(ids: readonly number[], controlled: number, extra: Partial<TeamInput> = {}): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, controlled, { enemy: rangeEnemyWithEvents(), ...extra });
}

type Case = { input: TeamInput; maiden: number; redHood: number; assist: boolean };
const CASES: Record<string, Case> = {
  'レッドフード（戦闘補助で I）+ ソルジャーF.A. + メイデン': {
    input: rangeTeam([RED_HOOD, 301, MAIDEN], 2),
    maiden: 2,
    redHood: 0,
    assist: true,
  },
  'レッドフード（戦闘補助で I）+ ソルジャーF.A. + メイデン + ソルジャーE.G.・手動': {
    input: rangeTeam([RED_HOOD, 301, MAIDEN, 300], 2, { manualBursts: [0, 2800, 5200, 5201, 7700, 7701] }),
    maiden: 2,
    redHood: 0,
    assist: true,
  },
  'レッドフード（戦闘補助で I）+ クラウン + メイデン + 紅蓮 + ソルジャーE.G.': {
    input: fixedTeam([RED_HOOD, 330, MAIDEN, 222, 300], 2),
    maiden: 2,
    redHood: 0,
    assist: true,
  },
  'リター + クラウン + メイデン + レッドフード（III のまま）+ ソルジャーE.G.': {
    input: fixedTeam([82, 330, MAIDEN, RED_HOOD, 300], 2),
    maiden: 2,
    redHood: 3,
    assist: false,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, maiden: M, redHood: R, assist }) => {
  // 例外で止まれば、ここで describe ごと落ちる
  const sim = runSimulation(input);
  const activations = sim.schedule!.activations;

  it('uses the burst stage that Combat Assist decides', () => {
    const steps = new Set(activations.filter((a) => a.slotIndex === R).map((a) => a.step));
    expect(steps.size).toBeGreaterThan(0);
    expect(steps.has('Step1')).toBe(assist);
  });

  it('gives Maiden MP of 1 or more at every Burst use', () => {
    const records = sim.history.counters.filter((r) => r.slotIndex === M && r.counter === 'mp');
    /** フレーム f の前のフレームの終わりの MP（バーストの連続攻撃が読む値） */
    const mpBefore = (f: number) => records.filter((r) => counterEffectiveFrom(r) <= f).at(-1)?.value ?? 0;
    const uses = activations.filter((a) => a.slotIndex === M).map(effectFrameOf);
    expect(uses.length).toBeGreaterThan(0);
    for (const f of uses) expect(mpBefore(f)).toBeGreaterThanOrEqual(1);
  });
});
