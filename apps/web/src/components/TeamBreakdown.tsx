import {
  ENEMY_EVENT_KIND_LABEL,
  WEAPON_LABEL,
  type TeamResult,
  type TeamSlotResult,
  framesToGameSeconds,
} from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { DamageTimeline, landingLabel } from './DamageTimeline.tsx';
import { ResultPanel } from './ResultPanel.tsx';

type Props = {
  result: TeamResult;
  /** (B) の段 B-2: 入力が変わって計算し直している間。result は前の入力の結果 */
  computing: boolean;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  /** スキル定義を読み込み中で、まだバフなしで計算している枠の数 */
  skillsLoadingCount: number;
};

// 2026-10-31: オーナーの指示で、DPS・バーストとスキルの回数・フルバーストの要約・攻撃力とトリガー数の表・バーストの時刻表を
// 画面から消した（DPS のほかは CLI の npm run sim で見られる）
export function TeamBreakdown({ result, computing, loadingCount, skillsLoadingCount }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);
  const eventKinds = [...new Set(result.enemyEvents.map((e) => e.kind))];
  const eventsLabel = eventKinds
    .map((kind) => {
      const list = result.enemyEvents.filter((e) => e.kind === kind);
      const spans = list.map((e) => `${formatNumber(e.start, 1)}–${formatNumber(e.end, 1)}`).join('・');
      return `${ENEMY_EVENT_KIND_LABEL[kind].ja} ${list.length} 回（${spans} 秒）`;
    })
    .join(' / ');
  const landingsLabel = result.landings
    .map(
      (s) =>
        `${landingLabel(s)} ${formatNumber(framesToGameSeconds(s.start), 1)}–${formatNumber(framesToGameSeconds(s.end), 1)}`,
    )
    .join('・');

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
                    <td>
                      {s.character.name.ja}
                      <small className="sub"> {WEAPON_LABEL[s.character.weaponType].ja}</small>
                    </td>
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

          <div className="details">
            <h3>ニケごとの詳細</h3>
            {filled.map((s) => (
              <details key={s.index} className="slot-detail">
                <summary>
                  枠 {s.index + 1}: {s.character.name.ja} — 総ダメージ {formatNumber(s.totalDamage)}（
                  {formatPercent(s.share, 1)}）
                </summary>
                <ResultPanel character={s.character} slot={s} />
              </details>
            ))}
          </div>
        </details>
      )}

      <details className="segments verification-details">
        {/* 一本化の段 A-2（plan/design-unify-sim-calc.md 5.3 節）: 2026-10-27 までは、ここに計算モデル（calc / sim）の切り替えと「calc との差」があった */}
        <summary>検証用の詳細</summary>
        {filled.length > 0 && eventsLabel !== '' && <p className="hint">敵の出来事: {eventsLabel}</p>}
        {filled.length > 0 && landingsLabel !== '' && (
          <p className="hint">的の着地点（条件が自動の枠に効く）: {landingsLabel} 秒</p>
        )}
      </details>
    </section>
  );
}
