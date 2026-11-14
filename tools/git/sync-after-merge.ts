// マージ済みの PR の後片付け。Claude Code のフック（.claude/settings.json の SessionStart・UserPromptSubmit・Stop）から呼ぶ。
//   node tools/git/sync-after-merge.ts [--prune-branches] [--wait-merge] [--catch-up <SessionStart|UserPromptSubmit>]
//     --prune-branches は SessionStart だけ、--wait-merge は Stop だけ、--catch-up は SessionStart と UserPromptSubmit で付ける
//
// スカッシュマージでは、ブランチのコミットと main 上のコミットが別物になるので、放っておくと差分の表示に
// マージ済みの変更が残る。そこで次の 2 つ（--prune-branches なら 3 つ）を行う。
//   1. メインのチェックアウトが main で作業中の変更が無ければ、origin/main へ早送りする
//   2. いまのブランチの PR がマージ済みで（リモートのブランチは自動で消える）、PR の最後のコミットが HEAD と同じで、
//      作業中の変更が無ければ、ブランチを origin/main に揃える（中身はマージ済みなので失うものは無い）
//   3. デスクトップ（CLAUDE_CODE_REMOTE でない）で、origin の claude/・antigrav/ のブランチのうち、最後のコミットと手元が今の先端を
//      見た時刻（リモートの追跡ブランチの reflog）の両方から 1 日以上たち、開いている PR の head でも base でもなく、main に
//      合わせても木が変わらない（中身が全部 main に入っている）ものを、判定した先端へのリースを付けて origin から消す
//      （PR を出さずに作業を移したブランチや、main に揃えて push したブランチが残るため。
//      plan/design-workflow-simplification-10.md 2 節）。クラウドでは削除が安全確認で止まるので行わない。PR の一覧が取れなければ
//      消さない
//   4. --catch-up なら、fetch できたときに catch-up.ts でトピックブランチを origin/main へ取り込む（plan/design-workflow-simplification-13.md 2 節）
// どれも条件に合わなければ何もしない。ただし 1 の main が origin/main より遅れたまま早送りできないとき
// （作業中の変更がある・早送りに失敗した）は、黙っていると気づかれないので知らせる。早送りは Windows で途中で
// 失敗すると、作業ツリーのファイルだけが書き換わり HEAD と index が残ることがある（2026-09-28、#54 の早送り）。
// 失敗してもフックを止めない（常に終了コード 0）。
//
// --wait-merge: 応答の終わりには、自動マージを予約した PR はたいてい CI を待っていてまだマージされていない。そこで、いまの
// ブランチの PR が shouldWaitMerge に合えば、マージと main の CI（生成物の commit）の終わりを待って 1・2 を行う裏の処理
// （--wait-pr <番号>）を、切り離して起こす（次の発言を待たずに揃えるため。plan/design-sync-wait-merge.md）。同じ PR を待つ
// 裏の処理が動いていれば起こさない。裏の処理の結果は知らせられない（次のフックは、もう揃っているので何も言わない）。
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { alive, type Lock, lockIsLive } from '../drive/sync-lib.ts';
import {
  bringsNothing,
  ciSettled,
  deleteArgs,
  mergeWaitState,
  openPrBranches,
  parseJson,
  parseRemoteBranches,
  prunableBranches,
  seenAt,
  shouldWaitMerge,
  WAIT_CI_MS,
  type PrView,
} from './sync-after-merge-lib.ts';

/** 成功したら標準出力（前後の空白を除く）、失敗したら null */
function run(cmd: string, args: readonly string[], cwd?: string): string | null {
  try {
    return execFileSync(cmd, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).trim();
  } catch {
    return null;
  }
}

const git = (args: readonly string[], cwd?: string) => run('git', args, cwd);
/** 追跡中のファイルに作業中の変更が無い */
const isClean = (cwd?: string) => git(['status', '--porcelain', '--untracked-files=no'], cwd) === '';
const PR_FIELDS = 'number,state,autoMergeRequest,mergedAt,mergeCommit';

