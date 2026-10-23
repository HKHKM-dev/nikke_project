// 録画の取り込み（plan/design-records-automation.md 3.3 節）: 命名規約でリネームして置き場所に移し、素性（長さ・フレーム数・fps・
// 大きさ・sha256）を取り、records/recordings/<録画 id>.json を書く。編成・的・条件は引数で受け、無ければ空で出す（人が埋める）。
//   node tools/captures/intake.ts <元ファイル> --id NNN --name <種別内の識別子> [--folder range] [--date YYYY-MM-DD]
//        [--rid 271,870] [--controlled 1] [--target BigArms --element Fire] [--mode range-3min]
//        [--fixed-spec on|off] [--auto-fire on|off] [--auto-burst on|off] [--note "..."] [--copy] [--no-backup]
// 命名規約は plan/captures/index.md「命名規約」（<YYYYMMDD>-<番号 3〜4 桁>_<識別子>.mp4。識別子は英小文字・数字・-・_・+）。
// 日付は --date、無ければ元のファイル名の YYYY-MM-DD、無ければファイルの更新日時。既定は移動（--copy で元を残す）。
// 最後に、移した録画を Google Drive の nikke_project_captures の同じ種別フォルダに置き、Drive の SHA256 を台帳の sha256 と突き合わせる
// （plan/captures/storage.md「バックアップ」。plan/design-cloud-environment.md 4.4 節）。取り込み元の写しが Drive の
// 「マイ コンピュータ/record」にあれば（Drive for desktop が上げている。フォルダ ID は NIKKE_DRIVE_RECORD_FOLDER_ID）、Drive の中で
// コピーして上げ直さない。無ければ E: から上げる。rclone の準備が無い環境・クラウド環境・--no-backup では置かない。
// 置けなかったら終了コード 1。置けたら plan/captures/backup-log.md に 1 行足す（sha256 の値は JSON にあるので書かない）。
// 取り込んだ後は npm run records:table（台帳の表）と、キャラの確かめに node tools/captures/probe-result.ts <動画> --list。
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  RECORDING_FOLDERS,
  RECORDING_MODES,
  type ProjectRecording,
  type RecordingFolder,
  type RecordingMode,
} from '../../packages/core/src/records/recordings.ts';
import type { CharacterData, Element } from '../../packages/core/src/types.ts';
import { recordingIdsInBranches } from '../../packages/core/scripts/records-data.ts';
import { driveCaptures, driveHash, driveUnavailable, lsjson, rclone, remoteName } from '../drive/rclone.ts';
import { relUnder, splitRel } from '../drive/sync-lib.ts';
import { capturesDir, recordDir } from './dirs.ts';
import { ffprobe, sha256 } from './ffmpeg.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const ELEMENTS: readonly Element[] = ['Fire', 'Water', 'Wind', 'Electronic', 'Iron'];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: 'string' },
    name: { type: 'string' },
    folder: { type: 'string', default: 'range' },
    date: { type: 'string' },
    rid: { type: 'string' },
    controlled: { type: 'string' },
    target: { type: 'string' },
    element: { type: 'string' },
    mode: { type: 'string' },
    'fixed-spec': { type: 'string' },
    'auto-fire': { type: 'string' },
    'auto-burst': { type: 'string' },
    note: { type: 'string', default: '' },
    copy: { type: 'boolean', default: false },
    'no-backup': { type: 'boolean', default: false },
  },
});

const USAGE =
  'usage: node tools/captures/intake.ts <元ファイル> --id NNN --name <識別子> [--folder range] [--date YYYY-MM-DD]\n' +
  '       [--rid 271,870] [--controlled 1] [--target BigArms --element Fire] [--mode range-3min]\n' +
  '       [--fixed-spec on|off] [--auto-fire on|off] [--auto-burst on|off] [--note "..."] [--copy] [--no-backup]';

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

const source = positionals[0];
if (!source || !values.id || !values.name) fail('元ファイル・--id・--name が要る');
if (!existsSync(source)) fail(`${source} が無い`);
if (!/^\d{3,}$/.test(values.id)) fail('--id は 3 桁以上の数字');
if (!/^[a-z0-9][a-z0-9_+-]*$/.test(values.name)) fail('--name は英小文字・数字・-・_・+');
// 命名規約では編成をファイル名に入れない（plan/captures/index.md「命名規約」。録画 400〜402・407。plan/design-investigation-review.md 5 節）
if (values.name.includes('+'))
  console.log(
    '注意: 識別子に + が入っている。命名規約では編成をファイル名に入れず、測定対象を 1 体だけ書く（編成は records/recordings/<録画 id>.json の team）',
  );
if (!(RECORDING_FOLDERS as readonly string[]).includes(values.folder))
  fail(`--folder は ${RECORDING_FOLDERS.join(' / ')}`);
const folder = values.folder as RecordingFolder;
if (values.mode !== undefined && !(RECORDING_MODES as readonly string[]).includes(values.mode)) {
  fail(`--mode は ${RECORDING_MODES.join(' / ')}`);
}
if (values.element !== undefined && !(ELEMENTS as readonly string[]).includes(values.element)) {
  fail(`--element は ${ELEMENTS.join(' / ')}`);
}
const onOff = (v: string | undefined, name: string): boolean | null => {
  if (v === undefined) return null;
  if (v === 'on') return true;
  if (v === 'off') return false;
  return fail(`${name} は on か off`);
};

