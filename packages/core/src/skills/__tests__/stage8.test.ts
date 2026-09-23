// Stage 8: DSL の追加（射撃の回数・発動の回数・段階突入のトリガー、damage、distributedDamage / burstGaugeSpeed）。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { planFixedCycle } from '../../burst/fixedCycle.ts';
import type { ShotLog } from '../../sim/shots.ts';
import type { SkillRaw } from '../../types.ts';
import { computeBurstHit, resolveDamageEffects, type ResolvedSkillDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveTimed, resolveTrigger } from '../resolve.ts';
import { buffStartFrames, planBuffTimeline, triggerFrames } from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const skill = (values: string[]): SkillRaw => ({
  id: 9,
  name: { ja: 'テスト', en: 'Test' },
  description: { ja: '', en: '' },
  values: values.map(tenLevels),
});

function definition(skills: Partial<SkillDefinition['skills']>): unknown {
  const none = { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-09-23',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

describe('parseSkillDefinition (Stage 8)', () => {
  it('accepts shot-count and event-count triggers on timed, and damage in any slot', () => {
    const def = parseSkillDefinition(
      definition({
        skill1: {
          support: 'supported',
          effects: [
            {
              kind: 'timed',
              trigger: { count: 'burstUse', atLeast: 2 },
              target: 'self',
              stat: 'critDamage',
              ref: 1,
              durationRef: 2,
            },
            { kind: 'damage', trigger: { count: 'normalShot', everyRef: 3 }, damageType: 'skill', ref: 4 },
            { kind: 'damage', trigger: { count: 'fullChargeShot', every: 3 }, damageType: 'distributed', ref: 4 },
          ],
        },
        skill2: {
          support: 'supported',
          effects: [
            {
              kind: 'timed',
              trigger: 'burstStage3Enter',
              target: 'self',
              stat: 'distributedDamage',
              ref: 1,
              durationRef: 2,
            },
            { kind: 'passive', target: 'self', stat: 'burstGaugeSpeed', ref: 1 },
          ],
        },
      }),
    );
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['timed', 'damage', 'damage']);
    expect(def.skills.skill2.effects[0]).toMatchObject({ trigger: 'burstStage3Enter', stat: 'distributedDamage' });
  });

  const withEffect = (effect: unknown) =>
    definition({ skill1: { support: 'supported', effects: [effect] } as SkillDefinition['skills']['skill1'] });
  const timed = { kind: 'timed', target: 'self', stat: 'attack', ref: 1, durationRef: 2 };

  it('rejects malformed count triggers', () => {
    const bad = [
      { count: 'normalShot', every: 10, everyRef: 1 },
      { count: 'normalShot', every: 0 },
      { count: 'normalShot', every: 2.5 },
      { count: 'normalShot', each: 10 },
      { count: 'burstUse', atLeast: 0 },
      { count: 'burstUse' },
      { count: 'burstUse', atLeast: 1, every: 2 },
      { count: 'hits', every: 10 },
    ];
    for (const trigger of bad) {
      expect(() => parseSkillDefinition(withEffect({ ...timed, trigger })), JSON.stringify(trigger)).toThrow(
        /skill definition/,
      );
    }
  });

  it('refuses burstGaugeSpeed on timed effects (it would feed back into the schedule)', () => {
    expect(() =>
      parseSkillDefinition(withEffect({ ...timed, trigger: 'battleStart', stat: 'burstGaugeSpeed' })),
    ).toThrow(/only allowed in passive/);
  });

  it('refuses unknown damage types (damage on every shot is allowed since Stage 11 Modernia)', () => {
    const dmg = { kind: 'damage', damageType: 'skill', ref: 1 };
    // Stage 11 モダニア: 射撃ごとの倍率ダメージは 1 トリガーの値に畳み込むので書ける（stage11Modernia.test.ts）
    expect(() => parseSkillDefinition(withEffect({ ...dmg, trigger: { count: 'normalHit' } }))).not.toThrow();
    expect(() => parseSkillDefinition(withEffect({ ...dmg, trigger: { count: 'normalHit', every: 1 } }))).not.toThrow();
    expect(() => parseSkillDefinition(withEffect({ ...dmg, trigger: 'burstUse', damageType: 'dot' }))).toThrow(
      /damageType/,
    );
  });
});

describe('resolveTrigger', () => {
  it('reads everyRef at the skill level and keeps other triggers as they are', () => {
    const s = skill(['10', '2.5']);
    expect(resolveTrigger({ count: 'normalShot', everyRef: 1 }, s, 10)).toEqual({ count: 'normalShot', every: 10 });
    expect(resolveTrigger({ count: 'normalHit', every: 4 }, s, 10)).toEqual({ count: 'normalHit', every: 4 });
    expect(resolveTrigger({ count: 'burstUse', atLeast: 3 }, s, 10)).toEqual({ count: 'burstUse', atLeast: 3 });
    expect(resolveTrigger('burstStage2Enter', s, 10)).toBe('burstStage2Enter');
    expect(() => resolveTrigger({ count: 'normalShot', everyRef: 2 }, s, 10)).toThrow(RangeError);
  });
});

describe('triggerFrames / buffStartFrames (Stage 8)', () => {
  // 9 発撃ってリロード、また 9 発…の列（ドレイク型 SG）
  const frames = 1000;
  const log: ShotLog = {
    frames: [0, 40, 80, 120, 160, 200, 240, 280, 320, 400, 440, 480, 520, 560, 600, 640, 680, 720, 800, 840],
    fullCharge: false,
  };

  it('fires on the every-th shot and keeps counting across reloads', () => {
    expect(triggerFrames({ count: 'normalShot', every: 10 }, null, 0, frames, [log])).toEqual([400, 840]);
    expect(triggerFrames({ count: 'normalHit', every: 7 }, null, 0, frames, [log])).toEqual([240, 560]);
    // バーストなし（schedule null）でも射撃の回数は発火する
    expect(triggerFrames({ count: 'normalShot', every: 10 }, null, 0, 500, [log])).toEqual([400]);
  });

  it('starts buff windows on the frame after the triggering shot', () => {
    expect(buffStartFrames({ count: 'normalShot', every: 10 }, null, 0, frames, [log])).toEqual([401, 841]);
    // 最後のフレームの射撃で付くバフは戦闘時間の外
    expect(buffStartFrames({ count: 'normalShot', every: 10 }, null, 0, 841, [log])).toEqual([401]);
  });

  it('counts full-charge shots only for charge weapons', () => {
    expect(triggerFrames({ count: 'fullChargeShot', every: 3 }, null, 0, frames, [log])).toEqual([]);
    const charged = { ...log, fullCharge: true };
    expect(triggerFrames({ count: 'fullChargeShot', every: 3 }, null, 0, frames, [charged])).toEqual([
      80, 200, 320, 480, 600, 720,
    ]);
  });

  it('fires event counts from the atLeast-th event on, every time', () => {
    const schedule = planFixedCycle([{ burstStep: 'Step1' }, { burstStep: 'Step2' }, { burstStep: 'Step3' }], 6000);
    expect(triggerFrames({ count: 'burstUse', atLeast: 1 }, schedule, 2, 6000)).toEqual([600, 1800, 3000, 4200, 5400]);
    expect(triggerFrames({ count: 'burstUse', atLeast: 3 }, schedule, 2, 6000)).toEqual([3000, 4200, 5400]);
    expect(triggerFrames({ count: 'fullBurstStart', atLeast: 5 }, schedule, 0, 6000)).toEqual([5400]);
    expect(triggerFrames({ count: 'burstUse', atLeast: 6 }, schedule, 2, 6000)).toEqual([]);
    expect(triggerFrames({ count: 'burstUse', atLeast: 1 }, null, 2, 6000)).toEqual([]);
  });

  it('builds a timeline whose count-triggered window skips the triggering shot', () => {
    const def = parseSkillDefinition({
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-09-23',
      skills: {
        skill1: {
          support: 'supported',
          effects: [
            {
              kind: 'timed',
              trigger: { count: 'normalShot', every: 10 },
              target: 'self',
              stat: 'attack',
              ref: 1,
              durationSeconds: 1,
            },
          ],
        },
        skill2: { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] },
        burst: { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] },
      },
    });
    const character = makeCharacter({}, { skills: { skill1: skill(['20']), skill2: skill([]), burst: skill([]) } });
    const slots = [{ character, definition: def, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 }];
    const t = planBuffTimeline(slots, null, frames, [log]);
    expect(t.windows.map((w) => [w.start, w.end])).toEqual([
      [401, 461],
      [841, 901],
    ]);
    expect(resolveTimed(def, character, MAX_SKILL_LEVELS)[0]!.trigger).toEqual({ count: 'normalShot', every: 10 });
    // shots を渡さなければ射撃の回数は発火しない（Stage 7 までの呼び出し方）
    expect(planBuffTimeline(slots, null, frames).windows).toEqual([]);
  });
});

