// 自動マージを待つ PR の衝突を直す（plan/design-auto-conflict-fix.md 2 節の案 A）。main への push で .github/workflows/auto-rebase.yml が回す。
//   node tools/git/auto-rebase.ts --find   自動マージを予約した PR のうち、直してみるものの番号を GITHUB_OUTPUT の targets に書く
//                                          （mergeable が決まるまで問い直す。npm ci の前に回るので node のほかは読まない）
//   node tools/git/auto-rebase.ts --fix    環境変数 TARGETS の PR を、1 本ずつ次のように直す
// 1. origin のブランチが、問い合わせた head のままか確かめる（進んでいれば、次の実行に任せる）。
// 2. ブランチで足した ID が main と重なっていれば（pr:prep と同じ判定）、検証記録・結論は records:renumber で振り直す。ブランチを
//    1 つの commit にまとめる（振り直す前の ID のファイルを足した commit が、リベースで main と衝突しないように）。
//    録画と課題の番号の重なり、人が直す範囲の書き方（records:renumber --fail-on-ranges）があれば、直さずにコメントする。
// 3. npm run pr:prep -- --no-ci --allow-progress（リベース・生成物と行を足しただけの衝突の解消・生成物を main の版に戻す）。止まったら
//    コメントする。型・テスト・ビルドは、push で起きる PR の CI に任せる。
// 4. デプロイキーで、問い合わせた head を期待値にして --force-with-lease で push する（セッションが先に push していたら断られて何もしない）。
// 5. 振り直したら、PR の題名・本文の ID を書き換えてコメントする。push の後に自動マージが外れていたらコメントする（予約し直さない。
//    GITHUB_TOKEN で予約すると、マージの push で main の CI が起きない）。
// コメントには head の印を入れ、同じ head に同じコメントを 2 回書かない。直せなかった head は --find が飛ばす。
// commit の身元は AUTO_REBASE_COMMITTER（pr:prep は、origin のブランチの先頭がこの身元で手元に無ければ止める）。
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  autoMergeLostComment,
  commented,
  failureComment,
  isTarget,
  type MarkKind,
  pollMergeable,
  type Pull,
  type PullFile,
  pushOutcome,
  type Renumber,
  renumberedComment,
  replaceIds,
  splitCollisions,
  worthFixing,
} from './auto-rebase-lib.ts';
import { cliArgs } from '../../packages/core/scripts/cli.ts';

const { values } = cliArgs(import.meta.url, {
  options: { find: { type: 'boolean', default: false }, fix: { type: 'boolean', default: false } },
});

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const repo = process.env['GITHUB_REPOSITORY'];
const token = process.env['GITHUB_TOKEN'];
if (!repo || !token) throw new Error('GITHUB_REPOSITORY・GITHUB_TOKEN が要る');

async function api<T>(path: string, init?: { method: string; body: unknown }): Promise<T> {
  const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init ? { body: JSON.stringify(init.body) } : {}),
  });
  if (!r.ok) throw new Error(`${init?.method ?? 'GET'} ${path} が ${r.status} で終わった: ${await r.text()}`);
  return (await r.json()) as T;
}

const pull = (n: number) => api<Pull>(`/pulls/${n}`);
const commentBodies = async (n: number) =>
  (await api<{ body: string | null }[]>(`/issues/${n}/comments?per_page=100`)).map((c) => c.body ?? '');

async function comment(n: number, kind: MarkKind, sha: string, body: string): Promise<void> {
  if (commented(await commentBodies(n), kind, sha)) return;
  await api(`/issues/${n}/comments`, { method: 'POST', body: { body } });
  console.log(`#${n}: コメントした（${kind}）`);
}

