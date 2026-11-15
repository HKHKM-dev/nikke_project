// npm run records:check の本体。生成物を作り直して検査し、終わりに（途中で落ちても）書き換えた生成物を HEAD の版へ戻す
// （generated.ts）。--keep-generated で残す（records:minimal は中身を見るために残す）。戻す生成物は整えない。
//   npm run records:check [-- --keep-generated]
import { spawnSync } from 'node:child_process';
import { restoreGenerated } from './generated.ts';
import { ROOT } from './records-data.ts';

const keep = process.argv.includes('--keep-generated');
/** 手書きのファイル（予測の表・結論の印の付け替えを records:check が書き込む） */
const HAND = ['records/claims', 'records/backlog', 'records/verifications', 'records/recordings'];
/** prettier で整える生成物 */
const GENERATED = [
  'plan/claims.md',
  'plan/verifications.md',
  'plan/skills.md',
  'plan/minimal.md',
  'plan/backlog.md',
  'records/minimal',
];
const STEPS: readonly (readonly string[])[] = [
  ['packages/core/scripts/records-table.ts'],
  ['packages/core/scripts/skill-catalog.ts'],
  ['packages/core/scripts/records-check.ts'],
  ['tools/format-retry.ts', ...(keep ? GENERATED : []), ...HAND],
];

let status = 0;
for (const [script, ...args] of STEPS) {
  status = spawnSync(process.execPath, [`${ROOT}${script}`, ...args], { cwd: ROOT, stdio: 'inherit' }).status ?? 1;
  if (status !== 0) break;
}
if (!keep && !restoreGenerated() && status === 0) status = 1;
process.exit(status);
