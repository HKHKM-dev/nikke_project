// K の編（plan/design-k.md 2.2・2.4 節）: 当たったペレットのクリティカルの回数 critPelletHit（1 発で何回も発火する）と、二丁持ちでも
// マガジンに 1 回の最後の弾丸 lastShotOnce の読み込みと数え方
import { describe, expect, it } from 'vitest';
import { parseSkillDefinition } from '../parse/definition.ts';
import { createFireCounter, shotCountWeight, type FrameEvents, type ShotEvent } from '../triggers.ts';

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-21',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
const damage = (trigger: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kind: 'damage',
  trigger,
  damageType: 'additional',
  ref: 1,
  ...extra,
});
const ev = (frame: number, shot: ShotEvent | null): FrameEvents => ({
  frame,
  shots: [shot],
  activations: [],
  burstEffects: [],
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [false],
});
const shot = (extra: Partial<ShotEvent>): ShotEvent => ({
  lastShot: false,
  fullCharge: false,
  hits: 2,
  coreHits: 0,
  ...extra,
});

describe('critPelletHit の読み込み', () => {
  it('reads it in damage with every or everyRef', () => {
    expect(parse([damage({ count: 'critPelletHit', every: 4 })]).skills.skill1.effects[0]).toMatchObject({
      trigger: { count: 'critPelletHit', every: 4 },
    });
  });

  it('rejects it outside damage, without every, with a window or a chance, and with gauge hits', () => {
    const timed = { kind: 'timed', target: 'self', stat: 'attack', ref: 1, durationSeconds: 1 };
    expect(() => parse([{ ...timed, trigger: { count: 'critPelletHit', every: 4 } }])).toThrow(
      /only allowed in damage/,
    );
    expect(() => parse([damage({ count: 'critPelletHit' })])).toThrow(/needs every or everyRef/);
    expect(() => parse([damage({ count: 'critPelletHit', every: 4, firesDuring: 'fullBurst' })])).toThrow(
      /firesDuring cannot be used with critPelletHit/,
    );
    expect(() => parse([damage({ count: 'critPelletHit', every: 4, chance: 50 })])).toThrow(/chance cannot be used/);
    expect(() => parse([damage({ count: 'critPelletHit', every: 4 }, { gaugeHits: [0] })])).toThrow(
      /gaugeHits cannot be used with a critPelletHit count/,
    );
  });
});

describe('critPelletHit の数え方', () => {
  it('fires as many times as the multiples of N the count crosses on one shot', () => {
    const count = createFireCounter({ count: 'critPelletHit', every: 4 }, 0, null);
    // 6 → 4 を 1 回、12 → 8・12 を 2 回、13 → またがない、20 → 16・20 を 2 回
    const fires = [6, 6, 1, 7].map((w, f) => count(ev(f, shot({ critPellets: w }))));
    expect(fires).toEqual([1, 2, 0, 2]);
    expect(count(ev(4, null))).toBe(0);
  });

  it('weighs a shot by its critical pellets', () => {
    expect(shotCountWeight('critPelletHit', shot({ critHits: 1.2, critPellets: 6 }))).toBe(6);
    expect(shotCountWeight('critPelletHit', shot({}))).toBe(0);
  });
});

describe('lastShotOnce', () => {
  it('counts only the last shot of a magazine, not each muzzle of a dual-wield weapon', () => {
    const muzzle = shot({ lastShot: false, lastBullet: true });
    const last = shot({ lastShot: true, lastBullet: true });
    expect([shotCountWeight('lastShot', muzzle), shotCountWeight('lastShot', last)]).toEqual([1, 1]);
    expect([shotCountWeight('lastShotOnce', muzzle), shotCountWeight('lastShotOnce', last)]).toEqual([0, 1]);
  });

  it('rejects it with a firing window, like lastShot', () => {
    const timed = { kind: 'timed', target: 'self', stat: 'attack', ref: 1, durationSeconds: 1 };
    expect(() => parse([{ ...timed, trigger: { count: 'lastShotOnce', firesDuring: 'fullBurst' } }])).toThrow(
      /cannot be used with lastShotOnce/,
    );
  });
});
