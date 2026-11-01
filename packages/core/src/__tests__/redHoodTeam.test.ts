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

  it('converts the charge speed over 100% into charge damage only on the Red Wolf shots', () => {
    const frames = plan.shots[redHood]!.frames;
    for (const g of result.slots[redHood]!.segments) {
      if (countShotsInRanges(frames, g.ranges) === 0) continue;
      const extra = chargeSpeedOverflowDamage(g.buffs);
      if (g.buffs.weapon === null) expect(extra).toBe(0);
      else expect(extra).toBeGreaterThan(0);
    }
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = result.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});

describe('レッドフード単騎のチェーン（いまの状態機械: 同じチェーンで撃ち直さない。設計書 3 節の R2）', () => {
  const input = TEAMS['レッドフード単騎（撮影 A）']!.input;
  const activations = planTeamRun(input).schedule!.activations;

  it('uses only I, comes back as soon as the gauge fills after the first CT cut, then waits for the 40 s CT', () => {
    expect(activations.every((a) => a.step === 'Step1' && !a.startsFullBurst)).toBe(true);
    const gaps = activations.slice(1).map((a, i) => a.frame - activations[i]!.frame);
    expect(gaps[0]!).toBeLessThan(gameSecondsToFrames(40));
    for (const gap of gaps.slice(1)) expect(gap).toBeGreaterThanOrEqual(gameSecondsToFrames(40));
  });
});
