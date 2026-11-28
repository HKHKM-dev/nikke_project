// 回復の対象の語彙（plan/design-heal-target-rank.md）: heal の「自分を除く味方全体」（excludeSelf）、対象「最終防御力が最も高い味方」
// （topDefense）と「残りの HP の値が最も低い味方」（lowestHp）、対象の HP の割合の閾値（targetHpAtMostRef）。
// ベイ（550）宝物版 S1・パスカル（812）S1・バースト・トリナ（412）S1 と、回復を受けた時のアスカ（830）の S1
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { piecesOf } from './historyHelpers.ts';
import { describeRuns, fixedSlot, type FixedSlotOptions, fixedTeam } from './teamHelpers.ts';

const BAY = 550;
const PASCAL = 812;
const TRINA = 412;
const ASUKA = 830;
const CROWN = 330;
const LAPI = 10;
/** スペック固定の最大HP と防御力を付ける（順位はこれを読む。値はクラスとレア度で決まる） */
const SPEC: FixedSlotOptions = { hp: true, defence: true };
const slot = (id: number, extra: FixedSlotOptions = {}): TeamSlotInput => fixedSlot(id, { ...SPEC, ...extra });

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const withEffect = (effect: object) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-11-28',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  });
const HEAL = { kind: 'heal', trigger: 'burstUse', ref: 1 };

describe('読み込み', () => {
  it('accepts topDefense and lowestHp only in heal, without weapon filters', () => {
    for (const target of ['topDefense', 'lowestHp']) {
      expect(withEffect({ ...HEAL, target, targetCount: 1 }).skills.skill1.effects[0]).toMatchObject({ target });
      expect(() => withEffect({ ...HEAL, target })).toThrow(/exactly one of targetCount and targetCountRef/);
      expect(() => withEffect({ ...HEAL, target, targetCount: 1, targetClass: 'Attacker' })).toThrow(
        /cannot be combined with a weapon/,
      );
      expect(() =>
        withEffect({ kind: 'timed', trigger: 'burstUse', target, stat: 'attack', ref: 1, durationSeconds: 1 }),
      ).toThrow(new RegExp(`${target} is only allowed in heal`));
    }
  });

  it('accepts excludeSelf "always" on a heal of all allies only', () => {
    expect(withEffect({ ...HEAL, target: 'allies', excludeSelf: 'always' }).skills.skill1.effects[0]).toMatchObject({
      excludeSelf: 'always',
    });
    expect(() => withEffect({ ...HEAL, target: 'allies', excludeSelf: 'unlessShort' })).toThrow(/only takes "always"/);
    expect(() => withEffect({ ...HEAL, target: 'self', excludeSelf: 'always' })).toThrow(/only allowed with target/);
  });

  it('accepts targetHpAtMostRef only with lowestHpRatio', () => {
    expect(
      withEffect({ ...HEAL, target: 'lowestHpRatio', targetCount: 2, targetHpAtMostRef: 1 }).skills.skill1.effects[0],
    ).toMatchObject({ targetHpAtMostRef: 1 });
    expect(() => withEffect({ ...HEAL, target: 'lowestHp', targetCount: 2, targetHpAtMostRef: 1 })).toThrow(
      /only allowed with target "lowestHpRatio"/,
    );
  });

  it('defines the heals of Bay (treasure S1), Pascal (S1, Burst) and Trina (S1) in place of the unimplemented notes', () => {
    const bay = parseSkillDefinition(rawDefinition(BAY)).treasureSkills!.skill1;
    expect(bay?.effects[0]).toMatchObject({ kind: 'heal', target: 'allies', excludeSelf: 'always' });
    const pascal = parseSkillDefinition(rawDefinition(PASCAL)).skills;
    expect([pascal.skill1.support, pascal.skill2.support, pascal.burst.support]).toEqual([
      'supported',
      'noEffect',
      'supported',
    ]);
    expect(pascal.skill1.effects[0]).toMatchObject({ target: 'topDefense', targetCountRef: 2 });
    expect(pascal.burst.effects[0]).toMatchObject({ target: 'lowestHp', targetCountRef: 1 });
    const trina = parseSkillDefinition(rawDefinition(TRINA)).skills.skill1;
    expect(trina.support).toBe('supported');
    expect(trina.effects.slice(1)).toMatchObject([
      { target: 'lowestHpRatio', targetCountRef: 4, targetHpAtMostRef: 3 },
      { target: 'lowestHpRatio', targetCountRef: 7, targetHpAtMostRef: 6 },
    ]);
  });
});

/** 枠 asuka のアスカの S1（回復効果が適用された時の攻撃力▲）の件の小片 */
const asukaS1 = (input: TeamInput, asuka: number) =>
  piecesOf(planTeamRun(input)).filter(
    (p) => p.slotIndex === asuka && p.effect.source.resourceId === ASUKA && p.effect.source.skill === 'skill1',
  );

