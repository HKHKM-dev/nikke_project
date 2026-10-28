// Web 版をアーティファクト（claude.ai の Artifact）として出すための、ページの組み立てと公開の分け方（build.ts）。ファイルには触らない。

/** アーティファクトのページのファイル名（公開の file_path）。ページの名前は <title> から付く */
export const PAGE_FILE = 'nikke-damage.html';

/** Artifact の公開 1 回で送れるファイルの数の上限（ページの外の files） */
export const MAX_FILES_PER_PUBLISH = 255;

export type EntryAssets = { js: string; css: string };

/**
 * vite build の index.html から、入口の JS と CSS（base が "./" のときの相対パス）を読む。
 * Worker の JS は入口の JS が相対で読むので、ここには出てこない。
 */
export function entryAssets(indexHtml: string): EntryAssets {
  const js = /<script[^>]*\ssrc="(\.\/assets\/[^"]+\.js)"/.exec(indexHtml)?.[1];
  const css = /<link[^>]*\shref="(\.\/assets\/[^"]+\.css)"/.exec(indexHtml)?.[1];
  if (!js || !css) throw new Error('index.html に入口の JS と CSS が見つからない（base が "./" のビルドか確かめる）');
  return { js, css };
}

/**
 * アーティファクトのページ。公開のときに <!doctype html>・<head>・<body> で包まれるので、中身だけを書く。
 * Web 版との違いは包みだけ: 閲覧側のテーマの切り替え（data-theme）に追従させ、背景を明示し、横の余白をセーフエリアの分も取る。
 * 初期の編成は Web 版と同じ空（localStorage に保存済みの編成があればそれ）。
 */
export function pageHtml(assets: EntryAssets): string {
  return `<title>NIKKE ダメージ計算</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="${assets.css}">
<style>
  /* アーティファクトの表示枠向け: 閲覧側のテーマ切り替えに追従し、背景を明示する */
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] { color-scheme: dark; }
  body {
    background: Canvas;
    color: CanvasText;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
</style>
<div id="root"></div>
<script type="module" src="${assets.js}"></script>
`;
}

/**
 * 公開するファイル（ページの外）を、1 回の公開の上限ごとに分ける。assets/ を先頭の回に置く
 * （先頭の回だけを出した時点でも、ページが読み込めてエラーの理由を出せるように）。
 */
export function publishBatches(paths: readonly string[], max = MAX_FILES_PER_PUBLISH): string[][] {
  const sorted = [...paths].sort((a, b) => {
    const rank = (p: string) => (p.startsWith('assets/') ? 0 : 1);
    return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
  });
  const batches: string[][] = [];
  for (let i = 0; i < sorted.length; i += max) batches.push(sorted.slice(i, i + max));
  return batches;
}
