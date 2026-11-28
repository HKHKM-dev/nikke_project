// 自動マージを待つ PR の衝突を直す GitHub Actions（auto-rebase.ts）の決まりごと（plan/design-auto-conflict-fix.md 2 節の案 A）。
// GitHub と git を呼ぶ部分と分けてテストする。--find と --push は npm ci の前・無しで回るので、node と import の無い ids.ts のほかは読まない（型だけ読む）。
import { C_ID, ID_RECORD_DIRS, V_ID } from '../../packages/core/src/records/ids.ts';
import type { Collision } from './pr-prep-lib.ts';

/** GitHub の PR（REST の pulls の、使う欄だけ） */
export type Pull = {
  number: number;
  state: string;
  title: string;
  body: string | null;
  mergeable?: boolean | null;
  auto_merge: unknown;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
};

/** PR の変えたファイル（REST の pulls/N/files） */
export type PullFile = { filename: string; status: string };

/** 直してよいブランチ（エージェントのブランチ。AGENTS.md「併用ルール」） */
const BRANCH_PREFIXES = ['claude/', 'antigrav/'];

/** 直す対象か: 開いていて、自動マージを予約していて、head が同じリポジトリのエージェントのブランチ */
export function isTarget(pr: Pick<Pull, 'state' | 'auto_merge' | 'head'>, repo: string): boolean {
  return (
    pr.state === 'open' &&
    pr.auto_merge != null &&
    pr.head.repo?.full_name === repo &&
    BRANCH_PREFIXES.some((p) => pr.head.ref.startsWith(p))
  );
}

/**
 * --find が --prepare に渡す PR（環境変数 PRS の 1 行の JSON）。--prepare が読む欄だけにする（REST の PR は 1 本で約 18KB あり、
 * 環境変数 1 つの上限を数本で超える。plan/design-deploy-key-scope.md 5 節）。本文は渡さない（--push が API で引き直して書き換える）。
 * 自動マージの予約は、有無だけを true で残す
 */
export type PrepPull = Pick<Pull, 'number' | 'state' | 'title' | 'mergeable' | 'head'> & { auto_merge: true | null };

export function prepPull(p: Pull): PrepPull {
  return {
    number: p.number,
    state: p.state,
    title: p.title,
    mergeable: p.mergeable ?? null,
    auto_merge: p.auto_merge == null ? null : true,
    head: { ref: p.head.ref, sha: p.head.sha, repo: p.head.repo ? { full_name: p.head.repo.full_name } : null },
  };
}

/**
 * PRS の JSON の上限（バイト）。Linux の環境変数 1 つの上限（MAX_ARG_STRLEN、128KiB。「PRS=」を含む）から余裕を引いたもの。
 * 超えると --prepare のジョブの node が起動できず（E2BIG）、どの PR も直らない
 */
export const PRS_LIMIT = 120 * 1024;

/**
 * --find の出力（直してみる PR の番号と PRS の JSON）を作る。PRS に入りきらない（limit を超える）PR は、次の実行に回す
 * （deferred。番号も targets に入れない）
 */
export function findOutput(
  picked: readonly Pull[],
  limit = PRS_LIMIT,
): { targets: number[]; prs: string; deferred: number[] } {
  const kept: PrepPull[] = [];
  const deferred: number[] = [];
  let size = 2; // []
  for (const p of picked) {
    const slim = prepPull(p);
    const add = Buffer.byteLength(JSON.stringify(slim)) + (kept.length > 0 ? 1 : 0);
    if (size + add > limit) {
      deferred.push(p.number);
      continue;
    }
    kept.push(slim);
    size += add;
  }
  return { targets: kept.map((p) => p.number), prs: JSON.stringify(kept), deferred };
}

/** ID が重なりうる記録（検証記録・結論・録画・課題の番号）を足したか（足したものと名前を変えたもの） */
export function addsRecords(files: readonly PullFile[]): boolean {
  return files.some(
    (f) =>
      (f.status === 'added' || f.status === 'renamed') && ID_RECORD_DIRS.some((d) => f.filename.startsWith(`${d}/`)),
  );
}

/**
 * 直してみる PR か。衝突（mergeable が false）か、決まらなかった（null）か、ID の重なりうる記録を足したもの（検証記録はファイル名に
 * 名前が付くので、番号が重なっても Git の衝突にならない。重なりは --prepare が git で確かめる）
 */
export function worthFixing(mergeable: boolean | null, files: readonly PullFile[]): boolean {
  return mergeable !== true || addsRecords(files);
}

/**
 * mergeable を、決まる（null でなくなる）まで問い直す。GitHub は main の push の後に非同期で計算する。tries 回で決まらなければ null
 */
