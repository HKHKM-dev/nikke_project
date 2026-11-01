import {
  BURST_STEP_KEYS,
  ENEMY_EVENT_KIND_LABEL,
  WEAPON_LABEL,
  slotsByStep,
  type TeamResult,
  type TeamSlotResult,
  type TriggerDamage,
  framesToGameSeconds,
  gameSecondsToFrame,
} from '@nikke/core';
import type { CalcView } from '../calcView.ts';
import { formatNumber, formatPercent } from '../format.ts';
import { DamageTimeline, landingLabel } from './DamageTimeline.tsx';
import { ResultPanel } from './ResultPanel.tsx';

type Props = {
  result: TeamResult;
  /**
   * result の計算の元（その時のキャラ・スキル LV・宝物の段階など）。詳細はいまの入力ではなくこれから読む
   * （計算中は result が前の入力の結果なので、いまの入力と混ぜるとキャラと宝物の段階が食い違う）
   */
  view: CalcView;
  /** ニケは選ばれているがデータ読み込み中で合計に入っていない枠の数 */
  loadingCount: number;
  /** スキル定義を読み込み中で、まだバフなしで計算している枠の数 */
  skillsLoadingCount: number;
  /** 2026-10-31: 右上の設定の「詳細情報表示」。ON のときだけ、総ダメージのほかの詳細（内訳・ニケごと・検証用）を出す */
  detailed: boolean;
};

const DETAIL_SUMMARY = '詳細内訳（通常・バースト・スキル・DPS・タイムライン等）';
const VERIFICATION_SUMMARY = '検証用の詳細';

/** キャラのいない編成の、詳細の見出し（薄くして開かない） */
function PlaceholderDetails({ summary }: { summary: string }) {
  return (
    <details className="segments" data-placeholder="true" aria-disabled="true">
      <summary tabIndex={-1} onClick={(e) => e.preventDefault()}>
        {summary}
      </summary>
    </details>
  );
}

const STEP_LABEL = { Step1: 'I', Step2: 'II', Step3: 'III' } as const;

/** 区間によって値が変わる項目の最小値（max: true で最大値）。持続バフがなければ 1 区間なので同じ値 */
function triggerRange(slot: TeamSlotResult, pick: (t: TriggerDamage) => number, max = false): number {
  const values = slot.segments.map((s) => pick(s.trigger));
  if (values.length === 0) return 0;
  return max ? Math.max(...values) : Math.min(...values);
}

