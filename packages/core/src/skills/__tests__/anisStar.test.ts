// アニス：スター（17）: S1「スターフォール」の解決と、バースト段階の構成の条件（burstStepMix。plan/design-anis-star-s1.md 2.1 節）。
// 私だけの星（自分の攻撃力▲）と CT▼ は自分を除く基本バースト段階 1 の味方がいないときだけ、追加ダメージは射撃ごと（perShot）。
// みんなの星はバースト再突入 I 段階（burstReentry。V-0121）。S2・バーストは未実装の notes（V-0116）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives } from '../resolve.ts';
import { burstUnitOf } from '../../burst/dynamic.ts';
import { applyComposition, burstStepMixAllows } from '../composition.ts';
import { burstReentryStepOf, parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const anis = readJson<CharacterData>('../../../data/characters/17.json');
const flower = readJson<CharacterData>('../../../data/characters/304.json');
const redHood = readJson<CharacterData>('../../../data/characters/470.json');
const crown = readJson<CharacterData>('../../../data/characters/330.json');
const raw = readJson<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>('../../../data/skills/17.json');
const def = parseSkillDefinition(raw);

/** 定義の skill1 の 1 つ目の効果を差し替えた JSON（検証エラーを見る用） */
function withFirstEffect(effect: Record<string, unknown>): unknown {
  const copy = structuredClone(raw);
  copy.skills.skill1.effects[0] = effect;
  return copy;
}

describe('アニス：スター（17）の定義', () => {
  it('resolves the burst gauge speed up for all allies and the self ATK up of My Own Star', () => {
    const passives = resolvePassives(def, anis, MAX_SKILL_LEVELS);
    expect(passives.map((e) => [e.stat, e.target])).toEqual([
      ['burstGaugeSpeed', 'allies'],
      ['attack', 'self'],
    ]);
    expect(passives[0]!.value).toBeCloseTo(0.06, 12);
    expect(passives[1]!.value).toBeCloseTo(0.4001, 12);
  });

  it('resolves the Burst cooldown cut at battle start and at the end of Full Burst', () => {
    const instants = resolveInstant(def, anis, MAX_SKILL_LEVELS);
    expect(instants.map((e) => [e.kind, e.trigger, e.target])).toEqual([
      ['cooldownReduction', 'battleStart', 'allies'],
      ['cooldownReduction', 'fullBurstEnd', 'allies'],
    ]);
    expect(instants[0]!.value).toBeCloseTo(7.48, 12);
  });

  it('resolves the additional damage on every Full Charge shot (120.13% at Lv10, 71% at Lv1)', () => {
    const perShot = resolvePerShotDamage(def, anis, MAX_SKILL_LEVELS);
    expect(perShot).toHaveLength(1);
    expect(perShot[0]!).toMatchObject({ damageType: 'additional' });
    expect(perShot[0]!.multiplier).toBeCloseTo(1.2013, 12);
    const lv1 = resolvePerShotDamage(def, anis, { ...MAX_SKILL_LEVELS, skill1: 1 });
    expect(lv1[0]!.multiplier).toBeCloseTo(0.71, 12);
  });

  it('defines every line of S1, with the measured ally gauge bonus noted as unimplemented (V-0158)', () => {
    expect(def.skills.skill1.support).toBe('partial');
    // V-0158 の味方のゲージと、誘導弾の飛ぶ時間の未実装の分（plan/design-anis-star-gauge-timing.md 3 節）
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['unimplemented', 'unimplemented']);
  });

  it('re-enters Burst Stage I only with Everyone’s Star', () => {
    expect(anis.burstSkill.nextStep).toBe('Step2');
    const solo = applyComposition(def, [anis], 0);
    const withFlower = applyComposition(def, [anis, flower], 0);
    expect(burstReentryStepOf(solo)).toBeNull();
    expect(burstReentryStepOf(withFlower)).toBe('Step1');
    expect(burstUnitOf(anis, solo).nextStep).toBe('Step2');
    expect(burstUnitOf(anis, withFlower).nextStep).toBe('Step1');
    expect(burstUnitOf(anis).nextStep).toBe('Step2');
  });
});

