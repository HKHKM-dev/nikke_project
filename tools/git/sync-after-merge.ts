// マージ済みの PR の後片付け。Claude Code のフック（.claude/settings.json の SessionStart・UserPromptSubmit・Stop）から呼ぶ。
//   node tools/git/sync-after-merge.ts
//
// スカッシュマージでは、ブランチのコミットと main 上のコミットが別物になるので、放っておくと差分の表示に
// マージ済みの変更が残る。そこで次の 2 つを行う。
//   1. メインのチェックアウトが main で作業中の変更が無ければ、origin/main へ早送りする
//   2. いまのブランチの PR がマージ済みで（リモートのブランチは自動で消える）、PR の最後のコミットが HEAD と同じで、
//      作業中の変更が無ければ、ブランチを origin/main に揃える（中身はマージ済みなので失うものは無い）
// どちらも条件に合わなければ何もしない。ただし 1 の main が origin/main より遅れたまま早送りできないとき
// （作業中の変更がある・早送りに失敗した）は、黙っていると気づかれないので知らせる。早送りは Windows で途中で
// 失敗すると、作業ツリーのファイルだけが書き換わり HEAD と index が残ることがある（2026-09-28、#54 の早送り）。
// 失敗してもフックを止めない（常に終了コード 0）。
import '../../packages/core/scripts/below-normal.ts';
import { execFileSync } from 'node:child_process';

/** 成功したら標準出力（前後の空白を除く）、失敗したら null */
function run(cmd: string, args: string[], cwd?: string): string | null {
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

const git = (args: string[], cwd?: string) => run('git', args, cwd);
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
    const prHead = merged ? (JSON.parse(merged) as { headRefOid: string }[])[0]?.headRefOid : undefined;
    if (head && prHead === head && git(['reset', '--hard', '--quiet', 'origin/main']) !== null) {
      git(['branch', '--unset-upstream']);
      done.push(`マージ済みの ${branch} を origin/main に揃えた`);
    }
  }
}

if (done.length > 0) console.log(JSON.stringify({ systemMessage: `後片付け: ${done.join('。')}` }));
