// Stage 11 モダニア編: DSL（射撃ごとの倍率ダメージ・スタック・▼・命中率と条件・装弾数無限・使用武器の変更）、解決、スタックの窓、
// 条件の判定、1 トリガーの式への畳み込み。plan/design-stage11-modernia.md 2・3 節、7.1〜7.3 節。
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import { PER_SHOT_DAMAGE_CORE, computeTriggerDamage, type EnemyInput } from '../../damage.ts';
import { firingParams } from '../../frame/firing.ts';
import type { CharacterData, SkillRaw } from '../../types.ts';
import { ZERO_BUFFS, applyResolvedEffect } from '../buffs.ts';
import { isPerShotTrigger, resolveDamageEffects, resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, resolvePassives, resolveTimed } from '../resolve.ts';
import { stackWindows } from '../stacks.ts';
import { planBuffTimeline, selfBuffedAt, type TimelineSlot } from '../timeline.ts';
import { isFiringStat, isStateStat, parseSkillDefinition } from '../types.ts';

function definition(skills: Record<string, unknown>, resourceId = 1): unknown {
  const none = { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] };
  return {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-24',
    skills: { skill1: none, skill2: none, burst: none, ...skills },
  };
}

const supported = (...effects: unknown[]) => ({ support: 'supported', effects });

function raw(values: string[][]): SkillRaw {
  return { id: 1, name: { ja: 'S', en: 'S' }, description: { ja: '', en: '' }, values };
}

/** Lv 1..10 で同じ値の列 */
const flat = (...v: string[]) => v.map((x) => Array.from({ length: 10 }, () => x));

/** モダニアに似せたテスト用キャラ（MG・300 発）。S1 = [3.05, 200, 14.25, 5, 10, 5.04, 5, 10]、S2 = [8.56, 15, 200, 29.38, 10]、バースト = [2.24, 15] */
function modernia(overrides: Partial<CharacterData> = {}): CharacterData {
  const base = makeCharacter({
    damage: 771,
    maxAmmo: 300,
    reloadTime: 2.3,
    rateOfFire: 60,
    endRateOfFire: 4200,
    rateOfFireChangePerShot: 100,
  });
  return {
    ...base,
    weaponType: 'MG',
    burstSkill: { ...base.burstSkill, durationSeconds: 15, changeWeapon: { rateOfFire: 4200, shotId: 2 } },
    skills: {
      skill1: raw(flat('3.05', '200', '14.25', '5', '10', '5.04', '5', '10')),
      skill2: raw(flat('8.56', '15', '200', '29.38', '10')),
      burst: raw(flat('2.24', '15')),
    },
    ...overrides,
  };
}

const MODERNIA_DEF = {
  skill1: supported(
    { kind: 'damage', trigger: { count: 'normalHit' }, damageType: 'additional', ref: 1 },
    {
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 2 },
      target: 'self',
      stat: 'critDamage',
      ref: 3,
      maxStacksRef: 4,
      durationRef: 5,
    },
    {
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 2 },
      target: 'self',
      stat: 'maxAmmo',
      decrease: true,
      ref: 6,
      maxStacksRef: 7,
      durationRef: 8,
    },
  ),
  skill2: supported(
    { kind: 'timed', trigger: 'fullBurstStart', target: 'allies', stat: 'hitRate', ref: 1, durationRef: 2 },
    {
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 3 },
      target: 'self',
      stat: 'attack',
      ref: 4,
      durationRef: 5,
      condition: { selfBuffed: 'hitRate' },
    },
  ),
  burst: supported(
    { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'infiniteAmmo', durationRef: 2 },
    { kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, durationRef: 2 },
  ),
};

