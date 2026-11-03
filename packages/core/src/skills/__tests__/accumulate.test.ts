// 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2〜3 節）: ドロシー（233）の烙印。爆発の値は、窓の中に的が受けた
// 味方全員のダメージの和（C-0901）で、最大量で切る。爆発は窓の終わりの releaseDelayFrames 後（C-0902）。トロニー（501）の蓄積爆破は、
// 付けた後の自分の発の値 × 割合を溜め、最大量に届いた発の 13f 後か、切れる時に出す（C-0903・C-0904）。届いたかは 1 パス目が数える
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { effectFrameOf } from '../../burst/schedule.ts';
import { planTeamRun } from '../../frame/plan.ts';
import { runSimulation, type SimInput, type SimResult } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DOROTHY = 233;
const DELTA = 20;
const LITER = 82;
const TRONY = 501;
/** 烙印の 10 秒（588f）と、窓の終わりから爆発までの遅れ（data/skills/233.json） */
const WINDOW = 588;
const DELAY = 211;

function slotOf(rid: number, definition?: SkillDefinition): TeamSlotInput {
  const character = readJson<CharacterData>(`../../../data/characters/${rid}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(character),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
    skills: {
      definition: definition ?? parseSkillDefinition(readJson<unknown>(`../../../data/skills/${rid}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase: 0,
    },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

function inputOf(slots: TeamSlotInput[], controlledSlot = 0): SimInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot, trace: true };
}

function run(slots: TeamSlotInput[], controlledSlot = 0): SimResult {
  return runSimulation(inputOf(slots, controlledSlot));
}

const explosionsOf = (r: SimResult) => r.skillHits.filter((h) => h.accumulate !== undefined);

/** trace の出来事のうち、窓 [start, end) に出たダメージの和（爆発のヒット自身は除く） */
function damageIn(r: SimResult, start: number, end: number, except: number): number {
  let sum = 0;
  for (const e of r.events) {
    if (e.frame < start || e.frame >= end) continue;
    if (e.kind === 'trigger' || e.kind === 'burst') sum += e.damage;
    else if (e.kind === 'skillHit' && e.frame !== except) sum += e.damage;
  }
  return sum;
}

describe('烙印（ドロシー単騎）', () => {
  const r = run([slotOf(DOROTHY)]);
  const explosions = explosionsOf(r);
  const bursts = r.schedule!.activations.map(effectFrameOf).filter((f) => f + WINDOW + DELAY < r.frames);

  it('places one explosion per burst at the window end plus the delay (C-0902)', () => {
    expect(bursts.length).toBeGreaterThan(2);
    expect(explosions.map((h) => h.frame)).toEqual(bursts.map((b) => b + WINDOW + DELAY));
    for (const h of explosions) expect(h.accumulate!.end - h.accumulate!.start).toBe(WINDOW);
  });

  it('deals the plain sum of the damage taken in the window (C-0901)', () => {
    for (const h of explosions) {
      const sum = damageIn(r, h.accumulate!.start, h.accumulate!.end, h.frame);
      expect(sum).toBeGreaterThan(0);
      expect(h.hit.perActivation).toBeLessThan(h.accumulate!.cap);
      expect(h.hit.perActivation).toBeCloseTo(sum, 6);
    }
  });

  it('adds the explosions to the skill hit total', () => {
    const total = r.skillHits.filter((h) => h.frame < r.frames).reduce((s, h) => s + h.hit.perActivation, 0);
    expect(r.slots[0]!.skillHits.damage).toBeCloseTo(total, 6);
  });

  it('caps the value at final ATK × the cap ratio', () => {
    const def = rawDefinition<{ skills: { burst: { effects: { ref: number }[] } } }>(DOROTHY);
    // 値 01（10%）を最大量にすると、累計より小さい
    def.skills.burst.effects[0]!.ref = 1;
    const capped = explosionsOf(run([slotOf(DOROTHY, parseSkillDefinition(def))]));
    expect(capped.length).toBe(explosions.length);
    for (const h of capped) {
      expect(h.accumulate!.cap).toBeCloseTo(computeFixedSpecAttack(slotOf(DOROTHY).character).attack * 0.1, 0);
      expect(h.hit.perActivation).toBe(h.accumulate!.cap);
    }
  });
});

