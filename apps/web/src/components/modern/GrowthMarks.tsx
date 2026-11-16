import {
  CORE_MAX,
  GRADE_MAX,
  fixedSpecGrowth,
  type BuildSnapshot,
  type CharacterIndexEntry,
  type GrowthInput,
  type Rarity,
} from '@nikke/core';
import { BadgeIcon } from './BadgeIcon.tsx';
import { GROWTH_BADGES } from './badges.ts';

/** 限界突破の回数とコア強化の段階（育成値）と、そのキャラの上限 */
export type GrowthMarks = { grade: number; gradeMax: number; core: number; coreMax: number };

export function growthMarksOf(rarity: Rarity, growth: Pick<GrowthInput, 'grade' | 'core'>): GrowthMarks {
  return { grade: growth.grade, gradeMax: GRADE_MAX[rarity], core: growth.core, coreMax: CORE_MAX[rarity] };
}

/** コアの印（100×100）の中央に置く段階の字の大きさ（印の幅に対する値）。MAX は 3 字なので小さくする */
const CORE_LABEL_SIZE = 48;
const CORE_LABEL_MAX_SIZE = 35;
/** 字の大文字・数字の高さ（cap）の、字の大きさに対する比のおよその値（system-ui の各書体で 0.7 前後）。並びの線をこの半分だけ下げて中央に置く */
const CAP_RATIO = 0.71;

/**
 * コアの印の中の段階の字。印の SVG の中に描き、印と同じ座標で置く（HTML の字は並びの線が画素にそろえられ、
 * 絵の位置が画素の半端にあると、行ごとに上下へずれる）
 */
function CoreLabel({ label }: { label: string }) {
  const size = label === 'MAX' ? CORE_LABEL_MAX_SIZE : CORE_LABEL_SIZE;
  return (
    <text
      className={label === 'MAX' ? 'growth-marks-core-max' : undefined}
      x={50}
      y={50 + (size * CAP_RATIO) / 2}
      fontSize={size}
      textAnchor="middle"
    >
      {label}
    </text>
  );
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
 * 限界突破（星のバッジを上限の数だけ並べ、突破した数だけ is-filled にして金の星にする）とコア強化（コアの印のバッジに段階を重ねる。01〜06 の 2 桁の数で、上限は MAX。0 は出さない）。
 * どちらも無いキャラ（R）は出さない。
 * 置き場所と大きさは className で決める（スロットは名前の上、ニケ一覧は絵の右上）
 */
export function GrowthMarksView({ grade, gradeMax, core, coreMax, className }: GrowthMarks & { className: string }) {
  if (gradeMax === 0 && coreMax === 0) return null;
  const coreLabel = core === 0 ? null : core >= coreMax ? 'MAX' : String(core).padStart(2, '0');
  return (
    <div
      className={`growth-marks ${className}`}
      aria-label={`限界突破 ${grade}/${gradeMax}${coreMax > 0 ? `・コア強化 ${core}/${coreMax}` : ''}`}
    >
      {Array.from({ length: gradeMax }, (_, i) => (
        <BadgeIcon key={i} className={`growth-marks-star${i < grade ? ' is-filled' : ''}`} name={GROWTH_BADGES.star} />
      ))}
      {coreLabel && (
        <span className="growth-marks-core" aria-hidden="true">
          <BadgeIcon name={GROWTH_BADGES.core}>
            <CoreLabel label={coreLabel} />
          </BadgeIcon>
        </span>
      )}
    </div>
  );
}
