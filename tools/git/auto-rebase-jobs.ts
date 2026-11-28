// 衝突の直し（auto-rebase.ts）の --prepare と --push の、PR を 1 本ずつ回す組み立て（plan/design-deploy-key-scope.md 2.2 節）。
// git・GitHub の API・PR のブランチの道具を呼ぶ部分は引数で受け取り、組み立てだけをテストする。--push は npm ci の無いジョブで回るので、
// node と auto-rebase-lib.ts のほかは読まない。
import {
  autoMergeLostComment,
  failureComment,
  fixedComment,
  type GitRun,
  isTarget,
  type MarkKind,
  type PrepEntry,
  type PrepPull,
  type Pull,
  pushBundle,
  type Renumber,
  transientFailure,
} from './auto-rebase-lib.ts';

/** --prepare で 1 本の PR を直した結果 */
export type FixOutcome =
  | { kind: 'skip' }
  | { kind: 'ready'; head: string; renumbered: Renumber[] }
  /** retry: 通信などの一時の失敗。コメントせず、次の実行で直し直す（コメントすると --find がこの head を飛ばし続ける） */
  | { kind: 'failed'; reason: string; output?: string; retry?: true };

export type PrepareDeps = {
  repo: string;
  /** origin を取り直し、ブランチの先頭を返す。取り直せなければ null（ブランチが無ければ投げる） */
  originHead: (branch: string) => string | null;
  /** origin のブランチが問い合わせた head のままの PR を、振り直し・まとめ・pr:prep で直す */
  fix: (pr: PrepPull) => FixOutcome;
  /** 直した PR の bundle を置く */
  bundle: (n: number) => void;
  /** 次の PR のために作業ツリーを片付ける */
  cleanUp: () => void;
  log: (line: string) => void;
};

/**
 * --prepare: PR を 1 本ずつ直し、--push に渡す結果の一覧と、直せなかった本数を返す。対象でない PR と、origin のブランチが進んだ PR
 * （次の実行に任せる）は飛ばす。一時の失敗は一覧に入れない（コメントしない）
 */
export function prepareEntries(
  prs: readonly PrepPull[],
  deps: PrepareDeps,
): { entries: PrepEntry[]; failures: number } {
  const { log } = deps;
  const entries: PrepEntry[] = [];
  let failures = 0;
  for (const pr of prs) {
    const n = pr.number;
    if (!isTarget(pr, deps.repo)) continue;
    log(`::group::#${n} ${pr.head.ref}`);
    let outcome: FixOutcome;
    try {
      outcome = fixIfUnmoved(pr, deps);
      if (outcome.kind === 'ready') deps.bundle(n);
    } catch (e) {
      const output = (e as Error).message;
      outcome = transientFailure(output)
        ? { kind: 'failed', reason: '通信の失敗', output, retry: true }
        : { kind: 'failed', reason: '道具が落ちた', output };
    }
    deps.cleanUp();
    log('::endgroup::');
    if (outcome.kind === 'skip') continue;
    if (outcome.kind === 'ready') {
      log(`#${n}: 直した（${outcome.head.slice(0, 8)}）。push は次のジョブ`);
      entries.push({ number: n, sha: pr.head.sha, kind: 'ready', renumbered: outcome.renumbered });
      continue;
    }
    failures++;
    log(`::warning::#${n}: ${outcome.reason}`);
    if (outcome.retry) continue;
    entries.push({
      number: n,
      sha: pr.head.sha,
      kind: 'failed',
      reason: outcome.reason,
      ...(outcome.output !== undefined ? { output: outcome.output } : {}),
    });
  }
  return { entries, failures };
}

function fixIfUnmoved(pr: PrepPull, deps: PrepareDeps): FixOutcome {
  const head = deps.originHead(pr.head.ref);
  if (head === null) return { kind: 'failed', reason: 'git fetch origin が落ちた', retry: true };
  if (head !== pr.head.sha) {
    deps.log(`#${pr.number}: origin のブランチが進んでいる。次の実行に任せる`);
    return { kind: 'skip' };
  }
  return deps.fix(pr);
}

