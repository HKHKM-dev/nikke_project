// クラウドのセッションの始めに npm ci を回すかの決まりごと（plan/design-workflow-simplification.md 5 節）。
// package-lock.json の sha256 を node_modules/.npm-ci.sha256 に控え、同じなら回さない。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MARKER = 'node_modules/.npm-ci.sha256';

export type Outcome = 'skipped' | 'installed' | 'failed' | 'no-lockfile';

/** lockfile の sha256。lockfile が無ければ null */
export function lockHash(repo: string): string | null {
  const lock = join(repo, 'package-lock.json');
  if (!existsSync(lock)) return null;
  return createHash('sha256').update(readFileSync(lock)).digest('hex');
}

function savedHash(repo: string): string | null {
  try {
    return readFileSync(join(repo, MARKER), 'utf8').trim();
  } catch {
    return null;
  }
}

/** 控えが lockfile と違うか無ければ install を回し、通ったら控えを書く。install は通ったら true を返す */
export function ensureInstalled(repo: string, install: () => boolean): Outcome {
  const hash = lockHash(repo);
  if (hash === null) return 'no-lockfile';
  if (savedHash(repo) === hash) return 'skipped';
  // 先に古い控えを消す。install が途中で落ちたら、次の始めに回し直す
  rmSync(join(repo, MARKER), { force: true });
  if (!install()) return 'failed';
  writeFileSync(join(repo, MARKER), `${hash}\n`);
  return 'installed';
}
