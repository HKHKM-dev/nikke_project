// マージ済みの PR の後片付け。Claude Code のフック（.claude/settings.json の SessionStart・UserPromptSubmit・Stop）から呼ぶ。
//   node tools/git/sync-after-merge.ts [--prune-branches]   --prune-branches は SessionStart だけで付ける
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
// どちらも条件に合わなければ何もしない。ただし 1 の main が origin/main より遅れたまま早送りできないとき
// （作業中の変更がある・早送りに失敗した）は、黙っていると気づかれないので知らせる。早送りは Windows で途中で
// 失敗すると、作業ツリーのファイルだけが書き換わり HEAD と index が残ることがある（2026-09-28、#54 の早送り）。
// 失敗してもフックを止めない（常に終了コード 0）。
import { execFileSync } from 'node:child_process';
import {
  bringsNothing,
  deleteArgs,
  openPrBranches,
  parseJson,
  parseRemoteBranches,
  prunableBranches,
  seenAt,
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

const done: string[] = [];

if (git(['fetch', '--quiet', '--prune', 'origin']) !== null) {
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
  if (process.argv.includes('--prune-branches') && process.env['CLAUDE_CODE_REMOTE'] !== 'true') {
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
}

if (done.length > 0) console.log(JSON.stringify({ systemMessage: `後片付け: ${done.join('。')}` }));
