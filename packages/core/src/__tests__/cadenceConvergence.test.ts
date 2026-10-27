// 共通のフレームループの射手（frame/shooter.ts）と、平均レートの閉じた式（cadence.ts。2026-09-22 の射撃場の録画で較正）の
// 独立した検算（plan/design-unify-sim-calc.md 5.4 節）。通常攻撃をグループごとに「平均レート × 秒数」で置いた合計
// （2026-10-27 までの calc の 'average' の経路と同じ値。averageRateTotal）と、射撃の列から数えた sim の値を比べる:
//   1. 離散化誤差の上限（グループのトリガー数は「1 マガジン × 区間数」以内、枠 5%・編成 3%）
//   2. 長時間での収束（18,000 秒で 0.5% 未満）
// あわせて、同じ編成で時刻表・区間・バフの載り方（Stage 5〜7・13）と、画面の形（simTeamResult）への写し方を見る。
// 2026-10-27 までの sim と calc の厳密一致の段は、一本化で同じ計算どうしの比べになったので外した
// （plan/design-workflow-simplification-4.md 1 節）。
import { describe, expect, it } from 'vitest';
import { slotPieces } from './historyHelpers.ts';
import type { BuildEffect } from '../buildEffects.ts';
import { slotsByStep, type BurstScheduleModel } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { runSimulation, simGroupTotals, simIntervalTotals } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { SkillDefinition, TimedEffect } from '../skills/types.ts';
import { type SlotCondition, type TeamInput, type TeamSlotInput, type TeamSlotResult } from '../team.ts';
import type { BurstStep, ShotParams, SkillRaw } from '../types.ts';
import { framesToGameSeconds, gameSecondsToFrames } from '../time.ts';
import { FIXED_BURST_CYCLE } from '../burst/fixedCycle.ts';

const H = FIXED_BURST_CYCLE.normalFrames;
import { makeCharacter } from './fixtures.ts';

/**
 * 18,000 秒（5 時間）を sim で回す収束のテストの制限時間。単独でも 2〜4 秒かかり、CI でほかのテスト（vite build を回す
 * check-pages-build.test.ts など）と並ぶと既定の 5 秒を超えることがあった（2026-09-24、6.5 秒）ので、長めに取る
 */
const LONG_SIM_TIMEOUT_MS = 60_000;

const enemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
const condition: SlotCondition = { coreHitRate: 0.6, distanceBonus: true, fullCharge: true };
const growth = { level: 1, grade: 0, core: 0 };
const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const empty: SkillRaw = { id: 0, name: { ja: '', en: '' }, description: { ja: '', en: '' }, values: [] };

function slot(
  resourceId: number,
  shot: Partial<ShotParams>,
  burstStep: BurstStep,
  burstPercent: string | null,
  passiveAttackPercent: string | null = null,
  timedEffect: TimedEffect | null = null,
): TeamSlotInput {
  const skill1: SkillRaw = {
    ...empty,
    id: resourceId * 10 + 1,
    values: passiveAttackPercent ? [tenLevels(passiveAttackPercent)] : [],
  };
  // burst の values: [1] = バースト倍率、[2] = 持続バフの比率 40%、[3] = 維持秒数 10
  const burst: SkillRaw = {
    ...empty,
    id: resourceId * 10 + 3,
    values: burstPercent ? [tenLevels(burstPercent), tenLevels('40'), tenLevels('10')] : [],
  };
  const character = makeCharacter(shot, { resourceId, burstStep, skills: { skill1, skill2: empty, burst } });
  const definition: SkillDefinition = {
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-22',
    skills: {
      skill1: passiveAttackPercent
        ? { support: 'supported', effects: [{ kind: 'passive', target: 'allies', stat: 'attack', ref: 1 }] }
        : { support: 'unsupported', effects: [] },
      skill2: { support: 'unsupported', effects: [] },
      burst: burstPercent
        ? {
            support: 'supported',
            effects: timedEffect
              ? [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }, timedEffect]
              : [{ kind: 'burstDamage', ref: 1, damageType: 'skill' }],
          }
        : { support: 'unsupported', effects: [] },
    },
  };
  return { character, growth, condition, skills: { definition, levels: MAX_SKILL_LEVELS } };
}

