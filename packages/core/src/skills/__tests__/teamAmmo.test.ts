// シンデレラ：クリスタルウェーブ編（plan/design-cinderella-cw.md 2.3・2.4 節）: 回数トリガー teamAmmo（味方が消費した弾の合計。C-1250）の
// 読み込みの制約と数え方、damage の条件 usedBurst（C-1252）の読み込みの制約。リトルマーメイド編（plan/design-little-mermaid.md 2.1 節）の
// damage（バブルバラージの N 回順番に攻撃）と、流し直しの装弾数無限の発
import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVELS, resolveTrigger } from '../resolve.ts';
import { createTriggerTracker, replayEvents, shotCountWeight, type FrameEvents, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import type { SkillDefinition } from '../types.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';

const character = characterOf(515);
const raw = rawDefinition<{ skills: Record<string, { effects: unknown[]; notes?: unknown[] }> }>(515);

/** 515.json を写して、skill1 の effects を差し替えた定義 */
function withSkill1Effects(effects: unknown[]): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill1!.effects = effects;
  return parseSkillDefinition(copy);
}

const gauge = { kind: 'burstGauge', trigger: { count: 'teamAmmo', everyRef: 8 }, target: 'allies', ref: 9 };
const shot = (ammo?: number): ShotEvent => ({
  lastShot: false,
  fullCharge: false,
  hits: 1,
  coreHits: 0,
  ...(ammo === undefined ? {} : { ammo }),
});
const frame = (f: number, shots: (ShotEvent | null)[]): FrameEvents => ({
  frame: f,
  shots,
  activations: [],
  burstEffects: [],
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [],
});

describe('teamAmmo の読み込み', () => {
  it('reads it in a burstGauge with every or everyRef', () => {
    expect(withSkill1Effects([gauge]).skills.skill1.effects[0]).toMatchObject(gauge);
  });

  it('rejects it outside burstGauge and damage, without every, and with a window, stacks or chance', () => {
    expect(() =>
      withSkill1Effects([
        {
          kind: 'timed',
          trigger: { count: 'teamAmmo', every: 200 },
          target: 'self',
          stat: 'attack',
          ref: 3,
          durationRef: 4,
        },
      ]),
    ).toThrow('a teamAmmo count is only allowed in burstGauge and damage');
    expect(() => withSkill1Effects([{ ...gauge, trigger: { count: 'teamAmmo' } }])).toThrow(
      'teamAmmo needs every or everyRef',
    );
    for (const extra of [{ firesDuring: 'fullBurst' }, { stacksRef: 8 }, { chanceRef: 8 }]) {
      expect(() => withSkill1Effects([{ ...gauge, trigger: { ...gauge.trigger, ...extra } }])).toThrow(
        'cannot be used with teamAmmo',
      );
    }
  });
});

describe('teamAmmo の damage', () => {
  const barrage = {
    kind: 'damage',
    trigger: { count: 'teamAmmo', every: 500 },
    ref: 7,
    damageType: 'skill',
    hitsRef: 8,
  };

  it('reads it with N sequential hits (hitsRef) and a delay', () => {
    const read = withSkill1Effects([{ ...barrage, delayFrames: 6, hitIntervalFrames: 12 }]).skills.skill1.effects[0];
    expect(read).toMatchObject({ ...barrage, delayFrames: 6, hitIntervalFrames: 12 });
  });

  it('rejects gaugePerHit and gaugeHits with a teamAmmo count', () => {
    expect(() => withSkill1Effects([{ ...barrage, gaugeHits: [0] }])).toThrow(
      'gaugeHits cannot be used with a teamAmmo count',
    );
    expect(() => withSkill1Effects([{ ...barrage, delayFrames: 6, gaugePerHit: true }])).toThrow(
      'gaugePerHit cannot be used with a teamAmmo count',
    );
  });
});

describe('teamAmmo の数え方', () => {
  it('ignores the own shot count interval change (everyAt)', () => {
    const trigger = resolveTrigger({ count: 'teamAmmo', every: 3 }, character.skills.skill1, MAX_SKILL_LEVELS.skill1);
    const fires = createTriggerTracker(trigger, 0, null, () => 1);
    expect(fires(frame(1, [shot(), shot()]))).toBe(false); // 2
    expect(fires(frame(2, [shot()]))).toBe(true); // 3
  });

  it('counts one per shot and nothing for a shot under infinite ammo', () => {
    expect(shotCountWeight('teamAmmo', shot())).toBe(1);
    expect(shotCountWeight('teamAmmo', shot(0))).toBe(0);
  });

  it('adds the shots of every slot and fires on the frame the total reaches each multiple, even without its own shot', () => {
    const trigger = resolveTrigger({ count: 'teamAmmo', every: 3 }, character.skills.skill1, MAX_SKILL_LEVELS.skill1);
    const fires = createTriggerTracker(trigger, 0, null);
    expect(fires(frame(1, [shot(), shot()]))).toBe(false); // 2
    expect(fires(frame(2, [null, shot()]))).toBe(true); // 3（自分は撃っていない）
    expect(fires(frame(3, [shot(0), shot()]))).toBe(false); // 4（装弾数無限の発は数えない）
    expect(fires(frame(4, [shot(), shot()]))).toBe(true); // 6
  });

  it('marks the infinite-ammo shots of the shot log as no ammo in the replayed events', () => {
    const events = replayEvents(null, [{ frames: [1, 2, 3], fullCharge: false, infiniteAmmoShotFrames: [2] }], 10);
    const ammo = events.filter((e) => e.shots[0]).map((e) => shotCountWeight('teamAmmo', e.shots[0]!));
    expect(ammo).toEqual([1, 0, 1]);
  });

  it('fires once when the shots of one frame pass N', () => {
    const trigger = resolveTrigger({ count: 'teamAmmo', every: 2 }, character.skills.skill1, MAX_SKILL_LEVELS.skill1);
    const fires = createTriggerTracker(trigger, 0, null);
    expect(fires(frame(1, [shot(), shot(), shot(), shot(), shot()]))).toBe(true); // 5
    expect(fires(frame(2, [shot()]))).toBe(true); // 6
    expect(fires(frame(3, [shot()]))).toBe(false); // 7
  });
});

describe('damage の usedBurst', () => {
  const damage = {
    kind: 'damage',
    trigger: 'fullBurstStart',
    ref: 7,
    damageType: 'skill',
    condition: { usedBurst: true },
  };

  it('reads it with a Full Burst start or end trigger only', () => {
    expect(withSkill1Effects([damage]).skills.skill1.effects[0]).toMatchObject({ condition: { usedBurst: true } });
    expect(() => withSkill1Effects([{ ...damage, trigger: 'burstUse' }])).toThrow(
      'usedBurst is only allowed with trigger',
    );
  });
});