/** 1・2（prune なら 3 も）を行い、知らせることを返す。origin を fetch できなければ null */
function syncAfterMerge(prune: boolean): string[] | null {
  const done: string[] = [];
  if (git(['fetch', '--quiet', '--prune', 'origin']) === null) return null;

  // 1. メインのチェックアウト（git worktree list の先頭）
  const list = git(['worktree', 'list', '--porcelain']) ?? '';
  const main = /^worktree (.+)\nHEAD [0-9a-f]+\nbranch refs\/heads\/main$/m.exec(list.split('\n\n')[0] ?? '');
  const behind = main?.[1] ? git(['rev-list', '--count', 'main..origin/main'], main[1]) : null;
  if (main?.[1] && behind !== null && behind !== '0') {
    const status = `git -C "${main[1]}" status`;
    if (!isClean(main[1]))
      done.push(
        `メインのチェックアウトの main に作業中の変更があり、origin/main へ早送りできない（${behind} コミット遅れ。${status} で確かめる）`,
      );
    else if (git(['merge', '--ff-only', '--quiet', 'origin/main'], main[1]) !== null)
      done.push('メインのチェックアウトの main を早送りした');
    else
      done.push(
        `メインのチェックアウトの main を origin/main へ早送りできなかった（${behind} コミット遅れ。${status} で確かめる。作業ツリーだけが書き換わっていることがある）`,
      );
  }

  // 2. いまのブランチ
  const branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
  const gone = branch && git(['for-each-ref', '--format=%(upstream:track)', `refs/heads/${branch}`]) === '[gone]';
  if (branch && branch !== 'main' && gone && isClean()) {
    const merged = run('gh', [
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'merged',
      '--json',
      'headRefOid',
      '--limit',
      '1',
    ]);
    const head = git(['rev-parse', 'HEAD']);
    const prHead = parseJson<{ headRefOid?: string }[]>(merged)?.[0]?.headRefOid;
    if (head && prHead === head && git(['reset', '--hard', '--quiet', 'origin/main']) !== null) {
      git(['branch', '--unset-upstream']);
      done.push(`マージ済みの ${branch} を origin/main に揃えた`);
    }
  }

  // 3. 中身が main に入った origin のブランチ
  if (prune && process.env['CLAUDE_CODE_REMOTE'] !== 'true') {
    const keep = openPrBranches(
      run('gh', ['pr', 'list', '--state', 'open', '--json', 'headRefName,baseRefName', '--limit', '200']),
    );
    if (keep !== null) {
      const branches = parseRemoteBranches(
        git([
          'for-each-ref',
          '--format=%(refname:lstrip=3)%09%(objectname)%09%(committerdate:unix)',
          'refs/remotes/origin',
        ]) ?? '',
      );
      const pruned = prunableBranches(
        branches,
        keep,
        Date.now(),
        (n) => seenAt(git, `origin/${n}`),
        (n) => bringsNothing(git, 'origin/main', `origin/${n}`),
      );
      for (const b of pruned)
        if (git(deleteArgs(b)) !== null) done.push(`中身が main に入った origin の ${b.name} を消した`);
    }
  }
  return done;
}

/** マージを待つ長さ（plan/design-sync-wait-merge.md） */
const WAIT_MERGE_MS = 3 * 60 * 60 * 1000;
/** PR と CI を見る間隔 */
const WAIT_POLL_MS = 60 * 1000;

/** PR 番号 n を待つ裏の処理の印（Lock）。worktree どうしで共有する .git に置く */
function waitLock(n: number): string | null {
  const dir = git(['rev-parse', '--git-common-dir']);
  return dir === null ? null : resolve(dir, `sync-after-merge-wait-${n}.json`);
}

