// 2B 編（plan/design-2b.md）: 2B（810）を含む編成で、S1 の開始回数別の最大HP▲ がバーストの 1・2・3 回目の使用から段ごとに足され、
// S2 の戦闘開始時の攻撃力▲がその最終最大HP を追って上がること、300 回射撃ごとの倍率ダメージが 300 の倍数の発の 45f 後に出ること、
// バーストの分配ダメージが 1 ヒットで、追加ダメージが S1 の効果の発火の 36f 後に出ることを見る（時刻は遅れの表の行）。
import { describe, expect, it } from 'vitest';
import { effectFrameOf, hitFramesOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const TWO_B = 810;
const TIERS = [10.03, 20.06, 57.76];

/** 撮影の編成。2B は 3 枠目（操作） */
function rangeTeam(ids: readonly number[]): TeamInput {
  const slots = ids.map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemyWithEvents() });
}

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ココア + ソルジャーF.A. + 2B）': rangeTeam([311, 301, TWO_B]),
  '実戦寄り（リター + クラウン + 2B + 紅蓮 + ソルジャーE.G.）': fixedTeam([82, 330, TWO_B, 222, 300], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const b = input.slots.findIndex((s) => s?.character.resourceId === TWO_B);
  const plan = planTeamRun(input);
  const mine = plan.schedule!.activations.filter((a) => a.slotIndex === b);
  const uses = mine.map(effectFrameOf);
  const tiers = itemsOf(plan.history, { holder: b, kind: 'timed', skill: 'skill1', stat: 'maxHp' });

  it('adds one Max HP tier from each of the first three Burst uses and keeps them to the end', () => {
    expect(uses.length).toBeGreaterThanOrEqual(1);
    for (let k = 0; k < Math.min(3, uses.length); k++) {
      const tier = tiers.filter((w) => w.origin.kind === 'timed' && w.origin.effect.effectIndex === k);
      expect(tier.length).toBeGreaterThan(0);
      expect(Math.min(...tier.map((w) => w.start))).toBe(uses[k]);
      expect(Math.max(...tier.map((w) => w.end))).toBeGreaterThanOrEqual(plan.frames);
    }
    // 4 回目以降のバーストで新しい段は無い
    expect(new Set(tiers.map((w) => (w.origin.kind === 'timed' ? w.origin.effect.effectIndex : -1))).size).toBe(
      Math.min(3, uses.length),
    );
  });

  it('raises the S2 ATK increase with the final max HP after each tier', () => {
    const sim = runSimulation(input);
    // S2 の▲（2B の skill2 の固定加算）だけを見る（味方の攻撃力▲は別の小片）
    const s2At = (f: number) =>
      sim.slots[b]!.segments.find((g) => g.start <= f && f < g.end)!.buffs.attackParts.find(
        (x) => x.source === '810.skill2',
      )!.flat;
    // 戦闘開始の▲から、枠のバフ前の最大HP を逆に出す（段の無い間の値）
    const hp = s2At(0) / 0.0616;
    expect(hp).toBeGreaterThan(1_000_000);
    let sum = 0;
    for (let k = 0; k < Math.min(3, uses.length); k++) {
      sum += TIERS[k]! / 100;
      expect(s2At(uses[k]! + 1)).toBeCloseTo(hp * (1 + sum) * 0.0616, 3);
    }
  });

  it('hits S2 45 frames after every 300th own shot', () => {
    const shots = plan.shots[b]!.frames;
    const hits = plan.skillHits
      .filter((h) => h.slotIndex === b && h.effect.source.skill === 'skill2')
      .map((h) => h.frame);
    const expected = shots.filter((_, i) => (i + 1) % 300 === 0).map((f) => f + 45);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits).toEqual(expected.filter((f) => f < plan.frames));
  });

  it('hits the distributed damage once per Burst and the additional damage 36 frames after the effects', () => {
    for (const a of mine) expect(hitFramesOf(a).length).toBe(1);
    const additional = plan.skillHits
      .filter((h) => h.slotIndex === b && h.effect.source.skill === 'burst')
      .map((h) => h.frame);
    expect(additional).toEqual(uses.map((f) => f + 36).filter((f) => f < plan.frames));
  });
});
