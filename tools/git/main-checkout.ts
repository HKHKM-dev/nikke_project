// メインのチェックアウト（git worktree list の先頭）。private/・scratch/ はここにだけある（追跡しない。AGENTS.md「記録の置き場所」）。
// tools/drive/sync.ts と tools/builds/dirs.ts から使う。
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

/** メインのチェックアウトのパス。git が答えなければこのチェックアウト */
export function mainCheckout(): string {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return /^worktree (.+)$/m.exec(r.stdout ?? '')?.[1] ?? ROOT;
}
