// イサベルの S2 のヒット（発動の 45f 後）は、値（撃つ側のバフ・敵の側のデバフ・フルバースト補正）を発動の直前のもので決める
// （C-0864。V-0632。スキル定義の valueBeforeFire）。編成はラム・イサベル・たきな（V-0619 の編成）で、たきなの S2 の受けるダメージ▲は
// イサベルの S2 と同じフレームに付く（どちらも 15 秒ごと。C-0418・C-0402）ので、ヒットの時点では付いているが乗らない
import { describe, expect, it } from 'vitest';
import { isInFullBurst } from '../burst/schedule.ts';
import { burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import raw from '../../data/skills/231.json' with { type: 'json' };
import { fixedTeam } from './teamHelpers.ts';

const ISABEL = 1;
const input = fixedTeam([822, 231, 861], 2, { burstModel: 'dynamic' });

describe('イサベルの S2 のヒットの値の時点（C-0864）', () => {
  const plan = planTeamRun(input);
  const s2 = plan.skillHits.filter((h) => h.slotIndex === ISABEL && h.effect.source.skill === 'skill2');

  it('fixes the value 1 f before the activation, so Takina’s ▲ applied on the activation frame is not used', () => {
    expect(s2.length).toBeGreaterThan(5);
    for (const h of s2) {
      const fire = h.frame - 45;
      const before = burstSnapshotState(plan.timeline, fire - 1, ISABEL, false).buffs;
      const atHit = burstSnapshotState(plan.timeline, h.frame, ISABEL, false).buffs;
      // たきなの▲は発動のフレームで付き、ヒットの時点では付いている
      expect(atHit.damageTaken).toBeGreaterThan(before.damageTaken);
      expect(h.hit.damageTakenMultiplier).toBeCloseTo(1 + before.damageTaken, 12);
    }
  });

  it('takes the Full Burst bonus at the frame before the activation too', () => {
    const schedule = plan.schedule!;
    for (const h of s2) expect(h.hit.boost.fullBurst > 0).toBe(isInFullBurst(schedule, h.frame - 46));
  });

  it('uses the buffs at the hit when the flag is removed (the delayed-hit default)', () => {
    const copy = structuredClone(raw) as { skills: { skill2: { effects: Record<string, unknown>[] } } };
    delete copy.skills.skill2.effects[0]!.valueBeforeFire;
    const definition = parseSkillDefinition(copy);
    const without = planTeamRun({
      ...input,
      slots: input.slots.map((s, k) => (k === ISABEL ? { ...s!, skills: { ...s!.skills!, definition } } : s)),
    });
    const hits = without.skillHits.filter((h) => h.slotIndex === ISABEL && h.effect.source.skill === 'skill2');
    expect(hits.map((h) => h.frame)).toEqual(s2.map((h) => h.frame));
    for (const h of hits) {
      const atHit = burstSnapshotState(without.timeline, h.frame, ISABEL, false).buffs;
      expect(h.hit.damageTakenMultiplier).toBeCloseTo(1 + atHit.damageTaken, 12);
    }
  });

  it('rejects valueBeforeFire without delayFrames or together with valueDelayFrames', () => {
    const variant = (edit: (e: Record<string, unknown>) => void) => () => {
      const copy = structuredClone(raw) as { skills: { skill2: { effects: Record<string, unknown>[] } } };
      edit(copy.skills.skill2.effects[0]!);
      return parseSkillDefinition(copy);
    };
    expect(variant(() => {})).not.toThrow();
    expect(variant((e) => delete e.delayFrames)).toThrow(/needs delayFrames/);
    expect(
      variant((e) => {
        e.hitOffsetFrames = [0];
        e.valueDelayFrames = 1;
      }),
    ).toThrow();
    expect(variant((e) => (e.valueBeforeFire = false))).toThrow(/expected true/);
  });
});
