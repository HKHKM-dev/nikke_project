// rclone の薄いラッパ（plan/design-cloud-environment.md 4 節）。デスクトップの同期（sync.ts）と、録画の道具の Drive への書き込みが使う。
// rclone は NIKKE_RCLONE（無ければ PATH の rclone）、リモートの名前は NIKKE_RCLONE_REMOTE（無ければ gdrive）。
// 認可（オーナーの Google アカウントの OAuth）は rclone の設定ファイルにあり、リポジトリには置かない（plan/captures/storage.md「バックアップ」）。
import { spawnSync } from 'node:child_process';

export type Run = { status: number; stdout: string; stderr: string };

export function remoteName(): string {
  return process.env['NIKKE_RCLONE_REMOTE'] ?? 'gdrive';
}

/** Drive の録画の置き場所（マイドライブの nikke_project_captures。E: の nikke_project_captures の同期の相手） */
export function driveCaptures(): string {
  return `${remoteName()}:nikke_project_captures`;
}

/** rclone を起動する。inherit なら出力をそのまま流す（進み具合を見せる） */
export function rclone(args: readonly string[], inherit = false): Run {
  const r = spawnSync(process.env['NIKKE_RCLONE'] ?? 'rclone', args, {
    encoding: 'utf8',
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) return { status: -1, stdout: '', stderr: r.error.message };
  return { status: r.status ?? -1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

/**
 * Drive に書けないときの理由（書けるなら null）。クラウド環境（Drive への書き込みは受け口の段 ②）・rclone が無い・
 * リモートが無い、の 3 つ
 */
export function driveUnavailable(): string | null {
  if (process.env['CLAUDE_CODE_REMOTE'] === 'true') return 'クラウド環境';
  const r = rclone(['listremotes']);
  if (r.status !== 0) return 'rclone が無い（plan/captures/storage.md「バックアップ」の準備）';
  if (!r.stdout.split(/\r?\n/).includes(`${remoteName()}:`))
    return `rclone のリモート ${remoteName()}: が無い（plan/captures/storage.md「バックアップ」の準備）`;
  return null;
}

/** rclone lsjson の 1 件（使うものだけ） */
export type Entry = { Path: string; Name: string; Size: number; ModTime: string; IsDir: boolean; ID?: string };

/** rclone lsjson。無い・失敗したら null */
export function lsjson(path: string, extra: readonly string[] = []): Entry[] | null {
  const r = rclone(['lsjson', ...extra, path]);
  if (r.status !== 0) return null;
  return JSON.parse(r.stdout) as Entry[];
}

/** Drive の 1 ファイルのハッシュ（Drive が持っている値。ダウンロードしない）。無い・持っていないときは null */
export function driveHash(file: string, kind: 'sha256' | 'md5'): string | null {
  const r = rclone(['hashsum', kind, file]);
  if (r.status !== 0) return null;
  const m = /^([0-9a-f]{32,64})\s/.exec(r.stdout.trim());
  return m ? m[1]! : null;
}
