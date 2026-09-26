// Stage 18-C: 着地点の時間割り・着地点ごとの表・命中率▲（plan/design-stage18.md 12 節）。
//   1. データ: 的の条件の表（range-bigarms）と出来事のセットの着地点、その検証
//   2. 着地点の時間割り（enemyLandingsOf）と、区間ごとの距離ボーナスの付き方（Stage 17・18-A の単騎と同じ）
//   3. 中遠の配分（3 か所を 0.3 : 0.3 : 0.4）と、命中率▲（1/(1 − N)²、上限 1）
//   4. 編成: 手入力は何も変わらない、自動は calc と sim で通常攻撃が一致、配分の区間は固定した 3 回の重み付きの和、ゲージ、注記
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets, targetProfileOf } from '../enemies.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import {
  autoConditionAt,
  coreHitRateWithHitRateUp,
  distanceBonusAt,
  landingMix,
  targetRateOf,
} from '../frame/landing.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import type { TimelineSlot } from '../skills/timeline.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, ShotParams, WeaponType } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

const raw = JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as Record<
  string,
  unknown
>;
const master = parseEnemyPresets(raw);
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const preset = master.enemies.find((e) => e.id === 'range-bigarms-fire')!;

const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true, hitRate: 1 };

/** 武器種と適正距離だけ変えたキャラ */
function weapon(
  weaponType: WeaponType,
  bonusRange: CharacterData['bonusRange'],
  resourceId = 1,
  shot: Partial<ShotParams> = {},
): CharacterData {
  return makeCharacter(shot, { weaponType, bonusRange, resourceId });
}

const AR = weapon('AR', { min: 25, max: 45 });
const SMG = weapon('SMG', { min: 15, max: 35 });
const MG = weapon('MG', { min: 35, max: 55 });
const SR = weapon('SR', { min: 45, max: 100 });
const SR_NEAR = weapon('SR', { min: 25, max: 45 });
const SG = weapon('SG', { min: 0, max: 25 });
const RL = weapon('RL', null);

describe('データ（data/enemies.json の的の条件の表）', () => {
  it('shares one target profile across the shooting-range presets and lands on its points', () => {
    for (const e of master.enemies.filter((p) => p.content === 'range')) expect(e.targetProfile).toBe('range-bigarms');
    expect(targetProfileOf(master, preset)).toBe(profile);
    expect(profile.initialLanding).toBe('midNear');
    expect(master.eventSets[0]!.landings).toEqual(['midNear', 'near', 'far', 'midFar', 'near', 'far']);
    expect(profile.mixes.midFar).toEqual([
      ['midFarA', 0.3],
      ['midFarB', 0.3],
      ['midFarC', 0.4],
    ]);
  });

  it('reads the band values (C-0034) through the landing, the band or all, and leaves the unmeasured cells null', () => {
    const at = (id: string) => profile.landings.find((l) => l.id === id)!;
    expect(targetRateOf(profile.coreHitRate, AR, at('midNear'))).toBe(0.2281);
    expect(targetRateOf(profile.coreHitRate, SMG, at('midFarA'))).toBe(0.0516);
    expect(targetRateOf(profile.coreHitRate, SMG, at('midFarC'))).toBe(0.0516);
    expect(targetRateOf(profile.bulletHitRate, SMG, at('far'))).toBe(0.76);
    expect(targetRateOf(profile.coreHitRate, MG, at('far'))).toBe(0.9588);
    expect(targetRateOf(profile.coreHitRate, RL, at('near'))).toBe(1);
    expect(targetRateOf(profile.coreHitRate, SR, at('far'))).toBe(1);
    expect(targetRateOf(profile.coreHitRate, SG, at('near'))).toBeNull();
    expect(targetRateOf(profile.bulletHitRate, SR, at('far'))).toBeNull();
  });

  it('rejects malformed profiles and references', () => {
    const base = raw.targetProfiles as Record<string, unknown>[];
    const p = base[0]!;
    const parse =
      (targetProfiles: unknown[], extra: Record<string, unknown> = {}) =>
      () =>
        parseEnemyPresets({ ...raw, targetProfiles, ...extra });
    expect(
      parse([
        {
          ...p,
          mixes: {
            midFar: [
              ['midFarA', 0.5],
              ['midFarB', 0.3],
            ],
          },
        },
      ]),
    ).toThrow(/sum to 1/);
    expect(parse([{ ...p, mixes: { midFar: [['midFarX', 1]] } }])).toThrow(/landing id/);
    expect(parse([{ ...p, coreHitRate: { AR: { nowhere: 0.5 } } }])).toThrow(/not a landing/);
    expect(parse([{ ...p, coreHitRate: { AR: { near: 1.5 } } }])).toThrow(/\[0, 1\]/);
    expect(parse([{ ...p, coreHitRate: { XX: { near: 0.5 } } }])).toThrow(/weapon type/);
    expect(parse([{ ...p, initialLanding: 'moon' }])).toThrow(/initialLanding/);
    expect(
      parse([{ ...p, landings: [...(p.landings as unknown[]), { id: 'near', band: 'near', range: [15, 25] }] }]),
    ).toThrow(/duplicate landing/);
    expect(parse([p, p])).toThrow(/duplicate target profile/);
    expect(parse([])).toThrow(/unknown target profile/);
    const sets = raw.eventSets as Record<string, unknown>[];
    expect(parse(base, { eventSets: [{ ...sets[0], landings: ['near', 'moon'] }] })).toThrow(/lands on moon/);
    // 表も着地点も無い旧い形は、そのまま読める
    const legacy = { ...raw, enemies: master.enemies.map(({ targetProfile: _t, ...e }) => e) };
    delete (legacy as Record<string, unknown>).targetProfiles;
    expect(parseEnemyPresets(legacy).targetProfiles).toEqual([]);
  });
});

