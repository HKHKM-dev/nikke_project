// Stage 9: 宝物版スキルの回帰（plan/design-stage9.md 8.2・8.3 節）。
// ユーザーのドレイクは宝物（ヴィランのフィギュア）を 3 段階目まで解放している。録画 36・37 はすでに宝物版の数値で読み取ってあるので、
// 段階 3 のドレイクで実測値を固定する（新規撮影なし）。段階 0（省略）は Stage 8 と同じになる。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { type TeamInput, type TeamSlotInput, type TeamSlotResult } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { FPS } from '../weapons.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

/** スペック固定のニケ。定義があれば Lv10 と宝物の段階で載せる */
function fixedSlot(id: number, treasurePhase: TreasurePhase = 0): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  const slot: TeamSlotInput = {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      treasurePhase,
    };
  }
  return slot;
}

/** 灼熱の的（射撃場の BigArms）。ドレイクも灼熱なので属性有利なし */
const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: false };

type SkillHit = TeamSlotResult['skillHits']['activations'][number];

/** 射撃場に出る数値（非会心）: 期待値の加算グループ (1 + 会心期待値 + FB) を (1 + FB) に置き換えたもの */
function nonCritOf(a: SkillHit): number {
  return (a.hit.perActivation / a.hit.boost.total) * (1 + a.hit.boost.fullBurst);
}

function byMultiplier(hits: readonly SkillHit[], multiplier: number): SkillHit[] {
  return hits.filter((a) => Math.abs(a.hit.multiplier - multiplier) < 1e-9);
}

describe('ドレイクの宝物（データ）', () => {
  const drake = readJson<CharacterData>('../../data/characters/101.json');

  it('is the Villain Figurine, unlocked in the order skill1 → skill2 → burst', () => {
    expect(drake.treasure?.favoriteId).toBe(200801);
    expect(drake.treasure?.name.ja).toBe('ヴィランのフィギュア');
    expect(drake.treasure?.unlockOrder).toEqual(['skill1', 'skill2', 'burst']);
  });

  it('has the Lv10 values the user read from Blablalink', () => {
    const lv10 = (slot: 'skill1' | 'skill2' | 'burst', ref: number) => drake.treasure!.skills[slot].values[ref - 1]![9];
    expect([lv10('skill1', 5), lv10('skill1', 7)]).toEqual(['63.88', '50.14']);
    expect([lv10('skill2', 4), lv10('skill2', 6)]).toEqual(['5', '201.6']);
    expect([lv10('burst', 1), lv10('burst', 2), lv10('burst', 4)]).toEqual(['3009.6', '72.18', '31.68']);
  });

  it('is present on exactly the 21 SSR treasure owners', () => {
    const owners = readJson<{ characters: { resourceId: number }[] }>('../../data/characters/index.json')
      .characters.map((c) => c.resourceId)
      .filter((id) => readJson<CharacterData>(`../../data/characters/${id}.json`).treasure !== null)
      .sort((a, b) => a - b);
    expect(owners).toEqual([
      30, 32, 72, 80, 100, 101, 112, 140, 141, 142, 150, 170, 192, 210, 280, 281, 352, 390, 411, 550, 580,
    ]);
  });
});

describe('録画 36: ドレイク単騎（宝物 3 段階）', () => {
  const input: TeamInput = { slots: [fixedSlot(101, 3)], enemy, durationSeconds: 60 };
  const calc = computeTeamDamage(input);
  const drake = calc.slots[0]!;
  const hits = drake.skillHits.activations;

  it('reports the treasure phase and the swapped slots', () => {
    expect(drake.treasurePhase).toBe(3);
    expect(drake.treasureSlots).toEqual(['skill1', 'skill2', 'burst']);
    expect(drake.character.skills.skill2.values[5]![9]).toBe('201.6');
  });

  it('adds the 5-shot hit of 201.6% (241,509) and keeps the 10-shot hit (118,059)', () => {
    const every5 = byMultiplier(hits, 2.016);
    const every10 = byMultiplier(hits, 0.9855);
    expect(every5.length).toBe(2 * every10.length);
    expect(Math.round(nonCritOf(every5[0]!))).toBe(241509);
    expect(Math.round(nonCritOf(every10[0]!))).toBe(118059);
    // 10 発目には両方出る（5・10・15…発目と 10・20…発目）
    const frames5 = every5.map((a) => a.seconds * FPS);
    for (const a of every10) expect(frames5).toContain(a.seconds * FPS);
  });

  it('is at least as strong as the base version, and phase 0 is the base version', () => {
    const base = computeTeamDamage({ ...input, slots: [fixedSlot(101, 0)] }).slots[0]!;
    expect(base.treasurePhase).toBe(0);
    expect(base.treasureSlots).toEqual([]);
    expect(byMultiplier(base.skillHits.activations, 2.016)).toHaveLength(0);
    expect(drake.totalDamage).toBeGreaterThan(base.totalDamage);
  });
});