/** いまのブランチが push してある（追跡先がある）なら、その名前。main・ブランチの外・push していないブランチは null */
function pushedBranch(): string | null {
  const branch = git(['symbolic-ref', '--short', '-q', 'HEAD']);
  if (!branch || branch === 'main') return null;
  return git(['for-each-ref', '--format=%(upstream)', `refs/heads/${branch}`]) ? branch : null;
}

/** ブランチ branch の PR を待つ裏の処理を、要るなら切り離して起こす */
function startWaiter(branch: string): void {
  const pr = parseJson<PrView>(run('gh', ['pr', 'view', branch, '--json', PR_FIELDS]));
  const n = pr?.number;
  if (n === undefined || !shouldWaitMerge(pr, Date.now())) return;
  const lock = waitLock(n);
  if (lock === null || lockIsLive(parseJson<Lock>(readText(lock)), Date.now(), alive, WAIT_MERGE_MS + WAIT_CI_MS))
    return;
  spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), '--wait-pr', String(n)], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
    .on('error', () => {})
    .unref();
}

/** ファイルの中身。読めなければ null */
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** PR n のマージ（WAIT_MERGE_MS まで）と、マージのコミットの CI の終わり（マージから WAIT_CI_MS まで）を待って 1・2 を行う */
async function waitPr(n: number): Promise<void> {
  const lock = Number.isInteger(n) ? waitLock(n) : null;
  if (lock === null) return;
  writeFileSync(lock, JSON.stringify({ pid: process.pid, time: Date.now() } satisfies Lock));
  try {
    const start = Date.now();
    let pr = parseJson<PrView>(run('gh', ['pr', 'view', String(n), '--json', PR_FIELDS]));
    for (let state = mergeWaitState(pr); state !== 'merged'; state = mergeWaitState(pr)) {
      if (state === 'stop' || Date.now() - start > WAIT_MERGE_MS) return;
      await sleep(WAIT_POLL_MS);
      pr = parseJson<PrView>(run('gh', ['pr', 'view', String(n), '--json', PR_FIELDS]));
    }
    syncAfterMerge(false);
    const mergedAt = pr?.mergedAt ? Date.parse(pr.mergedAt) : Date.now();
    const sha = pr?.mergeCommit?.oid;
    while (
      sha &&
      Date.now() - mergedAt < WAIT_CI_MS &&
      !ciSettled(run('gh', ['run', 'list', '--commit', sha, '--json', 'status']))
    )
      await sleep(WAIT_POLL_MS);
    syncAfterMerge(false);
  } finally {
    rmSync(lock, { force: true });
  }
}

const waitArg = process.argv.indexOf('--wait-pr');
if (waitArg >= 0) {
  await waitPr(Number(process.argv[waitArg + 1]));
} else {
  // 追跡先は、2 でマージ済みのブランチを揃えると外れるので、その前に見る（マージの直後でも main の CI を待つため）
  const branch = process.argv.includes('--wait-merge') ? pushedBranch() : null;
  const done = syncAfterMerge(process.argv.includes('--prune-branches'));
  if (branch) startWaiter(branch);
  // --catch-up <フックの出来事の名前>（SessionStart・UserPromptSubmit）: fetch できたら catch-up.ts で取り込み、エージェントに知らせる
  const at = process.argv.indexOf('--catch-up');
  const event = at >= 0 ? process.argv[at + 1] : undefined;
  const caughtUp = event && done !== null ? await (await import('./catch-up.ts')).catchUp() : null;
  const messages = [
    ...(done !== null && done.length > 0 ? [`後片付け: ${done.join('。')}`] : []),
    ...(caughtUp !== null ? [`取り込み: ${caughtUp}`] : []),
  ];
  if (messages.length > 0)
    console.log(
      JSON.stringify({
        systemMessage: messages.join('\n'),
        ...(caughtUp !== null ? { hookSpecificOutput: { hookEventName: event, additionalContext: caughtUp } } : {}),
      }),
    );
}
