// Stage 18-C: 着地点の時間割り・着地点ごとの表・命中率▲（plan/design-stage18.md 12 節）。
//   1. データ: 的の条件の表（range-bigarms）と出来事のセットの着地点、その検証
//   2. 着地点の時間割り（enemyLandingsOf）と、区間ごとの距離ボーナスの付き方（Stage 17・18-A の単騎と同じ）
//   3. 中遠の配分（3 か所を 0.3 : 0.3 : 0.4）と、命中率▲（1/(1 − N)²、上限 1）
//   4. 編成: 手入力は何も変わらない、自動は条件の表で 1 トリガーを出す、配分の区間は固定した 3 回の重み付きの和、ゲージ、注記
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runTeam } from './runTeam.ts';
import type { EnemyInput } from '../damage.ts';
import {
  enemyEventsOf,
  enemyLandingsOf,
  parseEnemyPresets,
  targetProfileForEnemy,
  targetProfileOf,
} from '../enemies.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import {
  autoConditionAt,
  bulletHitRateAt,
  coreHitRateAt,
  bulletHitRateWithHitRateUp,
  coreHitRateUpIsExponent,
  coreHitRateWithHitRateUp,
  distanceBonusAt,
  exponentSumHitRateUp,
  hitRateDownAt,
  hitRateUpRaisesBulletHitRate,
  landingBandOf,
  landingMix,
  landingPartsWith,
  planLandings,
  projectileKeyOf,
  projectileRowListedUnmeasured,
  rateRowOf,
  targetRateOf,
} from '../frame/landing.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import type { HitRateN } from '../skills/buffs.ts';
import type { TimelineSlot } from '../skills/timeline.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, ShotParams, WeaponType } from '../types.ts';
import { makeCharacter } from './fixtures.ts';
import { battleSecondsToFrames, gameSecondsToFrame } from '../time.ts';

const raw = JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as Record<
  string,
  unknown
>;
const master = parseEnemyPresets(raw);
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const preset = master.enemies.find((e) => e.id === 'range-bigarms-fire')!;

