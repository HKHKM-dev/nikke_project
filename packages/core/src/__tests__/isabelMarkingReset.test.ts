// イサベルのターゲットマーキングの回数は、前の発動から 45 秒より後のバーストで数え直す（C-0872。V-0631。発動の回数のトリガーの
// resetAfterSeconds）。編成は V-0631 のラム・イサベル・デルタで、手で撃つチェーンの間隔を 43 秒と 48 秒に分ける
import { describe, expect, it } from 'vitest';
import type { BurstActivation } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { createTriggerTracker, type FrameEvents } from '../skills/triggers.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { gameSecondsToFrame } from '../time.ts';
import raw from '../../data/skills/231.json' with { type: 'json' };
import { fixedTeam } from './teamHelpers.ts';

const ISABEL = 1;
const at = (frame: number, burst: boolean): FrameEvents =>
  ({
    frame,
    shots: [null],
    activations: [],
    burstEffects: burst ? [{ slotIndex: 0 } as BurstActivation] : [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: [false],
  }) as unknown as FrameEvents;

describe('発動の回数のトリガーの数え直し（resetAfterSeconds）', () => {
  it('starts over when the next use comes more than N game seconds after the previous one', () => {
    const track = createTriggerTracker({ count: 'burstUse', atLeast: 2, resetAfterSeconds: 45 }, 0, null);
    const limit = 45 / 0.017; // 2,647.06 フレーム
    const uses = [0, 2600, 2600 + Math.ceil(limit), 2600 + Math.ceil(limit) + Math.floor(limit)];
    // 2 回目（45 秒の中）→ 発火、3 回目（45 秒より後）→ 数え直して 1 回目、4 回目（45 秒の中）→ 2 回目で発火
    expect(uses.map((f) => track(at(f, true)))).toEqual([false, true, false, true]);
  });

  it('keeps counting through the battle without the field', () => {
    const track = createTriggerTracker({ count: 'burstUse', atLeast: 2 }, 0, null);
    expect([0, 5000, 10000].map((f) => track(at(f, true)))).toEqual([false, true, true]);
  });

  it('gives the stage-2 additional damage only to the third use in a row within 45 s', () => {
    // A（43・48・43 秒）は追加ダメージ無し、B（48・43・43 秒）は 4 回目だけ（0912-09・0913-11）
    const chains = (gaps: number[]) => gaps.reduce((xs, g) => [...xs, xs.at(-1)! + gameSecondsToFrame(g)], [2000]);
    const additional = (gaps: number[]) => {
      const input = fixedTeam([822, 231, 20], 2, { burstModel: 'dynamic' });
      const plan = planTeamRun({ ...input, manualBursts: chains(gaps) });
      return plan.skillHits.filter((h) => h.slotIndex === ISABEL && h.effect.source.skill === 'burst').length;
    };
    expect(additional([43, 48, 43])).toBe(0);
    expect(additional([48, 43, 43])).toBe(1);
  });

  it('accepts resetAfterSeconds only on burstUse with a positive number', () => {
    const variant = (edit: (t: Record<string, unknown>) => void) => () => {
      const copy = structuredClone(raw) as { skills: { skill1: { effects: { trigger: Record<string, unknown> }[] } } };
      edit(copy.skills.skill1.effects[0]!.trigger);
      return parseSkillDefinition(copy);
    };
    expect(variant(() => {})).not.toThrow();
    expect(variant((t) => (t.count = 'fullBurstStart'))).toThrow(/needs count burstUse/);
    expect(variant((t) => (t.resetAfterSeconds = 0))).toThrow(/expected a positive number/);
  });
});
