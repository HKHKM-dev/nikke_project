// エレグ（500）の定義（plan/design-elegg.md 段 1）。S2 の「ターゲットが出現した時、味方全体にバーストゲージのチャージ 100%」を、
// 戦闘開始の burstGauge で入れる（C-0662）。段 3（plan/design-elegg-s3.md）: S2 の前半の攻撃力▲（C-0696・C-0697）と S1 の分配ダメージ（C-0766）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { hexagonFrameOf } from '../../burst/schedule.ts';
import { distributedHitMultiplier } from '../../damage.ts';
import { planTeamRun } from '../../frame/plan.ts';
import type { TeamInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { computeBurstHit } from '../burstDamage.ts';
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
  copy.skills.skill2!.effects = copy.skills.skill2!.effects.filter(
    (e) => (e as { kind: string }).kind !== 'burstGauge',
  );
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
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'burstGauge',
      trigger: 'battleStart',
      target: 'allies',
      ref: 4,
    });
  });

  it('fills the gauge on the frame after battle start (C-0662)', () => {
    expect(planTeamRun(solo(def)).schedule!.gaugeFullFrames[0]).toBe(1);
    // ゲージなしなら、エレグの弾で溜まるまで満タンにならない
    expect(planTeamRun(solo(withoutGauge())).schedule!.gaugeFullFrames[0]).toBeGreaterThan(100);
  });
});

// 段 2（plan/design-elegg.md 8 節）: バーストスキルダメージ（C-0689）・ブームインストール（敵に付く状態。ヒットから付く防御力▼。C-0690）・
// 分配ダメージ▲（発動から。C-0691）
const SAKURA = 836;
const SUN = 308;

