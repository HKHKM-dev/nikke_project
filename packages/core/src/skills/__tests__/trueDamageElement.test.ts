// 防御力無視ダメージ・有利コードの攻撃ダメージ等の語彙（plan/design-true-damage-element.md 3 節）。
// 定義の検証、編成の条件、窓、1 発の式を見る。定義に使ったのはウンファ：TU の S1・バースト（V-0207・V-0208。C-0311・C-0312・C-0314）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { FIXED_BURST_CYCLE, planFixedCycle } from '../../burst/fixedCycle.ts';
import { computeTriggerDamage, TRUE_DAMAGE_BUCKET, type TriggerDamageInput } from '../../damage.ts';
import type { BurstStep, CharacterData, SkillRaw } from '../../types.ts';
import { gameSecondsToFrame, gameSecondsToFrames } from '../../time.ts';
import { ZERO_BUFFS, type ChangedWeapon } from '../buffs.ts';
import { applyComposition, compositionAllows, enemyElementAllows, withCharacterAllows } from '../composition.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import {
  inFullBurstAt,
  planBuffTimeline,
  triggerFrames,
  untilFullBurstEndWindows,
  type TimelineSlot,
} from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition, type SkillEntry, type SkillEffect } from '../types.ts';

const FRAMES = gameSecondsToFrames(180);
const H = FIXED_BURST_CYCLE.normalFrames;
const C = FIXED_BURST_CYCLE.cycleFrames;

/** skill2 に効果を並べた定義（検証にかける前の JSON） */
function withSkill2(effects: unknown[]): unknown {
  const blank = { effects: [], notes: [{ ja: 'x', en: 'x', kind: 'noDamage' }] };
  return {
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-05',
    skills: { skill1: blank, skill2: { effects }, burst: blank },
  };
}

const conversion = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'trueDamageConversion', durationRef: 1 };

describe('trueDamage・trueDamageConversion の検証', () => {
  it('parses the flag without ref, and the up with ref', () => {
    const def = parseSkillDefinition(
      withSkill2([
        conversion,
        { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'trueDamage', ref: 2, durationRef: 1 },
      ]),
    );
    expect(def.skills.skill2.effects[0]).toMatchObject({ stat: 'trueDamageConversion' });
    expect(def.skills.skill2.effects[1]).toMatchObject({ stat: 'trueDamage', ref: 2 });
  });

  it('only gives the conversion to self, in timed, without a value', () => {
    expect(() => parseSkillDefinition(withSkill2([{ ...conversion, target: 'allies' }]))).toThrow(
      /trueDamageConversion is only allowed with target "self"/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...conversion, ref: 1 }]))).toThrow(/has no value/);
    expect(() =>
      parseSkillDefinition(withSkill2([{ kind: 'passive', target: 'self', stat: 'trueDamageConversion', ref: 1 }])),
    ).toThrow(/only allowed in timed/);
  });

  it('accepts trueDamage on weaponChange', () => {
    const def = parseSkillDefinition(
      withSkill2([{ kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, trueDamage: true, durationSeconds: 5 }]),
    );
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'weaponChange', trueDamage: true });
    expect(() =>
      parseSkillDefinition(
        withSkill2([
          { kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, trueDamage: false, durationSeconds: 5 },
        ]),
      ),
    ).toThrow(/trueDamage: expected true/);
  });
});

