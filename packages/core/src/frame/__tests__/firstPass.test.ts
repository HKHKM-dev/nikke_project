// Stage 10: 1 パス目のフレームループ（plan/design-stage10.md 1 節・4 節・8.3 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeCharacter } from '../../__tests__/fixtures.ts';
import {
  DEFAULT_BURST_TIMING,
  initialBurstController,
  reduceCooldown,
  type BurstUnit,
} from '../../burst/controller.ts';
import { planDynamicSchedule } from '../../burst/dynamic.ts';
import { durationToFrames, planFixedCycle } from '../../burst/fixedCycle.ts';
import { MAX_SKILL_LEVELS } from '../../skills/resolve.ts';
import { planBuffTimeline, resolvePassiveStates, type TimelineSlot } from '../../skills/timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../../skills/types.ts';
import type { CharacterData, ShotParams, SkillRaw } from '../../types.ts';
import { runFirstPass } from '../firstPass.ts';
import { planShots } from '../shots.ts';

const FRAMES = durationToFrames(180);

function load(id: number): CharacterData {
  return JSON.parse(
    readFileSync(new URL(`../../../data/characters/${id}.json`, import.meta.url), 'utf8'),
  ) as CharacterData;
}

function loadDefinition(id: number): SkillDefinition {
  return parseSkillDefinition(
    JSON.parse(readFileSync(new URL(`../../../data/skills/${id}.json`, import.meta.url), 'utf8')),
  );
}

function slotOf(character: CharacterData, definition: SkillDefinition | null = null): TimelineSlot {
  return { character, definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 1000 };
}

const tenLevels = (v: string) => Array.from({ length: 10 }, () => v);
const skillRaw = (values: string[]): SkillRaw => ({
  id: 9,
  name: { ja: 'テスト', en: 'Test' },
  description: { ja: '', en: '' },
  values: values.map(tenLevels),
});

/** skill1 に効果を書いた定義（値は skill1 の description_value を ref で引く） */
function defWith(resourceId: number, effects: unknown[]): SkillDefinition {
  const none = { support: 'unsupported', effects: [], notes: [{ ja: '-', en: '-' }] };
  return parseSkillDefinition({
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-09-23',
    skills: { skill1: { support: 'supported', effects }, skill2: none, burst: none },
  });
}

function synthetic(
  resourceId: number,
  burstStep: CharacterData['burstStep'],
  cooldownSeconds: number,
  shot: Partial<ShotParams> = {},
  values: string[] = [],
): CharacterData {
  const base = makeCharacter(shot, { burstStep });
  return {
    ...base,
    resourceId,
    burstSkill: { ...base.burstSkill, cooldownSeconds },
    skills: { ...base.skills, skill1: skillRaw(values) },
  };
}

describe('runFirstPass: degeneration (1.3)', () => {
  const teams: number[][] = [
    [291, 20, 10],
    [291, 20, 870],
    [93, 20],
    [822, 20, 231],
    [60, 20, 290],
    [82, 330, 191],
  ];

  it.each(teams)('matches planShots + planDynamicSchedule without firing / instant effects (%s)', (...ids) => {
    const characters = ids.map(load);
    // 射撃に効く効果の無い定義（またはなし）。常時のゲージ速度（マナ S2）は入れて、時刻表の受け渡しも確かめる
    const slots = characters.map((c) => slotOf(c, c.resourceId === 290 ? loadDefinition(290) : null));
    for (const controlledSlot of [null, 1]) {
      const pass = runFirstPass(slots, { frames: FRAMES, burst: true, controlledSlot });
      const shots = planShots(
        characters.map((character) => ({ character })),
        FRAMES,
      );
      const gaugeSpeed = resolvePassiveStates(slots).map((s) => s?.buffs.burstGaugeSpeed ?? 0);
      const schedule = planDynamicSchedule(
        characters.map((character) => ({ character })),
        FRAMES,
        undefined,
        undefined,
        controlledSlot,
        { shots, gaugeSpeed },
      );
      expect(pass.shots).toEqual(shots);
      expect(pass.schedule).toEqual(schedule);
      expect(pass.instants).toEqual([]);
    }
  });

  it('keeps the fixed cycle and the no-burst case', () => {
    const characters = [291, 20, 10].map(load);
    const slots = characters.map((c) => slotOf(c));
    const fixed = runFirstPass(slots, { frames: FRAMES, burst: true, burstModel: 'fixed' });
    expect(fixed.schedule).toEqual(
      planFixedCycle(
        characters.map((c) => ({ burstStep: c.burstStep })),
        FRAMES,
      ),
    );
    const none = runFirstPass(slots, { frames: FRAMES, burst: false });
    expect(none.schedule).toBeNull();
    expect(none.shots).toEqual(
      planShots(
        characters.map((character) => ({ character })),
        FRAMES,
      ),
    );
  });
});

