// 生成物（records-data.ts の GENERATED_PATHS）を HEAD の版へ戻す（plan/design-workflow-simplification-15.md 4 節）。生成物は PR に
// 入れないので、残すとコミットしていない変更として検査に止められる。records:check・records:close が終わりに呼ぶ
import { spawnSync } from 'node:child_process';
import { GENERATED_PATHS, ROOT } from './records-data.ts';

/** 書き換わった生成物を HEAD の版へ戻す。失敗したら誤りを出して false */
export function restoreGenerated(): boolean {
  const git = (args: readonly string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  const diff = git(['diff', '--name-only', 'HEAD', '--', ...GENERATED_PATHS]);
  const changed = diff.stdout.split('\n').filter((p) => p !== '');
  const restored = diff.status === 0 && changed.length > 0 ? git(['checkout', 'HEAD', '--', ...changed]) : diff;
  if (restored.status !== 0) {
    console.error(`生成物を HEAD の版に戻せなかった: ${restored.stderr.trim()}`);
    return false;
  }
  if (changed.length > 0)
    console.log(
      `生成物 ${changed.length} 件を HEAD の版に戻した（PR に入れないため。中身を見るなら --keep-generated か npm run records:minimal）`,
    );
  return true;
}
