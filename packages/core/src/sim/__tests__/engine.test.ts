import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { computeCadence } from '../../cadence.ts';
import type { EnemyInput } from '../../damage.ts';
import { MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import type { SkillDefinition } from '../../skills/types.ts';
import type { SlotCondition, TeamSlotInput } from '../../team.ts';
import type { BurstStep, ShotParams, SkillRaw } from '../../types.ts';
import { runSimulation } from '../engine.ts';

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
      expect(s.normal.fullBurst).toEqual({ triggers: 0, damage: 0 });
      expect(s.normal.nonFullBurst.triggers).toBe(triggersByCadence(s.character.shot, 10800));
      expect(s.normal.nonFullBurst.damage).toBeCloseTo(s.normal.nonFullBurst.triggers * s.trigger.normal.perTrigger, 6);
      expect(s.burst).toEqual({ activations: [], hit: null, damage: 0 });
      expect(s.totalDamage).toBe(s.normal.nonFullBurst.damage);
    }
    expect(sim.totalDamage).toBeCloseTo((sim.slots[0]?.totalDamage ?? 0) + (sim.slots[2]?.totalDamage ?? 0), 6);
    expect(sim.events).toEqual([]);
  });

  it('AR fires 1830 times in 180 s (30 magazines of 355f + 30 shots of the 31st, 10650 + 5 × 29 < 10800)', () => {
    const sim = runSimulation({ slots: [ar], enemy, durationSeconds: 180 });
    expect(sim.slots[0]?.normal.nonFullBurst.triggers).toBe(30 * 60 + 30);
  });
});

describe('runSimulation with the fixed burst cycle', () => {
  it('does not change the firing pattern, only which bucket each trigger lands in (+0.5 boost in full burst)', () => {
    const off = runSimulation({ slots: [ar, sr], enemy, durationSeconds: 180 });
    const on = runSimulation({ slots: [ar, sr], enemy, durationSeconds: 180, burst: true });
    expect(on.schedule?.fullBurstFramesTotal).toBe(5400);
    for (let i = 0; i < 2; i++) {
      const a = off.slots[i]!;
      const b = on.slots[i]!;
      expect(b.normal.nonFullBurst.triggers + b.normal.fullBurst.triggers).toBe(a.normal.nonFullBurst.triggers);
      expect(b.normal.fullBurst.damage / b.normal.fullBurst.triggers).toBeCloseTo(
        (a.trigger.normal.perTrigger * (a.trigger.normal.boost.total + 0.5)) / a.trigger.normal.boost.total,
        6,
      );
      expect(b.trigger.fullBurst.boost.fullBurst).toBe(0.5);
      expect(b.totalDamage).toBeGreaterThan(a.totalDamage);
    }
  });

  it('fires the burst skill of the assigned slot 9 times and sums 9 × perActivation', () => {
    const step2 = slot(4, {}, 'Step2'); // 定義なし
    const buster = slot(5, {}, 'Step3', '351.64');
    const other = slot(6, {}, 'Step3', '100'); // 同じ段階の 2 体目は発動しない
    const step1 = slot(7, {}, 'Step1', '50');
    const sim = runSimulation({ slots: [step2, buster, other, step1], enemy, durationSeconds: 180, burst: true });
    expect(sim.schedule?.assignment).toEqual({ Step1: 3, Step2: 0, Step3: 1 });
    const b = sim.slots[1]!;
    expect(b.burst.activations).toEqual([600, 1800, 3000, 4200, 5400, 6600, 7800, 9000, 10200]);
    expect(b.burst.hit?.multiplier).toBeCloseTo(3.5164, 12);
    expect(b.burst.damage).toBeCloseTo(9 * (b.burst.hit?.perActivation ?? 0), 6);
    expect(sim.slots[2]?.burst.activations).toEqual([]);
    expect(sim.slots[2]?.burst.hit?.multiplier).toBe(1);
    expect(sim.slots[2]?.burst.damage).toBe(0);
    expect(sim.slots[3]?.burst.activations).toHaveLength(9);
    expect(sim.slots[0]?.burst.hit).toBeNull();
    expect(b.totalDamage).toBeCloseTo(b.normal.nonFullBurst.damage + b.normal.fullBurst.damage + b.burst.damage, 6);
  });

  it('records events in order when tracing: full burst starts at 600 and bursts fire I → II → III before triggers', () => {
    const step1 = slot(7, {}, 'Step1', '50');
    const step2 = slot(8, {}, 'Step2', '60');
    const step3 = slot(9, {}, 'Step3', '70');
    const sim = runSimulation({ slots: [step3, step1, step2], enemy, durationSeconds: 20.5, burst: true, trace: true });
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
    expect(runSimulation({ slots: [ar], enemy, durationSeconds: 0, burst: true }).totalDamage).toBe(0);
    const empty = runSimulation({ slots: [null, null], enemy, durationSeconds: 180, burst: true });
    expect(empty.totalDamage).toBe(0);
    expect(empty.schedule?.assignment).toEqual({ Step1: null, Step2: null, Step3: null });
  });

  it('rejects duplicate characters like computeTeamDamage', () => {
    expect(() => runSimulation({ slots: [ar, slot(1)], enemy, durationSeconds: 1 })).toThrow(RangeError);
  });
});
