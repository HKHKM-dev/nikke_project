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
// - 録画（3〜4 桁の番号。L- は扱わない。plan/design-recording-renumber.md）は、records/recordings/<録画>.json と
//   records/observations/<録画>.json を移し、観測値の ID の頭（<録画>-NN）ごと置き換える。文書の中は確かさの高い形（「録画」の後の
//   番号の並び・バッククォートの番号・観測値の ID・ファイル名・records/ の JSON の文字列）だけを置き換え、同じ行に「録画」がある素の
//   番号は場所を出す（人が見る）。録画の置き場所（E:）の動画・スクショ・証拠フレーム・中間出力のキャッシュの名前も変え
//   （tools/captures/renumber-files.ts）、Drive の nikke_project_captures でも同じ名前に変え（rclone moveto。Drive の中なので上げ直さない。
//   derived は同期しないので変えない。plan/design-cloud-environment.md 4.4 節）、plan/captures/backup-log.md に段落を足す。置き場所が
//   無い環境では Rename-Item の行を、rclone の準備が無い環境では rclone moveto の行を出す（オーナーが回す）。クラウド環境では
//   Drive の名前を受け口（tools/drive/gateway.ts の move）で変える（plan/design-cloud-environment.md 6.3 節）。
// - リベース・マージの途中では動かない（main と自分のブランチが同じ番号を足していると、どちらの参照か見分けられない）。リベースを
//   中止し（git rebase --abort）、自分のブランチで振り直してから取り込み直す。
// 振り直した後は npm run records:check（生成物を作り直して検査する）。
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type ManualSpot,
  mentions,
  recordingMentions,
  renumberInText,
  renumberKind,
  renumberProblems,
  renumberRecordingInText,
} from '../src/records/renumber.ts';
import { capturesDir } from '../../../tools/captures/dirs.ts';
import { driveCaptures, driveUnavailable, lsjson, rclone } from '../../../tools/drive/rclone.ts';
import { gatewayUrl, move, snapshot } from '../../../tools/drive/gateway.ts';
import {
  classifyDriveRenames,
  type DriveRename,
  driveRenames,
  splitRel,
  topFolder,
} from '../../../tools/drive/sync-lib.ts';
import {
  applyCaptureRenames,
  type CapturePlan,
  planCaptureRenames,
  renameCommand,
  renumberedName,
} from '../../../tools/captures/renumber-files.ts';
import { RECORDING_ID } from '../src/records/ids.ts';
import { ROOT, idsInBranches, observationIdsInBranches, recordingIdsInBranches } from './records-data.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
});

const USAGE =
  'usage: npm run records:renumber -- <古い ID> <新しい ID> [--dry-run]（V-NNNN・C-NNNN・<録画>-NN・録画の番号 NNNN）\n';

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
// 録画の番号は 2026-10-25 から 4 桁だけ（plan/design-recording-id-4digit.md 6 節）。古い番号は古い文を読むため 3 桁も受ける
if (kind === 'recording' && !RECORDING_ID.test(newId)) fail('録画の新しい番号は 4 桁（0001〜9999）');
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
const RECORDINGS = 'records/recordings/';
const OBSERVATIONS = 'records/observations/';

