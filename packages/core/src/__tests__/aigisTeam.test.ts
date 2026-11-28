// アイギス編（plan/design-aigis.md）: アイギス（872）を含む編成で、S1 のペルソナ - パラディオン（戦闘の始めから終わりまでの攻撃力▲）と、
// S2 のパピヨンハート（バースト使用時から次のフルバーストの終わりまでの、味方全体の発動者基準の攻撃力▲）が意図どおりに出るか。
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { effectFrameOf, hexagonFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import { staticStatesOf } from '../skills/types.ts';
import { runSimulation } from '../sim/engine.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import { battleSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedEnemy, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const AIGIS = 872;
const REI = 392;
const ALICE = 191;
const QUEEN_TRUE = 870;
const YUKIKO = 871;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

const TEAMS: Record<string, TeamInput> = {
  'ライ + アイギス + アリス（撮影の編成）': fixedTeam([REI, AIGIS, ALICE].map(autoSlot), 1, { enemy: rangeEnemy }),
  // ペルソナの 3 体（1more の起きる風圧の敵）。クイーン（真）の S2 のバトンタッチと雪子の S2 の追撃は III のペルソナ状態の味方に絞るので、
  // II のアイギスには付かない
  '実戦寄り（ライ + アイギス + クイーン（真）+ 雪子）': fixedTeam([REI, AIGIS, QUEEN_TRUE, YUKIKO], 2, {
    enemy: fixedEnemy({ element: 'Wind' }),
  }),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const a = input.slots.findIndex((x) => x?.character.resourceId === AIGIS);
  const plan = planTeamRun(input);
  const windows = plan.schedule!.fullBurstWindows;
  const mine = plan.schedule!.activations.filter((x) => x.slotIndex === a).map(effectFrameOf);

  it('holds Persona on herself for the whole battle (a static state), with its ATK up as a passive of hers only', () => {
    expect(staticStatesOf(input.slots[a]!.skills!.definition)).toEqual(['persona']);
    expect(itemsOf(plan.history, { sourceSlotIndex: a, state: 'persona' })).toEqual([]);
    const sim = runSimulation(input);
    sim.slots.forEach((slot, i) => {
      const parts = slot!.passiveBuffs.attackParts.filter((x) => x.source === '872.skill1');
      expect(parts.map((x) => x.ratio)).toEqual(i === a ? [0.2112] : []);
    });
  });

  it('gives every ally caster-based ATK up from each of her Bursts until the next Full Burst ends', () => {
    expect(mine.length).toBeGreaterThan(3);
    for (const holder of input.slots.keys()) {
      const up = itemsOf(plan.history, { sourceSlotIndex: a, holder, kind: 'timed', skill: 'skill2', stat: 'attack' });
      for (const f of mine.filter((x) => x < plan.frames)) {
        const end = windows.find((w) => w.end > f)?.end ?? plan.frames;
        // 時間切れのチェーンの分も、次のフルバーストの終わりまで続く（窓は 1 つにまとまる）
        expect(up.some((w) => w.start <= f && end === w.end)).toBe(true);
      }
      for (const w of up) {
        expect(mine).toContain(w.start);
        expect(w.end === plan.frames || windows.some((x) => x.end === w.end)).toBe(true);
      }
    }
  });

  it('hits once at every Burst use of hers, 1f before the II mark (C-1607)', () => {
    const { hitFrames } = burstDelaysOf(input.slots[a]!.character);
    expect(hitFrames).toBe(-1);
    const activations = plan.schedule!.activations.filter((x) => x.slotIndex === a);
    for (const x of activations) expect(hitFramesOf(x)).toEqual([hexagonFrameOf(x) + hitFrames]);
  });

  it('builds the same items inside the first pass as from the final inputs (verifyItems)', () => {
    const { slots } = applyCompositionToTeam(applyTreasureToTeam(input));
    expect(() =>
      runFirstPass(toTimelineSlots(slots), {
        frames: battleSecondsToFrames(input.durationSeconds),
        burst: true,
        controlledSlot: input.controlledSlot ?? null,
        verifyItems: true,
      }),
    ).not.toThrow();
  });
});

describe('ライ + アイギス + アリス（撮影の編成）', () => {
  const plan = planTeamRun(TEAMS['ライ + アイギス + アリス（撮影の編成）']!);

  it('alternates a chain into Full Burst and a chain timing out after her Burst (Alice is on cooldown)', () => {
    expect(plan.schedule!.fullBurstWindows.length).toBe(5);
    expect(plan.schedule!.chainTimeouts.length).toBe(4);
  });
});

describe('実戦寄り（ライ + アイギス + クイーン（真）+ 雪子）', () => {
  const plan = planTeamRun(TEAMS['実戦寄り（ライ + アイギス + クイーン（真）+ 雪子）']!);

  it('gives Baton Pass to Yukiko and Follow Up to Queen (True), but neither to her (Burst II)', () => {
    expect(itemsOf(plan.history, { holder: 3, kind: 'state', state: 'batonPass' }).length).toBeGreaterThan(0);
    expect(itemsOf(plan.history, { holder: 2, kind: 'state', state: 'followUp' }).length).toBeGreaterThan(0);
    for (const state of ['batonPass', 'followUp'] as const)
      expect(itemsOf(plan.history, { holder: 1, kind: 'state', state })).toEqual([]);
  });
});

describeEveryShotInOneGroup(TEAMS);
