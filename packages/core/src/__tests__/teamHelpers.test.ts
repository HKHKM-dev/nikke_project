// テストの共通の道具（teamHelpers.ts の fixedSlot）の既定と、options の決まり
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf } from '../enemies.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { characterOf, DEFINED_IDS, rawDefinition, type RawDefinition } from './data.ts';
import {
  ENEMY_PRESETS,
  fixedEnemy,
  fixedSlot,
  fixedTeam,
  RANGE_BIGARMS,
  rangeEnemyWithEvents,
  SHOOTING_RANGE_ENEMY,
} from './teamHelpers.ts';

const DEFINED = [...DEFINED_IDS][0]!;

describe('fixedSlot', () => {
  it('builds the fixed-spec slot with the manual condition and the definition of a defined character', () => {
    const c = characterOf(DEFINED);
    const fixed = computeFixedSpecAttack(c);
    expect(fixedSlot(DEFINED)).toEqual({
      character: c,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      condition: { coreHitRate: 1, distanceBonus: false },
      skills: { definition: parseSkillDefinition(rawDefinition(DEFINED)), levels: MAX_SKILL_LEVELS },
    });
  });

  it('adds only what the options name', () => {
    const c = characterOf(DEFINED);
    const slot = fixedSlot(DEFINED, {
      condition: { coreHitRate: 0, distanceBonus: true },
      conditionMode: 'auto',
      hp: true,
      defence: true,
      treasurePhase: 3,
      extra: { hpRatio: 0.5 },
    });
    expect(slot).toMatchObject({
      condition: { coreHitRate: 0, distanceBonus: true },
      conditionMode: 'auto',
      hpOverride: computeFixedSpecHp(c),
      defenceOverride: computeFixedSpecDefence(c),
      hpRatio: 0.5,
    });
    expect(slot.skills?.treasurePhase).toBe(3);
  });

  it('takes a replacement definition as JSON, as a parsed definition, or none', () => {
    const raw = rawDefinition<RawDefinition>(DEFINED);
    const parsed = parseSkillDefinition(raw);
    expect(fixedSlot(DEFINED, { definition: raw }).skills?.definition).toEqual(parsed);
    expect(fixedSlot(DEFINED, { parsed }).skills?.definition).toBe(parsed);
    expect(fixedSlot(DEFINED, { definition: null }).skills).toBeUndefined();
    // 定義の付かない枠では、宝物の段階は効かない
    expect(fixedSlot(DEFINED, { definition: null, treasurePhase: 3 }).skills).toBeUndefined();
  });

  it('edits a copy, so the JSON of the caller stays as it was', () => {
    const raw = rawDefinition<RawDefinition & { checkedAt: string }>(DEFINED);
    const before = JSON.stringify(raw);
    let edited: unknown;
    const slot = fixedSlot(DEFINED, {
      definition: raw,
      edit: (r) => {
        edited = r;
        (r as RawDefinition & { checkedAt: string }).checkedAt = '2000-01-01';
      },
    });
    expect(edited).not.toBe(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(slot.skills?.definition?.checkedAt).toBe('2000-01-01');
  });

  it('refuses options that would be dropped silently', () => {
    const raw = rawDefinition(DEFINED);
    const parsed = parseSkillDefinition(raw);
    // 定義の JSON をそのまま 2 つ目の引数に渡した呼び出し
    expect(() => fixedSlot(DEFINED, raw as never)).toThrow(/unknown option/);
    expect(() => fixedSlot(DEFINED, { parsed, definition: raw })).toThrow(/cannot be combined/);
    expect(() => fixedSlot(DEFINED, { parsed, edit: () => {} })).toThrow(/cannot be combined/);
  });
});

describe('敵と編成の道具', () => {
  it('builds the plain enemy without events, and the range enemy with the jump events and the target', () => {
    expect(fixedEnemy()).toEqual({ defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true });
    expect(fixedEnemy({ element: 'Fire' })).toEqual({
      defence: FIXED_SPEC_ENEMY_DEFENCE,
      element: 'Fire',
      hasCore: true,
    });
    expect(rangeEnemyWithEvents()).toEqual({
      defence: FIXED_SPEC_ENEMY_DEFENCE,
      element: 'Fire',
      hasCore: true,
      events: enemyEventsOf(ENEMY_PRESETS, ['range-3min-jump'], 180),
      target: RANGE_BIGARMS,
      landings: enemyLandingsOf(ENEMY_PRESETS, ['range-3min-jump'], 180, RANGE_BIGARMS),
    });
    // 出来事と着地点は、渡した戦闘時間で作る
    expect(rangeEnemyWithEvents({ durationSeconds: 60, defence: 100, element: null })).toMatchObject({
      defence: 100,
      element: null,
      events: enemyEventsOf(ENEMY_PRESETS, ['range-3min-jump'], 60),
    });
  });

  it('keeps the shared presets frozen', () => {
    expect(Object.isFrozen(ENEMY_PRESETS)).toBe(true);
    expect(Object.isFrozen(RANGE_BIGARMS.landings)).toBe(true);
  });

  it('builds a 180-second burst team from ids or slots, and leaves out an omitted controlled slot', () => {
    const slot = fixedSlot(DEFINED, { hp: true });
    const team = fixedTeam([DEFINED, slot, null], 1);
    expect(team).toEqual({
      slots: [fixedSlot(DEFINED), slot, null],
      enemy: SHOOTING_RANGE_ENEMY,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 1,
    });
    expect('controlledSlot' in fixedTeam([DEFINED], undefined)).toBe(false);
    expect(fixedTeam([DEFINED], 0, { burst: false, enemy: fixedEnemy({ element: 'Wind' }) })).toMatchObject({
      burst: false,
      enemy: { element: 'Wind' },
    });
  });
});