describe('durationUntil・inFullBurst・atStart の検証', () => {
  const until = {
    kind: 'timed',
    trigger: 'burstUse',
    target: 'self',
    stat: 'elementDamage',
    ref: 1,
    durationUntil: 'fullBurstEnd',
  };

  it('parses durationUntil for a stat not tracked in the first pass', () => {
    const def = parseSkillDefinition(withSkill2([until]));
    expect(def.skills.skill2.effects[0]).toMatchObject({ durationUntil: 'fullBurstEnd' });
  });

  it('rejects durationUntil with another duration, for first-pass stats, and with stacks', () => {
    expect(() => parseSkillDefinition(withSkill2([{ ...until, durationRef: 2 }]))).toThrow(
      /durationUntil cannot be combined with another duration/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...until, stat: 'attack' }]))).toThrow(
      /a duration until an event is not supported for "attack"/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...until, maxStacks: 3 }]))).toThrow(/cannot stack/);
    expect(() => parseSkillDefinition(withSkill2([{ ...until, durationUntil: 'burstEnd' }]))).toThrow(
      /durationUntil: expected one of fullBurstEnd/,
    );
  });

  it('parses inFullBurst and rejects it for first-pass stats', () => {
    const effect = { ...conversion, trigger: { count: 'fullChargeShot' }, condition: { inFullBurst: true } };
    const def = parseSkillDefinition(withSkill2([effect]));
    expect(def.skills.skill2.effects[0]).toMatchObject({ condition: { inFullBurst: true } });
    expect(() =>
      parseSkillDefinition(withSkill2([{ ...effect, stat: 'attack', ref: 1, target: 'self', durationRef: 1 }])),
    ).toThrow(/inFullBurst is not supported for "attack"/);
    expect(() => parseSkillDefinition(withSkill2([{ ...effect, condition: { inFullBurst: false } }]))).toThrow(
      /expected \{ inFullBurst: true \}/,
    );
  });

  it('allows a timer trigger with atStart in timed only, for stats not tracked in the first pass', () => {
    const recurring = {
      kind: 'timed',
      trigger: { everySeconds: 30, atStart: true },
      target: 'allies',
      stat: 'damageTaken',
      ref: 1,
      durationRef: 2,
    };
    const def = parseSkillDefinition(withSkill2([recurring]));
    expect(def.skills.skill2.effects[0]).toMatchObject({ trigger: { everySeconds: 30, atStart: true } });
    expect(() =>
      parseSkillDefinition(
        withSkill2([{ kind: 'damage', trigger: { everySeconds: 10, atStart: true }, ref: 1, damageType: 'skill' }]),
      ),
    ).toThrow(/atStart: unknown field/);
    expect(() =>
      parseSkillDefinition(withSkill2([{ ...recurring, trigger: { everySeconds: 30, atStart: false } }])),
    ).toThrow(/atStart: expected true/);
  });
});

describe('withCharacter・enemyElement', () => {
  const passive = { kind: 'passive', target: 'allies', stat: 'trueDamage', ref: 1 };

  it('parses both conditions in passive, timed and damage only', () => {
    const def = parseSkillDefinition(
      withSkill2([
        { ...passive, withCharacter: { rid: 93, present: true } },
        { kind: 'damage', trigger: 'burstUse', ref: 1, damageType: 'distributed', enemyElement: 'Wind' },
      ]),
    );
    expect(def.skills.skill2.effects[0]).toMatchObject({ withCharacter: { rid: 93, present: true } });
    expect(def.skills.skill2.effects[1]).toMatchObject({ enemyElement: 'Wind' });
    expect(() =>
      parseSkillDefinition(
        withSkill2([
          { kind: 'dot', trigger: 'burstUse', ref: 1, intervalSeconds: 1, durationSeconds: 5, enemyElement: 'Wind' },
        ]),
      ),
    ).toThrow(/enemyElement/);
    expect(() => parseSkillDefinition(withSkill2([{ ...passive, withCharacter: { rid: 93 } }]))).toThrow(
      /present: expected a boolean/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...passive, enemyElement: 'Earth' }]))).toThrow(/enemyElement/);
  });

  const characters = [
    { resourceId: 95, burstStep: 'Step2' as const, squad: 'Absolute' },
    { resourceId: 93, burstStep: 'Step1' as const, squad: 'Absolute' },
    null,
  ];

  it('checks the other slots for the character, not the slot itself', () => {
    expect(withCharacterAllows(undefined, characters, 0)).toBe(true);
    expect(withCharacterAllows({ rid: 93, present: true }, characters, 0)).toBe(true);
    expect(withCharacterAllows({ rid: 93, present: false }, characters, 0)).toBe(false);
    // 自分自身は数えない
    expect(withCharacterAllows({ rid: 93, present: true }, characters, 1)).toBe(false);
  });

  it('checks the enemy element (no element never matches)', () => {
    expect(enemyElementAllows(undefined, null)).toBe(true);
    expect(enemyElementAllows('Wind', 'Wind')).toBe(true);
    expect(enemyElementAllows('Wind', 'Fire')).toBe(false);
    expect(enemyElementAllows('Wind', null)).toBe(false);
  });

  it('drops the effects whose static conditions fail', () => {
    const def = parseSkillDefinition(
      withSkill2([
        { ...passive, withCharacter: { rid: 93, present: true } },
        { ...passive, ref: 2, withCharacter: { rid: 93, present: false } },
        { kind: 'damage', trigger: 'burstUse', ref: 1, damageType: 'distributed', enemyElement: 'Wind' },
      ]),
    );
    const effects = def.skills.skill2.effects as SkillEffect[];
    expect(compositionAllows(effects[2]!, characters, 0, 'Fire')).toBe(false);
    const wind = applyComposition(def, characters, 0, 'Wind');
    expect(wind.skills.skill2.effects.map((e) => ('ref' in e ? e.ref : 0))).toEqual([1, 1]);
    const fireAlone = applyComposition(def, [characters[0]!], 0, 'Fire');
    expect(fireAlone.skills.skill2.effects).toEqual([effects[1]]);
  });
});

