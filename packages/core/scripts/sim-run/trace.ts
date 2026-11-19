// sim-run.ts の --trace: 出来事の列を 1 行ずつの文にする（plan/design-workflow-simplification-15.md 6 節）
import type { SimEvent } from '../../src/sim/engine.ts';
import { framesToGameSeconds } from '../../src/time.ts';
import { effectValueText, itemLabel } from './labels.ts';

/** --trace の種類 */
export const TRACE_KINDS = ['shots', 'bursts', 'buffs', 'hits', 'instants'] as const;

type TraceKind = (typeof TRACE_KINDS)[number];

/** 出来事の種類 → --trace の種類（即時効果の種類は instants） */
export function traceKindOf(e: SimEvent): TraceKind {
  switch (e.kind) {
    case 'trigger':
      return 'shots';
    case 'burst':
    case 'fullBurstStart':
    case 'fullBurstEnd':
    case 'gaugeFull':
    case 'chainTimeout':
      return 'bursts';
    case 'buffStart':
    case 'buffEnd':
      return 'buffs';
    case 'skillHit':
      return 'hits';
    default:
      return 'instants';
  }
}

/** 出来事の 1 行の中身（shot は枠ごとの発の番号） */
export function traceText(e: SimEvent, shot: number): string {
  const amount = (n: number) => Math.round(n).toLocaleString('en-US');
  switch (e.kind) {
    case 'trigger':
      return `枠${e.slot + 1} 発 ${shot}${e.fullBurst ? '（FB）' : ''} ${amount(e.damage)}`;
    case 'burst':
      return `枠${e.slot + 1} バースト ${e.step} ${amount(e.damage)}`;
    case 'fullBurstStart':
    case 'fullBurstEnd':
    case 'gaugeFull':
    case 'chainTimeout':
      return e.kind;
    case 'buffStart':
    case 'buffEnd':
      return `枠${e.slot + 1} ${e.kind === 'buffStart' ? '付く' : '切れる'} ${itemLabel(e.effect)} ${effectValueText(e.effect)}`;
    case 'skillHit':
      return `枠${e.slot + 1} 倍率ダメージ ${amount(e.damage)}`;
    default:
      return `枠${e.slot + 1} ${e.kind} ${e.amount}（出どころ 枠${e.source + 1}）`;
  }
}

/** --trace の値（種類をカンマ区切り。all は全部）を、出す種類と、知らない種類に分ける */
export function parseTraceKinds(kinds: string): { wanted: ReadonlySet<string>; unknown: string[] } {
  const known: readonly string[] = TRACE_KINDS;
  const wanted = new Set(
    kinds
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k !== ''),
  );
  return { wanted, unknown: [...wanted].filter((k) => k !== 'all' && !known.includes(k)) };
}

/**
 * 出来事の列の、種類が wanted で、フレームが start 以上 end 未満の行。枠は 1 始まり。発の番号は枠ごとに 1 始まりで、範囲の外の発も
 * 数える（観測値の hitDamageAtShot の shot と同じ数え方）
 */
export function traceLines(
  events: readonly SimEvent[],
  wanted: ReadonlySet<string>,
  start: number,
  end: number,
): string[] {
  const shotNo = new Map<number, number>();
  const rows: string[] = [];
  for (const e of events) {
    const shot = e.kind === 'trigger' ? (shotNo.get(e.slot) ?? 0) + 1 : 0;
    if (e.kind === 'trigger') shotNo.set(e.slot, shot);
    if (!(wanted.has('all') || wanted.has(traceKindOf(e))) || e.frame < start || e.frame >= end) continue;
    rows.push(`f${e.frame} ${framesToGameSeconds(e.frame).toFixed(2)}s ${traceText(e, shot)}`);
  }
  return rows;
}
