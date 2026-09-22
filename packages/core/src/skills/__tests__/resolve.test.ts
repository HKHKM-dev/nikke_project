import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import type { SkillRaw } from '../../types.ts';
import { MAX_SKILL_LEVELS, renderSkillDescription, resolvePassives, resolveTimed, skillValue } from '../resolve.ts';
import { parseSkillDefinition, parseSkillIndex, type SkillDefinition } from '../types.ts';

/** Lv1..10 で lv1 から step ずつ増える値の文字列配列 */
function levels(lv1: number, step: number): string[] {
  return Array.from({ length: 10 }, (_, i) => String(Math.round((lv1 + step * i) * 100) / 100));
}

const skill1: SkillRaw = {
  id: 101,
  name: { ja: 'スキル1', en: 'Skill 1' },
  description: {
    ja: '■戦闘開始時、自分に\n<color=#00AEFF>「攻撃力{description_value_01}％▲」「持続」</color>',
    en: '■ Affects self. <color=#00AEFF>ATK ▲ {description_value_01}% continuously.</color>',
  },
  values: [levels(10, 1), null, levels(5, 0.5)],
};
const skill2: SkillRaw = {
  id: 102,
  name: { ja: 'スキル2', en: 'Skill 2' },
  description: { ja: '<word_group=10025>最終</word_group>攻撃力の{description_value_02}％', en: '' },
  values: [levels(70, 0), levels(8, 0.5)],
};
const burst: SkillRaw = { id: 103, name: { ja: 'バースト', en: 'Burst' }, description: { ja: '', en: '' }, values: [] };
const character = makeCharacter({}, { resourceId: 7, skills: { skill1, skill2, burst } });

function definition(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    formatVersion: 1,
    resourceId: 7,
    checkedAt: '2026-09-22',
    skills: {
      skill1: { support: 'partial', effects: [{ kind: 'passive', target: 'self', stat: 'attack', ref: 1 }] },
      skill2: {
        support: 'supported',
        effects: [
          {
            kind: 'passive',
            target: 'allies',
            stat: 'attack',
            scaling: 'casterAttack',
            ref: 2,
            assumes: { ja: 'HP 70% 以上', en: 'HP 70% or above' },
          },
        ],
      },
      burst: { support: 'unsupported', effects: [] },
    },
    ...overrides,
  };
}

describe('skillValue', () => {
  it('returns the raw number for the level (no unit conversion)', () => {
    expect(skillValue(skill1, 1, 1)).toBe(10);
    expect(skillValue(skill1, 1, 10)).toBe(19);
    expect(skillValue(skill1, 3, 4)).toBe(6.5);
  });

  it('rejects out-of-range ref, empty slots and out-of-range levels', () => {
    expect(() => skillValue(skill1, 0, 1)).toThrow(RangeError);
    expect(() => skillValue(skill1, 4, 1)).toThrow(RangeError);
    expect(() => skillValue(skill1, 2, 1)).toThrow(/empty/);
    expect(() => skillValue(skill1, 1, 0)).toThrow(RangeError);
    expect(() => skillValue(skill1, 1, 11)).toThrow(RangeError);
    expect(() => skillValue(skill1, 1, 2.5)).toThrow(RangeError);
  });

  it('rejects non-numeric text', () => {
    const odd: SkillRaw = { ...skill1, values: [['1.5秒', '2秒', '', '', '', '', '', '', '', '']] };
    expect(() => skillValue(odd, 1, 1)).toThrow(/not numeric/);
  });
});

