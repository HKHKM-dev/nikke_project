// 証拠フレームの置き場所（<録画の置き場所>/frames/）に書いたファイルを、Drive の nikke_project_captures/frames/ にも上げる
// （道具の終わりの同期。plan/design-cloud-environment.md 4.2 節）。上げられなくても書き出しは済んでいて、次の同期で上がる。
// frames/ の外のファイルは何もしない。still.ts と result-screen.ts が使う。
import { join } from 'node:path';
import { driveCaptures, driveUnavailable, rclone } from '../drive/rclone.ts';
import { relUnder } from '../drive/sync-lib.ts';
import { capturesDir } from './dirs.ts';

export function uploadFrame(out: string): void {
  const rel = relUnder(join(capturesDir(), 'frames'), out);
  if (rel === null) return;
  const skip = driveUnavailable();
  if (skip !== null) {
    console.log(`Drive には上げていない（${skip}）`);
    return;
  }
  const r = rclone(['copyto', out, `${driveCaptures()}/frames/${rel}`]);
  console.log(
    r.status === 0
      ? `Drive の frames/${rel} にも上げた`
      : `注意: Drive に上げられなかった（次の npm run drive:sync で上がる）: ${r.stderr.trim()}`,
  );
}
