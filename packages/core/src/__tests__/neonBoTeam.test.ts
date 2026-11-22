// ネオン：ブルーオーシャン編（plan/design-neon-bo.md）: ネオン：ブルーオーシャン（14）を含む編成で、S2 の有利コードの攻撃ダメージ▲が
// 段階 3 への突入（II で切れたチェーンも数える）の 1・2・3 回目から段ごとに足され、どれも突入から 10 秒続くこと、バーストの使用武器変更が
// 7 秒で、灼熱コードの敵にだけ変更後の武器の発ごとに追加ダメージが出ることを見る。射撃の列のグループ分け
import { describe, expect, it } from 'vitest';
import { effectFrameOf, stageEnterFrameOf } from '../burst/schedule.ts';
import type { Element } from '../types.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const NEON_BO = 14;

/** 撮影の編成（ココア + ソルジャーF.A. + ネオン：ブルーオーシャン（操作））。ネオンは 3 枠目 */
function rangeTeam(element: Element): TeamInput {
  const slots = [311, 301, NEON_BO].map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemyWithEvents({ element }) });
}

const TEAMS: Record<string, { input: TeamInput; fire: boolean }> = {
  '撮影の編成・灼熱の敵': { input: rangeTeam('Fire'), fire: true },
  '撮影の編成・水冷の敵': { input: rangeTeam('Water'), fire: false },
  '実戦寄り（リター + クラウン + ネオン：ブルーオーシャン + 紅蓮 + ソルジャーE.G.）・灼熱の敵': {
    input: fixedTeam([82, 330, NEON_BO, 222, 300], 2, { enemy: rangeEnemyWithEvents({ element: 'Fire' }) }),
    fire: true,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (name, { input, fire }) => {
  const n = input.slots.findIndex((s) => s?.character.resourceId === NEON_BO);
  const plan = planTeamRun(input);
  const schedule = plan.schedule!;
  const entries = schedule.activations
    .filter((a) => a.enteredStep === 'Step3')
    .map((a) => stageEnterFrameOf(a, schedule.model))
    .filter((f) => f < plan.frames);
  const mine = schedule.activations.filter((a) => a.slotIndex === n);

  it('adds one Elemental Advantage tier from each of the first three Stage 3 entries, each for 10 seconds', () => {
    const tiers = itemsOf(plan.history, { holder: n, kind: 'timed', skill: 'skill2', stat: 'elementDamage' });
    expect(entries.length).toBeGreaterThanOrEqual(3);
    for (let k = 0; k < 3; k++) {
      const tier = tiers
        .filter((w) => w.origin.kind === 'timed' && w.origin.effect.effectIndex === k)
        .map((w) => w.start)
        .sort((a, b) => a - b);
      // k 段目は k + 1 回目以降の突入のたびに付く
      expect(tier).toEqual(entries.slice(k));
    }
    // 戦闘の終わりで切れる窓を除き、突入から 10 秒
    for (const w of tiers) expect(w.end).toBe(Math.min(w.start + gameSecondsToFrames(10), plan.frames));
  });

  it('counts Stage 3 entries of chains that end at II (more entries than own Bursts in the capture team)', () => {
    // 撮影の編成では、ネオンの CT が明けずに II で切れるチェーンが挟まる
    if (name.startsWith('撮影の編成')) expect(entries.length).toBeGreaterThan(mine.length);
    else expect(entries.length).toBeGreaterThanOrEqual(mine.length);
  });

  it('changes the weapon for 7 seconds on each Burst, with an additional hit per changed shot only against Fire', () => {
    const weapon = itemsOf(plan.history, { holder: n, kind: 'timed', skill: 'burst', stat: 'weapon' });
    const uses = mine.map(effectFrameOf).filter((f) => f < plan.frames);
    expect(weapon.length).toBe(uses.length);
    expect(weapon.length).toBeGreaterThanOrEqual(2);
    // 変更は発火の次のフレームから効き、発火から 7 秒で終わる
    weapon.forEach((w, k) => {
      expect(w.start).toBe(uses[k]! + 1);
      expect(w.end).toBe(Math.min(uses[k]! + gameSecondsToFrames(7), plan.frames));
    });
    const changed = plan.shots[n]!.weaponChangeShotFrames ?? [];
    expect(changed.length).toBeGreaterThan(0);
    const additional = plan.skillHits.filter((h) => h.slotIndex === n && h.effect.source.skill === 'burst');
    expect(additional.map((h) => h.frame)).toEqual(fire ? changed : []);
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([k, v]) => [k, v.input])));
