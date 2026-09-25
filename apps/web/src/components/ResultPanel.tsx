import type { CharacterData, TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import {
  BURST_DAMAGE_TYPE_LABEL,
  SKILL_DAMAGE_TYPE_LABEL,
  SKILL_SLOT_LABEL,
  formatAppliedAmount,
  formatTimedTrigger,
  formatTrigger,
} from '../skillLabels.ts';

type Props = {
  character: CharacterData;
  slot: TeamSlotResult;
  attackLabel?: string;
};

type SkillHitGroup = {
  label: string;
  trigger: string;
  multiplier: number;
  assumes: string | null;
  count: number;
  total: number;
  /** 発動ごとに値が違うか（持続バフの有無で変わる） */
  varies: boolean;
  min: number;
  max: number;
};

/** Stage 8: 倍率ダメージ（damage）を効果ごとにまとめる */
function groupSkillHits(slot: TeamSlotResult): SkillHitGroup[] {
  const groups = new Map<string, SkillHitGroup>();
  for (const a of slot.skillHits.activations) {
    const e = a.effect;
    // Stage 11 紅蓮BS: 段の循環は段ごとに分ける
    const key = `${e.source.skill}.${e.effectIndex}.${e.cycle?.step ?? ''}`;
    const value = a.hit.perActivation;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      g.total += value;
      g.min = Math.min(g.min, value);
      g.max = Math.max(g.max, value);
      g.varies = g.min !== g.max;
      continue;
    }
    groups.set(key, {
      label: `${SKILL_SLOT_LABEL[e.source.skill]} ${SKILL_DAMAGE_TYPE_LABEL[e.damageType]}${
        e.cycle ? `（段 ${String.fromCharCode(65 + e.cycle.step)}）` : ''
      }`,
      trigger: e.cycle
        ? `${formatTrigger(e.trigger)}に ${e.cycle.steps} 段を循環（${e.cycle.step + 1} 段目。窓の中は間隔の変更に従う）`
        : formatTrigger(e.trigger),
      multiplier: e.multiplier,
      assumes: e.assumes?.ja ?? null,
      count: 1,
      total: value,
      varies: false,
      min: value,
      max: value,
    });
  }
  return [...groups.values()];
}

/** [0.0–15.0s, 20.0–35.0s] */
function formatRanges(ranges: readonly { start: number; end: number }[]): string {
  return ranges.map((r) => `${formatNumber(r.start / 60, 1)}–${formatNumber(r.end / 60, 1)}s`).join(', ');
}

export function ResultPanel({ character, slot, attackLabel = '攻撃力（素）' }: Props) {
  const { cadence, segments, burst, notes } = slot;
  const skillHitGroups = groupSkillHits(slot);
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
        {skillHitGroups.length > 0 && (
          <>
            <dt>スキルダメージ</dt>
            <dd>{`${formatNumber(slot.skillHits.totalDamage)}（${slot.skillHits.activations.length} 回）`}</dd>
          </>
        )}
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
          {rep.trigger.normalAttackMultiplier !== 1 && (
            <tr>
              <th>通常攻撃ダメージ倍率</th>
              <td>×{formatNumber(rep.trigger.normalAttackMultiplier, 4)}（仮定）</td>
            </tr>
          )}
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
            <td>
              +{formatNumber(rep.trigger.boost.core, 3)}
              {buffs.coreDamage !== 0 && `（コアダメージ +${formatPercent(buffs.coreDamage, 2)} 込み）`}
            </td>
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
              <td>×{formatNumber(rep.trigger.attackDamageMultiplier, 4)}</td>
            </tr>
          )}
          <tr>
            <th>属性有利</th>
            <td>
              ×{formatNumber(rep.trigger.elementMultiplier, 4)}
              {rep.trigger.elementMultiplier !== 1 &&
                buffs.elementDamage !== 0 &&
                `（1.1 + 有利コード ${formatPercent(buffs.elementDamage, 2)}）`}
            </td>
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
                <td>
                  {formatNumber(seg.triggers, 1)}
                  {seg.triggerSource === 'shots' && (
                    <small
                      className="sub"
                      title="最大装弾数・リロード速度・チャージ速度の持続バフが掛かっている区間は、平均レートではなく 1 パス目の射撃の列から発数を数える"
                    >
                      （実数）
                    </small>
                  )}
                </td>
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
                    : '乗せない（仮定）'}
                </td>
              </tr>
              <tr>
                <th>倍率グループ合計</th>
                <td>×{formatNumber(burst.hit.boost.total, 3)}</td>
              </tr>
              {burst.hit.attackDamageMultiplier !== 1 && (
                <tr>
                  <th>攻撃ダメージ（バフ）</th>
                  <td>×{formatNumber(burst.hit.attackDamageMultiplier, 4)}</td>
                </tr>
              )}
              {burst.hit.distributedDamageMultiplier !== 1 && (
                <tr>
                  <th>分配ダメージ（バフ）</th>
                  <td>×{formatNumber(burst.hit.distributedDamageMultiplier, 4)}</td>
                </tr>
              )}
              <tr>
                <th>属性有利</th>
                <td>×{formatNumber(burst.hit.elementMultiplier, 4)}</td>
              </tr>
              <tr>
                <th>1 発動</th>
                <td>
                  {formatNumber(burst.hit.perActivation)}
                  {activationsVary ? <small className="sub">（発動ごとに異なる）</small> : ''}
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
            </tbody>
          </table>
        </>
      )}

      {skillHitGroups.length > 0 && (
        <>
          <h3>スキルの倍率ダメージ</h3>
          <table className="breakdown">
            <tbody>
              {skillHitGroups.map((g, i) => (
                <tr key={i}>
                  <th>
                    {g.label}
                    <small className="sub">（{g.trigger}）</small>
                  </th>
                  <td>
                    ×{formatNumber(g.multiplier, 4)} → 1 回{' '}
                    {g.varies ? `${formatNumber(g.min)}〜${formatNumber(g.max)}` : formatNumber(g.min)} × {g.count} 回 ={' '}
                    {formatNumber(g.total)}
                    {g.assumes ? <small className="sub">・仮定: {g.assumes}</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
