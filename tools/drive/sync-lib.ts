// デスクトップと Google Drive の同期の決まりごと（plan/design-cloud-environment.md 4 節）。rclone を呼ぶ部分（rclone.ts・sync.ts）と
// 分けて、テストできるようにする。
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** rclone bisync の対。Path1 がローカル、Path2 が Drive */
export type Pair = {
  name: string;
  local: string;
  remote: string;
  /** フィルタのファイル（リポジトリの中。変えたら、その対だけ --resync が要る） */
  filters: string;
  /** 両側の根に RCLONE_TEST を置き、ドライブが外れていて全部消えたと見なす事故を防ぐ */
  checkAccess: boolean;
};

/** デスクトップの同期が衝突のときに付ける名前（Path1 = ローカル、Path2 = Drive の順）。拡張子は保つ */
export const CONFLICT_SUFFIXES = ['conflict-desktop', 'conflict-drive'] as const;

/** 衝突で別名にしたファイルか（例: owner.conflict-desktop.md。クラウドの受け口の conflict-cloud も含む。番号が付くこともある） */
export function isConflictName(name: string): boolean {
  return /\.conflict-(desktop|drive|cloud)\d*(\.[^.]+)?$/.test(name);
}

/** ローカルで消すものの退避先（同じドライブの nikke_sync_trash/<対の名前>。移すだけで済み、Path1 と重ならない） */
export function trashDir(pair: Pair): string {
  return join(dirname(resolve(pair.local)), 'nikke_sync_trash', pair.name);
}

export function bisyncArgs(
  pair: Pair,
  opts: { resync: boolean; dryRun: boolean; checkAccess: boolean; verbose: boolean },
): string[] {
  const args = [
    'bisync',
    pair.local,
    pair.remote,
    '--filters-file',
    pair.filters,
    // 中断・電源断からの復旧（次の回で直す）
    '--resilient',
    '--recover',
    // ロックは録画（数百 MB）の上げより長く持ち、残っても 2 時間で失効させる
    '--max-lock',
    '2h',
    // 衝突は両方を残し、名前に側を付ける（2026-10-22 の決定。設計書 11.1 節の項目 7）
    '--conflict-resolve',
    'none',
    '--conflict-loser',
    'pathname',
    '--conflict-suffix',
    CONFLICT_SUFFIXES.join(','),
    '--suffix-keep-extension',
    // ローカルで消すものは退避フォルダへ（Drive 側はごみ箱へ。rclone の既定）
    '--backup-dir1',
    trashDir(pair),
    // 半分を超える削除は止める（rclone の既定。書いておく）
    '--max-delete',
    '50',
    '--drive-skip-gdocs',
    '--fast-list',
  ];
  if (opts.checkAccess) args.push('--check-access');
  if (opts.resync) args.push('--resync');
  if (opts.dryRun) args.push('--dry-run');
  if (opts.verbose) args.push('-v');
  return args;
}

/** path が root の下にあれば、root からの相対（/ 区切り）。無ければ null */
export function relUnder(root: string, path: string): string | null {
  const rel = relative(resolve(root), resolve(path));
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/** 相対パスを、親のパス（根なら空）と名前に分ける */
export function splitRel(rel: string): { dir: string; name: string } {
  const i = rel.lastIndexOf('/');
  return i < 0 ? { dir: '', name: rel } : { dir: rel.slice(0, i), name: rel.slice(i + 1) };
}

/** SessionStart フックの同期を飛ばすか（前の成功から minutes 分たっていない） */
export function hookShouldSkip(lastOk: number | null, now: number, minutes = 30): boolean {
  return lastOk !== null && now >= lastOk && now - lastOk < minutes * 60_000;
}

export type Lock = { pid: number; time: number };

/** ロックがまだ効いているか（持ち主のプロセスが生きていて、staleMs を過ぎていない） */
export function lockIsLive(
  lock: Lock | null,
  now: number,
  alive: (pid: number) => boolean,
  staleMs = 2 * 3600_000,
): boolean {
  return lock !== null && now - lock.time < staleMs && alive(lock.pid);
}

export type DriveRename = { from: string; to: string };

/** 録画の番号の振り直しで E: で変える名前のうち、Drive でも変えるもの（derived は同期しないので外す） */
export function driveRenames(renames: readonly { from: string; to: string; kind: string }[]): DriveRename[] {
  const seen = new Set<string>();
  const out: DriveRename[] = [];
  for (const r of renames) {
    if (r.kind === 'derived' || seen.has(r.from)) continue;
    seen.add(r.from);
    out.push({ from: r.from, to: r.to });
  }
  return out;
}

/** Drive の今の名前で仕分ける: 変えるもの・もう変えてあるもの・Drive に無いもの（次の同期で上がる）・両方ある（止める） */
export function classifyDriveRenames(
  renames: readonly DriveRename[],
  exists: (path: string) => boolean,
): { apply: DriveRename[]; done: DriveRename[]; missing: DriveRename[]; both: DriveRename[] } {
  const out = {
    apply: [] as DriveRename[],
    done: [] as DriveRename[],
    missing: [] as DriveRename[],
    both: [] as DriveRename[],
  };
  for (const r of renames) {
    const from = exists(r.from);
    const to = exists(r.to);
    if (from && to) out.both.push(r);
    else if (from) out.apply.push(r);
    else if (to) out.done.push(r);
    else out.missing.push(r);
  }
  return out;
}

/** 相対パスの一番上のフォルダ（種別フォルダか frames。根のファイルなら空） */
export function topFolder(rel: string): string {
  const i = rel.indexOf('/');
  return i < 0 ? '' : rel.slice(0, i);
}
