// サクラ：ブルーム・イン・サマー（284）の語彙（plan/design-sakura-bis.md 2 節）: dot のクールタイムの印（2.1 節）と、バーストのヒットごとに
// 付ける dot（perBurstHit。2.2 節）の検証・解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { resolveDotEffects } from '../burstDamage.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill2: Effects; burst: Effects } };
const SAKURA_BIS = 284;
const raw = rawDefinition<Raw>(SAKURA_BIS);
const cooldownDot = raw.skills.skill2.effects.findIndex(
  (e) => e.kind === 'dot' && typeof e.trigger === 'object' && (e.trigger as { cooldown?: true }).cooldown === true,
);
const burstDot = raw.skills.burst.effects.findIndex((e) => e.kind === 'dot');

const patched = (slot: 'skill2' | 'burst', index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return copy;
};

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(cooldownDot).toBeGreaterThanOrEqual(0);
    expect(burstDot).toBeGreaterThanOrEqual(0);
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('rejects a dot on a cooldown timer that applies a state', () => {
    expect(() => parseSkillDefinition(patched('skill2', cooldownDot, { state: 'hacked' }))).toThrow(
      /a dot on a cooldown timer cannot apply a state/,
    );
  });

  it('keeps rejecting a dot with gauge on a cooldown timer', () => {
    expect(() => parseSkillDefinition(patched('skill2', cooldownDot, { gaugeOnApply: true }))).toThrow(
      /without cooldown or since/,
    );
  });

  it('accepts only true for perBurstHit on a dot', () => {
    expect(() => parseSkillDefinition(patched('burst', burstDot, { perBurstHit: false }))).toThrow(/expected true/);
  });

  it('rejects perBurstHit on a dot without the trigger burstUse', () => {
    expect(() => parseSkillDefinition(patched('burst', burstDot, { trigger: 'fullBurstStart' }))).toThrow(
      /perBurstHit needs the trigger "burstUse"/,
    );
  });

  it.each([{ delayFrames: 5 }, { gaugeOnTick: true }])('rejects perBurstHit on a dot with %o', (patch) => {
    expect(() => parseSkillDefinition(patched('burst', burstDot, patch))).toThrow(/perBurstHit cannot be used with/);
  });
});

describe('解決', () => {
  it('keeps the cooldown mark and perBurstHit on the resolved dots', () => {
    const dots = resolveDotEffects(parseSkillDefinition(raw), characterOf(SAKURA_BIS), MAX_SKILL_LEVELS);
    const s2 = dots.find((d) => d.source.skill === 'skill2' && d.effectIndex === cooldownDot)!;
    expect(s2.trigger).toEqual({ everySeconds: 20, cooldown: true });
    expect(s2.perBurstHit).toBeUndefined();
    const burst = dots.find((d) => d.source.skill === 'burst')!;
    expect(burst.perBurstHit).toBe(true);
    // Lv10: 1 スタック 35.16%・上限 10・10 秒
    expect(burst.multiplier).toBeCloseTo(0.3516, 10);
    expect(burst.dot).toMatchObject({ maxStacks: 10, durationSeconds: 10, firstTick: 'afterInterval' });
  });
});
