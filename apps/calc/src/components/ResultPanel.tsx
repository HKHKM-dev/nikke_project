import type { CharacterData, DamageResult, SlotBurstResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { BURST_DAMAGE_TYPE_LABEL } from '../skillLabels.ts';

type Props = {
  character: CharacterData;
  /** 通常区間（バーストなしなら戦闘時間すべて）の通常攻撃 */
  result: DamageResult;
  /** フルバースト区間の通常攻撃。バーストなしなら null */
  fullBurstResult: DamageResult | null;
  burst: SlotBurstResult;
  /** 通常攻撃（両区間）+ バーストスキル */
  totalDamage: number;
  dps: number;
  attackLabel?: string;
};

export function ResultPanel({
  character,
  result,
  fullBurstResult,
  burst,
  totalDamage,
  dps,
  attackLabel = '攻撃力（素）',
}: Props) {
  const { cadence, buffs } = result;
  const hasAttackBuff = buffs.attackRatio !== 0 || buffs.attackFlat !== 0;
  const hasCritBuff = buffs.critRate !== 0 || buffs.critDamage !== 0;
  const fb = fullBurstResult;
  const normalDamage = result.totalDamage + (fb?.totalDamage ?? 0);

  /** 通常区間 / フルバースト区間で値が違う行。fb が無ければ 1 列 */
  const twoCols = (normal: string, full: string) => (
    <>
      <td>{normal}</td>
      {fb && <td>{full}</td>}
    </>
  );
  const oneCol = (value: string) => <td colSpan={fb ? 2 : 1}>{value}</td>;

  return (
    <section className="panel result">
      <h2>{character.name.ja}</h2>
      <dl className="summary">
        <dt>通常攻撃</dt>
        <dd>{formatNumber(normalDamage)}</dd>
        <dt>バーストスキル</dt>
        <dd>
          {burst.hit
            ? `${formatNumber(burst.totalDamage)}（${burst.activations.length} 回 × ${formatNumber(burst.hit.perActivation)}）`
            : '—'}
        </dd>
        <dt>DPS</dt>
        <dd>{formatNumber(dps)}</dd>
        <dt>総ダメージ</dt>
        <dd className="total">{formatNumber(totalDamage)}</dd>
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

      <h3>通常攻撃の内訳</h3>
      <table className="breakdown">
        {fb && (
          <thead>
            <tr>
              <th></th>
              <th>通常区間</th>
              <th>フルバースト区間</th>
            </tr>
          </thead>
        )}
        <tbody>
          <tr>
            <th>{attackLabel}</th>
            {oneCol(formatNumber(result.baseAttack))}
          </tr>
          {hasAttackBuff && (
            <>
              <tr>
                <th>攻撃力バフ</th>
                {oneCol(
                  `${buffs.attackRatio !== 0 ? `×(1 + ${formatPercent(buffs.attackRatio, 2)})` : ''}${
                    buffs.attackRatio !== 0 && buffs.attackFlat !== 0 ? ' ' : ''
                  }${buffs.attackFlat !== 0 ? `+${formatNumber(buffs.attackFlat)}` : ''}`,
                )}
              </tr>
              <tr>
                <th>攻撃力（バフ後）</th>
                {oneCol(formatNumber(result.attack))}
              </tr>
            </>
          )}
          <tr>
            <th>攻撃力 − 防御力</th>
            {oneCol(formatNumber(result.baseHit))}
          </tr>
          <tr>
            <th>武器倍率</th>
            {oneCol(
              `${formatPercent(result.weaponMultiplier, 2)}${
                character.shot.shotCount > 1 ? `（${character.shot.shotCount} ペレット合計）` : ''
              }`,
            )}
          </tr>
          {result.chargeMultiplier !== 1 && (
            <tr>
              <th>チャージ倍率</th>
              {oneCol(
                `×${formatNumber(result.chargeMultiplier, 4)}${
                  buffs.chargeDamage !== 0
                    ? `（${character.shot.fullChargeDamage} + ${formatPercent(buffs.chargeDamage, 2)}）`
                    : ''
                }`,
              )}
            </tr>
          )}
          <tr>
            <th>コア（期待値）</th>
            {oneCol(`+${formatNumber(result.boost.core, 3)}`)}
          </tr>
          <tr>
            <th>会心（期待値）</th>
            {oneCol(
              `+${formatNumber(result.boost.crit, 3)}${
                hasCritBuff
                  ? `（確率 ${formatPercent(character.crit.rate + buffs.critRate, 2)} × ダメージ +${formatPercent(
                      character.crit.damage - 1 + buffs.critDamage,
                      2,
                    )}）`
                  : ''
              }`,
            )}
          </tr>
          <tr>
            <th>距離ボーナス</th>
            {oneCol(`+${formatNumber(result.boost.distance, 1)}`)}
          </tr>
          {fb && (
            <tr>
              <th>フルバースト</th>
              {twoCols('—', `+${formatNumber(fb.boost.fullBurst, 1)}`)}
            </tr>
          )}
          <tr>
            <th>倍率グループ合計</th>
            {twoCols(`×${formatNumber(result.boost.total, 3)}`, `×${formatNumber(fb?.boost.total ?? 0, 3)}`)}
          </tr>
          {buffs.attackDamage !== 0 && (
            <tr>
              <th>攻撃ダメージ（バフ）</th>
              {oneCol(`×${formatNumber(result.attackDamageMultiplier, 4)}（倍率グループとは別枠）`)}
            </tr>
          )}
          <tr>
            <th>属性有利</th>
            {oneCol(`×${result.elementMultiplier}`)}
          </tr>
          <tr>
            <th>1 トリガー期待ダメージ</th>
            {twoCols(formatNumber(result.perTrigger), formatNumber(fb?.perTrigger ?? 0))}
          </tr>
          <tr>
            <th>マガジン</th>
            {oneCol(`${cadence.triggersPerCycle} 発 / ${formatNumber(cadence.magazineFrames / 60, 2)} 秒`)}
          </tr>
          <tr>
            <th>リロード</th>
            {oneCol(
              `${formatNumber(cadence.reloadFrames / 60, 2)} 秒${
                cadence.reloadChunks > 1 ? `（${cadence.reloadChunks} 回）` : ''
              }`,
            )}
          </tr>
          <tr>
            <th>1 周期</th>
            {oneCol(`${formatNumber(cadence.cycleSeconds, 2)} 秒`)}
          </tr>
          <tr>
            <th>秒間トリガー数</th>
            {oneCol(formatNumber(cadence.triggersPerSecond, 3))}
          </tr>
          <tr>
            <th>区間の長さ</th>
            {twoCols(
              `${formatNumber(result.totalDamage / (result.dps || 1), 1)} 秒`,
              `${formatNumber((fb?.totalDamage ?? 0) / (fb?.dps || 1), 1)} 秒`,
            )}
          </tr>
          <tr>
            <th>区間のダメージ</th>
            {twoCols(formatNumber(result.totalDamage), formatNumber(fb?.totalDamage ?? 0))}
          </tr>
        </tbody>
      </table>

      {burst.hit && (
        <>
          <h3>バーストスキル</h3>
          <table className="breakdown">
            <tbody>
              <tr>
                <th>攻撃力（バフ後） − 防御力</th>
                <td>{formatNumber(burst.hit.baseHit)}</td>
              </tr>
              {burst.hit.perEffect.map((p, i) => (
                <tr key={i}>
                  <th>{BURST_DAMAGE_TYPE_LABEL[p.effect.damageType]}</th>
                  <td>
                    ×{formatNumber(p.effect.multiplier, 4)}
                    {p.effect.damageType === 'distributed' ? '（近似: 単体ボスでは全額）' : ''}
                    {p.effect.assumes ? `・仮定: ${p.effect.assumes.ja}` : ''}
                  </td>
                </tr>
              ))}
              <tr>
                <th>会心（期待値）</th>
                <td>+{formatNumber(burst.hit.boost.crit, 3)}</td>
              </tr>
              <tr>
                <th>フルバースト</th>
                <td>
                  {burst.hit.boost.fullBurst !== 0
                    ? `+${formatNumber(burst.hit.boost.fullBurst, 1)}`
                    : '乗せない（実測で確定するまでの仮定）'}
                </td>
              </tr>
              <tr>
                <th>倍率グループ合計</th>
                <td>×{formatNumber(burst.hit.boost.total, 3)}（コア・距離・武器倍率・チャージ倍率は乗らない）</td>
              </tr>
              {burst.hit.attackDamageMultiplier !== 1 && (
                <tr>
                  <th>攻撃ダメージ（バフ）</th>
                  <td>×{formatNumber(burst.hit.attackDamageMultiplier, 4)}</td>
                </tr>
              )}
              <tr>
                <th>属性有利</th>
                <td>×{burst.hit.elementMultiplier}</td>
              </tr>
              <tr>
                <th>1 発動</th>
                <td>{formatNumber(burst.hit.perActivation)}</td>
              </tr>
              <tr>
                <th>発動</th>
                <td>
                  {burst.activations.length} 回
                  {burst.activations.length > 0 ? `（${burst.activations.map((t) => `${t}s`).join(', ')}）` : ''}
                </td>
              </tr>
              <tr>
                <th>合計</th>
                <td>{formatNumber(burst.totalDamage)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <p className="scope">
        通常攻撃（固定サイクルのフルバースト補正込み）と、定義済みの常時発動パッシブ、倍率ダメージだけのバーストスキルを計算します。時間限定のバフ/デバフ・弾数増加・ヒット率・バースト
        CT は含みません。SG は全ペレット命中が前提です。
      </p>
    </section>
  );
}