export function TeamBreakdown({ result, view, loadingCount, skillsLoadingCount, detailed }: Props) {
  const filled = result.slots.filter((s): s is TeamSlotResult => s !== null);
  const slotNames = view.slots.map((s) => s.character?.name.ja);
  const teamCharacters = view.slots.map((s) => s.character ?? null);
  const attackLabel = view.fixedSpec ? '攻撃力（スペック固定: 好感度 + 装備込み）' : '攻撃力（素）';
  const schedule = result.schedule;
  const byStep = schedule ? slotsByStep(schedule) : null;
  const rankings = result.history.rankings;
  const rankingLabel = (frame: number): string => {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const r of rankings) {
      if (r.frame !== frame) continue;
      const label =
        r.targets
          .map((i) => {
            const s = filled.find((f) => f.index === i);
            return `${s ? s.character.name.ja : `スロット ${i + 1}`} ${formatNumber(r.finalAttacks[i] ?? 0)}`;
          })
          .join(' / ') + (r.tied ? '（同値はスロットの順と仮定）' : '');
      if (seen.has(label)) continue;
      seen.add(label);
      parts.push(label);
    }
    return parts.length > 0 ? parts.join('、') : '—';
  };
  const missingSteps = byStep ? BURST_STEP_KEYS.filter((step) => byStep[step].length === 0) : [];
  const summary = result.burstSummary;
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

  // 総ダメージは App.tsx の「編成ダメージ」の枠。ここは読み込み中の案内と詳細だけで、どちらも出さない設定なら枠を出さない。
  // 編成にキャラがいなくても、詳細を出す設定なら枠と詳細内訳の見出しを薄くして出す（キャラを選んでも枠の並びが変わらない）
  if (loadingCount === 0 && skillsLoadingCount === 0 && !detailed) return null;

  return (
    <fieldset className="panel result breakdown-panel">
      <legend>詳細戦闘情報</legend>
      {loadingCount > 0 && <p className="hint">読み込み中のスロット: {loadingCount}</p>}
      {skillsLoadingCount > 0 && <p className="hint">スキル定義を読み込み中のスロット: {skillsLoadingCount}</p>}

      {detailed && filled.length === 0 && (
        <>
          <PlaceholderDetails summary={DETAIL_SUMMARY} />
          <PlaceholderDetails summary={VERIFICATION_SUMMARY} />
        </>
      )}
      {detailed && filled.length > 0 && (
        <details className="segments">
          <summary>{DETAIL_SUMMARY}</summary>
          {schedule && summary && (
            <p className="hint burst-headline">
              フルバースト {summary.fullBursts} 回（稼働率 {formatPercent(summary.fullBurstUptime)}
              {summary.meanCycleSeconds !== null && `・平均サイクル ${formatNumber(summary.meanCycleSeconds, 1)} 秒`}
              {summary.firstFullBurstSeconds !== null && `・初回 ${formatNumber(summary.firstFullBurstSeconds, 1)} 秒`}
              ）
              {summary.fullBursts === 0 &&
                ` — フルバーストしません（${missingSteps.length > 0 ? `バースト ${missingSteps.map((s) => STEP_LABEL[s]).join('・')} のニケがいない` : 'チェーンがつながらない'}）`}
              {summary.chainTimeouts > 0 && ` — チェーン失敗 ${summary.chainTimeouts} 回`}
            </p>
          )}

          <DamageTimeline
            perSecond={result.damagePerSecond}
            events={result.enemyEvents}
            landings={result.landings}
            fullBursts={schedule?.fullBurstWindows ?? []}
          />

          <div className="table-scroll">
            <table className="team-table">
              <thead>
                <tr>
                  <th>スロット</th>
                  <th>ニケ</th>
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
                  <th colSpan={5}>合計（{result.filledCount} 体）</th>
                  <td>{formatNumber(result.totalDps)}</td>
                  <td className="grand-total">{formatNumber(result.totalDamage)}</td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="details">
            <h3>ニケごとの詳細</h3>
            {filled.map((s) => {
              const input = view.slots[s.index]!;
              return (
                <details key={s.index} className="slot-detail">
                  <summary>
                    スロット {s.index + 1}: {s.character.name.ja} — 総ダメージ {formatNumber(s.totalDamage)}（
                    {formatPercent(s.share, 1)}） / DPS {formatNumber(s.dps)}
                  </summary>
                  <ResultPanel
                    slotIndex={s.index}
                    character={s.character}
                    slot={s}
                    attackLabel={attackLabel}
                    slotNames={slotNames}
                    teamCharacters={teamCharacters}
                    enemyElement={view.input.enemy.element}
                    effectiveSkillLevels={input.skillLevels}
                    treasurePhase={input.treasurePhase}
                    skillsStatus={input.skillsStatus ?? { kind: 'loading' }}
                    hpRatio={input.hpRatio}
                  />
                </details>
              );
            })}
          </div>
        </details>
      )}

      {detailed && filled.length > 0 && (
        <details className="segments verification-details">
          {/* 一本化の段 A-2（plan/design-unify-sim-calc.md 5.3 節）: 2026-10-27 までは、ここに計算モデル（calc / sim）の切り替えと「calc との差」があった */}
          <summary>{VERIFICATION_SUMMARY}</summary>
          {eventsLabel !== '' && <p className="hint">敵の出来事: {eventsLabel}</p>}
          {landingsLabel !== '' && <p className="hint">的の着地点（撃つスロットに効く）: {landingsLabel} 秒</p>}
          <h4>攻撃力・トリガー数</h4>
          <div className="table-scroll">
            <table className="team-table">
              <thead>
                <tr>
                  <th>スロット</th>
                  <th>ニケ</th>
                  <th>{attackLabel}</th>
                  <th>攻撃力（バフ後）</th>
                  <th>1 トリガー</th>
                  <th>秒間トリガー</th>
                  <th>総ダメージ</th>
                </tr>
              </thead>
              <tbody>
                {filled.map((s) => (
                  <tr key={s.index}>
                    <td>{s.index + 1}</td>
                    <td>{s.character.name.ja}</td>
                    <td>{formatNumber(s.baseAttack)}</td>
                    <td>{formatNumber(triggerRange(s, (t) => t.attack))}</td>
                    <td>
                      {formatNumber(triggerRange(s, (t) => t.perTrigger))}
                      {s.segments.length > 1 && (
                        <small className="sub"> 〜 {formatNumber(triggerRange(s, (t) => t.perTrigger, true))}</small>
                      )}
                    </td>
                    <td>{formatNumber(s.cadence.triggersPerSecond, 3)}</td>
                    <td>{formatNumber(s.totalDamage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {schedule && summary && (
            <details className="segments">
              <summary>
                バーストの時刻表（{schedule.activations.length} 回の発動 —{' '}
                {BURST_STEP_KEYS.map((step) => {
                  const names = (byStep?.[step] ?? []).map((i) => {
                    const s = filled.find((f) => f.index === i);
                    return s ? `スロット ${i + 1} ${s.character.name.ja}` : `スロット ${i + 1}`;
                  });
                  return `${STEP_LABEL[step]}: ${names.length > 0 ? names.join('・') : '—'}`;
                }).join(' / ')}
                ）
              </summary>
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
                      const hit = s?.burst.activations.find((h) => gameSecondsToFrame(h.seconds) === a.frame)?.hit;
                      const window = a.startsFullBurst
                        ? schedule.fullBurstWindows.find((w) => w.start >= a.frame)
                        : undefined;
                      return (
                        <tr key={k}>
                          <td>{formatNumber(framesToGameSeconds(a.frame), 2)}s</td>
                          <td>{STEP_LABEL[a.step]}</td>
                          <td>
                            {s ? `スロット ${a.slotIndex + 1} ${s.character.name.ja}` : `スロット ${a.slotIndex + 1}`}
                          </td>
                          <td>{hit ? formatNumber(hit.perActivation) : '—'}</td>
                          <td>
                            {window
                              ? `${formatNumber(framesToGameSeconds(window.start), 1)}–${formatNumber(framesToGameSeconds(window.end), 1)}s（${formatNumber(framesToGameSeconds(window.end - window.start), 1)} 秒）`
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
          )}
        </details>
      )}
    </fieldset>
  );
}
