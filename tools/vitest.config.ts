import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tools',
    environment: 'node',
    // ファイルごとの隔離を外す（モジュールの読み直しが npm test の約半分。plan/design-workflow-simplification-9.md 1 節）
    isolate: false,
    include: [
      'captures/**/*.test.ts',
      'drive/**/*.test.ts',
      'cloud/**/*.test.ts',
      'git/**/*.test.ts',
      'artifact/**/*.test.ts',
      'builds/**/*.test.ts',
    ],
  },
});
