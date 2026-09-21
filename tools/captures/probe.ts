// 録画の素性（コーデック・尺・フレーム数・平均 fps・sha256）を台帳用の Markdown 行として出力する。
//   node tools/captures/probe.ts [ディレクトリまたはファイル...]
// 既定は E:/nikke_project_captures（種別サブフォルダごと再帰的に見る）。
// 録画本体は Git 管理外なので、worktree からは絶対パスで触る。
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ffprobe, sha256 } from './ffmpeg.ts';

const DEFAULT_DIR = 'E:/nikke_project_captures';

function collect(target: string): string[] {
  if (statSync(target).isFile()) return [target];
  return readdirSync(target, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(target, entry.name);
      if (entry.isDirectory()) return collect(path);
      return entry.name.toLowerCase().endsWith('.mp4') ? [path] : [];
    });
}

const targets = process.argv.slice(2);
const roots = (targets.length > 0 ? targets : [DEFAULT_DIR]).map((t) => resolve(t));

console.log('| ファイル | 尺 | フレーム数 | 平均 fps | サイズ | sha256 (先頭 12) |');
console.log('| -------- | --- | ---------- | -------- | ------ | ---------------- |');
for (const root of roots) {
  for (const file of collect(root)) {
    const p = ffprobe(file);
    const digest = await sha256(file);
    // 種別サブフォルダが分かるよう、指定した根からの相対パスで出す。
    const name = relative(root, file).split(sep).join('/') || file;
    console.log(
      `| ${name} | ${p.durationSec.toFixed(1)}s | ${p.nbFrames} | ${p.avgFps.toFixed(2)} | ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB | ${digest.slice(0, 12)} |`,
    );
  }
}
