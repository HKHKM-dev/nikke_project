// 録画の取り込み（plan/design-records-automation.md 3.3 節）: 命名規約でリネームして置き場所に移し、素性（長さ・フレーム数・fps・
// 大きさ・sha256）を取り、records/recordings/<録画 id>.json を書く。編成・的・条件は引数で受け、無ければ空で出す（人が埋める）。
//   node tools/captures/intake.ts <元ファイル>... --name <識別子>[,<識別子>...] [--id NNNN] [--folder range] [--date YYYY-MM-DD]
//        [--rid 271,870] [--controlled 1] [--treasure 2:3] [--target BigArms --element Fire] [--mode range-3min]
//        [--fixed-spec on|off] [--auto-fire on|off] [--auto-burst on|off] [--note "..."]... [--copy] [--no-backup] [--no-push]
// 1 回の撮影の録画をまとめて取り込む（plan/design-workflow-simplification-2.md 1 節）。--name は元ファイルと同じ数を , で並べ、--note は
// 1 つ（全部に同じ）か元ファイルと同じ数を繰り返す。ほかの引数は全部の録画に同じものを使う。番号は --id から順に、--id が無ければ
// どのブランチも使っていない次の番号から順に取る。1 本ずつ子のプロセスで取り込み、失敗したらそこで止める。終わりに npm run records:table
// を回し、書いた録画の JSON と一覧だけを commit して push する（番号を押さえる。packages/core/scripts/reserve.ts。--no-push でしない）。
// --treasure は宝物ありの枠と段階（<枠>:<段階>,...。段階はオーナーに確かめた値。plan/captures/protocol.md「撮った後」）。
// 命名規約は plan/captures/index.md「命名規約」（<YYYYMMDD>-<番号 4 桁>_<識別子>.mp4。識別子は英小文字・数字・-・_・+）。
// 日付は --date、無ければ元のファイル名の YYYY-MM-DD、無ければファイルの更新日時。既定は移動（--copy で元を残す）。
// 最後に、移した録画を Google Drive の nikke_project_captures の同じ種別フォルダに置き、Drive の SHA256 を台帳の sha256 と突き合わせる
// （plan/captures/storage.md「バックアップ」。plan/design-cloud-environment.md 4.4 節）。取り込み元の写しが Drive の
// 「マイ コンピュータ/record」にあれば（Drive for desktop が上げている。フォルダ ID は NIKKE_DRIVE_RECORD_FOLDER_ID）、Drive の中で
// コピーして上げ直さない。無ければ E: から上げる。rclone の準備が無い環境・--no-backup では置かない（クラウド環境は下の drive: で取り込む）。
// 置けなかったら終了コード 1。置けたら録画の JSON に backup（日時・経路・一致したハッシュ）を書き足す（backup-log.md には書かない。
// plan/design-workflow-simplification.md 2 節）。JSON は置く前に書くので、backup の無い JSON は置けたと確かめていない。
// クラウド環境では、元ファイルを drive:<record の中の相対パス> で指す（plan/design-cloud-environment.md 6.3 節）。サービスアカウントで
// record から取り寄せ（Drive の sha256 と突き合わせる）、受け口の move で種別フォルダへ規約名で移す（移せなければコピーと元のごみ箱への
// 移動）。PC を付けると Drive for desktop が H:/record の写しを消し、bisync が E: に降ろす。--copy は使えない。record の一覧は --list-record。
// 環境変数: NIKKE_DRIVE_SA_KEY・NIKKE_DRIVE_RECORD_FOLDER_ID・NIKKE_DRIVE_FOLDER_ID（drive.ts・fetch.ts）と受け口（gateway.ts）。
// 取り込んだ後は、キャラの確かめに node tools/captures/probe-result.ts <動画> --list。
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
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
  type BackupVia,
  RECORDING_FOLDERS,
  RECORDING_MODES,
  type ProjectRecording,
  type RecordingBackup,
  type RecordingFolder,
  type RecordingMode,
} from '../../packages/core/src/records/recordings.ts';
import type { CharacterData, Element } from '../../packages/core/src/types.ts';
import { recordingIdsInBranches } from '../../packages/core/scripts/records-data.ts';
import { reserve } from '../../packages/core/scripts/reserve.ts';
import { gatewayUrl, move } from '../drive/gateway.ts';
import { driveCaptures, driveHash, driveUnavailable, lsjson, rclone, remoteName } from '../drive/rclone.ts';
import { relUnder, splitRel } from '../drive/sync-lib.ts';
import { capturesDir, recordDir } from './dirs.ts';
import { Drive, type DriveFile } from './drive.ts';
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
    treasure: { type: 'string' },
    note: { type: 'string', multiple: true, default: [] },
    copy: { type: 'boolean', default: false },
    'no-backup': { type: 'boolean', default: false },
    'no-push': { type: 'boolean', default: false },
    'list-record': { type: 'boolean', default: false },
    // 1 本ずつの取り込み（まとめて取り込む親が渡す。人は使わない）
    child: { type: 'boolean', default: false },
  },
});

