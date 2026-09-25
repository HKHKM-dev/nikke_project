// Stage 16-B: 敵の出来事（狙えない窓 = 射撃場 3 分モードの的のジャンプ）。plan/design-stage16.md 9 節。
//   1. プリセットの出来事のセットと、周期の展開・フレームの窓
//   2. 射手: ハイド中のリロード（間に合えば満タン・間に合わなければ取り消し）、撃ち直し（MG のレートは最初から、チャージはし直し）
//   3. バースト: 狙えない間はオートバーストが発動しない
//   4. 編成: 出来事なしは今と同じ、ありなら calc と sim の両方に効く（どちらも射撃の列を数えるので通常攻撃は一致する）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialBurstController, stepBurstController, type BurstUnit } from '../burst/controller.ts';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyEvent, EnemyInput } from '../damage.ts';
import { enemyEventsOf, expandEnemyEvents, parseEnemyPresets } from '../enemies.ts';
import { enemyEventNotes, untargetableRanges } from '../frame/events.ts';
import { hideShooter, initialShooter, stepShooter, unhideShooter } from '../frame/shooter.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import type { FrameRange } from '../skills/timeline.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { ShotParams } from '../types.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import { makeCharacter } from './fixtures.ts';

const master = parseEnemyPresets(
  JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as unknown,
);

describe('出来事のセット（data/enemies.json）', () => {
  it('has the 3-minute-mode jump on every shooting-range preset', () => {
    expect(master.eventSets.map((s) => s.id)).toEqual(['range-3min-jump']);
    for (const e of master.enemies.filter((p) => p.content === 'range'))
      expect(e.eventSets).toEqual(['range-3min-jump']);
    expect(master.eventSets[0]!.events).toEqual([{ kind: 'untargetable', first: 31, duration: 2, every: 36.4 }]);
  });

  it('expands to 5 jumps in 180 seconds (recording 41 had 5, at 32.2 / 68.6 / 103.8 / 140.5 / 174.1 s)', () => {
    const events = enemyEventsOf(master, ['range-3min-jump'], 180);
    expect(events.map((e) => e.start.toFixed(1))).toEqual(['31.0', '67.4', '103.8', '140.2', '176.6']);
    expect(events.every((e) => e.kind === 'untargetable')).toBe(true);
    expect(events[4]!.end).toBeCloseTo(178.6, 9);
    expect(enemyEventsOf(master, [], 180)).toEqual([]);
  });

  it('cuts at the battle duration and repeats only with every', () => {
    expect(expandEnemyEvents([{ kind: 'untargetable', first: 10, duration: 5 }], 60)).toEqual([
      { kind: 'untargetable', start: 10, end: 15 },
    ]);
    expect(expandEnemyEvents([{ kind: 'barrier', first: 10, duration: 5, every: 20 }], 32)).toEqual([
      { kind: 'barrier', start: 10, end: 15 },
      { kind: 'barrier', start: 30, end: 32 },
    ]);
  });

  it('rejects malformed event sets and unknown references', () => {
    const base = master.enemies[0]!;
    const set = master.eventSets[0]!;
    const parse =
      (eventSets: unknown[], enemies: unknown[] = [base]) =>
      () =>
        parseEnemyPresets({ formatVersion: 1, source: '', eventSets, enemies });
    expect(parse([])).toThrow(/unknown event set/);
    expect(parse([set, set])).toThrow(/duplicate event set/);
    expect(parse([{ ...set, events: [{ kind: 'untargetable', first: 0, duration: 3, every: 2 }] }])).toThrow(/every/);
    expect(parse([{ ...set, events: [{ kind: 'stun', first: 0, duration: 3 }] }])).toThrow(/kind/);
    expect(parse([{ ...set, events: [] }])).toThrow(/non-empty/);
  });
});

describe('untargetableRanges', () => {
  it('rounds seconds to frames, merges overlaps, clips to the battle and ignores the other kinds', () => {
    const events: EnemyEvent[] = [
      { kind: 'untargetable', start: 2, end: 3 },
      { kind: 'invulnerable', start: 0, end: 10 },
      { kind: 'untargetable', start: 2.5, end: 4 },
      { kind: 'untargetable', start: 9, end: 20 },
    ];
    expect(untargetableRanges(events, 600)).toEqual([
      { start: 120, end: 240 },
      { start: 540, end: 600 },
    ]);
    expect(untargetableRanges(undefined, 600)).toEqual([]);
  });
});

