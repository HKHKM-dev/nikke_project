// クエンシー：エスケープクイーン（403）を含む編成: S2 のルート探索 1〜3 段階（通常攻撃 2 回ごと。2・3 段階は下の段階のフルスタックの時
// だけ付く）の命中率▲・攻撃力▲のスタックと、S1 の「ルート探索 N 段階フルスタック状態の時のみ」の▲（while。2・3 段階は条件つきの付与の
// 状態を見る）、バーストの分配ダメージと射撃の列のグループ分け。V-0702。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { runTeam } from './runTeam.ts';

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
const plainEnemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function fixedSlot(id: number, auto: boolean): TeamSlotInput {
  const character = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(character);
  return {
    character,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    ...(auto ? { conditionMode: 'auto' as const } : {}),
    skills: {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    },
  };
}

const QUENCY = 403;
// Lv10 の値（説明文の値 02〜07 と S1 の値 01〜03）
const HIT = [0.0136, 0.0271, 0.0408];
const ATK = [0.0245, 0.049, 0.0736];
const STACKS = [10, 10, 5];

// V-0702 の撮影 S と同じ: 単騎（操作）・条件は自動・バーストなし・BigArms 灼熱の 3 分モード
const SOLO: TeamInput = {
  slots: [fixedSlot(QUENCY, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: false,
  controlledSlot: 0,
};
// V-0702 の撮影 B と同じ: リター（I）+ デルタ（II）+ クエンシー：エスケープクイーン（III・操作）・オートバースト
const BURST: TeamInput = {
  slots: [fixedSlot(82, true), fixedSlot(20, true), fixedSlot(QUENCY, true)],
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};
// 実戦寄り（リター + デルタ + クエンシー：エスケープクイーン + アリス + モダニア）。手入力の条件
const PRACTICAL: TeamInput = {
  slots: [
    fixedSlot(82, false),
    fixedSlot(20, false),
    fixedSlot(QUENCY, false),
    fixedSlot(191, false),
    fixedSlot(260, false),
  ],
  enemy: plainEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};

describe('ルート探索の段（単騎）', () => {
  const plan = planTeamRun(SOLO);
  const sim = runSimulation(SOLO);
  const shots = plan.shots[0]!.frames;
  const buffsAtShot = (n: number) => {
    const frame = shots[n - 1]!;
    return sim.timeline.segments.find((s) => s.start <= frame && frame < s.end)!.slots[0]!.buffs;
  };
  /** 段階ごとのスタック数から、攻撃力▲の和 */
  const attackOf = (s1: number, s2: number, s3: number) => s1 * ATK[0]! + s2 * ATK[1]! + s3 * ATK[2]!;

  it('adds a Stage 1 stack every 2 shots, then Stage 2 and Stage 3 from the firing after the lower stage fills', () => {
    expect(buffsAtShot(2).attackRatio).toBe(0);
    expect(buffsAtShot(3).attackRatio).toBeCloseTo(attackOf(1, 0, 0), 12);
    expect(buffsAtShot(21).attackRatio).toBeCloseTo(attackOf(10, 0, 0), 12);
    expect(buffsAtShot(22).attackRatio).toBeCloseTo(attackOf(10, 0, 0), 12);
    expect(buffsAtShot(23).attackRatio).toBeCloseTo(attackOf(10, 1, 0), 12);
    expect(buffsAtShot(41).attackRatio).toBeCloseTo(attackOf(10, 10, 0), 12);
    expect(buffsAtShot(43).attackRatio).toBeCloseTo(attackOf(10, 10, 1), 12);
    expect(buffsAtShot(51).attackRatio).toBeCloseTo(attackOf(10, 10, 5), 12);
  });

  it('sums the three stages into the hit rate N at full stacks', () => {
    const full = HIT.reduce((sum, v, i) => sum + v * STACKS[i]!, 0);
    expect(buffsAtShot(51).hitRate).toBeCloseTo(full, 12);
    expect(buffsAtShot(21).hitRate).toBeCloseTo(10 * HIT[0]!, 12);
  });

  it('applies the Skill 1 increases only while each stage is at max stacks (Stage 2 and 3 are conditional grants)', () => {
    expect(buffsAtShot(19).distributedDamage).toBe(0);
    expect(buffsAtShot(21).distributedDamage).toBeCloseTo(0.4958, 12);
    expect(buffsAtShot(39).coreDamage).toBe(0);
    expect(buffsAtShot(41).coreDamage).toBeCloseTo(0.2525, 12);
    expect(buffsAtShot(49).critRate).toBe(0);
    expect(buffsAtShot(51).critRate).toBeCloseTo(0.1673, 12);
  });

  it('keeps Stage 1 over the reload and drops Stage 2 and 3', () => {
    const after = buffsAtShot(121);
    expect(after.attackRatio).toBeCloseTo(attackOf(10, 0, 0), 12);
    expect(after.distributedDamage).toBeCloseTo(0.4958, 12);
    expect(after.coreDamage).toBe(0);
  });
});

describe('バースト（リター + デルタ + クエンシー：エスケープクイーン）', () => {
  const sim = runSimulation(BURST);
  const hits = sim.slots[2]!.burst.hits;

  it('deals the distributed damage with the Stage 1 distributed damage increase on every burst', () => {
    expect(hits.length).toBeGreaterThan(1);
    for (const hit of hits) expect(hit.distributedDamageMultiplier).toBeCloseTo(1.4958, 12);
  });
});

describe.each([
  ['単騎（V-0702 の撮影 S の条件）', SOLO],
  ['リター + デルタ + クエンシー：エスケープクイーン（撮影 B の条件）', BURST],
  ['実戦寄り（リター + デルタ + クエンシー：エスケープクイーン + アリス + モダニア）', PRACTICAL],
] as const)('編成: %s', (_name, input) => {
  const calc = runTeam(input);
  const plan = planTeamRun(input);

  it('partitions every shot into exactly one group', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