describe('runFirstPass: firing windows (1.1)', () => {
  // SR をチャージ 0.3 秒（18f + 22f = 40f 間隔）・装弾数 1000（リロードなし）にすると、固定サイクルの発動フレーム 600 に撃つ
  const sr: Partial<ShotParams> = {
    maxAmmo: 1000,
    reloadTime: 1,
    rateOfFire: 60,
    endRateOfFire: 60,
    chargeTime: 0.3,
    inputType: 'UP',
  };

  it('a window opened by a burst at frame f is not seen by the shot at f, only from f + 1', () => {
    const character = synthetic(1, 'Step3', 40, sr, ['100', '5']);
    const def = defWith(1, [
      { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'chargeSpeed', ref: 1, durationRef: 2 },
    ]);
    const pass = runFirstPass([slotOf(character, def)], { frames: 800, burst: true, burstModel: 'fixed' });
    const frames = pass.shots[0]!.frames;
    // 600 の射撃は基礎値（次は 600 + 40）。640 からチャージ 0f（解放遅延 22f だけ）で 662・684…
    expect(frames.filter((f) => f >= 560 && f <= 700)).toEqual([560, 600, 640, 662, 684]);
    expect(pass.firingWindows).toEqual([expect.objectContaining({ sourceSlotIndex: 0, start: 600, end: 800 })]);
  });

  it('a battleStart window is registered before the loop, so the first magazine is already buffed', () => {
    const character = synthetic(1, 'Step3', 40, { maxAmmo: 9, reloadTime: 1, rateOfFire: 90, endRateOfFire: 90 }, [
      '5',
      '30',
    ]);
    const def = defWith(1, [
      {
        kind: 'timed',
        trigger: 'battleStart',
        target: 'self',
        stat: 'maxAmmo',
        scaling: 'flat',
        ref: 1,
        durationRef: 2,
      },
    ]);
    const pass = runFirstPass([slotOf(character, def)], { frames: 1000, burst: false });
    // 14 発撃ってからリロード（最後の弾丸は 14 発目）
    expect(pass.shots[0]!.lastShotFrames![0]).toBe(pass.shots[0]!.frames[13]);
  });

  it('registers the same windows as planBuffTimeline, for burst, full-burst and shot-count triggers', () => {
    const i = synthetic(1, 'Step1', 20, {}, ['45.17', '5', '30', '10']);
    const ii = synthetic(2, 'Step2', 40, {
      maxAmmo: 6,
      reloadTime: 1.5,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
    });
    const iii = synthetic(
      3,
      'Step3',
      40,
      { maxAmmo: 9, reloadTime: 0.5, reloadBullet: 0.33, rateOfFire: 90, endRateOfFire: 90, shotCount: 10 },
      ['5', '10', '72.18'],
    );
    const slots = [
      slotOf(
        i,
        defWith(1, [
          {
            kind: 'timed',
            trigger: { count: 'burstUse', atLeast: 1 },
            target: 'allies',
            stat: 'maxAmmo',
            ref: 1,
            durationRef: 2,
          },
          {
            kind: 'timed',
            trigger: { count: 'normalShot', every: 30 },
            target: 'allies',
            stat: 'reloadSpeed',
            ref: 3,
            durationRef: 4,
          },
        ]),
      ),
      slotOf(ii),
      slotOf(
        iii,
        defWith(3, [
          {
            kind: 'timed',
            trigger: 'fullBurstStart',
            target: 'allies',
            stat: 'maxAmmo',
            scaling: 'flat',
            ref: 1,
            durationRef: 2,
          },
          { kind: 'timed', trigger: 'burstUse', target: 'self', stat: 'maxAmmo', ref: 3, durationRef: 2 },
        ]),
      ),
    ];
    const pass = runFirstPass(slots, { frames: FRAMES, burst: true });
    const timeline = planBuffTimeline(slots, pass.schedule, FRAMES, pass.shots);
    const fromTimeline = new Set(
      timeline.windows.map(
        (w) => `${w.sourceSlotIndex}.${w.effect.source.skill}.${w.effect.effectIndex}:${w.start}-${w.end}`,
      ),
    );
    const fromLoop = new Set(
      pass.firingWindows.map(
        (w) => `${w.sourceSlotIndex}.${w.effect.source.skill}.${w.effect.effectIndex}:${w.start}-${w.end}`,
      ),
    );
    expect(fromLoop.size).toBeGreaterThan(10);
    expect(fromLoop).toEqual(fromTimeline);
    // 射撃の列はバフで変わっている（ドレイク型 III のフルバースト中のマガジンが長い）
    expect(pass.shots[2]!.frames).not.toEqual(planShots([{ character: iii }], FRAMES)[0]!.frames);
  });
});