describe('parseSkillDefinition (Stage 11 モダニア, 7.1)', () => {
  it('accepts every vocabulary of Modernia', () => {
    const def = parseSkillDefinition(definition(MODERNIA_DEF));
    expect(def.skills.skill1.effects[2]).toMatchObject({ stat: 'maxAmmo', decrease: true, maxStacksRef: 7 });
    expect(def.skills.skill2.effects[1]).toMatchObject({ condition: { selfBuffed: 'hitRate' } });
    expect(def.skills.burst.effects[0]).not.toHaveProperty('ref');
    expect(def.skills.burst.effects[1]).toEqual({
      kind: 'weaponChange',
      trigger: 'burstUse',
      damageRef: 1,
      durationRef: 2,
    });
  });

  const timed = { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'attack', ref: 1, durationRef: 2 };
  const parse =
    (e: unknown, slot = 'skill1') =>
    () =>
      parseSkillDefinition(definition({ [slot]: supported(e) }));

  it('rejects wrong stacks, decrease and flag stats', () => {
    expect(parse({ ...timed, maxStacks: 5, maxStacksRef: 4 })).toThrow(/at most one of maxStacks/);
    expect(parse({ ...timed, maxStacks: 0 })).toThrow(/positive integer/);
    expect(parse({ ...timed, decrease: false })).toThrow(/expected true/);
    expect(parse({ ...timed, scaling: 'casterAttack', decrease: true })).toThrow(/decrease/);
    expect(parse({ ...timed, stat: 'infiniteAmmo' })).toThrow(/do not write ref/);
    const { ref: _ref, ...noRef } = timed;
    expect(parse({ ...noRef, stat: 'infiniteAmmo', maxStacks: 2 })).toThrow(/cannot stack/);
    expect(parse({ ...noRef })).toThrow(/ref/);
    expect(parse({ kind: 'passive', target: 'self', stat: 'infiniteAmmo', ref: 1 })).toThrow(/only allowed in timed/);
  });

  it('rejects conditions that feed themselves, target topAttack or use a flag', () => {
    expect(parse({ ...timed, condition: { selfBuffed: 'attack' } })).toThrow(/feed its own condition/);
    expect(parse({ ...timed, stat: 'hitRate', condition: { selfBuffed: 'critRate' } })).toThrow(
      /feed its own condition/,
    );
    expect(parse({ ...timed, target: 'topAttack', targetCount: 2, condition: { selfBuffed: 'hitRate' } })).toThrow(
      /topAttack/,
    );
    expect(parse({ ...timed, condition: { selfBuffed: 'infiniteAmmo' } })).toThrow(/not a buff state/);
    expect(parse({ ...timed, condition: { selfBuffed: 'hitRate', other: 1 } })).toThrow(/selfBuffed/);
  });

  it('rejects unknown fields of weaponChange and needs exactly one duration', () => {
    const wc = { kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, durationRef: 2 };
    expect(parse({ ...wc, target: 'allies' }, 'burst')).toThrow(/unknown field/);
    expect(parse({ ...wc, durationSeconds: 15 }, 'burst')).toThrow(/exactly one of durationRef/);
  });

  it('classifies the new stats', () => {
    expect(isFiringStat('infiniteAmmo')).toBe(true);
    expect(isFiringStat('weapon')).toBe(true);
    expect(isFiringStat('hitRate')).toBe(false);
    expect(isStateStat('hitRate')).toBe(true);
    expect(isStateStat('attack')).toBe(false);
  });
});

