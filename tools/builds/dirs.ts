// 育成データの置き場所（plan/design-build-snapshot.md 5 節）。store.ts・fetch.ts・tools/captures/intake.ts から使う。
// private/ はメインのチェックアウトの直下にだけある（追跡しない。クラウドでは始めのフックがリポジトリの直下に置く）。
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SNAPSHOT_NAME } from '../../packages/core/src/records/ids.ts';

const ROOT = join(import.meta.dirname, '../..');

/** メインのチェックアウト（git worktree list の先頭） */
function mainCheckout(): string {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return /^worktree (.+)$/m.exec(r.stdout ?? '')?.[1] ?? ROOT;
}
export const PRIVATE = join(mainCheckout(), 'private');
export const BUILDS_DIR = join(PRIVATE, 'builds');

/** 写したスナップショット（private/builds/<名前>.json）の名前。private/builds/ が無ければ null */
export function snapshotNames(): string[] | null {
  if (!existsSync(BUILDS_DIR)) return null;
  return readdirSync(BUILDS_DIR)
    .map((f) => f.replace(/\.json$/, ''))
    .filter((n) => SNAPSHOT_NAME.test(n));
}
