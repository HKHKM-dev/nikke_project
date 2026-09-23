// Stage 11 紅蓮BS 編: 段の循環（cycle）と間隔の変更（cycleEvery）の DSL・解決・発動の規則（plan/design-stage11-scarlet-bs.md 7.1・7.2 節）。
// 規則は録画 46・47 の読み直し（同 0.3 節）: 通算カウンタの every の倍数で段が進み、窓の中は窓の every。窓の中の段はカウンタを戻さない。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { cycleFires, resolveCycleEvery, resolveCycles } from '../cycles.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const scarlet = readJson<CharacterData>('../../../data/characters/225.json');
const raw225 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/225.json');

/** 225.json を写して、effects を差し替えた定義を検証にかける */
function withEffects(slot: 'skill1' | 'skill2' | 'burst', effects: unknown[]): unknown {
  const copy = structuredClone(raw225) as { skills: Record<string, { support: string; effects: unknown[] }> };
  copy.skills[slot]!.effects = effects;
  return copy;
}

const CYCLE = {
  kind: 'cycle',
  trigger: { count: 'fullChargeShot', every: 3 },
  steps: [
    { kind: 'damage', damageType: 'skill', ref: 2 },
    { kind: 'damage', damageType: 'distributed', ref: 3 },
  ],
};

describe('DSL (7.1)', () => {
  it('parses 225.json', () => {
    const def = parseSkillDefinition(raw225);
    const s1 = def.skills.skill1.effects[0]!;
    expect(s1.kind).toBe('cycle');
    const burst = def.skills.burst.effects[0]!;
    expect(burst).toMatchObject({ kind: 'cycleEvery', slot: 'skill1', every: 1, durationRef: 1 });
  });

  it('needs a shot count trigger without stacksRef / lastShot, and at least 2 damage steps', () => {
    expect(() => parseSkillDefinition(withEffects('skill1', [{ ...CYCLE, trigger: 'burstUse' }]))).toThrow(
      /shot count trigger/,
    );
    expect(() =>
      parseSkillDefinition(withEffects('skill1', [{ ...CYCLE, trigger: { count: 'lastShot', every: 3 } }])),
    ).toThrow(/lastShot/);
    expect(() =>
      parseSkillDefinition(withEffects('skill1', [{ ...CYCLE, trigger: { count: 'normalShot', stacksRef: 1 } }])),
    ).toThrow(/stacksRef/);
    expect(() => parseSkillDefinition(withEffects('skill1', [{ ...CYCLE, steps: [CYCLE.steps[0]] }]))).toThrow(
      /at least 2/,
    );
    expect(() =>
      parseSkillDefinition(
        withEffects('skill1', [{ ...CYCLE, steps: [CYCLE.steps[0], { kind: 'timed', ref: 1, damageType: 'skill' }] }]),
      ),
    ).toThrow(/expected "damage"/);
    expect(() => parseSkillDefinition(withEffects('skill1', [CYCLE, CYCLE]))).toThrow(/at most one cycle/);
  });

  it('checks that cycleEvery points at a cycle, speeds it up and is not triggered by shots', () => {
    const every = { kind: 'cycleEvery', trigger: 'burstUse', slot: 'skill1', every: 1, durationRef: 1 };
    expect(() => parseSkillDefinition(withEffects('burst', [{ ...every, slot: 'skill2' }]))).toThrow(/has no cycle/);
    expect(() => parseSkillDefinition(withEffects('burst', [{ ...every, every: 3 }]))).toThrow(/less than/);
    expect(() =>
      parseSkillDefinition(withEffects('burst', [{ ...every, trigger: { count: 'normalShot', every: 5 } }])),
    ).toThrow(/shot count/);
    expect(() => parseSkillDefinition(withEffects('burst', [{ ...every, durationRef: undefined }]))).toThrow(
      /durationRef/,
    );
  });

  it('resolves the tiers of S1 (283.03% / 565% distributed / 848.03% distributed) and the 10 s window', () => {
    const def = parseSkillDefinition(raw225);
    const [cycle] = resolveCycles(def, scarlet, MAX_SKILL_LEVELS);
    expect(cycle!.trigger).toEqual({ count: 'fullChargeShot', every: 3 });
    expect(cycle!.steps.map((s) => [s.damageType, s.multiplier, s.cycle])).toEqual([
      ['skill', 2.8303, { step: 0, steps: 3 }],
      ['distributed', 5.65, { step: 1, steps: 3 }],
      ['distributed', 8.4803, { step: 2, steps: 3 }],
    ]);
    const [every] = resolveCycleEvery(def, scarlet, MAX_SKILL_LEVELS);
    expect(every).toMatchObject({ targetSkill: 'skill1', every: 1, trigger: 'burstUse', durationFrames: 600 });
  });
});

describe('cycleFires (7.2)', () => {
  const shots = (n: number, from = 0) => Array.from({ length: n }, (_, i) => from + 43 * i);
  const letters = (fires: { step: number }[]) => fires.map((f) => 'ABC'[f.step]).join('');

  it('fires A / B / C on the 3rd / 6th / 9th… shot without a window (録画 46)', () => {
    const fires = cycleFires(3, 3, shots(20));
    expect(fires.map((f) => f.count)).toEqual([3, 6, 9, 12, 15, 18]);
    expect(letters(fires)).toBe('ABCABC');
  });

  /**
   * 0.3 節の型: 窓の前に段なしの射撃が p 発、窓の中 13 発、窓の後の最初の段は k 発目（p + 13 + k ≡ 0 mod 3）。
   * 録画 47 の FB1・3・5 は p = 0 → 2 発目、FB2・4 は p = 1 → 1 発目
   */
  it.each([
    [0, 2],
    [1, 1],
    [2, 3],
  ])('with p = %i shots before the window, the first tier after 13 in-window shots is on shot %i', (p, k) => {
    const before = 3 + p; // 3 発目で段が出てから p 発
    const frames = shots(before + 13 + 5);
    const start = frames[before]!;
    const end = frames[before + 12]! + 1;
    const fires = cycleFires(3, 3, frames, [{ every: 1, start, end }]);
    const inWindow = fires.filter((f) => f.inWindow);
    expect(inWindow).toHaveLength(13);
    const firstAfter = fires.find((f) => f.frame >= end)!;
    expect(frames.indexOf(firstAfter.frame) - (before + 13) + 1).toBe(k);
    // 段のポインタは途切れない
    expect(letters(fires)).toBe('ABCABCABCABCABCABC'.slice(0, fires.length));
  });

  it('fires only once on an in-window shot whose count is a multiple of 3', () => {
    const frames = shots(6);
    const fires = cycleFires(3, 3, frames, [{ every: 1, start: 0, end: 10_000 }]);
    expect(fires.map((f) => f.count)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(letters(fires)).toBe('ABCABC');
  });

  it('uses the smallest every when windows overlap, and [start, end) for membership', () => {
    const frames = shots(8);
    const fires = cycleFires(4, 2, frames, [
      { every: 2, start: 0, end: frames[4]! },
      { every: 1, start: frames[2]!, end: frames[3]! + 1 },
    ]);
    // 1: 窓 2 で外れ、2: 窓 2 で発火、3・4: 窓 1 で発火、5: 窓なし（every 4）で外れ、8: every 4 で発火
    expect(fires.map((f) => f.count)).toEqual([2, 3, 4, 8]);
  });
});
