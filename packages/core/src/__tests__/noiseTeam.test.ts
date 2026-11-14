// ノイズ（430）を含む編成: バーストの味方全体の持続回復（1 秒間隔・10 秒）は、バーストの使用のフレームに全員に付き、付いた時に
// 1 回だけ healed を起こす（1 秒ごとの刻みでは起こさない。C-0578 と同じ扱い）。読む側はクラウンの S2 の攻撃ダメージ▲（7 秒）と
// アスカの S1。V-0759 の撮影の編成と、実戦寄りの編成。
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { healsOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const NOISE = 430;
const CROWN = 330;
const ASUKA = 830;
const CROWN_UP = { resourceId: CROWN, skill: 'skill2', stat: 'attackDamage' };

// 撮影: ノイズ（I）+ クラウン（II・操作。戦闘を通して撃たず、バーストも使わない）
const SHOOT = fixedTeam([NOISE, CROWN], 1, {
  noBurstSlots: [1],
  holdFire: [{ slotIndex: 1, ranges: [{ start: 0, end: gameSecondsToFrames(180) }] }],
});
// 実戦寄り: ノイズ（I）+ クラウン（II）+ アスカ（III）+ アリス（III）
const PRACTICAL = fixedTeam([NOISE, CROWN, ASUKA, 191], 2);

describe('撮影の編成（ノイズ + クラウン。V-0759）', () => {
  const plan = planTeamRun(SHOOT);
  const uses = activationFramesOfSlot(plan.schedule!, 0);

  it('uses only the Noise burst, and Crown never fires', () => {
    expect(uses.length).toBeGreaterThan(1);
    expect(plan.schedule!.activations.every((a) => a.slotIndex === 0)).toBe(true);
    expect(plan.shots[1]!.frames).toEqual([]);
  });

  it('heals every slot once on each burst use, not on the 1-second ticks', () => {
    expect(healsOf(plan)).toEqual(
      uses.flatMap((frame) => [
        { frame, sourceSlotIndex: 0, slotIndex: 0 },
        { frame, sourceSlotIndex: 0, slotIndex: 1 },
      ]),
    );
  });

  it('opens the Crown S2 ATK damage up on Noise for 7 s from each burst use', () => {
    expect(effectWindows(plan, 0, CROWN_UP)).toEqual(windowsFrom(uses, 7, plan.frames));
  });
});

describe('実戦寄りの編成（ノイズ + クラウン + アスカ + アリス）', () => {
  const plan = planTeamRun(PRACTICAL);
  const uses = activationFramesOfSlot(plan.schedule!, 0);

  it('heals every slot on each Noise burst use', () => {
    expect(uses.length).toBeGreaterThan(0);
    const heals = healsOf(plan);
    for (const frame of uses) {
      for (const slotIndex of [0, 1, 2, 3]) expect(heals).toContainEqual({ frame, sourceSlotIndex: 0, slotIndex });
    }
  });

  it('covers each Noise burst use with the Crown S2 ATK damage up and Asuka S1', () => {
    const crown = effectWindows(plan, 2, CROWN_UP);
    const asuka = effectWindows(plan, 2, { resourceId: ASUKA, skill: 'skill1', stat: 'attack' });
    for (const f of uses) {
      expect(crown.some((w) => w.start <= f && f < w.end)).toBe(true);
      expect(asuka.some((w) => w.start <= f && f < w.end)).toBe(true);
    }
  });
});

describeEveryShotInOneGroup({ 撮影: SHOOT, 実戦寄り: PRACTICAL });
