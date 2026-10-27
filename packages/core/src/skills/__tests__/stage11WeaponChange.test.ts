// 2 段目の段 11 の PR 1（plan/design-skill-stage11.md 2.1・2.2 節）: 状態のフルスタックで起こす使用武器の変更、CDN に無い変更後の武器の形
// （rateOfFire・instantFire・firstShotDelayFrames）、残弾数減少（ammoDecrease）と変更の終わりのきっかけ（{ weaponChangeEnd }）。
// 使い手はラプラス：アルティメットヒーロー（103）の S1（V-0528）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { drainAmmo, initialShooter } from '../../frame/shooter.ts';
import { firingParams } from '../../frame/firing.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LAPLACE = 103;
const character = (id: number) => readJson<CharacterData>(`../../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`));

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
function withSkill1(...effects: unknown[]): unknown {
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-27',
    skills: { skill1: { effects }, skill2: none, burst: none },
  };
}
const warmUp = {
  kind: 'state',
  state: 'warmUp',
  trigger: { count: 'fullChargeShot' },
  target: 'self',
  maxStacksRef: 3,
  durationUntil: 'battleEnd',
  contents: [{ stat: 'chargeSpeed', ref: 2 }],
};
const change = {
  kind: 'weaponChange',
  trigger: { fullStack: 'warmUp' },
  damageRef: 5,
  maxAmmoRef: 6,
  rateOfFire: 1440,
  instantFire: true,
  firstShotDelayFrames: 25,
};

describe('語彙の検証', () => {
  it('accepts a full-stack weapon change with the fields read from recordings', () => {
    expect(() => parseSkillDefinition(withSkill1(warmUp, change))).not.toThrow();
  });

  it('rejects instantFire with charge parameters and a negative first-shot delay', () => {
    expect(() => parseSkillDefinition(withSkill1(warmUp, { ...change, chargeTimeSeconds: 0.3 }))).toThrow(
      /instantFire cannot be combined/,
    );
    expect(() => parseSkillDefinition(withSkill1(warmUp, { ...change, firstShotDelayFrames: -1 }))).toThrow(
      /non-negative integer/,
    );
  });

  it('allows { weaponChangeEnd } only in ammoDecrease, which targets self only', () => {
    const decrease = { kind: 'ammoDecrease', trigger: { weaponChangeEnd: true }, target: 'self', ref: 7 };
    expect(() => parseSkillDefinition(withSkill1(warmUp, change, decrease))).not.toThrow();
    expect(() => parseSkillDefinition(withSkill1(warmUp, change, { ...decrease, target: 'allies' }))).toThrow(
      /ammoDecrease must target "self"/,
    );
    expect(() => parseSkillDefinition(withSkill1(warmUp, change, { ...decrease, trigger: 'burstUse' }))).toThrow(
      /ammoDecrease needs the trigger/,
    );
    expect(() =>
      parseSkillDefinition(
        withSkill1({ kind: 'timed', trigger: { weaponChangeEnd: true }, target: 'self', stat: 'attack', ref: 1 }),
      ),
    ).toThrow(/only allowed in ammoDecrease/);
  });

  it('rejects rateOfFire when CDN gives the changed rate (a burst weapon change)', () => {
    const def = definitionOf(LAPLACE);
    const c = character(LAPLACE);
    const burst = { ...def.skills.burst, effects: [{ ...change, trigger: 'burstUse' as const }] };
    const withCdn = { ...c, burstSkill: { ...c.burstSkill, changeWeapon: { rateOfFire: 1440, shotId: 1 } } };
    expect(() =>
      resolveTimed({ ...def, skills: { ...def.skills, burst } } as typeof def, withCdn, MAX_SKILL_LEVELS),
    ).toThrow(/rateOfFire is given by CDN/);
  });
});

describe('残弾数減少', () => {
  it('drains the ammo and starts a reload at 0 (the last shot rule: the chunk minus 1)', () => {
    const shot = { ...character(LAPLACE).shot };
    const params = firingParams(shot);
    const state = initialShooter(shot, undefined, params);
    state.ammo = 115;
    state.wait = 0;
    drainAmmo(state, 115, params);
    expect(state.ammo).toBe(0);
    expect(state.phase).toBe('reloading');
    expect(state.wait).toBeGreaterThan(0);
  });
});

describe('ラプラス：アルティメットヒーローの S1（V-0528）', () => {
  const c = character(LAPLACE);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(LAPLACE), levels: MAX_SKILL_LEVELS },
  };
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
  const r = runSimulation(input);
  const log = r.shots[0]!;
  const changed = new Set(log.weaponChangeShotFrames ?? []);

  it('shoots 5 fully charged shots with warm-up, then 120 changed shots, and reloads after the change (0121-14〜17)', () => {
    const base = log.frames.filter((f) => !changed.has(f));
    const changedShots = log.frames.filter((f) => changed.has(f));
    const first = base.slice(0, 5);
    expect(first.slice(1).map((f, i) => f - first[i]!)).toEqual([53, 48, 42, 36]);
    const window = changedShots.filter((f) => f < base[5]!);
    expect(window).toHaveLength(120);
    expect(window[0]! - first[4]!).toBe(27);
    expect(base[5]! - window[119]!).toBe(230);
    // 変更後の武器の発は fullChargeShot に数えない（ウォームアップは次のマガジンで 0 から）
    expect(log.unchargedShotFrames).toEqual(changedShots);
    expect(base.slice(5, 10).map((f, i, xs) => (i === 0 ? 0 : f - xs[i - 1]!)).slice(1)).toEqual([53, 48, 42, 36]);
  });

  it('records the ammo decrease when each change ends', () => {
    const decreases = r.instants.filter((x) => x.effect.kind === 'ammoDecrease');
    expect(decreases.map((x) => x.frame)).toEqual(log.weaponChangeEnds);
    for (const x of decreases) expect(x.amount).toBe(-c.shot.maxAmmo);
  });
});
