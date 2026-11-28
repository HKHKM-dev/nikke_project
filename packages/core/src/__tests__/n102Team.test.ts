// N102（120。V-0851）を含む編成で、S1 のフルチャージの発ごとの最大装弾数▲・クリティカルダメージ▲、S2 の CT ごとの
// チャージダメージ▲（最終攻撃力が最も高い味方 1 機）、バーストの味方全体への攻撃力▲が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { firingMetrics } from '../records/observations/metrics/firing.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const N102 = 120;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const S2_DELAY = 28;

describe('N102 の定義', () => {
  const def = parseSkillDefinition(rawDefinition(N102));

  it('defines the S1 ups on full charge shots, the S2 charge damage up on a cooldown and the Burst ATK up', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'timed', trigger: { count: 'fullChargeShot' }, target: 'topAttack', stat: 'maxAmmo', scaling: 'flat' },
      { kind: 'timed', trigger: { count: 'fullChargeShot' }, target: 'topAttack', stat: 'critDamage' },
    ]);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects).toMatchObject([
      {
        kind: 'timed',
        trigger: { everySeconds: 15, cooldown: true },
        target: 'topAttack',
        stat: 'chargeDamage',
        delayFrames: S2_DELAY,
      },
    ]);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'attack' },
    ]);
  });
});

/** 編成と、N102 の枠 */
const CASES: Record<string, { input: TeamInput; n102: number; solo: boolean }> = {
  '撮影の編成（N102 の単騎・操作。V-0851）': {
    input: fixedTeam([N102], 0, { enemy: rangeEnemy }),
    n102: 0,
    solo: true,
  },
  '実戦寄り（N102 + アリス（操作） + エミリア + A2 + アニス：スター）': {
    input: fixedTeam([N102, 191, 821, 811, 17], 1),
    n102: 0,
    solo: false,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, n102, solo }) => {
  const sim = runSimulation(input);
  const rankingsOf = (skill: 'skill1' | 'skill2') =>
    sim.history.rankings.filter((r) => r.sourceSlotIndex === n102 && r.effect.source.skill === skill);

  it('gives the S1 ups to the ally with the highest final ATK at each full charge shot (C-1512, C-1513)', () => {
    const shots = sim.shots[n102]!.frames;
    const rankings = rankingsOf('skill1');
    expect(rankings.length).toBeGreaterThan(10);
    // 順位は N102 のフルチャージの発ごとに出し、対象は 1 機
    for (const r of rankings) {
      expect(shots).toContain(r.frame);
      expect(r.targets).toHaveLength(1);
    }
    const targets = new Set(rankings.flatMap((r) => r.targets));
    if (!solo) expect(targets.has(n102)).toBe(false);
    for (const stat of ['maxAmmo', 'critDamage'] as const) {
      const holders = new Set(
        itemsOf(sim.history, { sourceSlotIndex: n102, kind: 'timed', skill: 'skill1', stat }).map((w) => w.holder),
      );
      expect(holders).toEqual(targets);
    }
  });

  it('fires the S2 every 15 s and gives the charge damage up for 5 s from 28 frames after each activation (C-1514)', () => {
    const rankings = rankingsOf('skill2');
    // 180 秒の戦闘で 15・30・…・165 秒の 11 回（V-0851 の録画も 11 回）
    expect(rankings.length).toBe(11);
    const windows = itemsOf(sim.history, {
      sourceSlotIndex: n102,
      kind: 'timed',
      skill: 'skill2',
      stat: 'chargeDamage',
    });
    expect(windows.map((w) => w.holder)).toEqual(rankings.map((r) => r.targets[0]));
    for (const [k, r] of rankings.entries()) {
      // 発動は 15 秒ごと（1 回目も 15 秒。1 周期は 15 秒に達した最初のティック）
      expect(r.frame).toBeGreaterThanOrEqual(gameSecondsToFrames(15) * (k + 1));
      expect(r.frame).toBeLessThanOrEqual(gameSecondsToFrames(15) * (k + 1) + k + 2);
      // 窓は発動の 28f 後から 5 秒（順位は発動を出来事にしたフレーム = 発動の次のフレームで出す）
      const w = windows[k]!;
      expect(w.start - (r.frame - 1)).toBe(S2_DELAY);
      if (w.end < sim.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
    }
  });

  it('gives every ally the Burst ATK up for 10 s on each N102 Burst (C-1515)', () => {
    const uses = sim.schedule!.activations.filter((a) => a.slotIndex === n102);
    const starts = uses.map((a) => effectFrameOf(a)).filter((f) => f < sim.frames);
    expect(starts.length).toBeGreaterThan(1);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(sim.history, {
        sourceSlotIndex: n102,
        holder,
        kind: 'timed',
        skill: 'burst',
        stat: 'attack',
      });
      expect(items.map((w) => w.start)).toEqual(starts);
    }
  });

  it.runIf(solo)('fires 6 shots in the first magazine and 9 afterwards (C-1512)', () => {
    const magazines = firingMetrics.magazineShots!.sim(sim, { args: { slot: n102 + 1, count: 9 }, input }) as number[];
    expect(magazines).toEqual([6, 9, 9, 9, 9, 9, 9, 9, 9]);
  });
});
