// 録画の番号を 4 桁にそろえる（plan/design-recording-id-4digit.md）。
//   npm run records:renumber -- --pad-all [--dry-run]
// 2〜3 桁の録画（records/recordings/<録画>.json。L- は扱わない）を、数として同じ 4 桁の番号にする（124 → 0124、2 桁の時代の 41 → 0041）。
// - 録画の置き場所（E:）の動画・スクショ・証拠フレーム・中間出力のキャッシュの名前を変え（tools/captures/renumber-files.ts）、Drive の
//   nikke_project_captures でも同じ名前に変える（rclone moveto。Drive の中なので上げ直さない。derived は同期しないので変えない）。
// - リポジトリの中は、records/recordings/ と records/observations/ のファイルを移し（git mv）、文書・データ・コードの中の確かさの高い形
//   （設計書 3 節）を 4 桁にする。素の番号とテストのコード（__tests__/・*.test.ts）は置き換えない（4 節）。
// - 先に全部を確かめてから変える。途中で止まったら、回し直すと、変えてあるものを飛ばして続ける。何度回しても同じ結果になる。
// - デスクトップで回す（E: と rclone が要る）。クラウド環境では動かない。
// 回した後は npm run drive:sync -- --pair captures --resync（--dry-run で送るものが無いことを見てから。設計書 5 節）と、
// npm run records:table・records:check・records:minimal。
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { padRecordingId, padRecordingsInText } from '../src/records/renumber.ts';
import { capturesDir } from '../../../tools/captures/dirs.ts';
import { driveCaptures, driveUnavailable, lsjson, rclone } from '../../../tools/drive/rclone.ts';
import { classifyDriveRenames, type DriveRename, driveRenames, topFolder } from '../../../tools/drive/sync-lib.ts';
import {
  applyCaptureRenames,
  type CapturePlan,
  type CaptureRename,
  planCaptureRenames,
  renumberedName,
} from '../../../tools/captures/renumber-files.ts';
import { ROOT } from './records-data.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const git = (args: string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });

