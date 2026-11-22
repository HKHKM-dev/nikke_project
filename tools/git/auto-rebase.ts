// 自動マージを待つ PR の衝突を直す（plan/design-auto-conflict-fix.md 2 節の案 A）。main への push で .github/workflows/auto-rebase.yml が
// 3 つのジョブで回す。PR のブランチの道具を回すジョブ（--prepare）と、デプロイキーを持つジョブ（--push）を分ける
// （plan/design-deploy-key-scope.md 2 節）。
//   node tools/git/auto-rebase.ts --find             自動マージを予約した PR のうち、直してみるものの番号を GITHUB_OUTPUT の targets に書く
//                                                    （mergeable が決まるまで問い直す。npm ci の前に回るので node のほかは読まない）
//   node tools/git/auto-rebase.ts --prepare <dir>    鍵を持たないジョブで、環境変数 TARGETS の PR を 1 本ずつ次のように直し、結果を
//                                                    <dir> に置く（PR ごとの bundle と manifest.json。artifact で --push に渡す）
// 1. origin のブランチが、問い合わせた head のままか確かめる（進んでいれば、次の実行に任せる）。
// 2. ブランチで足した ID が main と重なっていれば（pr:prep と同じ判定）、検証記録・結論は records:renumber で振り直す。振り直しも
//    main の新しい commit も無ければ飛ばす。ブランチを 1 つの commit にまとめる（振り直す前の ID のファイルを足した commit が、
//    リベースで main と衝突しないように）。録画と課題の番号の重なり、人が直す範囲の書き方（records:renumber --fail-on-ranges が 3 で
//    終わる）があれば、直さずにコメントに回す。
// 3. npm run pr:prep -- --no-ci --allow-progress（リベース・生成物と行を足しただけの衝突の解消・生成物を main の版に戻す）。止まったら
//    コメントに回す。型・テスト・ビルドは、push で起きる PR の CI に任せる。
// 4. main の先頭からの commit を bundle にする。
//   node tools/git/auto-rebase.ts --push <dir>       デプロイキーを持つジョブで、--prepare の結果を受けて push とコメントをする。PR の
//                                                    ブランチの道具は何も回さない（main の版のこの道具と git だけ。npm ci もしない）
// 5. GitHub の API で PR を引き直し、対象のままで head が --prepare の時と同じなら、bundle を取り込み、問い合わせた head を期待値に
//    して --force-with-lease でそのブランチにだけ push する（セッションが先に push していたら断られて何もしない）。
// 6. 振り直したら PR の題名・本文の ID を書き換え、手元を揃えてもらうコメントを書く。push の後に自動マージが外れていたらコメントする
//    （予約し直さない。GITHUB_TOKEN で予約すると、マージの push で main の CI が起きない）。
// コメントには head の印を入れ、同じ head に同じコメントを 2 回書かない。直せなかった head は --find が飛ばす（通信などの一時の失敗は
// コメントせず、次の実行で直し直す）。
// commit の身元は AUTO_REBASE_COMMITTER（pr:prep は、origin のブランチの先頭がこの身元で手元に無ければ止める）。
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  autoMergeLostComment,
  bundleArgs,
  commented,
  failureComment,
  isTarget,
  type MarkKind,
  parsePrepManifest,
  pollMergeable,
  PREP_MANIFEST,
  prepBundle,
  type PrepEntry,
  type Pull,
  type PullFile,
  pushBundle,
  type Renumber,
  fixedComment,
  splitCollisions,
  transientFailure,
  worthFixing,
} from './auto-rebase-lib.ts';
import { cliArgs } from '../../packages/core/scripts/cli.ts';

const { values } = cliArgs(import.meta.url, {
  options: {
    find: { type: 'boolean', default: false },
    prepare: { type: 'string' },
    push: { type: 'string' },
  },
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
/** PR のコメントの本文（全部のページ） */
async function commentBodies(n: number): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; ; page++) {
    const got = await api<{ body: string | null }[]>(`/issues/${n}/comments?per_page=100&page=${page}`);
    out.push(...got.map((c) => c.body ?? ''));
    if (got.length < 100) return out;
  }
}

async function comment(n: number, kind: MarkKind, sha: string, body: string): Promise<void> {
  if (commented(await commentBodies(n), kind, sha)) return;
  await api(`/issues/${n}/comments`, { method: 'POST', body: { body } });
  console.log(`#${n}: コメントした（${kind}）`);
}

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

