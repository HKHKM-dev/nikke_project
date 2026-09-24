// Stage 14: vite build の出力にサブパス（GitHub Pages の /<リポジトリ名>/）が効いていること（plan/design-stage12.md 7 節）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPagesBuild } from './check-pages-build.ts';

const calcDir = fileURLToPath(new URL('..', import.meta.url));
const BASE = '/nikke_project/';

describe('GitHub Pages build (Stage 14)', () => {
  const outDir = mkdtempSync(join(tmpdir(), 'nikke-calc-pages-'));
  beforeAll(async () => {
    await build({
      root: calcDir,
      configFile: join(calcDir, 'vite.config.ts'),
      base: BASE,
      logLevel: 'silent',
      build: { outDir, emptyOutDir: true },
    });
  }, 120_000);
  afterAll(() => rmSync(outDir, { recursive: true, force: true }));

  it('puts the assets and the data under the base path', () => {
    expect(checkPagesBuild(outDir, BASE)).toEqual([]);
  });

  it('notices a build made for another base', () => {
    const problems = checkPagesBuild(outDir, '/other/');
    expect(problems).toContain('index.html has no script under /other/assets/');
    expect(problems.some((p) => p.includes('no bundle embeds'))).toBe(true);
  });
});
