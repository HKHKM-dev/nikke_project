// Stage 16-B: 敵の出来事（狙えない窓 = 射撃場 3 分モードの的のジャンプ）。plan/design-stage16.md 9 節。
//   1. プリセットの出来事のセットと、周期の展開・フレームの窓
//   2. 射手: ハイド中のリロード（間に合えば満タン・間に合わなければ取り消し）、撃ち直し（MG のレートは最初から、チャージはし直し）
//   3. バースト: 狙えない間はオートバーストが発動しない
//   4. 編成: 出来事なしは今と同じ、ありなら calc と sim の両方に効く（どちらも射撃の列を数えるので通常攻撃は一致する）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { initialBurstController, stepBurstController, type BurstUnit } from '../burst/controller.ts';
import { computeCadence } from '../cadence.ts';
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
import { battleSecondsToFrames, gameSecondsToFrame } from '../time.ts';

const master = parseEnemyPresets(
  JSON.parse(readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8')) as unknown,
);

describe('出来事のセット（data/enemies.json）', () => {
  it('has the 3-minute-mode jump on every shooting-range preset', () => {
    expect(master.eventSets.map((s) => s.id)).toEqual(['range-3min-jump']);
    for (const e of master.enemies.filter((p) => p.content === 'range'))
      expect(e.eventSets).toEqual(['range-3min-jump']);
    // V-0009: 5 回ともジャンプを読めた録画（041・046・055・049・050）の、ゲーム内の秒の中央値。間隔は回ごとに並べる（C-0057）
    expect(master.eventSets[0]!.events).toEqual([
      { kind: 'untargetable', first: 32.35, duration: 2, every: [36.34, 39.66, 36.34, 33.17] },
    ]);
  });

  it('expands to 5 jumps in 180 game seconds, as every recording read so far (C-0056)', () => {
    const events = enemyEventsOf(master, ['range-3min-jump'], 180);
    expect(events.map((e) => e.start.toFixed(2))).toEqual(['32.35', '68.69', '108.35', '144.69', '177.86']);
    expect(events.every((e) => e.kind === 'untargetable')).toBe(true);
    expect(events[4]!.end).toBeCloseTo(179.86, 9);
    expect(enemyEventsOf(master, [], 180)).toEqual([]);
  });

  it('repeats a list of intervals in order and then keeps its last interval (Stage 21)', () => {
    expect(expandEnemyEvents([{ kind: 'untargetable', first: 10, duration: 2, every: [20, 30] }], 100)).toEqual([
      { kind: 'untargetable', start: 10, end: 12 },
      { kind: 'untargetable', start: 30, end: 32 },
      { kind: 'untargetable', start: 60, end: 62 },
      { kind: 'untargetable', start: 90, end: 92 },
    ]);
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
    expect(parse([{ ...set, events: [{ kind: 'untargetable', first: 0, duration: 3, every: [5, 2] }] }])).toThrow(
      /every/,
    );
    expect(parse([{ ...set, events: [{ kind: 'untargetable', first: 0, duration: 3, every: [] }] }])).toThrow(/every/);
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
    // 秒 → フレームは四捨五入（Stage 21-B: 1 フレーム 0.017 秒）
    expect(untargetableRanges(events, 600)).toEqual([
      { start: gameSecondsToFrame(2), end: gameSecondsToFrame(4) },
      { start: gameSecondsToFrame(9), end: 600 },
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

describe('射手（ハイドとリロード）', () => {
  it('AR (reload 1 s < 2 s jump): reloads while hiding and resumes with a full magazine at the end of the window', () => {
    // 12…99 で 18 発（構え 12f の後から。Stage 21-C3 で 4〜5f 刻み）→ 100 でハイドしてリロード（159 で満タン、
    // リロード明けの遅れは窓の中）→ 220 の明けから構え 12f の 232 で撃ち直し（Stage 22-C）、60 発を 522 まで撃って、
    // リロード 59f（Stage 24: 58.8f の端数を持ち越す）+ 24f の 605 に次のマガジン
    const ar = computeCadence(makeCharacter({}).shot).shotFrames;
    const fired = shotsWithWindow({}, { start: 100, end: 220 }, 700);
    const before = ar.map((f) => 12 + f).filter((f) => f < 100);
    expect(before).toHaveLength(18);
    expect(fired).toEqual([...before, ...ar.map((f) => 232 + f), ...ar.map((f) => 605 + f).filter((f) => f < 700)]);
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
    // 明けから構え 12f の後に撃つ（Stage 22-C。C-0114 の MG は明けから 11f）
    expect(after[0]).toBe(332);
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
    // 70 で 1 発（残弾 5）→ 100 でハイドしてリロード（189 で満タン）→ 220 から構えてチャージして 290 に 1 発目、以後 82f ごとに 6 発
    // （戦闘開始と窓の明けの 1 発目は、SR は構え 11f + チャージ 59f + 満ちてから撃つまで 1f − 1 = 70f。C-0225・C-0232）
    const fired = shotsWithWindow(sr, { start: 100, end: 220 }, 800);
    expect(fired).toEqual([70, 290, 372, 454, 536, 618, 700]);
  });

  it('SR: after an empty-magazine reload that finishes in the window, fires at the later of the end + 70f and the usual time (C-0225)', () => {
    // 1 発のマガジン: 70 で撃って弾切れ → リロードの完了から 82f（モデルの分け方）で次の発。ゲームの完了はモデルの完了より遅く、
    // 完了から待ちからの 1 発目（70f）で撃つので、完了が窓の終わりの 12f より前なら明けから 70f、近ければふだんの時刻のまま（V-0135）
    const sr: Partial<ShotParams> = {
      maxAmmo: 1,
      reloadTime: 1.5,
      rateOfFire: 60,
      endRateOfFire: 60,
      chargeTime: 1,
      inputType: 'UP',
    };
    const usual = shotsWithWindow(sr, { start: 1000, end: 1001 }, 300)[1]!;
    const reloadEnd = usual - 82;
    // 完了が窓の終わりの 5f 前: 明けから 70f より、ふだんの時刻のほうが遅い
    expect(shotsWithWindow(sr, { start: 100, end: reloadEnd + 5 }, 400)[1]).toBe(usual);
    // 完了が窓の終わりの 40f 前: 明けから 70f
    expect(shotsWithWindow(sr, { start: 100, end: reloadEnd + 40 }, 400)[1]).toBe(reloadEnd + 40 + 70);
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
      [129, 1],
      [158, 2],
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
    const windows = untargetableRanges(jumps, battleSecondsToFrames(180));
    expect(windows).toHaveLength(5);
    const inside = (f: number) => windows.some((w) => w.start <= f && f < w.end);
    const sim = runSimulation(input(jumps));
    // Stage 22-B: 窓の始まりのフレームの部分チャージの発（C-0109）だけは窓の中に出る。それ以外は撃たない
    for (const log of sim.shots) {
      const partial = new Set((log!.partialShots ?? []).map((p) => p.frame));
      expect(log!.frames.filter((f) => !partial.has(f)).some(inside)).toBe(false);
      for (const f of partial) expect(windows.some((w) => w.start === f)).toBe(true);
    }
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
    // 32.35〜34.35 秒は丸ごと狙えない（33 秒目の 1 秒ぶんは 0）
    expect(total[33]).toBe(0);
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
