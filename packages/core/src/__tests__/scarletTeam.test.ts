// 紅蓮編（plan/design-scarlet.md）: 紅蓮（222）を含む編成で、S1 の攻撃力▲と現在の HP▼（10 命中ごと）、それで HP の割合が 60% 以下に
// 下がった後の S2 のクリティカルダメージ▲、バーストの使用の瞬間に 50% 以下ならのクリティカル確率▲が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { computeFixedSpecDefence } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

/** 防御力もスペック固定にし、コア命中率を 0.1 にした枠 */
const slot = (id: number): TeamSlotInput => ({
  ...fixedSlot(id),
  defenceOverride: computeFixedSpecDefence(characterOf(id)),
  condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
});

const SCARLET = 222;
const team = (ids: number[], controlledSlot: number, extra: Partial<TeamInput> = {}): TeamInput => ({
  slots: ids.map(slot),
  enemy: SHOOTING_RANGE_ENEMY,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
  ...extra,
});

const TEAMS: Record<string, TeamInput> = {
  紅蓮単騎: team([SCARLET], 0, { burst: false }),
  'リター + デルタ + 紅蓮（撮影 B の編成）': team([82, 20, SCARLET], 2),
  '実戦寄り（リター + デルタ + 紅蓮 + アリス + クラウン）': team([82, 20, SCARLET, 191, 330], 2),
};

// スキル Lv10: 現在の HP 4.01%▼ を n 回で 0.9599^n。60% 以下は 13 回目、50% 以下は 17 回目
const FIRES_TO_60 = 13;
const FIRES_TO_50 = 17;

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const scarlet = input.slots.findIndex((s) => s?.character.resourceId === SCARLET);
  const plan = planTeamRun(input);
  const timed = { sourceSlotIndex: scarlet, holder: scarlet, kind: 'timed' } as const;
  const windows = (filter: Parameters<typeof itemsOf>[1]) =>
    itemsOf(plan.history, filter).map(({ start, end }) => ({ start, end }));
  // S1 の発火（攻撃力▲の件の列の始まり。現在の HP▼ と同じきっかけ）
  const s1Fires =
    plan.history.tracks.find(
      (t) =>
        t.holder === scarlet &&
        t.sourceSlotIndex === scarlet &&
        t.origin.kind === 'timed' &&
        t.origin.effect.source.skill === 'skill1',
    )?.starts ?? [];
  const hpDowns = plan.instants.filter((i) => i.slotIndex === scarlet && i.effect.kind === 'currentHpDown');

  // 現在の HP▼ はきっかけの発のフレームに起き、攻撃力▲の窓（回数のきっかけ）はその次のフレームから始まる
  it('lowers the current HP on every S1 firing, at the frame of the triggering shot', () => {
    expect(s1Fires.length).toBeGreaterThan(FIRES_TO_50);
    expect(hpDowns.map((i) => i.frame + 1)).toEqual(s1Fires);
  });

  it('gives the S2 critical damage up from the frame after the HP down that drops HP to 60% or lower, until the battle ends', () => {
    const s2 = windows({ ...timed, skill: 'skill2', stat: 'critDamage' });
    expect(s2).toEqual([{ start: hpDowns[FIRES_TO_60 - 1]!.frame + 1, end: plan.frames }]);
  });

  it.skipIf(!input.burst)('gives the burst critical rate up only on burst uses at 50% HP or lower', () => {
    const uses = activationFramesOfSlot(plan.schedule!, scarlet);
    const starts = windows({ ...timed, skill: 'burst', stat: 'critRate' }).map((w) => w.start);
    const downsBefore = (frame: number) => hpDowns.filter((i) => i.frame < frame).length;
    expect(uses.some((a) => downsBefore(a) < FIRES_TO_50)).toBe(true);
    expect(uses.some((a) => downsBefore(a) >= FIRES_TO_50)).toBe(true);
    for (const a of uses) {
      const applied = starts.some((s) => s >= a && s <= a + 1);
      expect(applied).toBe(downsBefore(a) >= FIRES_TO_50);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
