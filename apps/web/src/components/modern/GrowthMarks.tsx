import {
  CORE_MAX,
  GRADE_MAX,
  fixedSpecGrowth,
  type BuildSnapshot,
  type CharacterIndexEntry,
  type GrowthInput,
  type Rarity,
} from '@nikke/core';
import { GROWTH_BADGE_SRC } from './badges.ts';

/** 限界突破の回数とコア強化の段階（育成値）と、そのキャラの上限 */
export type GrowthMarks = { grade: number; gradeMax: number; core: number; coreMax: number };

export function growthMarksOf(rarity: Rarity, growth: Pick<GrowthInput, 'grade' | 'core'>): GrowthMarks {
  return { grade: growth.grade, gradeMax: GRADE_MAX[rarity], core: growth.core, coreMax: CORE_MAX[rarity] };
}

/**
 * ニケ一覧（と一覧から持ち上げた絵）の限界突破・コア強化。スペック固定のときはスロットと同じく固定の値（限界突破・コアとも上限）、
 * ほかは育成状況の値（育成状況にいなければ出さない）
 */
export function trayGrowthMarks(
  char: CharacterIndexEntry,
  roster: BuildSnapshot | null,
  fixedSpec: boolean,
): GrowthMarks | null {
  if (fixedSpec) return growthMarksOf(char.rarity, fixedSpecGrowth(char));
  const entry = roster?.characters[String(char.resourceId)];
  return entry ? growthMarksOf(char.rarity, entry.growth) : null;
}

/**
 * 限界突破（星のバッジを上限の数だけ並べ、突破した数だけ金の星にする）とコア強化（コアの印のバッジに +1〜+6、上限は MAX を重ねる）。
 * どちらも無いキャラ（R）は出さない。
 * 置き場所と大きさは className で決める（スロットは名前の上、ニケ一覧は絵の右上）
 */
export function GrowthMarksView({ grade, gradeMax, core, coreMax, className }: GrowthMarks & { className: string }) {
  if (gradeMax === 0 && coreMax === 0) return null;
  const coreLabel = core === 0 ? null : core === coreMax ? 'MAX' : `+${core}`;
  return (
    <div
      className={`growth-marks ${className}`}
      aria-label={`限界突破 ${grade}/${gradeMax}${coreMax > 0 ? `・コア強化 ${core}/${coreMax}` : ''}`}
    >
      {Array.from({ length: gradeMax }, (_, i) => (
        <img
          key={i}
          className="growth-marks-star"
          src={i < grade ? GROWTH_BADGE_SRC.gradeFilled : GROWTH_BADGE_SRC.gradeEmpty}
          alt=""
          draggable={false}
        />
      ))}
      {coreLabel && (
        <span className="growth-marks-core" aria-hidden="true">
          <img src={GROWTH_BADGE_SRC.core} alt="" draggable={false} />
          <span>{coreLabel}</span>
        </span>
      )}
    </div>
  );
}