export type PushDeps = {
  repo: string;
  /** --find が選んだ PR の番号（環境変数 TARGETS） */
  targets: ReadonlySet<number>;
  pull: (n: number) => Promise<Pull>;
  /** PR の題名と本文を書き換える */
  editPull: (n: number, fields: { title: string; body: string }) => Promise<unknown>;
  /** 同じ head に同じ印のコメントが無ければ書く */
  comment: (n: number, kind: MarkKind, sha: string, body: string) => Promise<void>;
  /** 鍵で git を回す準備（初めて push する時に呼ぶ。鍵が無いか main を取れなければ投げる） */
  withKey: () => Promise<{ gitRun: GitRun; remote: string }>;
  /** PR の bundle のパス */
  bundlePath: (n: number) => string;
  /** 文の中の振り直した ID を書き換える関数（振り直した PR があるときだけ呼ぶ） */
  idReplacer: () => Promise<(text: string, pairs: readonly Renumber[]) => string>;
  sleep: (ms: number) => Promise<void>;
  log: (line: string) => void;
};

/**
 * --push: --prepare の結果を push してコメントし、失敗の件数を返す。結果は --find が選んだ PR に限り（ほかは失敗に数えて読まない）、
 * 直せなかった PR に先にコメントする。PR を API で引き直し、対象でなくなったか head が --prepare の時から進んでいれば何もしない。
 * 振り直したときだけ題名と本文を書き換える。PR ごとの失敗は、残りの PR を続けてから件数に入れる
 */
export async function pushEntries(manifest: readonly PrepEntry[], deps: PushDeps): Promise<number> {
  const { log } = deps;
  let errors = 0;
  const entries = manifest
    .filter((e) => {
      if (deps.targets.has(e.number)) return true;
      log(`::error::#${e.number}: --find が選んでいない PR が結果にある。読まない`);
      errors++;
      return false;
    })
    .sort((a, b) => Number(b.kind === 'failed') - Number(a.kind === 'failed'));

  const pushed: { n: number; head: string }[] = [];
  for (const entry of entries) {
    const n = entry.number;
    try {
      const pr = await deps.pull(n);
      // push の先は API で引き直したブランチ（対象の名前に限る）。--prepare の後に進んだ PR は、次の実行に任せる
      if (!isTarget(pr, deps.repo) || pr.head.sha !== entry.sha) {
        log(`#${n}: 対象でなくなったか、ブランチが進んだ。何もしない`);
        continue;
      }
      if (entry.kind === 'failed') {
        await deps.comment(n, 'failed', entry.sha, failureComment(entry.sha, entry.reason, entry.output));
        continue;
      }
      const branch = pr.head.ref;
      const { gitRun, remote } = await deps.withKey();
      const { head, outcome } = pushBundle(gitRun, {
        bundle: deps.bundlePath(n),
        number: n,
        branch,
        sha: entry.sha,
        remote,
      });
      if (outcome === 'error') {
        // 通信などの一時の失敗とみて、コメントせず次の実行で直し直す
        log(`::warning::#${n}: push が落ちた`);
        errors++;
        continue;
      }
      if (outcome === 'stale') {
        log(`#${n}: push の間にブランチが進んだ（セッションが直した）。何もしない`);
        continue;
      }
      log(`#${n}: 直して push した（${head.slice(0, 8)}）`);
      pushed.push({ n, head });
      if (entry.renumbered.length > 0) {
        const replaceIds = await deps.idReplacer();
        await deps.editPull(n, {
          title: replaceIds(pr.title, entry.renumbered),
          body: replaceIds(pr.body ?? '', entry.renumbered),
        });
      }
      await deps.comment(n, 'fixed', head, fixedComment(head, branch, entry.renumbered));
    } catch (e) {
      log(`::error::#${n}: ${(e as Error).message}`);
      errors++;
    }
  }
  // push の後に GitHub が予約を外すかは非同期なので、少し待ってからまとめて見る
  if (pushed.length > 0) await deps.sleep(10_000);
  for (const { n, head } of pushed) {
    try {
      if ((await deps.pull(n)).auto_merge == null)
        await deps.comment(n, 'auto-merge', head, autoMergeLostComment(head));
    } catch (e) {
      log(`::error::#${n}: ${(e as Error).message}`);
      errors++;
    }
  }
  return errors;
}