/** 録画の台帳（振り直す録画のとき） */
let ledger: { folder: string; file: string; sha256: string } | undefined;
/** 古い録画の観測値の ID（振り直す録画のとき） */
let observationIds = new Set<string>();

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
} else if (kind === 'recording') {
  if (!existsSync(`${ROOT}${RECORDINGS}${oldId}.json`)) fail(`${RECORDINGS}${oldId}.json が無い`);
  for (const dir of [RECORDINGS, OBSERVATIONS])
    if (existsSync(`${ROOT}${dir}${newId}.json`)) fail(`${dir}${newId}.json が既にある`);
  ledger = JSON.parse(readFileSync(`${ROOT}${RECORDINGS}${oldId}.json`, 'utf8')) as typeof ledger;
  if (renumberedName(ledger!.file, oldId, newId) === undefined)
    fail(`台帳の file（${ledger!.file}）の頭が <YYYYMMDD>-<録画>_ の形でない`);
  moves.push({ from: `${RECORDINGS}${oldId}.json`, to: `${RECORDINGS}${newId}.json` });
  if (existsSync(`${ROOT}${OBSERVATIONS}${oldId}.json`)) {
    moves.push({ from: `${OBSERVATIONS}${oldId}.json`, to: `${OBSERVATIONS}${newId}.json` });
    const obs = JSON.parse(readFileSync(`${ROOT}${OBSERVATIONS}${oldId}.json`, 'utf8')) as { id: string }[];
    observationIds = new Set(obs.map((o) => o.id));
  }
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

const branches =
  kind === 'observation'
    ? observationIdsInBranches(oldId.replace(/-\d+$/, ''))
    : kind === 'recording'
      ? recordingIdsInBranches()
      : idsInBranches();
if (branches.note !== '') console.error(`注意: ${branches.note}`);
// 録画は数として比べる（ブランチの歴史には 4 桁にそろえる前の 3 桁の番号が残る）
const sameId = (x: string) => (kind === 'recording' ? /^\d+$/.test(x) && Number(x) === Number(newId) : x === newId);
if (branches.ids.some(sameId)) fail(`${newId} はどれかのブランチ（手元か origin。main を含む）が足したことがある`);

const TEXT = /\.(md|json|ts|tsx|mts|cts|js|mjs|cjs|ya?ml|txt|csv|html|css)$/;
const files = [
  ...new Set(
    git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter((p) => TEXT.test(p) && !p.endsWith('package-lock.json') && existsSync(`${ROOT}${p}`)),
  ),
].sort();

const texts = new Map(files.map((p) => [p, readFileSync(`${ROOT}${p}`, 'utf8')]));
/** records/ の下の JSON（録画の番号の文字列 "NNN" も置き換える） */
const isRecordsJson = (p: string) => p.startsWith('records/') && p.endsWith('.json');
const mentioned = files.filter(
  (p) =>
    (kind === 'recording'
      ? recordingMentions(texts.get(p)!, newId, isRecordsJson(p))
      : mentions(texts.get(p)!, newId)) > 0,
);
if (mentioned.length > 0)
  fail(
    `${newId} はもう文書かデータに出てくる（範囲の書き方の中を含む）。置き換えると参照が混ざる:\n` +
      mentioned.map((p) => `  ${p}`).join('\n'),
  );

// ---- 録画: リポジトリの外のファイルの名前（先に変える。途中で失敗したら、リポジトリは書き換えずに止める）----

let capture: CapturePlan | undefined;
let applied: CapturePlan['renames'] = [];
// Drive の名前（E: と同じに変える）
let wanted: DriveRename[] = [];
let drive: ReturnType<typeof classifyDriveRenames> | undefined;
let driveSkip: string | null = null;
let viaGateway = false;
const driveApplied: DriveRename[] = [];
if (kind === 'recording') {
  const newFile = renumberedName(ledger!.file, oldId, newId)!;
  capture = planCaptureRenames({
    roots: [{ label: 'E:', dir: capturesDir() }],
    folder: ledger!.folder,
    file: ledger!.file,
    oldId,
    newId,
    sha256: ledger!.sha256,
    mentioned: (frame) => [...texts.values()].some((t) => t.includes(frame)),
  });
  if (capture.problems.length > 0) fail(`録画の置き場所で止めた:\n${capture.problems.map((p) => `  ${p}`).join('\n')}`);
  // Drive は、どれかを変える前に一覧で確かめる（古い名前と新しい名前の両方があれば上書きしないで止める）
  wanted = driveRenames([...capture.renames, ...capture.done]);
  driveSkip = wanted.length === 0 ? null : driveUnavailable();
  // クラウドでは rclone が無いので、受け口で一覧を取って移す（plan/design-cloud-environment.md 6.3 節）
  if (driveSkip !== null && process.env['CLAUDE_CODE_REMOTE'] === 'true' && gatewayUrl() !== null) {
    driveSkip = null;
    viaGateway = true;
  }
  if (wanted.length > 0 && driveSkip === null && viaGateway) {
    const names = new Set<string>();
    for (const d of new Set(wanted.flatMap((r) => [splitRel(r.from).dir, splitRel(r.to).dir]))) {
      try {
        for (const f of (await snapshot('captures', d, 0)).files) names.add(f.path);
      } catch (e) {
        fail(`Drive の ${d === '' ? '根' : d} の一覧を受け口で取れなかった: ${(e as Error).message}`);
      }
    }
    drive = classifyDriveRenames(wanted, (p) => names.has(p));
  } else if (wanted.length > 0 && driveSkip === null) {
    const names = new Set<string>();
    for (const f of new Set(wanted.flatMap((r) => [topFolder(r.from), topFolder(r.to)]))) {
      const listing = lsjson(f === '' ? driveCaptures() : `${driveCaptures()}/${f}`, [
        '--files-only',
        '--max-depth',
        '1',
      ]);
      if (listing === null)
        fail(`Drive の ${f === '' ? '根' : f} の一覧を取れなかった（rclone の準備とネットワークを確かめる）`);
      for (const e of listing) names.add(f === '' ? e.Name : `${f}/${e.Name}`);
    }
    drive = classifyDriveRenames(wanted, (p) => names.has(p));
  }
  if (drive !== undefined) {
    if (drive.both.length > 0)
      fail(
        `Drive に古い名前と新しい名前の両方がある（上書きしない）:\n${drive.both.map((r) => `  ${r.from} / ${r.to}`).join('\n')}`,
      );
  }
  if (!dryRun) {
    const r = applyCaptureRenames(capture.renames, ledger!.file, newFile);
    applied = r.applied;
    if (r.error !== undefined) {
      console.error(`名前を変えている途中で失敗した（リポジトリは書き換えていない。直してから回し直す）: ${r.error}`);
      for (const a of applied) console.error(`  変えた: ${a.label} ${a.from} → ${a.to}`);
      process.exit(1);
    }
    for (const d of drive?.apply ?? []) {
      const error = viaGateway
        ? await move('captures', d.from, d.to).then(
            () => null,
            (e: Error) => e.message,
          )
        : (() => {
            const m = rclone(['moveto', `${driveCaptures()}/${d.from}`, `${driveCaptures()}/${d.to}`]);
            return m.status === 0 ? null : m.stderr.trim();
          })();
      if (error !== null) {
        console.error(
          `Drive の名前を変えている途中で失敗した（リポジトリは書き換えていない。直してから回し直す）: ${d.from} → ${d.to}: ${error}`,
        );
        for (const a of applied) console.error(`  変えた: ${a.label} ${a.from} → ${a.to}`);
        for (const a of driveApplied) console.error(`  変えた: Drive ${a.from} → ${a.to}`);
        process.exit(1);
      }
      driveApplied.push(d);
    }
  }
}

// ---- 置き換え ----

const changed: { path: string; count: number }[] = [];
const ranges: string[] = [];
const manual: string[] = [];
const GENERATED = new Set([
  'plan/claims.md',
  'plan/verifications.md',
  'plan/residuals.md',
  'plan/minimal.md',
  'plan/skills.md',
  'plan/captures/recordings.md',
]);
const spot = (p: string, x: ManualSpot) => `  ${p}:${x.line}: ${x.reason}: ${x.text}`;
for (const p of files) {
  const text = texts.get(p)!;
  let out: string;
  let count: number;
  if (kind === 'recording') {
    const r = renumberRecordingInText(text, oldId, newId, { observations: observationIds, json: isRecordsJson(p) });
    // 生成物は records:check で作り直すので、人が見る所に出さない
    if (!GENERATED.has(p)) for (const x of r.manual) manual.push(spot(p, x));
    out = r.text;
    count = r.count;
  } else {
    const r = renumberInText(text, oldId, newId);
    for (const x of r.ranges) ranges.push(`  ${p}:${x.line}: ${x.range}`);
    out = r.text;
    count = r.count;
  }
  if (count === 0) continue;
  changed.push({ path: p, count });
  if (!dryRun) writeFileSync(`${ROOT}${p}`, out);
}
const BACKUP_LOG = 'plan/captures/backup-log.md';
if (!dryRun && (applied.length > 0 || driveApplied.length > 0)) {
  // 前例（2026-10-05・06 の振り直し）と同じく、段落で書く
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const labels = [...new Set([...applied.map((a) => a.label), ...(driveApplied.length > 0 ? ['Drive'] : [])])].join(
    ' と ',
  );
  const video = applied.find((a) => a.kind === 'video');
  const others = applied.length - applied.filter((a) => a.kind === 'video').length;
  appendFileSync(
    `${ROOT}${BACKUP_LOG}`,
    `\n${when} に、録画 ${oldId} を ${newId} に振り直した（\`records:renumber\`）。${labels} の名前を変えた` +
      `（${video === undefined ? '' : `\`${video.to}\`。`}ほかにスクショ・証拠フレーム・キャッシュが ${others} 件。中身は変えていないので sha256 は台帳のまま）。\n`,
  );
  if (!changed.some((c) => c.path === BACKUP_LOG)) changed.push({ path: BACKUP_LOG, count: 0 });
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
if (manual.length > 0) {
  console.log('人が見る所（素の番号は置き換えていない）:');
  for (const m of manual) console.log(m);
}
if (capture !== undefined) {
  const show = (r: CapturePlan['renames'][number]) => `  ${r.label} ${r.from} → ${r.to}`;
  const doing = capture.renames.filter((r) => r.apply);
  if (doing.length > 0) console.log(dryRun ? '名前を変える（--dry-run。変えていない）:' : '名前を変えた:');
  for (const r of doing) console.log(show(r));
  if (capture.done.length > 0) console.log('もう変えてあった:');
  for (const r of capture.done) console.log(show(r));
  for (const n of capture.notes) console.log(`注意: ${n}`);
  const listed = capture.renames.filter((r) => !r.apply);
  if (listed.length > 0) {
    console.log('この環境に無い置き場所。オーナーが回す（PowerShell）:');
    for (const r of listed) console.log(`  ${renameCommand(r)}`);
  }
  if (drive !== undefined) {
    if (drive.apply.length > 0)
      console.log(dryRun ? 'Drive の名前を変える（--dry-run。変えていない）:' : 'Drive の名前を変えた:');
    for (const r of drive.apply) console.log(`  Drive ${r.from} → ${r.to}`);
    if (drive.done.length > 0) console.log('Drive はもう変えてあった:');
    for (const r of drive.done) console.log(`  Drive ${r.from} → ${r.to}`);
    for (const r of drive.missing)
      console.log(`注意: Drive に ${r.from} が無い（E: で ${r.to} にした。次の npm run drive:sync で上がる）`);
  } else if (driveSkip !== null) {
    console.log(`Drive では変えていない（${driveSkip}）。デスクトップで回す（rclone）:`);
    for (const r of wanted) console.log(`  rclone moveto "${driveCaptures()}/${r.from}" "${driveCaptures()}/${r.to}"`);
  }
  if (!dryRun && (applied.length > 0 || driveApplied.length > 0)) console.log(`${BACKUP_LOG} に段落を足した`);
}
if (changed.some((c) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(c.path)))
  console.log('コードの中も置き換えた。テストが例として使っている ID なら戻す（npm test で確かめる）');
if (!dryRun) console.log('次に npm run records:check（生成物を作り直して検査する）');