describe('録画 37: ラム + デルタ + ドレイク（宝物 3 段階）', () => {
  const input: TeamInput = {
    slots: [fixedSlot(822), fixedSlot(20), fixedSlot(101, 3)],
    enemy,
    durationSeconds: 180,
    burst: true,
  };
  const calc = computeTeamDamage(input);
  const drake = calc.slots[2]!;
  const windows = calc.schedule!.fullBurstWindows;
  const inFb = (a: SkillHit) => windows.some((w) => w.start <= a.seconds * FPS && a.seconds * FPS < w.end);
  const fbHits = drake.skillHits.activations.filter(inFb);

  it('matches the full-burst skill hits: 5 shots 838,582 and 10 shots 409,932', () => {
    // 210,593（= 119,896 × (1 + 11.85% + 63.88%) − 100）× 倍率 × (1 + 0.5) × 攻撃ダメージ (1 + 31.68%)
    const every5 = byMultiplier(fbHits, 2.016);
    const every10 = byMultiplier(fbHits, 0.9855);
    expect(every5.length).toBeGreaterThan(0);
    expect(every10.length).toBeGreaterThan(0);
    // モデルは最終攻撃力を整数に丸めない（210,593.24）。表示の数値は丸めた値と一致する
    expect(Math.round(every5[0]!.hit.baseHit)).toBe(210593);
    expect(every5[0]!.hit.attackDamageMultiplier).toBeCloseTo(1.3168, 12);
    // 丸めない攻撃力のぶん 1 だけ大きく出る（838,583）ので ±1 で比べる
    expect(Math.abs(nonCritOf(every5[0]!) - 838582)).toBeLessThanOrEqual(1);
    expect(Math.abs(nonCritOf(every10[0]!) - 409932)).toBeLessThanOrEqual(1);
  });

  it('matches the full-burst pellet (89,141) while the burst attack damage lasts', () => {
    const fb = drake.segments.find((g) => g.fullBurst && g.buffs.attackDamage > 0)!;
    expect(fb).toBeDefined();
    const t = fb.trigger;
    expect(Math.round(t.baseHit)).toBe(210593);
    // weaponMultiplier は 1 トリガー（10 ペレット）ぶん
    const perPellet = t.weaponMultiplier / drake.character.shot.shotCount;
    const pellet = t.baseHit * perPellet * (1 + t.boost.fullBurst) * t.attackDamageMultiplier;
    expect(Math.abs(pellet - 89141)).toBeLessThanOrEqual(1);
  });

  it('gives the Shotgun attack buff (63.88%) to the Shotgun only, not to the two SR allies', () => {
    const fbAttack = (slot: TeamSlotResult) =>
      Math.max(...slot.segments.filter((g) => g.fullBurst).map((g) => g.buffs.attackRatio));
    expect(fbAttack(drake)).toBeCloseTo(0.1185 + 0.6388, 12);
    expect(fbAttack(calc.slots[0]!)).toBeCloseTo(0.1185, 12);
    expect(fbAttack(calc.slots[1]!)).toBeCloseTo(0.1185, 12);
  });

  it('burst deals 3009.6% with the buffs from before the activation (3 hits of 1,201,793 in total)', () => {
    const hit = drake.burst.hit!;
    expect(hit.multiplier).toBeCloseTo(30.096, 12);
    // 1 回目の発動の前に攻撃ダメージは付いていない（付くのは発動の後の 10 秒）。フルバースト補正も乗らない
    expect(hit.attackDamageMultiplier).toBe(1);
    expect(hit.boost.fullBurst).toBe(0);
    // 録画 37: 総ダメージが f1286・f1314・f1342 に 1,201,793 ずつ増えた（= 1003.2% × 3、非会心）。合計で比べる
    const nonCrit = hit.perActivation / hit.boost.total;
    expect(Math.abs(nonCrit - 3 * 1201793)).toBeLessThanOrEqual(3);
  });

  it('sim and calc share the skill-hit activations exactly', () => {
    const sim = runSimulation(input);
    expect(sim.slots[2]!.skillHits.frames.map((f) => f / FPS)).toEqual(
      drake.skillHits.activations.map((a) => a.seconds),
    );
    expect(sim.slots[2]!.skillHits.damage).toBeCloseTo(drake.skillHits.totalDamage, 6);
    expect(Math.abs(sim.totalDamage - calc.totalDamage) / calc.totalDamage).toBeLessThan(0.03);
  });
});
