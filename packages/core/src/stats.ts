import type { CharacterData, Rarity, StatKind } from './types.ts';

export type GrowthInput = {
  /** シンクロレベル（1 始まり） */
  level: number;
  /** 限界突破回数（SSR 0..3、SR 0..2、R 0） */
  grade: number;
  /** コア強化段階（SSR のみ 0..7） */
  core: number;
};

export const GRADE_MAX: Record<Rarity, number> = { SSR: 3, SR: 2, R: 0 };
export const CORE_MAX: Record<Rarity, number> = { SSR: 7, SR: 0, R: 0 };

export type GrowthLimits = { levelMax: number; gradeMax: number; coreMax: number };

export function growthLimits(character: Pick<CharacterData, 'rarity' | 'levelCurve'>): GrowthLimits {
  return {
    levelMax: character.levelCurve.attack.length,
    gradeMax: GRADE_MAX[character.rarity],
    coreMax: CORE_MAX[character.rarity],
  };
}

function assertIntegerInRange(name: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer in [${min}, ${max}], got ${value}`);
  }
}

export function validateGrowth(character: Pick<CharacterData, 'rarity' | 'levelCurve'>, input: GrowthInput): void {
  const limits = growthLimits(character);
  assertIntegerInRange('level', input.level, 1, limits.levelMax);
  assertIntegerInRange('grade', input.grade, 0, limits.gradeMax);
  assertIntegerInRange('core', input.core, 0, limits.coreMax);
}

const GRADE_FLAT_KEY = { attack: 'gradeAttack', hp: 'gradeHp', defence: 'gradeDefence' } as const;
const CORE_RATIO_KEY = { attack: 'coreAttack', hp: 'coreHp', defence: 'coreDefence' } as const;

/**
 * 素のステータス（装備・キューブ・好感度等を含まない）。Blablalink の表示値と同じ式。
 *   base = floor(levelStat × (1 + grade × gradeRatio/1e4) + grade × grade_<stat>)
 *   stat = round(base × (1 + core × core_<stat>/1e4))
 */
export function computeStat(
  character: Pick<CharacterData, 'rarity' | 'levelCurve' | 'statEnhance'>,
  kind: StatKind,
  input: GrowthInput,
): number {
  validateGrowth(character, input);
  const levelStat = character.levelCurve[kind][input.level - 1];
  if (levelStat === undefined) throw new RangeError(`no ${kind} curve value for level ${input.level}`);
  const enhance = character.statEnhance;
  const base = Math.floor(
    levelStat * (1 + (input.grade * enhance.gradeRatio) / 10000) + input.grade * enhance[GRADE_FLAT_KEY[kind]],
  );
  return Math.round(base * (1 + (input.core * enhance[CORE_RATIO_KEY[kind]]) / 10000));
}

export function computeBaseStats(
  character: Pick<CharacterData, 'rarity' | 'levelCurve' | 'statEnhance'>,
  input: GrowthInput,
): Record<StatKind, number> {
  return {
    attack: computeStat(character, 'attack', input),
    hp: computeStat(character, 'hp', input),
    defence: computeStat(character, 'defence', input),
  };
}
