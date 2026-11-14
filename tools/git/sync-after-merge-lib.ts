// 中身が main に入った origin のブランチを見分ける（plan/design-workflow-simplification-10.md 2 節）。sync-after-merge.ts から使う。

/** 消してよいかを見るブランチ（origin/ の後の名前の頭） */
export const PRUNE_PREFIXES = ['claude/', 'antigrav/'] as const;
/** 最後のコミットと、この手元が今の先端を見た時刻の両方からこれだけたったブランチだけを消す（いま動いているセッションの足元を消さない） */
export const PRUNE_AGE_MS = 24 * 60 * 60 * 1000;

export interface RemoteBranch {
  /** origin/ の後の名前（claude/xxx） */
  name: string;
  /** 先端のコミット（消すときのリースに使う） */
  sha: string;
  /** 最後のコミットの時刻（ミリ秒） */
  committedAt: number;
}

/** git を引数で呼んで標準出力（前後の空白を除く）を返す。失敗したら null */
export type GitRun = (args: readonly string[]) => string | null;

/** for-each-ref の出力（名前 TAB 先端 TAB コミットの時刻（秒））を読む。origin/HEAD のような頭の合わないものは除く */
export function parseRemoteBranches(stdout: string): RemoteBranch[] {
  return stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([name, sha, at]) => name && sha && at && PRUNE_PREFIXES.some((p) => name.startsWith(p)))
    .map(([name, sha, at]) => ({ name: name!, sha: sha!, committedAt: Number(at) * 1000 }));
}

