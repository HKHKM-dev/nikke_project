// ツバイ編（plan/design-zwei.md）: ツバイ（390）を含む編成で、バーストの使用武器変更（1 発で戻る・最初の発の待ち）、S1 の貫通ダメージ▲
// （フルバーストの 1 発間・10 秒・フルバーストの中の通常攻撃ごとのスタック）、宝物版のバーストの貫通学概論、S2 のクリ率▲が意図どおりに出るか。
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { gameSecondsToFrames } from '../time.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const ZWEI = 390;
const SUN = 308;
const ADE_AB = 315;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const slotOf = (id: number, treasurePhase: TreasurePhase): TeamSlotInput => {
  const slot: TeamSlotInput = { ...fixedSlot(id), conditionMode: 'auto' };
  if (id === ZWEI) slot.skills = { ...slot.skills!, treasurePhase };
  return slot;
};
const team = (ids: number[], controlledSlot: number, treasurePhase: TreasurePhase = 3): TeamInput => ({
  slots: ids.map((id) => slotOf(id, treasurePhase)),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

/** 編成と、持ち替えた武器の最初の発の待ち（宝物版 83f・基礎版 101f）と、貫通特化のある味方（エード：AB）の枠 */
type Case = { input: TeamInput; delay: number; ade?: number };
const CASES: Record<string, Case> = {
  'ツバイ単騎（撮影 A の編成）': { input: team([ZWEI], 0), delay: 83 },
  'ツバイ + I-DOLL・サン + エード：エージェントバニー（撮影 B の編成）': {
    input: team([ZWEI, SUN, ADE_AB], 2),
    delay: 83,
    ade: 2,
  },
  'ツバイ単騎（基礎版）': { input: team([ZWEI], 0, 0), delay: 101 },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, delay, ade }) => {
  const plan = planTeamRun(input);
  const zwei = 0;
  const shots = plan.shots[zwei]!.frames;
  const windows = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, filter);
  const weapon = windows({ sourceSlotIndex: zwei, holder: zwei, kind: 'timed', skill: 'burst', stat: 'weapon' });

  it('fires exactly one changed-weapon shot per Burst and returns to the shotgun', () => {
    expect(weapon.length).toBeGreaterThan(0);
    for (const w of weapon) expect(shots.filter((f) => f >= w.start && f < w.end)).toHaveLength(1);
  });

  it('waits the first-shot delay (83 f with the Treasure 1.2 s charge, 101 f with the base 1.5 s charge)', () => {
    // 的のジャンプ（撃てない窓）にかかる回は、窓が明けるまで撃てないので除く
    const jumps = rangeEnemy.events!.filter((e) => e.kind === 'untargetable');
    const clear = weapon.filter(
      (w) =>
        !jumps.some((e) => gameSecondsToFrames(e.start) <= w.start + delay && w.start < gameSecondsToFrames(e.end)),
    );
    expect(clear.length).toBeGreaterThan(0);
    for (const w of clear) {
      const shot = shots.find((f) => f >= w.start)!;
      expect(shot - w.start).toBe(delay);
    }
  });

  if (ade !== undefined) {
    const adeShots = plan.shots[ade]!.frames;
    const s1Pierce = windows({
      sourceSlotIndex: zwei,
      holder: ade,
      kind: 'timed',
      skill: 'skill1',
      stat: 'pierceDamage',
    });

    it('gives Pierce Attacks 101 to every ally for 10 s from each Burst', () => {
      for (const holder of input.slots.keys()) {
        const items = windows({ sourceSlotIndex: zwei, holder, kind: 'state', state: 'pierceAttacks101' });
        expect(items.length).toBeGreaterThan(0);
        // 状態は発動のフレームから、変更の窓はその次のフレームから
        expect(items.map((w) => w.start + 1)).toEqual(weapon.map((w) => w.start));
        for (const w of items) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
      }
    });

    it('stacks the Full Burst Pierce Damage up per Zwei shot and ends all stacks on the holder’s next shot', () => {
      const stacks = s1Pierce.filter((w) => w.stack !== undefined);
      expect(stacks.length).toBeGreaterThan(0);
      expect(Math.max(...stacks.map((w) => w.stack!))).toBe(3);
      for (const w of stacks) expect(adeShots).toContain(w.end - 1);
    });

    it('keeps the 1-round Full Burst Pierce Damage up until the holder’s first shot after the Full Burst starts', () => {
      const once = s1Pierce.filter((w) => w.stack === undefined && adeShots.includes(w.end - 1));
      expect(once.length).toBeGreaterThan(0);
      for (const w of once) expect(adeShots.filter((f) => f >= w.start && f < w.end)).toHaveLength(1);
    });

    it('gives the Critical Rate stacks to every ally only while Zwei has Pierce Attacks 101', () => {
      const states = windows({ sourceSlotIndex: zwei, holder: zwei, kind: 'state', state: 'pierceAttacks101' });
      const crit = windows({
        sourceSlotIndex: zwei,
        holder: ade,
        kind: 'timed',
        skill: 'skill2',
        stat: 'critRate',
      }).filter((w) => w.stack !== undefined);
      expect(crit.length).toBeGreaterThan(0);
      for (const w of crit) expect(states.some((s) => s.start <= w.start - 1 && w.start - 1 < s.end)).toBe(true);
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