describe('バースト段階の構成の条件（burstStepMix）', () => {
  const absent = { otherBurstStep: 'Step1', present: false } as const;
  const present = { otherBurstStep: 'Step1', present: true } as const;

  it('looks at the other filled slots only', () => {
    expect(burstStepMixAllows(absent, [anis], 0)).toBe(true);
    expect(burstStepMixAllows(absent, [anis, null, null], 0)).toBe(true);
    // 自分は数えない（アニス：スター自身が基本バースト段階 1）
    expect(burstStepMixAllows(present, [anis], 0)).toBe(false);
    expect(burstStepMixAllows(absent, [anis, flower], 0)).toBe(false);
    expect(burstStepMixAllows(present, [flower, anis], 1)).toBe(true);
    expect(burstStepMixAllows(absent, [anis, crown], 0)).toBe(true);
    expect(burstStepMixAllows(undefined, [anis, flower], 0)).toBe(true);
  });

  it('does not count a variable Burst stage (AllStep) as Burst I (論点 1)', () => {
    expect(redHood.burstStep).toBe('AllStep');
    expect(burstStepMixAllows(absent, [anis, redHood], 0)).toBe(true);
  });

  it('removes the effects whose condition fails and keeps the rest', () => {
    const solo = applyComposition(def, [anis], 0);
    expect(solo.skills.skill1.effects.map((e) => e.kind)).toEqual([
      'passive',
      'passive',
      'cooldownReduction',
      'cooldownReduction',
      'damage',
    ]);
    const withFlower = applyComposition(def, [anis, flower], 0);
    expect(withFlower.skills.skill1.effects.map((e) => e.kind)).toEqual(['passive', 'damage', 'burstReentry']);
    expect(resolvePassives(withFlower, anis, MAX_SKILL_LEVELS).map((e) => e.stat)).toEqual(['burstGaugeSpeed']);
    expect(resolveInstant(withFlower, anis, MAX_SKILL_LEVELS)).toEqual([]);
    // 残るのは条件を満たした効果だけなので、同じ編成で 2 回通しても同じ
    expect(applyComposition(withFlower, [anis, flower], 0)).toBe(withFlower);
    expect(applyComposition(solo, [anis], 0)).toBe(solo);
  });

  it('rejects burstStepMix on other effect kinds and malformed conditions', () => {
    const base = { kind: 'passive', target: 'allies', stat: 'burstGaugeSpeed', ref: 5 };
    expect(() =>
      parseSkillDefinition(
        withFirstEffect({
          kind: 'damage',
          trigger: { count: 'fullChargeShot' },
          damageType: 'additional',
          ref: 4,
          burstStepMix: absent,
        }),
      ),
    ).toThrow(/burstStepMix: only allowed in passive, timed, cooldownReduction and burstReentry/);
    expect(() =>
      parseSkillDefinition(withFirstEffect({ ...base, burstStepMix: { otherBurstStep: 'AllStep', present: false } })),
    ).toThrow(/otherBurstStep/);
    expect(() =>
      parseSkillDefinition(withFirstEffect({ ...base, burstStepMix: { otherBurstStep: 'Step1', present: 'no' } })),
    ).toThrow(/present: expected a boolean/);
    expect(() =>
      parseSkillDefinition(
        withFirstEffect({ ...base, burstStepMix: { otherBurstStep: 'Step1', present: false, x: 1 } }),
      ),
    ).toThrow(/burstStepMix\.x: unknown field/);
    expect(() =>
      parseSkillDefinition(
        withFirstEffect({ kind: 'ammoRefill', trigger: 'battleStart', target: 'allies', ref: 3, burstStepMix: absent }),
      ),
    ).toThrow(/burstStepMix: unknown field/);
  });

  it('rejects malformed burstReentry and more than one per definition', () => {
    const reentry = { kind: 'burstReentry', step: 'Step1' };
    expect(() => parseSkillDefinition(withFirstEffect(reentry))).toThrow(/at most one burstReentry/);
    const copy = structuredClone(raw) as { skills: { skill1: { effects: Record<string, unknown>[] } } };
    copy.skills.skill1.effects[5] = { kind: 'burstReentry', step: 'AllStep' };
    expect(() => parseSkillDefinition(copy)).toThrow(/step/);
    copy.skills.skill1.effects[5] = { kind: 'burstReentry', step: 'Step1', ref: 1 };
    expect(() => parseSkillDefinition(copy)).toThrow(/ref: unknown field/);
  });
});
