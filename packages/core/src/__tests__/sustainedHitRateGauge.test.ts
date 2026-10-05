// 1 パス目で持続の命中率▲の窓を追う（plan/design-sustained-hit-rate-gauge.md）。
//   1. ミサト単騎（SMG・条件が自動）: S1 のスタックの▲の間だけ、発のゲージが H2 の比（C-0192）で上がる。射撃は変わらない
//   2. 1 パス目の当たりの窓は、2 パス目の状態の窓（stateWindows）と同じ
//   3. アスカのバーストの▲は、フルバーストの窓に収まり、時刻表を変えない（設計書 0.1 節）
//   4. 手入力の枠は窓を追わない
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { untargetableRanges } from '../frame/events.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import {
  bulletHitRateWithHitRateUp,
  hitRateSpanWith,
  hitRateSpansOf,
  slotFlightsOf,
  type LandingHitRateSpan,
} from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { battleSecondsToFrames } from '../time.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const enemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

function fixedSlot(id: number, auto = true): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 0.3, distanceBonus: true, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

const team = (slots: TeamSlotInput[], sustained = true): TeamInput => ({
  slots,
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: null,
  ...(sustained ? {} : { sustainedHitRateUp: false }),
});

/** ミサト S1 の 1 段の命中率▲（C-0183） */
const MISATO_S1 = 0.0504;

type Window = { slotIndex: number; sourceSlotIndex: number; start: number; end: number; stack?: number };
const key = (w: Window) => `${w.slotIndex}<${w.sourceSlotIndex}:${w.start}-${w.end}:${w.stack ?? '-'}`;

/** planTeamRun と同じ材料で 1 パス目を回す（当たりの窓を見るため） */
function firstPassOf(input: TeamInput) {
  const plan = planTeamRun(input);
  const landing = plan.landing!;
  const frames = battleSecondsToFrames(input.durationSeconds);
  const first = runFirstPass(toTimelineSlots(input.slots), {
    frames,
    burst: true,
    controlledSlot: null,
    untargetable: untargetableRanges(enemy.events, frames),
    hitRates: hitRateSpansOf(landing, input.slots.length),
    enemyHasCore: true,
    flights: slotFlightsOf(input.slots, enemy, frames),
    hitRateWith: (slotIndex: number, span: LandingHitRateSpan, up: number) =>
      hitRateSpanWith(landing, input.slots[slotIndex]!, slotIndex, span, up),
  });
  return { plan, first };
}

