// 回復で現在の HP が戻り、HP の割合が上がる分（plan/design-hp-heal-restore.md）: 量で追う回復（scaling casterFinalMaxHp）が、
// 最大HP のみ▲・現在の HP▼ で下がった割合を戻し、上限（想定の割合 × 最大HP）で止まり、読む側（並び・きっかけの維持）に届くか
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf, selfHpRatioOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput } from '../team.ts';
import { fixedSlot, fixedTeam, rawDefinition, skillValueOf } from './teamHelpers.ts';

const FLOWER = 304;
const MILK = 141;
const NOIR = 271;
const MISATO = 833;
const MAST = 350;
const SCARLET = 222;
const NAGA = 450;

type Json = { skills: Record<string, { effects: Record<string, unknown>[] }> };

describe('マストの最大HP のみ▲ の窓とミサトの S1 の回復', () => {
  const team = (): TeamInput => fixedTeam([MISATO, MAST, MILK, NOIR, FLOWER], 2, { noBurstSlots: [0, 2, 3] });
  const plan = planTeamRun(team());
  const lowered = itemsOf(plan.history, {
    sourceSlotIndex: 1,
    kind: 'timed',
    skill: 'burst',
    stat: 'maxHpOnly',
    holder: 2,
  });
  const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 0);
  const ratio = (slot: number, frame: number) => selfHpRatioOf(plan.history, slot, frame);
  const maxHp = (slot: number) => plan.history.slots[slot]!.casterMaxHp!;

  it('raises the healed ratio by the caster final max HP × X over the target max HP, from the next frame', () => {
    const w = lowered[0]!;
    const h = heals.find((x) => x.slotIndex === 2 && w.start < x.frame && x.frame < w.end)!;
    expect(h).toBeDefined();
    const before = ratio(2, h.frame);
    // 窓の中の 3 枠目の最大HP（バフ前の最大HP を 1 とする）は 1 ÷ 割合
    const amount = (maxHp(0) * skillValueOf(MISATO, 'skill1', 7)) / 100 / maxHp(2);
    expect(ratio(2, h.frame + 1) - before).toBeCloseTo(amount * before, 9);
  });

  it('cuts the restored HP when the max-HP-only up ends (back to full, not above)', () => {
    for (const w of lowered) {
      if (w.end + 1 >= plan.frames) continue;
      expect(ratio(2, w.end + 1)).toBeCloseTo(1, 12);
    }
    expect(Math.max(...plan.history.hpRatios[2]!.ratios)).toBeLessThanOrEqual(1 + 1e-12);
  });

  it('never raises a slot above its assumed ratio', () => {
    const input = team();
    input.slots[2] = { ...input.slots[2]!, hpRatio: 0.9 };
    const low = planTeamRun(input);
    // 窓の外でも、いちばん低い 3 枠目（0.9）に回復が当たる
    expect(low.history.heals.filter((h) => h.sourceSlotIndex === 0 && h.slotIndex === 2).length).toBeGreaterThan(
      heals.filter((h) => h.slotIndex === 2).length,
    );
    expect(Math.max(...low.history.hpRatios[2]!.ratios)).toBeCloseTo(0.9, 12);
  });
});

describe('紅蓮の現在の HP▼ とナガの S2 の回復', () => {
  // ナガの S2 の回復から量（scaling）を外した定義
  const nagaWithoutAmount = () => {
    const json = rawDefinition<Json>(NAGA);
    const heal = json.skills.skill2!.effects.find((e) => e.kind === 'heal')!;
    delete heal.scaling;
    return json;
  };
  const run = (naga: ReturnType<typeof fixedSlot>) => {
    const input = fixedTeam([SCARLET, NAGA], 0, { noBurstSlots: [0, 1] });
    input.slots[1] = naga;
    return planTeamRun(input);
  };
  const s2Of = (plan: ReturnType<typeof planTeamRun>) =>
    itemsOf(plan.history, { sourceSlotIndex: 0, kind: 'timed', skill: 'skill2', holder: 0 });

  it('restores the HP lowered by the current HP down, so S2 (60% or less) does not start', () => {
    const plan = run(fixedSlot(NAGA));
    const { ratios } = plan.history.hpRatios[0]!;
    expect(ratios.some((r, i) => i > 0 && r > ratios[i - 1]!)).toBe(true);
    expect(s2Of(plan)).toEqual([]);
  });

  it('keeps the ratio falling without the amount (a heal that does not restore HP)', () => {
    const plan = run(fixedSlot(NAGA, nagaWithoutAmount()));
    const { ratios } = plan.history.hpRatios[0]!;
    expect(ratios.every((r, i) => i === 0 || r < ratios[i - 1]!)).toBe(true);
    expect(s2Of(plan).length).toBeGreaterThan(0);
  });
});

describe('heal の scaling の書ける所', () => {
  const misato = () => rawDefinition<Json>(MISATO);

  it('rejects scaling on a heal with a duration and other values', () => {
    const lasting = misato();
    lasting.skills.burst!.effects[0]!.scaling = 'casterFinalMaxHp';
    expect(() => parseSkillDefinition(lasting)).toThrow(/a heal with a duration cannot take scaling/);
    const other = misato();
    other.skills.skill1!.effects[1]!.scaling = 'flat';
    expect(() => parseSkillDefinition(other)).toThrow(/heal only takes "casterFinalMaxHp"/);
  });
});

it('keeps the HP ratio of the team without HP-lowering effects at the assumed ratio (heals change nothing)', () => {
  const plan = planTeamRun(fixedTeam([MISATO, NOIR, FLOWER], 1));
  for (const steps of plan.history.hpRatios) expect(steps.ratios).toEqual([1]);
});
