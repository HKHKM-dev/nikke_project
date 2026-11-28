// 衝突の直しの --prepare と --push の組み立て（auto-rebase-jobs.ts）。git・API・PR のブランチの道具は偽物にして、PR ごとの分かれ道と、
// 呼んだものの列を見る
import { describe, expect, it } from 'vitest';
import { type FixOutcome, prepareEntries, type PushDeps, pushEntries } from './auto-rebase-jobs.ts';
import { type GitRun, mark, type PrepEntry, prepPull, type PrepPull, type Pull } from './auto-rebase-lib.ts';

const REPO = 'owner/repo';
const sha = (c: string) => c.repeat(40);
/** API が返す PR（head の sha は番号の数字を並べたもの） */
const apiPull = (number: number, over: Partial<Pull> = {}): Pull => ({
  number,
  state: 'open',
  title: `V-0001 の検証 #${number}`,
  body: '本文の V-0001',
  mergeable: false,
  auto_merge: { merge_method: 'squash' },
  head: { ref: `claude/b${number}`, sha: sha(String(number)), repo: { full_name: REPO } },
  ...over,
});
/** --find が --prepare に渡す形 */
const found = (number: number, over: Partial<Pull> = {}): PrepPull => prepPull(apiPull(number, over));

describe('prepareEntries', () => {
  function run(
    prs: PrepPull[],
    o: { origin?: Record<string, string | null>; fix?: Record<number, FixOutcome | Error> } = {},
  ) {
    const calls: string[] = [];
    const result = prepareEntries(prs, {
      repo: REPO,
      originHead: (branch) => {
        calls.push(`head ${branch}`);
        const pr = prs.find((p) => p.head.ref === branch)!;
        return o.origin && branch in o.origin ? o.origin[branch]! : pr.head.sha;
      },
      fix: (pr) => {
        calls.push(`fix #${pr.number}`);
        const out = o.fix?.[pr.number] ?? new Error('fatal: 道具が落ちた');
        if (out instanceof Error) throw out;
        return out;
      },
      bundle: (n) => calls.push(`bundle #${n}`),
      cleanUp: () => calls.push('clean'),
      log: () => {},
    });
    return { ...result, calls };
  }

  it('fixes each PR, bundles the ready ones and cleans up after every PR', () => {
    const { entries, failures, calls } = run([found(1), found(2)], {
      fix: {
        1: { kind: 'ready', head: sha('e'), renumbered: [{ from: 'V-0001', to: 'V-0009' }] },
        2: { kind: 'skip' },
      },
    });
    expect(calls).toEqual(['head claude/b1', 'fix #1', 'bundle #1', 'clean', 'head claude/b2', 'fix #2', 'clean']);
    expect(entries).toEqual([
      { number: 1, sha: sha('1'), kind: 'ready', renumbered: [{ from: 'V-0001', to: 'V-0009' }] },
    ]);
    expect(failures).toBe(0);
  });
  it('skips a PR whose branch moved on origin, without fixing it', () => {
    const { entries, calls } = run([found(1)], { origin: { 'claude/b1': sha('f') } });
    expect(calls).toEqual(['head claude/b1', 'clean']);
    expect(entries).toEqual([]);
  });
  it('skips PRs that are not targets without touching git', () => {
    const { entries, calls } = run([
      found(1, { auto_merge: null }),
      found(2, { head: { ref: 'feature/x', sha: sha('2'), repo: { full_name: REPO } } }),
    ]);
    expect(calls).toEqual([]);
    expect(entries).toEqual([]);
  });
  it('lists failures for a comment, but not the transient ones', () => {
    const { entries, failures } = run([found(1), found(2), found(3), found(4)], {
      origin: { 'claude/b4': null },
      fix: {
        1: { kind: 'failed', reason: 'r', output: 'o' },
        2: { kind: 'failed', reason: '通信', retry: true },
      },
    });
    // 3 は道具が投げた（コメントする）。4 は fetch が落ちた（一時の失敗）
    expect(entries).toEqual([
      { number: 1, sha: sha('1'), kind: 'failed', reason: 'r', output: 'o' },
      { number: 3, sha: sha('3'), kind: 'failed', reason: '道具が落ちた', output: 'fatal: 道具が落ちた' },
    ]);
    expect(failures).toBe(4);
  });
  it('treats a thrown network error as transient', () => {
    const { entries, failures } = run([found(1)], {
      fix: { 1: new Error('fatal: unable to access: Could not resolve host: github.com') },
    });
    expect(entries).toEqual([]);
    expect(failures).toBe(1);
  });
});