// AR / SMG / SR / RL / MG の 5 体。I は SMG、II は RL、III は AR（バーストスキルあり）。SR が味方全体に攻撃力 +10%
const team: TeamSlotInput[] = [
  slot(1, {}, 'Step3', '351.64'),
  slot(2, { maxAmmo: 120, rateOfFire: 1440, endRateOfFire: 1440, damage: 500 }, 'Step1', null),
  slot(
    3,
    {
      maxAmmo: 6,
      reloadTime: 1.5,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
      damage: 6000,
      fullChargeDamage: 2.5,
    },
    'Step3',
    '0200',
    '10',
  ),
  slot(
    4,
    {
      maxAmmo: 6,
      reloadTime: 2,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1.5,
      inputType: 'UP',
      damage: 6130,
      fullChargeDamage: 3.5,
    },
    'Step2',
    '0150',
  ),
  slot(
    5,
    { maxAmmo: 300, reloadTime: 2.5, rateOfFire: 60, endRateOfFire: 3600, rateOfFireChangePerShot: 100, damage: 557 },
    'AllStep',
    null,
  ),
];

/**
 * 平均レートの検算の基準: 通常攻撃をグループごとに「常時分の平均レート（cadence）× 秒数 × 1 トリガーの値」で置いた枠の合計
 * （バーストスキルと倍率ダメージは同じ値）。射撃に効く持続バフの無い編成でだけ意味がある（cadence は常時分の射撃バフまで）
 */
function averageRateTotal(c: TeamSlotResult): number {
  const normal = c.segments.reduce((a, g) => a + c.cadence.triggersPerSecond * g.seconds * g.trigger.perTrigger, 0);
  return normal + c.burst.totalDamage + c.skillHits.totalDamage;
}

const relDiff = (a: number, b: number) => Math.abs(a - b) / b;

type Run = { sim: ReturnType<typeof runSimulation>; result: ReturnType<typeof simTeamResult> };

/** 編成の合計の、平均レートで置いた合計との相対差 */
function averageRateDiff({ sim, result }: Run): number {
  const averageTotal = result.slots.reduce((a, c) => a + (c === null ? 0 : averageRateTotal(c)), 0);
  return relDiff(sim.totalDamage, averageTotal);
}

/** 平均レートとの差が、編成 3%・枠 5%・グループのトリガー数は「1 マガジン × そのグループに含まれる区間数」以内 */
function expectWithinAverageRate(run: Run, slotCount: number) {
  const { sim, result } = run;
  expect(averageRateDiff(run)).toBeLessThan(0.03);
  for (let i = 0; i < slotCount; i++) {
    const s = sim.slots[i]!;
    const c = result.slots[i]!;
    expect(relDiff(s.totalDamage, averageRateTotal(c)), `slot ${i}`).toBeLessThan(0.05);
    const groups = simGroupTotals(sim, i);
    c.segments.forEach((g, j) => {
      const bound = s.character.shot.maxAmmo * g.ranges.length;
      const average = c.cadence.triggersPerSecond * g.seconds;
      expect(Math.abs(groups[j]!.triggers - average), `slot ${i} group ${j}`).toBeLessThanOrEqual(bound);
    });
  }
}

/** sim を 1 回回し、画面の形（グループ・平均レート）も添える */
function run(input: TeamInput) {
  const sim = runSimulation(input);
  return { sim, result: simTeamResult(input, sim) };
}

// Stage 5 / 6 のテストは固定 20 秒サイクルで書いてある（Stage 7 の退化テストを兼ねる）。動的サイクルは末尾の Stage 7 節
function both(durationSeconds: number, burst: boolean, burstModel: BurstScheduleModel = 'fixed') {
  return run({ slots: team, enemy, durationSeconds, burst, burstModel });
}

