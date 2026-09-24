// Stage 14: GitHub Pages 用のビルド成果物（vite build の出力）がサブパス（base）で動くかを確かめる（plan/design-stage12.md 4.1 節）。
//   node apps/web/scripts/check-pages-build.ts apps/web/dist /nikke_project/
// 見るもの: index.html が参照するスクリプト・スタイルが base の下にあること、バンドルに base が埋め込まれていること
// （データの fetch は import.meta.env.BASE_URL を前に付ける）、データ（キャラ・スキル定義・育成のマスタ・敵のプリセット）が同梱されていること。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ENEMY_PRESETS_PATH, MASTER_FILES } from '../../../packages/core/src/load.ts';

/** 問題の一覧（空なら合格） */
export function checkPagesBuild(distDir: string, base: string): string[] {
  const problems: string[] = [];
  if (!base.startsWith('/') || !base.endsWith('/')) return [`base must start and end with "/", got ${base}`];
  const indexHtml = join(distDir, 'index.html');
  if (!existsSync(indexHtml)) return [`${indexHtml} not found`];
  const html = readFileSync(indexHtml, 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!);
  if (!refs.some((r) => r.startsWith(`${base}assets/`) && r.endsWith('.js'))) {
    problems.push(`index.html has no script under ${base}assets/`);
  }
  for (const ref of refs) {
    if (ref.startsWith('/') && !ref.startsWith(base)) problems.push(`index.html refers to ${ref} outside ${base}`);
  }
  const assets = join(distDir, 'assets');
  const bundles = existsSync(assets) ? readdirSync(assets).filter((f) => f.endsWith('.js')) : [];
  // minify で文字列の引用符は " ' ` のどれにもなる
  const quoted = ['"', "'", '`'].map((q) => `${q}${base}${q}`);
  if (!bundles.some((f) => quoted.some((q) => readFileSync(join(assets, f), 'utf8').includes(q)))) {
    problems.push(`no bundle embeds the base path "${base}" (data fetches would miss the sub path)`);
  }
  const data = [
    'characters/index.json',
    'skills/index.json',
    ENEMY_PRESETS_PATH,
    ...Object.values(MASTER_FILES).map((file) => `masters/${file}`),
  ];
  for (const file of data) {
    if (!existsSync(join(distDir, file))) problems.push(`${file} is not in the build`);
  }
  return problems;
}

if (import.meta.main) {
  const [distDir, base] = process.argv.slice(2);
  if (distDir === undefined || base === undefined) {
    console.error('usage: node apps/web/scripts/check-pages-build.ts <dist> <base>');
    process.exit(2);
  }
  const problems = checkPagesBuild(distDir, base);
  for (const p of problems) console.error(p);
  if (problems.length > 0) process.exit(1);
  console.log(`pages build OK (${distDir}, base ${base})`);
}
