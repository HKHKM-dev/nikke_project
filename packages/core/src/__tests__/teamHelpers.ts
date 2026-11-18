// 編成のテスト（plan/skills-guide.md 1 節の「テスト」）の共通の道具: スペック固定・Lv 10 の枠、射撃場の的の編成、効果の窓、
// 射撃の列がどのグループにも 1 回ずつ入ることの確かめ（partitions every shot）
import { describe, expect, it } from 'vitest';
import type { BurstSchedule } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
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
import type { TargetProfile } from '../types.ts';
import { characterOf, DEFINED_IDS, rawDefinition, type RawDefinition, readData } from './data.ts';
import { slotPieces } from './historyHelpers.ts';

export { characterOf, rawDefinition };

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
  /** 宝物の段階。省略は 0。定義の付かない枠（定義の無いキャラ・definition: null）では効かない */
  treasurePhase?: TreasurePhase;
  /** 差し替える定義の JSON（読み込んで付ける）。null は、定義のあるキャラにも定義を付けない。parsed とは組めない */
  definition?: unknown;
  /** 差し替える読み込み済みの定義。definition・edit とは組めない */
  parsed?: SkillDefinition;
  /** 定義の JSON（data/skills か definition。definition は写してから渡す）を、読み込む前に書き換える */
  edit?: (raw: RawDefinition) => void;
  /** ほかの欄（hpRatio など）。最後に上書きする（skills を渡すと、上の定義・宝物の段階ごと置き換わる） */
  extra?: Partial<TeamSlotInput>;
};

const FIXED_SLOT_OPTION_KEYS: readonly string[] = [
  'condition',
  'conditionMode',
  'hp',
  'defence',
  'treasurePhase',
  'definition',
  'parsed',
  'edit',
  'extra',
] satisfies readonly (keyof FixedSlotOptions)[];

/**
 * スペック固定・Lv 10 の枠。既定は、手入力の条件 { coreHitRate: 1, distanceBonus: false }・定義のあるキャラにだけ data/skills の
 * 定義を付ける・宝物なし。テストごとの違いは options に書く
 */
export function fixedSlot(id: number, options: FixedSlotOptions = {}): TeamSlotInput {
  // 定義の JSON をそのまま 2 つ目の引数に渡した呼び出し（型が any だと型の検査を通る）を落とす
  const unknownKey = Object.keys(options).find((key) => !FIXED_SLOT_OPTION_KEYS.includes(key));
  if (unknownKey !== undefined) {
    throw new Error(`fixedSlot: unknown option "${unknownKey}" (pass a definition as { definition } or { parsed })`);
  }
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
  if (options.parsed !== undefined) {
    if (options.definition !== undefined || options.edit !== undefined) {
      throw new Error('fixedSlot: parsed cannot be combined with definition or edit');
    }
    return options.parsed;
  }
  if (options.definition === null) return undefined;
  if (options.definition !== undefined && options.edit === undefined) return parseSkillDefinition(options.definition);
  // 呼び出し側の JSON は書き換えない（options を使い回しても、書き換えが重ならない）
  const raw =
    options.definition !== undefined
      ? structuredClone(options.definition)
      : DEFINED_IDS.has(id)
        ? rawDefinition(id)
        : undefined;
  if (raw === undefined) return undefined;
  options.edit?.(raw as RawDefinition);
  return parseSkillDefinition(raw);
}

/** スペック固定の防御力・コードなし・コアありの敵（overrides で上書き）。出来事・的は持たない（持つのは rangeEnemyWithEvents） */
export function fixedEnemy(overrides: Partial<EnemyInput> = {}): EnemyInput {
  return { ...SHOOTING_RANGE_ENEMY, ...overrides };
}

/** 入れ子の中まで凍らせる（共有する定数を、テストがその場で書き換えないように） */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** data/enemies.json の敵のプリセット。全部のテストで共有するので凍らせてある（書き換えるテストは structuredClone する） */
export const ENEMY_PRESETS = deepFreeze(parseEnemyPresets(readData<unknown>('enemies.json')));

/** 射撃場の的（条件が自動の枠が、コア命中率・距離ボーナス・弾丸命中率を引く表）。ENEMY_PRESETS と同じく凍らせてある */
export const RANGE_BIGARMS: TargetProfile = ENEMY_PRESETS.targetProfiles.find((p) => p.id === 'range-bigarms')!;

/**
 * 出来事と的のある射撃場の敵（ジャンプありの出来事と、的と着地点つき。条件が自動の枠のテスト用）。既定は、スペック固定の
 * 防御力・火力コード・コアあり・的は RANGE_BIGARMS・180 秒。SHOOTING_RANGE_ENEMY・fixedEnemy（コードなし・出来事と的なし）とは別物
 */
export function rangeEnemyWithEvents(
  options: Partial<Pick<EnemyInput, 'defence' | 'element' | 'hasCore'>> & {
    target?: TargetProfile;
    /** 出来事と着地点を作る戦闘時間（編成の durationSeconds と同じにする） */
    durationSeconds?: number;
  } = {},
): EnemyInput {
  const target = options.target ?? RANGE_BIGARMS;
  const seconds = options.durationSeconds ?? 180;
  return {
    defence: options.defence ?? FIXED_SPEC_ENEMY_DEFENCE,
    element: options.element === undefined ? 'Fire' : options.element,
    hasCore: options.hasCore ?? true,
    events: enemyEventsOf(ENEMY_PRESETS, ['range-3min-jump'], seconds),
    target,
    landings: enemyLandingsOf(ENEMY_PRESETS, ['range-3min-jump'], seconds, target),
  };
}

/**
 * 射撃場の的・180 秒・バーストありの編成（extra で上書き）。slots は枠か、キャラの番号（fixedSlot の既定の枠にする）
 */
export function fixedTeam(
  slots: readonly (number | TeamSlotInput | null)[],
  controlledSlot: number | null | undefined,
  extra: Partial<TeamInput> = {},
): TeamInput {
  return {
    slots: slots.map((slot) => (typeof slot === 'number' ? fixedSlot(slot) : slot)),
    enemy: SHOOTING_RANGE_ENEMY,
    durationSeconds: 180,
    burst: true,
    // 省いた操作キャラは、キーごと置かない
    ...(controlledSlot === undefined ? {} : { controlledSlot }),
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
