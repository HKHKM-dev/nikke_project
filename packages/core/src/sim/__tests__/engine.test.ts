import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { slotsByStep } from '../../burst/schedule.ts';
import { computeCadence } from '../../cadence.ts';
import type { EnemyInput } from '../../damage.ts';
import { MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import type { SkillDefinition } from '../../skills/types.ts';
import type { SlotCondition, TeamSlotInput } from '../../team.ts';
import type { BurstStep, ShotParams, SkillRaw } from '../../types.ts';
import { runSimulation, simIntervalTotals } from '../engine.ts';

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };

function slot(
  resourceId: number,
  shot: Partial<ShotParams> = {},
  burstStep: BurstStep = 'Step3',
  burstPercent: string | null = null,
): TeamSlotInput {
  const burst: SkillRaw = { ...empty, id: resourceId, name: { ja: `B${resourceId}`, en: `B${resourceId}` } };
  if (burstPercent !== null) burst.values = [tenLevels(burstPercent)];
  const character = makeCharacter(shot, { resourceId, burstStep, skills: { skill1: empty, skill2: empty, burst } });
  const input: TeamSlotInput = { character, growth, condition };
  if (burstPercent !== null) {
    const definition: SkillDefinition = {
      formatVersion: 1,
      resourceId,
      checkedAt: '2026-09-22',
      skills: {
        skill1: { support: 'unsupported', effects: [] },
        skill2: { support: 'unsupported', effects: [] },
        burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] },
      },
    };
    input.skills = { definition, levels: MAX_SKILL_LEVELS };
  }
  return input;
}

