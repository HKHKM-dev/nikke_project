// ネオン：ブルーオーシャン編（plan/design-neon-bo.md 2.1 節）: 回数のきっかけの種類 burstStage3Enter（バースト 3 段階に突入した回数）の
// 読み込みと数え方、変更後の武器の発ごとの倍率ダメージを 1 トリガーの値に畳み込まないこと（同 2.4 節）
import { describe, expect, it } from 'vitest';
import { resolvePerShotDamage } from '../burstDamage.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { MAX_SKILL_LEVELS, resolveTrigger } from '../resolve.ts';
import { createTriggerTracker, type FrameEvents } from '../triggers.ts';
import type { BurstStepKey } from '../../burst/schedule.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';

const NEON_BO = 14;
const character = characterOf(NEON_BO);
const raw = rawDefinition<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(NEON_BO);

const frame = (f: number, stageEntries?: BurstStepKey[]): FrameEvents => ({
  frame: f,
  shots: [],
  activations: [],
  burstEffects: [],
  fullBurstStart: false,
  fullBurstEnd: false,
  gaugeFull: false,
  fullBurstStartUsers: [],
  fullBurstEndUsers: [],
  healed: [],
  ...(stageEntries === undefined ? {} : { stageEntries }),
});

describe('burstStage3Enter の回数のきっかけ', () => {
  it('reads it as an event count kind, but not with resetAfterSeconds', () => {
    const def = parseSkillDefinition(structuredClone(raw));
    expect(def.skills.skill2.effects[2]).toMatchObject({ trigger: { count: 'burstStage3Enter', atLeast: 3 } });
    const copy = structuredClone(raw);
    copy.skills.skill2!.effects[0]!.trigger = { count: 'burstStage3Enter', atLeast: 1, resetAfterSeconds: 30 };
    expect(() => parseSkillDefinition(copy)).toThrow('resetAfterSeconds needs count burstUse');
  });

  it('fires on the N-th and later Stage 3 entries of the squad, not on other stage entries', () => {
    const trigger = resolveTrigger(
      { count: 'burstStage3Enter', atLeast: 2 },
      character.skills.skill2,
      MAX_SKILL_LEVELS.skill2,
    );
    // 自分の発動の有無は見ない（枠 2 のきっかけで、段階 3 への突入だけを数える）
    const tracker = createTriggerTracker(trigger, 2, 'dynamic');
    const fired = [
      frame(10, ['Step2']),
      frame(20, ['Step3']),
      frame(30),
      frame(40, ['Step3']),
      frame(50, ['Step2']),
      frame(60, ['Step3']),
    ]
      .filter((ev) => tracker(ev))
      .map((ev) => ev.frame);
    expect(fired).toEqual([40, 60]);
  });
});

describe('変更後の武器の発ごとの倍率ダメージ', () => {
  it('is not folded into the trigger value (base weapon shots do not get it)', () => {
    const def = parseSkillDefinition(structuredClone(raw));
    expect(def.skills.burst.effects[1]).toMatchObject({ kind: 'damage', trigger: { count: 'weaponChangeShot' } });
    expect(resolvePerShotDamage(def, character, MAX_SKILL_LEVELS)).toEqual([]);
  });
});
