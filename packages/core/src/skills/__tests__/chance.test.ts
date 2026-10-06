// ソルジャーE.G.（300）: 確率のきっかけ（回数トリガーの chance / chanceRef）の DSL・解決・期待値の窓（plan/design-soldier-eg.md 3.1 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import {
  CHANCE_VALUE_DIGITS,
  chancePieces,
  chanceScaleAt,
  chanceValueOf,
  type ChanceOpportunity,
  type ChancePiece,
} from '../chance.ts';
import { KEY_DIGITS } from '../timeline.ts';
import { MAX_SKILL_LEVELS, resolveTimed, resolveTrigger } from '../resolve.ts';
import { createTriggerTracker, type FrameEvents, type ShotEvent } from '../triggers.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const soldier = readJson<CharacterData>('../../../data/characters/300.json');
const raw300 = readJson<{ skills: Record<string, { effects: unknown[] }> }>('../../../data/skills/300.json');

/** 300.json を写して、skill1 の effects を差し替えた定義を検証にかける */
function withSkill1(effects: unknown[]): unknown {
  const copy = structuredClone(raw300) as { skills: Record<string, { effects: unknown[] }> };
  copy.skills.skill1!.effects = effects;
  return copy;
}

const S1 = {
  kind: 'timed',
  trigger: { count: 'normalHit', chanceRef: 3 },
  target: 'self',
  stat: 'attack',
  ref: 1,
  durationRef: 2,
};

describe('chance / chanceRef の検証', () => {
  it('parses the S1 of the definition', () => {
    const def = parseSkillDefinition(raw300);
    expect(def.skills.skill1.effects[0]).toMatchObject(S1);
  });

  it('accepts an immediate percentage and normalShot', () => {
    const t = { count: 'normalShot', chance: 12.5 };
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, trigger: t }]))).not.toThrow();
  });

  it('rejects a chance outside (0, 100], both forms, and counts other than normalShot / normalHit', () => {
    for (const chance of [0, -1, 101]) {
      expect(() =>
        parseSkillDefinition(withSkill1([{ ...S1, trigger: { count: 'normalHit', chance } }])),
      ).toThrow(/expected a percentage in \(0, 100\]/);
    }
    expect(() =>
      parseSkillDefinition(withSkill1([{ ...S1, trigger: { count: 'normalHit', chance: 5, chanceRef: 3 } }])),
    ).toThrow(/at most one of chance and chanceRef/);
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, trigger: { count: 'coreHit', chanceRef: 3 } }]))).toThrow(
      /a chance trigger needs count normalShot or normalHit/,
    );
  });

  it('cannot be combined with counting fields, and only appears in timed', () => {
    expect(() =>
      parseSkillDefinition(withSkill1([{ ...S1, trigger: { count: 'normalHit', chanceRef: 3, every: 2 } }])),
    ).toThrow(/cannot be combined with every/);
    const damage = { kind: 'damage', trigger: { count: 'normalHit', chanceRef: 3 }, ref: 1, damageType: 'skill' };
    expect(() => parseSkillDefinition(withSkill1([damage]))).toThrow(/only allowed in timed/);
  });

  it('rejects stats that do not add up linearly and the fields whose meaning is undecided', () => {
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, stat: 'maxAmmo' }]))).toThrow(/not supported for "maxAmmo"/);
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, stat: 'hitRate' }]))).toThrow(/not supported for "hitRate"/);
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, maxStacks: 3 }]))).toThrow(/cannot be combined with maxStacks/);
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, condition: { selfBuffed: 'critRate' } }]))).toThrow(
      /cannot be combined with condition/,
    );
    expect(() => parseSkillDefinition(withSkill1([{ ...S1, target: 'topAttack', targetCount: 1 }]))).toThrow(
      /cannot target "topAttack"/,
    );
  });
});

