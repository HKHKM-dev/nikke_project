// 編成のテスト（plan/skills-guide.md 1 節の「テスト」）の共通の道具: スペック固定・Lv 10 の枠、射撃場の的の編成、効果の窓、
// 射撃の列がどのグループにも 1 回ずつ入ることの確かめ（partitions every shot）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BurstSchedule } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { runSimulation } from '../sim/engine.ts';
import { simTeamResult } from '../sim/teamResult.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { characterOf, DEFINED_IDS, rawDefinition, type RawDefinition } from './data.ts';
import { slotPieces } from './historyHelpers.ts';

export { characterOf, rawDefinition };

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false };
export const SHOOTING_RANGE_ENEMY: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

/** スロットの説明文の値（Lv10。値 ref は 1 始まり） */
export function skillValueOf(id: number, slot: 'skill1' | 'skill2' | 'burst', ref: number): number {
  return Number(characterOf(id).skills[slot].values[ref - 1]![9]);
}

/** fixedSlot の、既定と違う所 */
export type FixedSlotOptions = {
  /** 手入力の条件。省略は { coreHitRate: 1, distanceBonus: false } */
  condition?: SlotCondition;
  /** 条件の決め方（'auto' は射撃場の表から決める）。省略は手入力 */
  conditionMode?: TeamSlotInput['conditionMode'];
  /** スペック固定の最大 HP（hpOverride）を付ける */
  hp?: boolean;
  /** スペック固定の防御力（defenceOverride）を付ける */
  defence?: boolean;
  /** 宝物の段階。省略は 0 */
  treasurePhase?: TreasurePhase;
  /** 差し替える定義の JSON（読み込んで付ける）。null は、定義のあるキャラにも定義を付けない */
  definition?: unknown;
  /** 差し替える読み込み済みの定義 */
  parsed?: SkillDefinition;
  /** 定義の JSON（data/skills か definition）を、読み込む前に書き換える */
  edit?: (raw: RawDefinition) => void;
  /** ほかの欄（hpRatio など）。最後に上書きする */
  extra?: Partial<TeamSlotInput>;
};

/**
 * スペック固定・Lv 10 の枠。既定は、手入力の条件 { coreHitRate: 1, distanceBonus: false }・定義のあるキャラにだけ data/skills の
 * 定義を付ける・宝物なし。テストごとの違いは options に書く
 */
export function fixedSlot(id: number, options: FixedSlotOptions = {}): TeamSlotInput {
  const c = characterOf(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: options.condition ?? MANUAL,
  };
  if (options.hp) slot.hpOverride = computeFixedSpecHp(c);
  if (options.defence) slot.defenceOverride = computeFixedSpecDefence(c);
  if (options.conditionMode !== undefined) slot.conditionMode = options.conditionMode;
  const definition = fixedSlotDefinition(id, options);
  if (definition !== undefined) {
    slot.skills = { definition, levels: MAX_SKILL_LEVELS };
    if (options.treasurePhase !== undefined) slot.skills.treasurePhase = options.treasurePhase;
  }
  return { ...slot, ...options.extra };
}

function fixedSlotDefinition(id: number, options: FixedSlotOptions): SkillDefinition | undefined {
  if (options.parsed !== undefined) return options.parsed;
  if (options.definition === null) return undefined;
  const raw = options.definition ?? (DEFINED_IDS.has(id) ? rawDefinition(id) : undefined);
  if (raw === undefined) return undefined;
  options.edit?.(raw as RawDefinition);
  return parseSkillDefinition(raw);
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

/**
 * フルバーストごとに、枠 sourceSlot の効果（回数の段ごとに 1 件）がその始まりのフレームに縮めた CT の、枠ごとの和の最大（縮めなかった回は 0）。
 * CT の残りが縮める量より長い枠（III など）は縮める量だけ縮むので、最大が効果の量になる（ほかの枠は CT の残りまで）
 */
export function fullBurstCooldownCuts(schedule: BurstSchedule, sourceSlot: number): number[] {
  return schedule.fullBurstWindows.map((w) => {
    const cut = new Map<number, number>();
    for (const r of schedule.cooldownReductions)
      if (r.frame === w.start && r.sourceSlotIndex === sourceSlot)
        cut.set(r.slotIndex, (cut.get(r.slotIndex) ?? 0) + r.applied);
    return cut.size === 0 ? 0 : Math.max(...cut.values());
  });
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