describe('時刻表・区間・1 トリガーの値（Stage 5）', () => {
  const { sim, result } = both(180, true);

  it('splits the battle into normal and Full Burst groups with the passive buffs only', () => {
    expect(result.schedule && slotsByStep(result.schedule)).toEqual({ Step1: [1], Step2: [3], Step3: [0] });
    for (let i = 0; i < team.length; i++) {
      const c = result.slots[i]!;
      // 持続バフがないので区間は「通常 / フルバースト」の 2 グループに退化する
      expect(c.segments.map((g) => g.fullBurst)).toEqual([false, true]);
      // Stage 21-B: 通常 9H + 5f（180 秒は 10,589f。V-0086）、フルバースト 9H（H = 588f）
      expect(c.segments[0]!.seconds).toBeCloseTo(framesToGameSeconds(9 * H + 5), 9);
      expect(c.segments[1]!.seconds).toBeCloseTo(framesToGameSeconds(9 * H), 9);
      for (const g of c.segments) expect(g.buffs).toEqual(c.passiveBuffs);
      expect(c.segments[1]!.trigger.boost.fullBurst).toBe(0.5);
      expect(c.segments[0]!.trigger.boost.fullBurst).toBe(0);
      expect(sim.slots[i]!.segments.map((seg) => seg.trigger.perTrigger)).toEqual(
        sim.timeline.segments.map((seg) => c.segments[seg.fullBurst ? 1 : 0]!.trigger.perTrigger),
      );
    }
  });

  it('fires the burst skills of the chain only', () => {
    expect(result.slots[0]?.burst.activations).toHaveLength(9);
    expect(result.slots[3]?.burst.activations).toHaveLength(9);
    expect(result.slots[2]?.burst.activations).toHaveLength(0); // III の 2 体目は撃たない
    expect(result.slots[1]?.burst.hit).toBeNull();
  });
});

describe('frame loop vs average rate: discretization error bounds', () => {
  it('without burst, trigger counts differ from rate × seconds by less than one magazine per slot', () => {
    const { sim, result } = both(180, false);
    for (let i = 0; i < team.length; i++) {
      const s = sim.slots[i]!;
      const c = result.slots[i]!;
      const expected = c.cadence.triggersPerSecond * 180;
      expect(Math.abs(simIntervalTotals(s).nonFullBurst.triggers - expected)).toBeLessThanOrEqual(
        s.character.shot.maxAmmo,
      );
      expect(relDiff(s.totalDamage, averageRateTotal(c))).toBeLessThan(0.03);
    }
  });

  it('with burst, the 5-slot totals agree within 3% and every slot within 5%', () => {
    expectWithinAverageRate(both(180, true), team.length);
  });
});