describe('runFirstPass: cooldown reduction (4)', () => {
  const team = (values: string[], effects: unknown[]): TimelineSlot[] => [
    slotOf(synthetic(1, 'Step1', 20, {}, values), defWith(1, effects)),
    slotOf(synthetic(2, 'Step2', 40)),
    slotOf(synthetic(3, 'Step3', 40)),
  ];
  const liter = [
    { kind: 'cooldownReduction', trigger: { count: 'fullBurstStart', atLeast: 1 }, target: 'allies', ref: 1 },
    { kind: 'cooldownReduction', trigger: { count: 'fullBurstStart', atLeast: 2 }, target: 'allies', ref: 2 },
    { kind: 'cooldownReduction', trigger: { count: 'fullBurstStart', atLeast: 3 }, target: 'allies', ref: 3 },
  ];

  it('applies after the activation of the same frame (the III that just fired is shortened too)', () => {
    const pass = runFirstPass(team(['2.34', '2.7', '3.17'], liter), { frames: FRAMES, burst: true });
    const schedule = pass.schedule!;
    const fb = schedule.fullBurstWindows[0]!.start;
    const iii = schedule.activations.find((a) => a.startsFullBurst)!;
    expect(iii.frame).toBe(fb);
    const atFirst = schedule.cooldownReductions.filter((r) => r.frame === fb);
    expect(atFirst.map((r) => r.slotIndex)).toEqual([0, 1, 2]);
    // 2.34 秒 = 141f（切り上げ）。III は今撃ったばかり（残り 2400f）なので 141f まるまる縮む
    expect(atFirst.every((r) => r.frames === 141 && r.applied === 141)).toBe(true);
  });

  it('stacks the per-count reductions in the same frame, each rounded up separately', () => {
    const pass = runFirstPass(team(['2.34', '2.7', '3.17'], liter), { frames: FRAMES, burst: true });
    const schedule = pass.schedule!;
    const third = schedule.fullBurstWindows[2]!.start;
    const iii = schedule.cooldownReductions.filter((r) => r.frame === third && r.slotIndex === 2);
    expect(iii.map((r) => r.frames)).toEqual([141, 162, 191]);
    expect(pass.instants.filter((x) => x.frame === third && x.slotIndex === 2).map((x) => x.amount)).toEqual([
      141, 162, 191,
    ]);
  });

  it('brings the next full burst forward (the II / III cooldowns are the bottleneck)', () => {
    const withCt = runFirstPass(team(['2.34', '2.7', '3.17'], liter), { frames: FRAMES, burst: true }).schedule!;
    const without = runFirstPass(team(['0', '0', '0'], liter), { frames: FRAMES, burst: true }).schedule!;
    const starts = (s: typeof withCt) => s.fullBurstWindows.map((w) => w.start);
    expect(starts(withCt)[0]).toBe(starts(without)[0]);
    // この編成では I（CT 20 秒）がゲージ満タンのたびに撃ち、II が明けずにチェーンが切れる（600f）のを繰り返すので、
    // 早まる量は CT 短縮の量そのものではなく、チェーンの切れ目の位相で決まる
    expect(starts(withCt)[1]!).toBeLessThan(starts(without)[1]!);
    expect(starts(withCt)[2]! - starts(withCt)[1]!).toBeLessThan(starts(without)[2]! - starts(without)[1]!);
  });

  it('never moves a finished cooldown or one into the past, and is order independent', () => {
    const units: BurstUnit[] = [{ burstStep: 'Step1', nextStep: 'Step2', cooldownFrames: 1200 }, null];
    const state = initialBurstController(units, DEFAULT_BURST_TIMING);
    // 戦闘開始時は CT が明けている（cooldownEnd = 0）
    reduceCooldown(state, 0, 141, 50, 0);
    expect(state.cooldownEnd[0]).toBe(0);
    expect(state.cooldownReductions[0]).toMatchObject({ applied: 0 });
    state.cooldownEnd[0] = 400;
    reduceCooldown(state, 0, 141, 300, 0);
    reduceCooldown(state, 0, 141, 300, 0);
    // 400 − 282 = 118 < 300 → 300 で止める（過去に戻さない）
    expect(state.cooldownEnd[0]).toBe(300);
    expect(state.cooldownReductions.slice(1).map((r) => r.applied)).toEqual([100, 0]);
    // 空枠は何もしない
    reduceCooldown(state, 1, 141, 300, 0);
    expect(state.cooldownReductions).toHaveLength(3);
  });

  it('does nothing on the fixed cycle and without bursts', () => {
    const fixed = runFirstPass(team(['2.34', '2.7', '3.17'], liter), {
      frames: FRAMES,
      burst: true,
      burstModel: 'fixed',
    });
    expect(fixed.schedule!.cooldownReductions).toEqual([]);
    expect(fixed.instants).toEqual([]);
  });
});

