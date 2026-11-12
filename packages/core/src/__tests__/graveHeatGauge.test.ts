// グレイブ（514）の S1 の放熱の味方のゲージ（allyGaugeAdd の while。plan/design-grave-heat-gauge.md）: 放熱の間に着いた味方のゲージ
// 1 回ごとに、グレイブの target_burst_energy_pershot × 38.96% を足す（C-1154）。持つ枠が 2 つ以上なら足し合わせる（同 2.2 節）。
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { resolveAllyGaugeAdd } from '../skills/burstDamage.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { NamedStateId } from '../skills/states.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, rawDefinition, readJson, skillValueOf } from './teamHelpers.ts';

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 60),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 60, profile),
};

/** 射撃場の表で条件を決める枠（json は定義の差し替え） */
const slot = (id: number, json?: unknown): TeamSlotInput => ({ ...fixedSlot(id, json), conditionMode: 'auto' });

const HEAT = 'heatEmission' as NamedStateId;
/** S1 の値 4（Lv10 の 38.96%）× target_burst_energy_pershot（9,000） */
const GRAVE_RATIO = skillValueOf(514, 'skill1', 4) / 100;
const GRAVE_ADD = 9_000 * GRAVE_RATIO;

// V-0751 の撮り方（録画 1125）: 鈴原サクラ（I・AI）+ グレイブ（II・操作）。III がいないのでチェーンは II の後に切れる
const TEAM: TeamInput = {
  slots: [slot(836), slot(514)],
  enemy: rangeEnemy,
  durationSeconds: 60,
  burst: true,
  controlledSlot: 1,
};

describe('グレイブ S1 の放熱の味方のゲージ（allyGaugeAdd の while）', () => {
  const plan = planTeamRun(TEAM);
  const heat = itemsOf(plan.history, { holder: 1, state: HEAT });

  it('resolves 38.96% with the Heat Emission window', () => {
    const grave = TEAM.slots[1]!;
    const add = resolveAllyGaugeAdd(grave.skills!.definition!, grave.character, MAX_SKILL_LEVELS);
    expect(add?.ratio).toBeCloseTo(0.3896, 12);
    expect(add?.whileState).toBe(HEAT);
  });

  it('adds 3,506 per ally hit only while she is in Heat Emission (C-1154)', () => {
    expect(heat.length).toBeGreaterThan(0);
    expect(plan.allyGauges.length).toBeGreaterThan(0);
    const sakura = plan.shotGauges.filter((g) => g.slotIndex === 0);
    for (const g of plan.allyGauges) {
      expect(g.slotIndex).toBe(0);
      expect(g.holderIndex).toBe(1);
      // 窓は付いた次のフレームから（条件 selfState と同じ見え方）
      expect(heat.some((it) => it.start < g.frame && g.frame < it.end)).toBe(true);
      // 1 回の量は、その回の鈴原サクラの命中の期待値 × 3,506
      const hits = sakura
        .filter((s) => s.frame === g.frame)
        .reduce((a, s) => a + s.energy / TEAM.slots[0]!.character.shot.targetBurstEnergyPerShot, 0);
      expect(g.energy).toBeCloseTo(hits * GRAVE_ADD, 6);
    }
    // 窓の中に着いた鈴原サクラの回には、どれも足している
    const inside = sakura.filter((s) => heat.some((it) => it.start < s.frame && s.frame < it.end));
    expect(inside.length).toBeGreaterThan(0);
    for (const s of inside) expect(plan.allyGauges.some((g) => g.frame === s.frame)).toBe(true);
  });

  it('fills the gauge sooner than without the window effect', () => {
    const raw = rawDefinition<{ skills: { skill1: { effects: { kind: string }[] } } }>(514);
    raw.skills.skill1.effects = raw.skills.skill1.effects.filter((e) => e.kind !== 'allyGaugeAdd');
    const without: TeamInput = { ...TEAM, slots: [TEAM.slots[0]!, slot(514, raw)] };
    const p = planTeamRun(without);
    expect(p.allyGauges).toEqual([]);
    // 1 回目のチェーンの切れ目の後の満タン
    const timeout = plan.schedule!.chainTimeouts[0]!;
    const fullAfter = (q: typeof plan) => q.schedule!.gaugeFullFrames.find((f) => f > timeout)!;
    expect(fullAfter(plan)).toBeLessThan(fullAfter(p));
  });

  it('adds both holders’ amounts with Anis: Star in the team', () => {
    const team: TeamInput = { ...TEAM, slots: [...TEAM.slots, slot(17)], controlledSlot: 1 };
    const p = planTeamRun(team);
    const holders = new Set(p.allyGauges.map((g) => g.holderIndex));
    expect(holders).toEqual(new Set([1, 2]));
    // どちらの持つ枠も、自分の回には足さない
    for (const g of p.allyGauges) expect(g.slotIndex).not.toBe(g.holderIndex);
  });

  it('rejects stack conditions, a counter, and a state without a grant in while', () => {
    const withWhile = (w: unknown) => {
      const raw = rawDefinition<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(514);
      const effect = raw.skills.skill1.effects.find((e) => e.kind === 'allyGaugeAdd')!;
      effect.while = w;
      return () => fixedSlot(514, raw);
    };
    expect(withWhile({ selfState: { state: 'heatEmission', stacks: 2 } })).toThrow(/stack conditions/);
    expect(withWhile({ selfCounter: { counter: 'battery', atLeast: 1 } })).toThrow(/needs \{ selfState \}/);
    expect(withWhile({ selfState: 'overheatI' })).not.toThrow();
    expect(withWhile({ selfState: 'calmMind' })).toThrow();
  });
});
