// 番号の振り直し（plan/design-investigation-review.md 4.3・5 節）。
//   npm run records:renumber -- <古い ID> <新しい ID> [--dry-run]
// 検証記録（V-NNNN）・結論（C-NNNN）・観測値（<録画>-NN）の番号を、ファイル名と、作業ツリーの文書・データ・コードの中の参照ごと
// 置き換える（追跡しているファイルと、まだ追跡していない無視されないファイル）。
// - 検証記録は records/verifications/V-NNNN-<短い名前>.md と records/predictions/V-NNNN.json を、結論は records/claims/C-NNNN.json を
//   移す（追跡しているものは git mv）。観測値は records/observations/<録画>.json の中の id を書き換える（同じ録画の中だけ）。
// - 新しい ID は、手元に無く、どのブランチ（手元か origin。main を含む）も足したことが無く、どのファイルにも出てこない（範囲の
//   書き方の中も含む）ものに限る。
// - 観測値の範囲（「`<録画>-NN`〜`<録画>-MM`」。根拠の書き方）に古い ID が入っていれば、展開して置き換え、まとめ直す。V・C の範囲の
//   書き方（「C-NNNN〜C-MMMM」）と、バッククォートの無い観測値の範囲は、ID だけ置き換えて場所を出す（人が直す）。
// - リベース・マージの途中では動かない（main と自分のブランチが同じ番号を足していると、どちらの参照か見分けられない）。リベースを
//   中止し（git rebase --abort）、自分のブランチで振り直してから取り込み直す。
// - 録画の番号は扱わない（E: の動画のファイル名も変わる。plan/backlog.md 5-4）。
// 振り直した後は npm run records:check（生成物を作り直して検査する）。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { mentions, renumberInText, renumberKind, renumberProblems } from '../src/records/renumber.ts';
import { ROOT, idsInBranches, observationIdsInBranches } from './records-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
});

const USAGE = 'usage: npm run records:renumber -- <古い ID> <新しい ID> [--dry-run]（V-NNNN・C-NNNN・<録画>-NN）';

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

