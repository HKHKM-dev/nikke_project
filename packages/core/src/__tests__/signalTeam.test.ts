// シグナル編（plan/design-signal.md）: シグナル（22）を含む編成で、S1 の通常攻撃 60 回命中ごとの敵の防御力▼（5 秒。付き直し）と、
// バーストの敵の防御力▼（10 秒）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { hitFrameOf } from '../burst/schedule.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rangeEnemyWithEvents,
  skillValueOf,
} from './teamHelpers.ts';

const SIGNAL = 22;
const FLOWER = 304;
const LITER = 82;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
// S1 の防御力▼（Lv10）
const S1_DOWN = skillValueOf(SIGNAL, 'skill1', 2) / 100;
// S1 の回数（60 回命中）
const S1_EVERY = skillValueOf(SIGNAL, 'skill1', 1);

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  シグナル単騎: team([SIGNAL], 0),
  'I-DOLL・フラワー + シグナル（撮影の編成）': team([FLOWER, SIGNAL], 1),
  '実戦寄り（リター + シグナル + クラウン + アリス + ユニ）': team([LITER, SIGNAL, 330, 191, 160], 1),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === SIGNAL);
  const plan = planTeamRun(input);
  const shots = plan.shots[s]!.frames;
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const uses = plan.schedule?.activations.filter((a) => a.slotIndex === s).map((a) => a.frame) ?? [];

  it('gives the S1 DEF down on the enemy from the frame after a shot, refreshing it every 60 hits instead of stacking', () => {
    // 敵の防御力▼は、味方ごとでなく敵に 1 つの件の列で持つ
    const down = items({ kind: 'timed', skill: 'skill1', stat: 'enemyDefenseDown' });
    expect(down.length).toBeGreaterThan(0);
    for (const w of down) expect(shots, 'starts on the frame after a shot').toContain(w.start - 1);
    // 付き直しで 5 秒より長い窓になり、窓どうしは重ならない（重なる読みなら件が増える）
    for (const w of down)
      if (w.end < plan.frames) expect(w.end - w.start).toBeGreaterThanOrEqual(gameSecondsToFrames(5));
    for (let i = 1; i < down.length; i++) expect(down[i]!.start).toBeGreaterThanOrEqual(down[i - 1]!.end);
    // 60 回命中は 180 秒で数十回あるが、2.5f に 1 発の SMG なので維持の 5 秒の中で付き直し、件は少ない
    expect(down.length).toBeLessThan(shots.length / S1_EVERY / 5);
  });

  if (input.slots.length === 1) {
    it('never uses Burst II alone', () => {
      expect(uses).toEqual([]);
    });
  } else {
    it('gives the Burst DEF down on the enemy for 10 s on every Burst', () => {
      expect(uses.length).toBeGreaterThan(3);
      const down = items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' });
      expect(down.map((w) => w.start)).toEqual(uses);
      for (const w of down) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    });

    it('lands the Burst hit with the DEF down at the activation, without the DEF down of the same activation', () => {
      const mine = plan.schedule!.activations.filter((a) => a.slotIndex === s);
      for (const a of mine) {
        const used = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), s, true);
        expect(used).toEqual(burstSnapshotState(plan.timeline, a.frame, s, true).buffs);
        // バーストの▼が乗っていない（ほかの味方の▼は、この編成の誰も持たない）。遅れの表に行が無いので、ヒットは発動のフレーム
        expect([0, S1_DOWN].some((v) => Math.abs(used.enemyDefenseDown - v) < 1e-12)).toBe(true);
      }
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