describe('resolvePassives', () => {
  it('resolves every effect to a ratio at the given level and fills scaling', () => {
    const resolved = resolvePassives(definition(), character, { skill1: 10, skill2: 1, burst: 10 });
    expect(resolved).toEqual([
      {
        source: { resourceId: 7, skill: 'skill1', name: { ja: 'スキル1', en: 'Skill 1' } },
        target: 'self',
        stat: 'attack',
        scaling: 'ratio',
        value: 0.19,
      },
      {
        source: { resourceId: 7, skill: 'skill2', name: { ja: 'スキル2', en: 'Skill 2' } },
        target: 'allies',
        stat: 'attack',
        scaling: 'casterAttack',
        value: 0.08,
        assumes: { ja: 'HP 70% 以上', en: 'HP 70% or above' },
      },
    ]);
  });

  it('follows the skill level', () => {
    const lv1 = resolvePassives(definition(), character, { skill1: 1, skill2: 1, burst: 1 });
    const lv10 = resolvePassives(definition(), character, MAX_SKILL_LEVELS);
    expect(lv1[0]?.value).toBeCloseTo(0.1, 12);
    expect(lv10[0]?.value).toBeCloseTo(0.19, 12);
    expect(lv10[1]?.value).toBeCloseTo(0.125, 12);
  });

  it('ignores burstDamage effects (they are resolved by resolveBurstDamage)', () => {
    const withBurst = definition({
      skills: {
        ...definition().skills,
        burst: { support: 'supported', effects: [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }] },
      },
    });
    expect(resolvePassives(withBurst, character, MAX_SKILL_LEVELS)).toHaveLength(2);
  });

  it('skips unsupported skills and rejects a definition for another character', () => {
    const none = definition({
      skills: {
        skill1: { support: 'unsupported', effects: [] },
        skill2: { support: 'unsupported', effects: [] },
        burst: { support: 'unsupported', effects: [] },
      },
    });
    expect(resolvePassives(none, character, MAX_SKILL_LEVELS)).toEqual([]);
    expect(() => resolvePassives(definition({ resourceId: 8 }), character, MAX_SKILL_LEVELS)).toThrow(RangeError);
  });
});

describe('parseSkillDefinition', () => {
  const raw = () => JSON.parse(JSON.stringify(definition())) as Record<string, unknown>;

  it('accepts a valid definition and returns a normalized copy', () => {
    expect(parseSkillDefinition(raw())).toEqual(definition());
  });

  it('rejects casterAttack on a non-attack stat', () => {
    const bad = raw();
    (bad.skills as Record<string, { effects: Record<string, unknown>[] }>).skill2!.effects[0]!.stat = 'critRate';
    expect(() => parseSkillDefinition(bad)).toThrow(/casterAttack/);
  });

  it('rejects assumes and notes that are not LocalizedText', () => {
    const bad = raw();
    (bad.skills as Record<string, { effects: Record<string, unknown>[] }>).skill2!.effects[0]!.assumes = 'HP 70%';
    expect(() => parseSkillDefinition(bad)).toThrow(/assumes/);
    const badNotes = raw();
    (badNotes.skills as Record<string, Record<string, unknown>>).skill1!.notes = ['text'];
    expect(() => parseSkillDefinition(badNotes)).toThrow(/notes/);
  });

  it('rejects wrong format version, bad refs, extra slots and modeled burst skills', () => {
    expect(() => parseSkillDefinition({ ...raw(), formatVersion: 2 })).toThrow(/formatVersion/);
    const badRef = raw();
    (badRef.skills as Record<string, { effects: Record<string, unknown>[] }>).skill1!.effects[0]!.ref = 0;
    expect(() => parseSkillDefinition(badRef)).toThrow(/ref/);
    const extra = raw();
    (extra.skills as Record<string, unknown>).skill3 = { support: 'unsupported', effects: [] };
    expect(() => parseSkillDefinition(extra)).toThrow(/skill3/);
    const burstPassive = raw();
    (burstPassive.skills as Record<string, unknown>).burst = {
      support: 'supported',
      effects: [{ kind: 'passive', target: 'self', stat: 'attack', ref: 1 }],
    };
    expect(() => parseSkillDefinition(burstPassive)).toThrow(/passive effects are not allowed in burst/);
  });

  it('accepts burstDamage only in the burst slot (Stage 5)', () => {
    const ok = raw();
    (ok.skills as Record<string, unknown>).burst = {
      support: 'partial',
      effects: [
        { kind: 'burstDamage', ref: 1, damageType: 'skill' },
        { kind: 'burstDamage', ref: 2, damageType: 'distributed', assumes: { ja: '単体', en: 'single target' } },
      ],
      notes: [{ ja: 'バフは Stage 6', en: 'buffs are Stage 6' }],
    };
    expect(parseSkillDefinition(ok).skills.burst.effects).toEqual([
      { kind: 'burstDamage', ref: 1, damageType: 'skill' },
      { kind: 'burstDamage', ref: 2, damageType: 'distributed', assumes: { ja: '単体', en: 'single target' } },
    ]);

    const inSkill1 = raw();
    (inSkill1.skills as Record<string, { effects: unknown[] }>).skill1!.effects = [
      { kind: 'burstDamage', ref: 1, damageType: 'skill' },
    ];
    expect(() => parseSkillDefinition(inSkill1)).toThrow(/burstDamage is only allowed in burst/);

    const badType = raw();
    (badType.skills as Record<string, unknown>).burst = {
      support: 'supported',
      effects: [{ kind: 'burstDamage', ref: 1, damageType: 'dot' }],
    };
    expect(() => parseSkillDefinition(badType)).toThrow(/damageType/);

    const badKind = raw();
    (badKind.skills as Record<string, unknown>).burst = { support: 'supported', effects: [{ kind: 'dot', ref: 1 }] };
    expect(() => parseSkillDefinition(badKind)).toThrow(/kind/);
  });

  it('requires effects to match support', () => {
    const emptySupported = raw();
    (emptySupported.skills as Record<string, Record<string, unknown>>).skill1!.effects = [];
    expect(() => parseSkillDefinition(emptySupported)).toThrow(/at least one effect/);
    const unsupportedWithEffects = raw();
    (unsupportedWithEffects.skills as Record<string, Record<string, unknown>>).skill1!.support = 'unsupported';
    expect(() => parseSkillDefinition(unsupportedWithEffects)).toThrow(/no effects/);
  });

  it('parses the index', () => {
    expect(parseSkillIndex({ formatVersion: 1, resourceIds: [1, 2] })).toEqual({
      formatVersion: 1,
      resourceIds: [1, 2],
    });
    expect(() => parseSkillIndex({ formatVersion: 1, resourceIds: ['1'] })).toThrow(/resourceIds/);
  });
});

