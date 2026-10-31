// バーストのヒットは、撃つ側のバフも敵の側のデバフ（受けるダメージ▲・防御力▼）も発動の時点の値で見る
// （C-0795。plan/design-burst-landing.md 11 節）。発動の後・ヒットの前に付いた敵の側のデバフは、ヒットの時点で付いていても乗らない。
// 編成は、ルドミラ（I。ヒットは I の発動から遅れる。C-0675）・ブラン（II。使った時から付く受けるダメージ▲。C-0692）・
// プリバティ：アンカインド・メイド（III）。ブランの▲は、II まで進んだ回は毎回ルドミラの発動の後・ヒットの前に付く
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { burstHitBuffs, burstSnapshotState, planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LUDMILLA = 0;
const BLANC = 1;
const PRIVATY = 2;
// ブランのバーストの受けるダメージ▲（Lv10。C-0692）
const BLANC_DAMAGE_TAKEN = 0.3926;

function slotOf(id: number): TeamSlotInput {
  const c = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

const input: TeamInput = {
  slots: [slotOf(190), slotOf(270), slotOf(313)],
  enemy: { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true },
  durationSeconds: 180,
  burst: true,
  burstModel: 'dynamic',
  controlledSlot: LUDMILLA,
};

describe('バーストのヒットが敵の側のデバフを見る時点（C-0795）', () => {
  const plan = planTeamRun(input);
  const activations = plan.schedule!.activations;
  // II（ブラン）まで進んだ回の I の発動
  const chained = activations.filter((a, k) => a.slotIndex === LUDMILLA && activations[k + 1]?.slotIndex === BLANC);

  it("uses the enemy debuffs at the use, not at the hit: Blanc's ▲ from II is on at Ludmilla's hit but not used", () => {
    expect(chained.length).toBeGreaterThan(0);
    for (const a of chained) {
      const hitFrame = a.frame + 78;
      const atHit = burstSnapshotState(plan.timeline, hitFrame, LUDMILLA, true).buffs;
      const atUse = burstSnapshotState(plan.timeline, a.frame, LUDMILLA, true).buffs;
      expect(atHit.damageTaken).toBeCloseTo(atUse.damageTaken + BLANC_DAMAGE_TAKEN, 12);
      expect(burstHitBuffs(plan.timeline, a.frame, hitFrame, LUDMILLA, true)).toEqual(atUse);
    }
  });

  it("leaves Blanc's ▲ off Ludmilla's burst hits and on Privaty's (used after the ▲)", () => {
    const sim = runSimulation(input);
    const ludmilla = sim.slots[LUDMILLA]!.burst.hits;
    const privaty = sim.slots[PRIVATY]!.burst.hits;
    expect(ludmilla.length).toBeGreaterThan(chained.length);
    expect(privaty.length).toBeGreaterThan(0);
    for (const h of ludmilla) expect(h.damageTakenMultiplier).toBe(1);
    for (const h of privaty) expect(h.damageTakenMultiplier).toBeCloseTo(1 + BLANC_DAMAGE_TAKEN, 12);
  });

  // 予測の仮説（EnemyInput.burstHitEnemyDebuffs。V-0587 の H-hit）: 敵の側のデバフだけヒットの直前の値で見る（C-0795 の前の形）
  it("takes only the enemy debuffs at the hit under the 'hit' hypothesis", () => {
    for (const a of chained) {
      const hitFrame = a.frame + 78;
      const atHit = burstSnapshotState(plan.timeline, hitFrame, LUDMILLA, true).buffs;
      const atUse = burstSnapshotState(plan.timeline, a.frame, LUDMILLA, true).buffs;
      expect(burstHitBuffs(plan.timeline, a.frame, hitFrame, LUDMILLA, true, undefined, 'hit')).toEqual({
        ...atUse,
        damageTaken: atHit.damageTaken,
        enemyDefenseDown: atHit.enemyDefenseDown,
      });
      expect(burstHitBuffs(plan.timeline, a.frame, a.frame, LUDMILLA, true, undefined, 'hit')).toEqual(atUse);
    }
  });

  it("puts Blanc's ▲ on Ludmilla's chained hits only under the 'hit' hypothesis ('activation' is the model)", () => {
    const base = runSimulation(input);
    const activation = runSimulation({ ...input, enemy: { ...input.enemy, burstHitEnemyDebuffs: 'activation' } });
    expect(activation.slots.map((s) => s.burst.hits)).toEqual(base.slots.map((s) => s.burst.hits));
    const hit = runSimulation({ ...input, enemy: { ...input.enemy, burstHitEnemyDebuffs: 'hit' } });
    const chainedFrames = new Set(chained.map((a) => a.frame));
    const ludmillaActivations = activations.filter((a) => a.slotIndex === LUDMILLA);
    const ludmilla = hit.slots[LUDMILLA]!.burst.hits;
    expect(ludmilla.length).toBe(ludmillaActivations.length);
    ludmilla.forEach((h, k) => {
      const expected = chainedFrames.has(ludmillaActivations[k]!.frame) ? 1 + BLANC_DAMAGE_TAKEN : 1;
      expect(h.damageTakenMultiplier).toBeCloseTo(expected, 12);
    });
    // プリバティ：アンカインド・メイドは遅れの無い受け手で、どちらの仮説でも同じ値
    expect(hit.slots[PRIVATY]!.burst.hits).toEqual(base.slots[PRIVATY]!.burst.hits);
  });
});
