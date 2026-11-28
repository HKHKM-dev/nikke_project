// Stage 14: vite build の出力にサブパス（GitHub Pages の /<リポジトリ名>/）が効いていること（plan/design-stage12.md 7 節）
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPagesBuild, checkSkillFiles } from './check-pages-build.ts';

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
    expect(problems).toContain('no bundle refers to the worker under /other/assets/');
  });
});

describe('checkSkillFiles', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nikke-calc-skills-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const write = (files: Record<string, unknown>) => {
    rmSync(join(dir, 'skills'), { recursive: true, force: true });
    mkdirSync(join(dir, 'skills'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, 'skills', name), JSON.stringify(body));
  };
  const support = (defined: number[]) => ({ formatVersion: 1, defined, fullySupported: [] });

  it('accepts definitions that match the list', () => {
    write({ 'support.json': support([10, 2]), '2.json': {}, '10.json': {} });
    expect(checkSkillFiles(dir)).toEqual([]);
  });

  it('notices a listed definition missing from the build and an unlisted one in it', () => {
    write({ 'support.json': support([2, 3]), '2.json': {}, '4.json': {} });
    expect(checkSkillFiles(dir)).toEqual([
      'skills/3.json is listed in support.json but not in the build',
      'skills/4.json is in the build but not listed in support.json',
    ]);
  });

  it('notices a support.json without the defined list', () => {
    write({ 'support.json': { formatVersion: 1, fullySupported: [] } });
    expect(checkSkillFiles(dir)).toEqual([expect.stringContaining('skills/support.json cannot be read')]);
  });
});
