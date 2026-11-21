// Google Drive のバックアップ（マイドライブ/nikke_project_captures と old_nikkecalc）から録画などを取り寄せる。
// クラウド環境で解析するため。
//   node tools/captures/fetch.ts <録画 id | 相対パス | drive:<record の中の相対パス>>... [--legacy] [--force]
//   node tools/captures/fetch.ts --list [相対パス | drive:[相対パス]] [--legacy]
// 録画 id（3〜4 桁）は records/recordings/<id>.json の folder と file から Drive 上のパスを決め、落としたら sha256 の
// 先頭 12 桁を台帳と突き合わせる。旧プロジェクトの録画 id（L-）は台帳の path から old_nikkecalc の下を引く（台帳に
// sha256 が無いので突き合わせない）。相対パス（例: frames/064_xxx.jpg、reference/tooltips）は Drive 上のそのままで、
// --legacy を付けると old_nikkecalc の下を指す。フォルダを指すと中身を全部落とす。置き場所は dirs.ts（既にあるものは
// 落とさない。比べ方と、手元と違うときの扱いは fetch-lib.ts。--force で落とし直す）。落としたもの・既にあるものは、
// 手元のパスを「取得」「あり」の行に出す。
// drive:<相対パス> は、まだ取り込んでいない録画（Drive の「マイ コンピュータ/record」。intake.ts の drive: と同じ指し方）を、
// 取り込む前の下見のために落とす。置き場所は dirs.ts の recordFetchDir（台帳が無いので突き合わせない。取り込みは intake.ts が
// 別に取り寄せる）。取り込み元のフォルダが手元にある環境（dirs.ts の recordDir。Windows）では落とさず、手元のパスを出す。
// 環境変数: NIKKE_DRIVE_SA_KEY（drive.ts）、NIKKE_DRIVE_FOLDER_ID（nikke_project_captures フォルダの ID）、
// NIKKE_DRIVE_LEGACY_FOLDER_ID（old_nikkecalc フォルダの ID。旧プロジェクトのものを取るときだけ）、
// NIKKE_DRIVE_RECORD_FOLDER_ID（record フォルダの ID。drive: のときだけ）。フォルダの ID は
// カンマ区切りで複数書ける（環境変数の設定欄は 1 行 1 変数なので改行では分けられない）。前に書いたフォルダから探し、
// 最初に見つかったものを使う。--list は全部のフォルダの中身を合わせて出す（同名は前のフォルダのもの）。
import { existsSync, readFileSync } from 'node:fs';
import type { RecordingEntry } from '../../packages/core/src/records/recordings.ts';
import {
  LEGACY_PREFIX,
  capturesDir,
  driveRecordPath,
  legacyDir,
  recordDir,
  recordFetchDir,
  relPath as normalizeRel,
} from './dirs.ts';
import { Drive, DRIVE_CALL_MS, type DriveFile } from './drive.ts';
import { type Area, type FetchContext, type Target, fetchTarget, once, resolveIn } from './fetch-lib.ts';
import { reason } from '../drive/cloud-lib.ts';
import { cliArgs, fail } from '../../packages/core/scripts/cli.ts';

const RECORDINGS_DIR = new URL('../../records/recordings/', import.meta.url);

const { values, positionals } = cliArgs(import.meta.url, {
  allowPositionals: true,
  options: {
    list: { type: 'boolean', default: false },
    legacy: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

if (!values.list && positionals.length === 0) fail();

/** 区分ごとの Drive のフォルダ（環境変数とその名前）と、落とす先 */
const ROOTS: Record<Area, { env: string; folder: string; local: () => string }> = {
  captures: { env: 'NIKKE_DRIVE_FOLDER_ID', folder: 'nikke_project_captures', local: capturesDir },
  legacy: { env: 'NIKKE_DRIVE_LEGACY_FOLDER_ID', folder: 'old_nikkecalc', local: legacyDir },
  record: { env: 'NIKKE_DRIVE_RECORD_FOLDER_ID', folder: 'マイ コンピュータ/record', local: recordFetchDir },
};

function toTarget(arg: string): Target {
  const fromRecord = driveRecordPath(arg);
  if (fromRecord !== null) return { area: 'record', relPath: fromRecord };
  if (!/^(\d{3,4}|L-[A-Z0-9]+)$/.test(arg)) {
    return { area: values.legacy ? 'legacy' : 'captures', relPath: normalizeRel(arg) };
  }
  const path = new URL(`${arg}.json`, RECORDINGS_DIR);
  if (!existsSync(path)) throw new Error(`${arg}: records/recordings/${arg}.json がありません`);
  const entry = JSON.parse(readFileSync(path, 'utf8')) as RecordingEntry;
  if (!('legacy' in entry)) return { area: 'captures', relPath: `${entry.folder}/${entry.file}`, sha256: entry.sha256 };
  if (!entry.path.startsWith(LEGACY_PREFIX))
    throw new Error(`${arg}: path が ${LEGACY_PREFIX} の下にない（${entry.path}）`);
  return { area: 'legacy', relPath: entry.path.slice(LEGACY_PREFIX.length) };
}

function rootIds(area: Area): string[] {
  const { env, folder } = ROOTS[area];
  const ids = (process.env[env] ?? '').split(/[,\s]+/).filter((id) => id !== '');
  if (ids.length === 0) throw new Error(`環境変数 ${env}（Drive の ${folder} フォルダの ID）がありません`);
  return ids;
}

const ctx: FetchContext = {
  // 繋げなければ、残りの指定でも同じ理由で止まるので、1 回だけ出して終える
  drive: once(() =>
    Drive.connect(DRIVE_CALL_MS).catch((error: unknown) => {
      console.error(reason(error));
      process.exit(1);
    }),
  ),
  roots: rootIds,
  localBase: (area) => ROOTS[area].local(),
  recordDir,
  force: values.force,
  log: (line) => console.log(line),
};

if (values.list) {
  try {
    const target = toTarget(positionals[0] ?? '');
    const roots = rootIds(target.area);
    const drive = await ctx.drive();
    const seen = new Set<string>();
    const entries: DriveFile[] = [];
    for (const folder of await resolveIn(drive, roots, target.relPath, true)) {
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
    console.error(reason(error));
    process.exit(1);
  }
  process.exit(0);
}

let failed = 0;
for (const arg of positionals) {
  try {
    await fetchTarget(toTarget(arg), arg, ctx);
  } catch (error) {
    failed += 1;
    console.error(reason(error));
  }
}
if (failed > 0) process.exit(1);
