import { CORE_MAX, GRADE_MAX, type GrowthInput, type Rarity } from '@nikke/core';

/** 限界突破の回数とコア強化の段階（育成値）と、そのキャラの上限 */
export type GrowthMarks = { grade: number; gradeMax: number; core: number; coreMax: number };

export function growthMarksOf(rarity: Rarity, growth: Pick<GrowthInput, 'grade' | 'core'>): GrowthMarks {
  return { grade: growth.grade, gradeMax: GRADE_MAX[rarity], core: growth.core, coreMax: CORE_MAX[rarity] };
}

/**
 * 限界突破（★ を上限の数だけ並べ、突破した数を塗る）とコア強化（+1〜+6、上限は MAX）。どちらも無いキャラ（R）は出さない。
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
        <span key={i} className={`growth-marks-star ${i < grade ? 'growth-marks-star-on' : ''}`} aria-hidden="true">
          ★
        </span>
      ))}
      {coreLabel && (
        <span className="growth-marks-core" aria-hidden="true">
          {coreLabel}
        </span>
      )}
    </div>
  );
}
