import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'calc',
    environment: 'node',
    // ファイルごとの隔離を外す（モジュールの読み直しが npm test の約半分。plan/design-workflow-simplification-9.md 1 節）
    isolate: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    passWithNoTests: true,
  },
});
