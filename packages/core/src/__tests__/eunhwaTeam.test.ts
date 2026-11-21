// ウンファ編（plan/design-eunhwa.md。V-0809）: ウンファ（92）を含む編成で、S1 の最後の弾丸の後の 2 発間のチャージダメージ▲・
// チャージ速度▲、S2 の最後の弾丸の後の敵の防御力▼（5 秒）、バーストの敵の防御力▼と味方全体のクリティカル確率▲（15 秒）が
// 意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
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

const EUNHWA = 92;
const FLOWER = 304;
const LITER = 82;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
// バーストの防御力▼（Lv10）
const BURST_DOWN = skillValueOf(EUNHWA, 'burst', 3) / 100;
// S2 の防御力▼（Lv10）
const S2_DOWN = skillValueOf(EUNHWA, 'skill2', 1) / 100;

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  'ウンファ単騎（撮影 A の編成）': team([EUNHWA], 0),
  'I-DOLL・フラワー + ウンファ（撮影 B の編成）': team([FLOWER, EUNHWA], 1),
  'リター + ウンファ（撮影 C の編成）': team([LITER, EUNHWA], 1),
  '実戦寄り（リター + ウンファ + クラウン + アリス + ユニ）': team([LITER, EUNHWA, 330, 191, 160], 1),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const e = input.slots.findIndex((x) => x?.character.resourceId === EUNHWA);
  const plan = planTeamRun(input);
  const shots = plan.shots[e]!.frames;
  const lastShots = plan.shots[e]!.lastShotFrames ?? [];
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: e, ...filter });
  const uses = plan.schedule?.activations.filter((a) => a.slotIndex === e).map((a) => a.frame) ?? [];

  it('gives S1 charge damage up and charge speed up from the frame after each last bullet through the second shot after it', () => {
    expect(lastShots.length).toBeGreaterThan(10);
    for (const stat of ['chargeDamage', 'chargeSpeed'] as const) {
      const up = items({ holder: e, kind: 'timed', skill: 'skill1', stat });
      const done = up.filter((w) => shots.indexOf(w.start - 1) + 2 < shots.length);
      expect(done.length).toBeGreaterThan(10);
      for (const w of done) {
        expect(lastShots, stat).toContain(w.start - 1);
        expect(w.end, stat).toBe(shots[shots.indexOf(w.start - 1) + 2]! + 1);
      }
    }
  });

  it('gives the S2 DEF down on the enemy for 5 s from the frame after each last bullet', () => {
    // 敵の防御力▼は、味方ごとでなく敵に 1 つの件の列で持つ
    const down = items({ kind: 'timed', skill: 'skill2', stat: 'enemyDefenseDown' });
    expect(down.length).toBeGreaterThan(10);
    expect(down.map((w) => w.start - 1)).toEqual(lastShots.slice(0, down.length));
    for (const w of down) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
  });

  if (input.slots.length === 1) {
    it('never uses Burst II alone', () => {
      expect(uses).toEqual([]);
    });
  } else {
    it('gives the Burst DEF down on the enemy and crit rate up to every ally for 15 s on every Burst', () => {
      expect(uses.length).toBeGreaterThan(3);
      const windows = [
        items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' }),
        ...[...input.slots.keys()].map((holder) => items({ holder, kind: 'timed', skill: 'burst', stat: 'critRate' })),
      ];
      for (const up of windows) {
        expect(up.map((w) => w.start)).toEqual(uses);
        for (const w of up) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(15));
      }
    });

    it('lands the Burst hit 1 frame before the II mark, without the DEF down of the same activation (C-1379, C-1380)', () => {
      const mine = plan.schedule!.activations.filter((a) => a.slotIndex === e);
      for (const a of mine) expect(hitFrameOf(a)).toBe(hexagonFrameOf(a) - 1);
      // 発動の時点の値で出すので、同じ発動の▼（ヒットの時点では付いている）は乗らない
      for (const a of mine) {
        const atHit = burstSnapshotState(plan.timeline, hitFrameOf(a), e, true).buffs;
        const used = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), e, true);
        const atUse = burstSnapshotState(plan.timeline, a.frame, e, true).buffs;
        expect(used).toEqual(atUse);
        // この編成でほかに敵の防御力▼を付けるのは S2 だけなので、使う値は 0 か S2 の値（バーストの▼が入っていない）
        expect([0, S2_DOWN].some((v) => Math.abs(used.enemyDefenseDown - v) < 1e-12)).toBe(true);
        expect(atHit.enemyDefenseDown).toBeGreaterThanOrEqual(BURST_DOWN - 1e-12);
      }
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
