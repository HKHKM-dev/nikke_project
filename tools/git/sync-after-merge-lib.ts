// 中身が main に入った origin のブランチを見分ける（plan/design-workflow-simplification-10.md 2 節）。sync-after-merge.ts から使う。

/** 消してよいかを見るブランチ（origin/ の後の名前の頭） */
export const PRUNE_PREFIXES = ['claude/', 'antigrav/'] as const;
/** 最後のコミットからこれだけたったブランチだけを消す（いま動いているセッションの足元を消さない） */
export const PRUNE_AGE_MS = 24 * 60 * 60 * 1000;

export interface RemoteBranch {
  /** origin/ の後の名前（claude/xxx） */
  name: string;
  /** 最後のコミットの時刻（ミリ秒） */
  committedAt: number;
}

/** git を引数で呼んで標準出力（前後の空白を除く）を返す。失敗したら null */
export type GitRun = (args: readonly string[]) => string | null;

/** for-each-ref の出力（名前 TAB コミットの時刻（秒））を読む。origin/HEAD のような頭の合わないものは除く */
export function parseRemoteBranches(stdout: string): RemoteBranch[] {
  return stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([name, at]) => name && at && PRUNE_PREFIXES.some((p) => name.startsWith(p)))
    .map(([name, at]) => ({ name: name!, committedAt: Number(at) * 1000 }));
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
 * 消すブランチ: 最後のコミットから PRUNE_AGE_MS 以上たち、開いている PR の head でなく、main に合わせても何も変わらないもの。
 * 木の比べ（git を呼ぶ）は、ほかの条件に合ったものだけで行う
 */
export function prunableBranches(
  branches: readonly RemoteBranch[],
  openHeads: ReadonlySet<string>,
  now: number,
  nothingNew: (name: string) => boolean,
): string[] {
  return branches
    .filter((b) => now - b.committedAt >= PRUNE_AGE_MS && !openHeads.has(b.name))
    .filter((b) => nothingNew(b.name))
    .map((b) => b.name);
}
