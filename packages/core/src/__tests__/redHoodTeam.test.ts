// レッドフード編（plan/design-red-hood.md）: レッドフード（470）を含む編成で、使った段階で分かれるバーストの効果（ビーストケージ・
// ハウリングエンド・レッドウルフ）、I・II の CT▼（戦闘中 1 回）、S1 のチャージ速度のスタックと超過分の変換が意図どおりに出るか
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { chargeSpeedOverflowDamage } from '../skills/buffs.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { appliedFrames } from '../skills/timeline.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { runTeam } from './runTeam.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
const RED_HOOD = 470;
const LITER = 82;
const DELTA = 20;
const CROWN = 330;
const ALICE = 191;
const TEN_SECONDS = gameSecondsToFrames(10);

const TEAMS: Record<string, { input: TeamInput; redHood: number }> = {
  'レッドフード単騎（撮影 A）': {
    input: { slots: [fixedSlot(RED_HOOD)], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 },
    redHood: 0,
  },
  'リター・デルタ・レッドフード（撮影 B）': {
    input: {
      slots: [fixedSlot(LITER), fixedSlot(DELTA), fixedSlot(RED_HOOD)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    redHood: 2,
  },
  '実戦寄り（リター・クラウン・レッドフード・アリス・デルタ）': {
    input: {
      slots: [fixedSlot(LITER), fixedSlot(CROWN), fixedSlot(RED_HOOD), fixedSlot(ALICE), fixedSlot(DELTA)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    redHood: 2,
  },
};

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

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = result.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
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
    const input: TeamInput = {
      slots: [fixedSlot(RED_HOOD), fixedSlot(LITER), fixedSlot(DELTA)],
      enemy,
      durationSeconds: 60,
      burst: true,
      controlledSlot: 0,
    };
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