describe('damage effects and the distributed multiplier', () => {
  it('resolves damage effects with their slot, trigger and multiplier', () => {
    const def = parseSkillDefinition(
      definition({
        skill2: {
          support: 'supported',
          effects: [{ kind: 'damage', trigger: { count: 'normalShot', everyRef: 1 }, damageType: 'skill', ref: 2 }],
        },
      }),
    );
    const character = makeCharacter(
      {},
      { skills: { skill1: skill([]), skill2: skill(['10', '98.55']), burst: skill([]) } },
    );
    expect(resolveDamageEffects(def, character, MAX_SKILL_LEVELS)).toEqual([
      {
        source: { resourceId: 1, skill: 'skill2', name: { ja: 'テスト', en: 'Test' } },
        damageType: 'skill',
        multiplier: 98.55 / 100,
        trigger: { count: 'normalShot', every: 10 },
        effectIndex: 0,
      },
    ]);
  });

  it('multiplies (1 + distributedDamage) onto distributed effects only', () => {
    const effect = (damageType: ResolvedSkillDamage['damageType']): ResolvedSkillDamage => ({
      source: { resourceId: 1, skill: 'burst', name: { ja: '', en: '' } },
      damageType,
      multiplier: 1,
    });
    const hit = computeBurstHit({
      attack: 1100,
      enemy: { defence: 100, element: 'Fire', hasCore: false },
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      effects: [effect('skill'), effect('distributed'), effect('additional')],
      distributedDamageMultiplier: 1.9001,
    });
    expect(hit.perEffect.map((p) => p.expected)).toEqual([1000, 1900.1, 1000]);
    expect(hit.distributedDamageMultiplier).toBe(1.9001);
  });
});