const git = (args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const [oldId, newId] = positionals;
if (oldId === undefined || newId === undefined || positionals.length !== 2) fail('古い ID と新しい ID が要る');
const problems = renumberProblems(oldId, newId);
if (problems.length > 0) fail(problems.join('\n'));
const kind = renumberKind(oldId)!;
const dryRun = values['dry-run'];

for (const p of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD']) {
  if (existsSync(resolve(ROOT, git(['rev-parse', '--git-path', p]).trim())))
    fail(
      'リベースかマージの途中なので振り直さない（main と自分のブランチが同じ番号を足していると、どちらの参照か見分けられない）。' +
        'git rebase --abort などで中止し、自分のブランチで振り直してから取り込み直す',
    );
}

// ---- 古い ID のファイルと、新しい ID が空いているかの確かめ ----

/** 移すファイル（ROOT からの相対） */
const moves: { from: string; to: string }[] = [];
const VERIFICATIONS = 'records/verifications/';
const PREDICTIONS = 'records/predictions/';
const CLAIMS = 'records/claims/';

if (kind === 'verification') {
  const names = readdirSync(`${ROOT}${VERIFICATIONS}`);
  const own = names.filter((n) => n.startsWith(`${oldId}-`) && n.endsWith('.md'));
  if (own.length === 0) fail(`${oldId} の検証記録が無い`);
  if (own.length > 1)
    fail(`${oldId} の検証記録が ${own.length} つある（${own.join('・')}）。どちらの参照か見分けられない`);
  if (names.some((n) => n.startsWith(`${newId}-`))) fail(`${newId} の検証記録が既にある`);
  moves.push({ from: `${VERIFICATIONS}${own[0]}`, to: `${VERIFICATIONS}${newId}${own[0]!.slice(oldId.length)}` });
  if (existsSync(`${ROOT}${PREDICTIONS}${newId}.json`)) fail(`${PREDICTIONS}${newId}.json が既にある`);
  if (existsSync(`${ROOT}${PREDICTIONS}${oldId}.json`))
    moves.push({ from: `${PREDICTIONS}${oldId}.json`, to: `${PREDICTIONS}${newId}.json` });
} else if (kind === 'claim') {
  if (!existsSync(`${ROOT}${CLAIMS}${oldId}.json`)) fail(`${CLAIMS}${oldId}.json が無い`);
  if (existsSync(`${ROOT}${CLAIMS}${newId}.json`)) fail(`${CLAIMS}${newId}.json が既にある`);
  moves.push({ from: `${CLAIMS}${oldId}.json`, to: `${CLAIMS}${newId}.json` });
} else {
  const recording = oldId.replace(/-\d+$/, '');
  const path = `${ROOT}records/observations/${recording}.json`;
  if (!existsSync(path)) fail(`records/observations/${recording}.json が無い`);
  const ids = (JSON.parse(readFileSync(path, 'utf8')) as { id: string }[]).map((o) => o.id);
  const count = ids.filter((id) => id === oldId).length;
  if (count === 0) fail(`観測値 ${oldId} が無い`);
  if (count > 1) fail(`観測値 ${oldId} が ${count} つある。どちらの参照か見分けられない`);
  if (ids.includes(newId)) fail(`観測値 ${newId} が既にある`);
}

const branches = kind === 'observation' ? observationIdsInBranches(oldId.replace(/-\d+$/, '')) : idsInBranches();
if (branches.note !== '') console.error(`注意: ${branches.note}`);
if (branches.ids.includes(newId)) fail(`${newId} はどれかのブランチ（手元か origin。main を含む）が足したことがある`);

const TEXT = /\.(md|json|ts|tsx|mts|cts|js|mjs|cjs|ya?ml|txt|csv|html|css)$/;
const files = [
  ...new Set(
    git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter((p) => TEXT.test(p) && !p.endsWith('package-lock.json') && existsSync(`${ROOT}${p}`)),
  ),
].sort();

const mentioned = files.filter((p) => mentions(readFileSync(`${ROOT}${p}`, 'utf8'), newId) > 0);
if (mentioned.length > 0)
  fail(
    `${newId} はもう文書かデータに出てくる（範囲の書き方の中を含む）。置き換えると参照が混ざる:\n` +
      mentioned.map((p) => `  ${p}`).join('\n'),
  );

// ---- 置き換え ----

const changed: { path: string; count: number }[] = [];
const ranges: string[] = [];
for (const p of files) {
  const text = readFileSync(`${ROOT}${p}`, 'utf8');
  const r = renumberInText(text, oldId, newId);
  for (const x of r.ranges) ranges.push(`  ${p}:${x.line}: ${x.range}`);
  if (r.count === 0) continue;
  changed.push({ path: p, count: r.count });
  if (!dryRun) writeFileSync(`${ROOT}${p}`, r.text);
}
if (!dryRun) {
  const tracked = new Set(
    git(['ls-files', '-z', '--', ...moves.map((m) => m.from)])
      .split('\0')
      .filter((p) => p !== ''),
  );
  for (const m of moves) {
    if (tracked.has(m.from)) git(['mv', m.from, m.to]);
    else renameSync(`${ROOT}${m.from}`, `${ROOT}${m.to}`);
  }
  const format = changed.map((c) => moves.find((m) => m.from === c.path)?.to ?? c.path);
  if (format.length > 0)
    spawnSync(process.execPath, [`${ROOT}tools/format-retry.ts`, ...format], { cwd: ROOT, stdio: 'ignore' });
}

// ---- 報告 ----

console.log(`${oldId} → ${newId}${dryRun ? '（--dry-run。書き換えていない）' : ''}`);
for (const m of moves) console.log(`移す: ${m.from} → ${m.to}`);
const total = changed.reduce((s, c) => s + c.count, 0);
console.log(`置き換え: ${total} か所（${changed.length} ファイル）`);
for (const c of changed) console.log(`  ${c.path}（${c.count}）`);
if (ranges.length > 0) {
  console.log('範囲の書き方の中にある（ID だけ置き換えた。範囲は人が直す）:');
  for (const r of ranges) console.log(r);
}
if (changed.some((c) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(c.path)))
  console.log('コードの中も置き換えた。テストが例として使っている ID なら戻す（npm test で確かめる）');
if (!dryRun) console.log('次に npm run records:check（生成物を作り直して検査する）');
