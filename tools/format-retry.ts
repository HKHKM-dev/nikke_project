// prettier --write を、失敗したら 1 秒おいて 3 回まで繰り返す。
//   node tools/format-retry.ts <ファイルやフォルダ>...
//
// Windows では、書いた直後のファイルを別のプロセス（ウイルス対策・索引など）が一時的に開いていて、prettier が
// 「UNKNOWN: unknown error, open」で書けないことがある。records:check などは生成物を書いてから prettier で整えるので、
// そこで止まると整形されていない生成物が残る（2026-10-07 に何度か起きた）。そのための繰り返し。
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const prettier = createRequire(import.meta.url).resolve('prettier/bin/prettier.cjs');
const args = process.argv.slice(2);
const attempts = 3;

for (let attempt = 1; ; attempt++) {
  const result = spawnSync(process.execPath, [prettier, '--write', ...args], { stdio: 'inherit' });
  if (result.status === 0) process.exit(0);
  if (attempt >= attempts) process.exit(result.status ?? 1);
  console.error(`prettier が失敗した（${attempt} 回目）。1 秒おいて繰り返す`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}
