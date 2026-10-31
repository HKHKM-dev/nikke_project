import { type TeamResult } from '@nikke/core';
import { formatNumber } from '../format.ts';

type Props = {
  result: TeamResult;
  /** (B) の段 B-2: 入力が変わって計算し直している間。result は前の入力の結果 */
  computing: boolean;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  /** スキル定義を読み込み中で、まだバフなしで計算している枠の数 */
  skillsLoadingCount: number;
};

// 2026-10-31: オーナーの指示で、合計のほかの結果（詳細内訳の 1 秒ごとのタイムラインと枠ごとの表・ニケごとの詳細・検証用の
// 詳細）を画面から消した。内訳は CLI の npm run sim で見る
export function TeamBreakdown({ result, computing, loadingCount, skillsLoadingCount }: Props) {
  return (
    <section className="panel result breakdown-panel">
      <div className="team-total-bar" data-computing={computing}>
        <span className="team-total-label">
          総ダメージ
          {computing && (
            <span className="team-total-computing" role="status">
              計算中…
            </span>
          )}
        </span>
        <span className="team-total-val">{formatNumber(result.totalDamage)}</span>
      </div>

      {loadingCount > 0 && <p className="hint">読み込み中の枠: {loadingCount}</p>}
      {skillsLoadingCount > 0 && <p className="hint">スキル定義を読み込み中の枠: {skillsLoadingCount}</p>}
    </section>
  );
}
