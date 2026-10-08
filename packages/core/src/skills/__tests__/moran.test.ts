// モラン（281）の定義（plan/skills-guide.md）。ダメージに効く効果は無く、S2 の挑発を付けたときのゲージだけを入れる
// （burstGaugeHit の射撃の回数のトリガー。plan/design-moran.md、C-0480）。ほかの行は notes。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { resolveShotGauges, resolveTimerGauges } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const moran = readJson<CharacterData>('../../../data/characters/281.json');
const raw = readJson<{ skills: Record<string, unknown> }>('../../../data/skills/281.json');
const def = parseSkillDefinition(raw);

const GAUGE = { kind: 'burstGaugeHit', trigger: { count: 'lastShot' } };

/** 281.json を写して、skill2 を差し替えた定義 */
function withSkill2(entry: unknown): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill2 = entry;
  return parseSkillDefinition(copy);
}

/** モラン単騎（操作枠・スペック固定・的のジャンプなし・全弾命中）。definition を差し替えて比べる */
function solo(definition: SkillDefinition): TeamInput {
  const fixed = computeFixedSpecAttack(moran);
  return {
    slots: [
      {
        character: moran,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds: 60,
    burst: true,
    controlledSlot: 0,
  };
}

describe('モラン（281）', () => {
  it('models only the S2 gauge, in both the base and the treasure S2', () => {
    expect(def.skills.skill1).toMatchObject({ support: 'unsupported', effects: [] });
    expect(def.skills.skill2).toMatchObject({ support: 'supported', effects: [expect.objectContaining(GAUGE)] });
    expect(def.skills.burst).toMatchObject({ support: 'unsupported', effects: [] });
    expect(def.treasureSkills?.skill2).toMatchObject({ support: 'partial', effects: [expect.objectContaining(GAUGE)] });
    expect(resolveShotGauges(def, moran, MAX_SKILL_LEVELS)).toEqual([{ count: 'lastShot', every: 1 }]);
    expect(resolveTimerGauges(def)).toEqual([]);
  });
});

describe('S2 のゲージ（1 パス目）', () => {
  const withGauge = planTeamRun(solo(def));
  const without = planTeamRun(solo(withSkill2({ effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] })));
  const shotsOf = (plan: typeof withGauge) => plan.shots[0]!.frames;
  const indexOfFull = (plan: typeof withGauge) =>
    shotsOf(plan).filter((f) => f <= plan.schedule!.gaugeFullFrames[0]!).length;

  it('adds one target hit of gauge on each last bullet, so the first full comes 3 shots earlier', () => {
    // 1 発 5,000。200 発で 1,000,000。満タンまでに最後の弾丸（60・120・180 発目）が 3 回で、197 発目で届く（C-0480 の 369-01・370-01）
    expect(moran.shot.targetBurstEnergyPerShot).toBe(5000);
    expect(moran.shot.maxAmmo).toBe(60);
    expect(indexOfFull(without)).toBe(200);
    expect(indexOfFull(withGauge)).toBe(197);
  });

  it('does not change the shots themselves', () => {
    expect(shotsOf(withGauge).slice(0, 197)).toEqual(shotsOf(without).slice(0, 197));
  });
});