/** JSON を読む。読めなければ null（gh がエラーの文を標準出力に出したときなど。フックを止めない） */
export function parseJson<T>(text: string | null): T | null {
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * gh pr list --json headRefName,baseRefName の出力から、残すブランチ（開いている PR の head と base）を出す。base も残すのは、
 * 積んだ PR の土台を消すとその PR が閉じるため。読めなければ null（何も消さない）
 */
export function openPrBranches(stdout: string | null): Set<string> | null {
  const prs = parseJson<{ headRefName?: unknown; baseRefName?: unknown }[]>(stdout);
  if (!Array.isArray(prs)) return null;
  return new Set(prs.flatMap((p) => [p.headRefName, p.baseRefName]).filter((n): n is string => typeof n === 'string'));
}

/**
 * git reflog show --date=unix --format=%gd <ref> -n 1 の出力（origin/claude/x@{秒}）から、この手元が今の先端を見た時刻（ミリ秒）を読む。
 * 読めなければ null
 */
export function parseReflogTime(stdout: string | null): number | null {
  const m = stdout === null ? null : /@\{(\d+)\}$/.exec(stdout);
  return m ? Number(m[1]) * 1000 : null;
}

/** この手元がリモートの追跡ブランチ ref（origin/claude/x）の今の先端を見た時刻（ミリ秒）。reflog が無ければ null */
export function seenAt(git: GitRun, ref: string): number | null {
  return parseReflogTime(git(['reflog', 'show', '--date=unix', '--format=%gd', '-n', '1', `refs/remotes/${ref}`]));
}

/**
 * main に合わせても木が変わらない（ブランチの中身が全部 main に入っている。main の祖先も含む）か。git merge-tree --write-tree
 * （git 2.38 から）の木を main の木と比べる。衝突・共通の祖先が無い（浅いクローン）・古い git のときは null が返り、false
 */
export function bringsNothing(git: GitRun, main: string, ref: string): boolean {
  const mainTree = git(['rev-parse', `${main}^{tree}`]);
  const merged = git(['merge-tree', '--write-tree', main, ref])?.split('\n')[0];
  return mainTree !== null && merged !== undefined && merged === mainTree;
}

/**
 * 消すブランチ: 最後のコミットと、手元が今の先端を見た時刻（seenAt。main から作って push しただけのブランチは、コミットが古くても
 * 今 push されたもの）の両方から PRUNE_AGE_MS 以上たち、残すもの（開いている PR の head・base）でなく、main に合わせても何も
 * 変わらないもの。seenAt と木の比べ（git を呼ぶ）は、ほかの条件に合ったものだけで行う
 */
export function prunableBranches(
  branches: readonly RemoteBranch[],
  keep: ReadonlySet<string>,
  now: number,
  seenAt: (name: string) => number | null,
  nothingNew: (name: string) => boolean,
): RemoteBranch[] {
  const aged = (at: number | null) => at === null || now - at >= PRUNE_AGE_MS;
  return branches
    .filter((b) => aged(b.committedAt) && !keep.has(b.name))
    .filter((b) => aged(seenAt(b.name)))
    .filter((b) => nothingNew(b.name));
}

/** リースを付けて origin のブランチを消す git の引数（判定した後に別のところから push された先端は消さない） */
export function deleteArgs(branch: RemoteBranch): string[] {
  return [
    'push',
    '--quiet',
    `--force-with-lease=refs/heads/${branch.name}:${branch.sha}`,
    'origin',
    '--delete',
    branch.name,
  ];
}

/** マージの後、main の CI（生成物を作り直して commit する）の終わりを待つ長さ */
export const WAIT_CI_MS = 30 * 60 * 1000;

/** gh pr view --json number,state,autoMergeRequest,mergedAt,mergeCommit の出力 */
export interface PrView {
  number?: number;
  state?: string;
  autoMergeRequest?: unknown;
  mergedAt?: string | null;
  mergeCommit?: { oid?: string } | null;
}

/**
 * 応答の終わりに、マージを待つ裏の処理を起こすか: 自動マージを予約した開いている PR か、マージしてから WAIT_CI_MS たっていない
 * （main の CI がまだ生成物を作り直しているかもしれない）PR
 */
export function shouldWaitMerge(pr: PrView | null, now: number): boolean {
  if (!pr || typeof pr.number !== 'number') return false;
  if (pr.state === 'OPEN') return !!pr.autoMergeRequest;
  return pr.state === 'MERGED' && !!pr.mergedAt && now - Date.parse(pr.mergedAt) < WAIT_CI_MS;
}

/**
 * 待っている PR のいま: merged（マージした）・wait（自動マージの予約が残っている。gh が失敗したときも、通信の一時の失敗とみて待つ）・
 * stop（閉じた・予約を外した）
 */
export function mergeWaitState(pr: PrView | null): 'merged' | 'wait' | 'stop' {
  if (pr === null) return 'wait';
  if (pr.state === 'MERGED') return 'merged';
  return pr.state === 'OPEN' && pr.autoMergeRequest ? 'wait' : 'stop';
}

/** gh run list --commit <マージのコミット> --json status の出力から、そのコミットの CI がすべて終わったか（まだ 1 つも無ければ false） */
export function ciSettled(stdout: string | null): boolean {
  const runs = parseJson<{ status?: unknown }[]>(stdout);
  return Array.isArray(runs) && runs.length > 0 && runs.every((r) => r.status === 'completed');
}

/**
 * トピックブランチを origin/main へ取り込むか（セッションの始まりと発言のフック。plan/design-workflow-simplification-13.md 2 節）。
 * Claude Code のブランチ（claude/）で、追跡中のファイルに作業中の変更が無く、リベースの途中でもなく、追跡先が消えて（マージ済みで）
 * もいなくて、origin/main が進んでいるとき
 */
export function shouldCatchUp(s: {
  branch: string | null;
  clean: boolean;
  rebasing: boolean;
  track: string | null;
  behind: number;
}): boolean {
  return Boolean(s.branch?.startsWith('claude/')) && s.clean && !s.rebasing && s.track !== '[gone]' && s.behind > 0;
}

/** 取り込んだときに、変わったかを知らせる決まりと道具の置き場所 */
export const RULE_PATHS = [
  'AGENTS.md',
  '.claude',
  'tools',
  'plan/verification-guide.md',
  'plan/skills-guide.md',
  'plan/captures/protocol.md',
  'plan/captures/guide.md',
];

/** 取り込んだ結果の知らせ（セッションのエージェントに渡す） */
export function catchUpMessage(r: {
  behind: number;
  oldBase: string;
  changed: readonly string[];
  push: 'pushed' | 'noUpstream' | 'failed';
  lockChanged: boolean;
}): string {
  const parts = [`origin/main の ${r.behind} 件をリベースで取り込んだ`];
  if (r.push === 'pushed') parts.push('ブランチは強制 push した');
  if (r.push === 'failed') parts.push('push は落ちた（次は npm run pr:prep -- --push で push する）');
  if (r.changed.length > 0) {
    const shown = r.changed.slice(0, 8).join('・') + (r.changed.length > 8 ? ` ほか ${r.changed.length - 8} 件` : '');
    const notes = [
      r.changed.includes('AGENTS.md') &&
        `セッションの中の AGENTS.md は再開まで古いので、git diff ${r.oldBase} origin/main -- AGENTS.md で変わった所を読む`,
      r.changed.some((p) => p.startsWith('.claude/')) && 'フックの変更は再開から効く',
    ].filter(Boolean);
    parts.push(`決まりと道具が変わった: ${shown}${notes.length > 0 ? `（${notes.join('。')}）` : ''}`);
  }
  if (r.lockChanged) parts.push('package-lock.json が変わったので npm ci を回す');
  return parts.join('。');
}