describe('1 パス目で持続の命中率▲の窓を追う', () => {
  describe('ミサト単騎（SMG・条件が自動）', () => {
    const on = planTeamRun(team([fixedSlot(833)]));
    const off = planTeamRun(team([fixedSlot(833)], false));
    const spans = hitRateSpansOf(on.landing, 1)[0]!;
    const spanAt = (frame: number) => spans.find((s) => s.start <= frame && frame < s.end)!;
    const misato = fixedSlot(833);
    const planned = (frame: number) => spanAt(frame).hitRate;
    /**
     * 持続の▲ k 段での、計画の値に対する比。中遠のような配分の区間は着地点ごとに H2 を当ててから混ぜる（SMG の中遠は
     * 着地点 A だけ値が違う。C-0319）ので、モデルと同じ hitRateSpanWith で出す
     */
    const ratioWith = (frame: number, k: number) =>
      hitRateSpanWith(on.landing!, misato, 0, spanAt(frame), k * MISATO_S1).hitRate / planned(frame);

    it('does not change the shot frames', () => {
      expect(on.shots[0]!.frames).toEqual(off.shots[0]!.frames);
    });

    it('raises the gauge of a shot by the H2 ratio of the stacks in effect (C-0192), and never lowers it', () => {
      const offByShot = new Map(off.shotGauges.map((g) => [g.shotFrame, g.energy]));
      const ratios = on.shotGauges.map((g) => ({ frame: g.shotFrame, r: g.energy / offByShot.get(g.shotFrame)! }));
      expect(ratios.every(({ r }) => r >= 1 - 1e-12)).toBe(true);
      const raised = ratios.filter(({ r }) => r > 1 + 1e-12);
      expect(raised.length).toBeGreaterThan(0);
      for (const { frame, r } of raised) {
        const candidates = [1, 2, 3].map((k) => ratioWith(frame, k));
        expect(candidates.some((c) => Math.abs(c - r) < 1e-9)).toBe(true);
      }
      // 帯の値 1 つの区間（遠など）では、H2 の比そのもの
      const p = planned(raised.find(({ frame }) => planned(frame) < 0.8)!.frame);
      expect(ratioWith(raised.find(({ frame }) => planned(frame) < 0.8)!.frame, 2)).toBeCloseTo(
        bulletHitRateWithHitRateUp(p, 2 * MISATO_S1) / p,
        12,
      );
      // 3 段が重なる発がある（SMG の遠では約 1.13 倍）
      const far = raised.filter(({ frame }) => planned(frame) < 0.8);
      expect(
        far.some(
          ({ frame, r }) =>
            Math.abs(r - bulletHitRateWithHitRateUp(planned(frame), 3 * MISATO_S1) / planned(frame)) < 1e-9,
        ),
      ).toBe(true);
    });

    it('fills the gauge no later than without the timed hit rate', () => {
      const fullOn = on.schedule!.gaugeFullFrames ?? [];
      const fullOff = off.schedule!.gaugeFullFrames ?? [];
      expect(fullOn.length).toBeGreaterThan(0);
      expect(fullOn[0]!).toBeLessThanOrEqual(fullOff[0]!);
    });

    it('raises the expected hits of a shot the same way as the gauge', () => {
      const log = on.shots[0]!;
      const offLog = off.shots[0]!;
      expect(log.hits!.some((h, k) => h > offLog.hits![k]!)).toBe(true);
      expect(log.coreHits!.some((h, k) => h > offLog.coreHits![k]!)).toBe(true);
    });
  });

  it('agrees with the state windows of planBuffTimeline (stacks included)', () => {
    const { plan, first } = firstPassOf(team([fixedSlot(833)]));
    expect(first.shots).toEqual(plan.shots);
    expect(first.hitWindows.length).toBeGreaterThan(0);
    expect(first.hitWindows.map(key).sort()).toEqual(plan.timeline.stateWindows.map(key).sort());
  });

  describe('アスカのバースト（設計書 0.1 節）', () => {
    // リター（I）・デルタ（II）・アスカ（III）
    const slots = () => [fixedSlot(82), fixedSlot(20), fixedSlot(830)];
    const { plan, first } = firstPassOf(team(slots()));
    const off = planTeamRun(team(slots(), false));

    it('tracks the windows, which lie inside the full burst windows', () => {
      const asuka = first.hitWindows.filter((w) => w.slotIndex === 2);
      expect(asuka.length).toBeGreaterThan(0);
      const fb = plan.schedule!.fullBurstWindows;
      for (const w of asuka) expect(fb.some((b) => b.start <= w.start && w.end <= b.end)).toBe(true);
    });

    it('leaves the schedule and the gauge as without the timed hit rate', () => {
      expect(plan.schedule).toEqual(off.schedule);
      // 記録には、フルバースト中（ゲージを足さない）の発の上がった値も残る。足す発（フルバーストの外）は同じ
      const fb = plan.schedule!.fullBurstWindows;
      const outside = (g: { frame: number }) => !fb.some((b) => b.start <= g.frame && g.frame < b.end);
      expect(plan.shotGauges.filter(outside)).toEqual(off.shotGauges.filter(outside));
    });
  });

  it('does not track the windows for manual slots', () => {
    const { first } = (() => {
      const input = team([fixedSlot(833, false)]);
      const frames = battleSecondsToFrames(input.durationSeconds);
      return {
        first: runFirstPass(toTimelineSlots(input.slots), {
          frames,
          burst: true,
          hitRates: [null],
          hitRateWith: () => {
            throw new Error('not called for manual slots');
          },
        }),
      };
    })();
    expect(first.hitWindows).toEqual([]);
    const manualOn = planTeamRun(team([fixedSlot(833, false)]));
    const manualOff = planTeamRun(team([fixedSlot(833, false)], false));
    expect(manualOn.schedule).toEqual(manualOff.schedule);
  });
});
