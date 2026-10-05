// アニス：スター（17）のバーストのコアの経路（plan/design-anis-star-core-path.md 3.1・3.2 節）: 自動攻撃の core と、的の表の
// coreHitRate.autoAttacks。行が無いあいだは数値が変わらないこと（退化）と、行があるときの式（boost に 割合 × (コア倍率 − 1)）を見る。
// 行の値はテスト用（実データの表には行が無い。割合は未測定）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { landingFrameSpans, slotAutoAttackCoreRatesOf } from '../frame/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { computeBurstHit, resolveDotEffects } from '../skills/burstDamage.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData, TargetProfile, TargetRateRow } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const rawMaster = readJson<Record<string, unknown>>('../../data/enemies.json');
const master = parseEnemyPresets(rawMaster);
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const anis = readJson<CharacterData>('../../data/characters/17.json');
type RawDefinition = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: Record<string, unknown>[] }> };
const raw = readJson<RawDefinition>('../../data/skills/17.json');

function rangeEnemy(target: TargetProfile, hasCore = true): EnemyInput {
  return {
    defence: FIXED_SPEC_ENEMY_DEFENCE,
    element: 'Fire',
    hasCore,
    events: enemyEventsOf(master, ['range-3min-jump'], 180),
    target,
    landings: enemyLandingsOf(master, ['range-3min-jump'], 180, target),
  };
}

/** シューティングスターの行を足した的（テスト用の値） */
function withStarRow(row: TargetRateRow): TargetProfile {
  return { ...profile, coreHitRate: { ...profile.coreHitRate, autoAttacks: { '17:burst': row } } };
}

/** 定義の core を外したもの（いままでのモデル） */
function definitionWithoutCore(): unknown {
  const copy = structuredClone(raw);
  for (const e of copy.skills.burst.effects) delete e.core;
  return copy;
}

function soloSlot(definition: unknown): TeamSlotInput {
  const fixed = computeFixedSpecAttack(anis);
  return {
    character: anis,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: parseSkillDefinition(definition), levels: MAX_SKILL_LEVELS },
  };
}

