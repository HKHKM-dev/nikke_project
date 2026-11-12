// 比べる値の語彙（plan/design-stage19.md 2.3.1 節）。テーマごとの表をつなぐ。指標を足すときは、読むモデルの出力でテーマのファイルを選ぶ
// （plan/design-observations-split.md 3.1 節）
import { skillHitsMetrics } from './skillHits.ts';
import { damageMetrics } from './damage.ts';
import { firingMetrics } from './firing.ts';
import { burstMetrics } from './burst.ts';
import { buffsMetrics } from './buffs.ts';
import type { Metric } from './context.ts';

/** 指標の名前 → 必須の引数と取り出し関数。同じ名前が 2 つのテーマにあれば読み込みで止める */
export const METRICS: Readonly<Record<string, Metric>> = joinMetrics([
  skillHitsMetrics,
  damageMetrics,
  firingMetrics,
  burstMetrics,
  buffsMetrics,
]);

function joinMetrics(parts: readonly Readonly<Record<string, Metric>>[]): Record<string, Metric> {
  const out: Record<string, Metric> = {};
  for (const part of parts)
    for (const [name, metric] of Object.entries(part)) {
      if (name in out) throw new Error(`指標 ${name} が 2 つのテーマにある`);
      out[name] = metric;
    }
  return out;
}
