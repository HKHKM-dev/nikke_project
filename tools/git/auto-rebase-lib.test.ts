// 自動マージを待つ PR の衝突の直しの決まりごと（plan/design-auto-conflict-fix.md 2 節）
import { describe, expect, it } from 'vitest';
import {
  addsRecords,
  autoMergeLostComment,
  commented,
  failureComment,
  isTarget,
  mark,
  parsePrepManifest,
  pollMergeable,
  prepBundle,
  type Pull,
  pushOutcome,
  fixedComment,
  splitCollisions,
  tail,
  transientFailure,
  worthFixing,
} from './auto-rebase-lib.ts';

const REPO = 'owner/repo';
const pr = (over: Partial<Pull> & { ref?: string; fork?: boolean } = {}): Pull => ({
  number: 1,
  state: 'open',
  title: 't',
  body: null,
  auto_merge: { merge_method: 'squash' },
  head: { ref: over.ref ?? 'claude/x', sha: 'abc', repo: { full_name: over.fork ? 'other/repo' : REPO } },
  ...over,
});

describe('isTarget', () => {
  it('takes open auto-merge PRs from agent branches of the same repository', () => {
    expect(isTarget(pr(), REPO)).toBe(true);
    expect(isTarget(pr({ ref: 'antigrav/y' }), REPO)).toBe(true);
    expect(isTarget(pr({ auto_merge: null }), REPO)).toBe(false);
    expect(isTarget(pr({ state: 'closed' }), REPO)).toBe(false);
    expect(isTarget(pr({ fork: true }), REPO)).toBe(false);
    expect(isTarget(pr({ ref: 'feature/z' }), REPO)).toBe(false);
    expect(isTarget({ ...pr(), head: { ref: 'claude/x', sha: 'abc', repo: null } }, REPO)).toBe(false);
  });
});

describe('worthFixing', () => {
  const claim = [{ filename: 'records/claims/C-0001.json', status: 'added' }];
  const doc = [{ filename: 'plan/design-x.md', status: 'modified' }];
  it('looks at conflicts, undecided PRs and PRs that added records with IDs', () => {
    expect(worthFixing(false, doc)).toBe(true);
    expect(worthFixing(null, doc)).toBe(true);
    expect(worthFixing(true, doc)).toBe(false);
    expect(worthFixing(true, claim)).toBe(true);
  });
  it('ignores modified records and records without IDs', () => {
    expect(addsRecords([{ filename: 'records/claims/C-0001.json', status: 'modified' }])).toBe(false);
    expect(addsRecords([{ filename: 'records/observations/0001.json', status: 'added' }])).toBe(false);
    expect(addsRecords([{ filename: 'records/verifications/V-0001-a.md', status: 'renamed' }])).toBe(true);
  });
});

describe('pollMergeable', () => {
  it('asks again until GitHub decides', async () => {
    const answers = [null, null, false];
    const slept: number[] = [];
    const m = await pollMergeable(
      async () => answers.shift() ?? null,
      async (ms) => void slept.push(ms),
      5,
      10,
    );
    expect(m).toBe(false);
    expect(slept).toEqual([10, 10]);
  });
  it('gives up with null', async () => {
    let asked = 0;
    const m = await pollMergeable(
      async () => (asked++, null),
      async () => {},
      3,
      1,
    );
    expect(m).toBeNull();
    expect(asked).toBe(3);
  });
});

describe('splitCollisions', () => {
  it('renumbers verifications and claims, and leaves recordings and backlog numbers to people', () => {
    expect(
      splitCollisions([
        { id: 'C-0701', suggestion: 'C-0703' },
        { id: 'V-0529', suggestion: 'V-0532' },
        { id: '0718' },
        { id: '2-12', suggestion: '2-13' },
      ]),
    ).toEqual({
      renumber: [
        { from: 'C-0701', to: 'C-0703' },
        { from: 'V-0529', to: 'V-0532' },
      ],
      manual: [{ id: '0718' }, { id: '2-12', suggestion: '2-13' }],
    });
  });
});