const recordPath = `${ROOT}records/recordings/${values.id}.json`;
if (existsSync(recordPath)) fail(`${recordPath} が既にある`);
// どれかのブランチ（手元か origin。main を含む）が足したことのある番号は使わない（並行する取り込みが同じ番号を取らない。
// plan/design-investigation-review.md 4.3 節）
const branches = recordingIdsInBranches();
if (branches.note !== '') console.error(`注意: ${branches.note}`);
if (branches.ids.includes(values.id)) {
  const used = [...readdirSync(`${ROOT}records/recordings`).map((n) => n.replace(/\.json$/, '')), ...branches.ids];
  const max = Math.max(...used.filter((x) => /^\d+$/.test(x)).map(Number));
  fail(
    `録画 ${values.id} はほかのブランチ（か main）が records/recordings/${values.id}.json を足している。次の空き番号は ${String(max + 1).padStart(3, '0')}`,
  );
}

function dateOf(): string {
  if (values.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) fail('--date は YYYY-MM-DD');
    return values.date;
  }
  const m = /(\d{4})[-_]?(\d{2})[-_]?(\d{2})/.exec(basename(source!));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const t = statSync(source!).mtime;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function characterName(rid: number): string {
  const path = `${ROOT}packages/core/data/characters/${rid}.json`;
  if (!existsSync(path)) fail(`rid ${rid} のキャラのデータが無い（${path}）`);
  return (JSON.parse(readFileSync(path, 'utf8')) as CharacterData).name.ja;
}

const date = dateOf();
const file = `${date.replace(/-/g, '')}-${values.id}_${values.name}.mp4`;
const dir = join(capturesDir(), folder);
const dest = join(dir, file);
if (existsSync(dest)) fail(`${dest} が既にある`);

// Drive に置く準備（動かす前に確かめる）。取り込み元の写しが Drive の record にあれば、ここで Drive の中でコピーしておく
// （E: へ動かすと、Drive for desktop が record の写しを消す）
const driveSkip = values['no-backup'] ? '--no-backup' : driveUnavailable();
const remoteFile = `${driveCaptures()}/${folder}/${file}`;
let serverCopied = false;
if (driveSkip === null) {
  if ((lsjson(remoteFile) ?? []).length > 0) fail(`${remoteFile} が既にある（上書きしない）`);
  serverCopied = copyFromRecord(source);
}

/** 取り込み元が H:/record の下で、その写しが Drive の record に同じ大きさであれば、Drive の中で種別フォルダへ規約名でコピーする */
function copyFromRecord(src: string): boolean {
  const root = recordDir();
  const folderId = process.env['NIKKE_DRIVE_RECORD_FOLDER_ID'];
  const rel = root === null ? null : relUnder(root, src);
  if (rel === null || !folderId) return false;
  const { dir: relDir, name } = splitRel(rel);
  // rclone は「パソコン」のフォルダを自分では見つけられないので、フォルダ ID を指して読む
  const entries = lsjson(`${remoteName()},root_folder_id=${folderId}:${relDir}`, ['--files-only', '--max-depth', '1']);
  const hit = entries?.find((e) => e.Name === name && e.Size === statSync(src).size);
  if (hit?.ID === undefined) {
    console.log('Drive の record に取り込み元の写しが無い（まだ上がっていない）ので、E: から上げる');
    return false;
  }
  const r = rclone(['backend', 'copyid', `${remoteName()}:`, hit.ID, `nikke_project_captures/${folder}/${file}`]);
  if (r.status !== 0) {
    console.error(`Drive の中のコピーに失敗した（E: から上げる）: ${r.stderr.trim()}`);
    return false;
  }
  return true;
}

mkdirSync(dir, { recursive: true });
if (values.copy) copyFileSync(source, dest);
else {
  try {
    renameSync(source, dest);
  } catch {
    copyFileSync(source, dest);
    unlinkSync(source);
  }
}
console.error(`${source} → ${dest}（${values.copy ? '複製' : '移動'}）`);

