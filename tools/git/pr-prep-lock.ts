// pr:prep が動いている間の印（git のディレクトリに置く）。pr:prep が置き、フック（catch-up.ts の取り込み・review-flow.ts の Stop）が
// 見る。フックは応答の終わりごとに読むので、core を読まない軽いモジュールに置く（plan/design-workflow-simplification-17.md 9 節）。
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { alive, type Lock, lockIsLive } from '../drive/sync-lib.ts';
import { parseJson } from './sync-after-merge-lib.ts';

const PR_PREP_LOCK = 'pr-prep.lock.json';

/** ファイルの中身。読めなければ null */
export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** 印を置き、プロセスの終わりに消す */
export function holdPrPrepLock(gitDir: string): void {
  const path = join(gitDir, PR_PREP_LOCK);
  writeFileSync(path, JSON.stringify({ pid: process.pid, time: Date.now() } satisfies Lock));
  process.on('exit', () => rmSync(path, { force: true }));
}

/** pr:prep が動いているか（印のプロセスが生きていて、1 時間より新しい） */
export function prPrepRunning(gitDir: string): boolean {
  return lockIsLive(parseJson<Lock>(readText(join(gitDir, PR_PREP_LOCK))), Date.now(), alive, 60 * 60 * 1000);
}
