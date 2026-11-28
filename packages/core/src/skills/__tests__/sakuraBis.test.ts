// サクラ：ブルーム・イン・サマー（284）の語彙（plan/design-sakura-bis.md 2 節）: dot のクールタイムの印（2.1 節）と、バーストのヒットごとに
// 付ける dot（perBurstHit。2.2 節）の検証・解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { dotTicks } from '../../frame/dot.ts';
import { gameSecondsToFirstFrame } from '../../time.ts';
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
      /cooldown in dot cannot be used with state/,
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

  it('rejects a stacking dot with firstTick atApplication that applies a state or charges the gauge', () => {
    const { perBurstHit: _, ...plain } = raw.skills.burst.effects[burstDot]!;
    const stacking = { ...plain, trigger: { count: 'normalShot', every: 60 } };
    const copy = structuredClone(raw);
    copy.skills.burst.effects[burstDot] = { ...stacking, state: 'hacked' };
    expect(() => parseSkillDefinition(copy)).toThrow(/a stacking dot with firstTick atApplication cannot have state/);
    copy.skills.burst.effects[burstDot] = { ...stacking, gaugeOnApply: true };
    expect(() => parseSkillDefinition(copy)).toThrow(
      /a stacking dot with firstTick atApplication cannot have gaugeOnApply/,
    );
  });

  it('rejects perBurstHit on a dot with delayFrames', () => {
    expect(() => parseSkillDefinition(patched('burst', burstDot, { delayFrames: 5 }))).toThrow(
      /perBurstHit cannot be used with delayFrames/,
    );
  });
});

describe('解決', () => {
  it('keeps the cooldown mark and perBurstHit on the resolved dots', () => {
    const dots = resolveDotEffects(parseSkillDefinition(raw), characterOf(SAKURA_BIS), MAX_SKILL_LEVELS);
    const s2 = dots.find((d) => d.source.skill === 'skill2' && d.effectIndex === cooldownDot)!;
    expect(s2.trigger).toEqual({ everySeconds: 30, cooldown: true });
    expect(s2.perBurstHit).toBeUndefined();
    const burst = dots.find((d) => d.source.skill === 'burst')!;
    expect(burst.perBurstHit).toBe(true);
    // Lv10: 1 スタック 35.16%・上限 10・10 秒
    expect(burst.multiplier).toBeCloseTo(0.3516, 10);
    expect(burst.dot).toMatchObject({ maxStacks: 10, durationSeconds: 10, firstTick: 'atApplication' });
  });
});

// スタックする atApplication の刻み（plan/design-sakura-bis.md 8.3 節）: 付けるたびに 1 スタックぶんの tick、刻みは最後の付与から数え直す
describe('スタックする atApplication の刻み', () => {
  const hits = [0, 12, 24, 35, 47, 59, 71, 82, 94, 106].map((o) => 1000 + o);
  const ticks = dotTicks(hits, 1, 10, 5000, 'atApplication', 10);

  it('deals one stack on each application and restarts the cadence from the last application', () => {
    expect(ticks.filter((t) => t.stacks === 1).map((t) => t.frame)).toEqual(hits);
    const later = ticks.filter((t) => t.frame > hits.at(-1)!);
    const last = hits.at(-1)!;
    // 1.5 秒後から 1 秒おきに 9 回（維持 10 秒）。どれも 10 スタック
    expect(later.map((t) => t.frame)).toEqual(
      Array.from({ length: 9 }, (_, k) => last + gameSecondsToFirstFrame(k + 1.5) - 1),
    );
    expect(later.every((t) => t.stacks === 10)).toBe(true);
    expect(ticks.length).toBe(19);
  });

  it('starts again from one stack after the duration and caps the stacks', () => {
    const fires = [...Array.from({ length: 12 }, (_, k) => k * 5), 2000];
    const out = dotTicks(fires, 1, 10, 5000, 'atApplication', 10);
    const periodic = out.filter((t) => t.frame > 55 && t.frame < 2000);
    expect(periodic.every((t) => t.stacks === 10)).toBe(true);
    const after = out.filter((t) => t.frame > 2000);
    expect(after.every((t) => t.stacks === 1)).toBe(true);
  });

  it('stops the ticks at the end of battle', () => {
    expect(dotTicks([0, 30], 1, 10, 100, 'atApplication', 10).every((t) => t.frame < 100)).toBe(true);
  });
});
