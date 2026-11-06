import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const coreData = fileURLToPath(new URL('../../packages/core/data', import.meta.url));
const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  // GitHub Pages ではリポジトリ名のサブパスになるため環境変数で切り替える
  base: process.env.VITE_BASE_PATH ?? '/',
  // core のキャラデータをそのまま静的配信する（/characters/index.json など）
  publicDir: coreData,
  build: {
    // これ未満の画像は束の中に埋め込む（Vite の既定と同じ値）。モダン UI のバッジはどれもこれ未満にして、
    // アーティファクトのファイル数を使わない（badges.test.ts が確かめる。plan/design-modern-ui.md 2.5 節）
    assetsInlineLimit: 4096,
  },
  server: {
    fs: { allow: [monorepoRoot] },
  },
  optimizeDeps: {
    exclude: ['@nikke/core'],
  },
});