describe('resolve (Stage 11 モダニア)', () => {
  const def = parseSkillDefinition(definition(MODERNIA_DEF));
  const character = modernia();

  it('resolves stacks, ▼, the flag and the weapon change', () => {
    const timed = resolveTimed(def, character, MAX_SKILL_LEVELS);
    const [crit, ammo, hit, attack, infinite, weapon] = timed;
    expect(crit).toMatchObject({ stat: 'critDamage', value: 0.1425, maxStacks: 5, durationFrames: 600 });
    expect(crit!.trigger).toEqual({ count: 'normalHit', every: 200 });
    expect(ammo).toMatchObject({ stat: 'maxAmmo', maxStacks: 5 });
    expect(ammo!.value).toBeCloseTo(-0.0504, 12);
    expect(hit).toMatchObject({ stat: 'hitRate', durationFrames: 900 });
    expect(hit!.value).toBeCloseTo(0.0856, 12);
    expect(attack).toMatchObject({ stat: 'attack', condition: { selfBuffed: 'hitRate' } });
    expect(attack!.value).toBeCloseTo(0.2938, 12);
    expect(infinite).toMatchObject({ stat: 'infiniteAmmo', value: 1, durationFrames: 900 });
    expect(weapon).toMatchObject({ stat: 'weapon', target: 'self', durationFrames: 900 });
    expect(weapon!.value).toBeCloseTo(0.0224, 12);
    expect(weapon!.weapon!.shot).toMatchObject({
      damage: 224,
      rateOfFire: 4200,
      endRateOfFire: 4200,
      rateOfFireChangePerShot: 0,
      coreDamageRate: character.shot.coreDamageRate,
      maxAmmo: 300,
    });
    expect(weapon!.weapon!.id).toBe('1.burst.1');
  });

  it('multiplies the weapon damage by hitsPerShot (録画 44: 2 hits of 2.24%)', () => {
    const twoHits = parseSkillDefinition(
      definition({
        ...MODERNIA_DEF,
        burst: supported({ kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, hitsPerShot: 2, durationRef: 2 }),
      }),
    );
    const weapon = resolveTimed(twoHits, character, MAX_SKILL_LEVELS).find((e) => e.stat === 'weapon')!;
    expect(weapon.weapon).toMatchObject({ hits: 2, shot: { damage: 448 } });
    expect(() =>
      parseSkillDefinition(
        definition({
          burst: supported({ kind: 'weaponChange', trigger: 'burstUse', damageRef: 1, hitsPerShot: 0, durationRef: 2 }),
        }),
      ),
    ).toThrow(/hitsPerShot/);
  });

  it('needs burstSkill.changeWeapon for a weapon change', () => {
    const { changeWeapon: _c, ...burstSkill } = character.burstSkill;
    expect(() => resolveTimed(def, { ...character, burstSkill }, MAX_SKILL_LEVELS)).toThrow(/changeWeapon/);
  });

  it('keeps ▼ negative in passive effects too', () => {
    const p = parseSkillDefinition(
      definition({ skill1: supported({ kind: 'passive', target: 'self', stat: 'maxAmmo', decrease: true, ref: 6 }) }),
    );
    expect(resolvePassives(p, character, MAX_SKILL_LEVELS)[0]!.value).toBeCloseTo(-0.0504, 12);
  });

  it('folds damage on every shot into the per-trigger value and keeps it out of the skill hits', () => {
    expect(resolveDamageEffects(def, character, MAX_SKILL_LEVELS)).toEqual([]);
    const perShot = resolvePerShotDamage(def, character, MAX_SKILL_LEVELS);
    expect(perShot).toEqual([
      {
        source: { resourceId: 1, skill: 'skill1', name: character.skills.skill1.name },
        damageType: 'additional',
        multiplier: 0.0305,
      },
    ]);
    expect(isPerShotTrigger({ count: 'normalHit', every: 1 })).toBe(true);
    expect(isPerShotTrigger({ count: 'lastShot', every: 1 })).toBe(false);
    expect(isPerShotTrigger({ count: 'normalHit', every: 200 })).toBe(false);
    expect(() => resolvePerShotDamage(def, { ...character, weaponType: 'SG' }, MAX_SKILL_LEVELS)).toThrow(/SG/);
  });
});

