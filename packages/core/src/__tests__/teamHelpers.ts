// 編成のテスト（plan/skills-guide.md 1 節の「テスト」）の共通の道具: スペック固定・Lv 10 の枠、射撃場の的の編成、効果の窓、
// 射撃の列がどのグループにも 1 回ずつ入ることの確かめ（partitions every shot）
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import type { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces, type StagelessPiece } from './historyHelpers.ts';
import { runTeam } from './runTeam.ts';

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

export const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };
export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

/** data/skills の生の定義（書き換えて fixedSlot に渡す用） */
export function rawDefinition<T = unknown>(id: number): T {
  return readJson<T>(`../../data/skills/${id}.json`);
}

/** スペック固定・Lv 10 の枠。定義のあるキャラは定義を付ける（json は定義の差し替え） */
export function fixedSlot(id: number, json?: unknown): TeamSlotInput {
  const c = readJson<CharacterData>(`../../data/characters/${id}.json`);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = { character: c, growth: fixed.growth, attackOverride: fixed.attack, condition: MANUAL };
  if (json !== undefined || DEFINED.has(id)) {
    slot.skills = { definition: parseSkillDefinition(json ?? rawDefinition(id)), levels: MAX_SKILL_LEVELS };
  }
  return slot;
}

/** 射撃場の的・180 秒の編成（extra で上書き） */
export function fixedTeam(ids: readonly number[], controlledSlot: number, extra: Partial<TeamInput> = {}): TeamInput {
  return {
    slots: ids.map((id) => fixedSlot(id)),
    enemy: SHOOTING_RANGE_ENEMY,
    durationSeconds: 180,
    burst: true,
    controlledSlot,
    ...extra,
  };
}

/** 枠が受ける値の小片のうち pick に合うものの窓（[始まり, 終わり) のフレーム。続いた小片は 1 つにまとめる） */
export function effectWindows(
  plan: ReturnType<typeof planTeamRun>,
  slot: number,
  pick: (piece: StagelessPiece) => boolean,
): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const p of slotPieces(plan, slot)
    .filter(pick)
    .sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last !== undefined && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else out.push({ start: p.start, end: p.end });
  }
  return out;
}

/** 射撃の列が、どの枠でもどれか 1 つのグループに 1 回ずつ入る（start ≤ shot < end） */
export function expectEveryShotInOneGroup(input: TeamInput, plan: ReturnType<typeof planTeamRun>): void {
  const calc = runTeam(input);
  input.slots.forEach((_, i) => {
    const frames = plan.shots[i]!.frames;
    const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
    expect(total).toBe(frames.length);
  });
}
