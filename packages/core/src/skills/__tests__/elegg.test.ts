// エレグ（500）の定義（plan/design-elegg.md 段 1）。S2 の「ターゲットが出現した時、味方全体にバーストゲージのチャージ 100%」を、
// 戦闘開始の burstGauge で入れる（C-0662）。ほかの行は notes。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const elegg = readJson<CharacterData>('../../../data/characters/500.json');
const raw = readJson<{ skills: Record<string, { effects: unknown[]; notes?: unknown[] }> }>(
  '../../../data/skills/500.json',
);
const def = parseSkillDefinition(raw);

/** S2 のゲージを落とした定義 */
function withoutGauge(): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill2!.effects = [];
  return parseSkillDefinition(copy);
}

/** エレグ単騎（操作枠・スペック固定・的のジャンプなし） */
function solo(definition: SkillDefinition): TeamInput {
  const fixed = computeFixedSpecAttack(elegg);
  return {
    slots: [
      {
        character: elegg,
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

describe('エレグ（500）', () => {
  it('models the S2 gauge charge at battle start', () => {
    expect(def.skills.skill2).toMatchObject({
      support: 'partial',
      effects: [expect.objectContaining({ kind: 'burstGauge', trigger: 'battleStart', target: 'allies', ref: 4 })],
    });
  });

  it('fills the gauge on the frame after battle start (C-0662)', () => {
    expect(planTeamRun(solo(def)).schedule!.gaugeFullFrames[0]).toBe(1);
    // ゲージなしなら、エレグの弾で溜まるまで満タンにならない
    expect(planTeamRun(solo(withoutGauge())).schedule!.gaugeFullFrames[0]).toBeGreaterThan(100);
  });
});
