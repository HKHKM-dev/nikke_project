// アニス：スター（17）: S1「スターフォール」の解決と、部隊構成の条件（squad。plan/design-anis-star-s1.md 2.1 節）。
// 私だけの星（自分の攻撃力▲）と CT▼ は自分を除く基本バースト段階 1 の味方がいないときだけ、追加ダメージは射撃ごと（perShot）。
// みんなの星（バースト再突入）・S2・バーストは未実装の notes（V-0116）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolveInstant, resolvePassives } from '../resolve.ts';
import { applySquad, squadAllows } from '../squad.ts';
import { parseSkillDefinition } from '../types.ts';

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

  it('keeps Everyone’s Star, S2 and the burst as not implemented', () => {
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.skills.skill1.notes).toHaveLength(1);
    expect(def.skills.skill2.support).toBe('unsupported');
    expect(def.skills.burst.support).toBe('unsupported');
  });
});

describe('部隊構成の条件（squad）', () => {
  const absent = { otherBurstStep: 'Step1', present: false } as const;
  const present = { otherBurstStep: 'Step1', present: true } as const;

  it('looks at the other filled slots only', () => {
    expect(squadAllows(absent, [anis], 0)).toBe(true);
    expect(squadAllows(absent, [anis, null, null], 0)).toBe(true);
    // 自分は数えない（アニス：スター自身が基本バースト段階 1）
    expect(squadAllows(present, [anis], 0)).toBe(false);
    expect(squadAllows(absent, [anis, flower], 0)).toBe(false);
    expect(squadAllows(present, [flower, anis], 1)).toBe(true);
    expect(squadAllows(absent, [anis, crown], 0)).toBe(true);
    expect(squadAllows(undefined, [anis, flower], 0)).toBe(true);
  });

  it('does not count a variable Burst stage (AllStep) as Burst I (論点 1)', () => {
    expect(redHood.burstStep).toBe('AllStep');
    expect(squadAllows(absent, [anis, redHood], 0)).toBe(true);
  });

  it('removes the effects whose condition fails and keeps the rest', () => {
    expect(applySquad(def, [anis], 0)).toBe(def);
    const withFlower = applySquad(def, [anis, flower], 0);
    expect(withFlower.skills.skill1.effects.map((e) => e.kind)).toEqual(['passive', 'damage']);
    expect(resolvePassives(withFlower, anis, MAX_SKILL_LEVELS).map((e) => e.stat)).toEqual(['burstGaugeSpeed']);
    expect(resolveInstant(withFlower, anis, MAX_SKILL_LEVELS)).toEqual([]);
    // 外した後の定義には squad の効果が残らないので、2 回通しても同じ
    expect(applySquad(withFlower, [anis, flower], 0)).toBe(withFlower);
  });

  it('rejects squad on other effect kinds and malformed conditions', () => {
    const base = { kind: 'passive', target: 'allies', stat: 'burstGaugeSpeed', ref: 5 };
    expect(() =>
      parseSkillDefinition(
        withFirstEffect({
          kind: 'damage',
          trigger: { count: 'fullChargeShot' },
          damageType: 'additional',
          ref: 4,
          squad: absent,
        }),
      ),
    ).toThrow(/squad: only allowed in passive, timed and cooldownReduction/);
    expect(() =>
      parseSkillDefinition(withFirstEffect({ ...base, squad: { otherBurstStep: 'AllStep', present: false } })),
    ).toThrow(/otherBurstStep/);
    expect(() =>
      parseSkillDefinition(withFirstEffect({ ...base, squad: { otherBurstStep: 'Step1', present: 'no' } })),
    ).toThrow(/present: expected a boolean/);
    expect(() =>
      parseSkillDefinition(withFirstEffect({ ...base, squad: { otherBurstStep: 'Step1', present: false, x: 1 } })),
    ).toThrow(/squad\.x: unknown field/);
    expect(() =>
      parseSkillDefinition(
        withFirstEffect({ kind: 'ammoRefill', trigger: 'battleStart', target: 'allies', ref: 3, squad: absent }),
      ),
    ).toThrow(/squad: unknown field/);
  });
});
