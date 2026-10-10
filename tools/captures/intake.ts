// 録画の取り込み（plan/design-records-automation.md 3.3 節）: 命名規約でリネームして置き場所に移し、素性（長さ・フレーム数・fps・
// 大きさ・sha256）を取り、records/recordings/<録画 id>.json を書く。編成・的・条件は引数で受け、無ければ空で出す（人が埋める）。
//   node tools/captures/intake.ts <元ファイル> --id NNN --name <種別内の識別子> [--folder range] [--date YYYY-MM-DD]
//        [--rid 271,870] [--controlled 1] [--target BigArms --element Fire] [--mode range-3min]
//        [--fixed-spec on|off] [--auto-fire on|off] [--auto-burst on|off] [--note "..."] [--copy] [--no-backup]
// 命名規約は plan/captures/index.md「命名規約」（<YYYYMMDD>-<番号 3 桁>_<識別子>.mp4。識別子は英小文字・数字・-・_・+）。
// 日付は --date、無ければ元のファイル名の YYYY-MM-DD、無ければファイルの更新日時。既定は移動（--copy で元を残す）。
// 最後に、移した録画を Google Drive のバックアップ先（dirs.ts の backupDir()）へ robocopy で同期し、両方の sha256 を突き合わせる
// （plan/captures/storage.md「バックアップ」）。バックアップ先が無い環境と --no-backup では同期しない。同期に失敗したら終了コード 1。
// 同期できたら plan/captures/backup-log.md に 1 行足す（sha256 の値は JSON にあるので書かない）。
// 取り込んだ後は npm run records:table（台帳の表）と、キャラの確かめに node tools/captures/probe-result.ts <動画> --list。
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
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
import { backupDir, capturesDir } from './dirs.ts';
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

// バックアップ先の同じ種別フォルダへこの 1 本だけを robocopy し（/E は付けない）、sha256 を突き合わせる。
async function backup(): Promise<boolean> {
  const root = backupDir();
  if (values['no-backup'] || root === null) {
    console.log(`Drive への同期はしていない（${values['no-backup'] ? '--no-backup' : 'バックアップ先が無い環境'}）`);
    return true;
  }
  if (!existsSync(root)) {
    console.error(`バックアップ先 ${root} が無い（Google Drive for desktop がマウントされていない？）`);
    return false;
  }
  const backupFile = join(root, folder, file);
  if (existsSync(backupFile)) {
    console.error(`${backupFile} が既にある（上書きしない）`);
    return false;
  }
  if (process.platform === 'win32') {
    // Git Bash の中で動かしても、node から直に起動するので /R:1 などはパスに変換されない
    const r = spawnSync(
      'robocopy',
      [dirname(dest), join(root, folder), file, '/R:1', '/W:1', '/NP', '/NJH', '/NJS', '/NFL', '/NDL'],
      {
        stdio: 'inherit',
      },
    );
    // 終了コードは 0〜7 が正常、8 以上が失敗
    if (r.error || r.status === null || r.status >= 8) {
      console.error(`robocopy が失敗した（終了コード ${r.status ?? r.error?.message}）`);
      return false;
    }
  } else {
    mkdirSync(join(root, folder), { recursive: true });
    copyFileSync(dest, backupFile);
  }
  if (!existsSync(backupFile)) {
    console.error(`${backupFile} ができていない`);
    return false;
  }
  const backupDigest = await sha256(backupFile);
  if (backupDigest !== fullDigest) {
    console.error(
      `sha256 が一致しない（${dest}: ${fullDigest.slice(0, 12)}、${backupFile}: ${backupDigest.slice(0, 12)}）`,
    );
    return false;
  }
  console.log(`${backupFile} に同期した（sha256 ${digest} が一致）`);
  appendBackupLog(root);
  return true;
}

// 置き場所の呼び名。ドライブ文字で始まれば E: のようにドライブだけ、それ以外はパスのまま
function placeLabel(path: string): string {
  return /^[A-Za-z]:/.exec(path)?.[0] ?? path;
}

// backup-log.md に 1 行足す（日付・足したもの・sha256 の突き合わせの結果。backup-log.md の冒頭の決まり）
function appendBackupLog(root: string): void {
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
  const from = placeLabel(capturesDir());
  const to = placeLabel(root);
  // 1 行の書式（2026-10-11。plan/design-investigation-review.md 7.3 節）。sha256 の値は records/recordings/<録画 id>.json にある
  const origin = values.copy ? ' 取り込み元の元ファイルは残した（`--copy`）。' : '';
  const line = `- ${stamp} 録画 ${values.id}${team}: \`${folder}/${file}\` を同期（${from} と ${to} で sha256 が一致）。${origin}`;
  appendFileSync(logPath, `${line}\n`);
  console.log(`${logPath} に同期の記録を足した`);
}

if (!(await backup())) {
  console.error(
    '取り込み（移動と records/recordings の JSON）は済んでいる。同期は plan/captures/storage.md「バックアップ」の手順で手で行う',
  );
  process.exit(1);
}