describe('computeTriggerDamage with per-shot damage and a changed weapon (3.1)', () => {
  const character = modernia();
  const enemy: EnemyInput = { defence: 100, element: null, hasCore: true };
  const perShot = resolvePerShotDamage(parseSkillDefinition(definition(MODERNIA_DEF)), character, MAX_SKILL_LEVELS);
  const base = {
    character,
    growth: { level: 1, grade: 0, core: 0 },
    enemy,
    attackOverride: 120694,
    perShot,
  } as const;

  it('adds (ATK − DEF) × 3.05% × (1 + crit + FB) without core or distance', () => {
    expect(PER_SHOT_DAMAGE_CORE).toBe(false);
    const out = computeTriggerDamage({ ...base, condition: { coreHitRate: 1, distanceBonus: true, fullCharge: true } });
    // 通常攻撃: 120,594 × 7.71% × (1 + 1.0 + 0.075 + 0.3)
    expect(out.normal).toBeCloseTo(120594 * 0.0771 * 2.375, 6);
    expect(out.perShot).toBeCloseTo(120594 * 0.0305 * 1.075, 6);
    expect(out.perTrigger).toBeCloseTo(out.normal + out.perShot, 9);
    const fb = computeTriggerDamage({
      ...base,
      condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true, fullBurst: true },
    });
    expect(fb.perShot).toBeCloseTo(120594 * 0.0305 * 1.575, 6);
    // 表示（非会心・FB 外）は 3,678、FB 中は 5,517（plan/design-stage11-modernia.md 7.5 節）
    expect(Math.round(120594 * 0.0305)).toBe(3678);
    expect(Math.round(120594 * 0.0305 * 1.5)).toBe(5517);
  });

  it('is zero without per-shot effects (the Stage 10 value)', () => {
    const { perShot: _p, ...noPerShot } = base;
    const out = computeTriggerDamage({
      ...noPerShot,
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    });
    expect(out.perShot).toBe(0);
    expect(out.perTrigger).toBe(out.normal);
  });

  it('uses the changed weapon for the weapon and core multipliers', () => {
    const timed = resolveTimed(parseSkillDefinition(definition(MODERNIA_DEF)), character, MAX_SKILL_LEVELS);
    const weapon = timed.find((e) => e.stat === 'weapon')!;
    const buffs = applyResolvedEffect(ZERO_BUFFS, weapon, 0).totals;
    expect(buffs.weapon?.id).toBe('1.burst.1');
    const out = computeTriggerDamage({
      ...base,
      buffs,
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, fullBurst: true },
    });
    expect(out.weaponMultiplier).toBeCloseTo(0.0224, 12);
    // 殲滅モードのコア（FB 中・非会心の表示）: 120,594 × 2.24% × 2.5 = 6,753
    expect(Math.round(120594 * 0.0224 * 2.5)).toBe(6753);
    expect(out.normal).toBeCloseTo(120594 * 0.0224 * (2.5 + 0.075), 6);
    // 射撃の実効値も変更後の武器から
    expect(firingParams(character.shot, buffs).weapon?.shot.rateOfFire).toBe(4200);
  });
});

describe('stackWindows (2.2・7.2)', () => {
  it('refreshes every stack on each fire and drops them all together (all)', () => {
    // 6 秒ごと・維持 10 秒・上限 5: 段 k は k 回目の発火から最後の発火 + 10 秒まで
    const starts = [0, 360, 720, 1080, 1440, 1800];
    expect(stackWindows(starts, 600, 10_000, 5, 'all')).toEqual([
      { stack: 1, start: 0, end: 2400 },
      { stack: 2, start: 360, end: 2400 },
      { stack: 3, start: 720, end: 2400 },
      { stack: 4, start: 1080, end: 2400 },
      { stack: 5, start: 1440, end: 2400 },
    ]);
    // 10 秒を超えて空くと段がすべて切れて 1 からやり直す（ちょうど切れたフレームは続きとみなす）
    expect(stackWindows([0, 600, 1300], 600, 10_000, 5, 'all')).toEqual([
      { stack: 1, start: 0, end: 1200 },
      { stack: 2, start: 600, end: 1200 },
      { stack: 1, start: 1300, end: 1900 },
    ]);
  });

  it('counts the fires in the last duration with each own timer (each)', () => {
    // 6 秒ごと・維持 10 秒なら直近 10 秒に 1〜2 回: 1 スタックと 2 スタックを行き来する（plan/design-stage11-modernia.md 0.1 節）
    expect(stackWindows([0, 360, 720, 1080], 600, 10_000, 5, 'each')).toEqual([
      { stack: 1, start: 0, end: 1680 },
      { stack: 2, start: 360, end: 600 },
      { stack: 2, start: 720, end: 960 },
      { stack: 2, start: 1080, end: 1320 },
    ]);
    // 上限で止める
    expect(stackWindows([0, 10, 20], 600, 10_000, 2, 'each')).toEqual([
      { stack: 1, start: 0, end: 620 },
      { stack: 2, start: 10, end: 610 },
    ]);
  });

  it('cuts at the battle length and ignores zero durations', () => {
    expect(stackWindows([0, 100], 600, 500, 5, 'all')).toEqual([
      { stack: 1, start: 0, end: 500 },
      { stack: 2, start: 100, end: 500 },
    ]);
    expect(stackWindows([0], 0, 500, 5)).toEqual([]);
  });

  it('adds one value per stack in the segments (5 stacks of −5.04% → 300 × 0.748 = 224.4 → 224)', () => {
    let buffs = ZERO_BUFFS;
    for (let k = 0; k < 5; k++) {
      buffs = applyResolvedEffect(buffs, { stat: 'maxAmmo', scaling: 'ratio', value: -0.0504 }, 0).totals;
    }
    expect(firingParams(modernia().shot, buffs).maxAmmo).toBe(224);
    const steps = [0, 1, 2, 3, 4, 5].map((k) => {
      let b = ZERO_BUFFS;
      for (let i = 0; i < k; i++)
        b = applyResolvedEffect(b, { stat: 'maxAmmo', scaling: 'ratio', value: -0.0504 }, 0).totals;
      return firingParams(modernia().shot, b).maxAmmo;
    });
    expect(steps).toEqual([300, 285, 270, 255, 240, 224]);
  });
});

