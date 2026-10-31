import { type TeamResult, type TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { DamageTimeline } from './DamageTimeline.tsx';

type Props = {
  result: TeamResult;
  /** (B) の段 B-2: 入力が変わって計算し直している間。result は前の入力の結果 */
  computing: boolean;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  /** スキル定義を読み込み中で、まだバフなしで計算している枠の数 */
  skillsLoadingCount: number;
};

// 2026-10-31: オーナーの指示で、DPS・バーストとスキルの回数・武器種・フルバーストの要約・ニケごとの詳細・検証用の詳細
// （敵の出来事と的の着地点・攻撃力とトリガー数の表・バーストの時刻表）を画面から消した（DPS のほかは CLI の npm run sim で見られる）
export function TeamBreakdown({ result, computing, loadingCount, skillsLoadingCount }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);

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

      {filled.length > 0 && (
        <details className="segments">
          <summary>詳細内訳（通常・バースト・スキル・タイムライン等）</summary>

          <DamageTimeline
            perSecond={result.damagePerSecond}
            events={result.enemyEvents}
            landings={result.landings}
            fullBursts={result.schedule?.fullBurstWindows ?? []}
          />

          <div className="table-scroll">
            <table className="team-table">
              <thead>
                <tr>
                  <th>枠</th>
                  <th>ニケ</th>
                  <th>通常攻撃</th>
                  <th>バーストスキル</th>
                  <th>スキルダメージ</th>
                  <th>総ダメージ</th>
                  <th>寄与率</th>
                </tr>
              </thead>
              <tbody>
                {filled.map((s) => (
                  <tr key={s.index}>
                    <td>{s.index + 1}</td>
                    <td>{s.character.name.ja}</td>
                    <td>{formatNumber(s.normalDamage)}</td>
                    <td>{s.burst.hit ? formatNumber(s.burst.totalDamage) : '—'}</td>
                    <td>{s.skillHits.activations.length > 0 ? formatNumber(s.skillHits.totalDamage) : '—'}</td>
                    <td>{formatNumber(s.totalDamage)}</td>
                    <td>{formatPercent(s.share, 1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={5}>合計</th>
                  <td className="grand-total">{formatNumber(result.totalDamage)}</td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
