// フローラ（411）の定義（plan/design-adjacent-allies.md）: 基礎版と宝物版の読み込み・Lv ごとの解決値と、足した語彙の検査
// （対象「両隣」と includeSelf・両隣の味方の HP の割合のきっかけ・味方の全部のスタック可能バフへのスタック量▲）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CharacterData } from '../../types.ts';
import { adjacentSlotsOf, fixedTargetsOf } from '../composition.ts';
import {
  MAX_SKILL_LEVELS,
  resolveAllStackableChanges,
  resolveStateGrants,
  resolveTimed,
  resolveTrigger,
  type SkillLevels,
} from '../resolve.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';
import { gameSecondsToFrames } from '../../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type RawDefinition = {
  skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }>;
  treasureSkills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }>;
};

const flora = readJson<CharacterData>('../../../data/characters/411.json');
const raw = readJson<RawDefinition>('../../../data/skills/411.json');
const def = parseSkillDefinition(raw);
const LV7: SkillLevels = { skill1: 7, skill2: 7, burst: 7 };
const treasure = applyTreasure(flora, def, 3);

/** 定義を写して 1 つの効果を書き換え、読み込む */
function parseWith(slot: 'skills' | 'treasureSkills', skill: string, index: number, patch: Record<string, unknown>) {
  const copy = structuredClone(raw);
  const effect = copy[slot][skill]!.effects[index]!;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete effect[k];
    else effect[k] = v;
  }
  return () => parseSkillDefinition(copy);
}

describe('読み込み', () => {
  it('reads the base and the treasure versions of all three slots', () => {
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['heal', 'stackChange']);
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual(['state', 'timed']);
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['heal', 'timed']);
    expect(def.treasureSkills?.skill1?.effects.map((e) => e.kind)).toEqual(['state', 'heal', 'stackChange', 'timed']);
    expect(def.treasureSkills?.skill2?.effects.map((e) => e.kind)).toEqual(['state', 'timed', 'timed']);
    expect(def.treasureSkills?.burst?.effects.map((e) => e.kind)).toEqual(['heal', 'timed', 'timed']);
  });

  it('takes includeSelf only with targetState or the adjacent target', () => {
    expect(parseWith('skills', 'skill1', 0, { target: 'allies' })).toThrow(
      /includeSelf.*targetState or target "adjacent"/,
    );
    expect(parseWith('skills', 'skill2', 1, { includeSelf: true })).toThrow(/includeSelf/);
  });

  it('takes the adjacent target only in timed, state grants and heal', () => {
    const copy = structuredClone(raw);
    copy.skills.skill2!.effects.push({ kind: 'passive', target: 'adjacent', stat: 'attack', ref: 4 });
    expect(() => parseSkillDefinition(copy)).toThrow(/adjacent is only allowed/);
    const gauge = structuredClone(raw);
    gauge.skills.burst!.effects.push({ kind: 'burstGauge', trigger: 'burstUse', target: 'adjacent', ref: 1 });
    expect(() => parseSkillDefinition(gauge)).toThrow(/burstGauge must target "allies"|adjacent is only allowed/);
  });

  it('puts an adjacent HP trigger only with a duration in seconds and without max HP stats', () => {
    expect(parseWith('skills', 'skill2', 0, { durationRef: undefined, durationUntil: 'fullBurstEnd' })).toThrow(
      /adjacent HP trigger goes with a duration/,
    );
    expect(parseWith('skills', 'skill2', 1, { stat: 'maxHpOnly' })).toThrow(
      /adjacent HP trigger cannot carry "maxHpOnly"/,
    );
    expect(parseWith('skills', 'skill2', 1, { trigger: { adjacentHpFull: false } })).toThrow(/must be true/);
  });

  it('takes allStackable only on allies, without a state', () => {
    expect(parseWith('skills', 'skill1', 1, { target: 'self' })).toThrow(/allStackable must target "allies"/);
    expect(parseWith('skills', 'skill1', 1, { state: 'barrier' })).toThrow(/state/);
  });
});

describe('解決値（スキル Lv7）', () => {
  it('resolves the HP ratio triggers to ratios', () => {
    const [barrier] = resolveStateGrants(def, flora, LV7).filter((g) => g.state === 'barrier');
    expect(barrier!.trigger).toEqual({ adjacentHpAtMost: 0.9 });
    const trueDamage = resolveTimed(def, flora, LV7).find(
      (e) => e.stat === 'trueDamage' && e.source.skill === 'skill2',
    );
    expect(trueDamage!.trigger).toEqual({ adjacentHpFull: true });
    expect(trueDamage!.value).toBeCloseTo(0.2675, 6);
    expect(resolveTrigger({ adjacentHpAtMostRef: 1 }, flora.skills.skill2, 1)).toEqual({ adjacentHpAtMost: 0.9 });
  });

  it('resolves the stack increase to 1 every 100 normal shots on Electric Code allies', () => {
    const [stack] = resolveAllStackableChanges(def, flora, MAX_SKILL_LEVELS);
    expect(stack).toMatchObject({
      amount: 1,
      targetElement: 'Electronic',
      trigger: { count: 'normalShot', every: 100 },
    });
  });

  it('resolves the treasure Peace of Mind grant and the Max HP-only increase', () => {
    const grants = resolveStateGrants(treasure.definition, treasure.character, LV7);
    expect(grants.find((g) => g.state === 'heartOfPeace')).toMatchObject({ trigger: 'battleStart' });
    const up = resolveTimed(treasure.definition, treasure.character, LV7).find((e) => e.stat === 'maxHpOnly');
    expect(up).toMatchObject({ trigger: 'burstStage2Enter', scaling: 'casterMaxHp', targetState: 'heartOfPeace' });
    expect(up!.value).toBeCloseTo(0.1297, 6);
    expect(up!.durationFrames).toBe(gameSecondsToFrames(2));
  });
});

describe('両隣の枠', () => {
  const team = [{}, {}, null, {}, {}];
  it('takes the non-empty slots left and right (and self with includeSelf)', () => {
    expect(adjacentSlotsOf(team, 0, false)).toEqual([1]);
    expect(adjacentSlotsOf(team, 1, true)).toEqual([0, 1]);
    expect(adjacentSlotsOf(team, 3, false)).toEqual([4]);
    expect(adjacentSlotsOf(team, 4, true)).toEqual([3, 4]);
  });

  it('writes the adjacent slots of the heal to fixedTargets', () => {
    const characters = [EXIA_LIKE, flora, EXIA_LIKE, null, EXIA_LIKE];
    expect(fixedTargetsOf(def.skills.skill1.effects[0]!, characters, 1)).toEqual([0, 1, 2]);
    expect(fixedTargetsOf(def.skills.skill1.effects[0]!, characters, 4)).toEqual([4]);
  });
});

const EXIA_LIKE = readJson<CharacterData>('../../../data/characters/210.json');
