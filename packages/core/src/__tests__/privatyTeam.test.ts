// プリバティ（170）を含む編成: 宝物版の S1（フルバーストの開始で味方全体に 4 つの▲▼）、S2（最後の弾丸の命中で受けるダメージ▲と
// 追加ダメージ、ターゲット指定状態なら追加ダメージをもう 1 つ）、バースト（自分の有利コードの攻撃ダメージ▲・敵にターゲット指定）。
// ターゲット指定は中身を持たない敵の状態で、S2 の条件 enemyState だけが読む。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runTeam } from './runTeam.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { piecesOf, stateItemsOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

const PRIVATY = 170;

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
      ...(id === PRIVATY ? { treasurePhase: 3 as const } : {}),
    };
  }
  return slot;
}

// 水のプリバティに有利な火の敵
const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

function team(slots: TeamSlotInput[], controlledSlot: number): TeamInput {
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

// 最小に近い編成（リター + デルタ + プリバティ）と、プリバティが III の実戦寄りの 5 人
const TEAMS: Record<string, { input: TeamInput; privaty: number }> = {
  '最小に近い編成（リター + デルタ + プリバティ）': {
    input: team([fixedSlot(82), fixedSlot(20), fixedSlot(PRIVATY)], 2),
    privaty: 2,
  },
  '実戦寄り（リター + クラウン + プリバティ + アリス + ドレイク）': {
    input: team([fixedSlot(82), fixedSlot(330), fixedSlot(PRIVATY), fixedSlot(191), fixedSlot(101)], 2),
    privaty: 2,
  },
};

describe('プリバティの定義', () => {
  const def = parseSkillDefinition(readJson<unknown>(`../../data/skills/${PRIVATY}.json`));

  it('leaves the stun condition of the base S2 unimplemented and supports every treasure slot', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill2.support).toBe('partial');
    expect(def.skills.burst.support).toBe('supported');
    for (const slot of ['skill1', 'skill2', 'burst'] as const) {
      expect(def.treasureSkills?.[slot]?.support).toBe('supported');
    }
  });

  it('rejects a grant of Designated Target without contents when nothing reads it', () => {
    const raw = readJson<{ treasureSkills: { skill2: { effects: unknown[] } } }>(`../../data/skills/${PRIVATY}.json`);
    raw.treasureSkills.skill2.effects = raw.treasureSkills.skill2.effects.slice(0, 2);
    expect(() => parseSkillDefinition(raw)).toThrow(/needs contents/);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, privaty }) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);
  const lastShots = plan.shots[privaty]!.lastShotFrames!;
  // S2 の 2 つの追加ダメージは、条件（ターゲット指定状態なら）の有無で分ける
  const hitsOf = (designated: boolean) =>
    plan.skillHits.filter(
      (h) =>
        h.slotIndex === privaty &&
        h.effect.source.skill === 'skill2' &&
        (h.effect.condition?.enemyState === 'designatedTarget') === designated,
    );

  it('gives all allies the four S1 effects when Full Burst starts', () => {
    const s1 = piecesOf(plan).filter((p) => p.sourceSlotIndex === privaty && p.effect.source.skill === 'skill1');
    const stats = new Set(s1.map((p) => p.effect.stat));
    expect(stats).toEqual(new Set(['attack', 'reloadSpeed', 'maxAmmo', 'attackDamage']));
    expect(new Set(s1.map((p) => p.slotIndex))).toEqual(new Set(input.slots.map((_, i) => i)));
  });

  it('fires the S2 additional damage once per last bullet', () => {
    expect(lastShots.length).toBeGreaterThan(10);
    expect(hitsOf(false).map((h) => h.frame)).toEqual(lastShots);
  });

  it('fires the Designated Target damage only on last bullets while the enemy is in Designated Target', () => {
    const designated = stateItemsOf(plan).filter((s) => s.state === 'designatedTarget');
    expect(designated.length).toBeGreaterThan(0);
    const inside = (f: number) => designated.some((s) => s.start <= f && f < s.end);
    const expected = lastShots.filter(inside);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.length).toBeLessThan(lastShots.length);
    expect(hitsOf(true).map((h) => h.frame)).toEqual(expected);
  });

  it('applies Damage Taken from the last bullets and Elemental Advantage Attack Damage on herself', () => {
    const mine = piecesOf(plan).filter((p) => p.sourceSlotIndex === privaty);
    expect(mine.some((p) => p.effect.stat === 'damageTaken')).toBe(true);
    const element = mine.filter((p) => p.effect.stat === 'elementDamage');
    expect(element.length).toBeGreaterThan(0);
    expect(element.every((p) => p.slotIndex === privaty)).toBe(true);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
