// 生成物（records-data.ts の GENERATED_PATHS）を HEAD の版へ戻す（plan/design-workflow-simplification-15.md 4 節）。生成物は PR に
// 入れないので、残すとコミットしていない変更として検査に止められる。records:check・records:close が終わりに呼ぶ
import { spawnSync } from 'node:child_process';
import { GENERATED_PATHS, ROOT } from './records-data.ts';

const git = (args: readonly string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** HEAD から書き換わっている生成物 */
export function dirtyGenerated(): Set<string> {
  const diff = git(['diff', '-z', '--name-only', 'HEAD', '--', ...GENERATED_PATHS]);
  return new Set(diff.status === 0 ? diff.stdout.split('\0').filter((p) => p !== '') : []);
}

/** 書き換わった生成物を HEAD の版へ戻す（keep は戻さない。回す前から書き換わっていたもの）。失敗したら誤りを出して false */
export function restoreGenerated(keep: ReadonlySet<string> = new Set()): boolean {
  const changed = [...dirtyGenerated()].filter((p) => !keep.has(p));
  if (changed.length === 0) return true;
  const restored = git(['checkout', 'HEAD', '--', ...changed]);
  if (restored.status !== 0) {
    console.error(`生成物を HEAD の版に戻せなかった: ${restored.stderr.trim()}`);
    return false;
  }
  console.log(
    `生成物 ${changed.length} 件を HEAD の版に戻した（PR に入れないため。中身を見るなら --keep-generated か npm run records:minimal）`,
  );
  return true;
}
