// main への push の CI で、作り直した生成物を commit して push する決まりごと（plan/design-pr-conflicts.md 5 節）。git を呼ぶ部分
// （ci-generated.ts）と分けてテストする。

/** 書き込みのできるデプロイキーの秘密鍵を置く secret の名前 */
export const DEPLOY_KEY_SECRET = 'GENERATED_DEPLOY_KEY';

export type GitRun = { status: number; stdout: string; stderr: string };

export type CommitGeneratedInput = {
  /** 作り直しで変わった生成物 */
  generated: readonly string[];
  /** この CI の commit（GITHUB_SHA） */
  sha: string | undefined;
  /** owner/repo（GITHUB_REPOSITORY） */
  repo: string | undefined;
  /** デプロイキーの秘密鍵（secret の GENERATED_DEPLOY_KEY） */
  key: string | undefined;
  /** 鍵をファイルに置き、git の ssh に渡す環境変数を返す */
  sshEnv: (key: string) => Readonly<Record<string, string>>;
  /** git を引数で呼ぶ（0 以外で終わっても投げない） */
  git: (args: readonly string[], env?: Readonly<Record<string, string>>) => GitRun;
};

const KEY_HELP = `鍵の組を作り直し、公開鍵を Settings → Deploy keys に「Allow write access」つきで、秘密鍵を Settings → Secrets and variables → Actions の ${DEPLOY_KEY_SECRET} に登録し直す（plan/design-pr-conflicts.md 5 節）`;

/**
 * 生成物の差分を commit して main に push し、出すメッセージを返す。直す必要のある失敗（鍵が無い・鍵で origin に届かない・鍵で
 * 書き込めない・push が main の進み以外で断られた）は投げる。差分が無くても先に、鍵で origin を読めることと、書き込みの口
 * （receive-pack）に入れること（push --dry-run）を確かめる（鍵の壊れや書き込みの権限の外れに、差分の出たマージで初めて気づかない
 * ように）。ruleset の bypass は、本当に送るまで GitHub が見ないので、ここでは確かめられない（push の時に投げる）。origin/main が
 * この commit でないか、push の間に main が進んで断られたら何もしない（後の commit の CI が全部を作り直す）
 */
export function commitGenerated(input: CommitGeneratedInput): string {
  const { generated, sha, repo, key, git } = input;
  if (!sha || !repo) throw new Error('GITHUB_SHA・GITHUB_REPOSITORY が要る');
  if (!key)
    throw new Error(`secret の ${DEPLOY_KEY_SECRET}（書き込みのできるデプロイキーの秘密鍵）が無い。${KEY_HELP}`);
  const ssh = input.sshEnv(key);
  const remote = `git@github.com:${repo}.git`;
  const ls = git(['ls-remote', remote, 'refs/heads/main'], ssh);
  if (ls.status !== 0)
    throw new Error(
      `secret の ${DEPLOY_KEY_SECRET} の鍵で origin に届かない（git ls-remote が ${ls.status} で終わった）。${KEY_HELP}\n${ls.stderr.trim()}`,
    );
  // 書き込みの権限は receive-pack に入る時に見られる。main が進んでいて手元で断られた（non-fast-forward）のも、入れた後の話なので通す
  const dry = git(['push', '--dry-run', '--quiet', remote, 'HEAD:refs/heads/main'], ssh);
  if (dry.status !== 0 && !isNotFastForward(dry.stderr))
    throw new Error(
      `secret の ${DEPLOY_KEY_SECRET} の鍵で origin に書き込めない（git push --dry-run が ${dry.status} で終わった。デプロイキーの「Allow write access」が外れていないか）。${KEY_HELP}\n${dry.stderr.trim()}`,
    );
  if (generated.length === 0) return '生成物は合っている（デプロイキーで origin を読み書きできることは確かめた）';
  const head = ls.stdout.split('\t')[0] ?? '';
  if (head !== sha)
    return `origin/main が進んでいる（${head.slice(0, 8)}）。その commit の CI が作り直すので、ここでは commit しない`;
  const commit = git([
    '-c',
    'user.name=github-actions[bot]',
    '-c',
    'user.email=41898283+github-actions[bot]@users.noreply.github.com',
    'commit',
    '--quiet',
    '-m',
    '生成物を作り直す（CI）',
    '--',
    ...generated,
  ]);
  if (commit.status !== 0) throw new Error(`git commit が ${commit.status} で終わった\n${commit.stderr.trim()}`);
  const push = git(['push', '--quiet', remote, 'HEAD:refs/heads/main'], ssh);
  if (push.status === 0) return `生成物を作り直して main に push した: ${generated.join('・')}`;
  if (isNotFastForward(push.stderr))
    return 'ls-remote の後に main が進み、push が断られた。後の commit の CI が作り直すので、ここでは commit しない';
  throw new Error(`git push が ${push.status} で終わった\n${push.stderr.trim()}`);
}

/**
 * git push が、送り先の枝が進んでいたので断られたか（「! [rejected] … (non-fast-forward)」か「(fetch first)」）。ruleset などで
 * 断られたもの（「! [remote rejected]」）は含まない
 */
export function isNotFastForward(stderr: string): boolean {
  return /^\s*! \[rejected\].*\((?:non-fast-forward|fetch first)\)/m.test(stderr);
}
