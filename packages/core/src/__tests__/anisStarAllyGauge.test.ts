// アニス：スター（17）の S1 の味方のゲージ（allyGaugeAdd。plan/design-anis-star-ally-gauge.md）: 味方のゲージ 1 回ごとに、
// 自分の最初の発の着弾の前は 840、着弾から 1,680 を足す（C-0244〜C-0246・C-0620）。自分の分は ×1.06 のまま（C-0198）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

function fixedSlot(id: number): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    conditionMode: 'auto',
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

// V-0482 の撮り方 1（録画 0545・0546）: アニス：スター（AI）+ クラウン（操作・AUTO）+ デルタ（AI）
const TEAM: TeamInput = {
  slots: [fixedSlot(17), fixedSlot(330), fixedSlot(20)],
  enemy: rangeEnemy,
  durationSeconds: 30,
  burst: true,
  controlledSlot: 1,
};

/** 発のゲージの並び（shotGauges）から、1 回目の満タンのフレームを出す。add は枠ごとの 1 回あたりの上乗せ（フレームで変わる） */
function firstFullFrame(input: TeamInput, add: (slotIndex: number, frame: number) => number): number | undefined {
  const plan = planTeamRun(input);
  const byFrame = new Map<number, number>();
  for (const g of plan.shotGauges) {
    const shot = input.slots[g.slotIndex]!.character.shot;
    const hits = g.energy / shot.targetBurstEnergyPerShot;
    byFrame.set(g.frame, (byFrame.get(g.frame) ?? 0) + g.energy + hits * add(g.slotIndex, g.frame));
  }
  let sum = 0;
  for (const f of [...byFrame.keys()].sort((a, b) => a - b)) {
    sum += byFrame.get(f)!;
    if (sum >= 1_000_000) return f;
  }
  return undefined;
}

describe('アニス：スター S1 の味方のゲージ（allyGaugeAdd）', () => {
  const plan = planTeamRun(TEAM);
  const anisGauges = plan.shotGauges.filter((g) => g.slotIndex === 0);
  const landing = Math.min(...anisGauges.map((g) => g.frame));

  it('keeps ×1.06 on her own shots and additional damage hits (C-0198)', () => {
    expect(anisGauges.length).toBeGreaterThan(0);
    for (const g of anisGauges) expect(g.energy).toBeCloseTo(28_000 * 1.06, 6);
  });

  it('does not scale the allies’ own gauge (no ×1.06)', () => {
    const crown = plan.shotGauges.filter((g) => g.slotIndex === 1);
    expect(crown.length).toBeGreaterThan(0);
    for (const g of crown) expect(g.energy).toBeLessThanOrEqual(1_000 + 1e-9);
  });

  it('adds 840 per ally gauge event before her first landing and 1,680 from it (C-0246・C-0620)', () => {
    const expected = firstFullFrame(TEAM, (i, f) => (i === 0 ? 0 : f >= landing ? 1_680 : 840));
    expect(plan.schedule!.gaugeFullFrames[0]).toBe(expected);
    // ×1.06 のときより早く満タンになる（V-0482 の録画 0545・0546 は戦闘開始から 314・315f）
    expect(expected).toBeLessThan(firstFullFrame(TEAM, (i) => (i === 0 ? 0 : 0.06 * 1_000))!);
    expect(plan.schedule!.gaugeFullFrames[0]).toBe(316);
  });

  it('adds nothing without her', () => {
    const without: TeamInput = { ...TEAM, slots: [TEAM.slots[1]!, TEAM.slots[2]!], controlledSlot: 0 };
    const p = planTeamRun(without);
    expect(p.schedule!.gaugeFullFrames[0]).toBe(firstFullFrame(without, () => 0));
  });

  it('allows at most one allyGaugeAdd per definition', () => {
    const raw = readJson<{ skills: { skill2: { effects: unknown[] } } }>('../../data/skills/17.json');
    raw.skills.skill2.effects.push({ kind: 'allyGaugeAdd', ref: 1 });
    expect(() => parseSkillDefinition(raw)).toThrow(/at most one allyGaugeAdd/);
  });
});