const USAGE =
  'usage: node tools/captures/intake.ts <元ファイル | drive:<record の中のパス>>... --name <識別子>[,<識別子>...] [--id NNNN]\n' +
  '       [--folder range] [--date YYYY-MM-DD] [--rid 271,870] [--controlled 1] [--treasure 2:3] [--target BigArms --element Fire]\n' +
  '       [--mode range-3min] [--fixed-spec on|off] [--auto-fire on|off] [--auto-burst on|off] [--note "..."]... [--copy]\n' +
  '       [--no-backup] [--no-push]\n' +
  '       node tools/captures/intake.ts --list-record（Drive の record の一覧）';

function fail(message: string): never {
  console.error(message);
  console.error(USAGE);
  process.exit(1);
}

function envId(name: string): string {
  const v = process.env[name];
  if (!v) fail(`環境変数 ${name} が無い（plan/cloud-guide.md「準備」）`);
  return v;
}

/** record の下を / 区切りの相対パスで全部たどる（フォルダは潜る） */
async function listRecord(drive: Drive, folderId: string, rel = ''): Promise<(DriveFile & { path: string })[]> {
  const out: (DriveFile & { path: string })[] = [];
  for (const f of await drive.children(folderId)) {
    if (drive.isFolder(f)) out.push(...(await listRecord(drive, f.id, `${rel}${f.name}/`)));
    else out.push({ ...f, path: `${rel}${f.name}` });
  }
  return out;
}

if (values['list-record']) {
  const drive = await Drive.connect();
  const files = await listRecord(drive, envId('NIKKE_DRIVE_RECORD_FOLDER_ID'));
  for (const f of files)
    console.log(`${f.path}\t${(Number(f.size ?? 0) / 1024 / 1024).toFixed(1)}MB\t${f.modifiedTime ?? ''}`);
  if (files.length === 0) console.log('record は空');
  process.exit(0);
}

const recordPathOf = (id: string) => `${ROOT}records/recordings/${id}.json`;

/** どのブランチ（手元か origin。main を含む）も足したことのない、手元の最大の次の番号から n 個 */
function freeRecordingIds(n: number, branchIds: readonly string[]): string[] {
  const used = [...readdirSync(`${ROOT}records/recordings`).map((f) => f.replace(/\.json$/, '')), ...branchIds];
  // 数として比べる（ブランチの歴史には 4 桁にそろえる前の 3 桁の番号が残る）
  const max = Math.max(0, ...used.filter((x) => /^\d+$/.test(x)).map(Number));
  return Array.from({ length: n }, (_, i) => String(max + 1 + i).padStart(4, '0'));
}

