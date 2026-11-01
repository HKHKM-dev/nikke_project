// レッドフード編（plan/design-red-hood.md）: レッドフード（470）を含む編成で、使った段階で分かれるバーストの効果（ビーストケージ・
// ハウリングエンド・レッドウルフ）、I・II の CT▼（戦闘中 1 回）、S1 のチャージ速度のスタックと超過分の変換が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { chargeSpeedOverflowDamage } from '../skills/buffs.ts';
import { appliedFrames } from '../skills/timeline.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { runTeam } from './runTeam.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const RED_HOOD = 470;
const LITER = 82;
const DELTA = 20;
const CROWN = 330;
const ALICE = 191;
const TEN_SECONDS = gameSecondsToFrames(10);

const TEAMS: Record<string, { input: TeamInput; redHood: number }> = {
  'レッドフード単騎（撮影 A）': { input: fixedTeam([RED_HOOD], 0), redHood: 0 },
  'リター・デルタ・レッドフード（撮影 B）': { input: fixedTeam([LITER, DELTA, RED_HOOD], 2), redHood: 2 },
  '実戦寄り（リター・クラウン・レッドフード・アリス・デルタ）': {
    input: fixedTeam([LITER, CROWN, RED_HOOD, ALICE, DELTA], 2),
    redHood: 2,
  },
};

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([name, t]) => [name, t.input])));

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, redHood }) => {
  const plan = planTeamRun(input);
  const result = runTeam(input);
  const activations = plan.schedule!.activations.filter((a) => a.slotIndex === redHood);
  const effectFramesAt = (step: string) =>
    activations.filter((a) => a.step === step).map((a) => a.effectFrame ?? a.frame);

  it('uses the Burst at least once', () => {
    expect(activations.length).toBeGreaterThan(0);
  });

  it('applies each mode name only on the activations at its step', () => {
    expect(appliedFrames(plan.history, 'beastCage', redHood)).toEqual(effectFramesAt('Step1'));
    expect(appliedFrames(plan.history, 'theLastHowl', redHood)).toEqual(effectFramesAt('Step2'));
    expect(appliedFrames(plan.history, 'redWolf', redHood)).toEqual(effectFramesAt('Step3'));
  });

  it('gives the S2 ATK up for 10 s when Red Wolf activates, and changes the weapon for 10 s', () => {
    const tracks = plan.history.tracks.filter((t) => t.sourceSlotIndex === redHood && t.origin.kind === 'timed');
    const s2Attack = tracks.filter((t) => t.origin.kind === 'timed' && t.origin.effect.source.skill === 'skill2');
    const weapon = tracks.filter((t) => t.origin.kind === 'timed' && t.origin.effect.stat === 'weapon');
    // S2 の▲（{ applied }）はレッドウルフが付いたフレームから、使用武器の変更（burstUse の timed）は発火の次のフレームから
    const starts = effectFramesAt('Step3');
    expect(s2Attack.flatMap((t) => t.items.map((it) => it.start))).toEqual(starts);
    expect(weapon.flatMap((t) => t.items.map((it) => it.start))).toEqual(starts.map((f) => f + 1));
    for (const t of [...s2Attack, ...weapon]) {
      for (const it of t.items) expect(it.end - it.start).toBeLessThanOrEqual(TEN_SECONDS);
    }
  });

  it('cuts its own CT by 40 s at most once per stage, only at I and II', () => {
    const cuts = plan.instants.filter((x) => x.sourceSlotIndex === redHood && x.effect.kind === 'cooldownReduction');
    const firstOf = (step: string) => effectFramesAt(step)[0];
    expect(cuts.map((x) => x.frame)).toEqual(
      [firstOf('Step1'), firstOf('Step2')].filter((f) => f !== undefined).sort((a, b) => a - b),
    );
    expect(cuts.every((x) => x.slotIndex === redHood)).toBe(true);
  });

  it('converts the charge speed over 100% into charge damage, which happens on the Red Wolf shots', () => {
    const frames = plan.shots[redHood]!.frames;
    let converted = 0;
    for (const g of result.slots[redHood]!.segments) {
      if (countShotsInRanges(frames, g.ranges) === 0) continue;
      const extra = chargeSpeedOverflowDamage(g.buffs);
      expect(extra).toBeCloseTo(Math.max(0, g.buffs.chargeSpeed - 1) * 2.4, 10);
      if (extra > 0 && g.buffs.weapon !== null) converted += 1;
    }
    // 窓の外の S1 の 10 スタック（38.1%）では超えない。レッドウルフの窓（III の 100.8%）がある編成では超える
    expect(converted > 0).toBe(plan.schedule!.activations.some((a) => a.slotIndex === redHood && a.step === 'Step3'));
  });
});

