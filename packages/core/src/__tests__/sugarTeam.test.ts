// シュガー（140）を含む編成（plan/design-sugar.md。V-0704）。録画 1004〜1006 と同じ、ココア（I）+ ソルジャーF.A.（II・鉄甲の SG）+
// シュガー（III）で:
// 宝物版 S1: 常時の攻撃ダメージ▲と、灼熱の敵への有利コードのダメージ適用（灼熱の敵のときだけ）。
// S2: フルバーストの開始から、自分にクリティカル確率▲・攻撃力▲（10 秒）、SG の味方に最大装弾数▲・鉄甲の SG の味方に有利コードの攻撃ダメージ▲
// （15 秒）。バースト: 使うたびに自分に攻撃速度▲・命中率▲・攻撃力▲、鉄甲の SG の味方に有利コードの攻撃ダメージ▲（15 秒）。
// 基礎版は宝物版の部分集合（S1 は効果なし、S2 の最大装弾数▲は 10 秒）。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput } from '../team.ts';
import type { Element } from '../types.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  readJson,
  SHOOTING_RANGE_ENEMY,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const SUGAR = 140;
const COCOA = 311;
const SOLDIER_FA = 301;
const SUGAR_SLOT = 2;
const FA_SLOT = 1;

function team(ids: readonly number[], controlled: number, element: Element, treasurePhase: TreasurePhase): TeamInput {
  const input = fixedTeam(ids, controlled, { enemy: { ...SHOOTING_RANGE_ENEMY, element } });
  for (const slot of input.slots)
    if (slot?.character.resourceId === SUGAR && slot.skills !== undefined) slot.skills.treasurePhase = treasurePhase;
  return input;
}

const TEAMS = {
  '単騎（宝物版・灼熱）': team([SUGAR], 0, 'Fire', 3),
  'ココア + ソルジャーF.A. + シュガー（宝物版・灼熱）': team([COCOA, SOLDIER_FA, SUGAR], SUGAR_SLOT, 'Fire', 3),
  'ココア + ソルジャーF.A. + シュガー（宝物版・電撃）': team([COCOA, SOLDIER_FA, SUGAR], SUGAR_SLOT, 'Electronic', 3),
  'ココア + ソルジャーF.A. + シュガー（基礎版・灼熱）': team([COCOA, SOLDIER_FA, SUGAR], SUGAR_SLOT, 'Fire', 0),
};

describe.each([
  ['宝物版', 3],
  ['基礎版', 0],
] as const)('ココア + ソルジャーF.A. + シュガー（%s）', (_label, phase) => {
  const input = TEAMS[`ココア + ソルジャーF.A. + シュガー（${_label}・灼熱）`];
  const plan = planTeamRun(input);
  const uses = activationFramesOfSlot(plan.schedule!, SUGAR_SLOT);
  const fullBursts = plan.schedule!.fullBurstWindows.map((w) => w.start);
  const windows = (slot: number, skill: string, stat: string) =>
    effectWindows(plan, slot, { resourceId: SUGAR, skill, stat });

  it('gives herself crit rate for 10 s and SG allies max ammo from every Full Burst (S2)', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    expect(windows(SUGAR_SLOT, 'skill2', 'critRate')).toEqual(windowsFrom(fullBursts, 10, plan.frames));
    const ammoSeconds = phase === 3 ? 15 : 10;
    for (const slot of [FA_SLOT, SUGAR_SLOT])
      expect(windows(slot, 'skill2', 'maxAmmo')).toEqual(windowsFrom(fullBursts, ammoSeconds, plan.frames));
    // ココアは SR なので付かない
    expect(windows(0, 'skill2', 'maxAmmo')).toEqual([]);
  });

  it('shortens her shot interval inside the attack speed window', () => {
    const frames = plan.shots[SUGAR_SLOT]!.frames;
    const [inside] = windowsFrom(uses, 15, plan.frames);
    const gaps = (from: number, to: number) =>
      frames
        .slice(1)
        .map((f, i) => ({ f, gap: f - frames[i]! }))
        .filter(({ f }) => f > from && f < to)
        .map(({ gap }) => gap);
    // 90 rpm の 40f（蓄積の端数で 39・40f）は、攻撃速度 66%▲ で 40 ÷ 1.66 ≈ 24f（C-0600 の式）。リロードの空きを除いて最小の間で見る
    expect(Math.min(...gaps(0, uses[0]!))).toBeGreaterThanOrEqual(39);
    expect(Math.min(...gaps(inside!.start + 60, inside!.end))).toBeLessThanOrEqual(25);
  });

  if (phase === 3) {
    it('gives herself attack (S2 10 s, burst 15 s) and Iron SG allies elemental advantage damage (15 s)', () => {
      expect(windows(SUGAR_SLOT, 'skill2', 'attack')).toEqual(windowsFrom(fullBursts, 10, plan.frames));
      expect(windows(SUGAR_SLOT, 'burst', 'attack')).toEqual(windowsFrom(uses, 15, plan.frames));
      for (const slot of [FA_SLOT, SUGAR_SLOT]) {
        expect(windows(slot, 'skill2', 'elementDamage')).toEqual(windowsFrom(fullBursts, 15, plan.frames));
        expect(windows(slot, 'burst', 'elementDamage')).toEqual(windowsFrom(uses, 15, plan.frames));
      }
      expect(windows(0, 'skill2', 'elementDamage')).toEqual([]);
    });
  } else {
    it('has none of the treasure-only effects', () => {
      for (const [skill, stat] of [
        ['skill2', 'attack'],
        ['skill2', 'elementDamage'],
        ['burst', 'attack'],
        ['burst', 'elementDamage'],
      ] as const)
        for (const slot of [FA_SLOT, SUGAR_SLOT]) expect(windows(slot, skill, stat)).toEqual([]);
    });
  }
});