if (!values.child) {
  // まとめて取り込む（冒頭の説明）: 1 本ずつ子のプロセスで回し、終わりに一覧を作り直して番号を押さえる
  if (positionals.length === 0 || !values.name) fail('元ファイル・--name が要る');
  const names = values.name.split(',').map((s) => s.trim());
  if (names.length !== positionals.length)
    fail(`--name は元ファイルと同じ数（${positionals.length}）を , で並べる（${names.length} 個あった）`);
  const notes = values.note;
  if (notes.length > 1 && notes.length !== positionals.length)
    fail(`--note は 1 つか、元ファイルと同じ数（${positionals.length}）を繰り返す（${notes.length} 個あった）`);
  let ids: string[];
  if (values.id !== undefined) {
    if (!/^\d{4}$/.test(values.id)) fail('--id は 4 桁の数字（0001〜9999）');
    ids = positionals.map((_, i) => String(Number(values.id) + i).padStart(4, '0'));
  } else {
    const branches = recordingIdsInBranches();
    if (branches.note !== '') console.error(`注意: ${branches.note}`);
    ids = freeRecordingIds(positionals.length, branches.ids);
  }
  const shared: [string, string | undefined][] = [
    ['--folder', values.folder],
    ['--date', values.date],
    ['--rid', values.rid],
    ['--controlled', values.controlled],
    ['--treasure', values.treasure],
    ['--target', values.target],
    ['--element', values.element],
    ['--mode', values.mode],
    ['--fixed-spec', values['fixed-spec']],
    ['--auto-fire', values['auto-fire']],
    ['--auto-burst', values['auto-burst']],
  ];
  const flags = [...(values.copy ? ['--copy'] : []), ...(values['no-backup'] ? ['--no-backup'] : [])];
  const written: string[] = [];
  let status = 0;
  for (const [i, src] of positionals.entries()) {
    const note = notes.length === 1 ? notes[0] : notes[i];
    if (positionals.length > 1) console.log(`--- ${i + 1}/${positionals.length}: ${src} → 録画 ${ids[i]}`);
    const existed = existsSync(recordPathOf(ids[i]!));
    const r = spawnSync(
      process.execPath,
      [
        fileURLToPath(import.meta.url),
        src,
        '--child',
        '--id',
        ids[i]!,
        '--name',
        names[i]!,
        ...(note !== undefined ? ['--note', note] : []),
        ...shared.flatMap(([k, v]) => (v === undefined ? [] : [k, v])),
        ...flags,
      ],
      { stdio: 'inherit' },
    );
    // Drive に置けずに止まっても JSON は書いてある（番号は使った）ので、押さえる方に入れる
    if (!existed && existsSync(recordPathOf(ids[i]!))) written.push(ids[i]!);
    status = r.status ?? 1;
    if (status !== 0) {
      const rest = positionals.slice(i + 1);
      if (rest.length > 0) console.error(`ここで止めた。取り込んでいない元ファイル: ${rest.join(' ')}`);
      break;
    }
  }
  if (written.length > 0) {
    const table = spawnSync('npm run records:table', { cwd: ROOT, stdio: 'inherit', shell: true });
    if (table.status !== 0) status ||= table.status ?? 1;
    const label = `録画 ${written[0]}${written.length > 1 ? `〜${written[written.length - 1]}` : ''}`;
    reserve(
      [...written.map(recordPathOf), `${ROOT}plan/captures/recordings.md`],
      label,
      !values['no-push'] && table.status === 0,
    );
  }
  process.exit(status);
}

const source = positionals[0];
if (!source || !values.id || !values.name) fail('元ファイル・--id・--name が要る');
// drive:<相対パス> なら、Drive の record から取り込む（クラウド環境。冒頭の説明）
const fromDrive = source.startsWith('drive:') ? source.slice('drive:'.length).replace(/^\/+/, '') : null;
if (fromDrive === null && !existsSync(source)) fail(`${source} が無い`);
if (fromDrive !== null) {
  if (fromDrive === '') fail('drive: の後に record の中のパスが要る（--list-record で一覧）');
  if (values.copy) fail('drive: から取り込むときは --copy を使えない（record の写しは移す）');
  if (gatewayUrl() === null) fail('環境変数 NIKKE_DRIVE_GATEWAY_URL が無い（Drive の中で移すのに受け口を使う）');
}
// 2026-10-25 から 4 桁だけ（plan/design-recording-id-4digit.md 6 節）
if (!/^\d{4}$/.test(values.id)) fail('--id は 4 桁の数字（0001〜9999）');
if (!/^[a-z0-9][a-z0-9_+-]*$/.test(values.name)) fail('--name は英小文字・数字・-・_・+');
// 命名規約では編成をファイル名に入れない（plan/captures/index.md「命名規約」。録画 0400〜0402・0407。plan/design-investigation-review.md 5 節）
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
const rids = values.rid === undefined ? [] : values.rid.split(',').map((s) => Number(s.trim()));
// 宝物ありの枠と段階（--treasure <枠>:<段階>,...）。録画を動かす前に確かめる
const treasure = new Map<number, number>();
for (const t of values.treasure?.split(',') ?? []) {
  const m = /^(\d+):([1-3])$/.exec(t.trim());
  if (!m) fail(`--treasure は <枠>:<段階（1〜3）> を , で並べる（${t}）`);
  const slot = Number(m[1]);
  if (slot < 1 || slot > rids.length) fail(`--treasure の枠 ${slot} が --rid に無い`);
  if (characterOf(rids[slot - 1]!).treasure === null)
    fail(`--treasure の枠 ${slot}（rid ${rids[slot - 1]}）のキャラは宝物を持たない`);
  treasure.set(slot, Number(m[2]));
}

