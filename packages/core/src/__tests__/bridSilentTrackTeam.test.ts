// ブリッド：サイレントトラック（73。V-0711）を含む編成で、S1（フルバーストの始まりの受けるダメージ▲と倍率ダメージ）・S2（10 回攻撃
// ごとの受けるダメージ▲・5 回攻撃ごとの倍率ダメージ）・バースト（自分を除く味方の攻撃力▲）が意図どおりに出るか。受けるダメージ▲は
// 風圧の敵のときだけ付く
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import type { SkillSlot } from '../types.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  SHOOTING_RANGE_ENEMY,
  windowsFrom,
} from './teamHelpers.ts';

const BRID = 73;
const LITER = 82;
const SUN = 308;

// 撮影 A（単騎。II の自分だけなのでバーストは撃たない）と撮影 B（リター・I-DOLL・サン・ブリッド：サイレントトラック）の編成を、
// 風圧の的（受けるダメージ▲が付く）と灼熱の的（付かない）で回す
const SETUPS = [
  { name: '撮影 A（単騎）', ids: [BRID], controlled: 0, burst: false },
  {
    name: '撮影 B（リター・I-DOLL・サン・ブリッド：サイレントトラック）',
    ids: [LITER, SUN, BRID],
    controlled: 2,
    burst: true,
  },
];
const TEAMS: Record<string, TeamInput> = Object.fromEntries(
  SETUPS.flatMap(({ name, ids, controlled, burst }) =>
    (['Wind', 'Fire'] as const).map((element) => [
      `${name}・${element}`,
      fixedTeam(ids, controlled, { enemy: { ...SHOOTING_RANGE_ENEMY, element }, burst }),
    ]),
  ),
);

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const sim = runSimulation(input);
  const brid = input.slots.findIndex((s) => s.character.resourceId === BRID);
  const windEnemy = input.enemy.element === 'Wind';
  const windows = sim.schedule?.fullBurstWindows ?? [];
  const shots = sim.shots[brid]!.frames;
  const hitsOf = (skill: SkillSlot) =>
    sim.skillHits.filter((h) => h.slotIndex === brid && h.effect.source.skill === skill);
  const held = (skill: SkillSlot, stat: string) => effectWindows(sim, brid, { resourceId: BRID, skill, stat });

  it('hits with S2 6 frames after every 5th normal attack, with the Damage Taken up from the 2nd hit only against a Wind enemy', () => {
    const fifth = shots.filter((_, i) => (i + 1) % 5 === 0);
    const hits = hitsOf('skill2');
    expect(hits.map((h) => h.frame)).toEqual(fifth.map((f) => f + 6).filter((f) => f < sim.frames));
    // 10 発目のきっかけのヒットは 6f 後なので、同じ発で付いた受けるダメージ▲が乗る（C-1039）
    expect(hits[0]!.hit.damageTakenMultiplier).toBe(1);
    expect(hits[1]!.hit.damageTakenMultiplier > 1).toBe(windEnemy);
  });

  it('gives the S2 Damage Taken up on every 10th normal attack only against a Wind enemy', () => {
    const tenth = shots.filter((_, i) => (i + 1) % 10 === 0);
    // 10 秒のうちに次の 10 回目が来るので、付け直して 1 つの窓につながる。きっかけの発の次のフレームから、最後の付け直しの 10 秒後まで
    const expected = windEnemy
      ? [{ start: tenth[0]! + 1, end: windowsFrom([tenth.at(-1)! + 1], 10, sim.frames)[0]!.end }]
      : [];
    expect(held('skill2', 'damageTaken')).toEqual(expected);
  });

  it('hits with S1 at every Full Burst start, with Damage Taken up only against a Wind enemy', () => {
    expect(hitsOf('skill1').map((h) => h.frame)).toEqual(windows.map((w) => w.start));
    expect(held('skill1', 'damageTaken').map((w) => w.start)).toEqual(windEnemy ? windows.map((w) => w.start) : []);
  });

  it('gives the Burst ATK up to the allies but not to herself', () => {
    input.slots.forEach((_, i) => {
      const windows = effectWindows(sim, i, { resourceId: BRID, skill: 'burst', stat: 'attack' });
      expect(windows.length > 0).toBe(i !== brid && input.burst !== false);
    });
  });
});

describeEveryShotInOneGroup(TEAMS);
