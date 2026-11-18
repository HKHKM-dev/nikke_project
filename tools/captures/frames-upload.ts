// 証拠フレームの置き場所（<録画の置き場所>/frames/）に書いたファイルを、Drive の nikke_project_captures/frames/ にも上げる
// （道具の終わりの同期。plan/design-cloud-environment.md 4.2 節）。上げられなくても書き出しは済んでいて、次の同期で上がる。
// frames/ の外のファイルは何もしない。still.ts が使う。何枚でも rclone は 1 回だけ回す。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { driveCaptures, driveUnavailable, rclone } from '../drive/rclone.ts';
import { relUnder } from '../drive/sync-lib.ts';
import { capturesDir } from './dirs.ts';

export function uploadFrames(paths: readonly string[]): void {
  const framesDir = join(capturesDir(), 'frames');
  const rels = paths.map((p) => relUnder(framesDir, p)).filter((r): r is string => r !== null);
  if (rels.length === 0) return;
  const skip = driveUnavailable();
  if (skip !== null) {
    console.log(`Drive には上げていない（${skip}）`);
    return;
  }
  const remote = `${driveCaptures()}/frames`;
  let r: ReturnType<typeof rclone>;
  if (rels.length === 1) r = rclone(['copyto', join(framesDir, rels[0]!), `${remote}/${rels[0]}`]);
  else {
    // 複数は、上げるファイルの並びを渡して 1 回の copy で上げる
    const dir = mkdtempSync(join(tmpdir(), 'frames-upload-'));
    try {
      const list = join(dir, 'files.txt');
      writeFileSync(list, `${rels.join('\n')}\n`);
      r = rclone(['copy', framesDir, remote, '--files-from-raw', list]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  const done =
    rels.length === 1 ? `Drive の frames/${rels[0]} にも上げた` : `Drive の frames/ にも ${rels.length} 枚を上げた`;
  console.log(
    r.status === 0 ? done : `注意: Drive に上げられなかった（次の npm run drive:sync で上がる）: ${r.stderr.trim()}`,
  );
}
