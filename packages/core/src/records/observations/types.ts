// 観測値（リポジトリの直下の records/observations/<録画 id>.json）の型と語彙（plan/design-stage19.md 2.3 節、plan/design-records-automation.md 3.4 節）
import type { CompareSetup } from './setup.ts';

/** 何を読んだか（人と検索のため）。size は大きさ（照準円の半径など）、position は位置（着地点の y など） */
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

/** 値の幅。range は最小〜最大、ci95 は 95% 区間 */
export type ObservationSpread = { kind: 'range' | 'ci95'; low: number; high: number };

/** 比べる・入力に使う観測値（use が compare・input）の値 */
export type ObservationValue = number | number[];

/** JSON の値 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 観測値。value の型は use で分かれる */
export type Observation = NumericObservation | RecordObservation;

/** モデルと比べる・モデルの入力にする観測値。value は数か数の配列（records:check が確かめる） */
export type NumericObservation = ObservationFields & { use: 'compare' | 'input'; value: ObservationValue };

/** 記録だけの観測値。value は入れ子の配列・オブジェクト・文字列と、読めなかった要素の null を持つ */
export type RecordObservation = ObservationFields & { use: 'record'; value: JsonValue };

type Draft<O> = Omit<O, 'id' | 'recording' | 'source' | 'readAt'>;

/** 観測値の下書き（id・recording・source・readAt を除いたもの。Omit を use ごとにかけ、value の型を保つ） */
export type ObservationDraft = Draft<NumericObservation> | Draft<RecordObservation>;

type ObservationFields = {
  id: string;
  /** 置き場所の録画（recordings があれば、その中で最も若い番号） */
  recording: string;
  /** 複数の録画にまたがる値のとき、その録画の全部（recording も含める）。compare には使わない */
  recordings?: string[];
  kind: ObservationKind;
  /** 値の単位（px・f・%・倍 など） */
  unit?: string;
  /** 値の幅 */
  spread?: ObservationSpread;
  /** 何の値か（1〜2 文） */
  description: string;
  /** 値を記録した場所。検証記録から作ったものは、その ID（V-NNNN）だけを書く */
  source: string;
  method?: { tool?: string; note?: string };
  evidence?: string[];
  compare?: CompareSpec;
  /** 読み取った日（YYYY-MM-DD） */
  readAt?: string;
  /** 使えなくなった観測値（読み違い・条件の誤り・ゲームの更新など）。消さずに付け、照合から外す */
  invalid?: { reason: string; date: string };
  /** 観測量の範囲（plan/design-minimal-relevance.md 3.1 節） */
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

/** 値が数の配列か */
export function isNumberArray(value: JsonValue): value is number[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'number');
}

/** 値が数か数の配列か（record の観測値の値は、そうでないことがある） */
export function isObservationValue(value: JsonValue): value is ObservationValue {
  return typeof value === 'number' || isNumberArray(value);
}

/**
 * 値が数か数の配列の観測値（compare・input と、record の一部）。record の観測値も数として読む所（予測の指標・比べる設定が ID で指す値）で
 * 絞り込む。compare・input だけを読む所は use で絞り込む
 */
export type MeasuredObservation = Observation & { value: ObservationValue };

export function isMeasured(o: Observation): o is MeasuredObservation {
  return isObservationValue(o.value);
}

/** 失効した観測値 → 失効の理由 */
export function invalidReasonsOf(observations: readonly Observation[]): Map<string, string> {
  return new Map(observations.flatMap((o) => (o.invalid ? [[o.id, o.invalid.reason] as const] : [])));
}