describe('着地点の時間割り（enemyLandingsOf）', () => {
  const spans = (fixed?: Record<string, string>, duration = 180) =>
    enemyLandingsOf(master, ['range-3min-jump'], duration, profile, fixed).map((s) => [
      Number(s.start.toFixed(1)),
      Number(s.end.toFixed(1)),
      s.landing,
    ]);

  it('cuts at each landing (the end of a jump) and follows 中近 → 近 → 遠 → 中遠 → 近 → 遠 (C-0031)', () => {
    expect(spans()).toEqual([
      [0, 33, 'midNear'],
      [33, 69.4, 'near'],
      [69.4, 105.8, 'far'],
      [105.8, 142.2, 'midFar'],
      [142.2, 178.6, 'near'],
      [178.6, 180, 'far'],
    ]);
  });

  it('uses the initial landing for the whole battle without the 3-minute mode, and can fix the mid-far landing', () => {
    expect(enemyLandingsOf(master, [], 180, profile)).toEqual([{ start: 0, end: 180, landing: 'midNear' }]);
    expect(spans({ midFar: 'midFarA' })[3]).toEqual([105.8, 142.2, 'midFarA']);
    expect(() => spans({ midFar: 'near' })).toThrow(/not part of mix/);
  });

  it('marks the landings after the measured order as unmeasured (battles longer than 180 s)', () => {
    const long = spans(undefined, 260);
    expect(long.slice(6).every(([, , landing]) => landing === null)).toBe(true);
    // 6 区間目（遠）は次の着地（215 秒）まで。そこから先は未測定
    expect(long[5]).toEqual([178.6, 215, 'far']);
    expect(long[6]![0]).toBe(215);
  });
});

