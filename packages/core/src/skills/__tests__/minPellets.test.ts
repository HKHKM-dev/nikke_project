// 1 発の当たったペレットの数のしきい値（plan/design-privaty-um-s2.md 2.1 節）: 回数のきっかけの minPellets・minPelletsRef と、
// プリバティ：アンカインド・メイド（313）の S2 のリロード速度▲（C-1549）。
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { PelletHits, TeamInput } from '../../team.ts';
import { MAX_SKILL_LEVELS, resolveTrigger } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import type { SkillDefinition } from '../types.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { fixedEnemy } from '../../__tests__/teamHelpers.ts';

const privaty = characterOf(313);
const raw = rawDefinition<{ skills: Record<string, unknown> }>(313);
const def = parseSkillDefinition(raw);

/** 313.json を写して、skill2 の効果を差し替えた定義 */
function withSkill2Effect(effect: Record<string, unknown>): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill2 = { effects: [effect] };
  return parseSkillDefinition(copy);
}

const reloadTimed = { kind: 'timed', target: 'self', stat: 'reloadSpeed', ref: 2, durationRef: 3 };

/** 単騎（操作枠・スペック固定・的のジャンプなし・弾丸命中率 hitRate の手入力）。バーストなし */
function solo(hitRate: number, pelletHits?: readonly PelletHits[]): TeamInput {
  const fixed = computeFixedSpecAttack(privaty);
  return {
    slots: [
      {
        character: privaty,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        condition: { coreHitRate: 0, distanceBonus: false, hitRate },
        skills: { definition: def, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: fixedEnemy(),
    durationSeconds: 30,
    burst: false,
    controlledSlot: 0,
    ...(pelletHits === undefined ? {} : { pelletHits }),
  };
}

/** マガジンの最終弾から次のマガジンの 1 発目までのフレーム（発の間が 60f を超える所） */
function reloadGaps(input: TeamInput): number[] {
  const shots = planTeamRun(input).shots[0]!.frames;
  return shots.flatMap((f, i) => (i > 0 && f - shots[i - 1]! > 60 ? [f - shots[i - 1]!] : []));
}

describe('minPellets の語彙', () => {
  it('is only allowed with count normalShot in timed, without windows, stacks or chance', () => {
    expect(() => withSkill2Effect({ ...reloadTimed, trigger: { count: 'normalHit', minPelletsRef: 1 } })).toThrow(
      'minPellets needs count "normalShot"',
    );
    expect(() =>
      withSkill2Effect({ ...reloadTimed, trigger: { count: 'normalShot', minPellets: 5, minPelletsRef: 1 } }),
    ).toThrow('at most one of minPellets and minPelletsRef');
    expect(() =>
      withSkill2Effect({
        ...reloadTimed,
        trigger: { count: 'normalShot', minPelletsRef: 1, during: 'fullBurst', reset: 'never' },
      }),
    ).toThrow('during cannot be used with minPellets');
    expect(() =>
      withSkill2Effect({ ...reloadTimed, trigger: { count: 'normalShot', minPelletsRef: 1, chance: 50 } }),
    ).toThrow('chance cannot be used with minPellets');
    expect(() =>
      withSkill2Effect({
        kind: 'damage',
        damageType: 'skill',
        ref: 2,
        trigger: { count: 'normalShot', minPelletsRef: 1 },
      }),
    ).toThrow('minPellets is only allowed in timed');
  });

  it('resolves the threshold from the description value (5 at every level)', () => {
    const effect = def.skills.skill2.effects[0]!;
    if (effect.kind !== 'timed') throw new Error('expected a timed effect');
    for (const level of [1, 4, 10]) {
      expect(resolveTrigger(effect.trigger, privaty.skills.skill2, level)).toEqual({
        count: 'normalShot',
        every: 1,
        minPellets: 5,
      });
    }
  });
});

describe('プリバティ：アンカインド・メイド（313）の S2 のリロード速度▲（C-1549）', () => {
  it('is a reload speed on self on shots with 5 or more pellet hits (description_value_01), 2 s', () => {
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'normalShot', minPelletsRef: 1 },
      target: 'self',
      stat: 'reloadSpeed',
      ref: 2,
      durationRef: 3,
    });
  });

  // 最終弾 → 次のマガジンの 1 発目は、リロード 2 秒をゲーム内の時計で数えた 117.6f × (1 − 速度) + 24f（C-0148・C-0013）
  it('shortens the reload when the expected pellets reach 5 (7.5 at hit rate 1): 142f → 117f at Lv10', () => {
    const gaps = reloadGaps(solo(1));
    expect(gaps.length).toBeGreaterThan(1);
    expect(new Set(gaps)).toEqual(new Set([117]));
  });

  it('does not apply when the expected pellets fall short of 5 (10 × 0.6 × 0.75 = 4.5)', () => {
    expect(new Set(reloadGaps(solo(0.6)))).toEqual(new Set([142]));
  });

  it('counts the input pellets per shot: the last shots of the first magazine under 5 leave that reload unshortened', () => {
    // 1 本目の最後の 4 発（2 秒 = 約 118f の窓が最終弾に届く発。発の間は約 39f）だけを 4 個にする。以降の発は期待値の 7.5 個
    const counts = [10, 10, 10, 10, 10, 4, 4, 4, 4];
    const gaps = reloadGaps(solo(1, [{ slotIndex: 0, counts }]));
    expect(gaps[0]).toBe(142);
    expect(new Set(gaps.slice(1))).toEqual(new Set([117]));
  });
});
