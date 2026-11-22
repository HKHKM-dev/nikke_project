// ミカ編（V-0852）: ミカ（61）を含む編成で、S2 の 20 秒ごとの最大装弾数▲（最終攻撃力が最も高い味方 2 機。自分も候補）と、
// バーストの 2 ヒットと敵の防御力▼（5 秒）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { hexagonFrameOf, hitFrameOf } from '../burst/schedule.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const MICA = 61;
const DELTA = 20;
const FLOWER = 304;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
// S2 の周期（20 秒。C-1517）と維持（10 秒）
const S2_PERIOD = Math.ceil(20 / 0.017);
const S2_DURATION = gameSecondsToFrames(10);

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

// [編成, S2 の対象になりうる rid（発動ごとに、この中の最終攻撃力の上位 2 機。数が 2 以下なら全員）, ミカがバーストを撃つか]
const TEAMS: Record<string, [TeamInput, number[], boolean]> = {
  ミカ単騎: [team([MICA], 0), [MICA], true],
  // I は枠の若いフラワーが撃つ。最終攻撃力はミカ > デルタ > フラワー
  'I-DOLL・フラワー + デルタ + ミカ（撮影の編成）': [team([FLOWER, DELTA, MICA], 2), [DELTA, MICA], false],
  // ミカの最終攻撃力は 5 人で最も低い。上位 2 機は、アリス・リター・クラウンのバフで発動ごとに替わる
  '実戦寄り（ミカ + クラウン + アリス + リター + ユニ）': [team([MICA, 330, 191, 82, 160], 2), [330, 191, 82], true],
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, [input, candidates, bursts]) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === MICA);
  const plan = planTeamRun(input);
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const ridOf = (slot: number) => input.slots[slot]!.character.resourceId;

  it('gives +2 max ammo to the 2 allies with the highest final ATK every 20 s from combat start, for 10 s (C-1517)', () => {
    const up = items({ kind: 'timed', skill: 'skill2', stat: 'maxAmmo' });
    const starts = [...new Set(up.map((w) => w.start))];
    expect(starts.length).toBeGreaterThan(5);
    starts.forEach((f, i) => expect(f).toBe(S2_PERIOD * (i + 1)));
    for (const f of starts) {
      const at = up.filter((w) => w.start === f);
      const got = at.map((w) => ridOf(w.holder));
      expect(got).toHaveLength(Math.min(2, candidates.length));
      for (const rid of got) expect(candidates).toContain(rid);
      for (const w of at) if (w.end < plan.frames) expect(w.end - w.start).toBe(S2_DURATION);
    }
  });

  if (!bursts) {
    it('never uses its Burst when I-DOLL Flower in an earlier slot takes Burst I', () => {
      expect(plan.schedule!.activations.filter((a) => a.slotIndex === s)).toEqual([]);
    });
    return;
  }

  it('lands 2 Burst hits 28 and 63 frames after the I mark, with the DEF down at the activation only (C-1516)', () => {
    const mine = plan.schedule!.activations.filter((a) => a.slotIndex === s);
    expect(mine.length).toBeGreaterThan(2);
    for (const a of mine) {
      expect(hitFrameOf(a)).toBe(hexagonFrameOf(a) + 28);
      expect(a.hitOffsets).toEqual([0, 35]);
      const used = burstHitBuffs(plan.timeline, a.frame, hitFrameOf(a), s, true);
      expect(used).toEqual(burstSnapshotState(plan.timeline, a.frame, s, true).buffs);
      // 前の発動の▼は切れていて、同じ発動の▼は乗らない（ほかの味方の▼は、どの編成の誰も持たない）
      expect(used.enemyDefenseDown).toBe(0);
    }
  });

  it('gives the Burst DEF down on the enemy for 5 s from the first Burst hit (C-1518)', () => {
    const mine = plan.schedule!.activations.filter((a) => a.slotIndex === s);
    const down = items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' });
    expect(down.map((w) => w.start)).toEqual(mine.map((a) => hitFrameOf(a)));
    for (const w of down) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(5));
  });
});

describeEveryShotInOneGroup(Object.fromEntries(Object.entries(TEAMS).map(([name, [input]]) => [name, input])));
