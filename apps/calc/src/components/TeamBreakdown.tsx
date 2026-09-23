import {
  BURST_STEP_KEYS,
  WEAPON_LABEL,
  slotsByStep,
  type TeamResult,
  type TeamSlotResult,
  type TriggerDamage,
} from '@nikke/core';
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

/** 区間によって値が変わる項目の最小値（max: true で最大値）。持続バフがなければ 1 区間なので同じ値 */
function triggerRange(slot: TeamSlotResult, pick: (t: TriggerDamage) => number, max = false): number {
  const values = slot.segments.map((s) => pick(s.trigger));
  if (values.length === 0) return 0;
  return max ? Math.max(...values) : Math.min(...values);
}

export function TeamBreakdown({ result, loadingCount, skillsLoadingCount, fixedSpec }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);
  const attackLabel = fixedSpec ? '攻撃力（スペック固定: 好感度 + 装備込み）' : '攻撃力（素）';
  const schedule = result.schedule;
  const byStep = schedule ? slotsByStep(schedule) : null;
  // Stage 11 アリス編: フルバースト開始時の「最終攻撃力が最も高い味方 N 機」の対象（同じ発火の同じ対象はまとめる）
  const rankings = result.timeline.rankings;
  const rankingLabel = (frame: number): string => {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const r of rankings) {
      if (r.frame !== frame) continue;
      const label =
        r.targets
          .map((i) => {
            const s = filled.find((f) => f.index === i);
            return `${s ? s.character.name.ja : `枠 ${i + 1}`} ${formatNumber(r.finalAttacks[i] ?? 0)}`;
          })
          .join(' / ') + (r.tied ? '（同値は枠の順と仮定）' : '');
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(label);
    }
    return parts.length > 0 ? parts.join('、') : '—';
  };
  const missingSteps = byStep ? BURST_STEP_KEYS.filter((step) => byStep[step].length === 0) : [];
  const summary = result.burstSummary;

  return (
    <section className="panel result breakdown-panel">
      <h2>編成の内訳</h2>
      {filled.length === 0 && loadingCount === 0 && (
        <p className="hint">枠にニケを選ぶと、ここに内訳と合計が出ます。</p>
      )}
      {filled.length > 0 && schedule && summary && (
        <>
          <p className="hint">
            フルバースト {summary.fullBursts} 回（稼働率 {formatPercent(summary.fullBurstUptime)}
            {summary.meanCycleSeconds !== null && `・平均サイクル ${formatNumber(summary.meanCycleSeconds, 1)} 秒`}
            {summary.firstFullBurstSeconds !== null && `・初回 ${formatNumber(summary.firstFullBurstSeconds, 1)} 秒`}
            ）。発動:{' '}
            {BURST_STEP_KEYS.map((step) => {
              const names = (byStep?.[step] ?? []).map((i) => {
                const s = filled.find((f) => f.index === i);
                return s ? `枠 ${i + 1} ${s.character.name.ja}` : `枠 ${i + 1}`;
              });
              return `${STEP_LABEL[step]}: ${names.length > 0 ? names.join('・') : '—'}`;
            }).join(' / ')}
            {summary.fullBursts === 0 &&
              `。フルバーストしません（${missingSteps.length > 0 ? `バースト ${missingSteps.map((s) => STEP_LABEL[s]).join('・')} のニケがいない` : 'チェーンがつながらない'}）`}
            {summary.chainTimeouts > 0 &&
              `。チェーン失敗 ${summary.chainTimeouts} 回（次の段階が 10 秒出ずにゲージが 0 に戻った）`}
          </p>
          <p className="hint">
            ゲージ量は射撃場の的で較正した値（1 回目の満タンの時刻は録画と ±1 秒程度。レイドボスでは未確認）。SR / RL
            のフルチャージ倍率は「操作キャラ」の枠だけに乗る。
          </p>
          <details className="segments">
            <summary>バーストの時刻表（{schedule.activations.length} 回の発動）</summary>
            <div className="table-scroll">
              <table className="team-table">
                <thead>
                  <tr>
                    <th>時刻</th>
                    <th>段階</th>
                    <th>ニケ</th>
                    <th>バーストスキル</th>
                    <th>フルバースト</th>
                    {rankings.length > 0 && <th>最終攻撃力の上位（対象）</th>}
                  </tr>
                </thead>
                <tbody>
                  {schedule.activations.map((a, k) => {
                    const s = filled.find((f) => f.index === a.slotIndex);
                    const hit = s?.burst.activations.find((h) => Math.round(h.seconds * 60) === a.frame)?.hit;
                    const window = a.startsFullBurst
                      ? schedule.fullBurstWindows.find((w) => w.start >= a.frame)
                      : undefined;
                    return (
                      <tr key={k}>
                        <td>{formatNumber(a.frame / 60, 2)}s</td>
                        <td>{STEP_LABEL[a.step]}</td>
                        <td>{s ? `枠 ${a.slotIndex + 1} ${s.character.name.ja}` : `枠 ${a.slotIndex + 1}`}</td>
                        <td>{hit ? formatNumber(hit.perActivation) : '—'}</td>
                        <td>
                          {window
                            ? `${formatNumber(window.start / 60, 1)}–${formatNumber(window.end / 60, 1)}s（${formatNumber((window.end - window.start) / 60, 1)} 秒）`
                            : '—'}
                        </td>
                        {rankings.length > 0 && <td>{window ? rankingLabel(window.start) : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </>
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
                <th>スキルダメージ</th>
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
                  <td>{formatNumber(s.baseAttack)}</td>
                  <td>{formatNumber(triggerRange(s, (t) => t.attack))}</td>
                  <td>
                    {formatNumber(triggerRange(s, (t) => t.perTrigger))}
                    {s.segments.length > 1 && (
                      <small className="sub"> 〜 {formatNumber(triggerRange(s, (t) => t.perTrigger, true))}</small>
                    )}
                  </td>
                  <td>{formatNumber(s.cadence.triggersPerSecond, 3)}</td>
                  <td>{formatNumber(s.normalDamage)}</td>
                  <td>
                    {s.burst.hit ? formatNumber(s.burst.totalDamage) : '—'}
                    {s.burst.hit && <small className="sub"> ×{s.burst.activations.length}</small>}
                  </td>
                  <td>
                    {s.skillHits.activations.length > 0 ? formatNumber(s.skillHits.totalDamage) : '—'}
                    {s.skillHits.activations.length > 0 && (
                      <small className="sub"> ×{s.skillHits.activations.length}</small>
                    )}
                  </td>
                  <td>{formatNumber(s.dps)}</td>
                  <td>{formatNumber(s.totalDamage)}</td>
                  <td>{formatPercent(s.share, 1)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={9}>合計（{result.filledCount} 体）</th>
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
              <ResultPanel character={s.character} slot={s} attackLabel={attackLabel} />
            </details>
          ))}
        </div>
      )}
      <p className="scope">
        calc v5
        は各ニケの通常攻撃に、定義済みの常時発動パッシブと持続バフ（攻撃力・会心・攻撃ダメージ・チャージダメージ・分配ダメージ）を乗せ、
        通常攻撃のゲージ蓄積（常時のゲージ速度込み）と各ニケのバースト CT から決まるフルバースト区間（+0.5。長さは III
        のニケごと）と、バーストスキル・スキルの倍率ダメージ（N 回攻撃ごと・バースト使用 N
        回目以降・最後の弾丸など）を足し合わせます。最大装弾数・リロード速度・チャージ速度のバフ、バースト CT
        短縮、弾丸チャージは射撃とフルバーストの時刻に反映し、射撃が変わるバフの掛かった区間は発数を実数で数えます。対象「直前にバーストスキルを使用した味方」と、回復・「回復効果が適用された時」の発動（回復は定義のあるニケによるものだけ）にも対応します。防御力▼などの敵デバフ・ヒット率・被弾・OL・キューブは含みません。定義のないニケはスキルなしで計算します。SG
        は全ペレット命中が前提です。
      </p>
    </section>
  );
}