export async function pollMergeable(
  get: () => Promise<boolean | null>,
  sleep: (ms: number) => Promise<void>,
  tries = 24,
  intervalMs = 5000,
): Promise<boolean | null> {
  for (let i = 0; i < tries; i++) {
    const m = await get();
    if (m !== null) return m;
    if (i < tries - 1) await sleep(intervalMs);
  }
  return null;
}

export type MarkKind = 'failed' | 'fixed' | 'auto-merge';

/** コメントに入れる印（同じ head に同じコメントを 2 回書かない） */
export const mark = (kind: MarkKind, sha: string): string => `<!-- auto-rebase:${kind}:${sha} -->`;

/** コメントの本文の中に、この head のこの印があるか */
export function commented(bodies: readonly string[], kind: MarkKind, sha: string): boolean {
  const m = mark(kind, sha);
  return bodies.some((b) => b.includes(m));
}

export type Renumber = { from: string; to: string };

/**
 * 重なりを、Actions が振り直すもの（検証記録・結論で、番号の案があるもの）と、振り直さないもの（録画は E: と Drive の名前も変えるので
 * オーナーの手元で回す。課題の番号は道具で振り直さない。plan/design-backlog-files.md 2.2 節）に分ける
 */
export function splitCollisions(found: readonly Collision[]): { renumber: Renumber[]; manual: Collision[] } {
  const renumber: Renumber[] = [];
  const manual: Collision[] = [];
  for (const c of found) {
    if ((V_ID.test(c.id) || C_ID.test(c.id)) && c.suggestion !== undefined)
      renumber.push({ from: c.id, to: c.suggestion });
    else manual.push(c);
  }
  return { renumber, manual };
}

/**
 * --force-with-lease の push の結果。期待値（覚えておいた head）と origin が違って断られた（セッションが先に push した）なら stale。
 * ほかの失敗は error
 */
export function pushOutcome(status: number, stderr: string): 'pushed' | 'stale' | 'error' {
  if (status === 0) return 'pushed';
  return /\(stale info\)|\[rejected\]/.test(stderr) ? 'stale' : 'error';
}

/**
 * 道具の出力が、通信などの一時の失敗で止まったものか（fetch・npm の取得の失敗）。止まった理由は出力の終わりに出るので、末尾の 5 行
 * だけを見る（途中の警告やテストの出力の語に当たらないように）。一時の失敗はコメントせず、次の実行で直し直す
 * （コメントすると --find がこの head を飛ばし続ける）
 */
export function transientFailure(output: string): boolean {
  return /Could not resolve host|Connection (?:reset|timed out|refused)|early EOF|RPC failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|npm (?:ERR!|error) network/i.test(
    tail(output, 5),
  );
}

/**
 * --prepare（鍵の無いジョブ）が --push（鍵のあるジョブ）に渡す、PR ごとの結果。ready は bundle（main の先頭からの commit）を push する。
 * failed はコメントする。飛ばしたものと一時の失敗は入れない
 */
export type PrepEntry =
  | { number: number; sha: string; kind: 'ready'; renumbered: Renumber[] }
  | { number: number; sha: string; kind: 'failed'; reason: string; output?: string };

/** 結果の一覧を置くファイルの名前（artifact の中） */
export const PREP_MANIFEST = 'manifest.json';

/** PR の bundle のファイルの名前（artifact の中。番号から決める） */
export const prepBundle = (n: number): string => `${n}.bundle`;

const SHA = /^[0-9a-f]{40}$/;

/**
 * --prepare の結果の一覧を読む。--prepare は PR のブランチの道具を回すジョブなので、形を確かめてから使う（番号・sha・
 * 振り直しの ID の形。合わなければ投げる）。push の先は、--push が GitHub の API で引き直したブランチにする
 */
export function parsePrepManifest(text: string): PrepEntry[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error(`${PREP_MANIFEST} が配列でない`);
  const seen = new Set<number>();
  return data.map((e: unknown, i): PrepEntry => {
    const bad = (what: string) => new Error(`${PREP_MANIFEST} の ${i} 番目: ${what}`);
    if (typeof e !== 'object' || e === null) throw bad('オブジェクトでない');
    const o = e as Record<string, unknown>;
    const { number, sha, kind } = o;
    if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) throw bad('number が正の整数でない');
    if (seen.has(number)) throw bad(`#${number} が 2 回ある`);
    seen.add(number);
    if (typeof sha !== 'string' || !SHA.test(sha)) throw bad('sha が 40 桁の 16 進でない');
    if (kind === 'failed') {
      if (typeof o['reason'] !== 'string') throw bad('reason が文字列でない');
      if (o['output'] !== undefined && typeof o['output'] !== 'string') throw bad('output が文字列でない');
      return {
        number,
        sha,
        kind,
        reason: o['reason'],
        ...(typeof o['output'] === 'string' ? { output: o['output'] } : {}),
      };
    }
    if (kind !== 'ready') throw bad('kind が ready でも failed でもない');
    const { renumbered } = o;
    if (!Array.isArray(renumbered)) throw bad('renumbered が配列でない');
    const pairs = renumbered.map((r: unknown): Renumber => {
      const p = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
      const ok = (id: unknown): id is string => typeof id === 'string' && (V_ID.test(id) || C_ID.test(id));
      if (!ok(p['from']) || !ok(p['to'])) throw bad('renumbered に検証記録・結論の ID でないものがある');
      return { from: p['from'], to: p['to'] };
    });
    return { number, sha, kind, renumbered: pairs };
  });
}

