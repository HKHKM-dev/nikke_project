// クラウドのセッションと Drive の nikke_sync の往復の決まりごと（plan/design-cloud-environment.md 6.1・6.2 節）。受け口は呼ばない。
import { describe, expect, it } from 'vitest';
import {
  cloudClaudeMd,
  diffAgainstBase,
  localPathOf,
  planPull,
  runUntil,
  settlePut,
  shouldOverwrite,
  shouldPut,
  stampOf,
  trackedRoots,
} from './cloud-lib.ts';

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

  it('手元の置き場所と Drive の頭・知らせでの呼び名', () => {
    expect(trackedRoots(places).map((r) => [r.drive, r.label])).toEqual([
      ['private', 'private/'],
      ['scratch', 'scratch/'],
      ['claude/projects/D--nikke-project/memory', 'メモリ'],
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

  it('Drive の版で上書きするのは、手元に無い・前に取った版のまま・衝突として送った版・Drive と同じとき', () => {
    expect(shouldOverwrite(undefined, undefined, undefined, 'd')).toBe(true);
    expect(shouldOverwrite('a', 'a', undefined, 'd')).toBe(true);
    expect(shouldOverwrite('x', 'a', 'x', 'd')).toBe(true);
    expect(shouldOverwrite('d', 'a', undefined, 'd')).toBe(true);
    // まだ送っていない手元の変更（新しく作ったものを含む）は残す
    expect(shouldOverwrite('x', 'a', undefined, 'd')).toBe(false);
    expect(shouldOverwrite('x', undefined, undefined, 'd')).toBe(false);
  });

  it('取り直し: 一覧の大きさと更新時刻が置いたときと違うもの・まだ置いていないものだけを取り、置くまで前の基準を引き継ぐ', () => {
    const stamp = (size: number) => stampOf({ size, modified: '2026-10-30T00:00:00.000Z' });
    const p = planPull(
      new Map([
        ['scratch/same.md', stamp(1)],
        ['scratch/changed.md', stamp(3)],
        ['scratch/new.md', stamp(1)],
      ]),
      new Map([
        ['scratch/same.md', 'S'],
        ['scratch/changed.md', 'C0'],
      ]),
      {
        files: { 'scratch/same.md': 'S', 'scratch/changed.md': 'C0' },
        conflicts: { 'scratch/changed.md': 'X' },
        seen: { 'scratch/same.md': stamp(1), 'scratch/changed.md': stamp(2) },
      },
    );
    expect(p.fetch).toEqual(['scratch/changed.md', 'scratch/new.md']);
    expect(p.files).toEqual({ 'scratch/same.md': 'S', 'scratch/changed.md': 'C0' });
    expect(p.conflicts).toEqual({ 'scratch/changed.md': 'X' });
    expect(p.seen).toEqual({ 'scratch/same.md': stamp(1), 'scratch/changed.md': stamp(2) });
    expect(p.remove).toEqual([]);
  });

  it('取り直し: Drive で消えたものは、手元が前のままなら消し、変わっていれば残して戻す', () => {
    const p = planPull(
      new Map(),
      new Map([
        ['private/gone.md', 'G0'],
        ['private/edited.md', 'E1'],
        ['private/new.md', 'N'],
      ]),
      { files: { 'private/gone.md': 'G0', 'private/edited.md': 'E0' }, conflicts: {}, seen: {} },
    );
    expect(p.remove).toEqual(['private/gone.md']);
    // edited は前の基準のまま（応答の終わりに前の md5 を添えて送る）。new は基準が無いまま（新しいものとして送る）
    expect(p.files).toEqual({ 'private/edited.md': 'E0' });
    expect(p.fetch).toEqual([]);
  });

  it('並べて回し、期限を過ぎたら新しく始めない（始めなかったもの・期限の後に失敗したものは rest）', async () => {
    let t = 0;
    let running = 0;
    let peak = 0;
    const started: number[] = [];
    const r = await runUntil(
      [1, 2, 3, 4, 5, 6],
      2,
      25,
      async (i) => {
        started.push(i);
        running++;
        peak = Math.max(peak, running);
        await Promise.resolve();
        t += 10;
        running--;
        if (i === 2) throw new Error('受け口が断った');
        if (i === 4) throw new Error('時間切れ');
      },
      () => t,
    );
    expect(peak).toBe(2);
    expect(started).toEqual([1, 2, 3, 4]);
    expect(r.failed.map((f) => f.item)).toEqual([2]);
    expect(r.rest).toEqual([4, 5, 6]);
  });

  it('並べる数より少なくても、空でも回る', async () => {
    const seen: number[] = [];
    expect(await runUntil([7], 8, Infinity, async (i) => void seen.push(i))).toEqual({ rest: [], failed: [] });
    expect(seen).toEqual([7]);
    expect(await runUntil([], 8, Infinity, async () => {})).toEqual({ rest: [], failed: [] });
  });

  it('クラウドの CLAUDE.md は、全体の指示・メモリの置き場所と書き方・索引を持つ', () => {
    const md = cloudClaudeMd('# 言語設定\n- 常に日本語で回答すること。\n', '- [a](a.md) — x\n', places.memoryDir);
    expect(md.startsWith('# 言語設定')).toBe(true);
    expect(md).toContain(places.memoryDir);
    expect(md).toContain('## 索引（MEMORY.md）');
    expect(md.trimEnd().endsWith('- [a](a.md) — x')).toBe(true);
  });
});
