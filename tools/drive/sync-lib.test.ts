// デスクトップと Google Drive の同期の決まりごと（plan/design-cloud-environment.md 4 節）。rclone は呼ばない。
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bisyncArgs,
  classifyDriveRenames,
  driveRenames,
  hookShouldSkip,
  isConflictName,
  lockIsLive,
  type Pair,
  relUnder,
  splitRel,
  SYNC_MARKER,
  topFolder,
  trashDir,
} from './sync-lib.ts';

const pair: Pair = {
  name: 'captures',
  local: resolve('/tmp/x/nikke_project_captures'),
  remote: 'gdrive:nikke_project_captures',
  filters: 'tools/drive/filters/captures.txt',
  checkAccess: true,
};

describe('drive/sync-lib', () => {
  it('bisync の引数は、衝突を両方残して側を付け、ローカルで消すものを同じドライブへ退避する', () => {
    const args = bisyncArgs(pair, { resync: false, dryRun: false, checkAccess: true, verbose: false });
    expect(args.slice(0, 3)).toEqual(['bisync', pair.local, pair.remote]);
    const value = (flag: string) => args[args.indexOf(flag) + 1];
    expect(value('--filters-file')).toBe(pair.filters);
    expect(value('--conflict-resolve')).toBe('none');
    expect(value('--conflict-loser')).toBe('pathname');
    expect(value('--conflict-suffix')).toBe('conflict-desktop,conflict-drive');
    expect(value('--backup-dir1')).toBe(join(resolve('/tmp/x'), 'nikke_sync_trash', 'captures'));
    expect(value('--max-delete')).toBe('50');
    expect(args).toContain('--suffix-keep-extension');
    expect(args).toContain('--check-access');
    expect(value('--check-filename')).toBe(SYNC_MARKER);
    expect(args).not.toContain('--resync');
    expect(args).not.toContain('--dry-run');
  });

  it('初回の空打ちは --resync と --dry-run を付け、目印が無ければ --check-access を外せる', () => {
    const args = bisyncArgs(pair, { resync: true, dryRun: true, checkAccess: false, verbose: true });
    expect(args).toContain('--resync');
    expect(args).toContain('--dry-run');
    expect(args).toContain('-v');
    expect(args).not.toContain('--check-access');
    expect(args).not.toContain('--check-filename');
  });

  it('退避先は Path1 の外（同じドライブの nikke_sync_trash/<対>）', () => {
    expect(trashDir(pair)).toBe(join(resolve('/tmp/x'), 'nikke_sync_trash', 'captures'));
    expect(relUnder(pair.local, trashDir(pair))).toBeNull();
  });

  it('衝突で別名にしたファイルを見分ける（拡張子を保った名前・番号つき・クラウドの受け口）', () => {
    expect(isConflictName('owner.conflict-desktop.md')).toBe(true);
    expect(isConflictName('owner.conflict-drive.md')).toBe(true);
    expect(isConflictName('owner.conflict-cloud.md')).toBe(true);
    expect(isConflictName('0064_f100.conflict-drive2.jpg')).toBe(true);
    expect(isConflictName('SYNC_MARKER_DO_NOT_DELETE.conflict-desktop.txt')).toBe(true);
    expect(isConflictName('owner.md')).toBe(false);
    expect(isConflictName('conflict-desktop.md')).toBe(false);
    expect(isConflictName('20261002-951_rl_conflict-x.mp4')).toBe(false);
  });

  it('根の下の相対パス（/ 区切り）。根の外・根そのものは null', () => {
    const root = resolve('/tmp/record');
    expect(relUnder(root, join(root, 'Captures', 'a.mp4'))).toBe('Captures/a.mp4');
    expect(relUnder(root, join(root, 'a.mp4'))).toBe('a.mp4');
    expect(relUnder(root, root)).toBeNull();
    expect(relUnder(root, resolve('/tmp/recordings/a.mp4'))).toBeNull();
    expect(relUnder(root, resolve('/tmp/a.mp4'))).toBeNull();
  });

  it('相対パスを親と名前に分ける', () => {
    expect(splitRel('Captures/a.mp4')).toEqual({ dir: 'Captures', name: 'a.mp4' });
    expect(splitRel('a.mp4')).toEqual({ dir: '', name: 'a.mp4' });
    expect(topFolder('range/a.mp4')).toBe('range');
    expect(topFolder(SYNC_MARKER)).toBe('');
  });

  it('フックの同期は、前の成功から 30 分たつまで飛ばす', () => {
    const now = Date.UTC(2026, 9, 23, 12, 0);
    const boot = now - 3600_000;
    expect(hookShouldSkip(null, now, boot)).toBe(false);
    expect(hookShouldSkip(now - 29 * 60_000, now, boot)).toBe(true);
    expect(hookShouldSkip(now - 31 * 60_000, now, boot)).toBe(false);
    // 時計が戻ったときは飛ばさない
    expect(hookShouldSkip(now + 60_000, now, boot)).toBe(false);
    // 前の成功が PC の起動より前（切る前の同期）なら、30 分たっていなくても飛ばさない
    expect(hookShouldSkip(now - 20 * 60_000, now, now - 5 * 60_000)).toBe(false);
  });

  it('ロックは、持ち主が生きていて 2 時間たっていないときだけ効く', () => {
    const now = Date.UTC(2026, 9, 23, 12, 0);
    expect(lockIsLive(null, now, () => true)).toBe(false);
    expect(lockIsLive({ pid: 1, time: now - 60_000 }, now, () => true)).toBe(true);
    expect(lockIsLive({ pid: 1, time: now - 60_000 }, now, () => false)).toBe(false);
    expect(lockIsLive({ pid: 1, time: now - 3 * 3600_000 }, now, () => true)).toBe(false);
  });

  it('振り直しで Drive でも変えるものは derived を除き、同じ元は 1 回だけ', () => {
    const renames = driveRenames([
      { from: 'range/20261002-951_rl_x.mp4', to: 'range/20261002-9605_rl_x.mp4', kind: 'video' },
      { from: 'frames/951_f1200_ammo.jpg', to: 'frames/9605_f1200_ammo.jpg', kind: 'frame' },
      { from: 'derived/951', to: 'derived/9605', kind: 'derived' },
      { from: 'frames/951_f1200_ammo.jpg', to: 'frames/9605_f1200_ammo.jpg', kind: 'frame' },
    ]);
    expect(renames).toEqual([
      { from: 'range/20261002-951_rl_x.mp4', to: 'range/20261002-9605_rl_x.mp4' },
      { from: 'frames/951_f1200_ammo.jpg', to: 'frames/9605_f1200_ammo.jpg' },
    ]);
  });

  it('Drive の今の名前で、変える・もう変えてある・無い・両方ある に分ける', () => {
    const onDrive = new Set(['range/a-951.mp4', 'frames/b-9605.jpg', 'frames/c-951.jpg', 'frames/c-9605.jpg']);
    const r = classifyDriveRenames(
      [
        { from: 'range/a-951.mp4', to: 'range/a-9605.mp4' },
        { from: 'frames/b-951.jpg', to: 'frames/b-9605.jpg' },
        { from: 'frames/d-951.jpg', to: 'frames/d-9605.jpg' },
        { from: 'frames/c-951.jpg', to: 'frames/c-9605.jpg' },
      ],
      (p) => onDrive.has(p),
    );
    expect(r.apply.map((x) => x.from)).toEqual(['range/a-951.mp4']);
    expect(r.done.map((x) => x.from)).toEqual(['frames/b-951.jpg']);
    expect(r.missing.map((x) => x.from)).toEqual(['frames/d-951.jpg']);
    expect(r.both.map((x) => x.from)).toEqual(['frames/c-951.jpg']);
  });
});