describe('frame loop vs average rate: convergence', () => {
  it(
    'the relative difference shrinks as the battle gets longer and is below 0.5% at 18,000 s',
    () => {
      const diffs = [180, 1800, 18000].map((d) => averageRateDiff(both(d, true)));
      expect(diffs[2]).toBeLessThan(0.005);
      expect(diffs[2]).toBeLessThanOrEqual(diffs[0]! + 1e-12);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// ---- Stage 6: 持続バフを載せた編成 ----

// III（AR）が自分に攻撃力 +40%（10 秒）、II（RL）が味方全体に +40%（10 秒）を配る
const selfBuff: TimedEffect = {
  kind: 'timed',
  trigger: 'burstUse',
  target: 'self',
  stat: 'attack',
  ref: 2,
  durationRef: 3,
};
const alliesBuff: TimedEffect = { ...selfBuff, target: 'allies', trigger: 'fullBurstStart' };
const timedTeam: TeamSlotInput[] = [
  slot(1, {}, 'Step3', '351.64', null, selfBuff),
  team[1]!,
  team[2]!,
  slot(
    4,
    {
      maxAmmo: 6,
      reloadTime: 2,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1.5,
      inputType: 'UP',
      damage: 6130,
      fullChargeDamage: 3.5,
    },
    'Step2',
    '0150',
    null,
    alliesBuff,
  ),
  team[4]!,
];

function bothTimed(durationSeconds: number, burst = true, burstModel: BurstScheduleModel = 'fixed') {
  return run({ slots: timedTeam, enemy, durationSeconds, burst, burstModel });
}

describe('持続バフの区間（Stage 6）', () => {
  const { sim, result } = bothTimed(180);

  it('splits into 19 segments and 2 buff states', () => {
    // 10 秒バフの窓はフルバースト窓と重なるので、区間は 19 個（9 サイクルの後に 4f の通常区間）・バフ状態は 2 通り
    expect(sim.timeline.segments).toHaveLength(19);
    for (let i = 0; i < timedTeam.length; i++) {
      const c = result.slots[i]!;
      expect(c.segments).toHaveLength(2);
      expect(c.segments.map((g) => g.fullBurst)).toEqual([false, true]);
      // Stage 21-B: 通常 9H + 5f（180 秒は 10,589f。V-0086）、フルバースト 9H（H = 588f）
      expect(c.segments[0]!.seconds).toBeCloseTo(framesToGameSeconds(9 * H + 5), 9);
      expect(c.segments[1]!.seconds).toBeCloseTo(framesToGameSeconds(9 * H), 9);
    }
  });

  it('put the buffs on the right slots', () => {
    // 枠 0 は自分の +40% だけ、枠 3 の allies は全枠に掛かる
    const fb = result.slots[0]!.segments[1]!;
    expect(fb.buffs.attackRatio).toBeCloseTo(0.4 + 0.4 + 0.1, 12); // self + allies + SR の常時 +10%
    expect(result.slots[0]!.segments[0]!.buffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(result.slots[1]!.segments[1]!.buffs.attackRatio).toBeCloseTo(0.4 + 0.1, 12);
    expect(result.slots[1]!.segments[0]!.buffs.attackRatio).toBeCloseTo(0.1, 12);
    expect(slotPieces(result, 0)).toHaveLength(18); // self 9 + allies 9
    expect(slotPieces(result, 1)).toHaveLength(9);
  });

  it('give a bigger total than the same team without the timed buffs', () => {
    expect(result.totalDamage).toBeGreaterThan(both(180, true).result.totalDamage);
  });
});

describe('frame loop vs average rate with timed buffs: discretization error bounds', () => {
  it('stays within one magazine per segment and 5% / 3% on the totals', () => {
    expectWithinAverageRate(bothTimed(180), timedTeam.length);
  });

  it(
    'converges below 0.5% at 18,000 s',
    () => {
      expect(averageRateDiff(bothTimed(18000))).toBeLessThan(0.005);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// ---- Stage 7: 動的サイクル（ゲージ蓄積・CT・チェーン） ----

describe('動的サイクル（Stage 7）', () => {
  const { result } = bothTimed(180, true, 'dynamic');

  it('bursts fewer times than the fixed 20 s cycle (every nike here has a 40 s cooldown)', () => {
    expect(result.schedule?.model).toBe('dynamic');
    const fixed = bothTimed(180).result;
    expect(fixed.burstSummary?.fullBursts).toBe(9);
    expect(result.burstSummary?.fullBursts).toBeLessThan(9);
    // CT 40 秒 = 2,352f（切り捨て）= 39.984 秒
    expect(result.burstSummary?.meanCycleSeconds).toBeGreaterThanOrEqual(framesToGameSeconds(gameSecondsToFrames(40)));
    // フルバーストは III が撃ったフレームの 6f 後（III のタイマーの 00.00。plan/design-burst-hit-origin.md 8 節）から始まる
    for (const w of result.schedule!.fullBurstWindows) {
      expect(result.schedule!.activations.some((a) => a.startsFullBurst && a.frame + 6 === w.start)).toBe(true);
    }
  });
});

describe('frame loop vs average rate on the dynamic cycle: discretization error bounds', () => {
  it('stays within one magazine per segment and 5% / 3% on the totals', () => {
    expectWithinAverageRate(bothTimed(180, true, 'dynamic'), timedTeam.length);
  });

  it(
    'converges below 0.5% at 18,000 s',
    () => {
      expect(averageRateDiff(bothTimed(18000, true, 'dynamic'))).toBeLessThan(0.005);
    },
    LONG_SIM_TIMEOUT_MS,
  );
});

// Stage 13: 育成入力の効果層（OL・キューブ・コレクション）を付けた編成（plan/design-stage12.md 3.4 節）。
// 常時バフの合成だけなので、区間・1 トリガー値は厳密一致し、平均レート（常時分の射撃バフ込み）との差は離散化だけ
const effect = (stat: BuildEffect['stat'], value: number): BuildEffect => ({
  source: { kind: 'overload', name: { ja: '', en: '' }, level: 15 },
  stat,
  value,
});
const buildTeam: TeamSlotInput[] = team.map((s, i) => ({
  ...s,
  buildEffects: [
    // AR: 攻撃力・有利コード・クリダメ・コアダメ（コレクション）
    [
      effect('attack', 0.1463),
      effect('elementDamage', 0.2916),
      effect('critDamage', 0.2036),
      effect('coreDamage', 0.1704),
    ],
    // SMG: 通常攻撃ダメージ倍率（コレクション）・リロード速度（キューブ）
    [effect('normalAttackDamage', 0.0946), effect('reloadSpeed', 0.2969)],
    // SR: チャージダメ・チャージ速度・最大装弾数
    [effect('chargeDamage', 0.0947), effect('chargeSpeed', 0.0604), effect('maxAmmo', 0.8537)],
    // RL: クリ率・命中率（状態だけ）
    [effect('critRate', 0.0707), effect('hitRate', 0.1463)],
    // MG: バーストゲージのチャージ速度（クオンタム）・最大装弾数
    [effect('burstGaugeSpeed', 0.0466), effect('maxAmmo', 0.095)],
  ][i]!,
}));

describe('育成入力の効果層（Stage 13）', () => {
  const input = { slots: buildTeam, enemy, durationSeconds: 180, burst: true, burstModel: 'dynamic' as const };
  const built = run(input);

  it('passes the build effects through to the result', () => {
    for (let i = 0; i < buildTeam.length; i++) {
      expect(built.result.slots[i]!.buildEffects).toBe(buildTeam[i]!.buildEffects);
    }
  });

  it('stays within 5% per slot and 3% on the total of the average rate, and beats the same team without effects', () => {
    expect(averageRateDiff(built)).toBeLessThan(0.03);
    for (let i = 0; i < buildTeam.length; i++) {
      const s = built.sim.slots[i]!;
      const c = built.result.slots[i]!;
      expect(relDiff(s.totalDamage, averageRateTotal(c)), `slot ${i}`).toBeLessThan(0.05);
    }
    expect(built.result.totalDamage).toBeGreaterThan(run({ ...input, slots: team }).result.totalDamage);
  });
});

// Stage 16（plan/design-stage16.md 3 節 16-A）: 画面は sim の結果を TeamResult の形で出す
describe('simTeamResult: sim in the TeamResult shape', () => {
  const { sim, result: view } = both(180, true);

  it('keeps the sim totals', () => {
    expect(view.totalDamage).toBe(sim.totalDamage);
    expect(view.totalDps).toBeCloseTo(sim.totalDamage / 180, 6);
    expect(view.filledCount).toBe(team.length);
    for (let i = 0; i < team.length; i++) {
      const v = view.slots[i]!;
      const s = sim.slots[i]!;
      expect(v.totalDamage).toBe(s.totalDamage);
      expect(v.normalDamage).toBe(s.normalDamage);
      expect(v.passiveBuffs).toEqual(s.passiveBuffs);
      expect(v.segments.reduce((sum, g) => sum + g.damage, 0)).toBeCloseTo(s.normalDamage, 6);
      expect(v.segments.map((g) => g.triggers)).toEqual(simGroupTotals(sim, i).map((g) => g.triggers));
      expect(v.segments.every((g) => g.triggerSource === 'shots')).toBe(true);
      expect(v.burst.activations.map((a) => a.seconds)).toEqual(s.burst.activations.map((f) => framesToGameSeconds(f)));
      expect(v.burst.totalDamage).toBeCloseTo(s.burst.damage, 6);
    }
  });
});
