// ペレットの命中編（plan/design-pellet-hit.md）: 回数トリガー pelletHit（的に当たったペレットの数）と、
// プリバティ：アンカインド・メイド（313）の S1 の定義（C-0408）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { PelletHits, TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveTrigger } from '../resolve.ts';
import { advanceShotCount, shotCountWeight } from '../triggers.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const privaty = readJson<CharacterData>('../../../data/characters/313.json');
const raw = readJson<{ skills: Record<string, unknown> }>('../../../data/skills/313.json');
const def = parseSkillDefinition(raw);

/** 313.json を写して、skill1 を差し替えた定義 */
function withSkill1(entry: unknown): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill1 = entry;
  return parseSkillDefinition(copy);
}

/** 単騎（操作枠・スペック固定・的のジャンプなし・弾丸命中率 hitRate の手入力）。バーストなし */
function solo(hitRate: number, pelletHits?: readonly PelletHits[]): TeamInput {
  const fixed = computeFixedSpecAttack(privaty);
  return {
    slots: [
      {
        character: privaty,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true, hitRate },
        skills: { definition: def, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds: 60,
    burst: false,
    controlledSlot: 0,
    ...(pelletHits === undefined ? {} : { pelletHits }),
  };
}

/** S1 のヒットが、それぞれ何発目（1 始まり）の射撃で出たか */
function s1ShotIndices(input: TeamInput): number[] {
  const plan = planTeamRun(input);
  const shots = plan.shots[0]!.frames;
  return plan.skillHits
    .filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill1')
    .map((h) => shots.filter((f) => f <= h.frame).length);
}

describe('pelletHit の語彙', () => {
  it('needs every or everyRef and is not allowed in a cycle', () => {
    const damage = { kind: 'damage', damageType: 'skill', ref: 2 };
    expect(() => withSkill1({ effects: [{ ...damage, trigger: { count: 'pelletHit' } }] })).toThrow(
      'pelletHit needs every or everyRef',
    );
    expect(() =>
      withSkill1({
        effects: [
          {
            kind: 'cycle',
            trigger: { count: 'pelletHit', every: 30 },
            steps: [
              { kind: 'damage', ref: 2, damageType: 'skill' },
              { kind: 'damage', ref: 2, damageType: 'skill' },
            ],
          },
        ],
      }),
    ).toThrow('pelletHit is not allowed in a cycle');
  });

  it('adds the pellets of the shot (hits when omitted)', () => {
    const shot = { lastShot: false, fullCharge: false, hits: 1, coreHits: 0 };
    expect(shotCountWeight('pelletHit', { ...shot, pellets: 7 })).toBe(7);
    expect(shotCountWeight('pelletHit', shot)).toBe(1);
    expect(shotCountWeight('normalHit', { ...shot, pellets: 7 })).toBe(1);
  });

  it('fires on the shot that reaches a multiple of every, also exactly (C-0408), and rejects more than every in one shot', () => {
    expect(advanceShotCount(26, 4, 30)).toEqual({ count: 30, fired: true });
    expect(advanceShotCount(26, 3, 30)).toEqual({ count: 29, fired: false });
    expect(advanceShotCount(29, 10, 30)).toEqual({ count: 39, fired: true });
    expect(() => advanceShotCount(0, 11, 10)).toThrow('more than every');
  });
});

describe('プリバティ：アンカインド・メイド（313）の S1', () => {
  it('is a skill damage on every 30 pellet hits (description_value_01) at 202.84% (Lv10)', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects).toMatchObject([
      { kind: 'damage', trigger: { count: 'pelletHit', everyRef: 1 }, damageType: 'skill', ref: 2 },
    ]);
    const effect = def.skills.skill1.effects[0]!;
    if (effect.kind !== 'damage') throw new Error('expected a damage effect');
    expect(resolveTrigger(effect.trigger, privaty.skills.skill1, 10)).toEqual({ count: 'pelletHit', every: 30 });
  });

  it('counts the expected pellets: 10 × hit rate × 0.75 for manual input (7.5 per shot → every 4th shot)', () => {
    const indices = s1ShotIndices(solo(1));
    expect(indices.length).toBeGreaterThan(5);
    expect(indices).toEqual(indices.map((_, j) => 4 * (j + 1)));
  });

  it('counts the input pellets per shot instead, carrying the remainder over and firing exactly on 30 and 60', () => {
    // 累計 10・20・29・39（4 発目）・49・50・60（7 発目）・70・80・90（10 発目）。以降は期待値の 7.5 個
    const counts = [10, 10, 9, 10, 10, 1, 10, 10, 10, 10];
    expect(s1ShotIndices(solo(1, [{ slotIndex: 0, counts }])).slice(0, 3)).toEqual([4, 7, 10]);
  });

  it('rejects input counts above the pellets of the weapon', () => {
    expect(() => planTeamRun(solo(1, [{ slotIndex: 0, counts: [11] }]))).toThrow('pelletHits');
  });
});
