import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'calc',
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
  },
});