/** 射手を frames フレーム回し、窓の出入りで hide / unhide を呼ぶ（frame/firstPass.ts の手順 1 と同じ順） */
function shotsWithWindow(partial: Partial<ShotParams>, window: FrameRange, frames: number): number[] {
  const shot = makeCharacter(partial).shot;
  const state = initialShooter(shot);
  const fired: number[] = [];
  for (let f = 0; f < frames; f++) {
    const blocked = window.start <= f && f < window.end;
    if (f === window.start) hideShooter(state, shot);
    if (f === window.end) unhideShooter(state, shot, window.end - window.start);
    if (stepShooter(state, shot, DEFAULT_WEAPON_MODEL, undefined, blocked)) fired.push(f);
  }
  return fired;
}

const range = (from: number, to: number, step: number) =>
  Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

describe('射手（ハイドとリロード）', () => {
  it('AR (reload 1 s < 2 s jump): reloads while hiding and resumes with a full magazine at the end of the window', () => {
    // 0…95 で 20 発（残弾 40）→ 100 でハイドしてリロード（160 で満タン）→ 220 で撃ち直し、60 発撃って 575 に次のマガジン
    const fired = shotsWithWindow({}, { start: 100, end: 220 }, 600);
    expect(fired).toEqual([...range(0, 95, 5), ...range(220, 515, 5), 575, 580, 585, 590, 595]);
  });

  it('MG (reload 2.5 s > 2 s jump): the reload is cancelled and the spin-up starts over', () => {
    const mg: Partial<ShotParams> = {
      maxAmmo: 300,
      reloadTime: 2.5,
      rateOfFire: 60,
      endRateOfFire: 3600,
      rateOfFireChangePerShot: 100,
      rateOfFireResetTime: 1,
    };
    const fired = shotsWithWindow(mg, { start: 200, end: 320 }, 1200);
    const before = fired.filter((f) => f < 200);
    const after = fired.filter((f) => f >= 320);
    expect(fired.some((f) => f >= 200 && f < 320)).toBe(false);
    expect(after[0]).toBe(320);
    // 撃ち直しの間隔は戦闘開始のマガジンの間隔と同じ（スピンアップを最初から）
    const gaps = (xs: number[]) => xs.slice(1, 11).map((x, i) => x - xs[i]!);
    expect(gaps(after)).toEqual(gaps(fired));
    // 込め直しは取り消されたので、残弾（300 − 窓の前の発数）を撃ち切るまでリロードが挟まらない
    const magazine = after.findIndex((f, i) => i > 0 && f - after[i - 1]! > 100);
    expect(magazine).toBe(300 - before.length);
  });

  it('SR: reloads while hiding, then charges again from the end of the window (charge does not progress while hidden)', () => {
    const sr: Partial<ShotParams> = {
      maxAmmo: 6,
      reloadTime: 1.5,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
    };
    // 82 で 1 発（残弾 5）→ 100 でハイドしてリロード（189 で満タン）→ 220 からチャージして 302 に 1 発目、以後 82f ごとに 6 発
    const fired = shotsWithWindow(sr, { start: 100, end: 220 }, 800);
    expect(fired).toEqual([82, 302, 384, 466, 548, 630, 712]);
  });

  it('does nothing when the magazine is full or already empty (the ordinary reload continues)', () => {
    const shot = makeCharacter({}).shot;
    const full = initialShooter(shot);
    hideShooter(full, shot);
    expect(full.phase).toBe('ready');
    expect(full.hideReload).toBeUndefined();
  });
});

describe('バースト（狙えない間はオートバーストが発動しない）', () => {
  const unit = (burstStep: 'Step1' | 'Step2' | 'Step3'): BurstUnit => ({
    burstStep,
    nextStep: burstStep === 'Step3' ? 'StepFull' : 'NextStep',
    cooldownFrames: 2400,
  });

  it('holds the chain until the window ends, then fires I → II → III at the usual intervals', () => {
    const state = initialBurstController([unit('Step1'), unit('Step2'), unit('Step3')]);
    for (let f = 0; f < 400; f++) stepBurstController(state, f, f === 0 ? 1_000_000 : 0, f < 100);
    expect(state.gaugeFullFrames).toEqual([0]);
    expect(state.activations.map((a) => [a.frame, a.slotIndex])).toEqual([
      [100, 0],
      [120, 1],
      [140, 2],
    ]);
  });
});

