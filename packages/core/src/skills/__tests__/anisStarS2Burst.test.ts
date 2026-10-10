// アニス：スター（17）の S2「スターダスト」とバースト「スターアニス」（plan/design-anis-star-s2-burst.md）:
// 発射体爆発ダメージ▲（projectileExplosionDamage）、チャージ時間の固定（fixedChargeTime）、周期の自動攻撃（autoAttack）の検証と解決。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { simulateShotFrames } from '../../cadence.ts';
import { computeTriggerDamage, PROJECTILE_EXPLOSION_BUCKET, projectileExplosionMultiplier } from '../../damage.ts';
import { chargeShotIntervalFrames, firingParams } from '../../frame/firing.ts';
import { initialShooter, stepShooter } from '../../frame/shooter.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { chargeSecondsToFrames, DEFAULT_WEAPON_MODEL } from '../../weapons.ts';
import { ZERO_BUFFS } from '../buffs.ts';
import { computeSkillHit, resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { applyComposition } from '../composition.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const anis = readJson<CharacterData>('../../../data/characters/17.json');
const flower = readJson<CharacterData>('../../../data/characters/304.json');
const delta = readJson<CharacterData>('../../../data/characters/20.json');
type RawDefinition = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: Record<string, unknown>[] }> };
const raw = readJson<RawDefinition>('../../../data/skills/17.json');
const def = parseSkillDefinition(raw);

/** 定義の burst の効果を差し替えた JSON（検証エラーを見る用） */
function withBurst(effects: Record<string, unknown>[]): unknown {
  const copy = structuredClone(raw);
  copy.skills.burst.effects = effects;
  return copy;
}

const FIXED = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'fixedChargeTime', ref: 10, durationRef: 2 };
const AUTO = { kind: 'autoAttack', trigger: 'burstUse', ref: 1, intervalSeconds: 0.25, durationRef: 2 };

describe('アニス：スター（17）の S2 とバースト', () => {
  it('resolves the S2 buffs on Full Burst and the burst buffs on Burst use', () => {
    const timed = resolveTimed(def, anis, MAX_SKILL_LEVELS);
    expect(timed.map((e) => [e.source.skill, e.trigger, e.target, e.stat, e.scaling])).toEqual([
      ['skill2', 'fullBurstStart', 'allies', 'attack', 'casterAttack'],
      ['skill2', 'fullBurstStart', 'allies', 'projectileExplosionDamage', 'ratio'],
      ['skill2', 'fullBurstStart', 'allies', 'attackDamage', 'ratio'],
      ['burst', 'burstUse', 'self', 'fixedChargeTime', 'ratio'],
      ['burst', 'burstUse', 'self', 'attackDamage', 'ratio'],
    ]);
    [0.3501, 0.9203, 0.34, 0.7, 0.352].forEach((v, i) => expect(timed[i]!.value).toBeCloseTo(v, 12));
    expect(timed.every((e) => e.durationFrames === gameSecondsToFrames(10))).toBe(true);
  });

  it('drops the My Own Star buffs (S2 ATK up, burst Attack Damage up) with another Burst I ally', () => {
    const stats = (team: CharacterData[]) =>
      resolveTimed(applyComposition(def, team, 0), anis, MAX_SKILL_LEVELS).map((e) => `${e.source.skill}.${e.stat}`);
    expect(stats([anis, delta])).toContain('skill2.attack');
    expect(stats([anis, delta])).toContain('burst.attackDamage');
    expect(stats([anis, flower])).toEqual([
      'skill2.projectileExplosionDamage',
      'skill2.attackDamage',
      'burst.fixedChargeTime',
    ]);
  });

  it('resolves Shooting Stars as an automatic attack on the dot path', () => {
    const dots = resolveDotEffects(def, anis, MAX_SKILL_LEVELS);
    expect(dots).toHaveLength(1);
    expect(dots[0]!.multiplier).toBeCloseTo(0.4001, 12);
    expect(dots[0]!.trigger).toBe('burstUse');
    expect(dots[0]!.dot).toEqual({
      intervalSeconds: 0.25,
      durationSeconds: 10,
      firstTick: 'afterInterval',
      maxStacks: 1,
      gaugeOnTick: true,
      autoAttack: true,
    });
    // V-0124: シューティングスターのヒットは発射体の爆発（C-0213）
    expect(dots[0]!.projectileExplosion).toBe(true);
  });

  it('applies Projectile Explosion Damage up only to the projectile-explosion hits', () => {
    const buffs = { ...ZERO_BUFFS, attackDamage: 0.692, projectileExplosionDamage: 0.9203 };
    const [star] = resolveDotEffects(def, anis, MAX_SKILL_LEVELS);
    const trigger = computeTriggerDamage({
      character: anis,
      growth: { level: 200, grade: 3, core: 0 },
      enemy: { defence: 100, element: null, hasCore: true },
      attackOverride: 100000,
      buffs,
      condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
    });
    const withExplosion = computeSkillHit(
      [star!],
      anis,
      { defence: 100, element: null, hasCore: true },
      trigger,
      buffs,
      false,
    );
    const { projectileExplosion: _, ...plain } = star!;
    const without = computeSkillHit(
      [plain],
      anis,
      { defence: 100, element: null, hasCore: true },
      trigger,
      buffs,
      false,
    );
    expect(withExplosion.perActivation / without.perActivation).toBeCloseTo(2.6123 / 1.692, 12);
  });
});

