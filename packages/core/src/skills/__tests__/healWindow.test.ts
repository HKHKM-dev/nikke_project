// 維持時間のある回復（吸収回復）: heal の durationRef の DSL と解決（plan/design-heal-window.md 1.1 節。V-0024・C-0082）。
// 付き直しで healed を起こさない窓は、持ち主ごとの一覧の件（skills/__tests__/holders.test.ts の「吸収回復の窓」）で見る。
import { describe, expect, it } from 'vitest';
import { gameSecondsToFrames } from '../../time.ts';
import { MAX_SKILL_LEVELS, resolveInstant } from '../resolve.ts';
import { parseSkillDefinition } from '../parse/definition.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';

const yuni = characterOf(160);
const asuka = characterOf(830);
const raw160 = rawDefinition<{ skills: Record<string, { effects: unknown[] }> }>(160);
const raw830 = rawDefinition(830);

function withSkill2Effects(effects: unknown[]): unknown {
  const copy = structuredClone(raw160);
  copy.skills.skill2!.effects = effects;
  return copy;
}

const LIFESTEAL = { kind: 'heal', trigger: { count: 'fullChargeShot' }, target: 'allies', ref: 3, durationRef: 4 };

describe('heal の維持時間（1.1 節）', () => {
  it('resolves the lifesteal of Yuni S2 and the burst of Asuka to 10 s windows', () => {
    const yuniHeal = resolveInstant(parseSkillDefinition(raw160), yuni, MAX_SKILL_LEVELS).find(
      (e) => e.kind === 'heal',
    );
    expect(yuniHeal).toMatchObject({ trigger: { count: 'fullChargeShot', every: 1 }, target: 'allies' });
    expect(yuniHeal!.value).toBeCloseTo(0.0277, 10);
    expect(yuniHeal!.durationFrames).toBe(gameSecondsToFrames(10));
    const asukaHeal = resolveInstant(parseSkillDefinition(raw830), asuka, MAX_SKILL_LEVELS).find(
      (e) => e.kind === 'heal',
    );
    expect(asukaHeal!.durationFrames).toBe(gameSecondsToFrames(10));
  });

  it('leaves a heal without a duration as before', () => {
    const def = parseSkillDefinition(withSkill2Effects([{ ...LIFESTEAL, durationRef: undefined }]));
    expect(resolveInstant(def, yuni, MAX_SKILL_LEVELS)[0]!.durationFrames).toBeUndefined();
  });

  it('rejects both durationRef and durationSeconds, and a duration on the other instants', () => {
    expect(() => parseSkillDefinition(withSkill2Effects([{ ...LIFESTEAL, durationSeconds: 10 }]))).toThrow(
      /exactly one of durationRef and durationSeconds/,
    );
    expect(() =>
      parseSkillDefinition(
        withSkill2Effects([{ kind: 'ammoRefill', trigger: 'burstUse', target: 'self', ref: 3, durationRef: 4 }]),
      ),
    ).toThrow(/durationRef: unknown field/);
  });
});
