// キラーワイフ編（plan/design-killer-wife.md 10 節）: D：キラーワイフ（43）を含む編成で、S1 の貫通特化（フルチャージ 3 回ごとの次の 1 発）と
// フルバーストの SR の味方への貫通ダメージ▲、S2 の攻撃ダメージ▲、バーストの「命中させた味方に」の攻撃力▲（味方ごとの最初の射撃の次から
// 10 秒・付き直さない）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson } from './teamHelpers.ts';

const KILLER_WIFE = 43;
const DELTA = 20;
const IDOLL_SUN = 308;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(autoSlot),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'D：キラーワイフ単騎（撮影 A の編成）': team([KILLER_WIFE], 0),
  'デルタ + I-DOLL・サン + D：キラーワイフ（撮影 B の編成）': team([DELTA, IDOLL_SUN, KILLER_WIFE], 2),
};
const TEN_SECONDS = gameSecondsToFrames(10);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const kw = input.slots.findIndex((s) => s?.character.resourceId === KILLER_WIFE);
  const plan = planTeamRun(input);
  const shots = plan.shots[kw]!.frames;
  const windows = (filter: Parameters<typeof itemsOf>[1]) =>
    itemsOf(plan.history, filter).map(({ start, end }) => ({ start, end }));
  const activations = plan.schedule!.activations.filter((a) => a.slotIndex === kw).map((a) => a.frame);

  it('gives Pierce from the frame after a full-charge shot through the next shot, about every third shot', () => {
    const pierce = windows({ sourceSlotIndex: kw, holder: kw, kind: 'timed', skill: 'skill1', stat: 'pierce' });
    expect(pierce.length).toBeGreaterThan(10);
    expect(Math.abs(pierce.length - shots.length / 3)).toBeLessThan(2);
    for (const w of pierce) {
      const trigger = shots.indexOf(w.start - 1);
      expect(trigger).toBeGreaterThanOrEqual(0);
      expect(w.end).toBe(shots[trigger + 1]! + 1);
    }
  });

  it('gives the S2 Attack Damage up to every ally from the frame after the fifth full-charge shot', () => {
    input.slots.forEach((_, holder) => {
      const s2 = windows({ sourceSlotIndex: kw, holder, kind: 'timed', skill: 'skill2', stat: 'attackDamage' });
      expect(s2[0]!.start).toBe(shots[4]! + 1);
    });
  });

  it('gives the Burst ATK up to each ally for 10 s from the frame after its first shot after the Burst', () => {
    expect(activations.length).toBeGreaterThan(3);
    input.slots.forEach((_, holder) => {
      const own = plan.shots[holder]!.frames;
      const expected = activations
        .map((a) => own.find((f) => f >= a && f < a + TEN_SECONDS))
        .filter((f): f is number => f !== undefined)
        .map((f) => ({ start: f + 1, end: Math.min(f + 1 + TEN_SECONDS, plan.frames) }));
      const got = windows({ sourceSlotIndex: kw, holder, kind: 'timed', skill: 'burst', stat: 'attack' });
      expect(got).toEqual(expected);
    });
  });

  if (input.slots.length > 1) {
    it('gives the S1 Pierce Damage up at Full Burst to the SR allies only', () => {
      const sun = input.slots.findIndex((s) => s?.character.resourceId === IDOLL_SUN);
      const delta = input.slots.findIndex((s) => s?.character.resourceId === DELTA);
      const of = (holder: number) =>
        windows({ sourceSlotIndex: kw, holder, kind: 'timed', skill: 'skill1', stat: 'pierceDamage' });
      expect(of(kw).length).toBe(plan.schedule!.fullBurstWindows.length);
      expect(of(delta)).toEqual(of(kw));
      expect(of(sun)).toEqual([]);
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
