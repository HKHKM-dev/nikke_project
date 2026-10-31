// 編成のテスト（plan/skills-guide.md 1 節の「テスト」）の共通の道具: スペック固定・Lv 10 の枠、射撃場の的の編成、効果の窓、
// 射撃の列がどのグループにも 1 回ずつ入ることの確かめ（partitions every shot）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces } from './historyHelpers.ts';

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };
export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

/** data/characters のキャラ */
export function characterOf(id: number): CharacterData {
  return readJson<CharacterData>(`../../data/characters/${id}.json`);
}

/** スロットの説明文の値（Lv10。値 ref は 1 始まり） */
export function skillValueOf(id: number, slot: 'skill1' | 'skill2' | 'burst', ref: number): number {
  return Number(characterOf(id).skills[slot].values[ref - 1]![9]);
}

/** data/skills の生の定義（書き換えて fixedSlot に渡す用） */
export function rawDefinition<T = unknown>(id: number): T {
  return readJson<T>(`../../data/skills/${id}.json`);
}

/** スペック固定・Lv 10 の枠。定義のあるキャラは定義を付ける（json は定義の差し替え） */
export function fixedSlot(id: number, json?: unknown): TeamSlotInput {
  const c = characterOf(id);
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

type Window = { start: number; end: number };

/**
 * 枠が受ける、キャラ resourceId のスロット skill の stat の値の小片の窓（[始まり, 終わり) のフレーム。続いた小片は 1 つにまとめる）。
 * plan は planTeamRun・runSimulation の結果（履歴を読む）
 */
export function effectWindows(
  plan: Parameters<typeof slotPieces>[0],
  slot: number,
  source: { resourceId: number; skill: string; stat: string },
): Window[] {
  const out: Window[] = [];
  for (const p of slotPieces(plan, slot)
    .filter(
      (x) =>
        x.effect.source.resourceId === source.resourceId &&
        x.effect.source.skill === source.skill &&
        x.effect.stat === source.stat,
    )
    .sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last !== undefined && p.start <= last.end) last.end = Math.max(last.end, p.end);
    else out.push({ start: p.start, end: p.end });
  }
  return out;
}

/** 始まりの列から seconds 秒の窓（戦闘の終わり frames で切る） */
export function windowsFrom(starts: readonly number[], seconds: number, frames: number): Window[] {
  return starts.map((start) => ({ start, end: Math.min(start + gameSecondsToFrames(seconds), frames) }));
}

/** 編成ごとに、射撃の列が、どの枠でもどれか 1 つのグループに 1 回ずつ入る（start ≤ shot < end）ことを確かめる */
export function describeEveryShotInOneGroup(teams: Record<string, TeamInput>): void {
  describe.each(Object.entries(teams))('編成: %s', (_name, input) => {
    it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
      const sim = runSimulation(input);
      const calc = simTeamResult(input, sim);
      input.slots.forEach((_, i) => {
        const frames = sim.shots[i]!.frames;
        const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
        expect(total).toBe(frames.length);
      });
    });
  });
}
