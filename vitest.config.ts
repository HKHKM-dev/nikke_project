import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/*',
      'apps/*',
      'tools',
      // vi.mock を使うテスト（*.isolated.test.ts）。core は隔離を外して回す（packages/core/vitest.config.ts）ので、先に読んだモジュールに
      // vi.mock が効かない。これだけファイルごとに隔離して回す
      {
        test: {
          name: 'core-isolated',
          root: './packages/core',
          environment: 'node',
          include: ['src/**/*.isolated.test.ts'],
          testTimeout: 15000,
        },
      },
    ],
  },
});
