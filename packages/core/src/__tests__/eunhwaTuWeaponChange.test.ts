// 使用武器変更の武器のパラメータ（plan/design-true-damage-element.md 9 節）: 変更後の武器のチャージ時間・フルチャージ倍率・最大装弾数と、
// 撃ち切りで終わる変更。ウンファ：TU（95）のバーストの徹甲炸裂弾（C-0313）で、語彙の検証・解決・1 パス目と区間の窓の一致・
// sim と calc の整合を見る。編成は録画 232（I-DOLL・フラワー + ウンファ：TU。V-0207）と同じ
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from './fixtures.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import { planTeamRun } from '../frame/plan.ts';
import { computeTeamDamage, countShotsInRanges } from '../calc/model.ts';
import { METRICS } from '../records/observations.ts';
import { shotCountWeight } from '../skills/triggers.ts';
import { runSimulation, simGroupTotals } from '../sim/engine.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../skills/resolve.ts';
import { untilWeaponChangeEndWindows } from '../skills/timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { gameSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

function fixedSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

/** burst に weaponChange を 1 つだけ置いた定義（検証にかける前の JSON） */
function withBurst(effect: unknown): unknown {
  const blank = { effects: [], notes: [{ ja: 'x', en: 'x', kind: 'noDamage' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-06',
    skills: { skill1: blank, skill2: blank, burst: { effects: [effect] } },
  };
}

const BASE = { kind: 'weaponChange', trigger: 'burstUse', damageRef: 1 };

describe('語彙の検証', () => {
  it('accepts the weapon parameters, with maxAmmoRef in place of a duration', () => {
    const def = parseSkillDefinition(
      withBurst({ ...BASE, chargeTimeSeconds: 0.3, fullChargeDamage: 300, maxAmmoRef: 2 }),
    );
    expect(def.skills.burst.effects[0]).toEqual({
      ...BASE,
      chargeTimeSeconds: 0.3,
      fullChargeDamage: 300,
      maxAmmoRef: 2,
    });
  });

  it('rejects a duration next to maxAmmoRef, and still needs a duration without it', () => {
    expect(() => parseSkillDefinition(withBurst({ ...BASE, maxAmmoRef: 2, durationSeconds: 5 }))).toThrow(/maxAmmoRef/);
    expect(() => parseSkillDefinition(withBurst({ ...BASE, chargeTimeSeconds: 0.3 }))).toThrow(/exactly one/);
  });

  it('rejects non-positive parameters', () => {
    for (const bad of [{ chargeTimeSeconds: 0 }, { fullChargeDamage: -1 }, { maxAmmoRef: 0 }]) {
      expect(() => parseSkillDefinition(withBurst({ ...BASE, maxAmmoRef: 2, ...bad }))).toThrow();
    }
  });
});

describe('回数トリガー weaponChangeShot（論点 12）', () => {
  it('counts only the shots of a changed weapon', () => {
    const shot = { lastShot: true, fullCharge: true, hits: 1, coreHits: 1 };
    expect(shotCountWeight('weaponChangeShot', shot)).toBe(0);
    expect(shotCountWeight('weaponChangeShot', { ...shot, weaponChange: true })).toBe(1);
  });

  it('is allowed in timed, not in a cycle or with during', () => {
    const taken = {
      kind: 'timed',
      trigger: { count: 'weaponChangeShot' },
      target: 'allies',
      stat: 'damageTaken',
      ref: 1,
      durationRef: 2,
    };
    expect(parseSkillDefinition(withBurst(taken)).skills.burst.effects[0]).toMatchObject({
      trigger: { count: 'weaponChangeShot' },
    });
    const cycle = {
      kind: 'cycle',
      trigger: { count: 'weaponChangeShot' },
      steps: [
        { kind: 'damage', ref: 1, damageType: 'normal' },
        { kind: 'damage', ref: 2, damageType: 'normal' },
      ],
    };
    expect(() => parseSkillDefinition(withBurst(cycle))).toThrow(/weaponChangeShot/);
    const during = {
      kind: 'damage',
      trigger: { count: 'weaponChangeShot', every: 2, during: 'fullBurst', reset: 'never' },
      ref: 1,
      damageType: 'normal',
    };
    expect(() => parseSkillDefinition(withBurst(during))).toThrow(/weaponChangeShot/);
  });
});

describe('解決', () => {
  const character = readJson<CharacterData>('../../data/characters/95.json');
  const definition = parseSkillDefinition(readJson<unknown>('../../data/skills/95.json'));

  it('builds the Explosive Round from the description: 105.6%, 0.3 s, 300%, 1 round, true damage, ended by the empty magazine (C-0313)', () => {
    const weapon = resolveTimed(definition, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'weapon')!;
    expect(weapon.durationUntil).toBe('ammoSpent');
    expect(weapon.durationFrames).toBe(0);
    expect(weapon.weapon!.trueDamage).toBe(true);
    expect(weapon.weapon!.shot).toEqual({
      ...character.shot,
      damage: 10560,
      chargeTime: 0.3,
      fullChargeDamage: 3,
      maxAmmo: 1,
      rateOfFire: character.burstSkill.changeWeapon!.rateOfFire,
      endRateOfFire: character.burstSkill.changeWeapon!.rateOfFire,
      rateOfFireChangePerShot: 0,
    });
  });

  it('keeps the base weapon for omitted parameters, and rejects charge parameters on a non-charge weapon', () => {
    const raw = { ...makeCharacter(), resourceId: 1 };
    const character: CharacterData = {
      ...raw,
      burstSkill: { ...raw.burstSkill, changeWeapon: { rateOfFire: 600, shotId: 1 } },
      skills: { ...raw.skills, burst: { ...raw.skills.burst, values: [Array(10).fill('50'), Array(10).fill('3')] } },
    };
    const resolveWith = (effect: unknown) =>
      resolveTimed(parseSkillDefinition(withBurst(effect)) as SkillDefinition, character, MAX_SKILL_LEVELS)[0]!;
    const shot = resolveWith({ ...BASE, maxAmmoRef: 2 }).weapon!.shot;
    expect(shot).toMatchObject({ maxAmmo: 3, chargeTime: character.shot.chargeTime });
    expect(shot.fullChargeDamage).toBe(character.shot.fullChargeDamage);
    const ar: CharacterData = { ...character, shot: { ...character.shot, chargeTime: 0 } };
    expect(() =>
      resolveTimed(
        parseSkillDefinition(withBurst({ ...BASE, maxAmmoRef: 2, chargeTimeSeconds: 0.3 })) as SkillDefinition,
        ar,
        MAX_SKILL_LEVELS,
      ),
    ).toThrow(/charge weapon/);
  });
});

describe('untilWeaponChangeEndWindows', () => {
  it('ends each window at the first end after its start, merges overlapping starts, and runs to the end without one', () => {
    expect(untilWeaponChangeEndWindows([100, 500], [131, 532], 1000)).toEqual([
      [100, 131],
      [500, 532],
    ]);
    // 開いている変更に重ねて付いても、撃ち切りまでで終わる（1 パス目は持ち替え直さない）
    expect(untilWeaponChangeEndWindows([100, 120], [131, 160], 1000)).toEqual([[100, 131]]);
    expect(untilWeaponChangeEndWindows([900], [131], 1000)).toEqual([[900, 1000]]);
  });
});

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
const REC232: TeamInput = {
  slots: [fixedSlot(304), fixedSlot(95)],
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 0,
};

describe('録画 232 の編成（フラワー + ウンファ：TU）', () => {
  const plan = planTeamRun(REC232);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 1).map((a) => a.frame);
  const shots = plan.shots[1]!;
  const windows = plan.timeline.windows.filter((w) => w.slotIndex === 1 && w.effect.stat === 'weapon');

  it('fires exactly one Explosive Round per burst, from the frame after the burst, then goes back to the base SR', () => {
    expect(uses.length).toBeGreaterThan(3);
    expect(windows.map((w) => w.start)).toEqual(uses.map((f) => f + 1));
    expect(shots.weaponChangeEnds).toEqual(windows.map((w) => w.end));
    for (const w of windows) {
      const inside = shots.frames.filter((f) => w.start <= f && f < w.end);
      expect(inside).toEqual([w.end - 1]);
      expect(shots.lastShotFrames).toContain(w.end - 1);
    }
  });

  it('agrees between the loop and planBuffTimeline on the weapon windows', () => {
    const first = runFirstPass(toTimelineSlots(applyCompositionToTeam(REC232).slots), {
      frames: plan.frames,
      burst: true,
      controlledSlot: 0,
    });
    const key = (w: { slotIndex: number; start: number; end: number }) => `${w.slotIndex}:${w.start}-${w.end}`;
    expect(first.firingWindows.filter((w) => w.effect.stat === 'weapon').map(key)).toEqual(windows.map(key));
    expect(first.shots).toEqual(plan.shots);
  });

  it('counts the round in calc and sim alike, as a true-damage full charge of 105.6% × (300% + Charge Damage up)', () => {
    const calc = computeTeamDamage(REC232);
    const sim = runSimulation(REC232);
    const groups = simGroupTotals(sim, 1);
    const rounds = calc.slots[1]!.segments.filter((g) => g.buffs.weapon !== null);
    expect(rounds.length).toBeGreaterThan(0);
    expect(rounds.reduce((n, g) => n + g.triggers, 0)).toBe(windows.length);
    for (const g of rounds) {
      expect(g.triggerSource).toBe('shots');
      expect(g.trigger.trueDamage).toBe(true);
      expect(g.trigger.trueDamageMultiplier).toBeCloseTo(1.4224, 12);
      expect(g.buffs.weapon!.shot).toMatchObject({ damage: 10560, fullChargeDamage: 3, chargeTime: 0.3, maxAmmo: 1 });
    }
    calc.slots[1]!.segments.forEach((g, j) => {
      if (g.triggerSource !== 'shots') return;
      expect(g.triggers).toBe(groups[j]!.triggers);
      expect(g.damage).toBeCloseTo(groups[j]!.damage, 3);
    });
    const total = calc.slots[1]!.segments.reduce((n, g) => n + countShotsInRanges(shots.frames, g.ranges), 0);
    expect(total).toBe(shots.frames.length);
  });

  it('opens the Explosive Round’s Damage Taken up on the frame after the round, so the round itself does not get it (C-0312・論点 12)', () => {
    const taken = plan.timeline.windows.filter((w) => w.slotIndex === 1 && w.effect.stat === 'damageTaken');
    expect(taken.map((w) => w.start)).toEqual(windows.map((w) => w.end));
    expect(taken.every((w) => w.end - w.start === gameSecondsToFrames(10))).toBe(true);
  });

  it('matches the Explosive Round of recording 232 within 1: body, core in the distance bonus, core crit, core (232-10。C-0313)', () => {
    const sim = runSimulation(REC232);
    const hit = (frame: number, args: Record<string, boolean>) =>
      METRICS.hitDamage!.sim!(sim, { args: { slot: 2, frame, ...args }, input: REC232 } as never) as number;
    for (const w of windows.slice(0, 4)) {
      const round = [
        hit(w.end - 1, {}),
        hit(w.end - 1, { core: true, distance: true }),
        hit(w.end - 1, { core: true, crit: true }),
        hit(w.end - 1, { core: true }),
      ];
      [875582, 2013838, 2188954, 1751163].forEach((v, k) => expect(Math.abs(round[k]! - v)).toBeLessThan(1));
    }
  });
});
