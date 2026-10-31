// 画面の編成（TeamState）から、計算の入力（TeamInput）と、画面に出す実効値（育成値・育成入力・スキル LV・宝物の段階）を作る。
// 計算と画面の実効値はどちらもこの結果だけを読み、保存している編成（TeamState）は入力欄と dispatch だけが読む。
//
// 画面から消した入力は、ここで既定値にする。保存データの値は消さずに残すが、計算と画面の値には使わない（欄が無いので直せないため）。
// - スロット: 射撃条件（自動。撃たないスロットは手入力の弾丸命中率 0。モデルに撃たないスロットが無いため）・想定 HP（満タン）・
//   その他攻撃加算（0）。リサイクルルームは編成共通のコンソールから取り、LV は編成共通のシンクロレベル。好感度はキャラごとの上限に収める
// - 編成: 敵（射撃場の的にし、属性だけ残す）・バースト（回す。使わないスロットはスロットの詳細設定の noBurst）。
//   3 分モード（rangeJump）は、その的のプリセットの出来事のセットを入れる（保存データの enemyEventSets は使わない）
import {
  EMPTY_BUILD,
  MAX_SKILL_LEVELS,
  affectionRankMax,
  computeCombatAttack,
  computeCombatStat,
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  fixedSpecBuild,
  fixedSpecGrowth,
  growthLimits,
  isEmptyBuild,
  presetForEnemy,
  resolveBuildEffects,
  type BuildEffect,
  type BuildEffectNote,
  type BuildInput,
  type BuildMasters,
  type CharacterData,
  type ConditionMode,
  type EnemyPresetMaster,
  type GrowthInput,
  type SkillLevels,
  type SlotCondition,
  type TeamInput,
  type TeamSlotInput,
  type TreasurePhase,
} from '@nikke/core';
import {
  DEFAULT_BURST,
  DEFAULT_CONDITION_MODE,
  DEFAULT_HP_RATIO,
  DEFAULT_SLOT_CONDITION,
  SHOOTING_RANGE_ENEMY,
  clampInt,
  enemyForCalc,
  recycleRoomFromConsole,
  type SlotState,
  type TeamState,
} from './team.ts';
import { toSlotSkills, type SlotSkillsStatus } from './useSkillDefinitions.ts';

/** スロットの実効値と計算の入力 */
export type CalcSlot = {
  /** 選んだキャラ（未選択・読み込み中・読み込めないときは undefined） */
  character: CharacterData | undefined;
  /** 育成値（スペック固定はプリセット、ほかはシンクロレベルを入れてキャラの上限に収めたもの） */
  growth: GrowthInput;
  /** 育成入力（スペック固定はプリセット。キャラが無いときは保存している値） */
  build: BuildInput;
  skillLevels: SkillLevels;
  treasurePhase: TreasurePhase;
  conditionMode: ConditionMode;
  condition: SlotCondition;
  hpRatio: number;
  /** 未対応・近似・仮定の一覧に出す育成の注記（未対応だけ。スペック固定では空） */
  buildNotes: BuildEffectNote[];
  /** 計算の入力。キャラかスキル定義が揃っていないスロットは null（合計から除外） */
  input: TeamSlotInput | null;
};

export type CalcView = { slots: CalcSlot[]; input: TeamInput };

export type CalcDeps = {
  characters: ReadonlyMap<number, CharacterData>;
  /** スロットごとのスキル定義の状態（未選択は null） */
  skillsStatuses: readonly (SlotSkillsStatus | null)[];
  masters: BuildMasters | null;
  enemyMaster: EnemyPresetMaster | null;
};

function clampGrowth(character: CharacterData, growth: GrowthInput): GrowthInput {
  const limits = growthLimits(character);
  return {
    level: clampInt(growth.level, 1, limits.levelMax),
    grade: clampInt(growth.grade, 0, limits.gradeMax),
    core: clampInt(growth.core, 0, limits.coreMax),
  };
}

/** 宝物の段階。宝物のないキャラは 0（保存データが古い・データ更新で宝物が消えた場合に備える）。スペック固定でも所持状況のまま */
export function effectiveTreasurePhase(slot: SlotState, character: CharacterData): TreasurePhase {
  return character.treasure === null ? 0 : slot.treasurePhase;
}

function slotBuild(team: TeamState, slot: SlotState, character: CharacterData): BuildInput {
  if (team.fixedSpec) return fixedSpecBuild(character);
  return {
    ...slot.build,
    affectionRank: Math.min(slot.build.affectionRank, affectionRankMax(character)),
    recycleRoom: recycleRoomFromConsole(team.console, character),
    extraAttack: EMPTY_BUILD.extraAttack,
  };
}

