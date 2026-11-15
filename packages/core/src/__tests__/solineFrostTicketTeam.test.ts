// ソリン：フロストチケット（74）を含む編成（V-0790）: S1 のフルバーストの始まりの味方全体のクールタイム▼と、バーストの味方全体の回復
// （クラウンの S2 の「回復効果が適用された時」を開く）が意図どおりに出るか。撮影の編成（フロストチケットは撃たない操作枠）と、実戦寄りの編成で見る
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import {
  describeEveryShotInOneGroup,
  effectWindows,
  fixedTeam,
  fullBurstCooldownCuts,
  skillValueOf,
} from './teamHelpers.ts';

const FROST_TICKET = 74;
const CROWN = 330;
const IDOLL_SUN = 308;
const SOLINE = 71;
const LUDMILLA = 190;

const TEAMS: Record<string, TeamInput> = {
  '撮影（クラウン・サン・フロストチケット（撃たない操作枠））': fixedTeam([CROWN, IDOLL_SUN, FROST_TICKET], 2, {
    holdFire: [{ slotIndex: 2, ranges: [{ start: 0, end: gameSecondsToFrames(180) }] }],
  }),
  '実戦寄り（フロストチケット・クラウン・ソリン・サン・ルドミラ）': fixedTeam(
    [FROST_TICKET, CROWN, SOLINE, IDOLL_SUN, LUDMILLA],
    2,
  ),
};

const CUT_FRAMES = gameSecondsToFrames(skillValueOf(FROST_TICKET, 'skill1', 3));

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const plan = planTeamRun(input);
  const ticket = input.slots.findIndex((s) => s?.character.resourceId === FROST_TICKET);
  const crown = input.slots.findIndex((s) => s?.character.resourceId === CROWN);
  const schedule = plan.schedule!;
  const uses = schedule.activations.filter((a) => a.slotIndex === ticket).map((a) => a.frame);
  /** フロストチケットのバーストから枠 holder に入った回復のフレーム */
  const burstHeals = (holder: number) =>
    plan.instants
      .filter(
        (i) =>
          i.sourceSlotIndex === ticket &&
          i.slotIndex === holder &&
          i.effect.kind === 'heal' &&
          i.effect.source.skill === 'burst',
      )
      .map((i) => i.frame);

  it('shortens the burst cooldowns of the allies by 7.48 s at the start of every Full Burst', () => {
    expect(schedule.fullBurstWindows.length).toBeGreaterThan(3);
    expect(fullBurstCooldownCuts(schedule, ticket)).toEqual(schedule.fullBurstWindows.map(() => CUT_FRAMES));
    // 縮めるのはフルバーストの始まりのフレームだけ
    for (const r of schedule.cooldownReductions.filter((x) => x.sourceSlotIndex === ticket))
      expect(schedule.fullBurstWindows.some((w) => w.start === r.frame)).toBe(true);
  });

  it('heals every ally once on each burst use', () => {
    expect(uses.length).toBeGreaterThan(3);
    for (const h of input.slots.map((_, i) => i)) expect(burstHeals(h)).toEqual(uses);
  });

  // ほかに枠の回復が無い（クラウン自身の回復はフロストチケットの最初のバーストより後）
  const onlyTicketHealsFirst = plan.instants.every(
    (i) => i.effect.kind !== 'heal' || i.sourceSlotIndex === ticket || i.frame > uses[0]!,
  );
  it.runIf(onlyTicketHealsFirst)("opens Crown's S2 (when healed) at the first burst heal", () => {
    const windows = effectWindows(plan, crown, { resourceId: CROWN, skill: 'skill2', stat: 'attackDamage' });
    expect(windows[0]!.start).toBe(uses[0]);
  });
});

describeEveryShotInOneGroup(TEAMS);