const recordPath = recordPathOf(values.id);
if (existsSync(recordPath)) fail(`${recordPath} が既にある`);
// どれかのブランチ（手元か origin。main を含む）が足したことのある番号は使わない（並行する取り込みが同じ番号を取らない。
// plan/design-investigation-review.md 4.3 節）
const branches = recordingIdsInBranches();
if (branches.note !== '') console.error(`注意: ${branches.note}`);
if (branches.ids.some((x) => /^\d+$/.test(x) && Number(x) === Number(values.id))) {
  fail(
    `録画 ${values.id} はほかのブランチ（か main）が records/recordings/ に足している。次の空き番号は ${freeRecordingIds(1, branches.ids)[0]}（--id を省くと道具が選ぶ）`,
  );
}

// Drive の record の取り込み元（drive: のとき）
const drive = fromDrive === null ? null : await Drive.connect();
let driveSource: DriveFile | null = null;
if (drive !== null) {
  try {
    driveSource = await drive.resolve(envId('NIKKE_DRIVE_RECORD_FOLDER_ID'), fromDrive!);
  } catch (e) {
    fail(`${(e as Error).message}（--list-record で一覧）`);
  }
  if (drive.isFolder(driveSource)) fail(`drive:${fromDrive} はフォルダ`);
}

function dateOf(): string {
  if (values.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) fail('--date は YYYY-MM-DD');
    return values.date;
  }
  const m = /(\d{4})[-_]?(\d{2})[-_]?(\d{2})/.exec(basename(fromDrive ?? source!));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (driveSource?.modifiedTime) {
    // クラウドの時計は UTC なので、撮った場所（日本）の日付にする
    const t = new Date(Date.parse(driveSource.modifiedTime) + 9 * 3600 * 1000);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const t = statSync(source!).mtime;
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function characterOf(rid: number): CharacterData {
  const path = `${ROOT}packages/core/data/characters/${rid}.json`;
  if (!existsSync(path)) fail(`rid ${rid} のキャラのデータが無い（${path}）`);
  return JSON.parse(readFileSync(path, 'utf8')) as CharacterData;
}
const characterName = (rid: number): string => characterOf(rid).name.ja;

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
if (drive !== null) {
  // 種別フォルダに同じ名前があれば止める（受け口の move も上書きしないが、取り寄せる前に分かる）
  const folderHit = await drive.children(envId('NIKKE_DRIVE_FOLDER_ID'), folder);
  for (const f of folderHit)
    if ((await drive.children(f.id, file)).length > 0) fail(`${remoteFile} が既にある（上書きしない）`);
} else if (driveSkip === null) {
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
  // コピー先はリモートの名前を付けて書く（付けないとローカルのパスと見なされ、手元へダウンロードされる。2026-10-23 の試し）
  const r = rclone(['backend', 'copyid', `${remoteName()}:`, hit.ID, remoteFile]);
  if (r.status !== 0) {
    console.error(`Drive の中のコピーに失敗した（E: から上げる）: ${r.stderr.trim()}`);
    return false;
  }
  return true;
}

mkdirSync(dir, { recursive: true });
if (drive !== null) {
  // 取り寄せは .part に書いてから名前を変える（途中で止まったものを録画と見なさない。fetch.ts と同じ）
  const part = `${dest}.part`;
  await drive.download(driveSource!.id, part);
  renameSync(part, dest);
} else if (values.copy) copyFileSync(source, dest);
else {
  try {
    renameSync(source, dest);
  } catch {
    copyFileSync(source, dest);
    unlinkSync(source);
  }
}
console.error(`${source} → ${dest}（${drive !== null ? '取り寄せ' : values.copy ? '複製' : '移動'}）`);

const probe = ffprobe(dest);
const fullDigest = await sha256(dest);
const digest = fullDigest.slice(0, 12);
const controlled = values.controlled === undefined ? null : Number(values.controlled);
const entry: ProjectRecording = {
  id: values.id,
  date,
  folder,
  file,
  original: basename(fromDrive ?? source),
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
    ...(treasure.has(i + 1) ? { treasurePhase: treasure.get(i + 1)! } : {}),
  })),
  target: { name: values.target ?? '', element: (values.element as Element | undefined) ?? null },
  mode: (values.mode as RecordingMode | undefined) ?? null,
  fixedSpec: onOff(values['fixed-spec'], '--fixed-spec'),
  autoFire: onOff(values['auto-fire'], '--auto-fire'),
  autoBurst: onOff(values['auto-burst'], '--auto-burst'),
  conditionNote: values.note[0] ?? '',
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
  ...(values.note.length === 0 ? ['conditionNote'] : []),
];
if (missing.length > 0) console.log(`人が埋める項目: ${missing.join('、')}`);
console.log(`キャラの確かめは node tools/captures/probe-result.ts "${dest}" --list`);
if (folder === 'interception')
  console.log(
    `リザルト画面の読み取りは、読む検証を起案してから node tools/captures/result-screen.ts cut ${values.id}（plan/design-result-screen.md）`,
  );

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