describe('編成（calc と sim の両方に効く）', () => {
  const growth = { level: 1, grade: 0, core: 0 };
  const condition: SlotCondition = { coreHitRate: 0.5, distanceBonus: true, fullCharge: true };
  const slot = (
    resourceId: number,
    shot: Partial<ShotParams>,
    burstStep: 'Step1' | 'Step2' | 'Step3',
  ): TeamSlotInput => ({
    character: makeCharacter(shot, { resourceId, burstStep }),
    growth,
    condition,
  });
  const slots = [
    slot(1, {}, 'Step1'),
    slot(
      2,
      { maxAmmo: 6, reloadTime: 1.5, rateOfFire: 60, endRateOfFire: 60, chargeTime: 1, inputType: 'UP', damage: 6000 },
      'Step2',
    ),
    slot(
      3,
      {
        maxAmmo: 300,
        reloadTime: 2.5,
        rateOfFire: 60,
        endRateOfFire: 3600,
        rateOfFireChangePerShot: 100,
        rateOfFireResetTime: 1,
        damage: 500,
      },
      'Step3',
    ),
  ];
  const baseEnemy: EnemyInput = { defence: 100, element: 'Wind', hasCore: true };
  const input = (events?: EnemyEvent[]): TeamInput => ({
    slots,
    enemy: events === undefined ? baseEnemy : { ...baseEnemy, events },
    durationSeconds: 180,
    burst: true,
  });
  const jumps = enemyEventsOf(master, ['range-3min-jump'], 180);

  it('is unchanged with no events or an empty list', () => {
    const none = computeTeamDamage(input());
    expect(computeTeamDamage(input([])).totalDamage).toBe(none.totalDamage);
    expect(runSimulation(input([])).totalDamage).toBe(runSimulation(input()).totalDamage);
    expect(none.enemyEvents).toEqual([]);
    expect(none.enemyNotes).toEqual([]);
    expect(none.damagePerSecond).toBeNull();
  });

  it('stops every shot and every burst inside the jumps, in both models', () => {
    const windows = untargetableRanges(jumps, 180 * 60);
    expect(windows).toHaveLength(5);
    const inside = (f: number) => windows.some((w) => w.start <= f && f < w.end);
    const sim = runSimulation(input(jumps));
    for (const log of sim.shots) expect(log!.frames.some(inside)).toBe(false);
    expect(sim.schedule!.activations.some((a) => inside(a.frame))).toBe(false);
    expect(sim.untargetable).toEqual(windows);
  });

  it('lowers the total, and calc equals sim for normal attacks because both count the shot list', () => {
    const calc = computeTeamDamage(input(jumps));
    const sim = runSimulation(input(jumps));
    const simTeam = simTeamResult(input(jumps), sim);
    expect(calc.totalDamage).toBeLessThan(computeTeamDamage(input()).totalDamage);
    for (let i = 0; i < slots.length; i++) {
      const c = calc.slots[i]!;
      expect(c.segments.every((s) => s.triggerSource === 'shots')).toBe(true);
      expect(c.normalDamage).toBeCloseTo(sim.slots[i]!.normalDamage, 3);
      expect(c.burst.totalDamage).toBe(sim.slots[i]!.burst.damage);
    }
    expect(calc.enemyEvents).toEqual(jumps);
    expect(calc.enemyNotes.map((n) => n.code)).toEqual(['enemy-untargetable']);
    expect(simTeam.enemyNotes).toEqual(calc.enemyNotes);
  });

  it('adds up the per-second damage to the sim total, with nothing inside the jumps', () => {
    const sim = runSimulation(input(jumps));
    const { total, slots: perSlot } = sim.damagePerSecond;
    expect(total).toHaveLength(180);
    expect(total.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.totalDamage, 0);
    expect(perSlot[0]!.reduce((a, b) => a + b, 0)).toBeCloseTo(sim.slots[0]!.totalDamage, 0);
    // 31.0〜33.0 秒は丸ごと狙えない（32 秒目の 1 秒ぶんは 0）
    expect(total[32]).toBe(0);
  });

  it('shows invulnerable and barrier events without changing the numbers', () => {
    const shown: EnemyEvent[] = [
      { kind: 'invulnerable', start: 10, end: 20 },
      { kind: 'barrier', start: 50, end: 60 },
    ];
    expect(computeTeamDamage(input(shown)).totalDamage).toBe(computeTeamDamage(input()).totalDamage);
    expect(enemyEventNotes(shown).map((n) => [n.level, n.code])).toEqual([
      ['unsupported', 'enemy-invulnerable'],
      ['unsupported', 'enemy-barrier'],
    ]);
  });
});
