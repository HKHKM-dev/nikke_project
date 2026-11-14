// アスカ：WILLE 編（plan/design-asuka-wille.md 2 節・決めたこと）: 状態の終わりのきっかけ（{ ended }）の damage・timed・敵の状態の消去と、
// その遅れ（delayFrames）、敵に付いた状態のスタック数を掛ける damage（perCount: { enemyState }）、敵に付けた付与の消去、敵に付ける付与の
// 条件 selfState の語彙の検証と解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { resolveDamageEffects } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveDotCancels, resolveTimed } from '../resolve.ts';
import { isEndedTrigger, parseSkillDefinition } from '../types.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const ASUKA = 835;
const raw = rawDefinition<Raw>(ASUKA);
const character = characterOf(ASUKA);

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const indexOf = (slot: keyof Raw['skills'], match: (e: Record<string, unknown>) => boolean) =>
  raw.skills[slot].effects.findIndex(match);
const ANNIHILATION = indexOf('burst', (e) => e.kind === 'damage');
const CANCEL = indexOf('burst', (e) => e.kind === 'cancelState');
const FIELD = indexOf('skill1', (e) => e.state === 'antiATField');
const SPIN_DOWN = indexOf('skill2', (e) => e.stat === 'spinUpSpeed');

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes { ended } on damage, timed and an enemy cancel only for an own state', () => {
    for (const [slot, index] of [
      ['burst', ANNIHILATION],
      ['burst', CANCEL],
      ['skill2', SPIN_DOWN],
    ] as const) {
      expect(patched(slot, index, { trigger: { ended: 'prediction' } })).toThrow(
        /needs a grant of the same state on self/,
      );
    }
  });

  it('takes perCount { enemyState } only with { ended } and a stacking grant on the enemy', () => {
    expect(patched('burst', ANNIHILATION, { trigger: 'burstUse', delayFrames: undefined })).toThrow(
      /perCount \{ enemyState \} needs the trigger \{ ended \}/,
    );
    expect(patched('burst', ANNIHILATION, { perCount: { enemyState: 'seaBreeze' } })).toThrow(
      /needs a grant of "seaBreeze" on the enemy with stacks/,
    );
  });

  it('cancels an enemy grant only when it is a stacking grant of the definition, and delays only with { ended }', () => {
    expect(patched('burst', CANCEL, { state: 'seaBreeze' })).toThrow(/needs a grant of "seaBreeze" on the enemy/);
    expect(patched('burst', CANCEL, { trigger: 'burstUse' })).toThrow(/delayFrames of a cancel needs the trigger/);
  });

  it('takes only the condition selfState on a grant on the enemy', () => {
    expect(patched('skill1', FIELD, { condition: { inFullBurst: true } })).toThrow(
      /a grant on the enemy can only have the condition selfState/,
    );
  });
});

describe('解決（Lv10）', () => {
  const definition = parseSkillDefinition(raw);
  const damages = resolveDamageEffects(definition, character, MAX_SKILL_LEVELS);

  it('resolves Annihilation on the end of Annihilation State, 5 frames later, times the Anti A.T. Field stacks', () => {
    const hit = damages.find((d) => d.source.skill === 'burst')!;
    expect(hit.trigger).toEqual({ ended: 'annihilationState' });
    expect(hit.multiplier).toBeCloseTo(0.0662, 10);
    expect(hit.delayFrames).toBe(5);
    expect(hit.perCount).toEqual({ enemyState: 'antiATField' });
  });

  it('resolves the Anti A.T. Field cancel 5 frames after the end', () => {
    expect(resolveDotCancels(definition, character, MAX_SKILL_LEVELS)).toEqual([
      { state: 'antiATField', trigger: { ended: 'annihilationState' }, delayFrames: 5 },
    ]);
  });

  it('resolves Emergency Repair on the end of Annihilation State (ramp-up speed down 100% for 3 s, reload speed up 60%)', () => {
    const timed = resolveTimed(definition, character, MAX_SKILL_LEVELS).filter(
      (e) => e.source.skill === 'skill2' && isEndedTrigger(e.trigger),
    );
    expect(timed.map((e) => [e.stat, e.value])).toEqual([
      ['spinUpSpeed', -1],
      ['reloadSpeed', 0.6],
    ]);
  });
});