/** クラウド: 取り寄せたものを record の写しのハッシュと突き合わせ、受け口で種別フォルダへ規約名で移す */
async function moveInDrive(): Promise<boolean> {
  const sums = await drive!.checksums(driveSource!.id);
  let matched: 'sha256' | 'md5';
  if (sums.sha256 !== undefined) {
    if (sums.sha256 !== fullDigest) {
      console.error(`sha256 が一致しない（取り寄せたもの: ${digest}、record: ${sums.sha256.slice(0, 12)}）`);
      return false;
    }
    matched = 'sha256';
  } else if (sums.md5 !== undefined && sums.md5 === (await md5(dest))) matched = 'md5';
  else {
    console.error(`record の写しのハッシュを突き合わせられない（md5 ${sums.md5 ?? 'なし'}）`);
    return false;
  }
  try {
    const r = await move('record', fromDrive!, `${folder}/${file}`);
    return r.how === 'move'
      ? placed('クラウドで record から移した', 'cloud-move', matched)
      : placed('クラウドで record からコピーし、元をごみ箱へ移した', 'cloud-copy', matched);
  } catch (e) {
    console.error(`Drive の中で移せなかった: ${(e as Error).message}`);
    return false;
  }
}

// Drive の同じ種別フォルダに置き、ハッシュを突き合わせる
async function syncToDrive(): Promise<boolean> {
  if (drive !== null) return moveInDrive();
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
      return placed('Drive の中で取り込み元の写しからコピーした', 'drive-copy', matched);
    }
    console.error('Drive の中のコピーが E: と違うので、E: から上げ直す');
  }
  const r = rclone(['copyto', dest, remoteFile]);
  if (r.status !== 0) {
    console.error(`Drive に上げられなかった: ${r.stderr.trim()}`);
    return false;
  }
  const matched = await verifyDrive();
  return matched !== null && placed('E: から上げた', 'upload', matched);
}

// 置けたら録画の JSON に backup を書き足す（plan/design-workflow-simplification.md 2 節。backup-log.md には書かない）
function placed(how: string, via: BackupVia, matched: RecordingBackup['matched']): true {
  console.log(`${remoteFile} に置いた（${how}。${matched} が一致）`);
  // 日本の時刻で書く（クラウドの時計は UTC）
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  entry.backup = { at: `${now.toISOString().slice(0, 16)}+09:00`, via, matched };
  writeFileSync(recordPath, `${JSON.stringify(entry, null, 2)}\n`);
  console.log(`${recordPath} に Drive に置いた記録（backup）を書いた`);
  return true;
}

if (!(await syncToDrive())) {
  if (drive !== null) {
    console.error(
      `records/recordings/${values.id}.json と ${dest} は書いたが、Drive の record の写しは移していない。原因を直したら、その 2 つを消して回し直す`,
    );
    process.exit(1);
  }
  console.error(
    '取り込み（移動と records/recordings の JSON）は済んでいる。Drive へは npm run drive:sync で上げる（plan/captures/storage.md「バックアップ」）',
  );
  process.exit(1);
}
