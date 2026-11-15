// ブレッディ（520）を含む編成（plan/design-bready.md。V-0785）。語彙は skills/__tests__/bready.test.ts。ここでは味方と組んだ時に:
// 味方の持続ダメージ▲が付くたびにやみつきの味、分配ダメージ▲が付くとオススメの味（やみつきの味の外だけ）が付き、どちらもチャージ速度▼で
// 発の間が延びる。やみつきの味の間だけ 3 発ごとにあと味（持続ダメージ）、オススメの味の間だけ発ごとに 6f 後の分配ダメージが出て、バーストの
// あと味効果▲の 10 秒はあと味の tick に乗る。射撃の列のグループ分け。
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { describeEveryShotInOneGroup, fixedTeam } from './teamHelpers.ts';

const BREADY = 520;
const ROSANNA_CO = 283;
const ELEGG = 500;

const TEAMS = {
  'I-DOLL・フラワー + ロザンナ：シックオーシャン + ブレッディ（V-0785 の撮り方 1）': fixedTeam(
    [304, ROSANNA_CO, BREADY],
    2,
  ),
  'I-DOLL・フラワー + エレグ + ブレッディ（V-0785 の撮り方 2）': fixedTeam([304, ELEGG, BREADY], 2),
  '実戦寄り（I-DOLL・フラワー + ロザンナ：シックオーシャン + ブレッディ + エレグ + 紅蓮）': fixedTeam(
    [304, ROSANNA_CO, BREADY, ELEGG, 222],
    2,
  ),
};

const DISTRIBUTED_DELAY = 6;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const b = input.slots.findIndex((s) => s?.character.resourceId === BREADY);
  const plan = planTeamRun(input);
  const lingering = itemsOf(plan.history, { holder: b, state: 'lingeringTaste' });
  const recommended = itemsOf(plan.history, { holder: b, state: 'recommendedTaste' });
  const sustainedUps = itemsOf(plan.history, { holder: b, kind: 'timed', stat: 'sustainedDamage' });
  const distributedUps = itemsOf(plan.history, { holder: b, kind: 'timed', stat: 'distributedDamage' });
  const shots = plan.shots[b]!.frames;
  const hits = plan.skillHits.filter((h) => h.slotIndex === b);
  const inAny = (items: readonly { start: number; end: number }[], f: number) =>
    items.some((w) => w.start <= f && f < w.end);
  const hasRosanna = input.slots.some((s) => s?.character.resourceId === ROSANNA_CO);
  const hasElegg = input.slots.some((s) => s?.character.resourceId === ELEGG);

  it('applies Lingering Taste on each Sustained Damage up and Recommended Taste on a Distributed Damage up outside Lingering Taste', () => {
    expect(lingering.length > 0).toBe(hasRosanna);
    // 付き直しは件を延ばす（付いたフレームから続いている）
    for (const up of sustainedUps) expect(inAny(lingering, up.start)).toBe(true);
    if (lingering.length > 0) expect(lingering[0]!.start).toBe(sustainedUps[0]!.start);
    for (const w of recommended) {
      expect(distributedUps.some((up) => up.start === w.start)).toBe(true);
      expect(inAny(lingering, w.start - 1)).toBe(false);
    }
    // ロザンナ：シックオーシャンのいる編成では、最初の II の後はやみつきの味が切れない（V-0785 の撮り方 3）
    if (!hasRosanna) expect(recommended.length > 0).toBe(hasElegg);
  });

  it('never holds both tastes at once', () => {
    for (const w of recommended) expect(lingering.some((l) => l.start < w.end && w.start < l.end)).toBe(false);
  });

  it('fires Aftertaste only on shots in Lingering Taste and distributed damage 6 frames after shots in Recommended Taste', () => {
    // あと味の tick は付いた瞬間にも出る（atApplication）ので、発と同じフレームの tick が付いたフレーム
    const dotApplies = new Set(
      hits.filter((h) => h.effect.dot !== undefined && shots.includes(h.frame)).map((h) => h.frame),
    );
    for (const f of dotApplies) expect(inAny(lingering, f)).toBe(true);
    const distributed = hits.filter((h) => h.effect.dot === undefined && h.effect.source.skill === 'skill2');
    for (const h of distributed) {
      expect(shots).toContain(h.frame - DISTRIBUTED_DELAY);
      expect(inAny(recommended, h.frame - DISTRIBUTED_DELAY)).toBe(true);
    }
    expect(dotApplies.size > 0).toBe(lingering.length > 0);
    expect(distributed.length > 0).toBe(recommended.length > 0);
  });

  // 味の間はチャージが 1 秒 × (1 + 0.2)。マガジンの中の発の間が、味の外（82f）より 12f 延びる
  it('lengthens the shot interval in a taste by the 20% Charge Speed down', () => {
    const tastes = [...lingering, ...recommended];
    const gaps = shots.slice(1).map((f, i) => ({ at: shots[i]!, gap: f - shots[i]! }));
    const inside = gaps.filter((g) => inAny(tastes, g.at - 72) && g.gap < 100).map((g) => g.gap);
    expect(Math.min(...inside)).toBe(94);
  });
});

describeEveryShotInOneGroup(TEAMS);
