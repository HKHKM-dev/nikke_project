// トリナ編（plan/design-trina.md）: トリナ（412）を含む編成で、S2 の戦闘開始時の最大HP のみ▲が電撃 AR の全員に、バースト使用時の
// 攻撃ダメージ▲・リロード速度▲が電撃 AR のうちいちばん左の 1 機にだけ、バーストの命中率▲・最大装弾数▲が電撃 AR の全員に、
// 根張り（allEnemiesBurstDamage）が味方全員に付き、根張りが説明文の対象の句が「敵全体に」で終わる burstDamage にだけ乗るか。
// 射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import type { BuffStat } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { runTeam } from './runTeam.ts';
import {
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rangeEnemyWithEvents,
  skillValueOf,
  windowsFrom,
} from './teamHelpers.ts';

const TRINA = 412;
const COCOA = 311;
const SOLDIER_EG = 300;
const MIHARA = 161;
const SCARLET = 222;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

/** 編成ごとの、電撃 AR の枠と、そのうちいちばん左の枠 */
type Case = { input: TeamInput; electricAr: number[]; leftmost: number };
const CASES: Record<string, Case> = {
  'ココア + ソルジャーE.G. + トリナ（操作）+ ミハラ（撮影の編成）': {
    input: team([COCOA, SOLDIER_EG, TRINA, MIHARA], 2),
    electricAr: [1],
    leftmost: 1,
  },
  '実戦寄り（ココア + 紅蓮 + トリナ + ソルジャーE.G. + ミハラ）': {
    input: team([COCOA, SCARLET, TRINA, SOLDIER_EG, MIHARA], 2),
    electricAr: [1, 3],
    leftmost: 1,
  },
};
const TEAMS = Object.fromEntries(Object.entries(CASES).map(([name, c]) => [name, c.input]));

const ROOT = skillValueOf(TRINA, 'burst', 3) / 100;

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, electricAr, leftmost }) => {
  const t = input.slots.findIndex((x) => x?.character.resourceId === TRINA);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const result = runTeam(input);
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === t).map((a) => a.frame);
  const windows = (holder: number, skill: 'skill2' | 'burst', stat: BuffStat) =>
    itemsOf(plan.history, { sourceSlotIndex: t, holder, kind: 'timed', skill, stat }).map(({ start, end }) => ({
      start,
      end,
    }));

  it('gives every Electric AR the S2 max-HP-only up for the whole battle, and nobody else', () => {
    for (let holder = 0; holder < input.slots.length; holder++) {
      const expected = electricAr.includes(holder) ? [{ start: 0, end: plan.frames }] : [];
      expect(windows(holder, 'skill2', 'maxHpOnly'), `holder ${holder}`).toEqual(expected);
    }
  });

  it('gives the S2 burst-use ups to the leftmost Electric AR only, for 10 s from each Trina burst use', () => {
    expect(uses.length).toBeGreaterThan(3);
    const expected = windowsFrom(uses, skillValueOf(TRINA, 'skill2', 3), plan.frames);
    for (let holder = 0; holder < input.slots.length; holder++) {
      for (const stat of ['attackDamage', 'reloadSpeed'] as const) {
        expect(windows(holder, 'skill2', stat), `holder ${holder} ${stat}`).toEqual(
          holder === leftmost ? expected : [],
        );
      }
    }
  });

  it('gives the burst ups to all allies, and hit rate and max ammo to every Electric AR', () => {
    const tenSeconds = windowsFrom(uses, skillValueOf(TRINA, 'burst', 2), plan.frames);
    const root = windowsFrom(uses, skillValueOf(TRINA, 'burst', 4), plan.frames);
    for (let holder = 0; holder < input.slots.length; holder++) {
      expect(windows(holder, 'burst', 'maxHpOnly'), `holder ${holder}`).toEqual(tenSeconds);
      expect(windows(holder, 'burst', 'attackDamage'), `holder ${holder}`).toEqual(tenSeconds);
      expect(windows(holder, 'burst', 'allEnemiesBurstDamage'), `holder ${holder}`).toEqual(root);
      for (const stat of ['hitRate', 'maxAmmo'] as const) {
        expect(windows(holder, 'burst', stat), `holder ${holder} ${stat}`).toEqual(
          electricAr.includes(holder) ? tenSeconds : [],
        );
      }
    }
  });

  it('puts Taking Root on the 敵全体に burst damage only, inside the window, in the attack damage sum', () => {
    const inWindow = (f: number) =>
      uses.some((u) => u <= f && f < u + gameSecondsToFrames(skillValueOf(TRINA, 'burst', 4)));
    let marked = 0;
    for (const slot of result.slots) {
      if (slot === null) continue;
      const activations = plan.schedule!.activations.filter((a) => a.slotIndex === slot.index);
      for (const [i, a] of slot.burst.activations.entries()) {
        const all = a.hit.perEffect.filter((p) => p.effect.allEnemies === true);
        // ソルジャーE.G. の「攻撃範囲内の敵に」には乗らない
        if (input.slots[slot.index]!.character.resourceId === SOLDIER_EG) expect(all).toEqual([]);
        if (all.length === 0) continue;
        // 倍率ダメージは発動の直前のバフで出る（C-0689）
        const used = activations[i]!.frame;
        const expected = inWindow(used) ? (a.hit.attackDamageMultiplier + ROOT) / a.hit.attackDamageMultiplier : 1;
        expect(a.hit.allEnemiesBurstDamageMultiplier, `slot ${slot.index} use ${i}`).toBeCloseTo(expected, 12);
        if (expected > 1) marked++;
      }
    }
    // III（ミハラ・紅蓮）はトリナ（II）の直後に使うので、どの回にも乗る
    expect(marked).toBeGreaterThan(3);
  });
});

describeEveryShotInOneGroup(TEAMS);
