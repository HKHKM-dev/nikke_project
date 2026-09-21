import type { CharacterData, DamageResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';

type Props = { character: CharacterData; result: DamageResult };

export function ResultPanel({ character, result }: Props) {
  const { cadence } = result;
  return (
    <section className="panel result">
      <h2>{character.name.ja} の通常攻撃</h2>
      <dl className="summary">
        <dt>1 トリガー期待ダメージ</dt>
        <dd>{formatNumber(result.perTrigger)}</dd>
        <dt>秒間トリガー数</dt>
        <dd>{formatNumber(cadence.triggersPerSecond, 3)}</dd>
        <dt>DPS</dt>
        <dd>{formatNumber(result.dps)}</dd>
        <dt>総ダメージ</dt>
        <dd className="total">{formatNumber(result.totalDamage)}</dd>
      </dl>

      {result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note) => (
            <li key={note.code} className={`note ${note.level}`}>
              <span className="badge">{note.level === 'unsupported' ? '未対応' : '近似'}</span> {note.message.ja}
            </li>
          ))}
        </ul>
      )}

      <h3>内訳</h3>
      <table className="breakdown">
        <tbody>
          <tr><th>攻撃力（素）</th><td>{formatNumber(result.attack)}</td></tr>
          <tr><th>攻撃力 − 防御力</th><td>{formatNumber(result.baseHit)}</td></tr>
          <tr><th>武器倍率</th><td>{formatPercent(result.weaponMultiplier, 2)}{character.shot.shotCount > 1 ? `（${character.shot.shotCount} ペレット合計）` : ''}</td></tr>
          {result.chargeMultiplier !== 1 && <tr><th>チャージ倍率</th><td>×{result.chargeMultiplier}</td></tr>}
          <tr><th>コア（期待値）</th><td>+{formatNumber(result.boost.core, 3)}</td></tr>
          <tr><th>会心（期待値）</th><td>+{formatNumber(result.boost.crit, 3)}</td></tr>
          <tr><th>距離ボーナス</th><td>+{formatNumber(result.boost.distance, 1)}</td></tr>
          <tr><th>倍率グループ合計</th><td>×{formatNumber(result.boost.total, 3)}</td></tr>
          <tr><th>属性有利</th><td>×{result.elementMultiplier}</td></tr>
          <tr><th>マガジン</th><td>{cadence.triggersPerCycle} 発 / {formatNumber(cadence.magazineFrames / 60, 2)} 秒</td></tr>
          <tr><th>リロード</th><td>{formatNumber(cadence.reloadFrames / 60, 2)} 秒{cadence.reloadChunks > 1 ? `（${cadence.reloadChunks} 回）` : ''}</td></tr>
          <tr><th>1 周期</th><td>{formatNumber(cadence.cycleSeconds, 2)} 秒</td></tr>
        </tbody>
      </table>

      <p className="scope">
        calc v1 は通常攻撃のみを計算します。スキル・バースト・バフ/デバフ・弾数増加・ヒット率は含みません。SG は全ペレット命中が前提です。
      </p>
    </section>
  );
}