const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: true, fullCharge: true, hitRate: 1 };
/** 命中率▲だけの和 */
const upOnly = (n: number): HitRateN => ({ n, up: n });
/** 命中率▼だけの和 */
const downOnly = (n: number): HitRateN => ({ n, up: 0 });

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
/** 二丁持ちの SMG（銃口 2 つ。的の表は dualWield の行） */
const DUAL_SMG = weapon('SMG', { min: 15, max: 35 }, 1, { muzzleCount: 2 });
const MG = weapon('MG', { min: 35, max: 55 });
const SR = weapon('SR', { min: 45, max: 100 });
const SR_NEAR = weapon('SR', { min: 25, max: 45 });
const SG = weapon('SG', { min: 0, max: 25 });
/** 弾の種類（plan/design-rl-core-by-projectile.md）を持つ RL。既定は紅蓮：ブラックシャドウと同じ直進弾・弾速 400 */
function rl(fireType = 'ProjectileDirect', speed: number | null = 400): CharacterData {
  return weapon('RL', null, 1, {
    fireType,
    ...(speed === null ? {} : { projectile: { speed, homing: 'lv1', radius: 50, explosionRange: 500 } }),
  });
}
const RL = rl();
const RL_HOMING = rl('HomingProjectile', 100);

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
    // C-0155: 近も 2 か所の配分（V-0069 の近 20 区間の内訳 A 8・B 12）
    expect(profile.mixes.near).toEqual([
      ['nearA', 0.4],
      ['nearB', 0.6],
    ]);
    // 遠も 2 か所の配分（C-0477。単騎の 129 本の内訳 遠 A 67・遠 B 62。plan/design-far-landings.md）
    expect(profile.mixes.far).toEqual([
      ['farA', 0.52],
      ['farB', 0.48],
    ]);
  });

  it('reads the band values (C-0543・C-0643・C-0644・C-0632・C-0642・C-0467・C-0507・C-0465・C-0287・V-0056・V-0069・V-0072) through the landing, the band or all, and leaves the unmeasured cells null', () => {
    const at = (id: string) => profile.landings.find((l) => l.id === id)!;
    expect(targetRateOf(profile.coreHitRate, AR, at('midNear'))).toBe(0.2281);
    expect(targetRateOf(profile.coreHitRate, SMG, at('midFarA'))).toBe(0.0516);
    expect(targetRateOf(profile.coreHitRate, SMG, at('midFarC'))).toBe(0.0516);
    // SMG の弾丸命中率は遠の着地点ごと（C-0476）。ほかの武器種とコア命中率は遠の帯の値を共通に使う
    expect(targetRateOf(profile.bulletHitRate, SMG, at('farA'))).toBe(0.8068);
    expect(targetRateOf(profile.bulletHitRate, SMG, at('farB'))).toBe(0.7608);
    expect(targetRateOf(profile.bulletHitRate, MG, at('farA'))).toBe(0.9917);
    expect(targetRateOf(profile.bulletHitRate, MG, at('farB'))).toBe(0.9917);
    // SMG の弾丸命中率は中遠の着地点ごとの値（A は C-0467、B・C は C-0507）
    expect(targetRateOf(profile.bulletHitRate, SMG, at('midFarA'))).toBe(0.9838);
    expect(targetRateOf(profile.bulletHitRate, SMG, at('midFarB'))).toBe(0.9558);
    expect(targetRateOf(profile.bulletHitRate, SMG, at('midFarC'))).toBe(0.9127);
    expect(targetRateOf(profile.coreHitRate, MG, at('farA'))).toBe(0.9588);
    expect(targetRateOf(profile.coreHitRate, MG, at('farB'))).toBe(0.9588);
    expect(targetRateOf(profile.coreHitRate, RL, at('nearA'))).toBe(1);
    expect(targetRateOf(profile.coreHitRate, SR, at('farB'))).toBe(1);
    // C-0610: SG の近のコア命中率はスペック固定によらず 0.052（V-0474）。近の着地点で分けない
    expect(targetRateOf(profile.coreHitRate, SG, at('nearA'))).toBe(0.052);
    expect(targetRateOf(profile.coreHitRate, SG, at('nearB'))).toBe(0.052);
    // C-0156: SG の弾丸命中率だけ近の着地点ごと。ほかの武器種は近の帯の値を共通に使う
    expect(targetRateOf(profile.bulletHitRate, SG, at('nearA'))).toBe(0.845);
    expect(targetRateOf(profile.bulletHitRate, SG, at('nearB'))).toBe(0.951);
    expect(targetRateOf(profile.bulletHitRate, AR, at('nearB'))).toBe(0.9975);
    // C-1108・C-1137・C-1147: SMG のコア命中率は近の着地点ごと（銃口 1 つと二丁持ち）。AR は近の帯の値を共通に使う
    // （plan/design-smg-near-core.md 5.1 節）
    expect(targetRateOf(profile.coreHitRate, SMG, at('nearA'))).toBe(0.2113);
    expect(targetRateOf(profile.coreHitRate, SMG, at('nearB'))).toBe(0.2709);
    expect(targetRateOf(profile.coreHitRate, DUAL_SMG, at('nearA'))).toBe(0.2142);
    expect(targetRateOf(profile.coreHitRate, DUAL_SMG, at('nearB'))).toBe(0.2885);
    expect(targetRateOf(profile.coreHitRate, DUAL_SMG, at('midNear'))).toBe(0.1233);
    expect(targetRateOf(profile.coreHitRate, AR, at('nearA'))).toBe(0.4244);
    expect(targetRateOf(profile.coreHitRate, AR, at('nearB'))).toBe(0.4244);
    expect(targetRateOf(profile.bulletHitRate, SG, at('midFarB'))).toBe(0.77);
    // C-0168: SR・RL の弾丸命中率は 1（距離帯によらない）
    expect(targetRateOf(profile.bulletHitRate, SR, at('farB'))).toBe(1);
    expect(targetRateOf(profile.bulletHitRate, RL, at('nearA'))).toBe(1);
    expect(targetRateOf(profile.bulletHitRate, RL_HOMING, at('farB'))).toBe(1);
  });

  it('reads the RL core hit rate by projectile, and leaves the unmeasured projectiles and bands null (C-0171・C-0172・C-0174・C-0175)', () => {
    const at = (id: string) => profile.landings.find((l) => l.id === id)!;
    expect(projectileKeyOf(RL)).toBe('ProjectileDirect:400');
    expect(targetRateOf(profile.coreHitRate, RL, at('farB'))).toBe(1);
    expect(targetRateOf(profile.coreHitRate, rl('ProjectileDirect', 300), at('farB'))).toBe(1);
    // 外す側の直進弾 100 は 4 つの距離帯の値（C-0175）、誘導弾 100 も 4 つ（中遠は C-0530。ほかは C-0174）
    const direct100 = rl('ProjectileDirect', 100);
    expect(targetRateOf(profile.coreHitRate, direct100, at('nearA'))).toBe(1);
    expect(targetRateOf(profile.coreHitRate, direct100, at('farB'))).toBe(0.4286);
    expect(targetRateOf(profile.coreHitRate, direct100, at('midFarB'))).toBe(0.6905);
    expect(targetRateOf(profile.coreHitRate, RL_HOMING, at('midNear'))).toBe(0.8851);
    expect(targetRateOf(profile.coreHitRate, RL_HOMING, at('farB'))).toBe(0.5914);
    expect(targetRateOf(profile.coreHitRate, RL_HOMING, at('midFarA'))).toBe(0.7424);
    for (const c of [direct100, RL_HOMING]) expect(projectileRowListedUnmeasured(profile.coreHitRate, c)).toBe(false);
    // 曲射 1500 も 4 つの距離帯の値（C-0242）
    const curve = rl('ProjectileCurve', 1500);
    expect(rateRowOf(profile.coreHitRate, curve)).toEqual({
      near: 0.9904,
      midNear: 0.9267,
      far: 0.8143,
      midFar: 0.8667,
    });
    expect(targetRateOf(profile.coreHitRate, curve, at('farB'))).toBe(0.8143);
    expect(targetRateOf(profile.coreHitRate, curve, at('midFarC'))).toBe(0.8667);
    expect(projectileRowListedUnmeasured(profile.coreHitRate, curve)).toBe(false);
    // 表に無い弾の種類と、飛ぶ弾でない RL も未測定。こちらは「外す側」とは書いていない
    for (const c of [rl('ProjectileDirect', 250), rl('Instant', null)]) {
      expect(targetRateOf(profile.coreHitRate, c, at('farB'))).toBeNull();
      expect(projectileRowListedUnmeasured(profile.coreHitRate, c)).toBe(false);
    }
    expect(projectileRowListedUnmeasured(profile.coreHitRate, RL)).toBe(false);
    expect(projectileRowListedUnmeasured(profile.coreHitRate, AR)).toBe(false);
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
    const byProjectile = (by: unknown, extra: Record<string, unknown> = {}) =>
      parse([{ ...p, coreHitRate: { RL: { byProjectile: by, ...extra } } }]);
    expect(byProjectile({ 'ProjectileDirect:400': { all: 1 }, 'HomingProjectile:100': null })).not.toThrow();
    expect(byProjectile({ Direct400: { all: 1 } })).toThrow(/<fireType>:<speed>/);
    expect(byProjectile({ 'ProjectileDirect:400': { all: 2 } })).toThrow(/[0, 1]/);
    expect(byProjectile({ 'ProjectileDirect:400': { moon: 1 } })).toThrow(/not a landing/);
    expect(byProjectile({})).toThrow(/non-empty/);
    expect(byProjectile({ 'ProjectileDirect:400': { all: 1 } }, { all: 1 })).toThrow(/only key/);
    // 紅蓮：神殺編（plan/design-new-chars-1029.md 12.2 節の a）: 弾の種類（fire_type）ごとの行
    const fireTypes = (rows: unknown) =>
      parse([{ ...p, coreHitRate: { ...(p.coreHitRate as object), fireTypes: rows } }]);
    expect(fireTypes({ InstantBox: { all: 1 }, Instant: null })).not.toThrow();
    expect(fireTypes({ 'InstantBox:0': { all: 1 } })).toThrow(/fire type/);
    expect(fireTypes({ InstantBox: { all: 2 } })).toThrow(/\[0, 1\]/);
    expect(parse([{ ...p, initialLanding: 'moon' }])).toThrow(/initialLanding/);
    expect(
      parse([
        {
          ...p,
          landings: [...(p.landings as unknown[]), { id: 'nearA', band: 'near', range: [15, 25], distance: 18 }],
        },
      ]),
    ).toThrow(/duplicate landing/);
    // エード：エージェントバニー編: 代表の距離は必須で、範囲の中
    const landingsWith = (distance: unknown) =>
      parse([{ ...p, landings: [{ id: 'nearA', band: 'near', range: [15, 25], distance }] }]);
    expect(landingsWith(undefined)).toThrow(/distance/);
    expect(landingsWith(30)).toThrow(/distance/);
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

describe('敵の値から的の条件の表を引く（18-C2）', () => {
  it('reads the fire type row before the weapon type row (InstantBox. V-0675)', () => {
    // 紅蓮：神殺編（plan/design-new-chars-1029.md 12.2 節の a）: InstantBox の AR はどの区間もコア 1、ほかの AR は武器種の行
    const box = weapon('AR', { min: 25, max: 45 }, 1, { fireType: 'InstantBox' });
    expect(rateRowOf(profile.coreHitRate, box)).toEqual({ all: 1 });
    for (const l of profile.landings) expect(targetRateOf(profile.coreHitRate, box, l)).toBe(1);
    expect(rateRowOf(profile.coreHitRate, AR)).toBe(profile.coreHitRate.AR);
    // 弾丸命中率の表には弾の種類の行が無いので、武器種の行のまま
    expect(rateRowOf(profile.bulletHitRate, box)).toBe(profile.bulletHitRate.AR);
  });

  it('uses the preset table, and the range table for the shooting-range target without an element', () => {
    expect(targetProfileForEnemy(master, { defence: 100, element: 'Fire', hasCore: true })).toBe(profile);
    expect(targetProfileForEnemy(master, { defence: 100, element: null, hasCore: true })).toBe(profile);
    expect(targetProfileForEnemy(master, { defence: 140, element: null, hasCore: true })).toBeUndefined();
    expect(targetProfileForEnemy(master, { defence: 140, element: 'Fire', hasCore: true })).toBeUndefined();
    expect(targetProfileForEnemy(master, { defence: 100, element: null, hasCore: false })).toBeUndefined();
  });

  it('names the band of a landing or a mix of one band', () => {
    expect(landingBandOf(profile, 'near')).toBe('near');
    expect(landingBandOf(profile, 'nearB')).toBe('near');
    expect(landingBandOf(profile, 'midFarB')).toBe('midFar');
    expect(landingBandOf(profile, 'midFar')).toBe('midFar');
    expect(landingBandOf(profile, null)).toBeNull();
    expect(
      landingBandOf(
        {
          ...profile,
          mixes: {
            odd: [
              ['nearA', 0.5],
              ['far', 0.5],
            ],
          },
        },
        'odd',
      ),
    ).toBeNull();
  });
});

describe('着地点の時間割り（enemyLandingsOf）', () => {
  const spans = (fixed?: Record<string, string | string[]>, duration = 180) =>
    enemyLandingsOf(master, ['range-3min-jump'], duration, profile, fixed).map((s) => [
      Number(s.start.toFixed(1)),
      Number(s.end.toFixed(1)),
      s.landing,
    ]);

  it('cuts at each landing (the end of a jump) and follows 中近 → 近 → 遠 → 中遠 → 近 → 遠 (C-0031)', () => {
    // V-0009: ジャンプは 180 秒に 5 回。5 回目の着地（179.86 秒）の後に短い遠の区間が残る
    expect(spans()).toEqual([
      [0, 34.4, 'midNear'],
      [34.4, 70.7, 'near'],
      [70.7, 110.3, 'far'],
      [110.3, 146.7, 'midFar'],
      [146.7, 179.9, 'near'],
      [179.9, 180, 'far'],
    ]);
  });

  it('uses the initial landing for the whole battle without the 3-minute mode, and can fix the mid-far landing', () => {
    expect(enemyLandingsOf(master, [], 180, profile)).toEqual([{ start: 0, end: 180, landing: 'midNear' }]);
    expect(spans({ midFar: 'midFarA' })[3]).toEqual([110.3, 146.7, 'midFarA']);
    expect(() => spans({ midFar: 'near' })).toThrow(/not part of mix/);
  });

  it('fixes the far landing per span in order, like the near one (C-0477: 1 回目・2 回目)', () => {
    expect(spans({ far: ['farA', 'farB'] }).map(([, , landing]) => landing)).toEqual([
      'midNear',
      'near',
      'farA',
      'midFar',
      'near',
      'farB',
    ]);
    // 並びより後の回は配分のまま
    expect(spans({ far: ['farB'] }).map(([, , landing]) => landing)).toEqual([
      'midNear',
      'near',
      'farB',
      'midFar',
      'near',
      'far',
    ]);
    expect(() => spans({ far: ['farA', 'nearA'] })).toThrow(/not part of mix/);
  });

  it('fixes the near landing per span in order (C-0155: 1 回目・2 回目)', () => {
    const fixed = spans({ near: ['nearA', 'nearB'], midFar: 'midFarC' });
    expect(fixed.map(([, , landing]) => landing)).toEqual(['midNear', 'nearA', 'far', 'midFarC', 'nearB', 'far']);
    // 並びより後の回は配分のまま
    expect(spans({ near: ['nearB'] }).map(([, , landing]) => landing)).toEqual([
      'midNear',
      'nearB',
      'far',
      'midFar',
      'near',
      'far',
    ]);
    expect(() => spans({ near: ['nearA', 'midFarA'] })).toThrow(/not part of mix/);
  });

  it('marks the landings after the measured order as unmeasured (battles longer than 180 s)', () => {
    const long = spans(undefined, 260);
    expect(long.slice(6).every(([, , landing]) => landing === null)).toBe(true);
    // 6 区間目（遠）は次の着地（213.0 秒。並びの後は最後の間隔 33.17 秒を繰り返す）まで。そこから先は未測定
    expect(long[5]).toEqual([179.9, 213, 'far']);
    expect(long[6]![0]).toBe(213);
  });
});

describe('距離ボーナスの付き方（区間ごと。Stage 17・18-A の単騎）', () => {
  const order = ['midNear', 'nearA', 'farA', 'midFarA', 'nearB', 'farB'];
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
    // 命中率▼の表を渡さなければ変えない
    expect(coreHitRateWithHitRateUp(0.2281, -0.2)).toBe(0.2281);
  });

  it('raises the core hit rate of a single-muzzle SMG at near range by the exponent form (C-1109); other cells keep 1/(1 − N)²', () => {
    const at = (id: string) => profile.landings.find((l) => l.id === id)!;
    expect(coreHitRateUpIsExponent(SMG, at('nearA'))).toBe(true);
    expect(coreHitRateUpIsExponent(SMG, at('nearB'))).toBe(true);
    expect(coreHitRateUpIsExponent(SMG, at('midNear'))).toBe(false);
    expect(coreHitRateUpIsExponent(SMG, at('farA'))).toBe(false);
    expect(coreHitRateUpIsExponent(DUAL_SMG, at('nearA'))).toBe(false);
    expect(coreHitRateUpIsExponent(AR, at('nearA'))).toBe(false);
    // ナユタのフルスタックの N 0.42（plan/design-smg-near-core.md 5.1 節: 近 A 0.506・近 B 0.609。和なら 0.628・0.805）
    const n = upOnly(0.42);
    expect(autoConditionAt(profile, at('nearA'), SMG, n, MANUAL).coreHitRate).toBeCloseTo(0.506, 3);
    expect(autoConditionAt(profile, at('nearB'), SMG, n, MANUAL).coreHitRate).toBeCloseTo(0.609, 3);
    expect(autoConditionAt(profile, at('farA'), SMG, n, MANUAL).coreHitRate).toBe(
      coreHitRateWithHitRateUp(0.0342, 0.42),
    );
    expect(autoConditionAt(profile, at('nearA'), DUAL_SMG, n, MANUAL).coreHitRate).toBe(
      coreHitRateWithHitRateUp(0.2142, 0.42),
    );
    expect(autoConditionAt(profile, at('nearA'), AR, n, MANUAL).coreHitRate).toBe(
      coreHitRateWithHitRateUp(0.4244, 0.42),
    );
    // 指数・和も N ≥ 1 で 1、N ≤ 0 で表の値のまま
    expect(coreHitRateAt(0.2113, upOnly(1), undefined, true)).toBe(1);
    expect(coreHitRateAt(0.2113, upOnly(0), undefined, true)).toBe(0.2113);
    expect(exponentSumHitRateUp(0.2113, 0.42)).toBe(bulletHitRateWithHitRateUp(0.2113, 0.42));
  });

  it('applies to the table value only; the manual value is kept as it is', () => {
    const near = profile.landings.find((l) => l.id === 'nearA')!;
    const withUp = autoConditionAt(profile, near, SMG, upOnly(0.0509), MANUAL);
    // C-1109: 銃口 1 つの SMG の近は指数・和
    expect(withUp.coreHitRate).toBeCloseTo(1 - (1 - 0.2113) ** (1 / 0.9491 ** 2), 12);
    const smgNear = (profile.bulletHitRate.SMG as Record<string, number>).near!;
    expect(withUp.hitRate).toBe(bulletHitRateWithHitRateUp(smgNear, 0.0509));
    expect(withUp.distanceBonus).toBe(true);
    const unmeasured = { ...profile, coreHitRate: { ...profile.coreHitRate, SG: null } };
    const sg = autoConditionAt(unmeasured, near, SG, upOnly(0.5), { ...MANUAL, coreHitRate: 0.4 });
    expect(sg.coreHitRate).toBe(0.4);
  });
});

