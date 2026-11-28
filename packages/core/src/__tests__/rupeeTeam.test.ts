// ルピー編（plan/design-rupee.md。V-0820）: ルピー（200）を含む編成で、S1 の命中 100 回ごとの鉄甲コードの味方へのスタック量▲と
// クリティカル確率▲、S2 の撃った 30 発ごとのマイレージのスタック、バーストのマイレージのフルスタックの時の味方全体の攻撃力▲が
// 意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const RUPEE = 200;
const COCOA = 311;
const JULIA = 150;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  ルピー単騎: team([RUPEE], 0),
  'ココア + ルピー（撮影 A の編成）': team([COCOA, RUPEE], 1),
  // ジュリア（鉄甲）のクレッシェンド（上限のある状態）に、ルピーの S1 のスタック量▲が足される
  '実戦寄り（リター + ルピー + ジュリア + アリス + クラウン）': fixedTeam([82, RUPEE, JULIA, 191, 330], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const r = input.slots.findIndex((x) => x?.character.resourceId === RUPEE);
  const plan = planTeamRun(input);
  const shots = plan.shots[r]!.frames;
  const mileage = itemsOf(plan.history, { holder: r, kind: 'state', state: 'mileage' });
  const s1 = itemsOf(plan.history, { sourceSlotIndex: r, holder: r, kind: 'timed', skill: 'skill1', stat: 'critRate' });
  const s1Starts = [...new Set(s1.map((w) => w.start))].sort((a, b) => a - b);
  const stackAt = (f: number) =>
    Math.max(0, ...mileage.filter((w) => w.start <= f && f < w.end).map((w) => w.stack ?? 1));
  const uses = plan.schedule?.activations.filter((a) => a.slotIndex === r).map((a) => a.frame) ?? [];

  it('gives the S1 crit rate up for at least 10 s on every 100 hits', () => {
    // 付き直しが前の窓の中なら、窓はつながる（上書き延長）
    expect(s1Starts.length).toBeGreaterThan(5);
    for (const w of s1)
      if (w.end < plan.frames) expect(w.end - w.start).toBeGreaterThanOrEqual(gameSecondsToFrames(10));
  });

  it('stacks Mileage on every 30th shot and adds one more on the first S1 before full stacks', () => {
    const grants = [...new Set(mileage.map((w) => w.start))].sort((a, b) => a - b);
    const firstS1 = s1Starts[0]!;
    // 30・60・90 発目（付くのは発の次のフレーム）で 1〜3 段、1 回目の S1 で 4 段、120 発目で 5 段（フルスタック）
    expect(grants.slice(0, 5)).toEqual([shots[29]! + 1, shots[59]! + 1, shots[89]! + 1, firstS1, shots[119]! + 1]);
    expect(stackAt(firstS1)).toBe(4);
    expect(stackAt(shots[119]! + 1)).toBe(5);
    // 撃ち続ける間は 15 秒の維持より短い間で付き直すので、フルスタックのまま切れない。上限の 5 を超えない
    expect(Math.max(...mileage.map((w) => w.stack ?? 1))).toBe(5);
    for (const f of shots.filter((s) => s > shots[119]! + 1)) expect(stackAt(f)).toBe(5);
  });

  if (input.slots.length === 1) {
    it('never uses Burst II alone', () => {
      expect(uses).toEqual([]);
    });
  } else {
    it('lands the Burst hit 89 frames after the II mark, without the ATK up of the same activation (C-1421)', () => {
      const mine = plan.schedule!.activations.filter((a) => a.slotIndex === r);
      expect(mine.length).toBeGreaterThan(3);
      for (const a of mine) {
        expect(hitFrameOf(a)).toBe(hexagonFrameOf(a) + 89);
        // 発動の時点の値で出す（ヒットの時点では同じ発動の攻撃力▲が付いている）
        const used = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), r, true);
        expect(used).toEqual(burstSnapshotState(plan.timeline, a.frame, r, true).buffs);
        // フルスタックで使った回は、ヒットの時点で同じ発動の攻撃力▲が付いている
        if (stackAt(a.frame) === 5)
          expect(burstSnapshotState(plan.timeline, hitFrameOf(a), r, true).buffs.attackRatio).toBeGreaterThan(
            used.attackRatio,
          );
      }
    });

    it('gives every ally ATK up for 5 s only on the Bursts used at full Mileage', () => {
      expect(uses.length).toBeGreaterThan(3);
      const full = uses.filter((f) => stackAt(f) === 5);
      // 撮影の編成では、1 回目のバースト（約 15 秒）より前にフルスタックになる
      if (input.slots.length === 2) expect(full).toEqual(uses);
      expect(full.length).toBeGreaterThan(3);
      for (const holder of input.slots.keys()) {
        const up = itemsOf(plan.history, { sourceSlotIndex: r, holder, kind: 'timed', skill: 'burst', stat: 'attack' });
        expect(up.map((w) => w.start)).toEqual(full);
        for (const w of up) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
      }
    });
  }

  if (input.slots.some((x) => x?.character.resourceId === JULIA)) {
    it("adds a stack to Julia's Crescendo (an Iron ally) on S1", () => {
      const j = input.slots.findIndex((x) => x?.character.resourceId === JULIA);
      const crescendo = itemsOf(plan.history, { holder: j, kind: 'state', state: 'crescendo' });
      // ジュリアの自分の付与（最後の弾丸の次のフレーム）のほかに始まる段は、ルピーの S1 のスタック量▲で上がった段
      const ownGrants = new Set((plan.shots[j]!.lastShotFrames ?? []).map((f) => f + 1));
      expect(crescendo.filter((w) => ownGrants.has(w.start)).length).toBeGreaterThan(0);
      const bumped = crescendo.filter((w) => !ownGrants.has(w.start));
      expect(bumped.length).toBeGreaterThan(0);
      for (const w of bumped) expect(w.stack ?? 1).toBeGreaterThan(1);
    });
  }
});
