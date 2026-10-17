// 2 段目の段 1 の PR 3（plan/design-skill-stage1.md 2.3 節）: ミハラ（161）の定義。S2 のペインロード 1・2（使用回数別・下位効果の
// スタック適用）と、バーストの「ペインロード2の状態なら」の追加ダメージ。追加ダメージは同じ発動で付いたペインロード 2 を見ず、
// 3 回目のバーストから出る（V-0432）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition, staticStatesOf } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const MIHARA = 161;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definition = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) slot.skills = { definition: definition(id), levels: MAX_SKILL_LEVELS };
  return slot;
}

describe('ミハラ（161）の定義', () => {
  it('grants Highway to Hell 1 from the first Burst and 2 from the second, and is not static', () => {
    const def = definition(MIHARA);
    expect(def.skills.skill2.effects.map((e) => (e.kind === 'state' ? [e.state, e.trigger] : e.kind))).toEqual([
      ['highwayToHell1', { count: 'burstUse', atLeast: 1 }],
      ['highwayToHell2', { count: 'burstUse', atLeast: 2 }],
    ]);
    expect(staticStatesOf(def)).toEqual([]);
    expect(def.skills.burst.effects[1]).toMatchObject({
      kind: 'damage',
      trigger: 'burstUse',
      damageType: 'additional',
      condition: { selfState: { state: 'highwayToHell2', present: true } },
    });
  });

  it('gives the additional damage from the third Burst on, not seeing Highway to Hell 2 granted by the same Burst (V-0432。ラム + デルタ + ミハラ)', () => {
    const m = 2;
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Wind', hasCore: true };
    const input: TeamInput = {
      slots: [slotOf(822), slotOf(20), slotOf(MIHARA)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: m,
    };
    const plan = planTeamRun(applyCompositionToTeam(input));
    const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === m);
    expect(bursts.length).toBeGreaterThanOrEqual(3);
    const applied = (state: 'highwayToHell1' | 'highwayToHell2') =>
      plan.history.applications.filter((a) => a.slotIndex === m && a.state === state).map((a) => a.frame);
    const effectFrames = applied('highwayToHell1');
    expect(effectFrames).toHaveLength(bursts.length);
    expect(applied('highwayToHell2')).toEqual(effectFrames.slice(1));
    // ペインロード 2 は 45 秒で、CT 40 秒より長いので、2 回目に付いてから戦闘の終わりまで続く
    const items = itemsOf(plan.history, { holder: m, state: 'highwayToHell2' });
    expect(items.map((i) => i.start)).toEqual([effectFrames[1]]);
    expect(gameSecondsToFrames(45)).toBeGreaterThan(gameSecondsToFrames(40));
    // 追加ダメージは 3 回目以降のバーストで出る。2 回目は、同じ発動で付いたペインロード 2 を見ないので出ない
    const additional = plan.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'burst');
    expect(additional.map((h) => h.frame)).toEqual(effectFrames.slice(2));
  });
});
