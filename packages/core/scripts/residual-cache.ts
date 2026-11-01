// 観測値の予測値の覚え（plan/design-workflow-simplification-8.md 2 節）。records:check・npm test などが runObservations を回すたびに、
// 比べる観測値の全部をモデルで回し直さないよう、予測値を node_modules/.cache/residuals/ に覚える（追跡しない）。
// 覚えはモデルのコードとデータ（MODEL_ROOTS の全部のファイルの中身。テストは除く）の hash ごとに分け、
// その中で観測値ごとの鍵（records/observations.ts の predictionKey）で引く。コードかデータが 1 字でも変われば、別の覚えになる。
// NIKKE_NO_RESIDUAL_CACHE=1 で覚えを使わない（読みも書きもしない）。
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  runObservations,
  type Observation,
  type Prediction,
  type PredictionMemo,
  type RecordsData,
  type Residual,
} from '../src/records/observations.ts';
import type { RecordingEntry } from '../src/records/recordings.ts';
import { ROOT, SKILL_SUPPORT_PATH } from './records-data.ts';

export const RESIDUAL_CACHE_DIR = `${ROOT}node_modules/.cache/residuals/`;
/**
 * モデルの入力（コードとデータ）の置き場所。/ で終わるものはディレクトリ、ほかはファイル。scripts からは、どのキャラ・スキル・マスタを
 * 読むかを決める records-data.ts と、覚えを引くこれ自身（ここから import で辿れるファイルが全部入ることは residual-cache.test.ts が見る）
 */
export const MODEL_ROOTS = [
  `${ROOT}packages/core/src/`,
  `${ROOT}packages/core/data/`,
  `${ROOT}packages/core/scripts/records-data.ts`,
  `${ROOT}packages/core/scripts/residual-cache.ts`,
];
/**
 * 置き場所の中でもモデルの入力でないもの。support.json は画面だけが読む生成物で、PR の CI と pr:prep は作り直した後に main の版へ戻す
 * ので、入れると作り直しの前後で hash が変わり、覚えが外れる（plan/design-pr-conflicts.md 5 節）
 */
const NOT_MODEL = new Set([SKILL_SUPPORT_PATH]);
/** 残す覚えの数（ブランチを行き来しても使えるように、古いものから消す） */
const KEEP = 4;

/** ファイルと、ディレクトリの下の全部のファイル（__tests__ を除く）の、相対パスと中身の hash */
export function modelHash(roots: readonly string[] = MODEL_ROOTS): string {
  const hash = createHash('sha256');
  const walk = (path: string, rel: string) => {
    if (NOT_MODEL.has(path)) return;
    if (!statSync(path).isDirectory()) {
      hash.update(`${rel}\0`).update(readFileSync(path)).update('\0');
      return;
    }
    for (const name of readdirSync(path).sort()) if (name !== '__tests__') walk(join(path, name), `${rel}/${name}`);
  };
  roots.forEach((root, i) => walk(root, `${i}:`));
  return hash.digest('hex').slice(0, 32);
}

type Entries = Record<string, Prediction>;

function readEntries(path: string): Entries {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Entries;
  } catch {
    return {};
  }
}

/** 覚えを開く。save で足した分を書く（ほかのプロセスが同時に書いた分は読み直して混ぜる） */
export function openPredictionMemo(
  dir: string,
  model: string,
): PredictionMemo & { save(): void; hits: number; misses: number } {
  const path = join(dir, `${model}.json`);
  const entries = readEntries(path);
  const added: Entries = {};
  const keyOf = (key: string) => createHash('sha256').update(key).digest('base64url').slice(0, 27);
  const memo = {
    hits: 0,
    misses: 0,
    get(key: string): Prediction | undefined {
      const p = entries[keyOf(key)];
      if (p === undefined) memo.misses++;
      else memo.hits++;
      return p;
    },
    set(key: string, prediction: Prediction): void {
      const k = keyOf(key);
      entries[k] = prediction;
      added[k] = prediction;
    },
    save(): void {
      if (Object.keys(added).length === 0) return;
      mkdirSync(dir, { recursive: true });
      const merged = { ...readEntries(path), ...added };
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(merged));
      renameSync(tmp, path);
      const old = readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(KEEP);
      for (const { f } of old) rmSync(join(dir, f), { force: true });
    },
  };
  return memo;
}

/** runObservations を、覚えを使って回す（NIKKE_NO_RESIDUAL_CACHE=1 なら覚えを使わない） */
export function runObservationsCached(
  observations: readonly Observation[],
  recordings: ReadonlyMap<string, RecordingEntry>,
  data: RecordsData,
  dir: string = RESIDUAL_CACHE_DIR,
): Residual[] {
  if (process.env['NIKKE_NO_RESIDUAL_CACHE'] === '1') return runObservations(observations, recordings, data);
  const memo = openPredictionMemo(dir, modelHash());
  const residuals = runObservations(observations, recordings, data, memo);
  memo.save();
  return residuals;
}