describe('fixedChargeTime（チャージ時間の固定）', () => {
  it('replaces the charge time and ignores charge speed', () => {
    const base = firingParams(anis.shot);
    expect(base.chargeFrames).toBe(chargeSecondsToFrames(1));
    const fixed = firingParams(anis.shot, { ...ZERO_BUFFS, fixedChargeTime: 0.7, chargeSpeed: 0.5 });
    expect(fixed.chargeFrames).toBe(chargeSecondsToFrames(0.7));
  });

  it('drops the release frames between shots for DOWN_Charge, fixed or not (C-0222・C-0214)', () => {
    const base = firingParams(anis.shot);
    expect(base.downCharge).toBe(true);
    expect(chargeShotIntervalFrames(base, DEFAULT_WEAPON_MODEL)).toBe(59);
    const fixed = firingParams(anis.shot, { ...ZERO_BUFFS, fixedChargeTime: 0.7 });
    expect(chargeShotIntervalFrames(fixed, DEFAULT_WEAPON_MODEL)).toBe(42);
    const frames = simulateShotFrames(anis.shot, DEFAULT_WEAPON_MODEL, fixed);
    expect(frames.slice(1).map((f, i) => f - frames[i]!)).toEqual([42, 42, 42, 42, 42]);
    // 入力が UP のチャージ武器（デルタ）は今までどおり解放を足す（C-0535）
    const up = firingParams(delta.shot);
    expect(up.downCharge).toBe(false);
    expect(chargeShotIntervalFrames(up, DEFAULT_WEAPON_MODEL)).toBe(59 + 23);
  });

  it('carries the charge over after a reload when the fixed charge time ends mid-charge (C-0380)', () => {
    const slow = firingParams(anis.shot);
    const fixed = firingParams(anis.shot, { ...ZERO_BUFFS, fixedChargeTime: 0.7 });
    /** 0.7 秒の固定で 1 本目のマガジンを撃ち切り、最後の発から switchAt フレーム目に 1 秒へ戻したときの、リロードを挟む間隔 */
    const reloadCrossing = (switchAt: number): number => {
      const state = initialShooter(anis.shot, DEFAULT_WEAPON_MODEL, fixed);
      const fired: number[] = [];
      for (let f = 0; fired.length < 7; f++) {
        const params = fired.length === 6 && f - fired[5]! >= switchAt ? slow : fixed;
        if (stepShooter(state, anis.shot, DEFAULT_WEAPON_MODEL, params)) fired.push(f);
      }
      return fired[6]! - fired[5]!;
    };
    const inWindow = reloadCrossing(1000);
    const outOfWindow = reloadCrossing(1);
    expect(outOfWindow - inWindow).toBe(chargeSecondsToFrames(1) - chargeSecondsToFrames(0.7));
    // 込め終えた後（解放の分の間・チャージの途中）に戻しても、込め終えた時の 0.7 秒の待ちのままにせず、窓の外と同じ間隔で撃つ
    expect(reloadCrossing(inWindow - 50)).toBe(outOfWindow);
    expect(reloadCrossing(inWindow - 10)).toBe(outOfWindow);
    // 1 発目を撃った後に戻したなら、窓の中の値
    expect(reloadCrossing(inWindow + 1)).toBe(inWindow);
  });

  it('carries the charge elapsed over when the charge time changes mid-charge (C-0380)', () => {
    const slow = firingParams(anis.shot);
    const fixed = firingParams(anis.shot, { ...ZERO_BUFFS, fixedChargeTime: 0.7 });
    /** 1 発目の後、switchAt フレーム目から 0.7 秒の固定に切り替えたときの、1 発目から 2 発目までのフレーム数 */
    const secondShotAfter = (switchAt: number): number => {
      const state = initialShooter(anis.shot, DEFAULT_WEAPON_MODEL, slow);
      const fired: number[] = [];
      for (let f = 0; fired.length < 2; f++) {
        const params = fired.length === 1 && f - fired[0]! >= switchAt ? fixed : slow;
        if (stepShooter(state, anis.shot, DEFAULT_WEAPON_MODEL, params)) fired.push(f);
      }
      return fired[1]! - fired[0]!;
    };
    expect(secondShotAfter(1000)).toBe(59);
    // 経過 30f で切り替え: 0.7 秒（42f）に届いたところで撃つ
    expect(secondShotAfter(30)).toBe(42);
    // 経過 50f で切り替え: もう届いているので、切り替えのフレームに撃つ
    expect(secondShotAfter(50)).toBe(50);
  });

  it('is only allowed in timed, on self, without scaling, once per definition', () => {
    expect(() => parseSkillDefinition(withBurst([FIXED]))).not.toThrow();
    expect(() => parseSkillDefinition(withBurst([{ ...FIXED, target: 'allies' }]))).toThrow(/target "self"/);
    expect(() => parseSkillDefinition(withBurst([{ ...FIXED, scaling: 'ratio' }]))).toThrow(/in seconds/);
    expect(() => parseSkillDefinition(withBurst([{ ...FIXED, maxStacks: 2 }]))).toThrow(/cannot stack/);
    expect(() => parseSkillDefinition(withBurst([FIXED, FIXED]))).toThrow(/at most one fixedChargeTime/);
    const passive = structuredClone(raw);
    passive.skills.skill2.effects = [{ kind: 'passive', target: 'self', stat: 'fixedChargeTime', ref: 1 }];
    expect(() => parseSkillDefinition(passive)).toThrow(/only allowed in timed/);
  });
});

