import type { CharacterData, DamageResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';

type Props = { character: CharacterData; result: DamageResult; attackLabel?: string };

export function ResultPanel({ character, result, attackLabel = '攻撃力（素）' }: Props) {
  const { cadence, buffs } = result;
  const hasAttackBuff = buffs.attackRatio !== 0 || buffs.attackFlat !== 0;
  const hasCritBuff = buffs.critRate !== 0 || buffs.critDamage !== 0;
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
          <tr>
            <th>{attackLabel}</th>
            <td>{formatNumber(result.baseAttack)}</td>
          </tr>
          {hasAttackBuff && (
            <>
              <tr>
                <th>攻撃力バフ</th>
                <td>
                  {buffs.attackRatio !== 0 ? `×(1 + ${formatPercent(buffs.attackRatio, 2)})` : ''}
                  {buffs.attackRatio !== 0 && buffs.attackFlat !== 0 ? ' ' : ''}
                  {buffs.attackFlat !== 0 ? `+${formatNumber(buffs.attackFlat)}` : ''}
                </td>
              </tr>
              <tr>
                <th>攻撃力（バフ後）</th>
                <td>{formatNumber(result.attack)}</td>
              </tr>
            </>
          )}
          <tr>
            <th>攻撃力 − 防御力</th>
            <td>{formatNumber(result.baseHit)}</td>
          </tr>
          <tr>
            <th>武器倍率</th>
            <td>
              {formatPercent(result.weaponMultiplier, 2)}
              {character.shot.shotCount > 1 ? `（${character.shot.shotCount} ペレット合計）` : ''}
            </td>
          </tr>
          {result.chargeMultiplier !== 1 && (
            <tr>
              <th>チャージ倍率</th>
              <td>
                ×{formatNumber(result.chargeMultiplier, 4)}
                {buffs.chargeDamage !== 0
                  ? `（${character.shot.fullChargeDamage} + ${formatPercent(buffs.chargeDamage, 2)}）`
                  : ''}
              </td>
            </tr>
          )}
          <tr>
            <th>コア（期待値）</th>
            <td>+{formatNumber(result.boost.core, 3)}</td>
          </tr>
          <tr>
            <th>会心（期待値）</th>
            <td>
              +{formatNumber(result.boost.crit, 3)}
              {hasCritBuff
                ? `（確率 ${formatPercent(character.crit.rate + buffs.critRate, 2)} × ダメージ +${formatPercent(
                    character.crit.damage - 1 + buffs.critDamage,
                    2,
                  )}）`
                : ''}
            </td>
          </tr>
          <tr>
            <th>距離ボーナス</th>
            <td>+{formatNumber(result.boost.distance, 1)}</td>
          </tr>
          <tr>
            <th>倍率グループ合計</th>
            <td>×{formatNumber(result.boost.total, 3)}</td>
          </tr>
          {result.attackDamageMultiplier !== 1 && (
            <tr>
              <th>攻撃ダメージ（バフ）</th>
              <td>×{formatNumber(result.attackDamageMultiplier, 4)}（倍率グループとは別枠）</td>
            </tr>
          )}
          <tr>
            <th>属性有利</th>
            <td>×{result.elementMultiplier}</td>
          </tr>
          <tr>
            <th>マガジン</th>
            <td>
              {cadence.triggersPerCycle} 発 / {formatNumber(cadence.magazineFrames / 60, 2)} 秒
            </td>
          </tr>
          <tr>
            <th>リロード</th>
            <td>
              {formatNumber(cadence.reloadFrames / 60, 2)} 秒
              {cadence.reloadChunks > 1 ? `（${cadence.reloadChunks} 回）` : ''}
            </td>
          </tr>
          <tr>
            <th>1 周期</th>
            <td>{formatNumber(cadence.cycleSeconds, 2)} 秒</td>
          </tr>
        </tbody>
      </table>

      <p className="scope">
        通常攻撃と、定義済みの常時発動パッシブ（攻撃力・会心・攻撃ダメージ・チャージダメージ）だけを計算します。バースト・時間限定のバフ/デバフ・弾数増加・ヒット率は含みません。SG
        は全ペレット命中が前提です。
      </p>
    </section>
  );
}