describe('レッドフード単騎のチェーン（全段階の枠は同じチェーンで撃ち直す。設計書 7.1 節の論点 7・V-0639）', () => {
  const input = TEAMS['レッドフード単騎（撮影 A）']!.input;
  const activations = planTeamRun(input).schedule!.activations;

  it('uses I, II and III herself in the first chain and enters Full Burst', () => {
    expect(activations.slice(0, 3).map((a) => [a.step, a.slotIndex])).toEqual([
      ['Step1', 0],
      ['Step2', 0],
      ['Step3', 0],
    ]);
    expect(activations[2]!.startsFullBurst).toBe(true);
  });

  it('uses only I after the CT cuts are spent, every 40 s CT', () => {
    const later = activations.slice(3);
    expect(later.length).toBeGreaterThan(0);
    expect(later.every((a) => a.step === 'Step1' && !a.startsFullBurst)).toBe(true);
    const gaps = activations.slice(3).map((a, i) => a.frame - activations[i + 2]!.frame);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(gameSecondsToFrames(40));
  });
});

describe('レッドウルフの射撃（設計書 7.1 節の論点 10・11。V-0639）', () => {
  const input = TEAMS['レッドフード単騎（撮影 A）']!.input;
  const plan = planTeamRun(input);
  const weapon = plan.history.tracks
    .filter((t) => t.origin.kind === 'timed' && t.origin.effect.stat === 'weapon')
    .flatMap((t) => t.items)[0]!;
  const shots = plan.shots[0]!.frames.filter((f) => f >= weapon.start && f < weapon.end);

  it('fires every 0.3 s (18, 18, 17 f) without reloading through the 10 s window', () => {
    const gaps = shots.slice(1).map((f, i) => f - shots[i]!);
    expect(gaps.every((g) => g === 17 || g === 18)).toBe(true);
    // 0.3 秒 = 17.647f の端数を持ち越すので、n 発の間の長さは n × 17.647 の切り上げか切り捨て
    const span = shots.at(-1)! - shots[0]!;
    expect(Math.abs(span - (shots.length - 1) * (0.3 / 0.017))).toBeLessThan(1);
    expect(shots.length).toBeGreaterThan(30);
  });
});

describe('全段階の枠と専任の順（設計書 7.1 節の論点 12）', () => {
  it('picks the leftmost ready candidate, even an AllStep slot left of a ready dedicated one', () => {
    const input = fixedTeam([RED_HOOD, LITER, DELTA], 0, { durationSeconds: 60 });
    const first = planTeamRun(input).schedule!.activations[0]!;
    expect([first.step, first.slotIndex]).toEqual(['Step1', 0]);
  });
});

describe('レッドウルフの最初の発（設計書 7.1 節の論点 13。C-0897）', () => {
  const input = TEAMS['リター・デルタ・レッドフード（撮影 B）']!.input;
  const plan = planTeamRun(input);
  const frames = plan.shots[2]!.frames;
  const changed = new Set(plan.shots[2]!.weaponChangeShotFrames ?? []);

  it('fires 12 f after the Full Burst start when reloading, after the aim-out when in it, or 13 f later when charging', () => {
    for (const w of plan.schedule!.fullBurstWindows) {
      const first = frames.find((f) => changed.has(f) && f >= w.start - 60)!;
      const lastBase = frames.filter((f) => !changed.has(f) && f < first).at(-1)!;
      const aimOutEnd = lastBase + 13;
      const offset = first - w.start;
      if (aimOutEnd > w.start) expect(first).toBe(aimOutEnd + 12);
      else expect([12, 25]).toContain(offset);
    }
  });
});
