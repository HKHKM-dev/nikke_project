// マルチャーナ（321）を含む編成: S1 の最後の弾丸の吸収回復（3 秒）と S2 のバースト使用時の回復は、どちらも味方全体に付き、
// 付いた時に 1 回だけ healed を起こす（吸収回復の付き直しでは起こさない。C-0082 と同じ扱い）。読む側はクラウンの S2 の
// 攻撃ダメージ▲（7 秒）と、アスカの S1。V-0756 の撮影 A・B の編成と、実戦寄りの編成。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { healsOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const MARCIANA = 321;
const CROWN = 330;
const ASUKA = 830;
const CROWN_UP = { resourceId: CROWN, skill: 'skill2', stat: 'attackDamage' };

// 撮影 A: マルチャーナ（操作）+ クラウン（バーストなし）
const SHOOT_A = fixedTeam([MARCIANA, CROWN], 0, { burst: false });
// 撮影 B: フラワー（I）+ マルチャーナ（II。操作・戦闘を通して撃たない）+ クラウン（II）。オートバースト
const SHOOT_B = fixedTeam([304, MARCIANA, CROWN], 1, {
  holdFire: [{ slotIndex: 1, ranges: [{ start: 0, end: gameSecondsToFrames(180) }] }],
});
// 実戦寄り: リター（I）+ マルチャーナ（II）+ クラウン（II）+ アスカ（III）+ アリス（III）
const PRACTICAL = fixedTeam([82, MARCIANA, CROWN, ASUKA, 191], 3);

describe('撮影 A の編成（マルチャーナ + クラウン。V-0756）', () => {
  const plan = planTeamRun(SHOOT_A);
  const lastShots = plan.shots[0]!.lastShotFrames!;

  it('heals both slots once on each last bullet (Crown on the frame, herself on the next one. C-0628)', () => {
    expect(lastShots.length).toBeGreaterThan(10);
    const fromMarciana = healsOf(plan).filter((h) => h.sourceSlotIndex === 0);
    expect(fromMarciana).toEqual(
      lastShots
        .flatMap((f) => [
          { frame: f, sourceSlotIndex: 0, slotIndex: 1 },
          { frame: f + 1, sourceSlotIndex: 0, slotIndex: 0 },
        ])
        .filter((h) => h.frame < plan.frames),
    );
  });

  it('opens the Crown S2 ATK damage up on each last bullet, for 7 s unless another heal extends it', () => {
    const windows = effectWindows(plan, 1, CROWN_UP);
    const healFrames = healsOf(plan)
      .filter((h) => h.slotIndex === 1)
      .map((h) => h.frame);
    for (const f of lastShots) expect(windows.some((w) => w.start <= f && f < w.end)).toBe(true);
    for (const w of windows) expect(healFrames).toContain(w.start);
    // 間に別の回復が無い窓は 7 秒で、次の最後の弾丸までの切れ目がある
    const plain = windows.filter((w) => !healFrames.some((f) => w.start < f && f < w.end));
    expect(plain.length).toBeGreaterThan(5);
    expect(plain).toEqual(
      windowsFrom(
        plain.map((w) => w.start),
        7,
        plan.frames,
      ),
    );
  });
});

describe('撮影 B の編成（フラワー + マルチャーナ + クラウン。V-0756）', () => {
  const plan = planTeamRun(SHOOT_B);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 1).map((a) => a.frame);

  it('auto bursts Marciana (left of Crown, her CT 20 s up every chain. C-0663), not Crown, and Marciana never fires', () => {
    expect(uses.length).toBeGreaterThan(3);
    expect(plan.shots[1]!.lastShotFrames ?? []).toEqual([]);
    expect(plan.schedule!.activations.some((a) => a.slotIndex === 2)).toBe(false);
  });

  it('heals every slot only on each Marciana burst use and covers it with the Crown S2 ATK damage up', () => {
    const heals = healsOf(plan).filter((h) => h.sourceSlotIndex === 1);
    expect(new Set(heals.map((h) => h.frame))).toEqual(new Set(uses));
    for (const frame of uses) {
      for (const slotIndex of [0, 1, 2]) expect(heals).toContainEqual({ frame, sourceSlotIndex: 1, slotIndex });
    }
    const windows = effectWindows(plan, 2, CROWN_UP);
    for (const f of uses) expect(windows.some((w) => w.start <= f && f < w.end)).toBe(true);
  });
});

describe('実戦寄りの編成（リター + マルチャーナ + クラウン + アスカ + アリス）', () => {
  const plan = planTeamRun(PRACTICAL);

  it('heals every slot on each Marciana burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 1).map((a) => a.frame);
    expect(uses.length).toBeGreaterThan(0);
    const heals = healsOf(plan).filter((h) => h.sourceSlotIndex === 1);
    for (const frame of uses) {
      for (const slotIndex of [0, 1, 2, 3, 4]) expect(heals).toContainEqual({ frame, sourceSlotIndex: 1, slotIndex });
    }
  });

  it('starts Asuka S1 on the first Marciana last bullet', () => {
    const first = plan.shots[1]!.lastShotFrames![0]!;
    const s1 = effectWindows(plan, 3, { resourceId: ASUKA, skill: 'skill1', stat: 'attack' });
    expect(s1[0]!.start).toBe(first);
  });
});

describeEveryShotInOneGroup({ '撮影 A': SHOOT_A, '撮影 B': SHOOT_B, 実戦寄り: PRACTICAL });
