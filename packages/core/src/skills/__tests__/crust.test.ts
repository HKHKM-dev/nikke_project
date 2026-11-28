// クラスト編（plan/design-crust.md 2・3 節）: 回数のきっかけ「フルチャージではない通常攻撃」（{ count: "partialChargeShot" }）の検証と数え方、
// メイラードの付与・延長、デバフ効果解除、フルバースト発動時のメイラードの味方への攻撃力▲の解決
import { describe, expect, it } from 'vitest';
import { characterOf, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { gameSecondsToFrames } from '../../time.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import {
  MAX_SKILL_LEVELS,
  resolveRemoveDebuffs,
  resolveStateContents,
  resolveStateExtends,
  resolveStateGrants,
  resolveTimed,
} from '../resolve.ts';
import { shotCountWeight, shotEventOf } from '../triggers.ts';

type Effects = { effects: Record<string, unknown>[] };
type Raw = { skills: { skill1: Effects; skill2: Effects; burst: Effects } };
const CRUST = 521;
const raw = rawDefinition<Raw>(CRUST);
const character = characterOf(CRUST);
const MAILLARD = raw.skills.skill1.effects.findIndex((e) => e.state === 'maillard');

const patched = (slot: keyof Raw['skills'], index: number, patch: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};
const added = (slot: keyof Raw['skills'], effect: Record<string, unknown>) => {
  const copy = structuredClone(raw);
  copy.skills[slot].effects.push(effect);
  return () => parseSkillDefinition(copy);
};
const PARTIAL = { count: 'partialChargeShot', everyRef: 4 };

describe('語彙の検証', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('takes partialChargeShot only in timed, state grants and removeDebuff', () => {
    expect(added('skill1', { kind: 'removeState', state: 'maillard', trigger: PARTIAL, target: 'allies' })).toThrow(
      /partialChargeShot count is only allowed in timed, state grants and removeDebuff/,
    );
    expect(
      added('skill1', { kind: 'timed', trigger: PARTIAL, target: 'allies', stat: 'attack', ref: 5, durationRef: 6 }),
    ).not.toThrow();
  });

  it('does not combine partialChargeShot with windows, stacks or chance', () => {
    for (const extra of [
      { during: 'fullBurst', reset: 'never' },
      { firesDuring: 'fullBurst' },
      { firesOutside: 'weaponChange' },
      { stacksRef: 4 },
      { chance: 50 },
    ]) {
      expect(patched('skill1', MAILLARD, { trigger: { ...PARTIAL, ...extra } })).toThrow(
        /cannot be used with partialChargeShot/,
      );
    }
  });
});

describe('数え方', () => {
  const event = (fullCharge: boolean, partialCharge: boolean) =>
    shotEventOf(false, undefined, fullCharge, partialCharge, 1, 0, undefined, undefined, undefined, false, false);

  it('counts only partial charge shots', () => {
    expect(shotCountWeight('partialChargeShot', event(false, true))).toBe(1);
    expect(shotCountWeight('partialChargeShot', event(true, false))).toBe(0);
    // チャージしない武器の発（fullCharge も partialCharge も false）は数えない
    expect(shotCountWeight('partialChargeShot', event(false, false))).toBe(0);
    expect(shotCountWeight('fullChargeShot', event(false, true))).toBe(0);
  });
});

describe('解決', () => {
  const def = parseSkillDefinition(raw);
  const levels = MAX_SKILL_LEVELS;

  it('grants Maillard to all allies every 3 partial charge shots for 10 s with ATK up of 10% of the caster', () => {
    const grant = resolveStateGrants(def, character, levels).find((g) => g.state === 'maillard')!;
    expect(grant.trigger).toMatchObject({ count: 'partialChargeShot', every: 3 });
    expect(grant.target).toBe('allies');
    expect(grant.durationFrames).toBe(gameSecondsToFrames(10));
    const content = resolveStateContents(def, character, levels).find((c) => c.whileState === 'maillard')!;
    expect(content).toMatchObject({ stat: 'attack', scaling: 'casterAttack' });
    expect(content.value).toBeCloseTo(0.1, 9);
  });

  it('extends Maillard on all allies by 2.5 s on each full charge shot while in Maillard', () => {
    const [extend] = resolveStateExtends(def, character, levels);
    expect(extend).toMatchObject({ state: 'maillard', target: 'allies', trigger: { count: 'fullChargeShot' } });
    expect(extend!.frames).toBe(gameSecondsToFrames(2.5));
    expect(extend!.condition).toEqual({ selfState: { state: 'maillard', present: true } });
  });

  it('removes 1 debuff from all allies on the same partial charge count', () => {
    const [remove] = resolveRemoveDebuffs(def, character, levels);
    expect(remove).toMatchObject({ target: 'allies', count: 1, trigger: { count: 'partialChargeShot', every: 3 } });
  });

  it('resolves the burst and the Full Burst ATK up on allies in Maillard', () => {
    const timed = resolveTimed(def, character, levels);
    const fullBurst = timed.find((e) => e.source.skill === 'skill2')!;
    expect(fullBurst).toMatchObject({ trigger: 'fullBurstStart', targetState: 'maillard', scaling: 'casterAttack' });
    expect(fullBurst.value).toBeCloseTo(0.2, 9);
    const burst = timed.filter((e) => e.source.skill === 'burst');
    expect(burst.find((e) => e.stat === 'attackDamage')!.value).toBeCloseTo(0.2, 9);
    const distributed = burst.find((e) => e.stat === 'distributedDamage')!;
    expect(distributed.value).toBeCloseTo(0.6, 9);
    expect(distributed.condition).toEqual({ selfState: { state: 'maillard', present: true } });
  });
});