// 録画 164 と同じ: アニス：スター単騎・操作・オートバースト ON・BigArms 灼熱の 3 分モード
function solo(enemy: EnemyInput, definition: unknown = raw): TeamInput {
  return { slots: [soloSlot(definition)], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
}

const starTicks = (input: TeamInput) =>
  planTeamRun(input).skillHits.filter((h) => h.effect.dot?.autoAttack === true && h.effect.source.skill === 'burst');

describe('自動攻撃の core（plan/design-anis-star-core-path.md 3.1 節）', () => {
  it('marks only the Shooting Stars of the definition', () => {
    const def = parseSkillDefinition(raw);
    const dots = resolveDotEffects(def, anis, MAX_SKILL_LEVELS);
    expect(dots.map((d) => [d.source.skill, d.core === true])).toEqual([['burst', true]]);
  });

  it('adds rate × (core multiplier − 1) to the boost of core effects only (the same term as crit and Full Burst)', () => {
    const effect = resolveDotEffects(parseSkillDefinition(raw), anis, MAX_SKILL_LEVELS)[0]!;
    const plain = { ...effect, core: undefined };
    const base = {
      attack: 10_000,
      enemy: { defence: 100, element: null, hasCore: true },
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      fullBurstBonus: true,
    };
    const body = computeBurstHit({ ...base, effects: [effect] });
    const core = computeBurstHit({ ...base, effects: [effect], core: { rate: 1, damage: 1 } });
    // フルバースト中のコア / 胴体は (1 + 0.5 + 1) ÷ (1 + 0.5)（乗算の ×2 ではない。2.1 節の b1）
    expect(core.perActivation / body.perActivation).toBeCloseTo(2.5 / 1.5, 12);
    expect(core.boost).toMatchObject({ core: 1, coreDamage: 1, total: 2.5 });
    // core でない効果には足さない
    const other = computeBurstHit({ ...base, effects: [plain], core: { rate: 1, damage: 1 } });
    expect(other.perActivation).toBeCloseTo(body.perActivation, 9);
    expect(other.boost).toMatchObject({ core: 0, coreDamage: 0, total: 1.5 });
  });
});

describe('的の表の coreHitRate.autoAttacks（3.2 節）', () => {
  it('has no Shooting Star row in the data, so nothing changes (unmeasured rate = 0)', () => {
    expect(profile.coreHitRate.autoAttacks).toBeUndefined();
    const enemy = rangeEnemy(profile);
    const now = starTicks(solo(enemy));
    const before = starTicks(solo(enemy, definitionWithoutCore()));
    expect(now).toHaveLength(before.length);
    now.forEach((h, i) => {
      expect(h.frame).toBe(before[i]!.frame);
      expect(h.hit.perActivation).toBeCloseTo(before[i]!.hit.perActivation, 6);
      expect(h.hit.boost.core).toBe(0);
      expect(h.hit.boost.coreDamage).toBe(1);
    });
  });

  it('looks up the rate at the tick frame by landing band', () => {
    const frames = gameSecondsToFrames(180);
    const enemy = rangeEnemy(withStarRow({ near: 1, far: 0.25 }));
    const [rates] = slotAutoAttackCoreRatesOf([soloSlot(raw)], enemy, frames);
    const spans = landingFrameSpans(enemy, frames);
    expect(rates?.burst?.map((s) => s.frames)).toEqual(
      spans.map((s) => (s.band === 'near' ? 1 : s.band === 'far' ? 0.25 : 0)),
    );
    // 行の無い的・コアの無い敵ではコアに当たらない
    expect(slotAutoAttackCoreRatesOf([soloSlot(raw)], rangeEnemy(profile), frames)).toEqual([null]);
    const ticks = starTicks(solo(enemy));
    const bandAt = (f: number) => spans.find((s) => f >= s.start && f < s.end)?.band;
    for (const h of ticks) {
      const rate = bandAt(h.frame) === 'near' ? 1 : bandAt(h.frame) === 'far' ? 0.25 : 0;
      expect(h.hit.boost.core).toBeCloseTo(rate, 12);
    }
    expect(ticks.some((h) => h.hit.boost.core === 1)).toBe(true);
    const noCore = starTicks(solo(rangeEnemy(withStarRow({ all: 1 }), false)));
    expect(noCore.every((h) => h.hit.boost.core === 0)).toBe(true);
  });

  it('raises the Shooting Star damage the same way in sim and calc', () => {
    const before = solo(rangeEnemy(profile));
    const after = solo(rangeEnemy(withStarRow({ all: 1 })));
    const sim = runSimulation(after);
    const calc = computeTeamDamage(after);
    expect(calc.totalDamage).toBeCloseTo(sim.totalDamage, 0);
    expect(sim.totalDamage).toBeGreaterThan(runSimulation(before).totalDamage);
  });

  it('rejects a broken row or a non-true core', () => {
    const bad = (coreHitRate: unknown) => () =>
      parseEnemyPresets({
        ...rawMaster,
        targetProfiles: (rawMaster.targetProfiles as Record<string, unknown>[]).map((p) => ({ ...p, coreHitRate })),
      });
    const table = (rawMaster.targetProfiles as Record<string, Record<string, unknown>>[])[0]!.coreHitRate;
    expect(bad({ ...table, autoAttacks: { shootingStar: { all: 1 } } })).toThrow(/resourceId/);
    expect(bad({ ...table, autoAttacks: { '17:burst': { all: 1.5 } } })).toThrow(/\[0, 1\]/);
    expect(bad({ ...table, autoAttacks: { '17:burst': null } })).not.toThrow();
    const copy = structuredClone(raw);
    copy.skills.burst.effects[0]!.core = 'yes';
    expect(() => parseSkillDefinition(copy)).toThrow(/core/);
  });
});