describe('烙印（デルタと組んだ 2 体）', () => {
  it('includes the allies’ damage in the sum (C-0901)', () => {
    const r = run([slotOf(DOROTHY), slotOf(DELTA)]);
    const explosions = explosionsOf(r);
    expect(explosions.length).toBeGreaterThan(0);
    for (const h of explosions) {
      const delta = r.events
        .filter(
          (e) => e.kind === 'trigger' && e.slot === 1 && e.frame >= h.accumulate!.start && e.frame < h.accumulate!.end,
        )
        .reduce((s, e) => s + (e.kind === 'trigger' ? e.damage : 0), 0);
      expect(delta).toBeGreaterThan(0);
      expect(h.hit.perActivation).toBeCloseTo(damageIn(r, h.accumulate!.start, h.accumulate!.end, h.frame), 6);
    }
  });
});

describe('accumulate の読み込み', () => {
  type Raw = { skills: { burst: { effects: Record<string, unknown>[] } } };
  it('rejects a trigger other than burstUse', () => {
    const def = rawDefinition<Raw>(DOROTHY);
    def.skills.burst.effects[0]!.trigger = 'fullBurstStart';
    expect(() => parseSkillDefinition(def)).toThrow(/burstUse/);
  });
  it('rejects other fields', () => {
    const def = rawDefinition<Raw>(DOROTHY);
    def.skills.burst.effects[0]!.delayFrames = 3;
    expect(() => parseSkillDefinition(def)).toThrow(/not allowed with accumulate/);
  });
  it('rejects the self source with the burstUse trigger', () => {
    const def = rawDefinition<Raw>(DOROTHY);
    (def.skills.burst.effects[0]!.accumulate as Record<string, unknown>).source = 'self';
    expect(() => parseSkillDefinition(def)).toThrow(/fullChargeShot/);
  });
  type RawS1 = { skills: { skill1: { effects: Record<string, unknown>[] } } };
  it('rejects the team source with a shot count trigger', () => {
    const def = rawDefinition<RawS1>(TRONY);
    const acc = def.skills.skill1.effects[0]!.accumulate as Record<string, unknown>;
    acc.source = 'team';
    expect(() => parseSkillDefinition(def)).toThrow(/unknown field/);
  });
  it('rejects a cap delay of 0 frames', () => {
    const def = rawDefinition<RawS1>(TRONY);
    (def.skills.skill1.effects[0]!.accumulate as Record<string, unknown>).capDelayFrames = 0;
    expect(() => parseSkillDefinition(def)).toThrow(/capDelayFrames/);
  });
});

/** 窓 [start, end) の、枠 slot の通常攻撃の値の和（trace） */
function shotsIn(r: SimResult, slot: number, start: number, end: number): number {
  let sum = 0;
  for (const e of r.events)
    if (e.kind === 'trigger' && e.slot === slot && e.frame >= start && e.frame < end) sum += e.damage;
  return sum;
}

/** 蓄積爆破の 5 秒（294f）と切れるまでの遅れ・届いた発からの遅れ（data/skills/501.json） */
const BLAST = 294 + 16;
const CAP_DELAY = 13;

