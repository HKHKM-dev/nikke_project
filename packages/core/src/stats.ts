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
 * value × (1 + core × ratio / 1e4) を丸める。丸めは偶数への丸め（C# の Math.Round の既定 = MidpointRounding.ToEven）で、
 * ちょうど .5 のときだけ四捨五入と違う（Stage 12 の実測: 10,317,862.5 → 10,317,862、9,942,667.5 → 9,942,668、
 * 64,898.5 → 64,898。plan/verification.md Stage 12 節）。.5 を浮動小数の誤差で取り違えないよう整数で計算する
 */
export function applyCoreRatio(value: number, core: number, ratio: number): number {
  const scaled = value * (10000 + core * ratio);
  if (!Number.isSafeInteger(scaled)) {
    throw new RangeError(`applyCoreRatio needs integers: value ${value}, core ${core}, ratio ${ratio}`);
  }
  const quotient = Math.floor(scaled / 10000);
  const remainder = scaled - quotient * 10000;
  return remainder > 5000 || (remainder === 5000 && quotient % 2 !== 0) ? quotient + 1 : quotient;
}

/**
 * 素のステータス（装備・キューブ・好感度等を含まない）。Blablalink の表示値と同じ式。
 *   base = floor(levelStat × (1 + grade × gradeRatio/1e4) + grade × grade_<stat>)
 *   stat = roundHalfEven(base × (1 + core × core_<stat>/1e4))（applyCoreRatio）
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
  return applyCoreRatio(base, input.core, enhance[CORE_RATIO_KEY[kind]]);
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
