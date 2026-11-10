// エード編（plan/design-ade.md）: エード（310）を含む編成で、S2・バーストの最大HP のみ▲（味方全体）と、それで自分の HP の割合が 90% 以下に
// 下がった時の S1 の攻撃力▲（味方全体・5 秒）、バーストの攻撃力▲が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { computeFixedSpecDefence } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { characterOf, describeEveryShotInOneGroup, fixedSlot, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

/** 防御力もスペック固定にし、コア命中率を 0.1 にした枠 */
const slot = (id: number): TeamSlotInput => ({
  ...fixedSlot(id),
  defenceOverride: computeFixedSpecDefence(characterOf(id)),
  condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
});

const ADE = 310;
const FLOWER = 304;
const team = (ids: number[], controlledSlot: number, extra: Partial<TeamInput> = {}): TeamInput => ({
  slots: ids.map(slot),
  enemy: SHOOTING_RANGE_ENEMY,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
  ...extra,
});

const TEAMS: Record<string, TeamInput> = {
  エード単騎: team([ADE], 0, { durationSeconds: 90, burst: false }),
  'I-DOLL・フラワー + エード（撮影 B の編成）': team([FLOWER, ADE], 1),
  '実戦寄り（リター + エード + アリス + クラウン + ドレイク）': team([82, ADE, 191, 330, 101], 2),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const ade = input.slots.findIndex((s) => s?.character.resourceId === ADE);
  const plan = planTeamRun(input);
  const timed = { sourceSlotIndex: ade, kind: 'timed' } as const;
  const windows = (filter: Parameters<typeof itemsOf>[1]) =>
    itemsOf(plan.history, filter).map(({ start, end }) => ({ start, end }));
  // S2 の最大HP のみ▲、S1 の攻撃力▲と、バーストを使う編成ではバーストの最大HP のみ▲・攻撃力▲
  const effects = [
    { ...timed, skill: 'skill2', stat: 'maxHpOnly' },
    { ...timed, skill: 'skill1', stat: 'attack' },
    ...(input.burst
      ? ([
          { ...timed, skill: 'burst', stat: 'maxHpOnly' },
          { ...timed, skill: 'burst', stat: 'attack' },
        ] as const)
      : []),
  ] as const;

  it('gives each max-HP-only up, ATK up and the S1 ATK up to every ally, in the same windows', () => {
    for (const filter of effects) {
      const own = windows({ ...filter, holder: ade });
      expect(own.length).toBeGreaterThan(0);
      input.slots.forEach((_, holder) => expect(windows({ ...filter, holder })).toEqual(own));
    }
  });

  it('fires the S1 ATK up for 5 s the frame after Ade drops to 90% or lower, and not again while she stays there', () => {
    const maxHpOnly = windows({ ...timed, holder: ade, stat: 'maxHpOnly' });
    expect(maxHpOnly.length).toBeGreaterThan(0);
    // S2 のスキル Lv10 の最大HP のみ 15.62%▲ だけで 1 ÷ 1.1562 ≒ 86.5% に下がるので、どの件の始まりも、ほかの件が効いていなければ下がった時になる
    const drops = [
      ...new Set(
        maxHpOnly.filter((w) => !maxHpOnly.some((o) => o.start < w.start && w.start < o.end)).map((w) => w.start + 1),
      ),
    ];
    const s1 = windows({ ...timed, holder: ade, skill: 'skill1', stat: 'attack' });
    expect(s1.map((w) => w.start)).toEqual(drops);
    // 戦闘の終わりで切れる件のほかは 5 秒
    const battleEnd = Math.max(...maxHpOnly.map((w) => w.end));
    for (const w of s1) expect(w.end === battleEnd || w.end - w.start === gameSecondsToFrames(5)).toBe(true);
  });
});

describeEveryShotInOneGroup(TEAMS);
