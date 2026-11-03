// マスト：ロマンチックメイド（354）を含む編成: S1 のほろ酔い（バースト 1 段階突入のたびに 1 スタック・最大 3・持続）と、その間の味方全体の
// ▲、S2 とバーストの「X% × ほろ酔いのスタック数」（timed の perCount）、フルスタックのフルバーストの終わりの解除と二日酔い（気絶 10 秒。
// shotPause の { applied }。気絶の間はバーストの候補にもならない）（plan/design-maids.md、V-0668）。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { piecesOf, stateItemsOf, statePiecesOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, fixedTeam, skillValueOf, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const MAST = 354;
const MAST_SLOT = 1;
const STUN_FRAMES = 600;

function team(ids: readonly number[]): TeamInput {
  return fixedTeam(ids, MAST_SLOT, { enemy: { ...SHOOTING_RANGE_ENEMY, element: 'Fire' } });
}

// 撮影 B の編成（リター + マスト：RM + サン。V-0668）と、マスト：RM が II の実戦寄りの 5 人
const TEAMS: Record<string, TeamInput> = {
  '撮影 B の編成（リター + マスト：RM + サン）': team([82, MAST, 308]),
  '実戦寄り（リター + マスト：RM + アリス + ドレイク + クラウン）': team([82, MAST, 191, 101, 330]),
};

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const drunken = stateItemsOf(plan).filter((s) => s.state === 'drunken' && s.slotIndex === MAST_SLOT);
  const hangover = stateItemsOf(plan).filter((s) => s.state === 'hangover' && s.slotIndex === MAST_SLOT);
  const levelAt = (f: number) =>
    Math.max(0, ...drunken.filter((s) => s.start < f && f < s.end).map((s) => s.stack ?? 1));

  it('stacks Drunken up to 3 on her only', () => {
    expect(drunken.length).toBeGreaterThan(0);
    expect(Math.max(...drunken.map((s) => s.stack ?? 1))).toBe(3);
  });

  it('gives all allies the S1 buffs only while she is Drunken', () => {
    const s1 = [...piecesOf(plan), ...statePiecesOf(plan)].filter(
      (p) => p.sourceSlotIndex === MAST_SLOT && p.effect.source.skill === 'skill1',
    );
    expect(new Set(s1.map((p) => p.effect.stat))).toEqual(new Set(['hitRate', 'critRate', 'attack']));
    const allies = s1.filter((p) => p.effect.stat !== 'hitRate');
    expect(new Set(allies.map((p) => p.slotIndex))).toEqual(new Set(input.slots.map((_, i) => i)));
    for (const p of allies) expect(levelAt(p.start + 1)).toBeGreaterThan(0);
    // 命中率▼は自分にだけ（ほろ酔いの中身）
    expect(s1.filter((p) => p.effect.stat === 'hitRate').every((p) => p.slotIndex === MAST_SLOT)).toBe(true);
  });

  it('multiplies the S2 and burst values by the Drunken stacks at the trigger', () => {
    const reload = skillValueOf(MAST, 'skill2', 3) / 100;
    const attack = skillValueOf(MAST, 'burst', 5) / 100;
    const s2 = piecesOf(plan).filter(
      (p) => p.sourceSlotIndex === MAST_SLOT && p.effect.source.skill === 'skill2' && p.effect.stat === 'reloadSpeed',
    );
    const burst = piecesOf(plan).filter(
      (p) =>
        p.sourceSlotIndex === MAST_SLOT &&
        p.effect.source.skill === 'burst' &&
        p.effect.stat === 'attack' &&
        p.effect.scaling === 'casterAttack',
    );
    for (const [pieces, unit] of [
      [s2, reload],
      [burst, attack],
    ] as const) {
      expect(pieces.length).toBeGreaterThan(0);
      for (const p of pieces) expect(close(p.effect.value, unit * levelAt(p.start))).toBe(true);
    }
    // 1 スタックの回と 3 スタックの回がある
    const stacks = new Set(s2.map((p) => Math.round(p.effect.value / reload)));
    expect(stacks.has(1) && stacks.has(3)).toBe(true);
    expect([...stacks].every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it('removes Drunken and stuns her for 10 s when Full Burst ends at full stacks', () => {
    expect(hangover.length).toBeGreaterThan(0);
    const shots = plan.shots[MAST_SLOT]!.frames;
    const mine = plan.schedule!.activations.filter((a) => a.slotIndex === MAST_SLOT);
    for (const h of hangover) {
      expect(levelAt(h.start)).toBe(3);
      expect(levelAt(h.start + 2)).toBe(0);
      expect(shots.some((f) => f > h.start && f <= h.start + STUN_FRAMES)).toBe(false);
      expect(mine.some((a) => a.frame > h.start && a.frame <= h.start + STUN_FRAMES)).toBe(false);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
