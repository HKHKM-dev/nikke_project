// アリス：ワンダーランドバニー（195）を含む編成（V-0766）: S1 の 60 発ごとの回復とニンジンパーティー、S2 のフルバーストの開始の最大装弾数▲・
// 弾丸チャージと終わりのゲージのチャージ速度▲、バーストの再突入（I → I）と回復が意図どおりに出るか。撮影 A・B の編成と、水冷の実戦寄りの編成で見る
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { stateItemsOf } from './historyHelpers.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, skillValueOf, windowsFrom } from './teamHelpers.ts';

const ALICE_WB = 195;
const CROWN = 330;
const IDOLL_SUN = 308;
const IDOLL_FLOWER = 304;
const SOLDIER_EG = 300;
const LUDMILLA = 190;
const MIHARA = 161;
const SODA_TB = 314;

/** 撮影 A の編成（クラウン・サン・アリス（操作）・フラワー・ソルジャーE.G.） */
const SHOOT_A = [CROWN, IDOLL_SUN, ALICE_WB, IDOLL_FLOWER, SOLDIER_EG];

const TEAMS: Record<string, TeamInput> = {
  '撮影 A（アリスが撃つ）': fixedTeam(SHOOT_A, 2),
  '撮影 B（アリスは撃たない操作枠）': fixedTeam(SHOOT_A, 2, {
    holdFire: [{ slotIndex: 2, ranges: [{ start: 0, end: gameSecondsToFrames(180) }] }],
  }),
  '実戦寄り（アリス・ルドミラ・クラウン・ミハラ・ソーダ：トゥインクルバニー）': fixedTeam(
    [ALICE_WB, LUDMILLA, CROWN, MIHARA, SODA_TB],
    2,
  ),
};

const MAX_AMMO = 120;
const AMMO_UP = skillValueOf(ALICE_WB, 'skill2', 3) / 100;

describe.each(Object.entries(TEAMS))('編成: %s', (name, input) => {
  const plan = planTeamRun(input);
  const alice = input.slots.findIndex((s) => s?.character.resourceId === ALICE_WB);
  const shots = plan.shots[alice]!.frames;
  const schedule = plan.schedule!;
  const fullBursts = schedule.fullBurstWindows;
  const aliceUses = schedule.activations.filter((a) => a.slotIndex === alice);
  const heals = (skill: 'skill1' | 'burst', holder: number) =>
    plan.instants
      .filter(
        (i) =>
          i.sourceSlotIndex === alice &&
          i.slotIndex === holder &&
          i.effect.kind === 'heal' &&
          i.effect.source.skill === skill,
      )
      .map((i) => i.frame);
  const holders = input.slots.map((_, i) => i);

  it('heals every ally on every 60th normal attack (S1), on the shot frame or the next', () => {
    const sixtieth = shots.filter((_, i) => (i + 1) % 60 === 0);
    for (const h of holders) {
      const frames = heals('skill1', h);
      expect(frames).toHaveLength(sixtieth.length);
      frames.forEach((f, k) => expect(f - sixtieth[k]!).toBeOneOf([0, 1]));
    }
    if (name.startsWith('撮影 B')) expect(shots).toEqual([]);
    else expect(sixtieth.length).toBeGreaterThan(10);
  });

  it('re-enters stage 1 after each burst of hers, and another I bursts next (I → I → II → III)', () => {
    expect(aliceUses.length).toBeGreaterThan(1);
    for (const use of aliceUses) {
      expect(use.enteredStep).toBe('Step1');
      const next = schedule.activations[schedule.activations.indexOf(use) + 1]!;
      expect(next).toMatchObject({ step: 'Step1' });
      expect(next.slotIndex).not.toBe(alice);
    }
  });

  it('heals every ally once on each burst use', () => {
    for (const h of holders) expect(heals('burst', h)).toEqual(aliceUses.map((a) => a.frame));
  });

  it('gives every ally Carrot Party with up to 5 stacks while she fires', () => {
    const items = stateItemsOf(plan).filter((i) => i.state === 'carrotParty');
    if (name.startsWith('撮影 B')) {
      expect(items).toEqual([]);
      return;
    }
    for (const h of holders) {
      const own = items.filter((i) => i.slotIndex === h);
      expect(own[0]!.start - heals('skill1', h)[0]!).toBeOneOf([0, 1]);
      expect(Math.max(...own.map((i) => i.stack ?? 1))).toBe(5);
    }
  });

  it('gives every ally max ammo up (15 s) and an ammo refill at each Full Burst start, and gauge speed up (5 s) at its end', () => {
    const starts = fullBursts.map((w) => w.start);
    expect(starts.length).toBeGreaterThan(5);
    for (const h of holders) {
      const source = { resourceId: ALICE_WB, skill: 'skill2' };
      expect(effectWindows(plan, h, { ...source, stat: 'maxAmmo' })).toEqual(windowsFrom(starts, 15, plan.frames));
      expect(effectWindows(plan, h, { ...source, stat: 'burstGaugeSpeed' })).toEqual(
        windowsFrom(
          fullBursts.map((w) => w.end),
          5,
          plan.frames,
        ).filter((w) => w.start < w.end),
      );
      const refills = plan.instants.filter(
        (i) => i.sourceSlotIndex === alice && i.slotIndex === h && i.effect.kind === 'ammoRefill',
      );
      expect(refills.map((i) => i.frame)).toEqual(starts);
    }
  });

  it.runIf(name.startsWith('撮影 A'))('refills from the raised max ammo and reloads to it inside the window', () => {
    const raised = Math.round(MAX_AMMO * (1 + AMMO_UP));
    expect(raised).toBe(168);
    const refills = plan.instants.filter(
      (i) => i.sourceSlotIndex === alice && i.slotIndex === alice && i.effect.kind === 'ammoRefill',
    );
    // 弾丸チャージは上げた後の最大の X%（最大で止まる）
    expect(Math.max(...refills.map((i) => i.amount))).toBe(Math.round(raised * AMMO_UP));
    // マガジンの発数: 最初のフルバーストの前は 120、窓の中でリロードしてから窓の中で撃ち切った回は 168
    // （窓 15 秒・間隔約 20 秒なので、窓に掛からないマガジンは最初の 1 本だけ）
    const ends = plan.shots[alice]!.lastShotFrames!;
    expect(ends[0]!).toBeLessThan(fullBursts[0]!.start);
    expect(shots.filter((f) => f <= ends[0]!)).toHaveLength(MAX_AMMO);
    const window = gameSecondsToFrames(15);
    const inWindow = (f: number) => fullBursts.some((w) => w.start <= f && f < w.start + window);
    const raisedMags = ends.slice(1).flatMap((end, k) => {
      const prev = ends[k]!;
      const refilled = fullBursts.some((w) => prev < w.start && w.start <= end);
      return !refilled && inWindow(prev) && inWindow(end) ? [shots.filter((f) => prev < f && f <= end).length] : [];
    });
    expect(raisedMags.length).toBeGreaterThan(3);
    for (const count of raisedMags) expect(count).toBe(raised);
  });

  it.runIf(name.startsWith('撮影'))("opens Crown's S2 (when healed) at the first heal from Alice", () => {
    const crown = input.slots.findIndex((s) => s?.character.resourceId === CROWN);
    const windows = effectWindows(plan, crown, { resourceId: CROWN, skill: 'skill2', stat: 'attackDamage' });
    const first = name.startsWith('撮影 A') ? heals('skill1', crown)[0]! : aliceUses[0]!.frame;
    expect(windows[0]!.start).toBe(first);
  });
});

describeEveryShotInOneGroup(TEAMS);
