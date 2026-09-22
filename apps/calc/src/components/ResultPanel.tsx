import type { CharacterData, TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { BURST_DAMAGE_TYPE_LABEL, formatAppliedAmount, formatTimedTrigger } from '../skillLabels.ts';

type Props = {
  character: CharacterData;
  slot: TeamSlotResult;
  attackLabel?: string;
};

/** [0.0–15.0s, 20.0–35.0s] */
function formatRanges(ranges: readonly { start: number; end: number }[]): string {
  return ranges.map((r) => `${formatNumber(r.start / 60, 1)}–${formatNumber(r.end / 60, 1)}s`).join(', ');
}

export function ResultPanel({ character, slot, attackLabel = '攻撃力（素）' }: Props) {
  const { cadence, segments, burst, notes } = slot;
  // 代表値は最初の区間（= 戦闘開始時点の状態）。持続バフ中ならその旨を出す
  const rep = segments[0];
  const buffs = rep?.buffs;
  const hasAttackBuff = buffs !== undefined && (buffs.attackRatio !== 0 || buffs.attackFlat !== 0);
  const hasCritBuff = buffs !== undefined && (buffs.critRate !== 0 || buffs.critDamage !== 0);
  const repIsTimed = (rep?.timedEffects.length ?? 0) > 0 && segments.length > 1;
  const activationsVary =
    burst.activations.length > 1 &&
    burst.activations.some((a) => a.hit.perActivation !== burst.activations[0]!.hit.perActivation);

  if (rep === undefined || buffs === undefined) return null;

  return (
    <section className="panel result">
      <h2>{character.name.ja}</h2>
      <dl className="summary">
        <dt>通常攻撃</dt>
        <dd>{formatNumber(slot.normalDamage)}</dd>
        <dt>バーストスキル</dt>
        <dd>
          {burst.hit
            ? `${formatNumber(burst.totalDamage)}（${burst.activations.length} 回 × ${formatNumber(burst.hit.perActivation)}）`
            : '—'}
        </dd>
        <dt>DPS</dt>
        <dd>{formatNumber(slot.dps)}</dd>
        <dt>総ダメージ</dt>
        <dd className="total">{formatNumber(slot.totalDamage)}</dd>
      </dl>

      {notes.length > 0 && (
        <ul className="notes">
          {notes.map((note) => (
            <li key={note.code} className={`note ${note.level}`}>
              <span className="badge">{note.level === 'unsupported' ? '未対応' : '近似'}</span> {note.message.ja}
            </li>
          ))}
        </ul>
      )}

      <h3>
        通常攻撃の内訳
        <small className="sub">
          （代表: {formatRanges(rep.ranges)}
          {rep.fullBurst ? '・フルバースト中' : ''}
          {repIsTimed ? '・持続バフ中' : ''}）
        </small>
      </h3>
      <table className="breakdown">
        <tbody>
          <tr>
            <th>{attackLabel}</th>
            <td>{formatNumber(slot.baseAttack)}</td>
          </tr>
          {hasAttackBuff && (
            <>
              <tr>
                <th>攻撃力バフ</th>
                <td>
                  {`${buffs.attackRatio !== 0 ? `×(1 + ${formatPercent(buffs.attackRatio, 2)})` : ''}${
                    buffs.attackRatio !== 0 && buffs.attackFlat !== 0 ? ' ' : ''
                  }${buffs.attackFlat !== 0 ? `+${formatNumber(buffs.attackFlat)}` : ''}`}
                </td>
              </tr>
              <tr>
                <th>攻撃力（バフ後）</th>
                <td>{formatNumber(rep.trigger.attack)}</td>
              </tr>
            </>
          )}
          <tr>
            <th>攻撃力 − 防御力</th>
            <td>{formatNumber(rep.trigger.baseHit)}</td>
          </tr>
          <tr>
            <th>武器倍率</th>
            <td>
              {`${formatPercent(rep.trigger.weaponMultiplier, 2)}${
                character.shot.shotCount > 1 ? `（${character.shot.shotCount} ペレット合計）` : ''
              }`}
            </td>
          </tr>
          {rep.trigger.chargeMultiplier !== 1 && (
            <tr>
              <th>チャージ倍率</th>
              <td>
                {`×${formatNumber(rep.trigger.chargeMultiplier, 4)}${
                  buffs.chargeDamage !== 0
                    ? `（${character.shot.fullChargeDamage} + ${formatPercent(buffs.chargeDamage, 2)}）`
                    : ''
                }`}
              </td>
            </tr>
          )}
          <tr>
            <th>コア（期待値）</th>
            <td>+{formatNumber(rep.trigger.boost.core, 3)}</td>
          </tr>
          <tr>
            <th>会心（期待値）</th>
            <td>
              {`+${formatNumber(rep.trigger.boost.crit, 3)}${
                hasCritBuff
                  ? `（確率 ${formatPercent(character.crit.rate + buffs.critRate, 2)} × ダメージ +${formatPercent(
                      character.crit.damage - 1 + buffs.critDamage,
                      2,
                    )}）`
                  : ''
              }`}
            </td>
          </tr>
          <tr>
            <th>距離ボーナス</th>
            <td>+{formatNumber(rep.trigger.boost.distance, 1)}</td>
          </tr>
          <tr>
            <th>フルバースト</th>
            <td>{rep.trigger.boost.fullBurst !== 0 ? `+${formatNumber(rep.trigger.boost.fullBurst, 1)}` : '—'}</td>
          </tr>
          <tr>
            <th>倍率グループ合計</th>
            <td>×{formatNumber(rep.trigger.boost.total, 3)}</td>
          </tr>
          {buffs.attackDamage !== 0 && (
            <tr>
              <th>攻撃ダメージ（バフ）</th>
              <td>×{formatNumber(rep.trigger.attackDamageMultiplier, 4)}（倍率グループとは別枠）</td>
            </tr>
          )}
          <tr>
            <th>属性有利</th>
            <td>×{rep.trigger.elementMultiplier}</td>
          </tr>
          <tr>
            <th>1 トリガー期待ダメージ</th>
            <td>{formatNumber(rep.trigger.perTrigger)}</td>
          </tr>
          <tr>
            <th>マガジン</th>
            <td>{`${cadence.triggersPerCycle} 発 / ${formatNumber(cadence.magazineFrames / 60, 2)} 秒`}</td>
          </tr>
          <tr>
            <th>リロード</th>
            <td>
              {`${formatNumber(cadence.reloadFrames / 60, 2)} 秒${
                cadence.reloadChunks > 1 ? `（${cadence.reloadChunks} 回）` : ''
              }`}
            </td>
          </tr>
          <tr>
            <th>1 周期</th>
            <td>{formatNumber(cadence.cycleSeconds, 2)} 秒</td>
          </tr>
          <tr>
            <th>秒間トリガー数</th>
            <td>{formatNumber(cadence.triggersPerSecond, 3)}</td>
          </tr>
        </tbody>
      </table>

      <details className="segments">
        <summary>区間（{segments.length} 通りのバフ状態）</summary>
        <table className="breakdown">
          <thead>
            <tr>
              <th>時間帯</th>
              <th>FB</th>
              <th>攻撃力</th>
              <th>倍率グループ</th>
              <th>攻撃ダメージ</th>
              <th>1 トリガー</th>
              <th>トリガー数</th>
              <th>ダメージ</th>
              <th>持続バフ</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((seg, i) => (
              <tr key={i}>
                <td>
                  {formatRanges(seg.ranges)}
                  <small className="sub"> 計 {formatNumber(seg.seconds, 1)}s</small>
                </td>
                <td>{seg.fullBurst ? '○' : '—'}</td>
                <td>{formatNumber(seg.trigger.attack)}</td>
                <td>×{formatNumber(seg.trigger.boost.total, 3)}</td>
                <td>×{formatNumber(seg.trigger.attackDamageMultiplier, 4)}</td>
                <td>{formatNumber(seg.trigger.perTrigger)}</td>
                <td>{formatNumber(seg.triggers, 1)}</td>
                <td>{formatNumber(seg.damage)}</td>
                <td>
                  {seg.timedEffects.length === 0
                    ? '—'
                    : seg.timedEffects.map((e, j) => (
                        <small key={j} className="sub">
                          {formatTimedTrigger(e.trigger)} {formatAppliedAmount(e)}
                          {j < seg.timedEffects.length - 1 ? ' / ' : ''}
                        </small>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

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
                <td>
                  {formatNumber(burst.hit.perActivation)}
                  {activationsVary ? <small className="sub">（発動ごとに異なる。下の一覧を見る）</small> : ''}
                </td>
              </tr>
              <tr>
                <th>発動</th>
                <td>
                  {burst.activations.length} 回
                  {burst.activations.length > 0
                    ? `（${burst.activations
                        .map(
                          (a) =>
                            `${formatNumber(a.seconds, 0)}s${activationsVary ? `: ${formatNumber(a.hit.perActivation)}` : ''}`,
                        )
                        .join(', ')}）`
                    : ''}
                </td>
              </tr>
              <tr>
                <th>合計</th>
                <td>{formatNumber(burst.totalDamage)}</td>
              </tr>
              <tr>
                <th>バフのスナップショット</th>
                <td>発動直前のバフで計算（その発動で自分に付く持続バフは乗らない。実測で確定するまでの仮定）</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <p className="scope">
        通常攻撃（固定サイクルのフルバースト補正込み）と、定義済みの常時発動パッシブ・バースト時トリガーの持続バフ・倍率ダメージだけのバーストスキルを計算します。弾数増加・ヒット率・スタック・バースト
        CT は含みません。SG は全ペレット命中が前提です。
      </p>
    </section>
  );
}
