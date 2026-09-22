import { BURST_STEP_KEYS, WEAPON_LABEL, type TeamResult, type TeamSlotResult } from '@nikke/core';
import { formatNumber, formatPercent } from '../format.ts';
import { ResultPanel } from './ResultPanel.tsx';

type Props = {
  result: TeamResult;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  /** スキル定義を読み込み中で、まだバフなしで計算している枠の数 */
  skillsLoadingCount: number;
  fixedSpec: boolean;
};

const STEP_LABEL = { Step1: 'I', Step2: 'II', Step3: 'III' } as const;

export function TeamBreakdown({ result, loadingCount, skillsLoadingCount, fixedSpec }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);
  const attackLabel = fixedSpec ? '攻撃力（スペック固定: 好感度 + 装備込み）' : '攻撃力（素）';
  const schedule = result.schedule;
  const missingSteps = schedule ? BURST_STEP_KEYS.filter((step) => schedule.assignment[step] === null) : [];

  return (
    <section className="panel result breakdown-panel">
      <h2>編成の内訳</h2>
      {filled.length === 0 && loadingCount === 0 && (
        <p className="hint">枠にニケを選ぶと、ここに内訳と合計が出ます。</p>
      )}
      {filled.length > 0 && schedule && (
        <p className="hint">
          バースト {schedule.activationFrames.length} 回（
          {schedule.activationFrames.map((f) => `${f / 60}s`).join(', ')}）、フルバースト合計{' '}
          {formatNumber(schedule.fullBurstFramesTotal / 60)} 秒。発動:{' '}
          {BURST_STEP_KEYS.map((step) => {
            const i = schedule.assignment[step];
            const s = i === null ? undefined : filled.find((f) => f.index === i);
            return `${STEP_LABEL[step]}: ${s ? `枠 ${i! + 1} ${s.character.name.ja}` : '—'}`;
          }).join(' / ')}
          {missingSteps.length > 0 &&
            `。バースト ${missingSteps.map((s) => STEP_LABEL[s]).join('・')} のニケがいません（フルバーストは起きると仮定）`}
        </p>
      )}
      {filled.length > 0 && (
        <div className="table-scroll">
          <table className="team-table">
            <thead>
              <tr>
                <th>枠</th>
                <th>ニケ</th>
                <th>{attackLabel}</th>
                <th>攻撃力（バフ後）</th>
                <th>1 トリガー</th>
                <th>秒間トリガー</th>
                <th>通常攻撃</th>
                <th>バーストスキル</th>
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
                  <td>{formatNumber(s.result.baseAttack)}</td>
                  <td>{formatNumber(s.result.attack)}</td>
                  <td>
                    {formatNumber(s.result.perTrigger)}
                    {s.fullBurstResult && (
                      <small className="sub"> / FB {formatNumber(s.fullBurstResult.perTrigger)}</small>
                    )}
                  </td>
                  <td>{formatNumber(s.result.cadence.triggersPerSecond, 3)}</td>
                  <td>{formatNumber(s.result.totalDamage + (s.fullBurstResult?.totalDamage ?? 0))}</td>
                  <td>
                    {s.burst.hit ? formatNumber(s.burst.totalDamage) : '—'}
                    {s.burst.hit && <small className="sub"> ×{s.burst.activations.length}</small>}
                  </td>
                  <td>{formatNumber(s.dps)}</td>
                  <td>{formatNumber(s.totalDamage)}</td>
                  <td>{formatPercent(s.share, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={8}>合計（{result.filledCount} 体）</th>
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
      {skillsLoadingCount > 0 && (
        <p className="hint">
          スキル定義を読み込み中の枠が {skillsLoadingCount} つあります。そのスキルはまだ反映されていません。
        </p>
      )}
      {filled.length > 0 && (
        <div className="details">
          <h3>ニケごとの詳細</h3>
          {filled.map((s) => (
            <details key={s.index} className="slot-detail">
              <summary>
                枠 {s.index + 1}: {s.character.name.ja} — 総ダメージ {formatNumber(s.totalDamage)}（
                {formatPercent(s.share, 1)}）
              </summary>
              <ResultPanel
                character={s.character}
                result={s.result}
                fullBurstResult={s.fullBurstResult}
                burst={s.burst}
                totalDamage={s.totalDamage}
                dps={s.dps}
                attackLabel={attackLabel}
              />
            </details>
          ))}
        </div>
      )}
      <p className="scope">
        calc v4
        は各ニケの通常攻撃に、定義済みの常時発動パッシブ（自分・味方全体の攻撃力・会心・攻撃ダメージ・チャージダメージ）を乗せ、固定
        20 秒サイクルのフルバースト区間（+0.5）と倍率ダメージだけのバーストスキルを足し合わせます。バースト
        CT・ゲージ・時間限定のバフ/デバフ・弾数増加・ヒット率は含みません。定義のないニケはスキルなしで計算します。SG
        は全ペレット命中が前提です。
      </p>
    </section>
  );
}
