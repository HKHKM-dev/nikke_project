// 環境コントロール強化の語彙 amplifies（plan/design-true-damage-element.md 3.5 節）。
// 定義の検証と、planBuffTimeline の窓（参照する窓が効いている所と切れた所・発火の瞬間の状態・値）を見る。定義に使ったのはエマ：TU のバースト（V-0230）。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { planFixedCycle } from '../../burst/fixedCycle.ts';
import { gameSecondsToFrame, gameSecondsToFrames } from '../../time.ts';
import { MAX_SKILL_LEVELS, isStateContent, resolveTimed } from '../resolve.ts';
import { planBuffTimeline, type TimelineSlot } from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition, type SkillEffect } from '../types.ts';
import type { SkillRaw } from '../../types.ts';

const FRAMES = gameSecondsToFrames(180);

/** burst に効果を並べた定義（検証にかける前の JSON） */
function withBurst(effects: unknown[]): unknown {
  const blank = { effects: [], notes: [{ ja: 'x', en: 'x', kind: 'noDamage' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-06',
    skills: { skill1: blank, skill2: blank, burst: { effects } },
  };
}

const amplify = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'allies',
  stat: 'damageTaken',
  durationSeconds: 10,
  amplifies: { skill: 'skill1', percent: 100 },
};

describe('amplifies の検証', () => {
  it('parses amplifies without ref', () => {
    const def = parseSkillDefinition(withBurst([amplify]) as never);
    expect(def.skills.burst.effects[0]).toMatchObject({ amplifies: { skill: 'skill1', percent: 100 } });
  });

  it('rejects a bad shape', () => {
    expect(() => parseSkillDefinition(withBurst([{ ...amplify, amplifies: { skill: 'skill1' } }]) as never)).toThrow(
      /percent: expected a positive number/,
    );
    expect(() =>
      parseSkillDefinition(withBurst([{ ...amplify, amplifies: { skill: 'skill1', percent: 100, x: 1 } }]) as never),
    ).toThrow(/expected \{ skill, percent \}/);
    expect(() =>
      parseSkillDefinition(withBurst([{ ...amplify, amplifies: { skill: 'skill4', percent: 100 } }]) as never),
    ).toThrow(/amplifies\.skill/);
  });

  it('rejects stats tracked in the first pass and fields that set the value or the window otherwise', () => {
    expect(() => parseSkillDefinition(withBurst([{ ...amplify, stat: 'attack' }]) as never)).toThrow(
      /amplifies is not supported for "attack"/,
    );
    expect(() => parseSkillDefinition(withBurst([{ ...amplify, ref: 1 }]) as never)).toThrow(
      /amplifies cannot be combined with ref/,
    );
    expect(() => parseSkillDefinition(withBurst([{ ...amplify, maxStacks: 2 }]) as never)).toThrow(
      /amplifies cannot be combined with maxStacks/,
    );
    expect(() =>
      parseSkillDefinition(
        withBurst([{ ...amplify, durationSeconds: undefined, durationUntil: 'fullBurstEnd' }]) as never,
      ),
    ).toThrow(/amplifies cannot be combined with durationUntil/);
  });
});

describe('amplifies の窓', () => {
  const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
  /** values: [1] = 受けるダメージ▲ %、[2] = 維持秒数 */
  const raw: SkillRaw = {
    id: 1,
    name: { ja: 'S', en: 'S' },
    description: { ja: '', en: '' },
    values: [tenLevels('3.9'), tenLevels('10')],
  };
  const character = makeCharacter(
    {},
    { resourceId: 1, burstStep: 'Step1', skills: { skill1: raw, skill2: raw, burst: raw } },
  );

  function slotOf(skill1: SkillEffect[], burst: SkillEffect[]): TimelineSlot {
    const definition: SkillDefinition = {
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-06',
      skills: {
        skill1: { support: 'supported', effects: skill1 },
        skill2: { support: 'unsupported', effects: [] },
        burst: { support: 'supported', effects: burst },
      },
    };
    return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
  }

  // 固定サイクルの I の発動は 588f（10 秒）・1764f（30 秒）・2940f（50 秒）…
  const schedule = planFixedCycle([{ burstStep: 'Step1' }, { burstStep: 'Step2' }], FRAMES);
  const base = { kind: 'timed', target: 'allies', stat: 'damageTaken', ref: 1 } as const;
  /** 戦闘開始から 15 秒（[0, 882)） */
  const atStart = { ...base, trigger: 'battleStart', durationSeconds: 15 } as SkillEffect;
  /** 35 秒ごとに 10 秒（35 秒の窓 [2059, 2647) は、30 秒の発動の窓 [1764, 2352) に重なる） */
  const later = { ...base, trigger: { everySeconds: 35 }, durationRef: 2 } as SkillEffect;

  it('resolves the value as the ratio of the referenced value', () => {
    const [effect] = resolveTimed(slotOf([], [amplify as SkillEffect])!.definition!, character, MAX_SKILL_LEVELS);
    expect(effect).toMatchObject({ value: 1, amplifies: { skill: 'skill1', percent: 100 }, durationFrames: 588 });
  });

  it('keeps the referenced value multiplied for the whole duration, and fires only while the caster is in that state', () => {
    const t = planBuffTimeline([slotOf([atStart, later], [amplify as SkillEffect]), slotOf([], [])], schedule, FRAMES);
    const amplified = t.windows.filter((w) => !isStateContent(w.effect) && w.effect.amplifies !== undefined);
    // 窓の中の発動は 10 秒・110 秒（105 秒の窓）・150 秒（140 秒の窓）。発動から 10 秒を、参照する窓が効いている所（その値 × 100%）と
    // 切れた所（発動の瞬間の値 × 200%）に分けて、参照する窓を受けた枠（味方全体）ごとに。30 秒の発動は 35 秒の窓に重なるが、
    // 発動の瞬間に効いていないので付かない（V-0230 の 263-05）
    expect(amplified.map((w) => [w.slotIndex, w.start, w.end, Number(w.effect.value.toFixed(6))])).toEqual([
      [0, 588, 882, 0.039],
      [0, 882, 1176, 0.078],
      [1, 588, 882, 0.039],
      [1, 882, 1176, 0.078],
      // 35 秒ごとの発動は k × ceil(35 ÷ 0.017) フレーム（C-0502）
      [0, 6468, 6765, 0.039],
      [0, 6765, 7056, 0.078],
      [1, 6468, 6765, 0.039],
      [1, 6765, 7056, 0.078],
      [0, 8820, 8824, 0.039],
      [0, 8824, 9408, 0.078],
      [1, 8820, 8824, 0.039],
      [1, 8824, 9408, 0.078],
    ]);
    expect(t.conditionSkips.map((s) => s.frame)).toContain(1764);
    expect(t.conditionSkips.map((s) => s.frame)).not.toContain(588);
    // 受けるダメージ▲の合計は、参照する窓が切れた後も発動から 10 秒は 2 倍（V-0230 の 263-03）
    const at = (frame: number) =>
      t.segments.find((s) => s.start <= frame && frame < s.end)!.slots[0]!.buffs.damageTaken;
    expect(at(600)).toBeCloseTo(0.078, 12);
    expect(at(900)).toBeCloseTo(0.078, 12);
    expect(at(1200)).toBe(0);
    expect(at(gameSecondsToFrame(36))).toBeCloseTo(0.039, 12);
  });

  it('scales by percent', () => {
    const t = planBuffTimeline(
      [slotOf([atStart], [{ ...amplify, amplifies: { skill: 'skill1', percent: 50 } } as SkillEffect])],
      schedule,
      FRAMES,
    );
    const at = (frame: number) =>
      t.segments.find((s) => s.start <= frame && frame < s.end)!.slots[0]!.buffs.damageTaken;
    expect(at(600)).toBeCloseTo(0.039 * 1.5, 12);
    expect(at(900)).toBeCloseTo(0.039 * 1.5, 12);
  });

  it('does nothing without a referenced window', () => {
    const t = planBuffTimeline([slotOf([], [amplify as SkillEffect])], schedule, FRAMES);
    expect(t.windows).toEqual([]);
    expect(t.conditionSkips.length).toBeGreaterThan(0);
  });
});