const ar = slot(1);
const sr = slot(3, { maxAmmo: 6, reloadTime: 1.5, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP' });

/** 周期から数えた frames フレーム内のトリガー数 */
function triggersByCadence(shot: ShotParams, frames: number): number {
  const c = computeCadence(shot);
  let count = 0;
  for (let k = 0; ; k++) {
    const base = k * c.cycleFrames + c.firstShotFrames;
    if (base >= frames) break;
    count += c.shotFrames.filter((f) => base + f < frames).length;
  }
  return count;
}

describe('runSimulation without burst', () => {
  it('puts every trigger in the non-full-burst bucket and counts them like the cadence', () => {
    const sim = runSimulation({ slots: [ar, null, sr], enemy, durationSeconds: 180 });
    expect(sim.frames).toBe(10800);
    expect(sim.schedule).toBeNull();
    expect(sim.slots[1]).toBeNull();
    for (const s of sim.slots) {
      if (s === null) continue;
      const totals = simIntervalTotals(s);
      expect(totals.fullBurst).toEqual({ triggers: 0, damage: 0 });
      expect(totals.nonFullBurst.triggers).toBe(triggersByCadence(s.character.shot, 10800));
      expect(totals.nonFullBurst.damage).toBeCloseTo(
        totals.nonFullBurst.triggers * s.segments[0]!.trigger.perTrigger,
        6,
      );
      expect(s.burst).toEqual({ activations: [], hit: null, damage: 0, hits: [] });
      expect(s.totalDamage).toBeCloseTo(totals.nonFullBurst.damage, 6);
    }
    expect(sim.totalDamage).toBeCloseTo((sim.slots[0]?.totalDamage ?? 0) + (sim.slots[2]?.totalDamage ?? 0), 6);
    expect(sim.events).toEqual([]);
  });

  it('AR fires 1830 times in 180 s (30 magazines of 355f + 30 shots of the 31st, 10650 + 5 × 29 < 10800)', () => {
    const sim = runSimulation({ slots: [ar], enemy, durationSeconds: 180 });
    expect(simIntervalTotals(sim.slots[0]!).nonFullBurst.triggers).toBe(30 * 60 + 30);
  });
});

describe('runSimulation with the fixed burst cycle', () => {
  it('does not change the firing pattern, only which bucket each trigger lands in (+0.5 boost in full burst)', () => {
    const off = runSimulation({ slots: [ar, sr], enemy, durationSeconds: 180 });
    const on = runSimulation({ slots: [ar, sr], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' });
    expect(on.schedule?.fullBurstFramesTotal).toBe(5400);
    for (let i = 0; i < 2; i++) {
      const a = off.slots[i]!;
      const b = on.slots[i]!;
      const at = simIntervalTotals(a);
      const bt = simIntervalTotals(b);
      const normalTrigger = a.segments[0]!.trigger;
      expect(bt.nonFullBurst.triggers + bt.fullBurst.triggers).toBe(at.nonFullBurst.triggers);
      expect(bt.fullBurst.damage / bt.fullBurst.triggers).toBeCloseTo(
        (normalTrigger.perTrigger * (normalTrigger.boost.total + 0.5)) / normalTrigger.boost.total,
        6,
      );
      expect(b.segments.find((s) => s.fullBurst)?.trigger.boost.fullBurst).toBe(0.5);
      expect(b.totalDamage).toBeGreaterThan(a.totalDamage);
    }
  });

  it('fires the burst skill of the assigned slot 9 times and sums 9 × perActivation', () => {
    const step2 = slot(4, {}, 'Step2'); // 定義なし
    const buster = slot(5, {}, 'Step3', '351.64');
    const other = slot(6, {}, 'Step3', '100'); // 同じ段階の 2 体目は発動しない
    const step1 = slot(7, {}, 'Step1', '50');
    const sim = runSimulation({
      slots: [step2, buster, other, step1],
      enemy,
      durationSeconds: 180,
      burst: true,
      burstModel: 'fixed',
    });
    expect(sim.schedule && slotsByStep(sim.schedule)).toEqual({ Step1: [3], Step2: [0], Step3: [1] });
    const b = sim.slots[1]!;
    expect(b.burst.activations).toEqual([600, 1800, 3000, 4200, 5400, 6600, 7800, 9000, 10200]);
    expect(b.burst.hit?.multiplier).toBeCloseTo(3.5164, 12);
    expect(b.burst.damage).toBeCloseTo(9 * (b.burst.hit?.perActivation ?? 0), 6);
    expect(sim.slots[2]?.burst.activations).toEqual([]);
    expect(sim.slots[2]?.burst.hit?.multiplier).toBe(1);
    expect(sim.slots[2]?.burst.damage).toBe(0);
    expect(sim.slots[3]?.burst.activations).toHaveLength(9);
    expect(sim.slots[0]?.burst.hit).toBeNull();
    expect(b.totalDamage).toBeCloseTo(b.normalDamage + b.burst.damage, 6);
  });

  it('records events in order when tracing: full burst starts at 600 and bursts fire I → II → III before triggers', () => {
    const step1 = slot(7, {}, 'Step1', '50');
    const step2 = slot(8, {}, 'Step2', '60');
    const step3 = slot(9, {}, 'Step3', '70');
    const sim = runSimulation({
      slots: [step3, step1, step2],
      enemy,
      durationSeconds: 20.5,
      burst: true,
      burstModel: 'fixed',
      trace: true,
    });
    const at600 = sim.events.filter((e) => e.frame === 600);
    expect(at600[0]).toEqual({ frame: 600, kind: 'fullBurstStart' });
    expect(at600.slice(1, 4).map((e) => (e.kind === 'burst' ? [e.step, e.slot] : null))).toEqual([
      ['Step1', 1],
      ['Step2', 2],
      ['Step3', 0],
    ]);
    expect(at600.slice(4).every((e) => e.kind === 'trigger' && e.fullBurst)).toBe(true);
    expect(sim.events.find((e) => e.kind === 'fullBurstEnd')?.frame).toBe(1200);
    const at595 = sim.events.filter((e) => e.frame === 595); // AR は 5f 刻みなので 595 に撃つ（599 は撃たない）
    expect(at595.length).toBeGreaterThan(0);
    expect(at595.every((e) => e.kind === 'trigger' && !e.fullBurst)).toBe(true);
    expect(sim.frames).toBe(1230);
  });

  it('runs a very short battle and an empty team', () => {
    expect(
      runSimulation({ slots: [ar], enemy, durationSeconds: 0, burst: true, burstModel: 'fixed' }).totalDamage,
    ).toBe(0);
    const empty = runSimulation({ slots: [null, null], enemy, durationSeconds: 180, burst: true, burstModel: 'fixed' });
    expect(empty.totalDamage).toBe(0);
    expect(empty.schedule?.activations).toEqual([]);
  });

  it('rejects duplicate characters like computeTeamDamage', () => {
    expect(() => runSimulation({ slots: [ar, slot(1)], enemy, durationSeconds: 1 })).toThrow(RangeError);
  });
});

describe('runSimulation on the dynamic cycle (Stage 7)', () => {
  const step1 = slot(7, {}, 'Step1', '50');
  const step2 = slot(8, {}, 'Step2', '60');
  const step3 = slot(9, {}, 'Step3', '70');
  const team = [step3, step1, step2];

  it('fires exactly the same shots as without burst (the schedule does not change the shooters)', () => {
    const shots = (burst: boolean) =>
      runSimulation({ slots: team, enemy, durationSeconds: 180, burst, trace: true })
        .events.filter((e) => e.kind === 'trigger')
        .map((e) => (e.kind === 'trigger' ? `${e.frame}:${e.slot}` : ''));
    expect(shots(true)).toEqual(shots(false));
  });

  it('traces gauge full, the chain I → II → III 20f apart and the full burst from III', () => {
    const sim = runSimulation({ slots: team, enemy, durationSeconds: 60, burst: true, trace: true });
    const schedule = sim.schedule!;
    expect(schedule.model).toBe('dynamic');
    const full = schedule.gaugeFullFrames[0]!;
    expect(sim.events.find((e) => e.kind === 'gaugeFull')?.frame).toBe(full);
    const bursts = sim.events.filter((e) => e.kind === 'burst').slice(0, 3);
    expect(bursts.map((e) => (e.kind === 'burst' ? [e.frame, e.step, e.slot] : null))).toEqual([
      [full + 20, 'Step1', 1],
      [full + 40, 'Step2', 2],
      [full + 60, 'Step3', 0],
    ]);
    expect(sim.events.find((e) => e.kind === 'fullBurstStart')?.frame).toBe(full + 60);
    expect(sim.events.find((e) => e.kind === 'fullBurstEnd')?.frame).toBe(full + 660);
    // 全員 CT 40 秒なので 2 回目は 1 回目の I から 2,400f 後
    expect(sim.slots[1]!.burst.activations).toEqual([full + 20, full + 20 + 2400]);
  });
});
