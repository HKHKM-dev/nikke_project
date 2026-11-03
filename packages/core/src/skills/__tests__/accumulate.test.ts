// 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.1・2.2 節）: ドロシー（233）の烙印。爆発の値は、窓の中に的が受けた
// 味方全員のダメージの和（C-0901）で、最大量で切る。爆発は窓の終わりの releaseDelayFrames 後（C-0902）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { effectFrameOf } from '../../burst/schedule.ts';
import { runSimulation, type SimResult } from '../../sim/engine.ts';
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

function run(slots: TeamSlotInput[]): SimResult {
  return runSimulation({ slots, enemy, durationSeconds: 180, burst: true, controlledSlot: 0, trace: true });
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
  it('rejects a source other than team', () => {
    const def = rawDefinition<Raw>(DOROTHY);
    (def.skills.burst.effects[0]!.accumulate as Record<string, unknown>).source = 'self';
    expect(() => parseSkillDefinition(def)).toThrow(/team/);
  });
});
