// アスカ（830）を含む編成: バーストの吸収回復で付く S1 の窓・灼熱の味方だけのコアダメージ▲（plan/design-asuka.md 5 節）。
// V-0022: 吸収回復は付いた時の 1 回の回復として扱う（命中ごとの回復では S1 は延びない）。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { itemsOf } from '../skills/holders.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { healsOf, piecesOf } from './historyHelpers.ts';
import { fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const enemy: EnemyInput = fixedEnemy();

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return fixedTeam(slots, controlledSlot, { enemy });
}

const REC063 = team([fixedSlot(304), fixedSlot(20), fixedSlot(830)], 2);
// 順位（アリスの S1。topAttack）が S1 の攻撃力▲の窓を見るので、1 パス目のループの回復も通る
const PRACTICAL = team([fixedSlot(82), fixedSlot(330), fixedSlot(830), fixedSlot(191), fixedSlot(172)], 2);

describe('録画 0063 の編成の窓（4 節）', () => {
  const plan = planTeamRun(REC063);
  const ASUKA = 2;
  const windowsOf = (slotIndex: number, stat: string) =>
    piecesOf(plan).filter((w) => w.slotIndex === slotIndex && w.effect.stat === stat);

  it('gives S1 for 25 s from each burst use (one heal on the burst, not on every hit)', () => {
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === ASUKA).map((a) => a.frame);
    const s1 = gameSecondsToFrames(25);
    const expected = activations.map((a) => ({ start: a, end: Math.min(a + s1, plan.frames) }));
    const s1Windows = windowsOf(ASUKA, 'attack').map((w) => ({ start: w.start, end: w.end }));
    expect(s1Windows).toEqual(expected);
    // 次のバーストまで約 16 秒切れる（録画 0063。V-0022）
    s1Windows.slice(0, -1).forEach((w, k) => {
      const gap = activations[k + 1]! - w.end;
      expect(gap).toBeGreaterThan(gameSecondsToFrames(10));
    });
  });

  it('gives the core damage only to the fire ally (Asuka), not to the wind allies', () => {
    expect(windowsOf(ASUKA, 'coreDamage').length).toBeGreaterThan(0);
    expect(windowsOf(0, 'coreDamage')).toEqual([]);
    expect(windowsOf(1, 'coreDamage')).toEqual([]);
  });

  it('heals Asuka once per burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === ASUKA).map((a) => a.frame);
    const heals = healsOf(plan);
    expect(heals.map((h) => h.frame)).toEqual(uses);
    expect(heals.every((h) => h.sourceSlotIndex === ASUKA && h.slotIndex === ASUKA)).toBe(true);
  });
});

describe('1 パス目のループの回復', () => {
  it('gives the S1 attack items on the heals of the loop (the burst heal), at the stage the ranking reads', () => {
    const plan = planTeamRun(PRACTICAL);
    const items = itemsOf(plan.history, { kind: 'timed', skill: 'skill1', stat: 'attack' }).filter(
      (i) => i.origin.kind === 'timed' && i.origin.effect.source.resourceId === 830,
    );
    expect(items.length).toBeGreaterThan(0);
    const healed = plan.history.heals.filter((h) => h.slotIndex === items[0]!.holder).map((h) => h.frame);
    for (const i of items) expect(healed).toContain(i.start);
    for (const f of healed) expect(items.some((i) => i.start <= f && f < i.end)).toBe(true);
    expect(items.every((i) => i.stage === 1)).toBe(true);
  });
});