describe('pushEntries', () => {
  const readyEntry = (number: number, renumbered: { from: string; to: string }[] = []): PrepEntry => ({
    number,
    sha: sha(String(number)),
    kind: 'ready',
    renumbered,
  });
  const failedEntry = (number: number): PrepEntry => ({
    number,
    sha: sha(String(number)),
    kind: 'failed',
    reason: 'r',
  });
  const HEAD = sha('e');

  /** 偽物の依存。pulls は呼ぶたびに先頭から返す（最後の 1 件は残す）。gitRun は push の結果（status と出力）だけを決める */
  function deps(o: {
    targets: number[];
    pulls?: Record<number, Pull[]>;
    push?: { status: number; output: string };
    withKeyFails?: boolean;
  }) {
    const calls: string[] = [];
    const gitRun: GitRun = (args) => {
      if (args[0] === 'push') {
        calls.push(`push ${args.at(-1)}`);
        return o.push ?? { status: 0, output: '' };
      }
      if (args[0] === 'rev-parse') return { status: 0, output: `${HEAD}\n` };
      return { status: 0, output: '' };
    };
    const d: PushDeps = {
      repo: REPO,
      targets: new Set(o.targets),
      pull: async (n) => {
        const list = o.pulls?.[n];
        if (!list) return apiPull(n);
        return list.length > 1 ? list.shift()! : list[0]!;
      },
      editPull: async (n, fields) => {
        calls.push(`edit #${n} ${fields.title} / ${fields.body}`);
      },
      comment: async (n, kind, s, body) => {
        expect(body).toContain(mark(kind, s));
        calls.push(`comment #${n} ${kind}`);
      },
      withKey: async () => {
        calls.push('key');
        if (o.withKeyFails) throw new Error('デプロイキーで main を取れない');
        return { gitRun, remote: 'git@github.com:owner/repo.git' };
      },
      bundlePath: (n) => `/tmp/${n}.bundle`,
      idReplacer: async () => (text, pairs) => pairs.reduce((t, p) => t.replaceAll(p.from, p.to), text),
      sleep: async (ms) => {
        calls.push(`sleep ${ms}`);
      },
      log: (line) => {
        if (line.startsWith('::error::')) calls.push(line);
      },
    };
    return { d, calls };
  }

  it('rejects entries the find job did not pick, and comments on failures before pushing', async () => {
    const { d, calls } = deps({ targets: [1, 2] });
    const errors = await pushEntries([readyEntry(1), failedEntry(2), readyEntry(9)], d);
    expect(errors).toBe(1);
    expect(calls).toEqual([
      '::error::#9: --find が選んでいない PR が結果にある。読まない',
      'comment #2 failed',
      'key',
      'push refs/auto-rebase/1:refs/heads/claude/b1',
      'comment #1 fixed',
      'sleep 10000',
    ]);
  });
  it('does nothing for a PR whose head moved or that is no longer a target', async () => {
    const { d, calls } = deps({
      targets: [1, 2, 3],
      pulls: {
        1: [apiPull(1, { head: { ref: 'claude/b1', sha: sha('f'), repo: { full_name: REPO } } })],
        2: [apiPull(2, { auto_merge: null })],
        3: [apiPull(3, { head: { ref: 'claude/b3', sha: sha('f'), repo: { full_name: REPO } } })],
      },
    });
    expect(await pushEntries([readyEntry(1), readyEntry(2), failedEntry(3)], d)).toBe(0);
    expect(calls).toEqual([]);
  });
  it('rewrites the title and body only when it renumbered', async () => {
    const { d, calls } = deps({ targets: [1, 2] });
    await pushEntries([readyEntry(1, [{ from: 'V-0001', to: 'V-0009' }]), readyEntry(2)], d);
    expect(calls.filter((c) => c.startsWith('edit'))).toEqual(['edit #1 V-0009 の検証 #1 / 本文の V-0009']);
  });
  it('comments when auto-merge was dropped after the push', async () => {
    const { d, calls } = deps({ targets: [1], pulls: { 1: [apiPull(1), apiPull(1, { auto_merge: null })] } });
    await pushEntries([readyEntry(1)], d);
    expect(calls.slice(-2)).toEqual(['sleep 10000', 'comment #1 auto-merge']);
  });
  it('counts a failed push as an error without commenting, and leaves a stale push alone', async () => {
    const failed = deps({ targets: [1], push: { status: 128, output: 'fatal: Could not read from remote' } });
    expect(await pushEntries([readyEntry(1)], failed.d)).toBe(1);
    expect(failed.calls.filter((c) => c.startsWith('comment') || c.startsWith('sleep'))).toEqual([]);
    const stale = deps({ targets: [1], push: { status: 1, output: ' ! [rejected] (stale info)' } });
    expect(await pushEntries([readyEntry(1)], stale.d)).toBe(0);
    expect(stale.calls.filter((c) => c.startsWith('comment') || c.startsWith('sleep'))).toEqual([]);
  });
  it('keeps going after one PR fails, and still comments on failures without the key', async () => {
    const { d, calls } = deps({ targets: [1, 2], withKeyFails: true });
    expect(await pushEntries([readyEntry(1), failedEntry(2)], d)).toBe(1);
    expect(calls).toEqual(['comment #2 failed', 'key', '::error::#1: デプロイキーで main を取れない']);
  });
});
