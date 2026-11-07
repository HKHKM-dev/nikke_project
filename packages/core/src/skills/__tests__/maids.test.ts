// メイド編（plan/design-maids.md 2 節）: timed の perCount（X% × 〈状態〉のスタック数）・shotPause の { applied }（気絶）・発動の回数の
// 種類 fullBurstEnd の語彙の検証
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAppliedPauses } from '../burstDamage.ts';
import { namedStateIsDebuff } from '../states.ts';
import { parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };

function readDef(id: number): Raw {
  return JSON.parse(readFileSync(new URL(`../../../data/skills/${id}.json`, import.meta.url), 'utf8')) as Raw;
}

const MAST = readDef(354);
const ANCHOR = readDef(355);
const reload = MAST.skills.skill2.effects.findIndex((e) => e.stat === 'reloadSpeed');
const pause = MAST.skills.skill2.effects.findIndex((e) => e.kind === 'shotPause');

const patched = (raw: Raw, slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('語彙の検証', () => {
  it('accepts the definitions', () => {
    expect(() => parseSkillDefinition(MAST)).not.toThrow();
    expect(() => parseSkillDefinition(ANCHOR)).not.toThrow();
  });

  it('takes perCount on a timed effect only with an event trigger', () => {
    expect(patched(MAST, 'skill2', reload, { trigger: 'fullBurstEnd' })).not.toThrow();
    expect(patched(MAST, 'skill2', reload, { trigger: 'battleStart' })).toThrow(/perCount needs one of the triggers/);
    expect(patched(MAST, 'skill2', reload, { trigger: { count: 'fullBurstEnd', atLeast: 1 } })).toThrow(
      /perCount needs one of the triggers/,
    );
  });

  it('takes perCount only as { state } of a known ally state, and not with stacks', () => {
    expect(patched(MAST, 'skill2', reload, { perCount: { state: 'drunken', x: 1 } })).toThrow(/expected \{ state \}/);
    expect(patched(MAST, 'skill2', reload, { perCount: { state: 'nope' } })).toThrow();
    expect(patched(MAST, 'skill2', reload, { maxStacks: 3 })).toThrow(/perCount cannot be combined with maxStacks/);
  });

  it('takes { applied } as a shotPause trigger, without framesOnLastShot', () => {
    expect(patched(MAST, 'skill2', pause, { framesOnLastShot: 10 })).toThrow(
      /framesOnLastShot needs a shot count trigger/,
    );
    expect(patched(MAST, 'skill2', pause, { trigger: 'fullBurstEnd' })).toThrow(
      /shotPause needs a shot count trigger \(\{ count \}\), "burstUse" or \{ applied \}/,
    );
    expect(resolveAppliedPauses(parseSkillDefinition(MAST))).toEqual([{ state: 'hangover', frames: 600 }]);
  });

  it('takes fullBurstEnd as an event count kind', () => {
    const hitRate = ANCHOR.skills.skill2.effects.findIndex((e) => e.stat === 'hitRate');
    expect(patched(ANCHOR, 'skill2', hitRate, { trigger: { count: 'fullBurstEnd', atLeast: 4 } })).not.toThrow();
    expect(patched(ANCHOR, 'skill2', hitRate, { trigger: { count: 'fullBurstStop', atLeast: 1 } })).toThrow();
  });
});

// 課題 2-59（plan/design-debuff-removal.md 2.2 節）: デバフ解除（removeDebuff）の読み込み
describe('removeDebuff の検証', () => {
  const COCOA = readDef(311);
  const burst = COCOA.skills.burst.effects.findIndex((e) => e.kind === 'removeDebuff');
  const s1 = COCOA.skills.skill1.effects.findIndex((e) => e.kind === 'removeDebuff');

  it('accepts the definition and marks only Drunken as a debuff state', () => {
    expect(() => parseSkillDefinition(COCOA)).not.toThrow();
    expect(namedStateIsDebuff('drunken')).toBe(true);
    expect(namedStateIsDebuff('hangover')).toBe(false);
  });

  it('needs targetCount only for debuffedRandom, a known target, and delayFrames only with a timer trigger', () => {
    expect(patched(COCOA, 'burst', burst, { targetCount: 2 })).toThrow(
      /targetCount \/ targetCountRef are only allowed/,
    );
    expect(patched(COCOA, 'skill1', s1, { targetCount: undefined })).toThrow(/exactly one of targetCount/);
    expect(patched(COCOA, 'burst', burst, { target: 'self' })).toThrow(/target/);
    expect(patched(COCOA, 'burst', burst, { delayFrames: 3 })).toThrow(/delayFrames needs a timer trigger/);
    expect(patched(COCOA, 'burst', burst, { count: 0 })).toThrow(/count/);
  });
});
