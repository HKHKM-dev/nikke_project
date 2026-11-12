// 残差の一覧（plan/residuals.md）の描画（plan/design-stage19.md 2.5 節）
import { CLAIM_TOPICS } from '../claims.ts';
import type { Residual, ResidualStatus } from './run.ts';
import type { CompareSetup } from './setup.ts';
import type { CompareSpec, Observation, Tolerance } from './types.ts';

/**
 * 値。比べない観測値の value は型より広く、入れ子の配列・オブジェクト・文字列と、読めなかった要素の null を持つ。
 * null は「—」、入れ子は [ ]・{ } で囲む（一番外は囲まない）
 */
function fmtValue(v: unknown): string {
  if (v === null) return '—';
  if (typeof v === 'number') return fmtNumber(v);
  if (Array.isArray(v)) return v.map(fmtNested).join(', ');
  if (typeof v === 'object')
    return Object.entries(v)
      .map(([k, x]) => `${k}: ${fmtNested(x)}`)
      .join('; ');
  return String(v);
}

function fmtNested(v: unknown): string {
  if (Array.isArray(v)) return `[${fmtValue(v)}]`;
  if (v !== null && typeof v === 'object') return `{${fmtValue(v)}}`;
  return fmtValue(v);
}

function fmtNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function fmtDiff(r: Residual): string {
  const tol = r.observation.compare!.tolerance;
  if (r.diff === null) return '—';
  if (!Number.isFinite(r.diff)) return '長さが違う';
  if ('rel' in tol) return `${r.diff >= 0 ? '+' : ''}${(r.diff * 100).toFixed(2)}%`;
  return `${r.diff >= 0 ? '+' : ''}${fmtNumber(Math.round(r.diff * 1000) / 1000)}`;
}

function fmtTolerance(t: Tolerance): string {
  return 'rel' in t ? `±${(t.rel * 100).toFixed(2).replace(/\.?0+$/, '')}%` : `±${fmtNumber(t.abs)}`;
}

/** 引数と、手入力でない条件（自動の条件・中遠・近・遠の固定など） */
function fmtArgs(args: CompareSpec['args'], setup?: CompareSetup): string {
  const entries: [string, unknown][] = Object.entries(args);
  if (setup?.condition === 'auto') entries.push(['condition', 'auto']);
  if (setup?.midFarLanding !== undefined) entries.push(['midFar', setup.midFarLanding]);
  if (setup?.nearLanding !== undefined) entries.push(['near', setup.nearLanding.join('・')]);
  if (setup?.farLanding !== undefined) entries.push(['far', setup.farLanding.join('・')]);
  if (setup?.manualBursts !== undefined) entries.push(['manualBursts', setup.manualBursts]);
  if (setup?.noBurstSlots !== undefined) entries.push(['noBurstSlots', setup.noBurstSlots.join('・')]);
  if (setup?.noFireSlots !== undefined) entries.push(['noFireSlots', setup.noFireSlots.join('・')]);
  for (const h of setup?.holdFire ?? []) entries.push([`holdFire[${h.slot}]`, h.frames]);
  for (const d of setup?.burstDelays ?? []) {
    const r = d.row;
    const row =
      r === null
        ? '行なし'
        : `hit ${r.hitFrames}・effect ${r.effectFrames}${r.origin === 'activation' ? '（本当の発動から）' : ''}`;
    entries.push([`burstDelays[${d.rid}${d.treasure === true ? '・宝物' : ''}]`, row]);
  }
  return entries.length === 0 ? '' : `（${entries.map(([k, v]) => `${k}=${String(v)}`).join('、')}）`;
}

const STATUS_JA: Record<ResidualStatus, string> = {
  ok: '許容内',
  outside: '**許容外**',
  error: '**比べられない**',
  invalid: '失効',
};

