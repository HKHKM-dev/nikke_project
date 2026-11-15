// records:check・records:close が書き換えた生成物（records-data.ts の GENERATED_PATHS）を、終わりに HEAD の版へ戻す
// （plan/design-workflow-simplification-15.md 4 節）。生成物は PR に入れないので、残すとコミットしていない変更として検査に止められる。
//   node packages/core/scripts/records-restore-generated.ts [--keep-generated]
// --keep-generated か、環境変数 RECORDS_KEEP_GENERATED=1（records:minimal が records:check に渡す）のときは戻さない。
import { spawnSync } from 'node:child_process';
import { GENERATED_PATHS, ROOT } from './records-data.ts';

if (process.argv.includes('--keep-generated') || process.env['RECORDS_KEEP_GENERATED'] === '1') process.exit(0);
const git = (args: readonly string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const diff = git(['diff', '--name-only', 'HEAD', '--', ...GENERATED_PATHS]);
if (diff.status !== 0) {
  console.error(`生成物の差分を読めなかった: ${diff.stderr.trim()}`);
  process.exit(1);
}
const changed = diff.stdout.split('\n').filter((p) => p !== '');
if (changed.length === 0) process.exit(0);
const restored = git(['checkout', 'HEAD', '--', ...changed]);
if (restored.status !== 0) {
  console.error(`生成物を戻せなかった: ${restored.stderr.trim()}`);
  process.exit(1);
}
console.log(
  `生成物 ${changed.length} 件を HEAD の版に戻した（PR に入れないため。中身を見るなら --keep-generated か npm run records:minimal）`,
);