// ---- Stage 6: timed（トリガー付きの持続バフ） ----

describe('resolveTimed', () => {
  const timedDef = (): SkillDefinition => ({
    formatVersion: 1,
    resourceId: 7,
    checkedAt: '2026-09-22',
    skills: {
      skill1: { support: 'unsupported', effects: [] },
      skill2: {
        support: 'supported',
        effects: [
          // skill2 の values: [1] = 70（一定）、[2] = 8 + 0.5/Lv
          { kind: 'timed', trigger: 'fullBurstStart', target: 'self', stat: 'attack', ref: 1, durationRef: 2 },
        ],
      },
      burst: { support: 'unsupported', effects: [] },
    },
  });

  it('resolves the ratio and the duration from refs and follows the skill level', () => {
    const lv10 = resolveTimed(timedDef(), character, MAX_SKILL_LEVELS);
    expect(lv10).toHaveLength(1);
    expect(lv10[0]).toMatchObject({
      trigger: 'fullBurstStart',
      target: 'self',
      stat: 'attack',
      scaling: 'ratio',
      value: 0.7,
      // 維持秒数 12.5 秒 → 750f
      durationFrames: 750,
      effectIndex: 0,
    });
    const lv1 = resolveTimed(timedDef(), character, { skill1: 1, skill2: 1, burst: 1 });
    expect(lv1[0]?.durationFrames).toBe(480); // 8 秒
  });

  it('takes a literal durationSeconds and rounds it up to frames', () => {
    const def = timedDef();
    def.skills.skill2.effects = [
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationSeconds: 10 },
    ];
    expect(resolveTimed(def, character, MAX_SKILL_LEVELS)[0]?.durationFrames).toBe(600);
    def.skills.skill2.effects = [
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationSeconds: 0.05 },
    ];
    expect(resolveTimed(def, character, MAX_SKILL_LEVELS)[0]?.durationFrames).toBe(3);
  });

  it('skips unsupported slots and passive effects', () => {
    const def = timedDef();
    def.skills.skill2.support = 'unsupported';
    def.skills.skill2.effects = [];
    expect(resolveTimed(def, character, MAX_SKILL_LEVELS)).toEqual([]);
    expect(resolveTimed(definition(), character, MAX_SKILL_LEVELS)).toEqual([]); // passive だけの定義
    expect(resolvePassives(timedDef(), character, MAX_SKILL_LEVELS)).toEqual([]); // timed だけの定義
  });

  it('rejects a definition for another character', () => {
    expect(() => resolveTimed(timedDef(), makeCharacter({}, { resourceId: 8 }), MAX_SKILL_LEVELS)).toThrow(RangeError);
  });
});