export async function padAllRecordings(dryRun: boolean): Promise<void> {
  if (process.env['CLAUDE_CODE_REMOTE'] === 'true') fail('デスクトップで回す（E: と rclone が要る）');
  for (const p of ['rebase-merge', 'rebase-apply', 'MERGE_HEAD', 'CHERRY_PICK_HEAD'])
    if (existsSync(resolve(ROOT, git(['rev-parse', '--git-path', p]).trim())))
      fail('リベースかマージの途中なので回さない。中止してから回す');

  // ---- 録画と観測値 ----
  const RECORDINGS = 'records/recordings/';
  const OBSERVATIONS = 'records/observations/';
  type Ledger = { id: string; folder: string; file: string; sha256: string };
  const ledgers = readdirSync(`${ROOT}${RECORDINGS}`)
    .filter((n) => /^\d+\.json$/.test(n))
    .map((n) => JSON.parse(readFileSync(`${ROOT}${RECORDINGS}${n}`, 'utf8')) as Ledger);
  const recordings = new Set(ledgers.map((l) => Number(l.id)));
  const targets = ledgers.filter((l) => l.id.length < 4).sort((a, b) => Number(a.id) - Number(b.id));
  const observations = new Set<string>();
  for (const n of readdirSync(`${ROOT}${OBSERVATIONS}`).filter((x) => /^\d{3}\.json$/.test(x)))
    for (const o of JSON.parse(readFileSync(`${ROOT}${OBSERVATIONS}${n}`, 'utf8')) as { id: string }[])
      observations.add(o.id);

  const moves: { from: string; to: string }[] = [];
  for (const l of targets) {
    const to = padRecordingId(l.id);
    for (const dir of [RECORDINGS, OBSERVATIONS]) {
      if (existsSync(`${ROOT}${dir}${to}.json`)) fail(`${dir}${to}.json が既にある（${l.id} と両方ある）`);
      if (existsSync(`${ROOT}${dir}${l.id}.json`)) moves.push({ from: `${dir}${l.id}.json`, to: `${dir}${to}.json` });
    }
    if (renumberedName(l.file, l.id, to) === undefined)
      fail(`録画 ${l.id} の file（${l.file}）の頭が <YYYYMMDD>-<録画>_ の形でない`);
  }

  // ---- 文書・データ・コード ----
  const TEXT = /\.(md|json|ts|tsx|mts|cts|js|mjs|cjs|ya?ml|txt|csv|html|css)$/;
  const isTest = (p: string) => p.includes('/__tests__/') || /\.test\.tsx?$/.test(p);
  const files = [
    ...new Set(
      git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
        .split('\0')
        .filter((p) => TEXT.test(p) && !p.endsWith('package-lock.json') && !isTest(p) && existsSync(`${ROOT}${p}`)),
    ),
  ].sort();
  const texts = new Map(files.map((p) => [p, readFileSync(`${ROOT}${p}`, 'utf8')]));

  // ---- 録画の置き場所（E:）と Drive の計画（先に全部を確かめる）----
  const plans: { ledger: Ledger; to: string; plan: CapturePlan }[] = [];
  for (const l of targets) {
    const to = padRecordingId(l.id);
    const plan = planCaptureRenames({
      roots: [{ label: 'E:', dir: capturesDir() }],
      folder: l.folder,
      file: l.file,
      oldId: l.id,
      newId: to,
      sha256: l.sha256,
      mentioned: (frame) => [...texts.values()].some((t) => t.includes(frame)),
    });
    plans.push({ ledger: l, to, plan });
  }
  const problems = plans.flatMap((p) => p.plan.problems.map((x) => `録画 ${p.ledger.id}: ${x}`));
  if (problems.length > 0) fail(`録画の置き場所で止めた:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  const local = plans.flatMap((p) => p.plan.renames);
  if (local.some((r) => !r.apply)) fail(`録画の置き場所（${capturesDir()}）が無い。デスクトップで回す`);

  const wanted = driveRenames(plans.flatMap((p) => [...p.plan.renames, ...p.plan.done]));
  const driveSkip = driveUnavailable();
  if (driveSkip !== null) fail(`Drive の名前を変えられない（${driveSkip}）。rclone の準備を確かめる`);
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
  const drive = classifyDriveRenames(wanted, (p) => names.has(p));
  if (drive.both.length > 0)
    fail(
      `Drive に古い名前と新しい名前の両方がある（上書きしない）:\n${drive.both.map((r) => `  ${r.from} / ${r.to}`).join('\n')}`,
    );

  // ---- 変える ----
  const applied: CaptureRename[] = [];
  const driveApplied: DriveRename[] = [];
  const stop = (message: string): never => {
    console.error(`${message}（リポジトリは書き換えていない。直してから回し直す。変えたものは飛ばして続く）`);
    console.error(`  E: で変えた: ${applied.length} 件・Drive で変えた: ${driveApplied.length} 件`);
    process.exit(1);
  };
  if (!dryRun) {
    for (const p of plans) {
      const r = applyCaptureRenames(p.plan.renames, p.ledger.file, renumberedName(p.ledger.file, p.ledger.id, p.to)!);
      applied.push(...r.applied);
      if (r.error !== undefined) stop(`E: の名前を変えている途中で失敗した: ${r.error}`);
    }
    console.log(`E: の名前を変えた: ${applied.length} 件`);
    for (const d of drive.apply) {
      const m = rclone(['moveto', `${driveCaptures()}/${d.from}`, `${driveCaptures()}/${d.to}`]);
      if (m.status !== 0) stop(`Drive の名前を変えている途中で失敗した: ${d.from} → ${d.to}: ${m.stderr.trim()}`);
      driveApplied.push(d);
      if (driveApplied.length % 50 === 0) console.log(`  Drive: ${driveApplied.length} / ${drive.apply.length}`);
    }
  }

  // ---- リポジトリの中 ----
  const changed: { path: string; count: number }[] = [];
  for (const p of files) {
    const r = padRecordingsInText(texts.get(p)!, {
      recordings,
      observations,
      json: p.startsWith('records/') && p.endsWith('.json'),
    });
    if (r.count === 0) continue;
    changed.push({ path: p, count: r.count });
    if (!dryRun) writeFileSync(`${ROOT}${p}`, r.text);
  }
  const BACKUP_LOG = 'plan/captures/backup-log.md';
  if (!dryRun) {
    if (applied.length > 0 || driveApplied.length > 0) {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const when = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
      appendFileSync(
        `${ROOT}${BACKUP_LOG}`,
        `\n${when} に、録画 ${targets.length} 本の番号を 4 桁にそろえた（\`records:renumber -- --pad-all\`。` +
          `plan/design-recording-id-4digit.md）。E: で ${applied.length} 件・Drive で ${driveApplied.length} 件の名前を変えた` +
          `（中身は変えていないので sha256 は台帳のまま）。\n`,
      );
      if (!changed.some((c) => c.path === BACKUP_LOG)) changed.push({ path: BACKUP_LOG, count: 0 });
    }
    const tracked = new Set(
      git(['ls-files', '-z', '--', RECORDINGS, OBSERVATIONS])
        .split('\0')
        .filter((p) => p !== ''),
    );
    for (const m of moves) {
      if (tracked.has(m.from)) git(['mv', m.from, m.to]);
      else renameSync(`${ROOT}${m.from}`, `${ROOT}${m.to}`);
    }
    const format = changed.map((c) => moves.find((m) => m.from === c.path)?.to ?? c.path);
    // Windows のコマンド行の長さの上限にかからないように分けて整える
    for (let i = 0; i < format.length; i += 200)
      spawnSync(process.execPath, [`${ROOT}tools/format-retry.ts`, ...format.slice(i, i + 200)], {
        cwd: ROOT,
        stdio: 'ignore',
      });
  }

  // ---- 報告 ----
  console.log(`録画 ${targets.length} 本を 4 桁にする${dryRun ? '（--dry-run。書き換えていない）' : ''}`);
  console.log(`移す: ${moves.length} ファイル（records/recordings/・records/observations/）`);
  const total = changed.reduce((s, c) => s + c.count, 0);
  console.log(`置き換え: ${total} か所（${changed.length} ファイル）`);
  const byArea = new Map<string, { count: number; files: number }>();
  for (const c of changed) {
    const area = c.path.startsWith('records/') ? c.path.split('/').slice(0, 2).join('/') : c.path.split('/')[0]!;
    const e = byArea.get(area) ?? { count: 0, files: 0 };
    e.count += c.count;
    e.files++;
    byArea.set(area, e);
  }
  for (const [a, e] of [...byArea].sort((x, y) => y[1].count - x[1].count))
    console.log(`  ${a}: ${e.count} か所（${e.files} ファイル）`);
  const kinds = new Map<string, number>();
  for (const r of local) kinds.set(r.kind, (kinds.get(r.kind) ?? 0) + 1);
  console.log(
    `E: で${dryRun ? '変える' : '変えた'}: ${local.length} 件（${[...kinds].map(([k, n]) => `${k} ${n}`).join('・')}）。もう変えてあった: ${plans.reduce((s, p) => s + p.plan.done.length, 0)} 件`,
  );
  console.log(
    `Drive で${dryRun ? '変える' : '変えた'}: ${drive.apply.length} 件。もう変えてあった: ${drive.done.length} 件。Drive に無い（次の drive:sync で上がる）: ${drive.missing.length} 件`,
  );
  const notes = plans.flatMap((p) => p.plan.notes.map((n) => `録画 ${p.ledger.id}: ${n}`));
  if (notes.length > 0) {
    console.log(`注意（${notes.length} 件）:`);
    for (const n of notes) console.log(`  ${n}`);
  }
  if (drive.missing.length > 0) {
    console.log('Drive に無いもの:');
    for (const r of drive.missing) console.log(`  ${r.from} → ${r.to}`);
  }
  if (!dryRun)
    console.log(
      '次に npm run drive:sync -- --pair captures --resync --dry-run で送るものが無いことを見てから --resync を回し、' +
        'npm run records:table・records:check・records:minimal で生成物を作り直す。テストの落ちる所は手で直す',
    );
}