/** 育成入力から攻撃力・HP・防御力と効果層を計算する。マスタが無い・育成が空・計算できないときは何も上書きしない */
function combatOverrides(
  character: CharacterData,
  growth: GrowthInput,
  build: BuildInput,
  treasurePhase: TreasurePhase,
  masters: BuildMasters,
): Pick<TeamSlotInput, 'attackOverride' | 'hpOverride' | 'defenceOverride'> & { buildEffects?: BuildEffect[] } {
  if (isEmptyBuild(build) && treasurePhase === 0) return {};
  try {
    return {
      attackOverride: computeCombatAttack(character, growth, build, masters, { treasurePhase }).attack,
      hpOverride: computeCombatStat(character, growth, build, masters, 'hp', { treasurePhase }).value,
      defenceOverride: computeCombatStat(character, growth, build, masters, 'defence', { treasurePhase }).value,
      buildEffects: resolveBuildEffects(character, build, masters, { treasurePhase }).effects,
    };
  } catch {
    return {};
  }
}

/** 未対応の育成の注記。マスタが無い・計算できないときは空 */
function unsupportedBuildNotes(
  character: CharacterData,
  build: BuildInput,
  treasurePhase: TreasurePhase,
  masters: BuildMasters,
): BuildEffectNote[] {
  try {
    return resolveBuildEffects(character, build, masters, { treasurePhase }).notes.filter(
      (n) => n.level === 'unsupported',
    );
  } catch {
    return [];
  }
}

function calcSlot(team: TeamState, slot: SlotState, index: number, deps: CalcDeps): CalcSlot {
  const character = slot.resourceId === null ? undefined : deps.characters.get(slot.resourceId);
  const skillLevels = team.fixedSpec ? MAX_SKILL_LEVELS : slot.skillLevels;
  const conditionMode: ConditionMode = slot.noFire ? 'manual' : DEFAULT_CONDITION_MODE;
  const condition: SlotCondition = slot.noFire ? { ...DEFAULT_SLOT_CONDITION, hitRate: 0 } : DEFAULT_SLOT_CONDITION;
  const hpRatio = DEFAULT_HP_RATIO;
  const synchroGrowth = { ...slot.growth, level: team.synchroLevel };
  if (character === undefined) {
    return {
      character,
      growth: synchroGrowth,
      build: slot.build,
      skillLevels,
      treasurePhase: 0,
      conditionMode,
      condition,
      hpRatio,
      buildNotes: [],
      input: null,
    };
  }

  const treasurePhase = effectiveTreasurePhase(slot, character);
  const build = slotBuild(team, slot, character);
  const status = deps.skillsStatuses[index];
  const skills = status ? toSlotSkills(status, skillLevels, treasurePhase) : undefined;
  const base = { character, condition, conditionMode, hpRatio };

  if (team.fixedSpec) {
    const growth = fixedSpecGrowth(character);
    return {
      ...base,
      growth,
      build,
      skillLevels,
      treasurePhase,
      buildNotes: [],
      input: skills
        ? {
            ...base,
            growth,
            attackOverride: computeFixedSpecAttack(character).attack,
            hpOverride: computeFixedSpecHp(character),
            defenceOverride: computeFixedSpecDefence(character),
            skills,
          }
        : null,
    };
  }

  const growth = clampGrowth(character, synchroGrowth);
  const { masters } = deps;
  return {
    ...base,
    growth,
    build,
    skillLevels,
    treasurePhase,
    buildNotes: masters === null ? [] : unsupportedBuildNotes(character, build, treasurePhase, masters),
    input: skills
      ? {
          ...base,
          growth,
          ...(masters === null ? {} : combatOverrides(character, growth, build, treasurePhase, masters)),
          skills,
        }
      : null,
  };
}

export function buildCalcView(team: TeamState, deps: CalcDeps): CalcView {
  const slots = team.slots.map((slot, i) => calcSlot(team, slot, i, deps));
  const enemy = { ...SHOOTING_RANGE_ENEMY, element: team.enemy.element };
  const preset = deps.enemyMaster === null ? undefined : presetForEnemy(deps.enemyMaster.enemies, enemy);
  const eventSets = team.rangeJump ? (preset?.eventSets ?? []) : [];
  const noBurstSlots = team.slots.flatMap((s, i) => (s.noBurst && s.resourceId !== null ? [i] : []));
  return {
    slots,
    input: {
      slots: slots.map((s) => s.input),
      enemy: enemyForCalc(enemy, deps.enemyMaster, eventSets, team.durationSeconds),
      durationSeconds: team.durationSeconds,
      burst: DEFAULT_BURST,
      ...(noBurstSlots.length === 0 ? {} : { noBurstSlots }),
      controlledSlot: team.controlledSlot,
    },
  };
}