const probe = ffprobe(dest);
const fullDigest = await sha256(dest);
const digest = fullDigest.slice(0, 12);
const rids = values.rid === undefined ? [] : values.rid.split(',').map((s) => Number(s.trim()));
const controlled = values.controlled === undefined ? null : Number(values.controlled);
const entry: ProjectRecording = {
  id: values.id,
  date,
  folder,
  file,
  original: basename(source),
  durationSec: Math.round(probe.durationSec * 10) / 10,
  frames: probe.nbFrames > 0 ? probe.nbFrames : null,
  fps: Math.round(probe.avgFps),
  sizeMB: Math.round((probe.sizeBytes / 1024 / 1024) * 10) / 10,
  sha256: digest,
  team: rids.map((rid, i) => ({
    slot: i + 1,
    rid,
    name: characterName(rid),
    controlled: controlled === null ? null : controlled === i + 1,
  })),
  target: { name: values.target ?? '', element: (values.element as Element | undefined) ?? null },
  mode: (values.mode as RecordingMode | undefined) ?? null,
  fixedSpec: onOff(values['fixed-spec'], '--fixed-spec'),
  autoFire: onOff(values['auto-fire'], '--auto-fire'),
  autoBurst: onOff(values['auto-burst'], '--auto-burst'),
  conditionNote: values.note,
};
writeFileSync(recordPath, `${JSON.stringify(entry, null, 2)}\n`);
console.log(
  `${recordPath} を書いた（${probe.durationSec.toFixed(1)}s・${probe.nbFrames}f・${probe.avgFps.toFixed(2)}fps・sha256 ${digest}）`,
);
const missing = [
  ...(rids.length === 0 ? ['team（--rid・--controlled）'] : []),
  ...(values.target === undefined ? ['target.name（--target）'] : []),
  ...(values.element === undefined ? ['target.element（--element）'] : []),
  ...(values.mode === undefined ? ['mode'] : []),
  ...(values['fixed-spec'] === undefined ? ['fixedSpec'] : []),
  ...(values['auto-fire'] === undefined ? ['autoFire'] : []),
  ...(values['auto-burst'] === undefined ? ['autoBurst'] : []),
  ...(values.note === '' ? ['conditionNote'] : []),
];
if (missing.length > 0) console.log(`人が埋める項目: ${missing.join('、')}`);
console.log(`次: npm run records:table、キャラの確かめは node tools/captures/probe-result.ts "${dest}" --list`);

async function md5(path: string): Promise<string> {
  const hash = createHash('md5');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** Drive の写しのハッシュを E: と比べる（Drive が SHA256 を持っていなければ md5）。一致したハッシュの名前、違えば null */
async function verifyDrive(): Promise<'sha256' | 'md5' | null> {
  const s = driveHash(remoteFile, 'sha256');
  if (s !== null) {
    if (s === fullDigest) return 'sha256';
    console.error(`sha256 が一致しない（${dest}: ${digest}、${remoteFile}: ${s.slice(0, 12)}）`);
    return null;
  }
  const m = driveHash(remoteFile, 'md5');
  const local = await md5(dest);
  if (m !== null && m === local) return 'md5';
  console.error(`Drive のハッシュを突き合わせられない（${remoteFile}: sha256 なし・md5 ${m ?? 'なし'}）`);
  return null;
}

// Drive の同じ種別フォルダに置き、ハッシュを突き合わせる
async function syncToDrive(): Promise<boolean> {
  if (driveSkip !== null) {
    console.log(`Drive には置いていない（${driveSkip}）。次の npm run drive:sync で上がる`);
    return true;
  }
  if (serverCopied) {
    const matched = await verifyDrive();
    if (matched !== null) {
      // E: の更新時刻を Drive の写しにそろえ、次の同期で同じファイルと見なさせる（上げ直さない）
      const copied = lsjson(remoteFile)?.[0];
      if (copied !== undefined) utimesSync(dest, new Date(), new Date(copied.ModTime));
      return placed('Drive の中で取り込み元の写しからコピーした', matched);
    }
    console.error('Drive の中のコピーが E: と違うので、E: から上げ直す');
  }
  const r = rclone(['copyto', dest, remoteFile]);
  if (r.status !== 0) {
    console.error(`Drive に上げられなかった: ${r.stderr.trim()}`);
    return false;
  }
  const matched = await verifyDrive();
  return matched !== null && placed('E: から上げた', matched);
}

function placed(how: string, matched: 'sha256' | 'md5'): true {
  console.log(`${remoteFile} に置いた（${how}。${matched} が一致）`);
  appendBackupLog(how, matched);
  return true;
}

// backup-log.md に 1 行足す（日付・足したもの・ハッシュの突き合わせの結果。backup-log.md の冒頭の決まり）
function appendBackupLog(how: string, matched: 'sha256' | 'md5'): void {
  const logPath = `${ROOT}plan/captures/backup-log.md`;
  if (!existsSync(logPath)) {
    console.error(`${logPath} が無いので、同期の記録は足していない`);
    return;
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const team =
    entry.team.length === 0
      ? ''
      : `（${entry.team.map((m) => m.name).join(' + ')}${entry.team.length === 1 ? '単騎' : ''}）`;
  // 1 行の書式（2026-10-11。plan/design-investigation-review.md 7.3 節）。sha256 の値は records/recordings/<録画 id>.json にある
  const origin = values.copy ? ' 取り込み元の元ファイルは残した（`--copy`）。' : '';
  const line = `- ${stamp} 録画 ${values.id}${team}: \`${folder}/${file}\` を Drive に置いた（${how}。E: と Drive で ${matched} が一致）。${origin}`;
  appendFileSync(logPath, `${line}\n`);
  console.log(`${logPath} に同期の記録を足した`);
}

if (!(await syncToDrive())) {
  console.error(
    '取り込み（移動と records/recordings の JSON）は済んでいる。Drive へは npm run drive:sync で上げる（plan/captures/storage.md「バックアップ」）',
  );
  process.exit(1);
}