/** 実測の値（単位と幅があれば添える） */
function fmtObserved(o: Observation): string {
  const unit = o.unit === undefined ? '' : ` ${o.unit}`;
  const s = o.spread;
  const spread =
    s === undefined ? '' : `（${s.kind === 'ci95' ? '95% 区間 ' : ''}${fmtNumber(s.low)}〜${fmtNumber(s.high)}）`;
  const invalid = o.invalid === undefined ? '' : `（失効: ${o.invalid.reason}）`;
  return `${fmtValue(o.value)}${unit}${spread}${invalid}`;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

const RESIDUAL_HEADER = [
  '| 観測値 | 読んだもの | 比べる値 | モデル | 実測 | 予測 | 差 | 許容 | 判定 | 結論 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];

/** 比べた観測値の表（見出しつき）。残差の一覧と records:residual が共有する */
export function renderResidualRows(
  residuals: readonly Residual[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const claimText = (id: string) => (claimsOf.get(id) ?? []).join('・') || '—';
  const lines = [...RESIDUAL_HEADER];
  for (const r of residuals) {
    const o = r.observation;
    const c = o.compare!;
    lines.push(
      `| ${[
        o.id,
        cell(o.description),
        `\`${c.metric}\`${cell(fmtArgs(c.args, c.setup))}`,
        c.model,
        cell(fmtObserved(o)),
        fmtValue(r.predicted),
        fmtDiff(r),
        fmtTolerance(c.tolerance),
        r.status === 'error' ? `${STATUS_JA.error}: ${cell(r.message ?? '')}` : STATUS_JA[r.status],
        claimText(o.id),
      ].join(' | ')} |`,
    );
  }
  return lines;
}

/** モデルと比べない観測値の表（見出しつき） */
export function renderOtherRows(
  observations: readonly Observation[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const claimText = (id: string) => (claimsOf.get(id) ?? []).join('・') || '—';
  const lines = ['| 観測値 | 使い道 | 読んだもの | 値 | 結論 |', '| --- | --- | --- | --- | --- |'];
  for (const o of observations) {
    lines.push(`| ${[o.id, o.use, cell(o.description), cell(fmtObserved(o)), claimText(o.id)].join(' | ')} |`);
  }
  return lines;
}

/**
 * 残差の一覧の本文（生成する部分）。件数（判定ごと・話題ごと）と、見る行（許容外・比べられない・失効）だけを載せる。
 * 許容内の行とモデルと比べない観測値は npm run records:residual で引く（plan/design-workflow-simplification-3.md 2 節）。
 * topicOf は検証記録 ID → 話題（観測値の source で引く。無ければ「—」）
 */
export function renderResiduals(
  residuals: readonly Residual[],
  observations: readonly Observation[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
  topicOf: ReadonlyMap<string, string> = new Map(),
): string {
  const count = (rs: readonly Residual[], s: ResidualStatus) => rs.filter((r) => r.status === s).length;
  const invalid = count(residuals, 'invalid') > 0 ? `・失効 ${count(residuals, 'invalid')}` : '';
  const others = observations.filter((o) => o.use !== 'compare');
  const lines = [
    `比べた観測値 ${residuals.length} 件: 許容内 ${count(residuals, 'ok')}・許容外 ${count(residuals, 'outside')}・比べられない ${count(residuals, 'error')}${invalid}。モデルと比べない観測値 ${others.length} 件。`,
    '',
    '| 話題 | 許容内 | 許容外 | 比べられない | 失効 |',
    '| --- | --- | --- | --- | --- |',
  ];
  const byTopic = new Map<string, Residual[]>();
  for (const r of residuals) {
    const t = topicOf.get(r.observation.source) ?? 'ほか（verification.md など）';
    byTopic.set(t, [...(byTopic.get(t) ?? []), r]);
  }
  const order = (t: string) => {
    const i = (CLAIM_TOPICS as readonly string[]).indexOf(t);
    return i < 0 ? CLAIM_TOPICS.length : i;
  };
  for (const [t, rs] of [...byTopic].sort(([a], [b]) => order(a) - order(b))) {
    lines.push(
      `| ${[t, count(rs, 'ok'), count(rs, 'outside'), count(rs, 'error'), count(rs, 'invalid')].join(' | ')} |`,
    );
  }
  const attention = residuals.filter((r) => r.status !== 'ok');
  lines.push('', `### 見る行（許容外・比べられない・失効。${attention.length} 件）`, '');
  lines.push(...renderResidualRows(attention, claimsOf));
  return lines.join('\n');
}