if (values.find) {
  const prs = (await api<Pull[]>('/pulls?state=open&per_page=100')).filter((p) => isTarget(p, repo));
  // mergeable は PR ごとに GitHub が計算するので、全部を並べて待つ
  const picked = await Promise.all(
    prs.map(async (p) => {
      const mergeable = await pollMergeable(async () => (await pull(p.number)).mergeable ?? null, sleep);
      // 変えたファイルは、衝突していない PR の ID の重なりを見るときだけ要る
      const files = mergeable === true ? await api<PullFile[]>(`/pulls/${p.number}/files?per_page=100`) : [];
      const failed = worthFixing(mergeable, files) && commented(await commentBodies(p.number), 'failed', p.head.sha);
      console.log(`#${p.number} ${p.head.ref}: mergeable=${mergeable}${failed ? '（この head は直せなかった）' : ''}`);
      return !failed && worthFixing(mergeable, files) ? [p.number] : [];
    }),
  );
  const targets = picked.flat();
  console.log(`直してみる PR: ${targets.map((n) => `#${n}`).join('・') || 'なし'}`);
  const out = process.env['GITHUB_OUTPUT'];
  if (out) appendFileSync(out, `targets=${targets.join(' ')}\n`);
  process.exit(0);
}

if (values.prepare !== undefined) await prepare(values.prepare);
else if (values.push !== undefined) await push(values.push);
else throw new Error('--find・--prepare <dir>・--push <dir> のどれかを付ける');

/** --prepare: 鍵を持たないジョブで、PR のブランチの道具を回して直し、結果を dir に置く */
async function prepare(dir: string): Promise<void> {
  // ここからは npm ci の後（core を読む）
  const { AUTO_REBASE_COMMITTER, AUTO_REBASE_ENV, branchCollisions, nulPaths, pathListArgs, squashBranch } =
    await import('./pr-prep-lib.ts');
  const { renumberInText } = await import('../../packages/core/src/records/renumber.ts');
  const { idsInBranches } = await import('../../packages/core/scripts/records-data.ts');

  const gitPaths = (args: readonly string[]): string[] =>
    nulPaths(execFileSync('git', pathListArgs(args), { cwd: ROOT, encoding: 'utf8' }));
  const replaceIds = (text: string, pairs: readonly Renumber[]) =>
    pairs.reduce((t, r) => renumberInText(t, r.from, r.to).text, text);

  // PR を先に全部引き、token を子に渡さない（このジョブの token は読むだけだが、PR のブランチの道具には要らない）
  const prs: Pull[] = [];
  for (const n of targetNumbers()) prs.push(await pull(n));
  delete process.env['GITHUB_TOKEN'];
  // 子の pr:prep・records:renumber の commit も同じ身元にする。子の pr:prep は、origin のブランチをこの身元が直していても止めない
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: AUTO_REBASE_COMMITTER.name,
    GIT_AUTHOR_EMAIL: AUTO_REBASE_COMMITTER.email,
    GIT_COMMITTER_NAME: AUTO_REBASE_COMMITTER.name,
    GIT_COMMITTER_EMAIL: AUTO_REBASE_COMMITTER.email,
    [AUTO_REBASE_ENV]: '1',
  });

  /** 作業ツリーを片付ける（リベースの途中なら中止し、変更と追跡していないファイルを消す。node_modules は無視されるので残る） */
  function cleanUp(): void {
    run('git', ['rebase', '--abort']);
    run('git', ['reset', '--hard', '--quiet']);
    run('git', ['clean', '-fdq']);
  }

  type Outcome =
    | { kind: 'skip' }
    | { kind: 'ready'; head: string; renumbered: Renumber[] }
    /** retry: 通信などの一時の失敗。コメントせず、次の実行で直し直す（コメントすると --find がこの head を飛ばし続ける） */
    | { kind: 'failed'; reason: string; output?: string; retry?: true };

  function fix(pr: Pull): Outcome {
    const { ref: branch, sha } = pr.head;
    if (!gitOk(['fetch', '--quiet', 'origin']))
      return { kind: 'failed', reason: 'git fetch origin が落ちた', retry: true };
    if (git(['rev-parse', `origin/${branch}`]) !== sha) {
      console.log(`#${pr.number}: origin のブランチが進んでいる。次の実行に任せる`);
      return { kind: 'skip' };
    }
    git(['checkout', '--quiet', '-B', branch, `origin/${branch}`]);

    const { found } = branchCollisions(gitPaths, idsInBranches().ids);
    const { renumber, manual } = splitCollisions(found);
    if (manual.length > 0)
      return {
        kind: 'failed',
        reason: `振り直さない番号が main と重なった（${manual.map((c) => c.id).join('・')}。録画はオーナーの手元で npm run records:renumber、課題の番号は git mv で直す）`,
      };
    // 振り直しも main の新しい commit も無ければ、直すものが無い（mergeable が決まらなかった PR。まとめて push し直さない）
    if (renumber.length === 0 && (pr.mergeable === true || git(['rev-list', '--count', 'HEAD..origin/main']) === '0')) {
      console.log(`#${pr.number}: 衝突も番号の重なりも無い`);
      return { kind: 'skip' };
    }
    for (const r of renumber) {
      // 範囲の書き方があれば 3 で終わる（置き換えは片付けで捨てる）
      const done = run('node', ['packages/core/scripts/records-renumber.ts', r.from, r.to, '--fail-on-ranges']);
      if (done.status !== 0)
        return {
          kind: 'failed',
          reason:
            done.status === 3
              ? `${r.from} が範囲の書き方の中にあり、振り直すと範囲が崩れる`
              : `records:renumber ${r.from} ${r.to} が止まった`,
          output: done.output,
        };
    }
    // ブランチを 1 つの commit にまとめてからリベースする（PR はスカッシュでマージする）。まとめないと、振り直す前の ID のファイルを足した
    // commit がリベースで main と衝突する。途中の commit だけが衝突することも無くなる
    const note =
      renumber.length > 0 ? `。番号の振り直し: ${renumber.map((r) => `${r.from} → ${r.to}`).join('、')}` : '';
    git(['add', '--all']);
    squashBranch(
      git,
      replaceIds(pr.title, renumber),
      `衝突の直し（自動）で、main を取り込む前に 1 つにまとめた${note}`,
      (t) => replaceIds(t, renumber),
    );

    const prep = run('node', ['tools/git/pr-prep.ts', '--no-ci', '--allow-progress']);
    if (prep.status !== 0)
      return transientFailure(prep.output)
        ? { kind: 'failed', reason: '`pr:prep` が通信の失敗で止まった', output: prep.output, retry: true }
        : {
            kind: 'failed',
            reason: '`pr:prep` が止まった（生成物でないファイルの中身の衝突など）',
            output: prep.output,
          };
    if (git(['rev-list', '--count', 'origin/main..HEAD']) === '0') {
      console.log(`#${pr.number}: 取り込むと main と同じになった。何もしない`);
      return { kind: 'skip' };
    }
    return { kind: 'ready', head: git(['rev-parse', 'HEAD']), renumbered: renumber };
  }

  mkdirSync(dir, { recursive: true });
  const entries: PrepEntry[] = [];
  let failures = 0;
  for (const pr of prs) {
    const n = pr.number;
    if (!isTarget(pr, repo!)) continue;
    console.log(`::group::#${n} ${pr.head.ref}`);
    let outcome: Outcome;
    try {
      outcome = fix(pr);
      if (outcome.kind === 'ready')
        // main の先頭（pr:prep が取り込んだもの）からの commit だけを入れる。--push は main を取ってから取り込む
        git(bundleArgs(join(dir, prepBundle(n))));
    } catch (e) {
      const output = (e as Error).message;
      outcome = transientFailure(output)
        ? { kind: 'failed', reason: '通信の失敗', output, retry: true }
        : { kind: 'failed', reason: '道具が落ちた', output };
    }
    // 次の PR のために片付ける
    cleanUp();
    console.log('::endgroup::');
    if (outcome.kind === 'skip') continue;
    if (outcome.kind === 'ready') {
      console.log(`#${n}: 直した（${outcome.head.slice(0, 8)}）。push は次のジョブ`);
      entries.push({
        number: n,
        sha: pr.head.sha,
        kind: 'ready',
        head: outcome.head,
        bundle: prepBundle(n),
        renumbered: outcome.renumbered,
      });
      continue;
    }
    failures++;
    console.log(`::warning::#${n}: ${outcome.reason}`);
    if (outcome.retry) continue;
    entries.push({
      number: n,
      sha: pr.head.sha,
      kind: 'failed',
      reason: outcome.reason,
      ...(outcome.output !== undefined ? { output: outcome.output } : {}),
    });
  }
  writeFileSync(join(dir, PREP_MANIFEST), `${JSON.stringify(entries, null, 2)}\n`);
  console.log(failures > 0 ? `直せなかった PR が ${failures} 本` : '終わった');
}

