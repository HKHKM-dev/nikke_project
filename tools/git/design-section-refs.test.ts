// 現状の型のファイルが指す設計書の節が、設計書に見出しとしてあるかの確かめ（plan/design-design-doc-trim.md 5 節）
import { describe, expect, it } from 'vitest';
import {
  branchBrokenSectionRefs,
  brokenSectionRefs,
  headingNumbers,
  isCurrentSource,
  isDesignDoc,
  sectionRefs,
} from './design-section-refs.ts';

// このファイルも見る側なので、参照の形の文はつないで作る（そのまま書くと、このファイルの参照として切れて見える）
const D = 'design-';

describe('isDesignDoc・isCurrentSource', () => {
  it('設計書は plan/ 直下の design-*.md と burst-effect-delay-candidates.md', () => {
    expect(isDesignDoc('plan/design-a.md')).toBe(true);
    expect(isDesignDoc('plan/burst-effect-delay-candidates.md')).toBe(true);
    expect(isDesignDoc('plan/captures/design-a.md')).toBe(false);
    expect(isDesignDoc('plan/roadmap.md')).toBe(false);
  });

  it('見る側は現状の型のファイルだけ', () => {
    const gen = ['plan/claims.md'];
    for (const p of [
      'tools/git/pr-prep.ts',
      'apps/web/src/App.tsx',
      'packages/core/src/sim/engine.ts',
      'AGENTS.md',
      'README.md',
      'plan/requirements.md',
      'plan/captures/guide.md',
      'records/backlog/2-1.json',
      'records/verifications/README.md',
    ])
      expect(isCurrentSource(p, gen), p).toBe(true);
    for (const p of [
      'plan/claims.md',
      'plan/design-a.md',
      'plan/verification.md',
      'plan/roadmap-archive.md',
      'plan/captures/legacy-usage.md',
      'plan/captures/backup-log.md',
      'plan/captures/backup-log-old1.md',
      'records/verifications/V-0001.md',
      'records/claims/C-0001.json',
      'packages/core/data/skills/a.json',
    ])
      expect(isCurrentSource(p, gen), p).toBe(false);
  });
});

describe('sectionRefs', () => {
  it('ファイル名の直後の N 節（の・リンク・plan/ 付きも）を拾う', () => {
    const text = [
      `// 何か（plan/${D}a.md 3 節）`,
      `理由は [${D}b.md](${D}b.md) の 2.5 節と ${D}c-2.md 10 節`,
      `${D}d.md「経過」は拾わない`,
    ].join('\r\n');
    expect(sectionRefs('x.ts', text)).toEqual([
      { path: 'x.ts', line: 1, doc: `plan/${D}a.md`, section: '3' },
      { path: 'x.ts', line: 2, doc: `plan/${D}b.md`, section: '2.5' },
      { path: 'x.ts', line: 2, doc: `plan/${D}c-2.md`, section: '10' },
    ]);
  });
});

describe('headingNumbers', () => {
  it('見出しの頭の番号（"3." "2.5" の形）', () => {
    const text = ['# 題', '## 0. 要約', '## 3. 案', '### 2.5 バッジ', '#### 2.5.1', '## 経過', '本文 4 節'].join('\n');
    expect([...headingNumbers(text)]).toEqual(['0', '3', '2.5', '2.5.1']);
  });
});

describe('brokenSectionRefs', () => {
  const files: Record<string, string> = {
    [`plan/${D}a.md`]: '## 1. 目的\n### 1.2 決定\n',
    'tools/x.ts': `// plan/${D}a.md 1.2 節\n// plan/${D}a.md 4 節\n`,
    'tools/y.ts': `// plan/${D}a.md 5 節\n// plan/${D}gone.md 1 節\n`,
  };
  const read = (p: string) => files[p];
  const sources = ['tools/x.ts', 'tools/y.ts'];

  it('ブランチで変えたファイルの参照は、どの設計書を指していても見る', () => {
    expect(brokenSectionRefs(sources, new Set(['tools/y.ts']), new Set(), read)).toEqual([
      { path: 'tools/y.ts', line: 1, doc: `plan/${D}a.md`, section: '5' },
      { path: 'tools/y.ts', line: 2, doc: `plan/${D}gone.md`, section: '1' },
    ]);
  });

  it('ブランチで変えた設計書を指す参照は、変えていないファイルでも見る', () => {
    expect(brokenSectionRefs(sources, new Set(), new Set([`plan/${D}a.md`]), read)).toEqual([
      { path: 'tools/x.ts', line: 2, doc: `plan/${D}a.md`, section: '4' },
      { path: 'tools/y.ts', line: 1, doc: `plan/${D}a.md`, section: '5' },
    ]);
  });

  it('どちらでもない参照は、切れていても見ない', () => {
    expect(brokenSectionRefs(sources, new Set(), new Set([`plan/${D}b.md`]), read)).toEqual([]);
  });
});

describe('branchBrokenSectionRefs', () => {
  it('ブランチが設計書も見る側も変えていなければ、ファイルの一覧を読まない', () => {
    const calls: string[][] = [];
    const paths = (args: readonly string[]) => {
      calls.push([...args]);
      return args[0] === 'diff' ? ['records/verifications/V-0001.md'] : [];
    };
    expect(branchBrokenSectionRefs('origin/main', paths, [], () => undefined)).toEqual([]);
    expect(calls).toEqual([['diff', '--name-only', 'origin/main...HEAD']]);
  });

  it('消した設計書を指す参照も切れとして出す', () => {
    const paths = (args: readonly string[]) =>
      args[0] === 'diff' ? [`plan/${D}gone.md`] : ['tools/x.ts', `plan/${D}a.md`, 'plan/claims.md'];
    const read = (p: string) => ({ 'tools/x.ts': `// ${D}gone.md 2 節`, 'plan/claims.md': `${D}gone.md 2 節` })[p];
    expect(branchBrokenSectionRefs('origin/main', paths, ['plan/claims.md'], read)).toEqual([
      { path: 'tools/x.ts', line: 1, doc: `plan/${D}gone.md`, section: '2' },
    ]);
  });
});
