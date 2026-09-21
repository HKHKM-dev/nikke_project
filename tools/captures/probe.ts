// 録画の素性（コーデック・尺・フレーム数・平均 fps・sha256）を台帳用の Markdown 行として出力する。
//   node tools/captures/probe.ts [ディレクトリまたはファイル...]
// 既定は D:/nikke_project/plan/captures（録画は .gitignore 済みなので worktree には現れない）。
import { readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { ffprobe, sha256 } from './ffmpeg.ts';

const DEFAULT_DIR = 'D:/nikke_project/plan/captures';

function collect(target: string): string[] {
  const stat = statSync(target);
  if (stat.isFile()) return [target];
  return readdirSync(target)
    .filter((name) => name.toLowerCase().endsWith('.mp4'))
    .sort()
    .map((name) => join(target, name));
}

const targets = process.argv.slice(2);
const files = (targets.length > 0 ? targets : [DEFAULT_DIR]).flatMap((t) => collect(resolve(t)));

console.log('| ファイル | 尺 | フレーム数 | 平均 fps | サイズ | sha256 (先頭 12) |');
console.log('| -------- | --- | ---------- | -------- | ------ | ---------------- |');
for (const file of files) {
  const p = ffprobe(file);
  const digest = await sha256(file);
  const name = basename(file);
  console.log(
    `| ${name} | ${p.durationSec.toFixed(1)}s | ${p.nbFrames} | ${p.avgFps.toFixed(2)} | ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB | ${digest.slice(0, 12)} |`,
  );
}
