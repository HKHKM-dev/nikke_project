// アリア（432。V-0834）を含む編成で、S1 のフルバーストの始まりからの味方全体の会心ダメージ▲（10 秒）、S2 のマガジンの最後の 1 発からの
// 味方全体の会心率▲（5 秒）、バーストの自分の命中率▲（15 秒。MG のコア命中率は撃ち始めの外れを縮める形。C-1554）が意図どおりに出るか。
// 味方へのバリアは間接（barrier）の notes
import { describe, expect, it } from 'vitest';
import { activationFramesOfSlot } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { effectWindows, fixedTeam, rawDefinition, windowsFrom } from './teamHelpers.ts';

const ARIA = 432;

describe('アリアの定義', () => {
  const def = parseSkillDefinition(rawDefinition(ARIA));

  it('defines the three buffs and keeps the ally barrier as an indirect note', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => [e.kind, 'stat' in e ? e.stat : null])).toEqual([['timed', 'hitRate']]);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['indirect']);
  });
});

const TEAMS: Record<string, TeamInput> = {
  '撮影の編成（ココア + レイヴン + アリア）': fixedTeam([311, 851, ARIA], 2),
  '実戦寄り（リター + アリア + アリス + レイヴン + ココア）': fixedTeam([82, ARIA, 191, 851, 311], 1),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const aria = input.slots.findIndex((s) => s?.character.resourceId === ARIA);
  const plan = planTeamRun(input);
  const windows = (slot: number, skill: string, stat: string) =>
    effectWindows(plan, slot, { resourceId: ARIA, skill, stat });
  const fullBursts = plan.schedule!.fullBurstWindows.map((w) => w.start);
  const lastShots = plan.shots[aria]!.lastShotFrames!;
  const uses = activationFramesOfSlot(plan.schedule!, aria);

  it('gives every ally Critical Damage up for 10 s from each Full Burst start (S1)', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    for (let holder = 0; holder < input.slots.length; holder++)
      expect(windows(holder, 'skill1', 'critDamage')).toEqual(windowsFrom(fullBursts, 10, plan.frames));
  });

  it('gives every ally Critical Rate up for 5 s from the last round of each magazine (S2)', () => {
    // 最後の 1 発の次のフレームから効く。MG のマガジン（300 発 + リロード）は 5 秒より長いので、窓は重ならない
    expect(lastShots.length).toBeGreaterThan(10);
    const starts = lastShots.map((f) => f + 1).filter((f) => f < plan.frames);
    for (let holder = 0; holder < input.slots.length; holder++)
      expect(windows(holder, 'skill2', 'critRate')).toEqual(windowsFrom(starts, 5, plan.frames));
  });

  it('gives herself Hit Rate up for 15 s from each Burst use, and no one else', () => {
    expect(uses.length).toBeGreaterThan(2);
    const hitRate = (holder: number) =>
      itemsOf(plan.history, { sourceSlotIndex: aria, holder, kind: 'timed', skill: 'burst', stat: 'hitRate' }).map(
        ({ start, end }) => ({ start, end }),
      );
    expect(hitRate(aria)).toEqual(windowsFrom(uses, 15, plan.frames));
    for (let holder = 0; holder < input.slots.length; holder++)
      if (holder !== aria) expect(hitRate(holder)).toEqual([]);
  });
});