describe('parseSkillDefinition with timed', () => {
  const withTimed = (effect: Record<string, unknown>, slot = 'burst'): unknown => {
    const raw = {
      formatVersion: 1,
      resourceId: 7,
      checkedAt: '2026-09-22',
      skills: {
        skill1: { support: 'unsupported', effects: [] },
        skill2: { support: 'unsupported', effects: [] },
        burst: { support: 'unsupported', effects: [] },
      },
    };
    (raw.skills as Record<string, unknown>)[slot] = { support: 'supported', effects: [effect] };
    return raw;
  };
  const base = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationRef: 2 };

  it('accepts timed in any slot', () => {
    for (const slot of ['skill1', 'skill2', 'burst']) {
      expect(parseSkillDefinition(withTimed(base, slot)).skills[slot as 'burst'].effects).toEqual([base]);
    }
  });

  it('requires exactly one of durationRef and durationSeconds', () => {
    const { durationRef: _omit, ...noDuration } = base;
    expect(() => parseSkillDefinition(withTimed(noDuration))).toThrow(/exactly one of durationRef/);
    expect(() => parseSkillDefinition(withTimed({ ...base, durationSeconds: 10 }))).toThrow(
      /exactly one of durationRef/,
    );
    expect(() => parseSkillDefinition(withTimed({ ...base, durationRef: undefined, durationSeconds: -1 }))).toThrow(
      /durationSeconds/,
    );
  });

  it('validates trigger, stat and casterAttack the same way as passive', () => {
    expect(() => parseSkillDefinition(withTimed({ ...base, trigger: 'onHit' }))).toThrow(/trigger/);
    expect(() => parseSkillDefinition(withTimed({ ...base, stat: 'defence' }))).toThrow(/stat/);
    expect(() => parseSkillDefinition(withTimed({ ...base, stat: 'critRate', scaling: 'casterAttack' }))).toThrow(
      /casterAttack/,
    );
    expect(
      parseSkillDefinition(withTimed({ ...base, target: 'allies', scaling: 'casterAttack' })).skills.burst.effects,
    ).toHaveLength(1);
  });

  it('still refuses passive in burst, pointing at timed', () => {
    const raw = withTimed({ kind: 'passive', target: 'self', stat: 'attack', ref: 1 }) as {
      skills: Record<string, unknown>;
    };
    expect(() => parseSkillDefinition(raw)).toThrow(/use timed with trigger "burstUse"/);
  });
});

describe('renderSkillDescription', () => {
  it('substitutes level values and strips markup tags', () => {
    expect(renderSkillDescription(skill1, 10, 'ja')).toBe('■戦闘開始時、自分に\n「攻撃力19％▲」「持続」');
    expect(renderSkillDescription(skill1, 1, 'en')).toBe('■ Affects self. ATK ▲ 10% continuously.');
    expect(renderSkillDescription(skill2, 3, 'ja')).toBe('最終攻撃力の9％');
  });

  it('leaves "?" for placeholders without values', () => {
    const missing: SkillRaw = { ...skill1, values: [] };
    expect(renderSkillDescription(missing, 1, 'ja')).toContain('「攻撃力?％▲」');
  });
});
