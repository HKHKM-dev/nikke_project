// バーストのヒットは、撃つ側のバフも敵の側のデバフ（受けるダメージ▲・防御力▼）も発動の時点の値で見る
// （C-0795。plan/design-burst-landing.md 11 節）。発動の後・ヒットの前に付いた敵の側のデバフは、ヒットの時点で付いていても乗らない。
// 編成は、ルドミラ（I。ヒットは I の発動から遅れる。C-0675）・ブラン（II。使った時から付く受けるダメージ▲。C-0692）・
// プリバティ：アンカインド・メイド（III）。ブランの▲は、II まで進んだ回は毎回ルドミラの発動の後・ヒットの前に付く。
// 防御力▼の側は、ブランをエレグ（II。バーストのヒットから敵に付くブームインストールの防御力▼。C-0690）に替えた編成で見る
import { describe, expect, it } from 'vitest';
import { hitFrameOf } from '../burst/schedule.ts';
import { computeTriggerDamage, defenceAfterDown } from '../damage.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { fixedTeam, skillValueOf } from './teamHelpers.ts';

const LUDMILLA = 0;
const BLANC = 1;
const PRIVATY = 2;
// ブランのバーストの受けるダメージ▲（Lv10。C-0692）
const BLANC_DAMAGE_TAKEN = 0.3926;

const input = fixedTeam([190, 270, 313], LUDMILLA, { burstModel: 'dynamic' });

describe('バーストのヒットが敵の側のデバフを見る時点（C-0795）', () => {
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations;
  // II（ブラン）まで進んだ回の I の発動
  const chained = activations.filter((a, k) => a.slotIndex === LUDMILLA && activations[k + 1]?.slotIndex === BLANC);

  it("uses the enemy debuffs at the use, not at the hit: Blanc's ▲ from II is on at Ludmilla's hit but not used", () => {
    expect(chained.length).toBeGreaterThan(0);
    for (const a of chained) {
      const hitFrame = hitFrameOf(a);
      const atHit = burstSnapshotState(plan.timeline, hitFrame, LUDMILLA, true).buffs;
      const atUse = burstSnapshotState(plan.timeline, a.frame, LUDMILLA, true).buffs;
      expect(atHit.damageTaken).toBeCloseTo(atUse.damageTaken + BLANC_DAMAGE_TAKEN, 12);
      expect(burstHitBuffs(plan.timeline, a.frame, hitFrame, LUDMILLA, true)).toEqual(atUse);
    }
  });

  it("leaves Blanc's ▲ off Ludmilla's burst hits and on Privaty's (used after the ▲)", () => {
    const sim = runSimulation(input);
    const ludmilla = sim.slots[LUDMILLA]!.burst.hits;
    const privaty = sim.slots[PRIVATY]!.burst.hits;
    expect(ludmilla.length).toBeGreaterThan(chained.length);
    expect(privaty.length).toBeGreaterThan(0);
    for (const h of ludmilla) expect(h.damageTakenMultiplier).toBe(1);
    for (const h of privaty) expect(h.damageTakenMultiplier).toBeCloseTo(1 + BLANC_DAMAGE_TAKEN, 12);
  });
});

// 防御力▼の側（enemyDefenseDown）: エレグ（II）のヒット（II の発動の 35f 後）は、毎回ルドミラ（I）の発動の後・ヒットの前に来る
describe('バーストのヒットが敵の防御力▼を見る時点（C-0795）', () => {
  const ELEGG = 1;
  // ブームインストールの防御力▼（エレグのバーストの値 04。C-0690）
  const BOOM_DEFENSE_DOWN = skillValueOf(500, 'burst', 4) / 100;
  const withElegg = fixedTeam([190, 500, 313], LUDMILLA, { burstModel: 'dynamic' });
  // 計画（時刻表・区間）もバーストのヒットも、1 回の sim から読む
  const sim = runSimulation(withElegg);
  const activations = sim.schedule!.activations;
  const ludmilla = activations.filter((a) => a.slotIndex === LUDMILLA);

  it("uses the defense decrease at the use: Elegg's ▼ from her hit is on at Ludmilla's hit but not used", () => {
    expect(ludmilla.length).toBeGreaterThan(1);
    for (const a of ludmilla) {
      const elegg = activations.find((b) => b.slotIndex === ELEGG && b.frame > a.frame)!;
      expect(a.frame < hitFrameOf(elegg) && hitFrameOf(elegg) < hitFrameOf(a)).toBe(true);
      const atHit = burstSnapshotState(sim.timeline, hitFrameOf(a), LUDMILLA, true).buffs;
      const atUse = burstSnapshotState(sim.timeline, a.frame, LUDMILLA, true).buffs;
      expect(atHit.enemyDefenseDown).toBeCloseTo(atUse.enemyDefenseDown + BOOM_DEFENSE_DOWN, 12);
      expect(burstHitBuffs(sim.timeline, a.frame, hitFrameOf(a), LUDMILLA, true)).toEqual(atUse);
    }
  });

  it("subtracts the enemy's defense at the use from Ludmilla's burst hits", () => {
    const hits = sim.slots[LUDMILLA]!.burst.hits;
    expect(hits).toHaveLength(ludmilla.length);
    const slot = withElegg.slots[LUDMILLA]!;
    hits.forEach((h, k) => {
      const a = ludmilla[k]!;
      const atUse = burstSnapshotState(sim.timeline, a.frame, LUDMILLA, true).buffs;
      const atHit = burstSnapshotState(sim.timeline, hitFrameOf(a), LUDMILLA, true).buffs;
      const { attack } = computeTriggerDamage({
        ...slot,
        enemy: withElegg.enemy,
        buffs: atUse,
        condition: slot.condition,
      });
      expect(h.baseHit).toBe(attack - defenceAfterDown(withElegg.enemy, atUse));
      expect(defenceAfterDown(withElegg.enemy, atHit)).toBeLessThan(defenceAfterDown(withElegg.enemy, atUse));
    });
  });
});