if (values.find) {
  const prs = (await api<Pull[]>('/pulls?state=open&per_page=100')).filter((p) => isTarget(p, repo));
  const targets: number[] = [];
  for (const p of prs) {
    const mergeable = await pollMergeable(async () => (await pull(p.number)).mergeable ?? null, sleep);
    const files = await api<PullFile[]>(`/pulls/${p.number}/files?per_page=100`);
    const failed = commented(await commentBodies(p.number), 'failed', p.head.sha);
    console.log(`#${p.number} ${p.head.ref}: mergeable=${mergeable}${failed ? '（この head は直せなかった）' : ''}`);
    if (!failed && worthFixing(mergeable, files)) targets.push(p.number);
  }
  console.log(`直してみる PR: ${targets.map((n) => `#${n}`).join('・') || 'なし'}`);
  const out = process.env['GITHUB_OUTPUT'];
  if (out) appendFileSync(out, `targets=${targets.join(' ')}\n`);
  process.exit(0);
}

if (!values.fix) throw new Error('--find か --fix を付ける');

// ここからは npm ci の後（core を読む）
const { AUTO_REBASE_COMMITTER, AUTO_REBASE_ENV, branchCollisions, nulPaths, pathListArgs } =
  await import('./pr-prep-lib.ts');
const { idsInBranches } = await import('../../packages/core/scripts/records-data.ts');
const { sshEnv, sshRemote } = await import('./deploy-key.ts');

const key = process.env['DEPLOY_KEY'];
if (!key) throw new Error('secret の GENERATED_DEPLOY_KEY（環境変数 DEPLOY_KEY）が要る');
const ssh = sshEnv(key);
const identity = {
  GIT_AUTHOR_NAME: AUTO_REBASE_COMMITTER.name,
  GIT_AUTHOR_EMAIL: AUTO_REBASE_COMMITTER.email,
  GIT_COMMITTER_NAME: AUTO_REBASE_COMMITTER.name,
  GIT_COMMITTER_EMAIL: AUTO_REBASE_COMMITTER.email,
};
// 子の pr:prep・records:renumber の commit も同じ身元にする。子の pr:prep は、origin のブランチをこの身元が直していても止めない
Object.assign(process.env, identity, { [AUTO_REBASE_ENV]: '1' });

type Run = { status: number; output: string };

function run(cmd: string, args: readonly string[], env?: Record<string, string>): Run {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (output.trim() !== '') console.log(output.trimEnd());
  return { status: r.status ?? 1, output };
}

const git = (args: readonly string[]): string =>
  execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const gitOk = (args: readonly string[]): boolean => run('git', args).status === 0;
const gitPaths = (args: readonly string[]): string[] =>
  nulPaths(execFileSync('git', pathListArgs(args), { cwd: ROOT, encoding: 'utf8' }));

/** 作業ツリーを片付ける（リベースの途中なら中止し、変更と追跡していないファイルを消す。node_modules は無視されるので残る） */
function cleanUp(): void {
  run('git', ['rebase', '--abort']);
  run('git', ['reset', '--hard', '--quiet']);
  run('git', ['clean', '-fdq']);
}

type Outcome =
  | { kind: 'skip' | 'stale' }
  | { kind: 'pushed'; head: string; renumbered: Renumber[] }
  | { kind: 'failed'; reason: string; output?: string };

function fix(pr: Pull): Outcome {
  const { ref: branch, sha } = pr.head;
  if (!gitOk(['fetch', '--quiet', 'origin'])) return { kind: 'failed', reason: 'git fetch origin が落ちた' };
  if (git(['rev-parse', `origin/${branch}`]) !== sha) {
    console.log(`#${pr.number}: origin のブランチが進んでいる。次の実行に任せる`);
    return { kind: 'skip' };
  }
  git(['checkout', '--quiet', '-B', branch, `origin/${branch}`]);
  git(['branch', '--quiet', `--set-upstream-to=origin/${branch}`]);

  const { found } = branchCollisions(gitPaths, idsInBranches().ids);
  const { renumber, manual } = splitCollisions(found);
  if (manual.length > 0)
    return {
      kind: 'failed',
      reason: `振り直さない番号が main と重なった（${manual.map((c) => c.id).join('・')}。録画はオーナーの手元で npm run records:renumber、課題の番号は git mv で直す）`,
    };
  if (renumber.length === 0 && pr.mergeable === true) {
    console.log(`#${pr.number}: 衝突も番号の重なりも無い`);
    return { kind: 'skip' };
  }
  for (const r of renumber) {
    const dry = run('node', [
      'packages/core/scripts/records-renumber.ts',
      r.from,
      r.to,
      '--dry-run',
      '--fail-on-ranges',
    ]);
    if (dry.status === 3)
      return {
        kind: 'failed',
        reason: `${r.from} が範囲の書き方の中にあり、振り直すと範囲が崩れる`,
        output: dry.output,
      };
    if (dry.status !== 0)
      return { kind: 'failed', reason: `records:renumber ${r.from} ${r.to} が止まった`, output: dry.output };
    const done = run('node', ['packages/core/scripts/records-renumber.ts', r.from, r.to]);
    if (done.status !== 0)
      return { kind: 'failed', reason: `records:renumber ${r.from} ${r.to} が止まった`, output: done.output };
  }
  // ブランチを 1 つの commit にまとめてからリベースする（PR はスカッシュでマージする）。まとめないと、振り直す前の ID のファイルを足した
  // commit がリベースで main と衝突する。途中の commit だけが衝突することも無くなる
  git(['add', '--all']);
  git(['reset', '--quiet', '--soft', git(['merge-base', 'origin/main', 'HEAD'])]);
  const note = renumber.length > 0 ? `。番号の振り直し: ${renumber.map((r) => `${r.from} → ${r.to}`).join('、')}` : '';
  git(['commit', '--quiet', '-m', `${pr.title}\n\n衝突の直し（自動）で、main を取り込む前に 1 つにまとめた${note}`]);

  const prep = run('node', ['tools/git/pr-prep.ts', '--no-ci', '--allow-progress']);
  if (prep.status !== 0)
    return {
      kind: 'failed',
      reason: '`pr:prep` が止まった（生成物でないファイルの中身の衝突など）',
      output: prep.output,
    };
  if (git(['rev-parse', 'HEAD']) === sha) {
    console.log(`#${pr.number}: 取り込むものが無かった`);
    return { kind: 'skip' };
  }

  const head = git(['rev-parse', 'HEAD']);
  const push = run(
    'git',
    ['push', `--force-with-lease=refs/heads/${branch}:${sha}`, sshRemote(repo!), `HEAD:refs/heads/${branch}`],
    ssh,
  );
  const outcome = pushOutcome(push.status, push.output);
  if (outcome === 'error') return { kind: 'failed', reason: 'push が落ちた', output: push.output };
  return outcome === 'pushed' ? { kind: 'pushed', head, renumbered: renumber } : { kind: 'stale' };
}

let failures = 0;
for (const n of (process.env['TARGETS'] ?? '')
  .split(/\s+/)
  .filter((s) => s !== '')
  .map(Number)) {
  const pr = await pull(n);
  if (!isTarget(pr, repo)) continue;
  console.log(`::group::#${n} ${pr.head.ref}`);
  let outcome: Outcome;
  try {
    outcome = fix(pr);
  } catch (e) {
    outcome = { kind: 'failed', reason: '道具が落ちた', output: (e as Error).message };
  }
  // 次の PR のために片付ける
  cleanUp();
  console.log('::endgroup::');
  if (outcome.kind === 'failed') {
    failures++;
    console.log(`::warning::#${n}: ${outcome.reason}`);
    await comment(n, 'failed', pr.head.sha, failureComment(pr.head.sha, outcome.reason, outcome.output));
    continue;
  }
  if (outcome.kind === 'stale') console.log(`#${n}: push の間にブランチが進んだ（セッションが直した）。何もしない`);
  if (outcome.kind !== 'pushed') continue;
  const { head } = outcome;
  console.log(`#${n}: 直して push した（${head.slice(0, 8)}）`);
  if (outcome.renumbered.length > 0) {
    await api(`/pulls/${n}`, {
      method: 'PATCH',
      body: { title: replaceIds(pr.title, outcome.renumbered), body: replaceIds(pr.body ?? '', outcome.renumbered) },
    });
    await comment(n, 'renumbered', head, renumberedComment(head, outcome.renumbered));
  }
  // push の後に GitHub が予約を外すかは非同期なので、少し待ってから見る
  await sleep(10_000);
  if ((await pull(n)).auto_merge == null) await comment(n, 'auto-merge', head, autoMergeLostComment(head));
}
console.log(failures > 0 ? `直せなかった PR が ${failures} 本（コメントした）` : '終わった');
