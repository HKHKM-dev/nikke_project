// ShiftyPad の生データを取り込み、育成データのスナップショット・前回との差・所持の一覧を private/ に書く
// （plan/design-build-snapshot.md 2〜5・8 節。取り込みの処理は store.ts、写し方は packages/core/src/shiftypad.ts）。
//   npm run build:import -- <生の JSON>   取り込む（取るのは npm run build:fetch。fetch.ts）
//   npm run build:import -- --rebuild     private/builds/ の生のデータを全部写し直す（写し方を直したとき）
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { ShiftyPadRaw } from '../../packages/core/src/shiftypad.ts';
import { importRaw, rebuildAll } from './store.ts';

const { values, positionals } = parseArgs({
  options: { rebuild: { type: 'boolean', default: false } },
  allowPositionals: true,
});
if (values.rebuild === positionals.length > 0 || positionals.length > 1) {
  console.error('usage: npm run build:import -- <生の JSON> | --rebuild');
  process.exit(2);
}

if (values.rebuild) {
  if (!rebuildAll('npm run build:import -- --rebuild')) process.exit(1);
} else {
  const source = positionals[0]!;
  if (!existsSync(source)) {
    console.error(`${source} が無い`);
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(source, 'utf8')) as ShiftyPadRaw;
  if (typeof raw.fetchedAt !== 'string' || !Array.isArray(raw.details)) {
    console.error(`${source} は ShiftyPad の生のデータでない（fetchedAt・details が無い）`);
    process.exit(1);
  }
  importRaw(raw, 'npm run build:import');
}
