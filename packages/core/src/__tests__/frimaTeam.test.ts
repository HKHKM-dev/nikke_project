// プリム編（V-0831）: プリム（142）を含む編成で、基礎版 S1 の 4 回命中ごとの防御力▼、宝物版 S1 の眠い（敵に 5 スタックの防御力▼）と
// フルチャージの発の 6 回ごとの起きた（通常攻撃を防御力無視ダメージに）、宝物版 S2・バーストの起きた状態の時の防御力無視ダメージ▲、
// バーストの防御力▼が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  fullChargeFrames,
  rangeEnemyWithEvents,
} from './teamHelpers.ts';

const FRIMA = 142;
const DELTA = 20;
const SOLINE = 71;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

const slotOf = (id: number, treasurePhase: TreasurePhase): TeamSlotInput =>
  fixedSlot(id, { conditionMode: 'auto', ...(id === FRIMA ? { treasurePhase } : {}) });
const team = (ids: number[], controlledSlot: number, treasurePhase: TreasurePhase = 3): TeamInput =>
  fixedTeam(
    ids.map((id) => slotOf(id, treasurePhase)),
    controlledSlot,
    { enemy: rangeEnemy },
  );

const TEAMS: Record<string, TeamInput> = {
  'プリム単騎（撮影の編成）': team([FRIMA], 0),
  'プリム + デルタ + ソリン': team([FRIMA, DELTA, SOLINE], 2),
  'プリム単騎（基礎版）': team([FRIMA], 0, 0),
  'プリム + デルタ + ソリン（基礎版）': team([FRIMA, DELTA, SOLINE], 2, 0),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const s = input.slots.findIndex((x) => x?.character.resourceId === FRIMA);
  const treasure = input.slots[s]!.skills!.treasurePhase === 3;
  const shots = plan.shots[s]!.frames;
  const fullCharge = fullChargeFrames(plan.shots[s]!);
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(plan.history, { sourceSlotIndex: s, ...filter });
  const sleepy = items({ kind: 'state', state: 'sleepy' });
  const wakeUp = items({ holder: s, kind: 'state', state: 'wakeUp' });
  const awakeAt = (f: number) => wakeUp.some((w) => w.start <= f && f < w.end);
  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];

  it('gives the S1 DEF down only in the base version, from the frame after every 4th hit', () => {
    const down = items({ kind: 'timed', skill: 'skill1', stat: 'enemyDefenseDown' });
    if (treasure) {
      expect(down).toEqual([]);
      return;
    }
    expect(down.length).toBeGreaterThan(0);
    expect(down[0]!.start).toBe(shots[3]! + 1);
  });

  it('stacks Sleepy (5) on the enemy from the frame after each full charge shot, in the treasure version only', () => {
    if (!treasure) {
      expect(sleepy).toEqual([]);
      return;
    }
    expect(Math.max(...sleepy.map((w) => w.stack ?? 1))).toBe(5);
    sleepy.slice(0, 5).forEach((w, k) => {
      expect(w.stack ?? 1).toBe(k + 1);
      expect(w.start).toBe(fullCharge[k]! + 1);
    });
  });

  it('grants Wake Up for 10 s from the frame after every 6th full charge shot (treasure)', () => {
    if (!treasure) {
      expect(wakeUp).toEqual([]);
      return;
    }
    expect(wakeUp.length).toBeGreaterThan(0);
    expect(wakeUp[0]!.start).toBe(fullCharge[5]! + 1);
    const sixth = fullCharge.filter((_, k) => (k + 1) % 6 === 0);
    for (const w of wakeUp) expect(sixth).toContain(w.start - 1);
  });

  it('gives the treasure S2 True Damage up only on full charge shots while awake', () => {
    const up = items({ kind: 'timed', skill: 'skill2', stat: 'trueDamage' });
    if (!treasure) {
      expect(up).toEqual([]);
      return;
    }
    expect(up.length).toBeGreaterThan(0);
    for (const w of up) {
      expect(fullCharge).toContain(w.start - 1);
      expect(awakeAt(w.start - 1)).toBe(true);
    }
  });

  it('gives the Burst DEF down on every Burst, and True Damage up (treasure) only when awake', () => {
    expect(bursts.length).toBeGreaterThan(2);
    const down = items({ kind: 'timed', skill: 'burst', stat: 'enemyDefenseDown' });
    expect(down.length).toBe(bursts.length);
    const up = items({ holder: s, kind: 'timed', skill: 'burst', stat: 'trueDamage' });
    if (!treasure) expect(up).toEqual([]);
    else {
      const awakeBursts = bursts.filter((b) => awakeAt(b.frame)).map((b) => b.frame);
      expect(awakeBursts.length).toBeGreaterThan(0);
      expect(up.length).toBeGreaterThan(0);
      for (const w of up) expect(w.end - w.start).toBeLessThanOrEqual(gameSecondsToFrames(10));
      expect(new Set(up.map((w) => bursts.findLast((b) => b.frame <= w.start)!.frame))).toEqual(new Set(awakeBursts));
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
