// ヘルム：アクアマリン（353。V-0715）を含む編成で、S1 の 30 命中ごとの追加ダメージとフルバースト開始時の CT▼（下位効果のスタック適用）、
// S2 の 4 秒ごとのダメージと電撃の敵への受けるダメージ▲（5 スタック）、バーストの電撃の敵への追加ダメージが意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { hitFrameOf } from '../burst/schedule.ts';
import { runSimulation } from '../sim/engine.ts';
import { activeItemsAt, itemsOf } from '../skills/holders.ts';
import type { TeamInput } from '../team.ts';
import type { Element } from '../types.ts';
import { describeEveryShotInOneGroup, fixedTeam, fullBurstCooldownCuts, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const HELM_AM = 353;
const enemy = (element: Element | null) => ({ ...SHOOTING_RANGE_ENEMY, element });

const TEAMS: Record<string, TeamInput> = {
  '単騎・電撃の敵': fixedTeam([HELM_AM], 0, { burst: false, enemy: enemy('Electronic') }),
  '撮影 C の編成（I-DOLL・フラワー + ヘルム：AM + I-DOLL・サン）・灼熱の敵': fixedTeam([304, HELM_AM, 308], 2, {
    enemy: enemy('Fire'),
  }),
  '撮影 D の編成・電撃の敵': fixedTeam([304, HELM_AM, 308], 2, { enemy: enemy('Electronic') }),
  '実戦寄り（リター + ヘルム：AM + アリス + クラウン + ドレイク）・電撃の敵': fixedTeam(
    [82, HELM_AM, 191, 330, 101],
    2,
    {
      enemy: enemy('Electronic'),
    },
  ),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const helm = input.slots.findIndex((s) => s?.character.resourceId === HELM_AM);
  const electric = input.enemy.element === 'Electronic';
  const sim = runSimulation(input);
  const hitsOf = (skill: string) =>
    sim.skillHits.filter((h) => h.slotIndex === helm && h.effect.source.skill === skill).map((h) => h.frame);

  it('lands an S2 hit 13 frames after every 236-frame activation', () => {
    const s2 = hitsOf('skill2');
    expect(s2.length).toBeGreaterThan(40);
    s2.forEach((frame, k) => expect(frame).toBe(236 * (k + 1) + 13));
  });

  it('deals the S1 additional damage on some normal shots', () => {
    expect(hitsOf('skill1').length).toBeGreaterThan(40);
  });

  it('stacks the S2 damage taken up only on an Electric enemy, from the frame after each hit, up to 5', () => {
    const filter = { sourceSlotIndex: helm, skill: 'skill2', stat: 'damageTaken' } as const;
    if (!electric) {
      expect(itemsOf(sim.history, filter)).toEqual([]);
      return;
    }
    const s2 = hitsOf('skill2');
    // 受けるダメージ▲は敵（持ち主 −1）が持つ
    const stacksAt = (frame: number) => activeItemsAt(sim.history, -1, frame, filter).length;
    // k 回目（1 始まり）のヒットのフレームには k − 1 スタック、次のフレームから k スタック（5 で止まる）
    s2.slice(0, 8).forEach((frame, i) => {
      expect(stacksAt(frame)).toBe(Math.min(i, 5));
      expect(stacksAt(frame + 1)).toBe(Math.min(i + 1, 5));
    });
    // 5 回目のヒットの後は、付けるたびに維持を数え直すので 5 スタックのまま
    for (let frame = s2[4]! + 1; frame < s2.at(-1)!; frame += 50) expect(stacksAt(frame)).toBe(5);
  });

  it('deals the Burst additional damage only on an Electric enemy, on the frame of each Burst Skill hit', () => {
    const activations = sim.schedule?.activations.filter((a) => a.slotIndex === helm) ?? [];
    if (!input.burst) {
      expect(activations).toEqual([]);
      return;
    }
    expect(activations.length).toBeGreaterThan(0);
    expect(hitsOf('burst')).toEqual(electric ? activations.map((a) => hitFrameOf(a)) : []);
  });

  it('cuts the running Burst Skill cooldowns at each Full Burst by 1.82 s, then 4.02 s, then 6.62 s', () => {
    const schedule = sim.schedule;
    if (schedule === null || schedule.fullBurstWindows.length === 0) return;
    const expected = [107, 236, 388];
    expect(fullBurstCooldownCuts(schedule, helm)).toEqual(
      schedule.fullBurstWindows.map((_, n) => expected[Math.min(n, 2)]),
    );
  });
});

describeEveryShotInOneGroup(TEAMS);