describe('condition "自分が 〈stat〉 増加状態なら" (2.4・3.3)', () => {
  it('checks passives and positive windows including ones starting at the frame', () => {
    const windows = [{ slotIndex: 0, effect: { stat: 'hitRate' as const, value: 0.0856 }, start: 100, end: 200 }];
    const passive = [{ buffs: ZERO_BUFFS, passiveEffects: [], buildEffects: [], timedEffects: [] }];
    expect(selfBuffedAt(passive, windows, 0, 'hitRate', 99)).toBe(false);
    expect(selfBuffedAt(passive, windows, 0, 'hitRate', 100)).toBe(true);
    expect(selfBuffedAt(passive, windows, 0, 'hitRate', 200)).toBe(false);
    expect(selfBuffedAt(passive, windows, 1, 'hitRate', 150)).toBe(false);
    const withPassive = [
      { buffs: { ...ZERO_BUFFS, hitRate: 0.1 }, passiveEffects: [], buildEffects: [], timedEffects: [] },
    ];
    expect(selfBuffedAt(withPassive, [], 0, 'hitRate', 0)).toBe(true);
  });

  it('fires only at the 200th hits inside the hit rate windows and records the skips', () => {
    const character = modernia();
    const def = parseSkillDefinition(
      definition({
        skill2: supported(
          { kind: 'timed', trigger: 'battleStart', target: 'self', stat: 'hitRate', ref: 1, durationSeconds: 1 },
          {
            kind: 'timed',
            trigger: { count: 'normalHit', every: 30 },
            target: 'self',
            stat: 'attack',
            ref: 4,
            durationSeconds: 1,
            condition: { selfBuffed: 'hitRate' },
          },
        ),
      }),
    );
    const slots: TimelineSlot[] = [{ character, definition: def, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 }];
    // 射撃は 1 フレームおき（30 発目 = f58、60 発目 = f118）。命中率の窓は [0, 60)
    const shots = [{ frames: Array.from({ length: 100 }, (_, i) => i * 2), fullCharge: false }];
    const timeline = planBuffTimeline(slots, null, 300, shots);
    expect(timeline.stateWindows.map((w) => [w.effect.stat, w.start, w.end])).toEqual([['hitRate', 0, 60]]);
    // 命中率の窓は区間に入らない（境界も鍵も作らない）
    expect(timeline.windows.every((w) => w.effect.stat !== 'hitRate')).toBe(true);
    const attack = timeline.windows.filter((w) => w.effect.stat === 'attack');
    expect(attack.map((w) => [w.start, w.end])).toEqual([[59, 119]]);
    expect(timeline.conditionSkips.map((s) => s.frame)).toEqual([118, 178]);
  });
});
