import { WEAPON_LABEL, type TeamResult, type TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { ResultPanel } from './ResultPanel.tsx';

type Props = {
  result: TeamResult;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  fixedSpec: boolean;
};

export function TeamBreakdown({ result, loadingCount, fixedSpec }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);
  const attackLabel = fixedSpec ? '攻撃力（スペック固定: 好感度 + 装備込み）' : '攻撃力（素）';

  return (
    <section className="panel result breakdown-panel">
      <h2>編成の内訳</h2>
      {filled.length === 0 && loadingCount === 0 && (
        <p className="hint">枠にニケを選ぶと、ここに内訳と合計が出ます。</p>
      )}
      {filled.length > 0 && (
        <div className="table-scroll">
          <table className="team-table">
            <thead>
              <tr>
                <th>枠</th>
                <th>ニケ</th>
                <th>{attackLabel}</th>
                <th>1 トリガー</th>
                <th>秒間トリガー</th>
                <th>DPS</th>
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
                  <td>{formatNumber(s.result.attack)}</td>
                  <td>{formatNumber(s.result.perTrigger)}</td>
                  <td>{formatNumber(s.result.cadence.triggersPerSecond, 3)}</td>
                  <td>{formatNumber(s.result.dps)}</td>
                  <td>{formatNumber(s.result.totalDamage)}</td>
                  <td>{formatPercent(s.share, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={5}>合計（{result.filledCount} 体）</th>
                <td>{formatNumber(result.totalDps)}</td>
                <td className="grand-total">{formatNumber(result.totalDamage)}</td>
                <td>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {loadingCount > 0 && (
        <p className="hint">読み込み中の枠が {loadingCount} つあります。合計にはまだ含まれていません。</p>
      )}
      {filled.length > 0 && (
        <div className="details">
          <h3>ニケごとの詳細</h3>
          {filled.map((s) => (
            <details key={s.index} className="slot-detail">
              <summary>
                枠 {s.index + 1}: {s.character.name.ja} — 総ダメージ {formatNumber(s.result.totalDamage)}（
                {formatPercent(s.share, 1)}）
              </summary>
              <ResultPanel character={s.character} result={s.result} attackLabel={attackLabel} />
            </details>
          ))}
        </div>
      )}
      <p className="scope">
        calc v2
        は各ニケの通常攻撃を個別に計算して足し合わせるだけです。スキル・バースト・バフ/デバフ・弾数増加・ヒット率・味方間の相互作用は含みません。SG
        は全ペレット命中が前提です。
      </p>
    </section>
  );
}
