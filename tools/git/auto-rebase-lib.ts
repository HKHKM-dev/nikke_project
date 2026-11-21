// 自動マージを待つ PR の衝突を直す GitHub Actions（auto-rebase.ts）の決まりごと（plan/design-auto-conflict-fix.md 2 節の案 A）。
// GitHub と git を呼ぶ部分と分けてテストする。--find は npm ci の前に回るので、node のほかは読まない（型だけ読む）。
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
export const BRANCH_PREFIXES = ['claude/', 'antigrav/'];

/** 直す対象か: 開いていて、自動マージを予約していて、head が同じリポジトリのエージェントのブランチ */
export function isTarget(pr: Pull, repo: string): boolean {
  return (
    pr.state === 'open' &&
    pr.auto_merge != null &&
    pr.head.repo?.full_name === repo &&
    BRANCH_PREFIXES.some((p) => pr.head.ref.startsWith(p))
  );
}

/** ID が重なりうる記録（検証記録・結論・録画・課題の番号）を足したか（足したものと名前を変えたもの） */
export function addsRecords(files: readonly PullFile[]): boolean {
  return files.some(
    (f) =>
      (f.status === 'added' || f.status === 'renamed') &&
      /^records\/(?:verifications|claims|recordings|backlog)\//.test(f.filename),
  );
}

/**
 * 直してみる PR か。衝突（mergeable が false）か、決まらなかった（null）か、ID の重なりうる記録を足したもの（検証記録はファイル名に
 * 名前が付くので、番号が重なっても Git の衝突にならない。重なりは --fix が git で確かめる）
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

export type MarkKind = 'failed' | 'renumbered' | 'auto-merge';

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
    if (/^[VC]-\d+$/.test(c.id) && c.suggestion !== undefined) renumber.push({ from: c.id, to: c.suggestion });
    else manual.push(c);
  }
  return { renumber, manual };
}

/** 文の中の古い ID を新しい ID に置き換える（ID の前後が英数字・ハイフン・下線でない所だけ。全部を一度に置き換えるので連鎖しない） */
export function replaceIds(text: string, pairs: readonly Renumber[]): string {
  if (pairs.length === 0) return text;
  const to = new Map(pairs.map((p) => [p.from, p.to]));
  const alt = pairs.map((p) => p.from).join('|');
  return text.replace(new RegExp(`(?<![A-Za-z0-9_-])(?:${alt})(?![0-9A-Za-z_-])`, 'g'), (m) => to.get(m) ?? m);
}

/**
 * --force-with-lease の push の結果。期待値（覚えておいた head）と origin が違って断られた（セッションが先に push した）なら stale。
 * ほかの失敗は error
 */
export function pushOutcome(status: number, stderr: string): 'pushed' | 'stale' | 'error' {
  if (status === 0) return 'pushed';
  return /\(stale info\)|\[rejected\]/.test(stderr) ? 'stale' : 'error';
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

/** 振り直したときのコメント（新旧の対応を残す） */
export function renumberedComment(sha: string, pairs: readonly Renumber[]): string {
  return [
    mark('renumbered', sha),
    `main と重なった番号を振り直し、main を取り込んで push しました（head ${sha.slice(0, 8)}）。題名と本文の番号も書き換えました。`,
    '',
    ...pairs.map((p) => `- ${p.from} → ${p.to}`),
    '',
    'セッションの手元のブランチは古くなっています。続けて直すときは `git reset --hard origin/<ブランチ>` で取ってから直してください（マージの後はフックが揃えます）。',
  ].join('\n');
}

/** push の後に自動マージが外れていたときのコメント（Actions は予約し直さない。plan/design-auto-conflict-fix.md 4 節の 4） */
export function autoMergeLostComment(sha: string): string {
  return [
    mark('auto-merge', sha),
    `main を取り込んで push しましたが（head ${sha.slice(0, 8)}）、自動マージの予約が外れました。セッションで自動マージを予約し直してください。`,
  ].join('\n');
}
