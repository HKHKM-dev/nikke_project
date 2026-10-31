// C-0774 の H-snap の切り替え（EnemyInput.burstHitDebuffsAt）: バーストのヒットが敵の側のデバフを見る時点。
// 省略（いまのモデル）はヒットの時点、'activation' は発動の時点。予測の仮説（records/predictions の setup）だけが使う。
// 編成は V-0576 の撮影の編成（◎ルドミラ（I・撃たない）・ブラン（II）・プリバティ：アンカインド・メイド（III））。ルドミラのヒットは I の発動から
// 遅れ（C-0675）、その間に II のブランの受けるダメージ▲（使った時から付く。C-0692）が付く
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BurstHitDebuffsAt, EnemyInput } from '../damage.ts';
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

function input(burstHitDebuffsAt?: BurstHitDebuffsAt): TeamInput {
  const enemy: EnemyInput = {
    defence: FIXED_SPEC_ENEMY_DEFENCE,
    element: null,
    hasCore: true,
    ...(burstHitDebuffsAt === undefined ? {} : { burstHitDebuffsAt }),
  };
  return {
    slots: [slotOf(190), slotOf(270), slotOf(313)],
    enemy,
    durationSeconds: 180,
    burst: true,
    burstModel: 'dynamic',
    controlledSlot: LUDMILLA,
  };
}

describe('バーストのヒットが敵の側のデバフを見る時点（EnemyInput.burstHitDebuffsAt。C-0774）', () => {
  const atHit = runSimulation(input());
  const atActivation = runSimulation(input('activation'));

  it('keeps the current model when omitted (the hit sees the enemy debuffs at the hit)', () => {
    expect(runSimulation(input('hit')).slots.map((s) => s?.burst.hits)).toEqual(atHit.slots.map((s) => s?.burst.hits));
  });

  it("reads the damage taken up attached between the use and the hit only at the hit: Ludmilla's hit loses Blanc's ▲ under 'activation'", () => {
    const hit = atHit.slots[LUDMILLA]!.burst.hits;
    const snap = atActivation.slots[LUDMILLA]!.burst.hits;
    expect(snap.length).toBe(hit.length);
    // ブランはクールタイム 60 秒なので、ルドミラ（20 秒）の発動のうち II まで進むのは 3 回に 1 回。進まない回は▲が無く、どちらでも同じ値
    const chained = [...hit.keys()].filter((n) => hit[n]!.damageTakenMultiplier !== 1);
    expect(chained.length).toBeGreaterThan(0);
    for (const [n, h] of hit.entries()) {
      expect(snap[n]!.damageTakenMultiplier).toBe(1);
      if (!chained.includes(n)) {
        expect(snap[n]).toEqual(h);
        continue;
      }
      expect(h.damageTakenMultiplier).toBeCloseTo(1 + BLANC_DAMAGE_TAKEN, 12);
      expect(h.perActivation / snap[n]!.perActivation).toBeCloseTo(1 + BLANC_DAMAGE_TAKEN, 12);
    }
  });

  it('does not change a hit whose use comes after the debuff (Privaty in III has the ▲ either way)', () => {
    const hit = atHit.slots[PRIVATY]!.burst.hits;
    expect(hit.length).toBeGreaterThan(0);
    expect(atActivation.slots[PRIVATY]!.burst.hits).toEqual(hit);
    for (const h of hit) expect(h.damageTakenMultiplier).toBeCloseTo(1 + BLANC_DAMAGE_TAKEN, 12);
  });

  it("returns the buffs at the use under 'activation' (same as burstSnapshotState)", () => {
    const plan = planTeamRun(input());
    // II（ブラン）まで進んだ回の I の発動
    const uses = plan.schedule!.activations.filter(
      (a, k, all) => a.slotIndex === LUDMILLA && all[k + 1]?.slotIndex === 1,
    );
    expect(uses.length).toBeGreaterThan(0);
    for (const a of uses) {
      const before = burstSnapshotState(plan.timeline, a.frame, LUDMILLA, true).buffs;
      expect(burstHitBuffs(plan.timeline, a.frame, a.frame + 78, LUDMILLA, true, undefined, 'activation')).toEqual(before);
      expect(burstHitBuffs(plan.timeline, a.frame, a.frame + 78, LUDMILLA, true).damageTaken).toBeGreaterThan(
        before.damageTaken,
      );
    }
  });
});