describe('蓄積爆破（トロニー単騎）', () => {
  const input = inputOf([slotOf(TRONY)]);
  const r = runSimulation(input);
  const explosions = explosionsOf(r);
  const releases = planTeamRun(input).accumulateReleases;

  it('expires 5 s + 16 frames after the applying shot and deals 50% of the later shots (C-0903)', () => {
    expect(explosions.length).toBeGreaterThan(20);
    explosions.forEach((h, k) => {
      const acc = h.accumulate!;
      expect(acc.capped).toBeUndefined();
      expect(h.frame - acc.opened).toBe(BLAST);
      expect(r.shots[0]!.frames).toContain(acc.opened);
      const later = shotsIn(r, 0, acc.opened + 1, h.frame);
      expect(later).toBeGreaterThan(0);
      expect(h.hit.perActivation).toBeCloseTo(0.5 * later, 4);
      // 1 パス目が数えた値と同じ
      expect(releases[k]!.stored).toBeCloseTo(h.hit.perActivation, 4);
    });
  });

  it('applies again only after the explosion (no overlapping windows)', () => {
    for (let k = 1; k < explosions.length; k++)
      expect(explosions[k]!.accumulate!.opened).toBeGreaterThanOrEqual(explosions[k - 1]!.frame);
  });

  it('charges one hit of the shooter’s gauge at the expiry (C-0430)', () => {
    const def = rawDefinition<{ skills: { skill1: { effects: unknown[]; notes: unknown[] } } }>(TRONY);
    def.skills.skill1.effects = [];
    def.skills.skill1.notes = [{ ja: 'テスト', en: 'test', kind: 'modeling' }];
    const without = run([slotOf(TRONY, parseSkillDefinition(def))]);
    const first = (x: SimResult) => x.schedule!.gaugeFullFrames[0]!;
    expect(first(r)).toBeLessThan(first(without));
    // 単騎は 1 回目の満タンの前に爆発が 1 回あり、その 56,000 のぶん、フルチャージの発（140,000）1 回だけ早く満ちる
    expect(r.shots[0]!.frames.filter((f) => f <= first(without)).length).toBe(
      r.shots[0]!.frames.filter((f) => f <= first(r)).length + 1,
    );
  });
});

describe('蓄積爆破（リター・デルタ・トロニー）', () => {
  const input = inputOf([slotOf(LITER), slotOf(DELTA), slotOf(TRONY)], 2);
  const r = runSimulation(input);
  const explosions = explosionsOf(r);
  const releases = planTeamRun(input).accumulateReleases;

  it('agrees between the first pass (frames) and the second pass (values)', () => {
    expect(releases.length).toBe(explosions.length);
    explosions.forEach((h, k) => {
      const x = releases[k]!;
      expect(h.frame).toBe(x.frame);
      expect(h.accumulate!.cap).toBeCloseTo(x.cap, 4);
      expect(h.hit.perActivation).toBeCloseTo(x.capped ? x.cap : x.stored, 4);
    });
  });

  it('deals the cap 13 frames after the reaching shot (C-0904)', () => {
    const capped = explosions.filter((h) => h.accumulate!.capped === true);
    expect(capped.length).toBeGreaterThan(0);
    for (const h of capped) {
      const acc = h.accumulate!;
      expect(h.hit.perActivation).toBe(acc.cap);
      expect(r.shots[2]!.frames).toContain(h.frame - CAP_DELAY);
      // 届いた発までの溜めた値（1 パス目）は最大量以上
      const x = releases.find((y) => y.frame === h.frame)!;
      expect(x.stored).toBeGreaterThanOrEqual(x.cap);
      expect(acc.end).toBe(h.frame - CAP_DELAY + 1);
    }
  });

  it('adds the Burst accumulation ratio increase to 50% (C-0903)', () => {
    const boosted = explosions.filter(
      (h) =>
        h.accumulate!.capped === undefined &&
        h.hit.perActivation > 0.5 * shotsIn(r, 2, h.accumulate!.start, h.accumulate!.end) + 1,
    );
    expect(boosted.length).toBeGreaterThan(0);
    for (const h of boosted)
      expect(h.hit.perActivation).toBeLessThanOrEqual(
        (0.5 + 0.6283) * shotsIn(r, 2, h.accumulate!.start, h.accumulate!.end) + 1,
      );
  });
});
