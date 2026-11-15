// アルカナ：フォーチュンメイト編（plan/design-fortune-mate.md 2 節）: 回数のきっかけの周期の中の位置（phase）、弾丸チャージの自分の状態の
// 窓で数える回数（during: { state }）、状態の中身のペレット数▲の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolveStateContents, resolveStateGrants } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const FORTUNE_MATE = 583;
const raw = rawDefinition<Raw>(FORTUNE_MATE);
const character = characterOf(FORTUNE_MATE);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const REFILL = indexOf('skill2', (e) => e.kind === 'ammoRefill');
const HAPPY = indexOf('skill2', (e) => e.state === 'happyMemory');
const window = { count: 'normalShot', every: 6, during: { state: 'memoryMaking' } };

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes phase only with a counting window of an own state, below every', () => {
    expect(patched('skill2', HAPPY, { trigger: { count: 'normalShot', every: 6, phase: 4 } })).toThrow(
      /phase needs a counting window of a state/,
    );
    expect(patched('skill2', HAPPY, { trigger: { ...window, phase: 6 } })).toThrow(/phase must be less than every/);
    expect(patched('skill2', HAPPY, { trigger: { ...window, phase: 0 } })).toThrow(/phase/);
    expect(
      patched('skill2', HAPPY, { trigger: { count: 'normalShot', phase: 2, during: { state: 'memoryMaking' } } }),
    ).toThrow(/phase needs every or everyRef/);
  });

  it('takes only a counting window of an own state on ammoRefill', () => {
    expect(
      patched('skill2', REFILL, { trigger: { count: 'normalShot', every: 6, during: 'fullBurst', reset: 'never' } }),
    ).toThrow(/only a counting window of a state/);
    expect(patched('skill2', REFILL, { trigger: { count: 'normalShot', every: 6, firesDuring: 'fullBurst' } })).toThrow(
      /firesDuring/,
    );
    expect(patched('skill2', REFILL, { trigger: { ...window, during: { state: 'modeB' } } })).toThrow(
      /needs a grant of the same state on self/,
    );
  });

  it('takes the pellet count up in state contents, but not the single pellet', () => {
    const contents = (stat: string) => patched('skill2', HAPPY, { contents: [{ stat, scaling: 'flat', ref: 2 }] });
    expect(contents('pelletCount')).not.toThrow();
    expect(patched('skill2', HAPPY, { contents: [{ stat: 'singlePellet' }] })).toThrow(/singlePellet/);
  });
});

describe('解決', () => {
  const definition = parseSkillDefinition(raw);
  const grants = resolveStateGrants(definition, character, MAX_SKILL_LEVELS);
  const grant = (state: string) => grants.find((g) => g.state === state)!;

  it('resolves the 2nd, 4th and 6th tiers as one window of 6 shots with phases', () => {
    const refill = resolveInstant(definition, character, MAX_SKILL_LEVELS).find(
      (e) => e.kind === 'ammoRefill' && e.source.skill === 'skill2',
    );
    expect(refill?.trigger).toEqual({ ...window, phase: 2 });
    expect(refill?.value).toBe(6);
    expect(grant('happyMemory').trigger).toEqual({ ...window, phase: 4 });
    expect(grant('preciousMemory').trigger).toEqual(window);
  });

  it('resolves Happy Memories as one more pellet per stack', () => {
    const pellets = resolveStateContents(definition, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'pelletCount');
    expect(pellets?.value).toBe(1);
    expect(grant('happyMemory').maxStacks).toBe(3);
  });
});
