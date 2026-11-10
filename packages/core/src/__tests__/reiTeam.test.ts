// レイ（831。V-0716）を含む編成で、S1 の 100 発ごとの有利コードの攻撃ダメージ▲（自分・3 秒）、S2 のバースト 3 段階突入時の攻撃力▲
// （灼熱の味方全体・10 秒）、バーストの攻撃ダメージ▲（灼熱の味方全体・10 秒）が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot, stageEnterFrames } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { describeEveryShotInOneGroup, effectWindows, fixedTeam, windowsFrom } from './teamHelpers.ts';

const REI = 831;

const TEAMS: Record<string, TeamInput> = {
  レイ単騎: fixedTeam([REI], 0, { durationSeconds: 90, burst: false }),
  'ココア + ユニ + レイ（撮影 C の編成）': fixedTeam([311, 160, REI], 2),
  '実戦寄り（リター + ユニ + レイ + アリス + クラウン）': fixedTeam([82, 160, REI, 191, 330], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const rei = input.slots.findIndex((s) => s?.character.resourceId === REI);
  const plan = planTeamRun(input);
  const isFire = (slot: number) => input.slots[slot]!.character.element === 'Fire';
  // バーストを使わない編成（単騎）では、S2・バーストの効果の窓は空
  const schedule = input.burst ? plan.schedule! : null;
  const windows = (slot: number, skill: string, stat: string) =>
    effectWindows(plan, slot, { resourceId: REI, skill, stat });

  it('gives the S1 elemental advantage damage up only to Rei, from every 100th shot', () => {
    const s1 = windows(rei, 'skill1', 'elementDamage');
    expect(s1.length).toBeGreaterThan(0);
    // 100 の倍数の発の次のフレームから 3 秒。付き直しで続いた窓は 1 つにまとまる（C-1063）
    const hundredth = plan.shots[rei]!.frames.filter((_, i) => (i + 1) % 100 === 0).map((f) => f + 1);
    const merged: { start: number; end: number }[] = [];
    for (const w of windowsFrom(hundredth, 3, plan.frames)) {
      const last = merged.at(-1);
      if (last !== undefined && w.start <= last.end) last.end = Math.max(last.end, w.end);
      else merged.push({ ...w });
    }
    expect(s1).toEqual(merged);
    input.slots.forEach((_, slot) => {
      if (slot !== rei) expect(windows(slot, 'skill1', 'elementDamage')).toEqual([]);
    });
  });

  it('gives the S2 ATK up to every Fire ally for 10 s from each entry to Burst Stage 3, and nothing without one', () => {
    // 段階 3 への突入は II の発動の六角形の替わり目（stageEnterFrames）。レイの CT が明けずに II で切れたチェーンでも起きる
    const expected = schedule ? windowsFrom(stageEnterFrames(schedule, 'Step3'), 10, plan.frames) : [];
    expect(expected.length > 0).toBe(input.burst);
    input.slots.forEach((_, slot) => {
      expect(windows(slot, 'skill2', 'attack')).toEqual(isFire(slot) ? expected : []);
    });
  });

  it('deals the S1 damage as two hits, 16 and 30 frames after the shot of every 100th hit (C-1066)', () => {
    const hits = plan.skillHits.filter((h) => h.slotIndex === rei && h.effect.dot === undefined);
    // 命中の期待値の累計が 100 の倍数を越えた発（きっかけ）から、16f 後と 30f 後（戦闘の終わりより後は出ない）
    const log = plan.shots[rei]!;
    let total = 0;
    const expected: number[] = [];
    log.frames.forEach((f, i) => {
      const before = Math.floor(total / 100);
      total += log.hits?.[i] ?? 1;
      if (Math.floor(total / 100) > before) expected.push(f + 16, f + 30);
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.frame)).toEqual(expected.filter((f) => f < plan.frames));
  });

  it('gives the burst attack damage up to every Fire ally for 10 s from each Rei burst', () => {
    const expected = schedule ? windowsFrom(activationFramesOfSlot(schedule, rei), 10, plan.frames) : [];
    expect(expected.length > 0).toBe(input.burst);
    input.slots.forEach((_, slot) => {
      expect(windows(slot, 'burst', 'attackDamage')).toEqual(isFire(slot) ? expected : []);
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
