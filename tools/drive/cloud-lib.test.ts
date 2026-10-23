// クラウドのセッションと Drive の nikke_sync の往復の決まりごと（plan/design-cloud-environment.md 6.1・6.2 節）。受け口は呼ばない。
import { describe, expect, it } from 'vitest';
import { cloudClaudeMd, diffAgainstBase, localPathOf, trackedRoots } from './cloud-lib.ts';

const places = {
  repo: '/home/user/nikke_project',
  memoryDir: '/root/.claude/projects/-home-user-nikke-project/memory',
  memoryProject: 'D--nikke-project',
};

describe('drive/cloud-lib', () => {
  it('Drive のパスを手元に読み替える（private・scratch はリポジトリの直下、メモリは自動メモリの場所）', () => {
    expect(localPathOf('private/owner.md', places)).toBe('/home/user/nikke_project/private/owner.md');
    expect(localPathOf('scratch/blablalink/a.json', places)).toBe('/home/user/nikke_project/scratch/blablalink/a.json');
    expect(localPathOf('claude/projects/D--nikke-project/memory/MEMORY.md', places)).toBe(
      '/root/.claude/projects/-home-user-nikke-project/memory/MEMORY.md',
    );
    expect(localPathOf('claude/CLAUDE.md', places)).toBeNull();
    expect(localPathOf('claude/projects/other/memory/x.md', places)).toBeNull();
  });

  it('手元の置き場所と Drive の頭', () => {
    expect(trackedRoots(places).map((r) => r.drive)).toEqual([
      'private',
      'scratch',
      'claude/projects/D--nikke-project/memory',
    ]);
  });

  it('基準と比べて、変わった・増えたものは put（前の md5 を添える）、消えたものは trash', () => {
    const d = diffAgainstBase(
      new Map([
        ['private/owner.md', 'b'],
        ['scratch/new.md', 'n'],
        ['scratch/same.md', 's'],
      ]),
      { 'private/owner.md': 'a', 'scratch/same.md': 's', 'scratch/gone.md': 'g' },
    );
    expect(d.put).toEqual([
      { path: 'private/owner.md', baseMd5: 'a' },
      { path: 'scratch/new.md', baseMd5: null },
    ]);
    expect(d.trash).toEqual([{ path: 'scratch/gone.md', baseMd5: 'g' }]);
  });

  it('クラウドの CLAUDE.md は、全体の指示・メモリの置き場所と書き方・索引を持つ', () => {
    const md = cloudClaudeMd('# 言語設定\n- 常に日本語で回答すること。\n', '- [a](a.md) — x\n', places.memoryDir);
    expect(md.startsWith('# 言語設定')).toBe(true);
    expect(md).toContain(places.memoryDir);
    expect(md).toContain('## 索引（MEMORY.md）');
    expect(md.trimEnd().endsWith('- [a](a.md) — x')).toBe(true);
  });
});