describe('命中率▼の表（C-0974・C-0975。plan/design-maids.md 8 節）', () => {
  const at = (id: string) => profile.landings.find((l) => l.id === id)!;
  const down = (id: string) => hitRateDownAt(profile.hitRateDown, MG, at(id))!;

  it('gives the MG core hit rate as the landing base × the ratio of N, for the N in the table only', () => {
    expect(coreHitRateAt(0.9626, downOnly(-0.2), down('nearA'))).toBeCloseTo(0.587, 12);
    expect(coreHitRateAt(0.9626, downOnly(-0.4), down('nearB'))).toBeCloseTo(0.587 * 0.46, 12);
    expect(coreHitRateAt(0.9588, downOnly(-0.6000000000000001), down('farA'))).toBeCloseTo(0.086 * 0.2, 12);
    expect(coreHitRateAt(0.965, downOnly(-0.4), down('midNear'))).toBeCloseTo(0.378 * 0.46, 12);
    expect(coreHitRateAt(0.9614, downOnly(-0.6), down('midFarC'))).toBeCloseTo(0.182 * 0.2, 12);
    // 表に無い N は変えない
    expect(coreHitRateAt(0.9626, downOnly(-0.1), down('nearA'))).toBe(0.9626);
  });

  it('lowers the MG bullet hit rate at far and mid-far only; mid-far at −40% keeps the table value', () => {
    expect(bulletHitRateAt(0.9917, downOnly(-0.2), down('farB'))).toBe(0.958);
    expect(bulletHitRateAt(0.9917, downOnly(-0.4), down('farA'))).toBe(0.74);
    expect(bulletHitRateAt(0.9945, downOnly(-0.6), down('midFarA'))).toBe(0.718);
    expect(bulletHitRateAt(0.9945, downOnly(-0.4), down('midFarB'))).toBe(0.9945);
    expect(bulletHitRateAt(0.9976, downOnly(-0.6), down('nearA'))).toBe(0.9976);
  });

  it('has no rows for other weapon types, and autoConditionAt reads the table', () => {
    expect(hitRateDownAt(profile.hitRateDown, AR, at('nearA'))).toBeUndefined();
    expect(autoConditionAt(profile, at('nearA'), AR, downOnly(-0.2), MANUAL).coreHitRate).toBe(0.4244);
    const mg = autoConditionAt(profile, at('farA'), MG, downOnly(-0.4), MANUAL);
    expect(mg.coreHitRate).toBeCloseTo(0.086 * 0.46, 12);
    expect(mg.hitRate).toBe(0.74);
  });

  it('does not use the table while a Hit Rate increase is also active (8.4 節: the sum N goes through the ▲ formula)', () => {
    // ▲ +20% と▼ 2 スタック（−40%）: 和の N = −0.2 は表のキーだが、▼だけの和でないので表を使わず、N ≤ 0 は表の値のまま
    expect(coreHitRateAt(0.9626, { n: 0.2 - 0.4, up: 0.2 }, down('nearA'))).toBe(0.9626);
    expect(bulletHitRateAt(0.9917, { n: 0.2 - 0.4, up: 0.2 }, down('farB'))).toBe(0.9917);
    // 和が正なら▲の式（和の N）
    expect(coreHitRateAt(0.9626, { n: 0.4 - 0.2, up: 0.4 }, down('nearA'))).toBe(
      coreHitRateWithHitRateUp(0.9626, 0.4 - 0.2),
    );
    const mg = autoConditionAt(profile, at('farA'), MG, { n: 0.2 - 0.6, up: 0.2 }, MANUAL);
    expect(mg.coreHitRate).toBe(0.9588);
    expect(mg.hitRate).toBe(0.9917);
  });

  it('rejects malformed Hit Rate decrease tables', () => {
    const base = raw.targetProfiles as Record<string, unknown>[];
    const bigarms = base.find((p) => p.id === 'range-bigarms')!;
    const parse = (hitRateDown: unknown) => () =>
      parseEnemyPresets({ ...raw, targetProfiles: base.map((p) => (p === bigarms ? { ...p, hitRateDown } : p)) });
    const core = { base: { near: 0.5 }, ratio: { '-0.2': 1 } };
    expect(parse({ MG: { core, bullet: { '-0.2': { far: 0.9 } } } })).not.toThrow();
    expect(parse({})).not.toThrow();
    expect(parse(null)).toThrow(/hitRateDown: must be an object/);
    expect(parse([])).toThrow(/hitRateDown: must be an object/);
    expect(parse({ XX: { core } })).toThrow(/hitRateDown\.XX: unknown weapon type/);
    expect(parse({ MG: 1 })).toThrow(/hitRateDown\.MG: must be an object/);
    expect(parse({ MG: { core, extra: {} } })).toThrow(/hitRateDown\.MG\.extra: unknown key/);
    // core は { base, ratio } だけ
    expect(parse({ MG: { core: 1 } })).toThrow(/MG\.core: must be \{ base, ratio \}/);
    expect(parse({ MG: { core: { base: { near: 0.5 } } } })).toThrow(/MG\.core: must be \{ base, ratio \}/);
    expect(parse({ MG: { core: { ...core, extra: 1 } } })).toThrow(/MG\.core: must be \{ base, ratio \}/);
    expect(parse({ MG: { core: { base: { near: 0.5 }, ratio: 1 } } })).toThrow(/MG\.core: must be \{ base, ratio \}/);
    // 和 N のキーは負の数
    for (const key of ['0.2', '0', '', ' ', 'x', 'Infinity']) {
      expect(parse({ MG: { core: { ...core, ratio: { [key]: 1 } } } })).toThrow(/key must be a negative number/);
      expect(parse({ MG: { bullet: { [key]: { far: 0.9 } } } })).toThrow(/key must be a negative number/);
    }
    expect(parse({ MG: { core: { ...core, ratio: { '-0.2': 1.5 } } } })).toThrow(
      /MG\.core\.ratio\.-0\.2: must be in \[0, 1\]/,
    );
    expect(parse({ MG: { core: { ...core, ratio: { '-0.2': '1' } } } })).toThrow(/must be in \[0, 1\]/);
    expect(parse({ MG: { core: { ...core, base: { moon: 0.5 } } } })).toThrow(/not a landing/);
    expect(parse({ MG: { core: { ...core, base: { near: 2 } } } })).toThrow(/\[0, 1\]/);
    expect(parse({ MG: { bullet: 1 } })).toThrow(/MG\.bullet: must be an object/);
    expect(parse({ MG: { bullet: { '-0.2': { moon: 0.9 } } } })).toThrow(/not a landing/);
    expect(parse({ MG: { bullet: { '-0.2': {} } } })).toThrow(/MG\.bullet\.-0\.2: must be a non-empty object/);
    expect(parse({ MG: { bullet: { '-0.2': { far: -0.1 } } } })).toThrow(/\[0, 1\]/);
  });
});

