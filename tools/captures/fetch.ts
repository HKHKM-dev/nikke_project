// Google Drive のバックアップ（マイドライブ/nikke_project_captures）から録画などを取り寄せる。クラウド環境で解析するため。
//   node tools/captures/fetch.ts <録画 id | 相対パス>... [--force]
//   node tools/captures/fetch.ts --list [相対パス]
// 録画 id（3 桁）は records/recordings/<id>.json の folder と file から Drive 上のパスを決め、落としたら sha256 の
// 先頭 12 桁を台帳と突き合わせる（旧プロジェクトの L- は Drive に無いので断る）。相対パス（例: frames/064_xxx.jpg、reference/tooltips）は Drive 上のそのまま。
// フォルダを指すと中身を全部落とす。置き場所は dirs.ts（既にあるものは落とさない。--force で落とし直す）。
// 環境変数: NIKKE_DRIVE_SA_KEY（drive.ts）と NIKKE_DRIVE_FOLDER_ID（nikke_project_captures フォルダの ID）。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { RecordingEntry } from '../../packages/core/src/records/recordings.ts';
import { capturesDir } from './dirs.ts';
import { Drive, type DriveFile } from './drive.ts';
import { sha256 } from './ffmpeg.ts';

const RECORDINGS_DIR = new URL('../../records/recordings/', import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { list: { type: 'boolean', default: false }, force: { type: 'boolean', default: false } },
});

const usage = 'usage: node tools/captures/fetch.ts <録画 id | 相対パス>... [--force]  /  --list [相対パス]';
if (!values.list && positionals.length === 0) {
  console.error(usage);
  process.exit(2);
}
const rootId = process.env.NIKKE_DRIVE_FOLDER_ID;
if (!rootId) {
  console.error('環境変数 NIKKE_DRIVE_FOLDER_ID（Drive の nikke_project_captures フォルダの ID）がありません');
  process.exit(2);
}

type Target = { relPath: string; sha256?: string };

function toTarget(arg: string): Target {
  if (!/^(\d{3}|L-[A-Z0-9]+)$/.test(arg)) return { relPath: arg.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') };
  const path = new URL(`${arg}.json`, RECORDINGS_DIR);
  if (!existsSync(path)) throw new Error(`${arg}: records/recordings/${arg}.json がありません`);
  const entry = JSON.parse(readFileSync(path, 'utf8')) as RecordingEntry;
  if ('legacy' in entry) throw new Error(`${arg}: 旧プロジェクトの録画は Drive のバックアップに無い（${entry.path}）`);
  return { relPath: `${entry.folder}/${entry.file}`, sha256: entry.sha256 };
}

let drive: Drive;
try {
  drive = await Drive.connect();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (values.list) {
  const relPath = positionals[0] ?? '';
  const folder = await drive.resolve(rootId, toTarget(relPath).relPath);
  for (const f of await drive.children(folder.id)) {
    const size = drive.isFolder(f) ? '/' : ` ${(Number(f.size ?? 0) / 1024 / 1024).toFixed(1)} MB`;
    console.log(`${f.name}${size}`);
  }
  process.exit(0);
}

const base = capturesDir();
let failed = 0;

async function fetchFile(file: DriveFile, relPath: string, expected?: string): Promise<void> {
  const out = join(base, relPath);
  if (existsSync(out) && !values.force) {
    if (!expected || (await sha256(out)).startsWith(expected)) {
      console.log(`あり  ${out}`);
      return;
    }
    console.log(`sha256 が台帳と違うので落とし直す: ${out}`);
  }
  mkdirSync(dirname(out), { recursive: true });
  const part = `${out}.part`;
  await drive.download(file.id, part);
  if (expected) {
    const digest = await sha256(part);
    if (!digest.startsWith(expected)) {
      rmSync(part);
      throw new Error(`${relPath}: sha256 が台帳（${expected}）と違う（${digest.slice(0, 12)}）`);
    }
  }
  renameSync(part, out);
  console.log(`取得  ${out}（${(Number(file.size ?? 0) / 1024 / 1024).toFixed(1)} MB）`);
}

async function fetchTree(file: DriveFile, relPath: string, expected?: string): Promise<void> {
  if (!drive.isFolder(file)) return fetchFile(file, relPath, expected);
  for (const child of await drive.children(file.id)) await fetchTree(child, `${relPath}/${child.name}`);
}

for (const arg of positionals) {
  try {
    const target = toTarget(arg);
    await fetchTree(await drive.resolve(rootId, target.relPath), target.relPath, target.sha256);
  } catch (error) {
    failed += 1;
    console.error(error instanceof Error ? error.message : error);
  }
}
if (failed > 0) process.exit(1);