describe('窓の作り方', () => {
  const schedule = planFixedCycle([{ burstStep: 'Step3' }], FRAMES);

  it('closes a window at the next full burst end (or the battle end)', () => {
    // 固定サイクルのフルバーストは [H, C)、[C + H, 2C) …
    expect(untilFullBurstEndWindows([H], schedule, FRAMES)).toEqual([[H, C]]);
    expect(untilFullBurstEndWindows([0], schedule, FRAMES)).toEqual([[0, C]]);
    expect(untilFullBurstEndWindows([H, H + 10], schedule, FRAMES)).toEqual([[H, C]]);
    expect(untilFullBurstEndWindows([5], null, FRAMES)).toEqual([[5, FRAMES]]);
  });

  it('tells whether a frame is inside a full burst', () => {
    expect(inFullBurstAt(schedule, H - 1)).toBe(false);
    expect(inFullBurstAt(schedule, H)).toBe(true);
    expect(inFullBurstAt(schedule, C)).toBe(false);
    expect(inFullBurstAt(null, H)).toBe(false);
  });

  it('fires a timer trigger with atStart at frame 0 too', () => {
    expect(triggerFrames({ everySeconds: 30, atStart: true }, null, 0, FRAMES)).toEqual([
      0,
      ...[30, 60, 90, 120, 150].map((s) => gameSecondsToFrame(s)),
    ]);
    expect(triggerFrames({ everySeconds: 30 }, null, 0, FRAMES)[0]).toBe(gameSecondsToFrame(30));
  });

  /** values: [1] = 比率 %、[2] = 維持秒数 */
  function slotOf(burstStep: BurstStep, effects: SkillEffect[]): TimelineSlot {
    const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
    const raw: SkillRaw = {
      id: 1,
      name: { ja: 'S', en: 'S' },
      description: { ja: '', en: '' },
      values: [tenLevels('20'), tenLevels('5')],
    };
    const character = makeCharacter({}, { resourceId: 1, burstStep, skills: { skill1: raw, skill2: raw, burst: raw } });
    const blank: SkillEntry = { support: 'unsupported', effects: [] };
    const definition: SkillDefinition = {
      formatVersion: 1,
      resourceId: 1,
      checkedAt: '2026-10-05',
      skills: { skill1: blank, skill2: blank, burst: { support: 'supported', effects } },
    };
    return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
  }

  it('builds the windows of durationUntil and inFullBurst in planBuffTimeline', () => {
    const t = planBuffTimeline(
      [
        slotOf('Step3', [
          {
            kind: 'timed',
            trigger: 'burstUse',
            target: 'self',
            stat: 'elementDamage',
            ref: 1,
            durationUntil: 'fullBurstEnd',
          },
          // バースト使用時はフルバーストの入りと同じフレーム（固定サイクル）なので満たす。戦闘開始時は満たさない
          {
            kind: 'timed',
            trigger: 'burstUse',
            target: 'self',
            stat: 'trueDamage',
            ref: 1,
            durationRef: 2,
            condition: { inFullBurst: true },
          },
          {
            kind: 'timed',
            trigger: 'battleStart',
            target: 'self',
            stat: 'damageTaken',
            ref: 1,
            durationRef: 2,
            condition: { inFullBurst: true },
          },
        ] as SkillEffect[]),
      ],
      schedule,
      FRAMES,
    );
    const element = t.windows.filter((w) => w.effect.stat === 'elementDamage');
    expect(element[0]).toMatchObject({ start: H, end: C });
    expect(element).toHaveLength(9);
    const up = t.windows.filter((w) => w.effect.stat === 'trueDamage');
    expect(up[0]).toMatchObject({ start: H, end: H + gameSecondsToFrames(5) });
    expect(t.windows.some((w) => w.effect.stat === 'damageTaken')).toBe(false);
    expect(t.conditionSkips).toEqual([expect.objectContaining({ frame: 0 })]);
  });
});

