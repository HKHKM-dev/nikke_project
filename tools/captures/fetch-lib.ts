// fetch.ts の取り寄せの本体。Drive は呼び出す側が渡す（テストでは差し替える）。
// 既にあるファイルは落とさない。台帳の sha256 があればそれと、無ければ Drive の大きさと比べる。大きさが違うとき、
// 落とし直すのは録画（.mp4）だけ（Drive for desktop が上げ終える前に落とした途中の版を使い続けない）。録画のほかの
// ファイル（frames/ の画など）は手元で作り直して Drive へ上げる前のことがあるので、手元を残して知らせる
// （plan/design-workflow-simplification-17.md 4 節「取り寄せの上書き」）。--force はどちらも落とし直す。
import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Drive, DriveFile } from './drive.ts';
import { sha256 } from './ffmpeg.ts';

/** Drive の根: captures は nikke_project_captures、legacy は old_nikkecalc（旧プロジェクトのアーカイブ）、record は取り込み元 */
export type Area = 'captures' | 'legacy' | 'record';
export type Target = { area: Area; relPath: string; sha256?: string };

export type FetchDrive = Pick<Drive, 'resolve' | 'children' | 'download' | 'isFolder'>;

export type FetchContext = {
  /** Drive に繋ぐ。要る所で初めて呼ぶ（鍵の無い環境でも、Drive を使わない分岐は動く） */
  drive: () => Promise<FetchDrive>;
  /** 区分ごとの Drive の根のフォルダ ID（前のものから探す） */
  roots: (area: Area) => string[];
  /** 区分ごとの落とす先 */
  localBase: (area: Area) => string;
  /** 取り込み元のフォルダが手元にあればそのパス（dirs.ts の recordDir） */
  recordDir: () => string | null;
  force: boolean;
  log: (line: string) => void;
};

/** 大きさが Drive と違うとき落とし直すファイル（録画） */
export const isRecording = (relPath: string): boolean => /\.mp4$/i.test(relPath);

export const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** 何度呼んでも make を 1 回だけ呼ぶ */
export function once<T>(make: () => Promise<T>): () => Promise<T> {
  let made: Promise<T> | undefined;
  return () => (made ??= make());
}

/** 根のフォルダ（複数）の中で relPath を引く。前のフォルダにあればそれ。all は見つかったものを全部返す */
export async function resolveIn(
  drive: FetchDrive,
  roots: string[],
  relPath: string,
  all = false,
): Promise<DriveFile[]> {
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

async function fetchFile(
  drive: FetchDrive,
  ctx: FetchContext,
  file: DriveFile,
  base: string,
  relPath: string,
  expected?: string,
): Promise<void> {
  const out = join(base, relPath);
  if (existsSync(out) && !ctx.force) {
    if (expected) {
      if ((await sha256(out)).startsWith(expected)) return ctx.log(`あり  ${out}`);
      ctx.log(`sha256 が台帳と違うので落とし直す: ${out}`);
    } else if (file.size === undefined || statSync(out).size === Number(file.size)) {
      return ctx.log(`あり  ${out}`);
    } else if (isRecording(relPath)) {
      ctx.log(`大きさが Drive と違うので落とし直す: ${out}`);
    } else {
      return ctx.log(`あり  ${out}（大きさが Drive と違う。手元を残す。Drive の版にするには --force）`);
    }
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
  ctx.log(`取得  ${out}（${(Number(file.size ?? 0) / 1024 / 1024).toFixed(1)} MB）`);
}

async function fetchTree(
  drive: FetchDrive,
  ctx: FetchContext,
  file: DriveFile,
  base: string,
  relPath: string,
  expected?: string,
): Promise<void> {
  if (!drive.isFolder(file)) return fetchFile(drive, ctx, file, base, relPath, expected);
  for (const child of await drive.children(file.id))
    await fetchTree(drive, ctx, child, base, `${relPath}/${child.name}`);
}

/** 1 つの指定を取り寄せる。arg はエラーの文に出す元の指定 */
export async function fetchTarget(target: Target, arg: string, ctx: FetchContext): Promise<void> {
  if (target.area === 'record' && target.relPath === '')
    throw new Error(`${arg}: drive: の後に record の中のパスが要る（一覧は --list drive:）`);
  const localRecord = target.area === 'record' ? ctx.recordDir() : null;
  if (localRecord !== null) {
    const local = join(localRecord, target.relPath);
    if (!existsSync(local)) throw new Error(`${arg}: 手元の取り込み元に無い（${local}）`);
    return ctx.log(`あり  ${local}`);
  }
  const roots = ctx.roots(target.area);
  const drive = await ctx.drive();
  const file = (await resolveIn(drive, roots, target.relPath))[0]!;
  await fetchTree(drive, ctx, file, ctx.localBase(target.area), target.relPath, target.sha256);
}
