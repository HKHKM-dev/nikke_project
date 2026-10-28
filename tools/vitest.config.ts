import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'tools',
    environment: 'node',
    include: [
      'captures/**/*.test.ts',
      'drive/**/*.test.ts',
      'cloud/**/*.test.ts',
      'git/**/*.test.ts',
      'artifact/**/*.test.ts',
    ],
  },
});
