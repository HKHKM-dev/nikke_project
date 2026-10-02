// Google Drive のバックアップ（マイドライブ/nikke_project_captures と old_nikkecalc）から録画などを取り寄せる。
// クラウド環境で解析するため。
//   node tools/captures/fetch.ts <録画 id | 相対パス>... [--legacy] [--force]
//   node tools/captures/fetch.ts --list [相対パス] [--legacy]
// 録画 id（3 桁）は records/recordings/<id>.json の folder と file から Drive 上のパスを決め、落としたら sha256 の
// 先頭 12 桁を台帳と突き合わせる。旧プロジェクトの録画 id（L-）は台帳の path から old_nikkecalc の下を引く（台帳に
// sha256 が無いので突き合わせない）。相対パス（例: frames/064_xxx.jpg、reference/tooltips）は Drive 上のそのままで、
// --legacy を付けると old_nikkecalc の下を指す。フォルダを指すと中身を全部落とす。置き場所は dirs.ts（既にあるものは
// 落とさない。--force で落とし直す）。
// 環境変数: NIKKE_DRIVE_SA_KEY（drive.ts）、NIKKE_DRIVE_FOLDER_ID（nikke_project_captures フォルダの ID）、
// NIKKE_DRIVE_LEGACY_FOLDER_ID（old_nikkecalc フォルダの ID。旧プロジェクトのものを取るときだけ）。フォルダの ID は
// カンマ区切りで複数書ける（環境変数の設定欄は 1 行 1 変数なので改行では分けられない）。前に書いたフォルダから探し、
// 最初に見つかったものを使う。--list は全部のフォルダの中身を合わせて出す（同名は前のフォルダのもの）。
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import type { RecordingEntry } from '../../packages/core/src/records/recordings.ts';
import { LEGACY_PREFIX, capturesDir, legacyDir } from './dirs.ts';
import { Drive, type DriveFile } from './drive.ts';
import { sha256 } from './ffmpeg.ts';

const RECORDINGS_DIR = new URL('../../records/recordings/', import.meta.url);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    legacy: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

const usage =
  'usage: node tools/captures/fetch.ts <録画 id | 相対パス>... [--legacy] [--force]  /  --list [相対パス] [--legacy]';
if (!values.list && positionals.length === 0) {
  console.error(usage);
  process.exit(2);
}

/** legacy は old_nikkecalc（旧プロジェクトのアーカイブ）の下 */
type Target = { legacy: boolean; relPath: string; sha256?: string };

function toTarget(arg: string): Target {
  if (!/^(\d{3}|L-[A-Z0-9]+)$/.test(arg)) {
    return { legacy: values.legacy, relPath: arg.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '') };
  }
  const path = new URL(`${arg}.json`, RECORDINGS_DIR);
  if (!existsSync(path)) throw new Error(`${arg}: records/recordings/${arg}.json がありません`);
  const entry = JSON.parse(readFileSync(path, 'utf8')) as RecordingEntry;
  if (!('legacy' in entry)) return { legacy: false, relPath: `${entry.folder}/${entry.file}`, sha256: entry.sha256 };
  if (!entry.path.startsWith(LEGACY_PREFIX))
    throw new Error(`${arg}: path が ${LEGACY_PREFIX} の下にない（${entry.path}）`);
  return { legacy: true, relPath: entry.path.slice(LEGACY_PREFIX.length) };
}

function rootIds(legacy: boolean): string[] {
  const [name, folder] = legacy
    ? ['NIKKE_DRIVE_LEGACY_FOLDER_ID', 'old_nikkecalc']
    : ['NIKKE_DRIVE_FOLDER_ID', 'nikke_project_captures'];
  const ids = (process.env[name] ?? '').split(/[,\s]+/).filter((id) => id !== '');
  if (ids.length === 0) throw new Error(`環境変数 ${name}（Drive の ${folder} フォルダの ID）がありません`);
  return ids;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

let drive: Drive;
try {
  drive = await Drive.connect();
} catch (error) {
  console.error(message(error));
  process.exit(1);
}

/** 根のフォルダ（複数）の中で relPath を引く。前のフォルダにあればそれ。all は見つかったものを全部返す */
async function resolveIn(roots: string[], relPath: string, all = false): Promise<DriveFile[]> {
  const found: DriveFile[] = [];
  const errors: string[] = [];
  for (const root of roots) {
    try {
      found.push(await drive.resolve(root, relPath));
      if (!all) break;
    } catch (error) {
      errors.push(roots.length > 1 ? `${message(error)}（フォルダ ${root}）` : message(error));
    }
  }
  if (found.length === 0) throw new Error(errors.join('\n'));
  return found;
}

if (values.list) {
  try {
    const target = toTarget(positionals[0] ?? '');
    const seen = new Set<string>();
    const entries: DriveFile[] = [];
    for (const folder of await resolveIn(rootIds(target.legacy), target.relPath, true)) {
      for (const f of await drive.children(folder.id)) {
        if (seen.has(f.name)) continue;
        seen.add(f.name);
        entries.push(f);
      }
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const f of entries) {
      const size = drive.isFolder(f) ? '/' : ` ${(Number(f.size ?? 0) / 1024 / 1024).toFixed(1)} MB`;
      console.log(`${f.name}${size}`);
    }
  } catch (error) {
    console.error(message(error));
    process.exit(1);
  }
  process.exit(0);
}

let failed = 0;

async function fetchFile(file: DriveFile, base: string, relPath: string, expected?: string): Promise<void> {
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

async function fetchTree(file: DriveFile, base: string, relPath: string, expected?: string): Promise<void> {
  if (!drive.isFolder(file)) return fetchFile(file, base, relPath, expected);
  for (const child of await drive.children(file.id)) await fetchTree(child, base, `${relPath}/${child.name}`);
}

for (const arg of positionals) {
  try {
    const target = toTarget(arg);
    const file = (await resolveIn(rootIds(target.legacy), target.relPath))[0]!;
    await fetchTree(file, target.legacy ? legacyDir() : capturesDir(), target.relPath, target.sha256);
  } catch (error) {
    failed += 1;
    console.error(message(error));
  }
}
if (failed > 0) process.exit(1);
