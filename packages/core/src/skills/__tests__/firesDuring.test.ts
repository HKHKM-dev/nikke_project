// ソーダ：トゥインクルバニー S1 の数え方（V-0443・C-0580）: 回数のきっかけの発火の窓（firesDuring）。射撃は窓の外も含めて
// 戦闘中ずっと数え、N の倍数に届いた発が窓の中のときだけ発火する。数える窓（during）との違いと、読み込みの検証
import { describe, expect, it } from 'vitest';
import { createTriggerTracker, type FrameEvents, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition } from '../types.ts';

const shot: ShotEvent = { lastShot: false, fullCharge: false, hits: 1, coreHits: 0 };
const frameOf = (frame: number, s: ShotEvent | null, edge: 'start' | 'end' | null = null): FrameEvents => ({
  frame,
  shots: [s],
  activations: [],
  burstEffects: [],
  fullBurstStart: edge === 'start',
  fullBurstEnd: edge === 'end',
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [],
});

/** 窓の外で 4 発、窓 [10, 20) の中で 5 発、窓の外で 1 発、窓 [30, 40) の中で 3 発 */
const EVENTS: FrameEvents[] = [
  frameOf(0, shot),
  frameOf(1, shot),
  frameOf(2, shot),
  frameOf(3, shot),
  frameOf(10, shot, 'start'),
  frameOf(11, shot),
  frameOf(12, shot),
  frameOf(13, shot),
  frameOf(14, shot),
  frameOf(20, null, 'end'),
  frameOf(21, shot),
  frameOf(30, shot, 'start'),
  frameOf(31, shot),
  frameOf(32, shot),
  frameOf(40, null, 'end'),
];
const firedFrames = (fires: (ev: FrameEvents) => boolean) => EVENTS.filter((ev) => fires(ev)).map((ev) => ev.frame);

describe('firesDuring（発火の窓）', () => {
  it('counts every shot of the battle and fires only on multiples inside the window', () => {
    // 通し番号 3（f2。窓の外）は発火せずに過ぎ、6（f11）・9（f14）・12（f31）が発火する
    const fires = createTriggerTracker({ count: 'normalShot', every: 3, firesDuring: 'fullBurst' }, 0, null);
    expect(firedFrames(fires)).toEqual([11, 14, 31]);
  });

  it('differs from the counting window (during), which counts only the shots inside', () => {
    const restart = createTriggerTracker(
      { count: 'normalShot', every: 3, during: 'fullBurst', reset: 'fullBurstStart' },
      0,
      null,
    );
    expect(firedFrames(restart)).toEqual([12, 32]);
    const carry = createTriggerTracker({ count: 'normalShot', every: 3, during: 'fullBurst', reset: 'never' }, 0, null);
    expect(firedFrames(carry)).toEqual([12, 30]);
  });
});

describe('firesDuring の読み込み', () => {
  const definition = (trigger: unknown, kind = 'timed') => ({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-17',
    skills: {
      skill1: {
        effects: [
          kind === 'timed'
            ? { kind, trigger, target: 'self', stat: 'attack', ref: 1, durationSeconds: 5 }
            : { kind, trigger, target: 'allies', ref: 1 },
        ],
      },
      skill2: { effects: [], notes: [{ ja: 'なし', en: 'none', kind: 'unimplemented' }] },
      burst: { effects: [], notes: [{ ja: 'なし', en: 'none', kind: 'unimplemented' }] },
    },
  });

  it('parses the firing window and resolves it', () => {
    const trigger = { count: 'normalShot', everyRef: 2, firesDuring: 'fullBurst' };
    expect(parseSkillDefinition(definition(trigger)).skills.skill1.effects[0]).toMatchObject({ trigger });
  });

  it('rejects it with during, stacksRef, lastShot, chance, an unknown window and outside damage, timed and state', () => {
    const base = { count: 'normalShot', every: 3, firesDuring: 'fullBurst' };
    expect(() => parseSkillDefinition(definition({ ...base, during: 'fullBurst', reset: 'never' }))).toThrow(
      /firesDuring cannot be used with during/,
    );
    expect(() => parseSkillDefinition(definition({ ...base, stacksRef: 1 }))).toThrow(
      /firesDuring cannot be used with stacksRef/,
    );
    expect(() => parseSkillDefinition(definition({ ...base, count: 'lastShot' }))).toThrow(
      /firesDuring cannot be used with lastShot/,
    );
    expect(() =>
      parseSkillDefinition(definition({ count: 'normalShot', chance: 5, firesDuring: 'fullBurst' })),
    ).toThrow(/cannot be combined with firesDuring/);
    expect(() => parseSkillDefinition(definition({ ...base, firesDuring: 'burst' }))).toThrow(/firesDuring/);
    expect(() => parseSkillDefinition(definition(base, 'cooldownReduction'))).toThrow(
      /only allowed in damage, timed and state/,
    );
  });
});
