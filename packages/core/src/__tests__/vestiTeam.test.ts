// ベスティー（91）の定義（V-0825）: S2 の生存本能 1〜3（バーストの使用回数別・下位効果のスタック適用。前の使用から 45 秒より後の使用で
// 数え直す。C-1442）と、バーストの生存本能の段ごとの追加ダメージ（発動の前に付いていた段の分を重ねて出す。C-1441）
import { describe, expect, it } from 'vitest';
import { effectFrameOf } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { NamedStateId } from '../skills/states.ts';
import { staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
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
const RECORDED = team([311, 301, VESTI], 2);

const TEAMS: Record<string, TeamInput> = {
  'ココア + ソルジャーF.A. + ベスティー（撮影の編成）': RECORDED,
  '実戦寄り（リター + クラウン + ベスティー + アリス + ユニ）': team([82, 330, VESTI, 191, 160], 2),
};
// 録画 1303 のチェーンの始まり（1303-10）。ベスティーの 2 回目と 3 回目の間が 45 秒より長い
const MANUAL: TeamInput = { ...RECORDED, manualBursts: [590, 1768, 2967, 6070, 7247, 8430, 9608] };
const ADDITIONAL = [2, 3, 4].map((ref) => skillValueOf(VESTI, 'burst', ref) / 100);

function vestiRun(input: TeamInput) {
  const v = input.slots.findIndex((x) => x?.character.resourceId === VESTI);
  const plan = planTeamRun(input);
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === v).map(effectFrameOf);
  const applied = (state: NamedStateId) =>
    plan.history.applications.filter((a) => a.slotIndex === v && a.state === state).map((a) => a.frame);
  const additional = plan.skillHits.filter((h) => h.slotIndex === v && h.effect.source.skill === 'burst');
  // バーストごとの追加ダメージの倍率（並びは段の順）
  const perBurst = bursts.map((b) =>
    additional
      .filter((h) => h.frame === b)
      .map((h) => h.hit.multiplier)
      .sort((a, c) => a - c),
  );
  return { bursts, applied, additional, perBurst };
}

describe('ベスティー（91）の定義', () => {
  it('grants Survival Instinct 1–3 from the 1st–3rd Burst uses, restarting the count after 45 s, and is not static', () => {
    const def = parseSkillDefinition(rawDefinition(VESTI));
    expect(def.skills.skill2.effects.map((e) => (e.kind === 'state' ? [e.state, e.trigger] : e.kind))).toEqual([
      ['survivalInstinct1', { count: 'burstUse', atLeast: 1, resetAfterSeconds: 45 }],
      ['survivalInstinct2', { count: 'burstUse', atLeast: 2, resetAfterSeconds: 45 }],
      ['survivalInstinct3', { count: 'burstUse', atLeast: 3, resetAfterSeconds: 45 }],
    ]);
    expect(staticStatesOf(def)).toEqual([]);
  });

  it('restarts the stages after a gap of more than 45 s between Bursts (V-0825。録画 1303 の手動のバースト)', () => {
    const { bursts, applied, perBurst } = vestiRun(MANUAL);
    expect(bursts).toHaveLength(4);
    expect(applied('survivalInstinct1')).toEqual(bursts);
    expect(applied('survivalInstinct2')).toEqual([bursts[1], bursts[3]]);
    expect(applied('survivalInstinct3')).toEqual([]);
    // 3 回目は発動の前に段が無く（2 回目の段は切れた）、4 回目は数え直した 3 回目の生存本能 1 の分だけ
    expect(perBurst).toEqual([[], [ADDITIONAL[0]], [], [ADDITIONAL[0]]]);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const { bursts, applied, additional, perBurst } = vestiRun(input);

  it('applies each Survival Instinct stage from its use count on, on the Burst effect frame', () => {
    expect(bursts.length).toBeGreaterThanOrEqual(4);
    expect(applied('survivalInstinct1')).toEqual(bursts);
    expect(applied('survivalInstinct2')).toEqual(bursts.slice(1));
    expect(applied('survivalInstinct3')).toEqual(bursts.slice(2));
  });

  it('gives the stacked additional damage of the stages present before the Burst (none on the 1st Burst)', () => {
    perBurst.forEach((multipliers, n) => expect(multipliers).toEqual(ADDITIONAL.slice(0, Math.min(n, 3))));
    expect(additional).toHaveLength(perBurst.flat().length);
    for (const h of additional) expect(h.hit.boost.fullBurst).toBe(0);
  });
});

describeEveryShotInOneGroup(TEAMS);
