// クラウドのセッションと Drive の nikke_sync の往復の決まりごと（plan/design-cloud-environment.md 6.1・6.2 節）。受け口は呼ばない。
import { describe, expect, it } from 'vitest';
import { cloudClaudeMd, diffAgainstBase, localPathOf, settlePut, shouldPut, trackedRoots } from './cloud-lib.ts';

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

  it('衝突を返された版のままなら put し直さない。手元がさらに変われば送る', () => {
    const d = diffAgainstBase(
      new Map([
        ['private/owner.md', 'b'],
        ['scratch/x.md', 'y2'],
      ]),
      { 'private/owner.md': 'a', 'scratch/x.md': 'x' },
      { 'private/owner.md': 'b', 'scratch/x.md': 'y1' },
    );
    expect(d.put).toEqual([{ path: 'scratch/x.md', baseMd5: 'x' }]);
    expect(d.trash).toEqual([]);
  });

  it('送るかどうか（証拠フレームも同じ決まり）', () => {
    expect(shouldPut('a', 'a', undefined)).toBe(false);
    expect(shouldPut('b', 'a', 'b')).toBe(false);
    expect(shouldPut('b', undefined, undefined)).toBe(true);
    expect(shouldPut('c', 'a', 'b')).toBe(true);
  });

  it('put の結果: 衝突なら基準は動かさず手元の版を覚え、通れば基準を進めて衝突の記憶を消す', () => {
    const base: Record<string, string> = { 'private/owner.md': 'a' };
    const conflicts: Record<string, string> = {};
    settlePut(base, conflicts, 'private/owner.md', 'b', { md5: 'b', conflict: true });
    expect(base).toEqual({ 'private/owner.md': 'a' });
    expect(conflicts).toEqual({ 'private/owner.md': 'b' });
    // 次の応答の終わり: 手元が同じ版のままなら送らない
    expect(diffAgainstBase(new Map([['private/owner.md', 'b']]), base, conflicts).put).toEqual([]);
    settlePut(base, conflicts, 'private/owner.md', 'c', { md5: 'c' });
    expect(base).toEqual({ 'private/owner.md': 'c' });
    expect(conflicts).toEqual({});
  });

  it('クラウドの CLAUDE.md は、全体の指示・メモリの置き場所と書き方・索引を持つ', () => {
    const md = cloudClaudeMd('# 言語設定\n- 常に日本語で回答すること。\n', '- [a](a.md) — x\n', places.memoryDir);
    expect(md.startsWith('# 言語設定')).toBe(true);
    expect(md).toContain(places.memoryDir);
    expect(md).toContain('## 索引（MEMORY.md）');
    expect(md.trimEnd().endsWith('- [a](a.md) — x')).toBe(true);
  });
});
