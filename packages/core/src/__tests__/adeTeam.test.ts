// エード編（plan/design-ade.md）: エード（310）を含む編成で、S2・バーストの最大HP のみ▲（味方全体）と、それで自分の HP の割合が 90% 以下に
// 下がった時の S1 の攻撃力▲（味方全体・5 秒）、バーストの攻撃力▲が意図どおりに出るか
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { runTeam } from './runTeam.ts';

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
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 0.1, distanceBonus: true, fullCharge: true },
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
const ADE = 310;
const FLOWER = 304;

const TEAMS: Record<string, { input: TeamInput; ade: number }> = {
  エード単騎: {
    input: { slots: [fixedSlot(ADE)], enemy, durationSeconds: 90, burst: false, controlledSlot: 0 },
    ade: 0,
  },
  'I-DOLL・フラワー + エード（撮影 B の編成）': {
    input: { slots: [fixedSlot(FLOWER), fixedSlot(ADE)], enemy, durationSeconds: 180, burst: true, controlledSlot: 1 },
    ade: 1,
  },
  '実戦寄り（リター + エード + アリス + クラウン + ドレイク）': {
    input: {
      slots: [fixedSlot(82), fixedSlot(ADE), fixedSlot(191), fixedSlot(330), fixedSlot(101)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    ade: 1,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, ade }) => {
  const plan = planTeamRun(input);
  const result = runTeam(input);
  const adeTracks = (stat: string, hp: boolean) =>
    plan.history.tracks.filter(
      (t) =>
        t.sourceSlotIndex === ade &&
        t.origin.kind === 'timed' &&
        t.origin.effect.stat === stat &&
        hp === (typeof t.origin.effect.trigger === 'object' && 'selfHpAtMost' in t.origin.effect.trigger),
    );
  // エードが持つ件（同じ stat の効果が 2 つ（S2・バースト）あれば両方）
  const ownItems = (stat: string, hp: boolean) =>
    adeTracks(stat, hp)
      .filter((t) => t.holder === ade)
      .flatMap((t) => t.items);

  it('gives each max-HP-only up, ATK up and the S1 ATK up to every ally, in the same windows', () => {
    const tracks = [...adeTracks('maxHpOnly', false), ...adeTracks('attack', false), ...adeTracks('attack', true)];
    const effects = new Set(tracks.map((t) => t.origin.effect));
    // S2 とバーストの最大HP のみ▲、S1 の攻撃力▲（単騎はバーストを使わないが、件の列は作る）
    expect(effects.size).toBe(4);
    for (const effect of effects) {
      const of = tracks.filter((t) => t.origin.effect === effect);
      expect(of.map((t) => t.holder).sort()).toEqual(input.slots.map((_, i) => i));
      const own = JSON.stringify(of.find((t) => t.holder === ade)!.items);
      for (const t of of) expect(JSON.stringify(t.items)).toBe(own);
    }
  });

  it('fires the S1 ATK up for 5 s the frame after Ade drops to 90% or lower, and not again while she stays there', () => {
    const maxHpOnly = [...ownItems('maxHpOnly', false)].sort((a, b) => a.start - b.start);
    expect(maxHpOnly.length).toBeGreaterThan(0);
    // S2 のスキル Lv10 の最大HP のみ 15.62%▲ だけで 1 ÷ 1.1562 ≒ 86.5% に下がるので、どの件の始まりも、ほかの件が効いていなければ下がった時になる
    const drops = maxHpOnly
      .filter((w) => !maxHpOnly.some((o) => o !== w && o.start < w.start && w.start < o.end))
      .map((w) => w.start + 1);
    const s1 = ownItems('attack', true);
    expect(s1.map((w) => w.start)).toEqual(drops);
    // 戦闘の終わりで切れる件のほかは 5 秒
    const battleEnd = Math.max(...maxHpOnly.map((w) => w.end));
    for (const w of s1) expect(w.end === battleEnd || w.end - w.start === gameSecondsToFrames(5)).toBe(true);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = result.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