// ベイ（宝物。II）+ アスカ（III・操作）。I がいないのでバーストは連鎖しない
const BAY_ASUKA = fixedTeam([slot(BAY, { treasurePhase: 3 }), slot(ASUKA)], 1, { burst: false });
// クラウン（SSR の防御型・II）+ パスカル（SR の支援型・I）+ ラピ（SR の火力型・III）+ アスカ（SSR の火力型・III・操作）。オートバースト OFF。
// スペック固定の防御力はクラウン > アスカ > パスカル > ラピ、最大HP はクラウン > アスカ > パスカル > ラピ
const PASCAL_S1 = fixedTeam([slot(CROWN), slot(PASCAL), slot(LAPI), slot(ASUKA)], 3, { burst: false });
// 同じ並びでオートバースト ON（パスカルのバーストの回復の対象を見る）
const PASCAL_BURST = fixedTeam([slot(CROWN), slot(PASCAL), slot(LAPI), slot(ASUKA)], 3);

describe('ベイ（宝物版 S1）: 自分を除く味方全体への回復', () => {
  const plan = planTeamRun(BAY_ASUKA);
  const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 0);

  it('heals Asuka on every fully charged shot and never Bay herself', () => {
    expect(heals.length).toBeGreaterThan(10);
    expect(heals.every((h) => h.slotIndex === 1)).toBe(true);
  });

  it('keeps Asuka’s S1 up from the first heal', () => {
    const pieces = asukaS1(BAY_ASUKA, 1).sort((a, b) => a.start - b.start);
    expect(pieces[0]!.start).toBe(heals[0]!.frame);
    expect(Math.max(...pieces.map((p) => p.end))).toBe(plan.frames);
  });
});

describe('パスカル S1: 最終防御力が最も高い味方 1 機への回復', () => {
  const plan = planTeamRun(PASCAL_S1);
  const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 1);

  it('heals only Crown (the only Defender) every 10 shots, so Asuka never gets her S1', () => {
    const shots = plan.shots[1]!.frames;
    expect(heals.length).toBe(Math.floor(shots.filter((f) => f < plan.frames - 1).length / 10));
    expect(heals.every((h) => h.slotIndex === 0)).toBe(true);
    expect(asukaS1(PASCAL_S1, 3)).toEqual([]);
  });

  it('takes the leftmost of tied Defenders (not verified)', () => {
    // ベイとクラウンは、どちらも SSR の防御型（スペック固定の防御力が同じ）
    const tied = fixedTeam([slot(PASCAL), slot(BAY), slot(CROWN)], 0, { burst: false });
    const at = planTeamRun(tied).history.heals.filter((h) => h.sourceSlotIndex === 0);
    expect(at.length).toBeGreaterThan(0);
    expect(at.every((h) => h.slotIndex === 1)).toBe(true);
  });
});

describe('パスカル バースト: 残りの HP の値が最も低い味方 3 機への回復', () => {
  const plan = planTeamRun(PASCAL_BURST);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 1);

  it('heals Lapi, Pascal and Asuka (lowest max HP), not Crown', () => {
    expect(uses.length).toBeGreaterThan(0);
    for (const a of uses) {
      const at = plan.history.heals.filter((h) => h.sourceSlotIndex === 1 && h.frame === a.frame);
      expect(new Set(at.map((h) => h.slotIndex))).toEqual(new Set([1, 2, 3]));
    }
  });

  it('ranks by HP value, so a low assumed HP ratio brings Crown in and leaves Asuka (the highest of the rest) out', () => {
    const low = fixedTeam([slot(CROWN, { extra: { hpRatio: 0.5 } }), slot(PASCAL), slot(LAPI), slot(ASUKA)], 3);
    const run = planTeamRun(low);
    const use = run.schedule!.activations.find((a) => a.slotIndex === 1)!;
    const at = run.history.heals.filter((h) => h.sourceSlotIndex === 1 && h.frame === use.frame);
    expect(new Set(at.map((h) => h.slotIndex))).toEqual(new Set([0, 1, 2]));
  });
});

describe('トリナ S1: HP の割合の閾値の回復', () => {
  const trinaHeals = (input: TeamInput) =>
    planTeamRun(input).history.heals.filter((h) => h.sourceSlotIndex === 0 && h.slotIndex === 1);
  const team = (ratio: number) =>
    fixedTeam([slot(TRINA), slot(ASUKA, { extra: { hpRatio: ratio } })], 1, { burst: false });

  it('does not heal allies above 50%', () => {
    expect(trinaHeals(team(1))).toEqual([]);
    expect(asukaS1(team(1), 1)).toEqual([]);
  });

  it('heals an ally at or below 50% once per fully charged shot, and twice at or below 30%', () => {
    const half = trinaHeals(team(0.45));
    expect(half.length).toBeGreaterThan(10);
    expect(new Set(half.map((h) => h.frame)).size).toBe(half.length);
    const low = trinaHeals(team(0.25));
    expect(low.length).toBe(half.length * 2);
    expect(asukaS1(team(0.45), 1).length).toBeGreaterThan(0);
  });

  it('heals the one ally below the threshold even if the other of the 2 is not (C-1311)', () => {
    const heals = planTeamRun(team(0.45)).history.heals.filter((h) => h.sourceSlotIndex === 0);
    expect(heals.every((h) => h.slotIndex === 1)).toBe(true);
  });
});

describeRuns({ BAY_ASUKA, PASCAL_S1, PASCAL_BURST });