describe('1 発の式の防御力無視ダメージ', () => {
  const input = (buffs = ZERO_BUFFS): TriggerDamageInput => ({
    character: makeCharacter(),
    growth: { level: 1, grade: 0, core: 0 },
    enemy: { defence: 100, element: null, hasCore: true },
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
    buffs,
  });

  it('does not change a normal shot without the conversion, even with trueDamage', () => {
    const base = computeTriggerDamage(input());
    const up = computeTriggerDamage(input({ ...ZERO_BUFFS, trueDamage: 0.4 }));
    expect(base.trueDamage).toBe(false);
    expect(up.trueDamageMultiplier).toBe(1);
    expect(up.normal).toBe(base.normal);
  });

  it('drops the defence and applies trueDamage while converted', () => {
    const base = computeTriggerDamage(input());
    const converted = computeTriggerDamage(input({ ...ZERO_BUFFS, trueDamageConversion: 1 }));
    expect(converted.trueDamage).toBe(true);
    expect(converted.baseHit).toBe(base.baseHit); // 射撃ごとの倍率ダメージの基礎は変えない
    expect(converted.normal / base.normal).toBeCloseTo(1000 / 900, 12);
    const up = computeTriggerDamage(
      input({ ...ZERO_BUFFS, trueDamageConversion: 1, trueDamage: 0.4, attackDamage: 0.2 }),
    );
    const expected = TRUE_DAMAGE_BUCKET === 'separate' ? 1.4 : 1.6 / 1.2;
    expect(up.trueDamageMultiplier).toBeCloseTo(expected, 12);
    expect(up.normal / converted.normal).toBeCloseTo(1.2 * expected, 12);
  });

  it('treats a true-damage weapon change as true damage', () => {
    const shot = makeCharacter().shot;
    const weapon: ChangedWeapon = { id: 'x', hits: 1, shot, trueDamage: true };
    const base = computeTriggerDamage(input({ ...ZERO_BUFFS, weapon: { ...weapon, trueDamage: undefined } }));
    const changed = computeTriggerDamage(input({ ...ZERO_BUFFS, weapon }));
    expect(changed.trueDamage).toBe(true);
    expect(changed.normal / base.normal).toBeCloseTo(1000 / 900, 12);
  });
});

describe('ウンファ：TU の定義（data/skills/95.json）', () => {
  const character = JSON.parse(
    readFileSync(new URL('../../../data/characters/95.json', import.meta.url), 'utf8'),
  ) as CharacterData;
  const definition = parseSkillDefinition(
    JSON.parse(readFileSync(new URL('../../../data/skills/95.json', import.meta.url), 'utf8')),
  );
  const timed = resolveTimed(definition, character, MAX_SKILL_LEVELS);

  it('gives the Camouflage contents for 5 s on Burst Skill use and on Full Charge during Full Burst (C-0311・C-0314)', () => {
    const camo = timed.filter((e) => e.source.skill === 'skill1');
    expect(camo.map((e) => [e.stat, e.value, e.durationFrames, e.condition])).toEqual([
      ['trueDamageConversion', 1, gameSecondsToFrames(5), undefined],
      ['trueDamage', 0.4224, gameSecondsToFrames(5), undefined],
      ['trueDamageConversion', 1, gameSecondsToFrames(5), { inFullBurst: true }],
      ['trueDamage', 0.4224, gameSecondsToFrames(5), { inFullBurst: true }],
    ]);
  });

  it('gives Damage Taken up for 10 s on Burst Skill use (C-0312)', () => {
    // 使用武器の変更（C-0313）は packages/core/src/__tests__/eunhwaTuWeaponChange.test.ts で見る
    const burst = timed.filter((e) => e.source.skill === 'burst' && e.stat !== 'weapon');
    expect(burst.map((e) => [e.stat, e.target, e.value, e.durationFrames])).toEqual([
      ['damageTaken', 'allies', 0.2787, gameSecondsToFrames(10)],
    ]);
  });
});