/** git を引数で呼び、終了コードと出力（標準出力と標準エラー）を返す（0 以外で終わっても投げない） */
export type GitRun = (args: readonly string[]) => { status: number; output: string };

/** --prepare が bundle を作る git の引数: main の先頭（pr:prep が取り込んだもの）からの commit だけを入れる */
export const bundleArgs = (file: string): string[] => ['bundle', 'create', '--quiet', file, 'HEAD', '^origin/main'];

/** git にフックを読ませない引数（--push のジョブの git の全部に付ける） */
export const NO_HOOKS = ['-c', 'core.hooksPath=/dev/null'];

/**
 * --push: bundle を取り込み、覚えておいた head（sha）を期待値にして remote の branch にだけ push する。push した先頭（bundle の先頭）と
 * 結果を返す。bundle の前提の commit（--prepare の時の main の先頭）は、先に main を取って入れておく。取り込めなければ投げる
 */
export function pushBundle(
  git: GitRun,
  o: { bundle: string; number: number; branch: string; sha: string; remote: string },
): { head: string; outcome: 'pushed' | 'stale' | 'error' } {
  const ref = `refs/auto-rebase/${o.number}`;
  const fetched = git(['fetch', '--quiet', '--no-tags', o.bundle, `+HEAD:${ref}`]);
  if (fetched.status !== 0) throw new Error(`bundle を取り込めない\n${fetched.output.trim()}`);
  const head = git(['rev-parse', ref]).output.trim();
  const pushed = git([
    'push',
    `--force-with-lease=refs/heads/${o.branch}:${o.sha}`,
    o.remote,
    `${ref}:refs/heads/${o.branch}`,
  ]);
  return { head, outcome: pushOutcome(pushed.status, pushed.output) };
}

/** 出力の末尾の n 行 */
export function tail(text: string, n = 30): string {
  return text.trimEnd().split('\n').slice(-n).join('\n');
}

const RERUN = 'セッションで `npm run pr:prep -- --push` を回して直し、自動マージを予約し直してください。';

/** 直せなかったときのコメント */
export function failureComment(sha: string, reason: string, output?: string): string {
  const body = [
    mark('failed', sha),
    `main が進んで、この PR（head ${sha.slice(0, 8)}）は自動で直せない衝突になりました: ${reason}`,
    '',
    RERUN,
  ];
  if (output !== undefined && output.trim() !== '')
    body.push('', '<details><summary>出力の末尾</summary>', '', '```', tail(output), '```', '', '</details>');
  return body.join('\n');
}

/**
 * 直して push したときのコメント（振り直したら新旧の対応を残す）。手元を揃えてもらう: マージの後のフック（sync-after-merge.ts）は、
 * PR の head と手元の HEAD が同じときだけブランチを origin/main に揃えるので
 */
export function fixedComment(sha: string, branch: string, pairs: readonly Renumber[]): string {
  const lines = [mark('fixed', sha)];
  if (pairs.length > 0)
    lines.push(
      `main と重なった番号を振り直し、main を取り込んで push しました（head ${sha.slice(0, 8)}）。題名と本文の番号も書き換えました。`,
      '',
      ...pairs.map((p) => `- ${p.from} → ${p.to}`),
    );
  else lines.push(`main を取り込んで push しました（head ${sha.slice(0, 8)}）。`);
  lines.push(
    '',
    `セッションの手元のブランチは古くなりました。\`git fetch origin && git reset --hard origin/${branch}\` で揃えてください（揃えないと、マージの後にフックがブランチを origin/main に揃えません）。`,
  );
  return lines.join('\n');
}

/** push の後に自動マージが外れていたときのコメント（Actions は予約し直さない。plan/design-auto-conflict-fix.md 4 節の 4） */
export function autoMergeLostComment(sha: string): string {
  return [
    mark('auto-merge', sha),
    `main を取り込んで push しましたが（head ${sha.slice(0, 8)}）、自動マージの予約が外れました。セッションで自動マージを予約し直してください。`,
  ].join('\n');
}
