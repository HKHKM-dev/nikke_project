// ライ（392）: S1 の「通常攻撃で 60 回攻撃した時、味方全体にバーストゲージのチャージ」（burstGauge の { count: "normalShot" }。C-1572）が、
// ライの撃った発の 60 の倍数の発に出て、編成の 1 本のゲージを早めることを、射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { runSimulation } from '../sim/engine.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import {
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rawDefinition,
  rangeEnemyWithEvents,
  skillValueOf,
} from './teamHelpers.ts';

const RAI = 392;
const CROWN = 330;
const CINDERELLA_CW = 515;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  'ライ単騎（撮影。録画 1407）': team([RAI], 0),
  'ライ + クラウン + シンデレラ：クリスタルウェーブ（操作）': team([RAI, CROWN, CINDERELLA_CW], 2),
};

const EVERY = Number(skillValueOf(RAI, 'skill1', 1));
const CHARGE = skillValueOf(RAI, 'skill1', 2) / 100;

describe('ライ（392）の定義', () => {
  const def = parseSkillDefinition(rawDefinition(RAI));

  it('writes the S1 charge as a normalShot burstGauge and leaves the other slots to notes', () => {
    expect(def.skills.skill1.effects).toEqual([
      expect.objectContaining({
        kind: 'burstGauge',
        trigger: { count: 'normalShot', everyRef: 1 },
        target: 'allies',
        ref: 2,
      }),
    ]);
    expect(def.skills.skill2.effects).toEqual([]);
    expect(def.skills.burst.effects).toEqual([]);
    expect(EVERY).toBe(60);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const r = input.slots.findIndex((x) => x?.character.resourceId === RAI);
  const sim = runSimulation(input);

  it('charges the gauge on every 60th shot fired by Rai, on the frame of that shot', () => {
    const frames = sim.shots[r]?.frames ?? [];
    const expected = frames.filter((_, i) => (i + 1) % EVERY === 0);
    const charges = sim.instants.filter((x) => x.sourceSlotIndex === r && x.effect.kind === 'burstGauge');
    expect(charges.length).toBeGreaterThan(10);
    expect(charges.map((x) => x.frame)).toEqual(expected);
    for (const x of charges) expect(x.effect.value).toBeCloseTo(CHARGE, 12);
  });

  // ライのほかのスロットには効果が無いので、定義を外した枠と比べる
  it('fills the gauge earlier than without the charge', () => {
    const without: TeamInput = {
      ...input,
      slots: input.slots.map((s) =>
        s?.character.resourceId === RAI ? { ...s, skills: undefined } : s,
      ) as TeamInput['slots'],
    };
    const first = (x: ReturnType<typeof runSimulation>): number => x.schedule!.gaugeFullFrames[0]!;
    expect(first(sim)).toBeLessThan(first(runSimulation(without)));
  });
});

describeEveryShotInOneGroup(TEAMS);
