import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    // ファイルごとの隔離を外す（モジュールの読み直しが npm test の約半分。plan/design-workflow-simplification-9.md 1 節）
    isolate: false,
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // vi.mock を使うテストは、ファイルごとに隔離する別の project で回す（ルートの vitest.config.ts）
    exclude: ['src/**/*.isolated.test.ts'],
    testTimeout: 15000,
  },
});
