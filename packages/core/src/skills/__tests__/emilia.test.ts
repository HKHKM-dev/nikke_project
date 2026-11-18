// エミリア（821）の語彙（plan/design-emilia.md 2 節）: scaling perFinalMaxAmmo（最終最大装弾数 1 発ごとのチャージダメージ▲）と
// damageType fixedShare（与えたダメージ量の X% の固定ダメージ）の読み込みの検査と式、定義の Lv ごとの値
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage, partialChargeTriggerDamage } from '../../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import { applyChargeBuffs, applyResolvedEffect, PER_MAX_AMMO_CAP, ZERO_BUFFS } from '../buffs.ts';
import { resolveDamageEffects, resolveFixedShare, resolvePerShotDamage } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';
import { characterOf, rawDefinition } from '../../__tests__/data.ts';
import { fixedEnemy } from '../../__tests__/teamHelpers.ts';

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const def = (skill1: unknown[], skill2: unknown[] = []) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-11-14',
  skills: {
    skill1: skill1.length > 0 ? { effects: skill1 } : none,
    skill2: skill2.length > 0 ? { effects: skill2 } : none,
    burst: none,
  },
});
const perAmmo = {
  kind: 'timed',
  trigger: { count: 'fullChargeShot' },
  target: 'self',
  stat: 'chargeDamage',
  scaling: 'perFinalMaxAmmo',
  ref: 3,
  durationShotsRef: 4,
};
const share = { kind: 'damage', trigger: { count: 'fullChargeShot' }, damageType: 'fixedShare', ref: 1 };

describe('scaling perFinalMaxAmmo（plan/design-emilia.md 2.1 節）', () => {
  it('parses on a self timed chargeDamage only', () => {
    expect(parseSkillDefinition(def([perAmmo])).skills.skill1.effects[0]).toMatchObject(perAmmo);
    expect(() => parseSkillDefinition(def([{ ...perAmmo, stat: 'attack' }]))).toThrow(
      /only allowed with stat "chargeDamage"/,
    );
    expect(() => parseSkillDefinition(def([{ ...perAmmo, target: 'allies' }]))).toThrow(
      /only allowed with target "self"/,
    );
    expect(() =>
      parseSkillDefinition(
        def([{ kind: 'passive', target: 'self', stat: 'chargeDamage', scaling: 'perFinalMaxAmmo', ref: 3 }]),
      ),
    ).toThrow(/only allowed in timed/);
    expect(() =>
      parseSkillDefinition(
        def([
          {
            kind: 'state',
            state: 'freezingWitch',
            trigger: 'burstUse',
            target: 'self',
            durationShotsRef: 2,
            contents: [{ stat: 'chargeDamage', ref: 3, scaling: 'perFinalMaxAmmo' }],
          },
        ]),
      ),
    ).toThrow(/only allowed in timed/);
  });

  it('adds min(50, final max ammo) × the sum to the charge damage', () => {
    const { totals } = applyResolvedEffect(
      ZERO_BUFFS,
      { stat: 'chargeDamage', scaling: 'perFinalMaxAmmo', value: 0.0201 },
      0,
    );
    expect(totals.chargeDamagePerMaxAmmo).toBeCloseTo(0.0201, 12);
    expect(totals.chargeDamage).toBe(0);
    expect(applyChargeBuffs(2.5, true, totals, 6)).toBeCloseTo(2.5 + 6 * 0.0201, 12);
    expect(applyChargeBuffs(2.5, true, totals, 9)).toBeCloseTo(2.5 + 9 * 0.0201, 12);
    expect(applyChargeBuffs(2.5, true, totals, 80)).toBeCloseTo(2.5 + PER_MAX_AMMO_CAP * 0.0201, 12);
    expect(applyChargeBuffs(2.5, false, totals, 6)).toBe(1);
    expect(() => applyChargeBuffs(2.5, true, totals)).toThrow(/needs the final max ammo/);
    // ▲が無ければ装弾数を読まない
    expect(applyChargeBuffs(2.5, true, ZERO_BUFFS)).toBe(2.5);
  });
});

