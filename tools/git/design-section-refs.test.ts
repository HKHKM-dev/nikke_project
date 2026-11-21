// 設計書のほかのファイルが指す設計書の節が、設計書に見出しとしてあるかの確かめ（plan/design-design-doc-trim.md 5 節・9 節）
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GENERATED_PATHS, ROOT } from '../../packages/core/scripts/records-data.ts';
import { brokenSectionRefs, headingNumbers, isCurrentSource, isDesignDoc, sectionRefs } from './design-section-refs.ts';

// このファイルも見る側なので、参照の形の文はつないで作る（そのまま書くと、このファイルの参照として切れて見える）
const D = 'design-';

describe('isDesignDoc・isCurrentSource', () => {
  it('設計書は plan/ 直下の design-*.md と burst-effect-delay-candidates.md', () => {
    expect(isDesignDoc('plan/design-a.md')).toBe(true);
    expect(isDesignDoc('plan/burst-effect-delay-candidates.md')).toBe(true);
    expect(isDesignDoc('plan/captures/design-a.md')).toBe(false);
    expect(isDesignDoc('plan/roadmap.md')).toBe(false);
  });

  it('見る側は、設計書・記録・生成物・凍結の文書のほかの、文を持つファイル', () => {
    const gen = ['plan/claims.md'];
    for (const p of [
      'tools/git/pr-prep.ts',
      'apps/web/src/App.tsx',
      'apps/web/src/styles.css',
      'packages/core/data/skills/a.json',
      '.github/workflows/ci.yml',
      'AGENTS.md',
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
      'apps/web/src/assets/a.png',
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
  it('指す節の見出しが無い参照と、指す設計書が無い参照', () => {
    const files: Record<string, string> = {
      [`plan/${D}a.md`]: '## 1. 目的\n### 1.2 決定\n',
      'tools/x.ts': `// plan/${D}a.md 1.2 節\n// plan/${D}a.md 4 節\n// plan/${D}gone.md 1 節\n`,
    };
    expect(brokenSectionRefs(['tools/x.ts', 'tools/deleted.ts'], (p) => files[p])).toEqual([
      { path: 'tools/x.ts', line: 2, doc: `plan/${D}a.md`, section: '4' },
      { path: 'tools/x.ts', line: 3, doc: `plan/${D}gone.md`, section: '1' },
    ]);
  });
});

describe('リポジトリ', () => {
  it('設計書のほかのファイルが指す設計書の節は、全部その設計書にある', () => {
    const files = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0');
    const read = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), 'utf8') : undefined);
    const broken = brokenSectionRefs(
      files.filter((p) => p !== '' && isCurrentSource(p, GENERATED_PATHS)),
      read,
    ).map((r) => `${r.path}:${r.line}: ${r.doc} ${r.section} 節`);
    // 切れたら、節を設計書に残すか、指している側を直す（AGENTS.md「文書の書き方」の設計の型）
    expect(broken).toEqual([]);
  });
});
