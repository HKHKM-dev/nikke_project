// マナ（290）の S1 の通常攻撃 10 回ごとの回復（射撃の回数起点）: 撃ったマナより前の枠の味方には次のフレーム、後ろの枠の味方には
// 同じフレームに当たる（skills/heals.ts の healFrameOf。V-0490、C-0628）。V-0490 の録画の 2 つの枠順（アスカ → マナと、
// V-0439 のマナ → アスカ）で、回復と、それで付くアスカの S1 の窓の始まりを見る。どちらもバーストは撃たない（オートバースト OFF）。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { healsOf, piecesOf } from './historyHelpers.ts';
import { fixedEnemy, fixedSlot, type FixedSlotOptions, fixedTeam } from './teamHelpers.ts';

/** このテストの枠の、既定と違う所 */
const SLOT_OPTIONS: FixedSlotOptions = { condition: { coreHitRate: 0, distanceBonus: true } };

const enemy: EnemyInput = fixedEnemy();
const MANA_ID = 290;
const ASUKA_ID = 830;

/** アスカの S1（回復効果が適用された時、攻撃力▲）の値の小片の始まり */
function asukaS1Starts(plan: ReturnType<typeof planTeamRun>, asuka: number): number[] {
  return piecesOf(plan)
    .filter(
      (p) =>
        p.slotIndex === asuka &&
        p.effect.stat === 'attack' &&
        p.effect.source.resourceId === ASUKA_ID &&
        p.effect.source.skill === 'skill1',
    )
    .map((p) => p.start);
}

describe('V-0490 の録画の編成（◎アスカ（1 枠目）→ マナ（2 枠目））', () => {
  const ASUKA = 0;
  const MANA = 1;
  const input: TeamInput = fixedTeam([fixedSlot(ASUKA_ID, SLOT_OPTIONS), fixedSlot(MANA_ID, SLOT_OPTIONS)], ASUKA, {
    enemy,
    burst: false,
  });
  const plan = planTeamRun(input);
  const manaShots = plan.shots[MANA]!.frames;
  const tenth = manaShots[9]!;

  it('fires the 10th shots of Mana and Asuka on the same frame (premise of V-0490)', () => {
    expect(plan.shots[ASUKA]!.frames[9]).toBe(tenth);
  });

  // 前の枠のアスカにも、撃ったマナ自身にも次のフレーム（V-0490、C-0628）
  it('heals the front slot (Asuka) and Mana herself on the frame after every 10th shot of Mana', () => {
    const heals = healsOf(plan).filter((h) => h.sourceSlotIndex === MANA);
    const expected = manaShots
      .filter((_, i) => (i + 1) % 10 === 0)
      .filter((f) => f + 1 < plan.frames)
      .flatMap((f) => [
        { frame: f + 1, sourceSlotIndex: MANA, slotIndex: ASUKA },
        { frame: f + 1, sourceSlotIndex: MANA, slotIndex: MANA },
      ]);
    expect(expected.length).toBeGreaterThan(2);
    expect(heals).toEqual(expected);
  });

  it('starts Asuka S1 on the frame after the 10th shot of Mana, so her 10th shot has no S1', () => {
    const starts = asukaS1Starts(plan, ASUKA);
    expect(starts[0]).toBe(tenth + 1);
  });
});

describe('V-0439 の録画の編成（マナ（1 枠目）→ ◎アスカ（2 枠目））', () => {
  const MANA = 0;
  const ASUKA = 1;
  const input: TeamInput = fixedTeam([fixedSlot(MANA_ID, SLOT_OPTIONS), fixedSlot(ASUKA_ID, SLOT_OPTIONS)], ASUKA, {
    enemy,
    burst: false,
  });
  const plan = planTeamRun(input);
  const tenth = plan.shots[MANA]!.frames[9]!;

  // 後ろの枠のアスカには同じフレーム、撃ったマナ自身には次のフレーム（V-0490、C-0628）
  it('heals the back slot (Asuka) on the 10th shot frame of Mana, and Mana herself on the next frame', () => {
    expect(healsOf(plan).slice(0, 2)).toEqual([
      { frame: tenth, sourceSlotIndex: MANA, slotIndex: ASUKA },
      { frame: tenth + 1, sourceSlotIndex: MANA, slotIndex: MANA },
    ]);
  });

  it('starts Asuka S1 on the 10th shot frame of Mana', () => {
    expect(asukaS1Starts(plan, ASUKA)[0]).toBe(tenth);
  });
});