describe('damageType fixedShare（plan/design-emilia.md 2.2 節）', () => {
  it('parses only on { count: "fullChargeShot" } without other fields', () => {
    expect(parseSkillDefinition(def([], [share])).skills.skill2.effects[0]).toMatchObject(share);
    expect(() => parseSkillDefinition(def([], [{ ...share, trigger: { count: 'normalShot' } }]))).toThrow(
      /fixedShare needs the trigger/,
    );
    expect(() => parseSkillDefinition(def([], [{ ...share, trigger: { count: 'fullChargeShot', every: 2 } }]))).toThrow(
      /fixedShare needs the trigger/,
    );
    expect(() => parseSkillDefinition(def([], [{ ...share, delayFrames: 6 }]))).toThrow(
      /not allowed with the damageType "fixedShare"/,
    );
    // ゲージは着弾と同じフレームの 1 ヒットだけ（C-1333）
    expect(parseSkillDefinition(def([], [{ ...share, gaugeHits: [0] }])).skills.skill2.effects[0]).toMatchObject({
      gaugeHits: [0],
    });
    for (const gaugeHits of [[3], [0, 0]])
      expect(() => parseSkillDefinition(def([], [{ ...share, gaugeHits }]))).toThrow(
        /fixedShare takes only gaugeHits \[0\]/,
      );
  });

  const emilia = characterOf(821);
  const definition = parseSkillDefinition(rawDefinition(821));
  const perShot = resolvePerShotDamage(definition, emilia, MAX_SKILL_LEVELS);
  const fixedShare = resolveFixedShare(definition, emilia, MAX_SKILL_LEVELS);
  const input = {
    character: emilia,
    growth: { level: 400, grade: 0, core: 0 },
    attackOverride: 100000,
    enemy: fixedEnemy({ defence: 100 }),
    buffs: { ...ZERO_BUFFS, attackDamage: 0.3, damageTaken: 0.2 },
    perShot,
    fixedShare,
  };

  it('is X% of the normal attack of the trigger, with nothing applied again (Lv10: 58.99%)', () => {
    // 射撃ごとの倍率ダメージの列には入らず、比率の和で渡す
    expect(perShot).toEqual([]);
    expect(fixedShare).toBeCloseTo(0.5899, 12);
    const condition = { coreHitRate: 0.5, distanceBonus: false, hitRate: 1 };
    const t = computeTriggerDamage({ ...input, condition });
    expect(t.perShot).toBe(0);
    expect(t.fixedShare).toBeCloseTo(t.normal * 0.5899, 6);
    expect(t.perTrigger).toBeCloseTo(t.normal * 1.5899, 6);
    const fb = computeTriggerDamage({ ...input, condition: { ...condition, fullBurst: true } });
    expect(fb.fixedShare / fb.normal).toBeCloseTo(0.5899, 12);
  });

  it('does not occur on uncharged or partially charged shots', () => {
    const condition = { coreHitRate: 0.5, distanceBonus: false, hitRate: 1 };
    // チャージしない武器に替えた区間の発
    const uncharged = { id: 'x', hits: 1, shot: { ...emilia.shot, chargeTime: 0 } };
    expect(computeTriggerDamage({ ...input, buffs: { ...input.buffs, weapon: uncharged }, condition }).fixedShare).toBe(
      0,
    );
    const full = computeTriggerDamage({ ...input, condition });
    expect(full.fixedShare).toBeGreaterThan(0);
    const partial = partialChargeTriggerDamage(full, 0.5);
    expect(partial.fixedShare).toBe(0);
    expect(partial.perTrigger).toBeCloseTo(partial.normal + partial.perShot, 6);
  });
});

describe('固定ダメージのバーストゲージ（C-1333）', () => {
  it('charges one hit of the shooter (28,000) on the landing frame of each full charge shot', () => {
    const emilia = characterOf(821);
    const definition = parseSkillDefinition(rawDefinition(821));
    const fixed = computeFixedSpecAttack(emilia);
    const slot: TeamSlotInput = {
      character: emilia,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      condition: { coreHitRate: 1, distanceBonus: false },
      skills: { definition, levels: MAX_SKILL_LEVELS },
    };
    const enemy = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire' as const, hasCore: true };
    const r = runSimulation({ slots: [slot], enemy, durationSeconds: 20, burst: false, controlledSlot: 0 });
    const first = r.shots[0]!.frames[0]!;
    const gauges = r.shotGauges.filter((g) => g.shotFrame === first);
    // 発 28,000 × 2.5 と、固定ダメージの 1 ヒット 28,000（フルチャージ倍率なし）が、同じ着弾のフレームに入る
    expect(gauges.map((g) => g.energy).sort((a, b) => a - b)).toEqual([28000, 70000]);
    expect(new Set(gauges.map((g) => g.frame)).size).toBe(1);
  });
});

describe('畳み込めない固定ダメージ', () => {
  it('rejects a fixedShare on a definition that fires uncharged shots', () => {
    const emilia = characterOf(821);
    const raw = rawDefinition<{ skills: Record<string, { effects: unknown[] }> }>(821);
    // 即着弾に替える使用武器の変更があると、フルチャージの発の毎回は畳み込まない（foldsIntoShot）
    raw.skills.burst!.effects.push({
      kind: 'weaponChange',
      trigger: 'burstUse',
      damageRef: 3,
      durationRef: 6,
      rateOfFire: 1412,
      instantFire: true,
      infiniteAmmo: true,
    });
    const parsed = parseSkillDefinition(raw);
    expect(() => resolveDamageEffects(parsed, emilia, MAX_SKILL_LEVELS)).toThrow(/must fold into the shot/);
  });
});

describe('エミリア（821）の定義', () => {
  it('resolves the Lv10 values of the description', () => {
    const d = parseSkillDefinition(rawDefinition(821));
    expect(d.skills.skill1.effects.map((e) => e.kind)).toEqual(['timed', 'timed']);
    expect(d.skills.skill2.effects.map((e) => e.kind)).toEqual(['damage', 'timed']);
    expect(d.skills.burst.effects.map((e) => e.kind)).toEqual(['state']);
    expect(d.skills.burst.support).toBe('partial');
  });
});