describe('pushOutcome', () => {
  it('tells a lease rejection from other failures', () => {
    expect(pushOutcome(0, '')).toBe('pushed');
    expect(pushOutcome(1, ' ! [rejected]        HEAD -> claude/x (stale info)')).toBe('stale');
    expect(pushOutcome(1, ' ! [remote rejected] HEAD -> claude/x (protected branch hook declined)')).toBe('error');
    expect(pushOutcome(128, 'Permission denied (publickey).')).toBe('error');
  });
});

describe('comments', () => {
  it('marks each comment with its kind and head', () => {
    const body = failureComment('0123456789ab', '理由', 'a\nb');
    expect(body).toContain(mark('failed', '0123456789ab'));
    expect(body).toContain('01234567');
    expect(body).toContain('npm run pr:prep -- --push');
    expect(commented([body], 'failed', '0123456789ab')).toBe(true);
    expect(commented([body], 'failed', 'other')).toBe(false);
    expect(commented([body], 'fixed', '0123456789ab')).toBe(false);
  });
  it('omits the output block when there is no output', () => {
    expect(failureComment('s', 'r')).not.toContain('<details>');
  });
  it('lists the renumbered IDs and asks to re-enable auto-merge', () => {
    expect(fixedComment('s', 'claude/x', [{ from: 'C-1449', to: 'C-1462' }])).toContain('- C-1449 → C-1462');
    const plain = fixedComment('s', 'claude/x', []);
    expect(plain).toContain('git reset --hard origin/claude/x');
    expect(plain).not.toContain('振り直し');
    expect(autoMergeLostComment('s')).toContain(mark('auto-merge', 's'));
  });
  it('keeps the last lines of the output', () => {
    expect(tail('1\n2\n3\n', 2)).toBe('2\n3');
  });
});

describe('transientFailure', () => {
  it('treats network failures of git and npm as transient', () => {
    expect(
      transientFailure("fatal: unable to access 'https://github.com/o/r/': Could not resolve host: github.com"),
    ).toBe(true);
    expect(
      transientFailure('npm error network request to https://registry.npmjs.org/x failed, reason: ECONNRESET'),
    ).toBe(true);
    expect(transientFailure('fetch-pack: unexpected disconnect while reading sideband packet\nfatal: early EOF')).toBe(
      true,
    );
  });
  it('does not treat conflicts and tool errors as transient', () => {
    expect(transientFailure('CONFLICT (content): Merge conflict in plan/design-x.md')).toBe(false);
    expect(transientFailure('Error: records:check が止まった')).toBe(false);
  });
});

describe('parsePrepManifest', () => {
  const A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const ready = {
    number: 12,
    sha: A,
    kind: 'ready',
    head: B,
    bundle: prepBundle(12),
    renumbered: [{ from: 'C-0001', to: 'C-0002' }],
  };
  it('reads ready and failed entries', () => {
    const failed = { number: 13, sha: B, kind: 'failed', reason: 'r', output: 'o' };
    expect(parsePrepManifest(JSON.stringify([ready, failed]))).toEqual([ready, failed]);
    expect(parsePrepManifest(JSON.stringify([{ number: 13, sha: B, kind: 'failed', reason: 'r' }]))).toEqual([
      { number: 13, sha: B, kind: 'failed', reason: 'r' },
    ]);
  });
  it('rejects entries of an unexpected shape', () => {
    expect(() => parsePrepManifest('{}')).toThrow('配列でない');
    expect(() => parsePrepManifest(JSON.stringify([{ ...ready, number: 0 }]))).toThrow('number');
    expect(() => parsePrepManifest(JSON.stringify([{ ...ready, sha: 'main' }]))).toThrow('sha');
    expect(() => parsePrepManifest(JSON.stringify([{ ...ready, head: 'HEAD' }]))).toThrow('head');
    expect(() => parsePrepManifest(JSON.stringify([{ ...ready, bundle: '../x.bundle' }]))).toThrow('bundle');
    expect(() => parsePrepManifest(JSON.stringify([{ ...ready, kind: 'push' }]))).toThrow('kind');
    expect(() =>
      parsePrepManifest(JSON.stringify([{ ...ready, renumbered: [{ from: 'C-0001', to: 'refs/heads/main' }] }])),
    ).toThrow('renumbered');
    expect(() => parsePrepManifest(JSON.stringify([{ number: 1, sha: A, kind: 'failed', reason: 1 }]))).toThrow(
      'reason',
    );
  });
});