function slotOf(id: number): TeamInput['slots'][number] {
  const c = id === 500 ? elegg : readJson<CharacterData>(`../../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamInput['slots'][number] = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const definition =
    id === 500 ? def : parseSkillDefinition(readJson<unknown>(`../../../data/skills/${id}.json`) as never);
  slot.skills = { definition, levels: MAX_SKILL_LEVELS };
  return slot;
}

/** 編成 C（鈴原サクラ・I-DOLL・サン・エレグ（3 枠目・操作）） */
function teamC(): TeamInput {
  return {
    slots: [slotOf(SAKURA), slotOf(SUN), slotOf(500)],
    enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
    durationSeconds: 60,
    burst: true,
    controlledSlot: 2,
  };
}

/** 生の定義の burst スロットだけを差し替えて読む（検証の規則のテスト） */
function withBurst(effects: unknown[], slot: 'skill1' | 'burst' = 'burst'): () => SkillDefinition {
  const copy = structuredClone(raw);
  copy.skills[slot]!.effects = effects;
  return () => parseSkillDefinition(copy);
}

describe('エレグ（500）のバースト', () => {
  it('defines the burst damage, BOOM Install on the enemy and the distributed damage increase', () => {
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects).toMatchObject([
      { kind: 'burstDamage', ref: 3, damageType: 'skill' },
      { kind: 'state', state: 'boomInstall', trigger: 'burstHit', target: 'allies', enemy: true },
      { kind: 'timed', trigger: 'burstUse', stat: 'distributedDamage' },
    ]);
  });

  it('applies the defense decrease from the burst hit, and the distributed damage from the activation', () => {
    const plan = planTeamRun(teamC());
    const schedule = plan.schedule!;
    const activation = schedule.activations.find((a) => a.slotIndex === 2)!;
    const hit = activation.hitFrame!;
    // ヒットは II の替わり目から 30（遅れの表のエレグの行。C-0689）で、フルバーストの入りの頃
    expect(hit).toBe(hexagonFrameOf(activation) + 30);
    expect(Math.abs(hit - schedule.fullBurstWindows[0]!.start)).toBeLessThanOrEqual(1);
    const at = (frame: number) =>
      plan.timeline.segments.find((s) => s.start <= frame && frame < s.end)!.slots[0]!.buffs;
    expect(at(activation.frame - 1).distributedDamage).toBe(0);
    expect(at(activation.frame).distributedDamage).toBeGreaterThan(0);
    expect(at(hit - 1).enemyDefenseDown).toBe(0);
    expect(at(hit).enemyDefenseDown).toBeCloseTo(0.3564, 6);
    // 維持は 10 秒（588f）
    expect(at(hit + 587).enemyDefenseDown).toBeCloseTo(0.3564, 6);
    expect(at(hit + 588).enemyDefenseDown).toBe(0);
  });

  it('allows burstHit only in timed and state grants of a burst slot with burst damage', () => {
    const grant = {
      kind: 'state',
      state: 'boomInstall',
      trigger: 'burstHit',
      target: 'enemy',
      durationRef: 5,
      contents: [{ stat: 'enemyDefenseDown', ref: 4 }],
    };
    expect(withBurst([grant])).toThrow(/burstHit needs a burstDamage/);
    expect(withBurst([grant], 'skill1')).toThrow(/only in the burst slot/);
    expect(
      withBurst([
        { kind: 'burstDamage', ref: 3, damageType: 'skill' },
        { kind: 'damage', trigger: 'burstHit', ref: 3 },
      ]),
    ).toThrow();
  });

  it('holds only enemy-held stats in a state on the enemy, and only enemy states', () => {
    const damage = { kind: 'burstDamage', ref: 3, damageType: 'skill' };
    const grant = (extra: Record<string, unknown>) => ({
      kind: 'state',
      state: 'boomInstall',
      trigger: 'burstHit',
      target: 'enemy',
      durationRef: 5,
      contents: [{ stat: 'enemyDefenseDown', ref: 4 }],
      ...extra,
    });
    expect(withBurst([damage, grant({ contents: [{ stat: 'attack', ref: 4 }] })])).toThrow(/enemy-held stats/);
    expect(withBurst([damage, grant({ state: 'persona' })])).toThrow(/held by the ally/);
    expect(withBurst([damage, grant({ target: 'allies' })])).toThrow(/held by the enemy/);
    expect(withBurst([damage, grant({ contents: undefined })])).toThrow(/needs contents/);
  });
});

// 段 3（plan/design-elegg-s3.md 3.2 節）: S2 の前半。命中を通算で数え、60 の倍数に届いた時に敵がブームインストール状態なら、
// 味方全体にエレグのバフ前攻撃力 × 13.09% の固定加算（5 秒。C-0696・C-0697）
describe('エレグ（500）の S2 の攻撃力▲', () => {
  it('defines the attack increase with the enemy state condition', () => {
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects[1]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 1 },
      condition: { enemyState: 'boomInstall' },
      target: 'allies',
      stat: 'attack',
      scaling: 'casterAttack',
    });
  });

  it('applies only while the enemy is in BOOM Install, and lasts 5 seconds', () => {
    const plan = planTeamRun(teamC());
    const windows = plan.timeline.segments;
    const boom = plan.schedule!.activations.filter((a) => a.slotIndex === 2).map((a) => a.hitFrame!);
    const flat = computeFixedSpecAttack(elegg).attack * 0.1309;
    const on = windows.filter((s) => s.slots[0]!.buffs.attackFlat > 0);
    expect(on.length).toBeGreaterThan(0);
    for (const s of on) {
      // どの▲も、ブームインストールの窓 [ヒット, ヒット + 588) の中で付き、付いてから 294f（5 秒）で切れる
      expect(boom.some((h) => h < s.start && s.end <= h + 588 + 294)).toBe(true);
      expect(s.slots[0]!.buffs.attackFlat).toBeCloseTo(flat, 0);
    }
    // 1 回目のブームインストールの前は付かない（通算の 60 の倍数に届いても、状態の外）
    const first = boom[0]!;
    expect(windows.filter((s) => s.end <= first).every((s) => s.slots[0]!.buffs.attackFlat === 0)).toBe(true);
  });

  it('accepts enemyState in a timed condition only for enemy-held states', () => {
    const timed = (state: string) => ({
      kind: 'timed',
      trigger: { count: 'normalHit', everyRef: 1 },
      condition: { enemyState: state },
      target: 'allies',
      stat: 'attack',
      scaling: 'casterAttack',
      ref: 2,
      durationRef: 3,
    });
    const with2 = (effect: unknown) => () => {
      const copy = structuredClone(raw);
      copy.skills.skill2!.effects = [effect];
      return parseSkillDefinition(copy);
    };
    expect(with2(timed('boomInstall'))).not.toThrow();
    expect(with2(timed('persona'))).toThrow();
  });
});

// V-0560: S1 の分配ダメージ。通算の命中が 100 の倍数に届いた発の 8f 後から +0・+24・+36f の 3 ヒットで、説明文の値を 3 等分した値。
// 値は届いた発の次のフレームのバフで決め、3 ヒットとも同じ（C-0697・C-0766）。受けるダメージ▲は分配ダメージ▲と 1 つの和（C-0767）
describe('エレグ（500）の S1 の分配ダメージ', () => {
  it('defines three equal hits of the distributed damage', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'damage',
      trigger: { count: 'normalHit', everyRef: 2 },
      condition: { enemyState: 'boomInstall' },
      damageType: 'distributed',
      delayFrames: 8,
      hitOffsetFrames: [0, 24, 36],
      valueDelayFrames: 1,
    });
  });

  it('lands three hits of one third each inside BOOM Install, all with the same value', () => {
    const plan = planTeamRun(teamC());
    const boom = plan.schedule!.activations.filter((a) => a.slotIndex === 2).map((a) => a.hitFrame!);
    const hits = plan.skillHits.filter((h) => h.slotIndex === 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length % 3).toBe(0);
    for (let i = 0; i < hits.length; i += 3) {
      const [a, b, c] = [hits[i]!, hits[i + 1]!, hits[i + 2]!];
      expect([b.frame - a.frame, c.frame - a.frame]).toEqual([24, 36]);
      const fire = a.frame - 8;
      expect(boom.some((h) => h <= fire && fire < h + 588)).toBe(true);
      expect(a.effect.multiplier).toBeCloseTo(1.5865 / 3, 10);
      expect(b.hit.perActivation).toBe(a.hit.perActivation);
      expect(c.hit.perActivation).toBe(a.hit.perActivation);
    }
  });

  it('validates the split hits and the value frame', () => {
    const s1 = (extra: Record<string, unknown>) => ({
      kind: 'damage',
      trigger: { count: 'normalHit', everyRef: 2 },
      ref: 4,
      damageType: 'distributed',
      delayFrames: 8,
      ...extra,
    });
    expect(withBurst([s1({ hitOffsetFrames: [0, 24, 36], valueDelayFrames: 1 })], 'skill1')).not.toThrow();
    expect(withBurst([s1({ hitOffsetFrames: [1, 24] })], 'skill1')).toThrow(/starting at 0/);
    expect(withBurst([s1({ hitOffsetFrames: [0, 24, 24] })], 'skill1')).toThrow(/strictly increasing/);
    expect(withBurst([s1({ valueDelayFrames: 1 })], 'skill1')).toThrow(/needs hitOffsetFrames/);
    expect(withBurst([s1({ hitOffsetFrames: [0, 24], valueDelayFrames: 9 })], 'skill1')).toThrow(/exceed delayFrames/);
  });
});

describe('分配ダメージの受けるダメージ▲（C-0767）', () => {
  it('adds the damage taken increase to the distributed damage increase in one sum', () => {
    const input = {
      attack: 1000,
      enemy: { defence: 0, element: null, hasCore: false },
      crit: { rate: 0, damage: 1.5 },
      attackDamageMultiplier: 1,
      elementMultiplier: 1,
      fullBurstBonus: false,
      distributedDamageMultiplier: 1.5,
      damageTakenMultiplier: 1.2,
    };
    const effect = {
      source: { resourceId: 500, skill: 'skill1' as const, name: elegg.skills.skill1.name },
      multiplier: 1,
    };
    expect(
      computeBurstHit({ ...input, effects: [{ ...effect, damageType: 'distributed' }] }).perActivation,
    ).toBeCloseTo(1700, 6);
    // 分配ダメージでない効果には、受けるダメージ▲だけが別の乗数で掛かる
    expect(computeBurstHit({ ...input, effects: [{ ...effect, damageType: 'skill' }] }).perActivation).toBeCloseTo(
      1200,
      6,
    );
    expect(distributedHitMultiplier(1.3974, 1.1718)).toBeCloseTo(1.5692 / 1.1718, 12);
    expect(distributedHitMultiplier(1, 1)).toBe(1);
  });
});