describe('解決', () => {
  it('resolves the chance to a ratio with every 1', () => {
    const skill = soldier.skills.skill1;
    expect(resolveTrigger({ count: 'normalHit', chanceRef: 3 }, skill, 10)).toEqual({
      count: 'normalHit',
      every: 1,
      chance: 0.05,
    });
    const [effect] = resolveTimed(parseSkillDefinition(raw300), soldier, MAX_SKILL_LEVELS);
    expect(effect).toMatchObject({ stat: 'attack', trigger: { chance: 0.05 } });
    expect(effect!.value).toBeCloseTo(0.0792, 12);
    expect(effect!.durationFrames).toBe(294);
  });
});

describe('発火', () => {
  const shot = (hits: number): ShotEvent => ({ lastShot: false, fullCharge: false, hits, coreHits: 0 });
  const frameOf = (frame: number, s: ShotEvent | null): FrameEvents => ({
    frame,
    shots: [s],
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: [],
  });

  it('fires on every shot whose count weight is positive (not when the expected count crosses an integer)', () => {
    const fires = createTriggerTracker({ count: 'normalHit', every: 1, chance: 0.05 }, 0, null);
    expect([0.9, 0.9, 0, 0.5].map((h, i) => fires(frameOf(i, shot(h))))).toEqual([true, true, false, true]);
    expect(fires(frameOf(9, null))).toBe(false);
  });
});

/** 小片の列を、確率を 12 桁で丸めて比べる */
function expectPieces(actual: ChancePiece[], expected: ChancePiece[]): void {
  expect(actual.map((p) => ({ ...p, scale: Number(p.scale.toFixed(12)) }))).toEqual(
    expected.map((p) => ({ ...p, scale: Number(p.scale.toFixed(12)) })),
  );
}

describe('期待値の窓', () => {
  const ops = (starts: number[], q = 0.1): ChanceOpportunity[] => starts.map((start) => ({ start, q }));

  it('gives 1 − Π (1 − q) over the opportunities active in each piece', () => {
    // 機会 0・2・4（各 0.1）、維持 5 フレーム: [0,2) 1 つ、[2,4) 2 つ、[4,5) 3 つ、[5,7) 2 つ、[7,9) 1 つ
    expectPieces(chancePieces(ops([0, 2, 4]), 5, 100), [
      { start: 0, end: 2, scale: 0.1 },
      { start: 2, end: 4, scale: 1 - 0.9 ** 2 },
      { start: 4, end: 5, scale: 1 - 0.9 ** 3 },
      { start: 5, end: 7, scale: 1 - 0.9 ** 2 },
      { start: 7, end: 9, scale: 0.1 },
    ]);
  });

  it('leaves gaps where nothing is active, merges equal neighbours, and cuts at the end of the battle', () => {
    expectPieces(chancePieces(ops([0, 10]), 3, 100), [
      { start: 0, end: 3, scale: 0.1 },
      { start: 10, end: 13, scale: 0.1 },
    ]);
    // 間隔が維持と同じなら、効いている数は常に 1 で 1 つの小片になる
    expectPieces(chancePieces(ops([0, 3, 6]), 3, 100), [{ start: 0, end: 9, scale: 0.1 }]);
    expectPieces(chancePieces(ops([0, 2]), 5, 4), [
      { start: 0, end: 2, scale: 0.1 },
      { start: 2, end: 4, scale: 1 - 0.9 ** 2 },
    ]);
    expect(chancePieces(ops([0]), 0, 100)).toEqual([]);
  });

  it('rounds the window value to the digits of the group key', () => {
    expect(CHANCE_VALUE_DIGITS).toBe(KEY_DIGITS);
    expect(chanceValueOf(0.0792, 0.8)).toBe(0.06336);
    expect(chanceValueOf(0.0792, 1 - 0.95 ** 60)).toBe(0.075551);
  });

  it('agrees with chanceScaleAt at every frame', () => {
    const opportunities = [0, 1, 3, 4, 9, 15, 16, 30].map((start, i) => ({ start, q: 0.02 + 0.01 * (i % 3) }));
    const pieces = chancePieces(opportunities, 7, 40);
    for (let f = 0; f < 40; f++) {
      const piece = pieces.find((p) => p.start <= f && f < p.end);
      expect(chanceScaleAt(opportunities, 7, f)).toBe(piece?.scale ?? 0);
    }
  });
});
