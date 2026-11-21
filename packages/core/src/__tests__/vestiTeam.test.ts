// ベスティー（91）の定義（V-0825）: S2 の生存本能 1〜3（バーストの使用回数別・下位効果のスタック適用）と、バーストのミサイルコンテナ
// 2 機の攻撃（1 機ずつ 1 秒ごと・18 秒）と、生存本能の段ごとの追加ダメージ（発動の前に付いていた段の分を重ねて出す）
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { NamedStateId } from '../skills/states.ts';
import { staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import {
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rangeEnemyWithEvents,
  skillValueOf,
} from './teamHelpers.ts';

const VESTI = 91;
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemyWithEvents() });

const TEAMS: Record<string, TeamInput> = {
  'ココア + ソルジャーF.A. + ベスティー（撮影の編成）': team([311, 301, VESTI], 2),
  '実戦寄り（リター + クラウン + ベスティー + アリス + ユニ）': team([82, 330, VESTI, 191, 160], 2),
};

describe('ベスティー（91）の定義', () => {
  it('grants Survival Instinct 1–3 from the 1st–3rd Burst uses, and is not static', () => {
    const def = parseSkillDefinition(rawDefinition(VESTI));
    expect(def.skills.skill2.effects.map((e) => (e.kind === 'state' ? [e.state, e.trigger] : e.kind))).toEqual([
      ['survivalInstinct1', { count: 'burstUse', atLeast: 1 }],
      ['survivalInstinct2', { count: 'burstUse', atLeast: 2 }],
      ['survivalInstinct3', { count: 'burstUse', atLeast: 3 }],
    ]);
    expect(staticStatesOf(def)).toEqual([]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const v = input.slots.findIndex((x) => x?.character.resourceId === VESTI);
  const plan = planTeamRun(input);
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === v).map(effectFrameOf);
  const applied = (state: NamedStateId) =>
    plan.history.applications.filter((a) => a.slotIndex === v && a.state === state).map((a) => a.frame);
  const burstHits = plan.skillHits.filter((h) => h.slotIndex === v && h.effect.source.skill === 'burst');

  it('applies each Survival Instinct stage from its use count on, on the Burst effect frame', () => {
    expect(bursts.length).toBeGreaterThanOrEqual(4);
    expect(applied('survivalInstinct1')).toEqual(bursts);
    expect(applied('survivalInstinct2')).toEqual(bursts.slice(1));
    expect(applied('survivalInstinct3')).toEqual(bursts.slice(2));
  });

  it('gives the stacked additional damage of the stages present before the Burst (none on the 1st Burst)', () => {
    const additional = burstHits.filter((h) => h.effect.damageType === 'additional');
    const perBurst = bursts.map((b) => additional.filter((h) => h.frame === b).map((h) => h.hit.multiplier));
    const values = [2, 3, 4].map((ref) => skillValueOf(VESTI, 'burst', ref) / 100);
    perBurst.forEach((multipliers, n) => {
      expect(multipliers.sort()).toEqual(values.slice(0, Math.min(n, 3)).sort());
    });
    expect(additional).toHaveLength(perBurst.flat().length);
  });

  it('attacks with the two Missile Containers once a second each from 1 s to 17 s after every Burst (the one at 18 s falls on the expiry)', () => {
    const missiles = burstHits.filter((h) => h.effect.damageType === 'skill');
    const end = plan.frames;
    for (const b of bursts) {
      const life = b + gameSecondsToFrames(18);
      const own = missiles.filter((h) => h.frame > b && h.frame <= life);
      if (life < end) expect(own).toHaveLength(34);
      const frames = [...new Set(own.map((h) => h.frame))];
      expect(frames.length * 2).toBe(own.length);
      frames.forEach((f, k) => expect(Math.abs(f - (b + gameSecondsToFrames(k + 1)))).toBeLessThanOrEqual(1));
      for (const h of own) expect(h.hit.multiplier).toBeCloseTo(skillValueOf(VESTI, 'burst', 1) / 100, 6);
    }
  });
});

describeEveryShotInOneGroup(TEAMS);
