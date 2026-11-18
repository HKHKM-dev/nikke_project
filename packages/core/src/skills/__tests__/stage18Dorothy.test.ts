// 2 段目の段 18 の PR 1（plan/design-skill-stage18.md 2.2 節。V-0612）: ドロシー（233）の S2 の焦土化（20 秒ごと）と、バーストの発現
// （periodShorten の elapsed。クールタイムを縮める窓）
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { effectFrameOf } from '../../burst/schedule.ts';
import { runSimulation } from '../../sim/engine.ts';
import { fixedEnemy, fixedSlot, type FixedSlotOptions, fixedTeam, rawDefinition } from '../../__tests__/teamHelpers.ts';
import { elapsedShortenedTimerFrames } from '../timeline.ts';
import { parseSkillDefinition } from '../parse/definition.ts';

const DOROTHY = 233;
/** このテストの枠の、既定と違う所 */
const SLOT_OPTIONS: FixedSlotOptions = { condition: { coreHitRate: 1, distanceBonus: false, hitRate: 1 }, hp: true };

const enemy: EnemyInput = fixedEnemy({ element: 'Fire' });

describe('クールタイムを縮める窓（elapsedShortenedTimerFrames）', () => {
  it('fires every long period, then the short period from the window start, and from activations inside the window', () => {
    // 20 秒（1177f）を 18 秒縮める（118f）。窓は 1690 から 588f
    const fires = elapsedShortenedTimerFrames({ everySeconds: 20 }, 18, 6000, [1690], 588);
    expect(fires).toEqual([1177, 1808, 1926, 2044, 2162, 2280, 3457, 4634, 5811]);
  });

  it('keeps an earlier scheduled activation when the window opens', () => {
    expect(elapsedShortenedTimerFrames({ everySeconds: 20 }, 18, 1500, [1100], 588)).toEqual([1177, 1295, 1413]);
  });
});

describe('ドロシー単騎', () => {
  const r = runSimulation(fixedTeam([fixedSlot(DOROTHY, SLOT_OPTIONS)], 0, { enemy }));
  const hits = r.skillHits.filter((h) => h.effect.source.skill === 'skill2').map((h) => h.frame);
  // 20 秒は 1177f、縮めた 2 秒は 118f。発現の窓の 5 回が入る 600f と、その後の 1 回まで戦闘の中にあるバーストだけを見る
  const LONG = 1177;
  const SHORT = 118;
  const WINDOW_HITS = 600;
  const checked = r.schedule!.activations.map(effectFrameOf).filter((f) => f + WINDOW_HITS + LONG < r.frames);
  it('has bursts to check', () => expect(checked.length).toBeGreaterThan(2));

  it('hits 8 ticks after every 20-second activation, and 5 times every 2 seconds from each burst (C-0847・C-0848)', () => {
    expect(hits[0]).toBe(LONG + 8);
    for (const b of checked) {
      const inside = hits.filter((f) => f > b && f <= b + WINDOW_HITS);
      expect(inside).toEqual([1, 2, 3, 4, 5].map((k) => b + SHORT * k + 8));
      expect(hits.find((f) => f > inside.at(-1)!)).toBe(inside.at(-1)! + LONG);
    }
  });

  it('rejects elapsed with a carry timer', () => {
    const def = rawDefinition<{ skills: { skill2: { effects: { trigger: object }[] } } }>(DOROTHY);
    def.skills.skill2.effects[0]!.trigger = { everySeconds: 20, carry: true };
    expect(() => parseSkillDefinition(def)).toThrow(/carry/);
  });
});
