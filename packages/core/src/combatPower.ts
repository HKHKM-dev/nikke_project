// キャラの戦闘力（C-0981。式と根拠は V-0685）。育成入力（BuildInput と同じ形）から出す純関数だけを置く。
//   戦闘力 = round(S × K / 100)
//   S = (1 + 会心率 × (会心ダメージ − 1)) × 攻撃力 × 18 + (HP + 防御力 × 100) × 0.7
//   K = 1.3 + 0.01 × (S1 + S2) + 0.02 × バースト + (OL の行 + キューブ + コレクション（宝物）の powers の和) / 10000
// 攻撃力・HP・防御力はキャラ画面の値（computeCombatStat）、会心は CDN の素の値（OL・キューブ等の会心の効果は S に入れない）。
// アリーナの戦闘力は、build.cube をアリーナ用の欄のキューブにした同じ計算。
import {
  computeCombatStat,
  findCollection,
  findCube,
  findOverloadOption,
  GEAR_PARTS,
  type BuildInput,
} from './build.ts';
import { validateSkillLevel, type SkillLevels } from './skills/resolve.ts';
import { SKILL_SLOTS } from './skills/types.ts';
import type { GrowthInput } from './stats.ts';
import type { BuildMasters, CharacterData, StatKind } from './types.ts';

/** K の 1.3 と、スキル Lv 1 つあたりの値（1/10000） */
const COEFFICIENT_BASE = 13000;
const SKILL_COEFFICIENT: Readonly<SkillLevels> = { skill1: 100, skill2: 100, burst: 200 };

export type CombatPowerInput = {
  growth: GrowthInput;
  build: BuildInput;
  skillLevels: SkillLevels;
  /**
   * 宝物を解放しているか。宝物のステータスと powers は、宝物の Lv（段階）によらず乗る（V-0685。ShiftyPad の Lv 0 も同じ）。
   * 段階はスキルにだけ効き、戦闘力には効かない
   */
  treasure: boolean;
};

export type CombatPower = {
  value: number;
  /** キャラ画面の攻撃力・HP・防御力 */
  stats: Record<StatKind, number>;
  /** S（丸める前） */
  statTerm: number;
  /** K × 10000 の内訳 */
  coefficient: { base: number; skills: number; overload: number; cube: number; collection: number; total: number };
};

function powerAt(list: readonly number[] | undefined, index: number, what: string): number {
  const value = list?.[index];
  if (value === undefined) throw new RangeError(`no combat power for ${what} at index ${index}`);
  return value;
}

export function computeCombatPower(
  character: Parameters<typeof computeCombatStat>[0] & Pick<CharacterData, 'crit'>,
  input: CombatPowerInput,
  masters: BuildMasters,
): CombatPower {
  const { growth, build, skillLevels } = input;
  for (const slot of SKILL_SLOTS) validateSkillLevel(skillLevels[slot]);
  // 宝物のステータスは段階 1..3 で同じ（treasureStats）なので、段階 1 として出す
  const options = { treasurePhase: input.treasure ? 1 : 0 };
  const stat = (kind: StatKind) => computeCombatStat(character, growth, build, masters, kind, options).value;
  const stats = { attack: stat('attack'), hp: stat('hp'), defence: stat('defence') };

  const crit = 1 + character.crit.rate * (character.crit.damage - 1);
  const statTerm = crit * stats.attack * 18 + (stats.hp + stats.defence * 100) * 0.7;

  const skills = SKILL_SLOTS.reduce((sum, slot) => sum + SKILL_COEFFICIENT[slot] * skillLevels[slot], 0);
  let overload = 0;
  for (const part of GEAR_PARTS) {
    for (const line of build.gear[part]?.overload ?? []) {
      overload += powerAt(findOverloadOption(masters, line.option)?.powers, line.level - 1, `OL ${line.option}`);
    }
  }
  const cube =
    build.cube === null ? 0 : powerAt(findCube(masters, build.cube.id)?.powers, build.cube.level - 1, 'cube');
  const collection = input.treasure
    ? masters.collections.treasurePower
    : build.collection === null
      ? 0
      : powerAt(
          findCollection(masters, build.collection.rarity, character.weaponType)?.powers,
          build.collection.level,
          'collection',
        );
  const total = COEFFICIENT_BASE + skills + overload + cube + collection;
  return {
    value: Math.round((statTerm * total) / 1e6),
    stats,
    statTerm,
    coefficient: { base: COEFFICIENT_BASE, skills, overload, cube, collection, total },
  };
}
