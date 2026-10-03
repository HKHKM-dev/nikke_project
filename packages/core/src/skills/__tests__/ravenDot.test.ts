// レイヴン（851）: スタックする持続ダメージ（dot の maxStacksRef）と、持続ダメージのゲージ（gaugeOnApply・gaugeOnTick）の
// DSL・解決・tick とスタック（plan/design-raven-s1.md 2 節・4 節・8 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dotTickFrames, dotTickTracker, dotTicks, groupDotsByStatus } from '../../frame/plan.ts';
import { gameSecondsToFrame } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { resolveDotEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const raven = readJson<CharacterData>('../../../data/characters/851.json');
const raw851 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/851.json');

/** 851.json を写して、skill1 の effects を差し替えた定義を検証にかける */
function withSkill1(effects: unknown[]): unknown {
  const copy = structuredClone(raw851) as { skills: Record<string, { effects: unknown[] }> };
  copy.skills.skill1!.effects = effects;
  return copy;
}

const SHOCK = {
  kind: 'dot',
  trigger: { count: 'fullChargeShot' },
  ref: 1,
  intervalSeconds: 1,
  durationRef: 2,
  firstTick: 'afterInterval',
  maxStacksRef: 5,
  gaugeOnApply: true,
  gaugeOnTick: true,
};

describe('dot の maxStacksRef・gaugeOnApply・gaugeOnTick の検証', () => {
  it('parses the shock wave of the definition', () => {
    const def = parseSkillDefinition(raw851);
    expect(def.skills.skill1.effects[0]).toMatchObject(SHOCK);
  });

  it('needs firstTick afterInterval for the stacks and the tick gauge', () => {
    const { firstTick: _, ...atApplication } = SHOCK;
    expect(() => parseSkillDefinition(withSkill1([{ ...atApplication, gaugeOnTick: undefined }]))).toThrow(
      /maxStacksRef: needs firstTick afterInterval/,
    );
    const { maxStacksRef: __, ...noStacks } = atApplication;
    expect(() => parseSkillDefinition(withSkill1([noStacks]))).toThrow(/gaugeOnTick: needs firstTick afterInterval/);
  });

  it('accepts only true for the gauge flags and only with a shot count trigger', () => {
    expect(() => parseSkillDefinition(withSkill1([{ ...SHOCK, gaugeOnApply: false }]))).toThrow(
      /gaugeOnApply: expected true/,
    );
    expect(() => parseSkillDefinition(withSkill1([{ ...SHOCK, trigger: 'fullBurstStart' }]))).toThrow(
      /gaugeOnApply: needs a shot count trigger/,
    );
  });

  // V-0113（plan/design-raven-s1.md 10 節）: クルミのバースト使用時のハッキングにも tick のゲージを書く。付けたときの分は書けない
  it('accepts the tick gauge with burstUse, but not the apply gauge', () => {
    const { gaugeOnApply: _, maxStacksRef: __, ...tickOnly } = SHOCK;
    const def = parseSkillDefinition(withSkill1([{ ...tickOnly, trigger: 'burstUse' }]));
    expect(def.skills.skill1.effects[0]).toMatchObject({ trigger: 'burstUse', gaugeOnTick: true });
    expect(() => parseSkillDefinition(withSkill1([{ ...SHOCK, trigger: 'burstUse' }]))).toThrow(
      /gaugeOnApply: needs a shot count trigger/,
    );
    expect(() => parseSkillDefinition(withSkill1([{ ...tickOnly, trigger: 'fullBurstStart' }]))).toThrow(
      /gaugeOnTick: needs a shot count trigger or burstUse/,
    );
  });
});

describe('dot の解決（スタックとゲージ）', () => {
  it('resolves the max stacks from the description and the gauge flags', () => {
    const [shock] = resolveDotEffects(parseSkillDefinition(raw851), raven, MAX_SKILL_LEVELS);
    expect(shock!.multiplier).toBeCloseTo(0.6846, 10);
    expect(shock!.dot).toEqual({
      intervalSeconds: 1,
      durationSeconds: 5,
      firstTick: 'afterInterval',
      maxStacks: 10,
      gaugeOnApply: true,
      gaugeOnTick: true,
    });
  });

  it('uses 1 stack for a dot without maxStacksRef', () => {
    const { maxStacksRef: _, ...plain } = SHOCK;
    const [shock] = resolveDotEffects(parseSkillDefinition(withSkill1([plain])), raven, MAX_SKILL_LEVELS);
    expect(shock!.dot!.maxStacks).toBe(1);
  });

  it('rejects the tick gauge when the duration is not a multiple of the interval (8 節の 2)', () => {
    const { durationRef: _, ...rest } = SHOCK;
    const def = parseSkillDefinition(withSkill1([{ ...rest, durationSeconds: 4.5 }]));
    expect(() => resolveDotEffects(def, raven, MAX_SKILL_LEVELS)).toThrow(/gaugeOnTick needs a duration/);
  });

  it('rejects a status group with different max stacks', () => {
    const { maxStacksRef: _, ...plain } = SHOCK;
    const def = parseSkillDefinition(
      withSkill1([
        { ...SHOCK, status: 'shock' },
        { ...plain, status: 'shock' },
      ]),
    );
    expect(() => groupDotsByStatus(resolveDotEffects(def, raven, MAX_SKILL_LEVELS))).toThrow(/max stacks/);
  });

  it('rejects a status group where only some effects have the tick gauge (V-0113)', () => {
    const { gaugeOnApply: _, gaugeOnTick: __, ...noGauge } = SHOCK;
    const def = parseSkillDefinition(
      withSkill1([
        { ...SHOCK, status: 'shock' },
        { ...noGauge, status: 'shock' },
      ]),
    );
    expect(() => groupDotsByStatus(resolveDotEffects(def, raven, MAX_SKILL_LEVELS))).toThrow(/tick gauge/);
  });
});

describe('dotTicks（tick のフレームと、その時点のスタックの数。C-0182）', () => {
  const s = gameSecondsToFrame;

  it('counts the fires of the group up to each tick, including a fire on the same frame', () => {
    const fires = [1000, 1000 + s(1), 1000 + s(2.5)];
    const ticks = dotTicks(fires, 1, 5, 100_000, 'afterInterval', 10);
    expect(ticks.map((t) => t.frame)).toEqual(dotTickFrames(fires, 1, 5, 100_000, 'afterInterval'));
    // 1 秒後の tick は 2 発目と同じフレーム（数える）、2・3 秒後は 2、2.5 秒後の 3 発目の後は 3
    expect(ticks.slice(0, 4).map((t) => t.stacks)).toEqual([2, 2, 3, 3]);
    expect(ticks.every((t, i) => i < 4 || t.stacks === 3)).toBe(true);
  });

  it('stops at the max stacks', () => {
    const fires = [0, 30, 60, 90];
    expect(dotTicks(fires, 1, 5, 100_000, 'afterInterval', 2).every((t) => t.stacks <= 2)).toBe(true);
    expect(Math.max(...dotTicks(fires, 1, 5, 100_000, 'afterInterval', 10).map((t) => t.stacks))).toBe(4);
  });

  it('starts again from 1 stack after the group ends', () => {
    const fires = [0, 100, 100 + s(5) + 50];
    const ticks = dotTicks(fires, 1, 5, 100_000, 'afterInterval', 10);
    const after = ticks.filter((t) => t.frame > fires[2]!);
    expect(after.map((t) => t.stacks)).toEqual([1, 1, 1, 1, 1]);
  });

  it('gives 1 stack to every tick by default (a dot that does not stack)', () => {
    expect(dotTicks([0, 100, 200], 1, 10, 100_000).every((t) => t.stacks === 1)).toBe(true);
  });
});

describe('dotTickTracker（まとまりの規則を 1 か所に。8 節の 2）', () => {
  /** 乱数（再現できるように線形合同法） */
  function* lcg(seed: number): Generator<number> {
    let x = seed;
    for (;;) {
      x = (x * 1103515245 + 12345) % 2 ** 31;
      yield x / 2 ** 31;
    }
  }

  it('returns, fire by fire, the same ticks as dotTickFrames', () => {
    const rand = lcg(7);
    for (const firstTick of ['atApplication', 'afterInterval'] as const) {
      for (let trial = 0; trial < 50; trial++) {
        const fires: number[] = [];
        let f = 0;
        for (let i = 0; i < 20; i++) {
          f += Math.floor(rand.next().value! * 500);
          fires.push(f);
        }
        const tracker = dotTickTracker(1, 5, 8000, firstTick);
        const incremental = fires.flatMap((x) => tracker.fire(x).ticks);
        expect(incremental).toEqual(dotTickFrames(fires, 1, 5, 8000, firstTick));
      }
    }
  });

  it('returns only ticks after the fire for afterInterval with a duration that is a multiple of the interval', () => {
    const rand = lcg(11);
    const tracker = dotTickTracker(1, 5, 100_000, 'afterInterval');
    let f = 0;
    for (let i = 0; i < 200; i++) {
      f += Math.floor(rand.next().value! * 400);
      for (const t of tracker.fire(f).ticks) expect(t).toBeGreaterThan(f);
    }
  });
});