/**
 * --push: デプロイキーを持つジョブで、--prepare の結果を push してコメントする。PR のブランチの道具は回さない。PR ごとの API の
 * 失敗は、残りの PR を続けてから 1 で終わる
 */
async function push(dir: string): Promise<void> {
  const { sshEnv, sshRemote } = await import('./deploy-key.ts');
  const key = process.env['DEPLOY_KEY'];
  if (!key) throw new Error('environment の secret の GENERATED_DEPLOY_KEY（環境変数 DEPLOY_KEY）が要る');
  const ssh = sshEnv(key);
  const remote = sshRemote(repo!);

  const entries = parsePrepManifest(readFileSync(join(dir, PREP_MANIFEST), 'utf8'));
  if (entries.length === 0) {
    console.log('push するものもコメントするものも無い');
    return;
  }
  // bundle は --prepare の時の main の先頭を前提にするので、main を取る（浅い取り出しでも、先頭までの commit が入る）
  // このジョブの作業ツリーは main の版を取り出しただけなので、フックは無い。念のため git にフックを読ませない
  const gitRun = (args: readonly string[]) => run('git', ['-c', 'core.hooksPath=/dev/null', ...args], ssh);
  if (gitRun(['fetch', '--quiet', '--no-tags', remote, '+refs/heads/main:refs/remotes/origin/main']).status !== 0)
    throw new Error('デプロイキーで main を取れない');

  let errors = 0;
  const pushed: { n: number; head: string }[] = [];
  for (const entry of entries) {
    const n = entry.number;
    try {
      const pr = await pull(n);
      // push の先は API で引き直したブランチ（対象の名前に限る）。--prepare の後に進んだ PR は、次の実行に任せる
      if (!isTarget(pr, repo!) || pr.head.sha !== entry.sha) {
        console.log(`#${n}: 対象でなくなったか、ブランチが進んだ。何もしない`);
        continue;
      }
      if (entry.kind === 'failed') {
        await comment(n, 'failed', entry.sha, failureComment(entry.sha, entry.reason, entry.output));
        continue;
      }
      const branch = pr.head.ref;
      const outcome = pushBundle(gitRun, {
        bundle: join(dir, entry.bundle),
        number: n,
        head: entry.head,
        branch,
        sha: entry.sha,
        remote,
      });
      if (outcome === 'error') {
        // 通信などの一時の失敗とみて、コメントせず次の実行で直し直す
        console.log(`::warning::#${n}: push が落ちた`);
        errors++;
        continue;
      }
      if (outcome === 'stale') {
        console.log(`#${n}: push の間にブランチが進んだ（セッションが直した）。何もしない`);
        continue;
      }
      console.log(`#${n}: 直して push した（${entry.head.slice(0, 8)}）`);
      pushed.push({ n, head: entry.head });
      if (entry.renumbered.length > 0) {
        const { renumberInText } = await import('../../packages/core/src/records/renumber.ts');
        const replaceIds = (text: string) =>
          entry.renumbered.reduce((t, r) => renumberInText(t, r.from, r.to).text, text);
        await api(`/pulls/${n}`, {
          method: 'PATCH',
          body: { title: replaceIds(pr.title), body: replaceIds(pr.body ?? '') },
        });
      }
      await comment(n, 'fixed', entry.head, fixedComment(entry.head, branch, entry.renumbered));
    } catch (e) {
      console.log(`::error::#${n}: ${(e as Error).message}`);
      errors++;
    }
  }
  // push の後に GitHub が予約を外すかは非同期なので、少し待ってからまとめて見る
  if (pushed.length > 0) await sleep(10_000);
  for (const { n, head } of pushed) {
    try {
      if ((await pull(n)).auto_merge == null) await comment(n, 'auto-merge', head, autoMergeLostComment(head));
    } catch (e) {
      console.log(`::error::#${n}: ${(e as Error).message}`);
      errors++;
    }
  }
  console.log(errors > 0 ? `失敗が ${errors} 件（上の注釈）` : '終わった');
  if (errors > 0) process.exitCode = 1;
}

function targetNumbers(): number[] {
  return (process.env['TARGETS'] ?? '')
    .split(/\s+/)
    .filter((s) => s !== '')
    .map(Number);
}