describe('命中率▲と弾丸命中率（C-0192。plan/design-hit-rate-up-bullet-h2.md）', () => {
  it('turns the miss rate 1 − p into (1 − p) ^ (1 ÷ (1 − N)²), gives 1 at N ≥ 1, and keeps p at N ≤ 0 or p = 1', () => {
    // 表の SMG の遠とミサト S1 の 3 スタック（C-0183）
    expect(bulletHitRateWithHitRateUp(0.76, 0.1512)).toBeCloseTo(1 - 0.24 ** (1 / 0.8488 ** 2), 12);
    expect(bulletHitRateWithHitRateUp(0.76, 1)).toBe(1);
    expect(bulletHitRateWithHitRateUp(0.76, 1.0137)).toBe(1);
    expect(bulletHitRateWithHitRateUp(0.76, 0)).toBe(0.76);
    expect(bulletHitRateWithHitRateUp(0.76, -0.2)).toBe(0.76);
    expect(bulletHitRateWithHitRateUp(1, 0.3)).toBe(1);
  });

  it('raises AR, SMG and MG at every landing and SG at near only (C-0631); SR and RL keep the table value', () => {
    const far = profile.landings.find((l) => l.id === 'farA')!;
    const nearA = profile.landings.find((l) => l.id === 'nearA')!;
    const nearB = profile.landings.find((l) => l.id === 'nearB')!;
    const midNear = profile.landings.find((l) => l.id === 'midNear')!;
    const all = profile.landings;
    expect([AR, SMG, MG].every((c) => all.every((l) => hitRateUpRaisesBulletHitRate(c, l)))).toBe(true);
    expect([SR, RL].some((c) => all.some((l) => hitRateUpRaisesBulletHitRate(c, l)))).toBe(false);
    expect(all.filter((l) => hitRateUpRaisesBulletHitRate(SG, l)).map((l) => l.id)).toEqual(['nearA', 'nearB']);
    expect(autoConditionAt(profile, far, SMG, upOnly(0.1512), MANUAL).hitRate).toBe(
      bulletHitRateWithHitRateUp(0.8068, 0.1512),
    );
    // SG: 近だけ式を当て、中近・遠は表の値のまま（C-0527）
    expect(autoConditionAt(profile, nearA, SG, upOnly(0.0509), MANUAL).hitRate).toBe(
      bulletHitRateWithHitRateUp(0.845, 0.0509),
    );
    expect(autoConditionAt(profile, nearB, SG, upOnly(0.0509), MANUAL).hitRate).toBe(
      bulletHitRateWithHitRateUp(0.951, 0.0509),
    );
    expect(autoConditionAt(profile, midNear, SG, upOnly(0.0509), MANUAL).hitRate).toBe(0.778);
    expect(autoConditionAt(profile, far, SG, upOnly(0.0509), MANUAL).hitRate).toBe(0.668);
    expect(autoConditionAt(profile, far, SR, upOnly(0.1512), MANUAL).hitRate).toBe(1);
    // 表が null（未測定）なら手入力の値のまま
    const unmeasured = { ...profile, bulletHitRate: { ...profile.bulletHitRate, SMG: null } };
    expect(autoConditionAt(unmeasured, far, SMG, upOnly(0.1512), { ...MANUAL, hitRate: 0.5 }).hitRate).toBe(0.5);
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
  const enemy = (
    options: { events?: boolean; fixed?: Record<string, string | string[]>; target?: boolean } = {},
  ): EnemyInput => {
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

  it('re-derives the near core rate with the segment N: exponent form for a single-muzzle SMG, the sum for a dual-wield SMG (C-1109)', () => {
    const slots = [slot(SMG, true), slot(DUAL_SMG, true)];
    const plan = planLandings(slots, enemy(), battleSecondsToFrames(180), [null, null])!;
    const n = upOnly(0.42);
    const single = landingPartsWith(plan, slots[0]!, 0, 'near', n);
    expect(single.map((p) => [p.landing?.id, p.condition.coreHitRate])).toEqual([
      ['nearA', exponentSumHitRateUp(0.2113, 0.42)],
      ['nearB', exponentSumHitRateUp(0.2709, 0.42)],
    ]);
    const dual = landingPartsWith(plan, slots[1]!, 1, 'near', n);
    expect(dual.map((p) => [p.landing?.id, p.condition.coreHitRate])).toEqual([
      ['nearA', coreHitRateWithHitRateUp(0.2142, 0.42)],
      ['nearB', coreHitRateWithHitRateUp(0.2885, 0.42)],
    ]);
    // 遠は銃口 1 つでも和
    const far = landingPartsWith(plan, slots[0]!, 0, 'far', n);
    for (const p of far) expect(p.condition.coreHitRate).toBe(coreHitRateWithHitRateUp(0.0342, 0.42));
  });

  it('changes nothing for manual slots, even with the target profile attached', () => {
    const plain = input(team(false), enemy({ target: false }));
    const withTarget = input(team(false), enemy());
    const calc = runTeam(withTarget);
    const sim = runSimulation(withTarget);
    expect(calc.totalDamage).toBe(runTeam(plain).totalDamage);
    expect(sim.totalDamage).toBe(runSimulation(plain).totalDamage);
    expect(sim.timeline.segments.length).toBe(runSimulation(plain).timeline.segments.length);
    expect(calc.landings).toEqual([]);
    expect(calc.slots.every((s) => s!.autoCondition === null)).toBe(true);
  });

  it('uses the manual values with a note when the enemy has no target profile', () => {
    const auto = runTeam(input(team(true), enemy({ target: false })));
    expect(auto.totalDamage).toBe(runTeam(input(team(false), enemy({ target: false }))).totalDamage);
    expect(auto.slots[0]!.notes.map((n) => n.code)).toContain('auto-condition-no-target');
    expect(auto.slots[0]!.autoCondition).toBeNull();
  });

  it('lowers the total and keeps calc equal to sim for normal attacks (both count the shot list)', () => {
    const auto = input(team(true), enemy());
    const calc = runTeam(auto);
    const sim = runSimulation(auto);
    const simTeam = simTeamResult(auto, sim);
    expect(calc.totalDamage).toBeLessThan(runTeam(input(team(false), enemy())).totalDamage);
    for (let i = 0; i < 3; i++) {
      expect(calc.slots[i]!.normalDamage).toBeCloseTo(sim.slots[i]!.normalDamage, 3);
      expect(calc.slots[i]!.autoCondition).toEqual(sim.slots[i]!.autoCondition);
      expect(simTeam.slots[i]!.autoCondition).toEqual(calc.slots[i]!.autoCondition);
    }
    expect(calc.landings.map((s) => s.landing)).toEqual(['midNear', 'near', 'far', 'midFar', 'near', 'far']);
    expect(simTeam.landings).toEqual(calc.landings);
    // 自動の枠は着地点の境目で区間が割れる（鍵に着地点が入る）
    const landings = new Set(calc.slots[0]!.segments.map((s) => s.ranges[0]!.start));
    expect(landings.has(gameSecondsToFrame(34.35))).toBe(true);
    expect(calc.enemyNotes[0]!.message.ja).not.toContain('扱わない');
  });

  it('gives each landing its own distance bonus and table values (SMG: off at 遠, on at 中遠 A)', () => {
    const calc = runTeam(input(team(true), enemy({ fixed: { midFar: 'midFarA' } })));
    const smg = calc.slots[1]!;
    const at = (sec: number) =>
      smg.segments.find((s) =>
        s.ranges.some((r) => r.start <= gameSecondsToFrame(sec) && gameSecondsToFrame(sec) < r.end),
      )!;
    expect(at(10).trigger.boost.distance).toBe(0.3);
    expect(at(80).trigger.boost.distance).toBe(0);
    expect(at(120).trigger.boost.distance).toBe(0.3);
    // 遠は 2 か所の配分なので、区間の弾丸命中率は着地点ごとの値（遠 A 0.8068・遠 B 0.7608）を 0.52 : 0.48 で混ぜた値
    expect(at(80).trigger.hitRate).toBeCloseTo(0.52 * 0.8068 + 0.48 * 0.7608, 12);
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
      const s = mix[i]!.segments.find((x) => x.start <= gameSecondsToFrame(120) && gameSecondsToFrame(120) < x.end)!;
      return s.trigger.boost.distance / 0.3;
    };
    expect(midFarShare(0)).toBeCloseTo(1, 12);
    expect(midFarShare(1)).toBeCloseTo(0.3, 12);
    expect(midFarShare(2)).toBeCloseTo(0.7, 12);
  });

  it('weights the far span 0.52 : 0.48 over the two fixed landings (C-0477), and only SMG differs between them', () => {
    const run = (fixed?: Record<string, string[]>) => runSimulation(input(team(true), enemy({ fixed }))).slots;
    const mix = run();
    const [a, b] = ['farA', 'farB'].map((id) => run({ far: [id, id] }));
    for (let i = 0; i < 3; i++) {
      const expected = 0.52 * a![i]!.normalDamage + 0.48 * b![i]!.normalDamage;
      expect(mix[i]!.normalDamage / expected).toBeCloseTo(1, 12);
    }
    // SMG（枠 2）だけ遠 A のほうが多く当たる（V-0328）。AR・MG は遠の帯の値を共通に使うので同じ
    expect(a![1]!.normalDamage).toBeGreaterThan(b![1]!.normalDamage);
    expect(a![0]!.normalDamage).toBeCloseTo(b![0]!.normalDamage, 6);
    expect(a![2]!.normalDamage).toBeCloseTo(b![2]!.normalDamage, 6);
  });

  it('uses the initial landing (中近) without the 3-minute mode, and matches the manual 中近 condition', () => {
    const calc = runTeam(input(team(true), enemy({ events: false })));
    expect(calc.landings).toEqual([{ start: 0, end: battleSecondsToFrames(180), landing: 'midNear', band: 'midNear' }]);
    const midNear: SlotCondition = { coreHitRate: 0.2281, distanceBonus: true, fullCharge: true, hitRate: 0.9963 };
    const manual = runTeam(
      input([slot(weapon('AR', { min: 25, max: 45 }, 1), false, { condition: midNear })], enemy({ events: false })),
    );
    const ar = runTeam(input([team(true)[0]!], enemy({ events: false })));
    // 一本化の段 A-1: calc もグループごとに射撃の列の発数を数える。着地点が 1 つなら手入力の同じ条件と同じ発数・同じ値
    expect(ar.slots[0]!.segments.every((s) => s.triggerSource === 'shots')).toBe(true);
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
    const plain = runTeam(input([team(true)[0]!], e)).slots[0]!.autoCondition!;
    const withCube = runTeam(input([slot(AR, true, { buildEffects: cube })], e)).slots[0]!.autoCondition!;
    expect(withCube.hitRateUp).toBe(0.0509);
    expect(withCube.coreHitRate / plain.coreHitRate).toBeCloseTo(1 / 0.9491 ** 2, 9);
    // C-0192: AR の弾丸命中率も上がる
    expect(withCube.hitRate).toBeGreaterThan(plain.hitRate);
    expect(withCube.hitRate).toBeLessThan(1);
  });

  it('says where hit rate up changes bullet hit rate from the same judge as the model (SG: by whether the plan has near)', () => {
    const note = (c: CharacterData, events: boolean) =>
      runTeam(input([slot(c, true)], enemy({ events }))).slots[0]!.notes.find((x) => x.code === 'auto-condition')!
        .message;
    // 3 分のモードは近を含む。無ければ初期位置（中近）だけ
    const withNear = note(SG, true);
    expect(withNear.ja).toContain('C-0631');
    expect(withNear.en).toContain('C-0631');
    expect(withNear.ja).not.toContain('C-0192');
    const midNearOnly = note(SG, false);
    expect(midNearOnly.ja).toContain('命中率▲は弾丸命中率に効かせていない（未実装');
    expect(midNearOnly.ja).toContain('近の着地点が無い');
    expect(midNearOnly.ja).toContain('C-0527');
    expect(midNearOnly.en).toContain('C-0527');
    expect(midNearOnly.ja).not.toContain('C-0631');
    expect(midNearOnly.en).not.toContain('C-0631');
    // AR・SMG・MG はどの着地点にも効かせる。SR・RL は効かせない
    for (const events of [true, false]) {
      expect(note(AR, events).ja).toContain('C-0192');
      expect(note(SR, events).ja).toContain('命中率▲は弾丸命中率に効かせていない（未実装）');
      expect(note(SR, events).ja).not.toContain('C-0527');
    }
  });

  it('says the exponent form of the core hit rate only for a single-muzzle SMG whose plan has near (C-1109)', () => {
    const note = (c: CharacterData, events: boolean) =>
      runTeam(input([slot(c, true)], enemy({ events }))).slots[0]!.notes.find((x) => x.code === 'auto-condition')!
        .message;
    expect(note(SMG, true).ja).toContain('C-1109');
    expect(note(SMG, true).en).toContain('C-1109');
    // 近の無い計画（初期位置の中近だけ）・二丁持ち・AR には出さない
    expect(note(SMG, false).ja).not.toContain('C-1109');
    expect(note(DUAL_SMG, true).ja).not.toContain('C-1109');
    expect(note(AR, true).ja).not.toContain('C-1109');
  });

  it('writes the notes: table, mix, unmeasured cells, MG spin-up, and unmeasured landings', () => {
    const codes = (c: CharacterData, duration = 180, target = profile) =>
      runTeam({
        slots: [slot(c, true)],
        enemy: {
          defence: 100,
          element: 'Fire',
          hasCore: true,
          events: enemyEventsOf(master, ['range-3min-jump'], duration),
          target,
          landings: enemyLandingsOf(master, ['range-3min-jump'], duration, target),
        },
        durationSeconds: duration,
      }).slots[0]!.notes.map((n) => n.code);
    expect(codes(AR)).toEqual(['hit-rate', 'auto-condition']);
    expect(codes(RL)).not.toContain('hit-rate');
    expect(codes(SG)).toEqual(['hit-rate', 'auto-condition']);
    // SR・RL の弾丸命中率は 1（C-0168）なので、未測定の注記は出ない
    expect(codes(RL)).not.toContain('auto-condition-unmeasured');
    // C-0171: 外す側の弾の種類の RL で行が未測定（null と明記）なら、コア命中率が未測定で、遠で外す注記が出る。直進弾 400 には出ない。
    // 表の外す側の行は C-0242 で全部測ったので、曲射の行を null に戻した表で確かめる
    const curve = rl('ProjectileCurve', 1500);
    const rlRow = profile.coreHitRate.RL as { byProjectile: Record<string, unknown> };
    const curveUnmeasured = {
      ...profile,
      coreHitRate: {
        ...profile.coreHitRate,
        RL: { byProjectile: { ...rlRow.byProjectile, 'ProjectileCurve:1500': null } },
      },
    } as typeof profile;
    expect(codes(curve, 180, curveUnmeasured)).toContain('auto-condition-unmeasured');
    expect(codes(curve, 180, curveUnmeasured)).toContain('core-miss-by-projectile');
    expect(codes(curve)).not.toContain('auto-condition-unmeasured');
    expect(codes(curve)).not.toContain('core-miss-by-projectile');
    expect(codes(RL)).not.toContain('core-miss-by-projectile');
    // C-0174・C-0530: 誘導弾 100 と直進弾 100 は 4 つの距離帯とも測った
    expect(codes(RL_HOMING)).not.toContain('auto-condition-unmeasured');
    expect(codes(RL_HOMING)).not.toContain('core-miss-by-projectile');
    expect(codes(rl('ProjectileDirect', 100))).not.toContain('auto-condition-unmeasured');
    expect(codes(SR)).not.toContain('auto-condition-unmeasured');
    expect(codes(MG)).toContain('mg-spin-up-core');
    expect(codes(AR, 240)).toContain('landing-unmeasured');
    expect(codes(SMG)).toContain('hit-rate');
    // plan/design-landing-aim.md 10 節: 着地の後の照準の動き（C-0194・C-0291・C-0948）は枠ごとに出さず、画面の一覧の
    // 「モデル全体」に 1 行だけ出す。紅蓮：ブラックシャドウ（チャージ 0.3 秒）・誘導弾 100 の RL・SMG にも出ない
    const scarlet = weapon('RL', null, 1, {
      fireType: 'ProjectileDirect',
      projectile: { speed: 400, homing: 'lv1', radius: 50, explosionRange: 500 },
      chargeTime: 0.3,
      inputType: 'UP',
      maintainFireStance: 23,
      uptypeFireTiming: 1,
    });
    for (const c of [scarlet, RL, RL_HOMING, SMG]) {
      expect(codes(c).filter((code) => code.startsWith('landing-') && code !== 'landing-unmeasured')).toEqual([]);
    }
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
      hitRates: [[{ start: 0, end: frames, hitRate: 0.5, coreHits: 0, measured: true }]],
    });
    expect(spans.schedule!.gaugeFullFrames).toEqual(constant.schedule!.gaugeFullFrames);
    const full = runFirstPass([timelineSlot(1)], { frames, burst: true });
    expect(full.schedule!.gaugeFullFrames[0]!).toBeLessThan(constant.schedule!.gaugeFullFrames[0]!);
  });

  it('counts SG pellets at the table bullet hit rate, and at the 0.75 stand-in only for manual values (C-0150)', () => {
    const character = makeCharacter(
      { shotCount: 10, targetBurstEnergyPerShot: 9000 },
      { resourceId: 1, burstStep: 'Step1', weaponType: 'SG' },
    );
    const timelineSlot: TimelineSlot = {
      character,
      definition: null,
      levels: MAX_SKILL_LEVELS,
      casterBaseAttack: 1000,
    };
    const frames = 3600;
    const run = (span?: { hitRate: number; measured: boolean }) =>
      runFirstPass([timelineSlot], {
        frames,
        burst: true,
        ...(span ? { hitRates: [[{ start: 0, end: frames, coreHits: 0, ...span }]] } : {}),
      });
    // 表の値 0.9: 1 トリガー 81,000 で 13 トリガー目（972,000 → 1,053,000）
    const measured = run({ hitRate: 0.9, measured: true });
    expect(measured.schedule!.gaugeFullFrames[0]).toBe(measured.shots[0]!.frames[12]);
    // 手入力の値（区間でも未測定）: 全ペレット × 0.75 = 67,500 で 15 トリガー目
    const manual = run();
    expect(manual.schedule!.gaugeFullFrames[0]).toBe(manual.shots[0]!.frames[14]);
    expect(run({ hitRate: 1, measured: false }).schedule!.gaugeFullFrames).toEqual(manual.schedule!.gaugeFullFrames);
  });
});
