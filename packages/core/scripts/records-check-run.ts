// npm run records:check の本体。生成物を作り直して検査し、終わりに（途中で落ちても）書き換えた生成物を HEAD の版へ戻す
// （回す前から書き換わっていたものは除く。generated.ts）。--keep-generated で残す（records:minimal は中身を見るために残す）。戻す生成物は整えない。
//   npm run records:check [-- --keep-generated]
import { spawnSync } from 'node:child_process';
import { dirtyGenerated, restoreGenerated } from './generated.ts';
import { ROOT } from './records-data.ts';
import { cliArgs } from './cli.ts';

const { values } = cliArgs(import.meta.url, { options: { 'keep-generated': { type: 'boolean', default: false } } });
const keep = values['keep-generated'];
// 回す前から書き換わっていた生成物（手で回した records:minimal の結果など）は戻さない
const dirtyAtStart = dirtyGenerated();
/**
 * 手書きのファイル（予測の表・結論の印の付け替えを records:check が書き込む。予測・観測値は、手で書いた JSON の書式で pr:prep の確かめが
 * 落ちないように整える。plan/design-workflow-simplification-15.md 8 節）
 */
const HAND = [
  'records/claims',
  'records/backlog',
  'records/verifications',
  'records/recordings',
  'records/predictions',
  'records/observations',
];
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
if (!keep && !restoreGenerated(dirtyAtStart) && status === 0) status = 1;
process.exit(status);