describe('projectileExplosionDamage（発射体爆発ダメージ▲）', () => {
  const buffs = { ...ZERO_BUFFS, attackDamage: 0.692, projectileExplosionDamage: 0.9203 };

  it('applies only to weapons with a projectile explosion (RL)', () => {
    expect(projectileExplosionMultiplier(delta.shot, buffs)).toBe(1);
    expect(projectileExplosionMultiplier(anis.shot, ZERO_BUFFS)).toBe(1);
    expect(projectileExplosionMultiplier(anis.shot, buffs)).not.toBe(1);
  });

  it('uses the bucket of PROJECTILE_EXPLOSION_BUCKET (E1, the Attack Damage bucket. C-0205)', () => {
    expect(PROJECTILE_EXPLOSION_BUCKET).toBe('attackDamage');
    // (1 + 0.692 + 0.9203) / (1 + 0.692)
    expect(projectileExplosionMultiplier(anis.shot, buffs) * 1.692).toBeCloseTo(2.6123, 12);
  });
});

describe('autoAttack（周期の自動攻撃）の検証', () => {
  it('accepts the Shooting Stars form and rejects broken ones', () => {
    expect(() => parseSkillDefinition(withBurst([AUTO]))).not.toThrow();
    expect(() => parseSkillDefinition(withBurst([{ ...AUTO, gaugePerHit: true }]))).not.toThrow();
    expect(() => parseSkillDefinition(withBurst([{ ...AUTO, intervalSeconds: 0 }]))).toThrow(/positive finite/);
    expect(() => parseSkillDefinition(withBurst([{ ...AUTO, status: 'x' }]))).toThrow(/unknown field/);
    expect(() => parseSkillDefinition(withBurst([{ ...AUTO, gaugePerHit: true, firstTick: 'atApplication' }]))).toThrow(
      /needs firstTick afterInterval/,
    );
    expect(() => parseSkillDefinition(withBurst([{ ...AUTO, trigger: 'fullBurstStart', gaugePerHit: true }]))).toThrow(
      /needs a shot count trigger or burstUse/,
    );
  });
});
