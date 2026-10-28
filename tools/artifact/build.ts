// Web 版（apps/web）を、claude.ai の Artifact として出せる形に作り直す。
//   npm run artifact:build
// 1. apps/web を base "./" で vite build し、dist/artifact/ に出す（データ packages/core/data も publicDir として入る）。
// 2. index.html を、アーティファクトのページ（build-lib.ts の PAGE_FILE。中身だけで、公開のときに doctype などで包まれる）に置き換える。
// 3. 公開するファイルを 1 回の上限（255）ごとに分けた一覧を dist/artifact/publish.json に書く。
// 公開は Claude Code の Artifact の道具で行う（この道具は公開しない）: file_path にページ、root に dist/artifact、files に
// publish.json の batches の 1 回目を渡して出し、2 回目以降も同じ file_path で出す（同じ URL に files が足される）。
// 既にあるアーティファクトを作り直すときは、その URL（Artifact の list で探す）を url に渡す。直すのは本体のソースで、
// アーティファクトは確かめるための写し（アーティファクトの上の直しを本体に戻す道はない）。
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAGE_FILE, entryAssets, pageHtml, publishBatches } from './build-lib.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(ROOT, 'dist', 'artifact');

const vite = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'build', '--outDir', OUT, '--emptyOutDir'],
  {
    cwd: join(ROOT, 'apps', 'web'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, VITE_BASE_PATH: './' },
  },
);
if (vite.status !== 0) {
  console.error('artifact:build: vite build が落ちた');
  process.exit(1);
}

const indexPath = join(OUT, 'index.html');
writeFileSync(join(OUT, PAGE_FILE), pageHtml(entryAssets(readFileSync(indexPath, 'utf8'))));
rmSync(indexPath);

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}
const files = listFiles(OUT)
  .map((p) => relative(OUT, p).split(sep).join('/'))
  .filter((p) => p !== PAGE_FILE && p !== 'publish.json');
const batches = publishBatches(files);
writeFileSync(
  join(OUT, 'publish.json'),
  `${JSON.stringify({ root: OUT, page: join(OUT, PAGE_FILE), batches }, null, 2)}\n`,
);

console.log(`artifact:build: ${join(OUT, PAGE_FILE)} と ${files.length} 件のファイル（公開 ${batches.length} 回分）`);
console.log(`公開する files の一覧: ${join(OUT, 'publish.json')}`);
