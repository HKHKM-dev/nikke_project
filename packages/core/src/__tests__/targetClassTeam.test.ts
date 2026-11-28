// 2 段目の段 9（plan/design-skill-stage9.md）: 対象の絞り込み「〈クラス〉型の味方」（targetClass）。エヌ：ミラクルフェアリー（121）の
// S1（支援型の味方への吸収回復）とバースト（火力型の味方への回復と攻撃力▲）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { matchesTargetFilter } from '../skills/targets.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { piecesOf } from './historyHelpers.ts';
import { rawDefinition } from './data.ts';
import { fixedEnemy, fixedSlot, type FixedSlotOptions, fixedTeam } from './teamHelpers.ts';

const N_MF = 121;
const FLOWER = 304;
const ISABEL = 231;
const LITER = 82;
const definitionOf = (id: number) => parseSkillDefinition(rawDefinition(id));
/** このテストの枠の、既定と違う所 */
const SLOT_OPTIONS: FixedSlotOptions = { hp: true, defence: true };

const enemy: EnemyInput = fixedEnemy({ element: 'Fire' });

// フラワー（防御型・I）・エヌ：ミラクルフェアリー（支援型・II）・イサベル（火力型・III）・リター（支援型・I）
const TEAM: TeamInput = fixedTeam(
  [FLOWER, N_MF, ISABEL, LITER].map((id) => fixedSlot(id, SLOT_OPTIONS)),
  2,
  { enemy },
);

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const withEffect = (effect: object) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-18',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  });
const TIMED = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'allies',
  targetClass: 'Attacker',
  stat: 'attack',
  ref: 1,
  durationSeconds: 10,
};

describe('targetClass の読み込み', () => {
  it('accepts a class on the effects that take a weapon or element filter, but not on self', () => {
    expect(withEffect(TIMED).skills.skill1.effects[0]).toMatchObject({ targetClass: 'Attacker' });
    expect(
      withEffect({ kind: 'passive', target: 'allies', targetClass: 'Defender', stat: 'attack', ref: 1 }).skills.skill1
        .effects[0],
    ).toMatchObject({ targetClass: 'Defender' });
    expect(
      withEffect({ kind: 'heal', trigger: 'burstUse', target: 'allies', targetClass: 'Supporter', ref: 1 }).skills
        .skill1.effects[0],
    ).toMatchObject({ targetClass: 'Supporter' });
    expect(() => withEffect({ ...TIMED, targetClass: 'Healer' })).toThrow(/expected one of/);
    expect(() => withEffect({ ...TIMED, target: 'self' })).toThrow(/targetClass: only allowed with target/);
    expect(() => withEffect({ ...TIMED, stat: 'damageTaken' })).toThrow(
      /cannot narrow its target by weapon, element, class or squad/,
    );
    expect(() =>
      withEffect({
        kind: 'heal',
        trigger: 'burstUse',
        target: 'lowestHpRatio',
        targetCount: 1,
        targetClass: 'Attacker',
        ref: 1,
      }),
    ).toThrow(/lowestHpRatio cannot be combined with a weapon, element or class filter/);
    expect(() =>
      withEffect({ kind: 'burstGauge', trigger: 'burstUse', target: 'allies', targetClass: 'Attacker', ref: 1 }),
    ).toThrow(/burstGauge cannot narrow its target/);
  });

  it('matches the class of the target slot, and nothing when the slot has no class', () => {
    const slot = { weaponType: 'AR' as const, element: 'Fire' as const };
    expect(matchesTargetFilter({ targetClass: 'Attacker' }, { ...slot, class: 'Attacker' })).toBe(true);
    expect(matchesTargetFilter({ targetClass: 'Attacker' }, { ...slot, class: 'Defender' })).toBe(false);
    expect(matchesTargetFilter({ targetClass: 'Attacker' }, slot)).toBe(false);
    expect(matchesTargetFilter({}, slot)).toBe(true);
  });

  it('defines S1 and the burst of N: Miracle Fairy with the class filter (2.1 節)', () => {
    const def = definitionOf(N_MF);
    expect(def.skills.skill1.effects).toMatchObject([
      {
        kind: 'heal',
        trigger: { count: 'normalShot', everyRef: 1 },
        target: 'allies',
        targetClass: 'Supporter',
        ref: 2,
        durationRef: 3,
      },
    ]);
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'heal', trigger: 'burstUse', target: 'allies', targetClass: 'Attacker', ref: 3 },
      {
        kind: 'timed',
        trigger: 'burstUse',
        target: 'allies',
        targetClass: 'Attacker',
        stat: 'attack',
        ref: 4,
        durationRef: 5,
      },
    ]);
    expect(def.skills.burst.notes!.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});

describe('エヌ：ミラクルフェアリーの絞り込み（防御型・支援型・火力型・支援型の編成）', () => {
  const plan = planTeamRun(TEAM);

  it('gives the attack up of the burst to the Attacker ally only', () => {
    const ups = piecesOf(plan).filter((p) => p.sourceSlotIndex === 1 && p.effect.stat === 'attack');
    expect(ups.length).toBeGreaterThan(0);
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([2]));
    expect(ups[0]!.effect.value).toBeCloseTo(0.7722, 12);
  });

  it('heals the Supporter allies (herself included) with S1, and the Attacker ally with the burst', () => {
    const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 1);
    expect(new Set(heals.map((h) => h.slotIndex))).toEqual(new Set([1, 2, 3]));
    const ups = piecesOf(plan).filter((p) => p.sourceSlotIndex === 1 && p.effect.stat === 'attack');
    const burstFrames = new Set(ups.map((p) => p.start));
    expect(
      heals.filter((h) => h.slotIndex === 2).every((h) => burstFrames.has(h.frame) || burstFrames.has(h.frame - 1)),
    ).toBe(true);
  });
});
