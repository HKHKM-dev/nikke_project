// ニヒリスター（261）: 時間の周期のトリガー（{ everySeconds }）の DSL・解決・発火フレーム（plan/design-nihilister.md 8.1 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { timerFrames, triggerFrames } from '../timeline.ts';
import { createTriggerTracker } from '../triggers.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const nihilister = readJson<CharacterData>('../../../data/characters/261.json');
const raw261 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/261.json');

/** 261.json を写して、skill2 の effects を差し替えた定義を検証にかける */
function withSkill2(effects: unknown[]): unknown {
  const copy = structuredClone(raw261) as { skills: Record<string, { effects: unknown[] }> };
  copy.skills.skill2!.effects = effects;
  return copy;
}

const S2 = { kind: 'damage', trigger: { everySeconds: 10 }, ref: 1, damageType: 'skill' };

describe('everySeconds の検証', () => {
  it('parses the S2 of the definition', () => {
    const def = parseSkillDefinition(raw261);
    expect(def.skills.skill2.effects[0]).toMatchObject(S2);
  });

  it('is allowed in damage, dot, autoAttack and burstGaugeHit only', () => {
    const dot = { kind: 'dot', trigger: { everySeconds: 10 }, ref: 1, intervalSeconds: 1, durationSeconds: 5 };
    expect(() => parseSkillDefinition(withSkill2([dot]))).not.toThrow();
    const timed = {
      kind: 'timed',
      trigger: { everySeconds: 10 },
      target: 'self',
      stat: 'attack',
      ref: 1,
      durationSeconds: 5,
    };
    expect(() => parseSkillDefinition(withSkill2([timed]))).toThrow(
      /only allowed in damage, dot, autoAttack and burstGaugeHit/,
    );
    const heal = { kind: 'heal', trigger: { everySeconds: 10 }, target: 'self', ref: 1 };
    expect(() => parseSkillDefinition(withSkill2([heal]))).toThrow(
      /only allowed in damage, dot, autoAttack and burstGaugeHit/,
    );
  });

  it('rejects a non-positive value and unknown fields', () => {
    expect(() => parseSkillDefinition(withSkill2([{ ...S2, trigger: { everySeconds: 0 } }]))).toThrow(
      /everySeconds: expected a positive finite number/,
    );
    expect(() =>
      parseSkillDefinition(withSkill2([{ ...S2, trigger: { everySeconds: 10, count: 'normalShot' } }])),
    ).toThrow(/count: unknown field/);
  });
});

describe('everySeconds の解決と発火', () => {
  it('resolves the S2 hit as a damage effect with the timer', () => {
    const def = parseSkillDefinition(raw261);
    const [s2] = resolveDamageEffects(def, nihilister, MAX_SKILL_LEVELS);
    expect(s2).toMatchObject({ trigger: { everySeconds: 10 }, damageType: 'skill' });
    expect(s2!.source.skill).toBe('skill2');
    expect(s2!.multiplier).toBeCloseTo(1.1264, 10);
  });

  it('fires at k × N s from the start of battle, before the end (10 s → 17 times in 180 s)', () => {
    const frames = timerFrames(10, 10588);
    expect(frames).toHaveLength(17);
    expect(frames.slice(0, 3)).toEqual([588, 1176, 1765]);
    expect(frames.at(-1)).toBe(10000);
    expect(triggerFrames({ everySeconds: 10 }, null, 1, 10588)).toEqual(frames);
  });

  it('is not tracked per event (the event list has no timer frames)', () => {
    expect(() => createTriggerTracker({ everySeconds: 10 }, 0, null)).toThrow(/not tracked per event/);
  });
});