describe('runFirstPass: ammo refill', () => {
  it('uses the max ammo raised in the same frame (recording 19: 9 → 14 at the full burst start)', () => {
    const noirLike = synthetic(
      3,
      'Step3',
      40,
      { maxAmmo: 9, reloadTime: 0.23, reloadBullet: 0.33, rateOfFire: 90, endRateOfFire: 90 },
      ['5', '10', '39.88'],
    );
    const slots = [
      slotOf(synthetic(1, 'Step1', 20)),
      slotOf(synthetic(2, 'Step2', 20)),
      slotOf(
        noirLike,
        defWith(3, [
          {
            kind: 'timed',
            trigger: 'fullBurstStart',
            target: 'allies',
            stat: 'maxAmmo',
            scaling: 'flat',
            ref: 1,
            durationRef: 2,
          },
          { kind: 'ammoRefill', trigger: 'fullBurstStart', target: 'allies', ref: 3 },
        ]),
      ),
    ];
    const pass = runFirstPass(slots, { frames: FRAMES, burst: true });
    const fb = pass.schedule!.fullBurstWindows[0]!.start;
    const refills = pass.instants.filter((x) => x.frame === fb && x.effect.kind === 'ammoRefill');
    expect(refills).toHaveLength(3);
    // ノワール型: floor(14 × 0.3988) = 5 を足して最大 14 で止める。AR（60 + 5 発）は floor(65 × 0.3988) = 25 まで
    const byslot = (i: number) => refills.find((x) => x.slotIndex === i)!.amount;
    expect(byslot(2)).toBeGreaterThanOrEqual(0);
    expect(byslot(2)).toBeLessThanOrEqual(5);
    expect(byslot(0)).toBeLessThanOrEqual(25);
  });
});
