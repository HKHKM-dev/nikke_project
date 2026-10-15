import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'core',
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // 持ち主ごとの一覧編（plan/design-holder-effects.md 論点 6）: 段 A・B の間だけ、新旧の比べを入れる
    setupFiles: ['./src/frame/crossCheck.setup.ts'],
  },
});
