// アーティファクトのページの組み立てと公開の分け方（build-lib.ts）
import { describe, expect, it } from 'vitest';
import { entryAssets, pageHtml, publishBatches } from './build-lib.ts';

const INDEX = `<!doctype html>
<html lang="ja">
  <head>
    <title>NIKKE ダメージ計算</title>
    <script type="module" crossorigin src="./assets/index-AAA.js"></script>
    <link rel="stylesheet" crossorigin href="./assets/index-BBB.css">
  </head>
  <body><div id="root"></div></body>
</html>`;

describe('entryAssets', () => {
  it('入口の JS と CSS の相対パスを読む', () => {
    expect(entryAssets(INDEX)).toEqual({ js: './assets/index-AAA.js', css: './assets/index-BBB.css' });
  });
  it('base が "/" のビルド（絶対パス）は断る', () => {
    expect(() => entryAssets(INDEX.replaceAll('./assets/', '/assets/'))).toThrow();
  });
});

describe('pageHtml', () => {
  const page = pageHtml({ js: './assets/index-AAA.js', css: './assets/index-BBB.css' });
  it('入口を読み、文書の骨組み（doctype・html・head・body）は書かない', () => {
    expect(page).toContain('<script type="module" src="./assets/index-AAA.js"></script>');
    expect(page).toContain('<link rel="stylesheet" href="./assets/index-BBB.css">');
    expect(page).not.toMatch(/<!doctype|<html|<head|<body/i);
  });
  it('初期の編成を入れない（localStorage に触らない）', () => {
    expect(page).not.toContain('localStorage');
  });
});

describe('publishBatches', () => {
  it('上限ごとに分け、assets/ を先頭の回に置く', () => {
    const paths = ['skills/1.json', 'characters/2.json', 'assets/x.js', 'characters/1.json', 'assets/a.css'];
    expect(publishBatches(paths, 3)).toEqual([
      ['assets/a.css', 'assets/x.js', 'characters/1.json'],
      ['characters/2.json', 'skills/1.json'],
    ]);
  });
  it('空なら回は無い', () => {
    expect(publishBatches([])).toEqual([]);
  });
});
