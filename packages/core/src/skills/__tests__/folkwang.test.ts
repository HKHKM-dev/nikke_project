// フォルクヴァン（242）の S2 のゲージ: 20 秒（ceil で 1177f）ごとの発動の 4f 後に、射手の 1 ヒットぶん（4,000）を溜める
// （burstGaugeHit。C-0422。単騎の録画 0309 で、ゲージは戦闘開始から 1181f、その後 1177f ごとに伸びる）
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack } from '../../fixedSpec.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput } from '../../team.ts';
import { resolveTimerGauges } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { timerFrames } from '../timeline.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { fixedEnemy } from '../../__tests__/teamHelpers.ts';

const folkwang = characterOf(242);
const raw = rawDefinition<{ skills: Record<string, { effects: unknown[] }> }>(242);
const def = parseSkillDefinition(raw);

/** S2 の効果を消した定義（ゲージを溜めない比べの相手） */
function withoutS2Gauge(): SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills.skill2!.effects = [];
  return parseSkillDefinition(copy);
}

/** フォルクヴァン単騎（操作枠・スペック固定・撃ち続ける） */
function solo(definition: SkillDefinition): TeamInput {
  const fixed = computeFixedSpecAttack(folkwang);
  return {
    slots: [
      {
        character: folkwang,
        growth: fixed.growth,
        attackOverride: fixed.attack,
        condition: { coreHitRate: 1, distanceBonus: false },
        skills: { definition, levels: MAX_SKILL_LEVELS },
      },
    ],
    enemy: fixedEnemy(),
    durationSeconds: 180,
    burst: true,
    controlledSlot: 0,
  };
}

describe('フォルクヴァン（242）の S2 のゲージ', () => {
  it('defines the S2 gauge as a 20 s timer with a 4 f delay', () => {
    expect(def.skills.skill2.support).toBe('supported');
    expect(resolveTimerGauges(def)).toEqual([{ everySeconds: 20, delayFrames: 4 }]);
  });

  const withGauge = planTeamRun(solo(def));
  const without = planTeamRun(solo(withoutS2Gauge()));

  it('adds 4,000 at 1181 f and every 1177 f after (C-0422)', () => {
    const gauges = withGauge.timerGauges;
    expect(gauges.map((g) => g.fireFrame)).toEqual(timerFrames(20, withGauge.frames));
    expect(gauges.slice(0, 3).map((g) => g.frame)).toEqual([1181, 2358, 3535]);
    expect(gauges.every((g) => g.frame === g.fireFrame + 4 && g.energy === 4_000 && g.slotIndex === 0)).toBe(true);
    expect(without.timerGauges).toEqual([]);
  });

  it('does not change the shots themselves', () => {
    expect(withGauge.shots[0]!.frames.length).toBeGreaterThan(0);
    expect(withGauge.shots[0]!.frames).toEqual(without.shots[0]!.frames);
  });

  it('fills the gauge earlier with the S2 gauge', () => {
    const full = (plan: typeof withGauge) => plan.schedule!.gaugeFullFrames[0]!;
    expect(full(withGauge)).toBeLessThan(full(without));
  });
});