describe('距離ボーナスの付き方（区間ごと。Stage 17・18-A の単騎）', () => {
  const order = ['midNear', 'near', 'far', 'midFarA', 'near', 'far'];
  const byLanding = (c: CharacterData) =>
    order.map((id) =>
      distanceBonusAt(
        c,
        profile.landings.find((l) => l.id === id)!,
      )
        ? 100
        : 0,
    );

  it('matches the solo recordings: SMG 100/100/0/A100/100/0, MG 0/0/100/A0/0/100, SR far only, AR 中近 and 中遠, SG 近 only', () => {
    expect(byLanding(SMG)).toEqual([100, 100, 0, 100, 100, 0]);
    expect(byLanding(MG)).toEqual([0, 0, 100, 0, 0, 100]);
    expect(byLanding(SR)).toEqual([0, 0, 100, 0, 0, 100]);
    expect(byLanding(AR)).toEqual([100, 0, 0, 100, 0, 0]);
    expect(byLanding(SG)).toEqual([0, 100, 0, 0, 100, 0]);
    expect(byLanding(RL)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('gives the mid-far share SMG 0.30, MG 0.70, AR 1.00, SR (45-100) 0 and SR (25-45) 1.00', () => {
    const share = (c: CharacterData) =>
      landingMix(profile, 'midFar').reduce(
        (sum, { landing, weight }) => sum + (distanceBonusAt(c, landing) ? weight : 0),
        0,
      );
    expect(share(SMG)).toBeCloseTo(0.3, 12);
    expect(share(MG)).toBeCloseTo(0.7, 12);
    expect(share(AR)).toBeCloseTo(1, 12);
    expect(share(SR)).toBe(0);
    expect(share(SR_NEAR)).toBeCloseTo(1, 12);
  });
});

describe('命中率▲（C-0036・C-0037）', () => {
  it('scales the core hit rate by 1/(1 − N)², caps it at 1, and gives 1 at N ≥ 1', () => {
    expect(coreHitRateWithHitRateUp(0.2281, 0.0509) / 0.2281).toBeCloseTo(1.11, 3);
    expect(coreHitRateWithHitRateUp(0.9, 0.2)).toBe(1);
    expect(coreHitRateWithHitRateUp(0.05, 1)).toBe(1);
    expect(coreHitRateWithHitRateUp(0.05, 1.0137)).toBe(1);
    expect(coreHitRateWithHitRateUp(0.2281, 0)).toBe(0.2281);
    // 命中率▼は測っていないので変えない（注記を出す）
    expect(coreHitRateWithHitRateUp(0.2281, -0.2)).toBe(0.2281);
  });

  it('applies to the table value only; the manual value and the bullet hit rate are kept as they are', () => {
    const near = profile.landings.find((l) => l.id === 'near')!;
    const withUp = autoConditionAt(profile, near, SMG, 0.0509, MANUAL);
    expect(withUp.coreHitRate).toBeCloseTo(0.2644 / 0.9491 ** 2, 12);
    expect(withUp.hitRate).toBe(0.9763);
    expect(withUp.distanceBonus).toBe(true);
    const sg = autoConditionAt(profile, near, SG, 0.5, { ...MANUAL, coreHitRate: 0.4 });
    expect(sg.coreHitRate).toBe(0.4);
  });
});

describe('編成（自動の条件）', () => {
  const growth = { level: 1, grade: 0, core: 0 };
  const slot = (character: CharacterData, auto: boolean, extra: Partial<TeamSlotInput> = {}): TeamSlotInput => ({
    character,
    growth,
    condition: MANUAL,
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    ...extra,
  });
  const mgShot: Partial<ShotParams> = {
    maxAmmo: 300,
    reloadTime: 2.5,
    rateOfFire: 60,
    endRateOfFire: 3600,
    rateOfFireChangePerShot: 100,
    rateOfFireResetTime: 1,
    damage: 500,
  };
  const team = (auto: boolean) => [
    slot(weapon('AR', { min: 25, max: 45 }, 1), auto),
    slot(weapon('SMG', { min: 15, max: 35 }, 2, { rateOfFire: 1200, endRateOfFire: 1200, maxAmmo: 120 }), auto),
    slot(weapon('MG', { min: 35, max: 55 }, 3, mgShot), auto),
  ];
  const jumps = enemyEventsOf(master, ['range-3min-jump'], 180);
  const enemy = (options: { events?: boolean; fixed?: Record<string, string>; target?: boolean } = {}): EnemyInput => {
    const events = options.events ?? true;
    const base: EnemyInput = { defence: 100, element: 'Fire', hasCore: true, ...(events ? { events: jumps } : {}) };
    if (options.target === false) return base;
    return {
      ...base,
      target: profile,
      landings: enemyLandingsOf(master, events ? ['range-3min-jump'] : [], 180, profile, options.fixed),
    };
  };
  const input = (slots: TeamSlotInput[], e: EnemyInput, burst = false): TeamInput => ({
    slots,
    enemy: e,
    durationSeconds: 180,
    burst,
  });

  it('changes nothing for manual slots, even with the target profile attached', () => {
    const plain = input(team(false), enemy({ target: false }));
    const withTarget = input(team(false), enemy());
    const calc = computeTeamDamage(withTarget);
    const sim = runSimulation(withTarget);
    expect(calc.totalDamage).toBe(computeTeamDamage(plain).totalDamage);
    expect(sim.totalDamage).toBe(runSimulation(plain).totalDamage);
    expect(sim.timeline.segments.length).toBe(runSimulation(plain).timeline.segments.length);
    expect(calc.landings).toEqual([]);
    expect(calc.slots.every((s) => s!.autoCondition === null)).toBe(true);
  });

  it('uses the manual values with a note when the enemy has no target profile', () => {
    const auto = computeTeamDamage(input(team(true), enemy({ target: false })));
    expect(auto.totalDamage).toBe(computeTeamDamage(input(team(false), enemy({ target: false }))).totalDamage);
    expect(auto.slots[0]!.notes.map((n) => n.code)).toContain('auto-condition-no-target');
    expect(auto.slots[0]!.autoCondition).toBeNull();
  });

  it('lowers the total and keeps calc equal to sim for normal attacks (both count the shot list)', () => {
    const auto = input(team(true), enemy());
    const calc = computeTeamDamage(auto);
    const sim = runSimulation(auto);
    const simTeam = simTeamResult(auto, sim);
    expect(calc.totalDamage).toBeLessThan(computeTeamDamage(input(team(false), enemy())).totalDamage);
    for (let i = 0; i < 3; i++) {
      expect(calc.slots[i]!.normalDamage).toBeCloseTo(sim.slots[i]!.normalDamage, 3);
      expect(calc.slots[i]!.autoCondition).toEqual(sim.slots[i]!.autoCondition);
      expect(simTeam.slots[i]!.autoCondition).toEqual(calc.slots[i]!.autoCondition);
    }
    expect(calc.landings.map((s) => s.landing)).toEqual(['midNear', 'near', 'far', 'midFar', 'near', 'far']);
    expect(simTeam.landings).toEqual(calc.landings);
    // 自動の枠は着地点の境目で区間が割れる（鍵に着地点が入る）
    const landings = new Set(calc.slots[0]!.segments.map((s) => s.ranges[0]!.start));
    expect(landings.has(33 * 60)).toBe(true);
    expect(calc.enemyNotes[0]!.message.ja).not.toContain('扱わない');
  });

  it('gives each landing its own distance bonus and table values (SMG: off at 遠, on at 中遠 A)', () => {
    const calc = computeTeamDamage(input(team(true), enemy({ fixed: { midFar: 'midFarA' } })));
    const smg = calc.slots[1]!;
    const at = (sec: number) =>
      smg.segments.find((s) => s.ranges.some((r) => r.start <= sec * 60 && sec * 60 < r.end))!;
    expect(at(10).trigger.boost.distance).toBe(0.3);
    expect(at(80).trigger.boost.distance).toBe(0);
    expect(at(120).trigger.boost.distance).toBe(0.3);
    expect(at(80).trigger.hitRate).toBe(0.76);
    expect(at(10).trigger.boost.core).toBeCloseTo(0.1179, 12);
  });

  it('weights the mid-far span 0.3 : 0.3 : 0.4 over the three fixed landings', () => {
    const run = (fixed?: Record<string, string>) => runSimulation(input(team(true), enemy({ fixed }))).slots;
    const mix = run();
    const [a, b, c] = ['midFarA', 'midFarB', 'midFarC'].map((id) => run({ midFar: id }));
    for (let i = 0; i < 3; i++) {
      const expected = 0.3 * a![i]!.normalDamage + 0.3 * b![i]!.normalDamage + 0.4 * c![i]!.normalDamage;
      expect(mix[i]!.normalDamage / expected).toBeCloseTo(1, 12);
    }
    // 中遠で距離ボーナスが乗る割合（発数平均の中遠の分）: SMG 0.3、MG 0.7、AR 1
    const midFarShare = (i: number) => {
      const s = mix[i]!.segments.find((x) => x.start <= 120 * 60 && 120 * 60 < x.end)!;
      return s.trigger.boost.distance / 0.3;
    };
    expect(midFarShare(0)).toBeCloseTo(1, 12);
    expect(midFarShare(1)).toBeCloseTo(0.3, 12);
    expect(midFarShare(2)).toBeCloseTo(0.7, 12);
  });

  it('uses the initial landing (中近) without the 3-minute mode, on the average-rate path of calc', () => {
    const calc = computeTeamDamage(input(team(true), enemy({ events: false })));
    expect(calc.landings).toEqual([{ start: 0, end: 10800, landing: 'midNear' }]);
    const midNear: SlotCondition = { coreHitRate: 0.2281, distanceBonus: true, fullCharge: true, hitRate: 0.9963 };
    const manual = computeTeamDamage(
      input([slot(weapon('AR', { min: 25, max: 45 }, 1), false, { condition: midNear })], enemy({ events: false })),
    );
    const ar = computeTeamDamage(input([team(true)[0]!], enemy({ events: false })));
    expect(ar.slots[0]!.segments.every((s) => s.triggerSource === 'average')).toBe(true);
    expect(ar.totalDamage).toBeCloseTo(manual.totalDamage, 6);
  });

  it('scales the core hit rate with a constant hit rate up from the build (assault cube 5.09% → ×1.110)', () => {
    const cube = [
      {
        source: { kind: 'cube' as const, name: { ja: '', en: '' }, level: 1 },
        stat: 'hitRate' as const,
        value: 0.0509,
      },
    ];
    const e = enemy();
    const plain = computeTeamDamage(input([team(true)[0]!], e)).slots[0]!.autoCondition!;
    const withCube = computeTeamDamage(input([slot(AR, true, { buildEffects: cube })], e)).slots[0]!.autoCondition!;
    expect(withCube.hitRateUp).toBe(0.0509);
    expect(withCube.coreHitRate / plain.coreHitRate).toBeCloseTo(1 / 0.9491 ** 2, 9);
    expect(withCube.hitRate).toBe(plain.hitRate);
  });

  it('writes the notes: table, mix, unmeasured cells, RL/SR first shot, MG spin-up, and unmeasured landings', () => {
    const codes = (c: CharacterData, duration = 180) =>
      computeTeamDamage({
        slots: [slot(c, true)],
        enemy: {
          defence: 100,
          element: 'Fire',
          hasCore: true,
          events: enemyEventsOf(master, ['range-3min-jump'], duration),
          target: profile,
          landings: enemyLandingsOf(master, ['range-3min-jump'], duration, profile),
        },
        durationSeconds: duration,
      }).slots[0]!.notes.map((n) => n.code);
    expect(codes(AR)).toEqual(['hit-rate', 'auto-condition']);
    expect(codes(RL)).not.toContain('hit-rate');
    expect(codes(SG)).toContain('auto-condition-unmeasured');
    expect(codes(RL)).toEqual(expect.arrayContaining(['auto-condition-unmeasured', 'landing-first-shot-miss']));
    expect(codes(MG)).toContain('mg-spin-up-core');
    expect(codes(AR, 240)).toContain('landing-unmeasured');
    expect(codes(SMG)).toContain('hit-rate');
  });

  it('feeds the landing bullet hit rate to the gauge of the first pass', () => {
    const character = makeCharacter({}, { resourceId: 1, burstStep: 'Step1' });
    const timelineSlot = (hitRate: number): TimelineSlot => ({
      character,
      definition: null,
      levels: MAX_SKILL_LEVELS,
      casterBaseAttack: 1000,
      hitRate,
    });
    const frames = 3600;
    const constant = runFirstPass([timelineSlot(0.5)], { frames, burst: true });
    const spans = runFirstPass([timelineSlot(1)], {
      frames,
      burst: true,
      hitRates: [[{ start: 0, end: frames, hitRate: 0.5 }]],
    });
    expect(spans.schedule!.gaugeFullFrames).toEqual(constant.schedule!.gaugeFullFrames);
    const full = runFirstPass([timelineSlot(1)], { frames, burst: true });
    expect(full.schedule!.gaugeFullFrames[0]!).toBeLessThan(constant.schedule!.gaugeFullFrames[0]!);
  });
});
