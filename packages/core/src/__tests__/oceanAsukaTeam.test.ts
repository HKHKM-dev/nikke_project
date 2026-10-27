// I-DOLL・オーシャン（305）を含む編成: バーストの味方全体への 1 回の回復（heal・burstUse）は、
// 使うたびに全員に healed を起こす（plan/design-heal-vocabulary.md 1 節の表の 4。C-0554 は仮説）。
// 受け手のアスカの S1 の窓と、実戦寄りの編成での 射撃の列のグループ分けを見る。
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
import { healsOf, piecesOf } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

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
    };
  }
  return slot;
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

// オーシャン（I）+ クラウン（II）+ アスカ・アリス（III）+ ユニ（II）。オーシャンのバーストは I の枠で撃つ
const PRACTICAL: TeamInput = {
  slots: [fixedSlot(305), fixedSlot(330), fixedSlot(830), fixedSlot(191), fixedSlot(160)],
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};

const OCEAN = 0;
const ASUKA = 2;

describe('実戦寄りの編成（オーシャン + クラウン + アスカ + アリス + ユニ）', () => {
  const plan = planTeamRun(PRACTICAL);

  it('heals every slot on each Ocean burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === OCEAN).map((a) => a.frame);
    expect(uses.length).toBeGreaterThan(0);
    const fromOcean = healsOf(plan).filter((h) => h.sourceSlotIndex === OCEAN);
    expect(fromOcean).toEqual(
      expect.arrayContaining(
        uses.flatMap((frame) => PRACTICAL.slots.map((_, slotIndex) => ({ frame, sourceSlotIndex: OCEAN, slotIndex }))),
      ),
    );
  });

  it('heals only the leftmost slot with S1 and S2 outside the burst uses (C-0591)', () => {
    // S1（最後の弾丸）・S2（15 秒ごと）は残りの HP の割合が最も低い味方 1 機。想定はどの枠も満タンなので、若い枠（オーシャン自身）
    const uses = new Set(plan.schedule!.activations.filter((a) => a.slotIndex === OCEAN).map((a) => a.frame));
    const others = healsOf(plan).filter((h) => h.sourceSlotIndex === OCEAN && !uses.has(h.frame));
    expect(others.length).toBeGreaterThan(0);
    expect(new Set(others.map((h) => h.slotIndex))).toEqual(new Set([OCEAN]));
  });

  it('starts or extends an Asuka S1 window at each Ocean burst use', () => {
    const uses = plan.schedule!.activations.filter((a) => a.slotIndex === OCEAN).map((a) => a.frame);
    const s1 = piecesOf(plan).filter(
      (w) => w.slotIndex === ASUKA && w.effect.source.resourceId === 830 && w.effect.stat === 'attack',
    );
    for (const frame of uses) {
      expect(s1.some((w) => w.start <= frame && frame < w.end)).toBe(true);
    }
  });
});

describe('編成: 実戦寄りの編成', () => {
  const calc = runTeam(PRACTICAL);
  const plan = planTeamRun(PRACTICAL);

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    PRACTICAL.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
