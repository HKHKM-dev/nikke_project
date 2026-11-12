// スキル定義の読み込みの検査のうち、共通の読み込みの部品（JSON の形・ref・数・状態の id・維持の秒数）。型は ../types.ts
import { C_ID } from '../../records/ids.ts';
import type { LocalizedText } from '../../types.ts';
import { NAMED_STATE_IDS, namedStateHolder, type NamedStateId, type StateHolder } from '../states.ts';

export type Json = unknown;

export function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function fail(path: string, message: string): never {
  throw new Error(`skill definition: ${path}: ${message}`);
}

export function oneOf<T extends string>(allowed: readonly T[], value: Json, path: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  fail(path, `expected one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
}

export function parseLocalizedText(v: Json, path: string): LocalizedText {
  if (!isRecord(v) || typeof v.ja !== 'string' || typeof v.en !== 'string') {
    fail(path, 'expected { ja: string, en: string }');
  }
  return { ja: v.ja, en: v.en };
}

export function parseClaimRefs(v: Json, path: string): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of claim IDs');
  return v.map((id, i) => {
    if (typeof id !== 'string' || !C_ID.test(id))
      fail(`${path}[${i}]`, `expected C-<4+ digits>, got ${JSON.stringify(id)}`);
    if (v.indexOf(id) !== i) fail(`${path}[${i}]`, `duplicate claim ID ${id}`);
    return id;
  });
}

/**
 * 名前の付いた状態の語彙編（plan/design-named-state.md 5.6 節）: 目録の id で、持ち主の側が holder のもの。味方の状態を敵の条件で
 * 見る、のような取り違えを落とす
 */
export function parseNamedStateId(v: Json, path: string, holder: StateHolder): NamedStateId {
  const id = oneOf(NAMED_STATE_IDS, v, path);
  if (namedStateHolder(id) !== holder) {
    fail(path, `"${id}" is a state held by the ${namedStateHolder(id)}, not by the ${holder}`);
  }
  return id;
}

export function parseNonNegativeInt(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    fail(path, `expected a non-negative integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

export function parsePositiveInt(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

export function parseDuration(
  v: Record<string, Json>,
  path: string,
): { durationRef?: number; durationSeconds?: number } {
  const hasRef = v.durationRef !== undefined;
  const hasSeconds = v.durationSeconds !== undefined;
  if (hasRef === hasSeconds) {
    fail(path, 'exactly one of durationRef and durationSeconds is required');
  }
  if (hasRef) return { durationRef: parseRef(v.durationRef, `${path}.durationRef`) };
  const seconds = v.durationSeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    fail(`${path}.durationSeconds`, `expected a non-negative finite number, got ${JSON.stringify(seconds)}`);
  }
  return { durationSeconds: seconds };
}

/**
 * V-0030: 段のゲージのヒットの遅れ（minDelay 以上の整数・昇順・1 つ以上）。段は射撃と同じフレームのゲージを足し終えた後に数えるので
 * 1 以上。damage の gaugeHits は射撃と同じフレームのゲージに足せるので 0 から（V-0035 のモダニア）
 */
export function parseGaugeHits(v: Json, path: string, minDelay: 0 | 1): number[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, 'expected a non-empty array of frame delays');
  return v.map((d, i) => {
    if (typeof d !== 'number' || !Number.isInteger(d) || d < minDelay) {
      fail(`${path}[${i}]`, minDelay === 1 ? 'expected a positive integer' : 'expected a non-negative integer');
    }
    const prev = v[i - 1];
    if (i > 0 && typeof prev === 'number' && d < prev) fail(`${path}[${i}]`, 'delays must be ascending');
    return d;
  });
}

/** 2 段目の段 19 の PR 1: durationUntil の 1 つの欄のオブジェクト（{ counterEmpty }・{ stateEnd }）の値。ほかの形なら expected で落とす */
export function objectUntil(u: Json, field: string, path: string, expected: string): Json {
  if (!isRecord(u)) fail(path, expected);
  rejectUnknownKeys(u, [field], path);
  return u[field];
}

export function parseRef(v: Json, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    fail(path, `expected a positive integer, got ${JSON.stringify(v)}`);
  }
  return v;
}

/**
 * 書ける欄の一覧に無い欄を落とす（plan/design-split-long-functions.md 3.2 節）。欄は Object.keys の順に見る。message は落とすときの文
 */
export function rejectUnknownKeys(
  v: Record<string, Json>,
  allowed: readonly string[],
  path: string,
  message = 'unknown field',
): void {
  for (const key of Object.keys(v)) if (!allowed.includes(key)) fail(`${path}.${key}`, message);
}

/** true だけを書ける欄。ほかの値なら「expected true, got …」で落とす */
export function parseTrue(v: Json, path: string): true {
  if (v !== true) fail(path, `expected true, got ${JSON.stringify(v)}`);
  return true;
}

/** 効果の assumes（いつも満たすとみなした条件）。書いてあれば読んで effect に足す */
export function parseAssumes(v: Record<string, Json>, effect: { assumes?: LocalizedText }, path: string): void {
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
}

/** 正の有限の数。ほかの値なら「expected a positive finite number, got …」で落とす */
export function assertPositiveFinite(v: Json, path: string): asserts v is number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    fail(path, `expected a positive finite number, got ${JSON.stringify(v)}`);
  }
}
