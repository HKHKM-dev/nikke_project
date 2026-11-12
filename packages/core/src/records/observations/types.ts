// 観測値（リポジトリの直下の records/observations/<録画 id>.json）の型と語彙（plan/design-stage19.md 2.3 節、plan/design-records-automation.md 3.4 節）
import type { CompareSetup } from './setup.ts';

/** 何を読んだか（人と検索のため）。Stage 20-E: 大きさ（照準円の半径など）・位置（着地点の y など）・ゲージを足した */
export const OBSERVATION_KINDS = [
  'hit',
  'interval',
  'count',
  'timing',
  'total',
  'rate',
  'size',
  'position',
  'gauge',
] as const;

export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** 観測値の使い道 */
export const OBSERVATION_USES = ['compare', 'input', 'record'] as const;

export type ObservationUse = (typeof OBSERVATION_USES)[number];

export type Tolerance = { rel: number } | { abs: number };

export type CompareSpec = {
  /**
   * モデル。"sim" だけ。ほかの値（古い "calc" など）は検査で落とす（plan/design-unify-sim-calc.md 8 節）
   */
  model: 'sim';
  metric: string;
  args: Record<string, number | string | boolean>;
  tolerance: Tolerance;
  setup: CompareSetup;
};

/** 値の幅（Stage 20-E）。range は最小〜最大、ci95 は 95% 区間 */
export type ObservationSpread = { kind: 'range' | 'ci95'; low: number; high: number };

export type Observation = {
  id: string;
  /** 置き場所の録画（recordings があれば、その中で最も若い番号） */
  recording: string;
  /** 複数の録画にまたがる値のとき、その録画の全部（recording も含める）。compare には使わない（Stage 20-E） */
  recordings?: string[];
  kind: ObservationKind;
  use: ObservationUse;
  value: number | number[];
  /** 値の単位（px・f・%・倍 など。Stage 20-E） */
  unit?: string;
  /** 値の幅（Stage 20-E） */
  spread?: ObservationSpread;
  /** 何の値か（1〜2 文） */
  description: string;
  /** 値を記録した場所。検証記録から作ったものは、その ID（V-NNNN）だけを書く（Stage 20-D） */
  source: string;
  method?: { tool?: string; note?: string };
  evidence?: string[];
  compare?: CompareSpec;
  /** 読み取った日（YYYY-MM-DD。Stage 20-E） */
  readAt?: string;
  /** 使えなくなった観測値（読み違い・条件の誤り・ゲームの更新など）。消さずに付け、照合から外す（Stage 20-E） */
  invalid?: { reason: string; date: string };
  /** 最小構成の検査編: 観測量の範囲（plan/design-minimal-relevance.md 3.1 節） */
  scope?: ObservationScope;
};

/**
 * 観測量の出どころ（plan/design-minimal-relevance.md 3.1 節）。normal = 通常攻撃のヒット、skill = 倍率ダメージ・追加ダメージ、
 * burst = バーストのヒット、dot = 持続ダメージ、gauge = ゲージ、burstChain = バーストの段・CT、clock = 時計・止まり、
 * target = 的の動き・大きさ、firing = 射撃の刻み・リロード
 */
export const OBSERVATION_SOURCES = [
  'normal',
  'skill',
  'burst',
  'dot',
  'gauge',
  'burstChain',
  'clock',
  'target',
  'firing',
] as const;

export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

/**
 * 観測量の範囲。slot はどの枠のものか（1 始まり。複数なら配列、編成の全体なら 'all'）。frames は読んだ範囲（動画のフレーム。省略可）で、
 * 人が読む範囲の記録（未確定の要素の判定には使わない。同 4.1 節の 6c）
 */
export type ObservationScope = {
  slot: number | number[] | 'all';
  source: ObservationSource;
  frames?: [number, number];
};

/** 失効した観測値 → 失効の理由（Stage 20-E） */
export function invalidReasonsOf(observations: readonly Observation[]): Map<string, string> {
  return new Map(observations.flatMap((o) => (o.invalid ? [[o.id, o.invalid.reason] as const] : [])));
}
