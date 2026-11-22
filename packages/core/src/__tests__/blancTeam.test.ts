// ブラン（270）の S2 の 2 つ目の効果: フルバースト終了時、同じ部隊の味方がいれば自分のバーストスキルクールタイム▼（V-0868）。
// 同じ部隊（777。ノワール・ルージュ）の味方がいる編成では、フルバーストが終わるたびにブランの CT が縮む（C-1551）。いない編成では起きない（C-1552）。
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../time.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { characterOf, rawDefinition } from './data.ts';
import { fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const BLANC = 270;
const NOIR = 271;
const ROUGE = 272;
const enemy = fixedEnemy();

// 録画 1389 の編成（ルージュ + ブラン + I-DOLL・サン）と、0827〜0829 の編成（ルドミラ + ブラン + プリバティ：アンカインド・メイド）は、
// II がブランだけで、ブランの CT がチェーンの回りを決める（appliesCut）。ノワールのいる編成（V-0219 の録画 A）は II をデルタが撃ち、
// ブランは撃たないので、CT▼ は付くが縮む CT が無い
const TEAMS: Record<string, { input: TeamInput; blanc: number; sameSquad: boolean; appliesCut?: boolean }> = {
  '同じ部隊（ルージュ + ブラン + I-DOLL・サン）': {
    input: fixedTeam([fixedSlot(ROUGE), fixedSlot(BLANC), fixedSlot(308)], 0, { enemy }),
    blanc: 1,
    sameSquad: true,
    appliesCut: true,
  },
  '同じ部隊（鈴原サクラ + デルタ + ブラン + ノワール）': {
    input: fixedTeam([fixedSlot(836), fixedSlot(20), fixedSlot(BLANC), fixedSlot(NOIR)], 2, { enemy }),
    blanc: 2,
    sameSquad: true,
  },
  '同じ部隊の味方なし（ルドミラ + ブラン + プリバティ：アンカインド・メイド）': {
    input: fixedTeam([fixedSlot(190), fixedSlot(BLANC), fixedSlot(313)], 0, { enemy }),
    blanc: 1,
    sameSquad: false,
  },
};

describe('ブランの定義', () => {
  const def = parseSkillDefinition(rawDefinition(BLANC));

  it('defines the burst cooldown cut of S2, conditioned on an ally from the same squad', () => {
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects[1]).toMatchObject({
      kind: 'cooldownReduction',
      trigger: 'fullBurstEnd',
      target: 'self',
      ref: 3,
      squad: { present: true },
      claims: ['C-1551', 'C-1552'],
    });
    expect(def.skills.skill2.notes).toEqual([]);
  });

  it('puts Noir and Rouge in the same squad as Blanc', () => {
    expect(characterOf(NOIR).squad).toBe(characterOf(BLANC).squad);
    expect(characterOf(ROUGE).squad).toBe(characterOf(BLANC).squad);
    expect(characterOf(190).squad).not.toBe(characterOf(BLANC).squad);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, blanc, sameSquad, appliesCut }) => {
  const sim = runSimulation(input);
  const plan = planTeamRun(input);

  it.runIf(!sameSquad)('does not cut the burst cooldown of Blanc without an ally from the same squad (C-1552)', () => {
    expect(plan.instants.filter((e) => e.sourceSlotIndex === blanc && e.effect.kind === 'cooldownReduction')).toEqual(
      [],
    );
    expect(sim.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === blanc)).toEqual([]);
  });

  it.runIf(sameSquad)('cuts the burst cooldown of Blanc by 40.76 s at the end of every full burst (C-1551)', () => {
    const ends = sim.schedule!.fullBurstWindows.map((w) => w.end).filter((end) => end < plan.frames);
    expect(ends.length).toBeGreaterThan(0);
    const fromBlanc = plan.instants.filter((e) => e.sourceSlotIndex === blanc && e.effect.kind === 'cooldownReduction');
    expect(fromBlanc.map((e) => e.frame)).toEqual(ends);
    const cuts = sim.schedule!.cooldownReductions.filter((r) => r.sourceSlotIndex === blanc);
    expect(cuts.map((r) => r.frame)).toEqual(ends);
    expect(cuts.every((r) => r.slotIndex === blanc && r.frames === gameSecondsToFrames(40.76))).toBe(true);
    if (appliesCut === true) expect(cuts.some((r) => r.applied > 0)).toBe(true);
  });
});
