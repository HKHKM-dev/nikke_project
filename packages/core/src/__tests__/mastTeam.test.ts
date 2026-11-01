// マスト編（plan/design-mast.md）: マスト（350）を含む編成で、S1 の海風（敵に付くスタック・発動者基準の防御力▼）、S2 のクリティカル確率▲、
// バーストのクリティカルダメージ▲と暴風（海風のスタックを写す 1 秒ごとのダメージ）が意図どおりに出るか
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defenceAfterDown, type EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { ENEMY, itemsOf } from '../skills/holders.ts';
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
const MAST = 350;
const LITER = 82;

const TEAMS: Record<string, { input: TeamInput; mast: number }> = {
  マスト単騎: {
    input: { slots: [fixedSlot(MAST)], enemy, durationSeconds: 60, burst: false, controlledSlot: 0 },
    mast: 0,
  },
  'リター + マスト（撮影 B の見込みの編成）': {
    input: { slots: [fixedSlot(LITER), fixedSlot(MAST)], enemy, durationSeconds: 60, burst: true, controlledSlot: 1 },
    mast: 1,
  },
  '実戦寄り（リター + マスト + アリス + クラウン + ドレイク）': {
    input: {
      slots: [fixedSlot(LITER), fixedSlot(MAST), fixedSlot(191), fixedSlot(330), fixedSlot(101)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    mast: 1,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, mast }) => {
  const plan = planTeamRun(input);
  const result = runTeam(input);
  const mastDefence = computeFixedSpecDefence(character(MAST));

  it('stacks Sea Breeze on the enemy up to 50, and takes the enemy DEF to 0 with the caster-based DEF down', () => {
    const items = itemsOf(plan.history, { holder: ENEMY, state: 'seaBreeze' });
    expect(items.length).toBeGreaterThan(0);
    expect(Math.max(...items.map((i) => i.stack ?? 0))).toBe(50);
    // 1 スタックは発動者のバフ前防御力 × 1.9%（Lv10）。射撃場の敵の防御力 100 は 1 スタックで 0 になる
    const late = result.slots[mast]!.segments.find((g) => g.ranges.some((r) => r.start > gameSecondsToFrames(20)))!;
    expect(late.buffs.enemyDefenseDownFlat).toBeCloseTo(50 * mastDefence * 0.019, 6);
    expect(defenceAfterDown(enemy, late.buffs)).toBe(0);
    // 最初の 2 回のクリティカルの前は、防御力 100 のまま
    expect(defenceAfterDown(enemy, result.slots[mast]!.segments[0]!.buffs)).toBe(FIXED_SPEC_ENEMY_DEFENCE);
  });

  it('gives Critical Rate up to Mast and the top-ATK allies except her for 30 s from the battle start', () => {
    const critUps = plan.history.tracks.filter(
      (t) => t.sourceSlotIndex === mast && t.origin.kind === 'timed' && t.origin.effect.stat === 'critRate',
    );
    const holders = critUps.filter((t) => t.items.length > 0).map((t) => t.holder);
    expect(holders).toContain(mast);
    expect(holders.length).toBe(Math.min(3, input.slots.length));
    for (const t of critUps) for (const item of t.items) expect(item.end - item.start).toBe(gameSecondsToFrames(30));
  });

  it('copies the Sea Breeze stacks into 7 Storm ticks per Burst, not as sustained damage', () => {
    const storms = plan.skillHits.filter((h) => h.slotIndex === mast && h.effect.dot?.state === 'storm');
    const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === mast) ?? [];
    if (bursts.length === 0) {
      expect(storms).toEqual([]);
      return;
    }
    expect(storms.length).toBeGreaterThanOrEqual(7 * (bursts.length - 1));
    expect(storms.every((h) => h.effect.sustained === undefined && h.stacks! >= 1 && h.stacks! <= 50)).toBe(true);
    // 付き始めから 20 秒より後は、海風が 50 スタックで止まっている（維持の数え方 all）
    const late = storms.filter((h) => h.frame > gameSecondsToFrames(20));
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((h) => h.stacks === 50)).toBe(true);
  });

  it('gives the HP 70% or lower Critical Damage up from the frame after the max-HP-only up starts, until it ends', () => {
    const tracksOf = (stat: string, kind: 'burstUse' | 'hp') =>
      plan.history.tracks.filter(
        (t) =>
          t.sourceSlotIndex === mast &&
          t.origin.kind === 'timed' &&
          t.origin.effect.stat === stat &&
          (kind === 'burstUse') === (t.origin.effect.trigger === 'burstUse'),
      );
    const own = (stat: string, kind: 'burstUse' | 'hp') => tracksOf(stat, kind).find((t) => t.holder === mast)!.items;
    const maxHpOnly = own('maxHpOnly', 'burstUse');
    const hpCrit = own('critDamage', 'hp');
    expect(hpCrit).toEqual(maxHpOnly.map((w) => ({ start: w.start + 1, end: w.end })));
    // 自分を除く最終攻撃力が最も高い味方（窓の始まりの順位で 2 機まで）にも、同じ窓で付く
    const others = tracksOf('critDamage', 'hp').filter((t) => t.holder !== mast);
    const allies = input.slots.length - 1;
    for (const w of hpCrit) {
      const holders = others.filter((t) => t.items.some((it) => it.start === w.start && it.end === w.end));
      expect(holders.length).toBe(Math.min(2, allies));
    }
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = result.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