describe.each([
  ['Fire', true],
  ['Electronic', false],
] as const)('宝物版 S1（敵 %s）', (element, forced) => {
  const input = TEAMS[`ココア + ソルジャーF.A. + シュガー（宝物版・${element === 'Fire' ? '灼熱' : '電撃'}）`];
  const plan = planTeamRun(input);

  it('raises her attack damage for the whole battle and forces the advantage only against Fire', () => {
    // 宝物版 S1 の値 07（Lv10）
    const treasureValue = Number(characterOf(SUGAR).treasure!.skills.skill1.values[6]![9]) / 100;
    expect(treasureValue).toBeGreaterThan(0);
    for (const segment of plan.timeline.segments) {
      const sugar = segment.slots[SUGAR_SLOT]!;
      expect(sugar.buffs.attackDamage).toBeCloseTo(treasureValue, 12);
      expect(sugar.buffs.elementAdvantage > 0).toBe(forced);
      // ソルジャーF.A. には付かない
      expect(segment.slots[FA_SLOT]!.buffs.elementAdvantage).toBe(0);
    }
  });
});

// バーストの命中率▲は区間の状態でなく、条件が自動の枠の着地点の命中率に入る（frame/landing.ts）。録画と同じ射撃場の的で、
// 平均の命中率▲が自分にだけ乗ることを見る
describe('バーストの命中率▲（射撃場の的・条件は自動）', () => {
  const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
  const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
  const input = team([COCOA, SOLDIER_FA, SUGAR], SUGAR_SLOT, 'Fire', 3);
  input.enemy = {
    ...input.enemy,
    events: enemyEventsOf(master, ['range-3min-jump'], 180),
    target: profile,
    landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
  };
  for (const slot of input.slots) if (slot !== null) slot.conditionMode = 'auto';
  const result = simTeamResult(input, runSimulation(input));

  it('raises only her own hit rate, inside her burst windows', () => {
    const hitRate = skillValueOf(SUGAR, 'burst', 3) / 100;
    const up = result.slots[SUGAR_SLOT]!.autoCondition!.hitRateUp;
    // 発数で重みを付けた平均なので、窓の外の発の分だけ値より小さい
    expect(up).toBeGreaterThan(0);
    expect(up).toBeLessThan(hitRate);
    expect(result.slots[FA_SLOT]!.autoCondition!.hitRateUp).toBe(0);
  });
});

describeEveryShotInOneGroup(TEAMS);
