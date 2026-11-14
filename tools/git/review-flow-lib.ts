// 見直しから自動マージの予約までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。入出力は review-flow.ts。
import { parseJson } from './sync-after-merge-lib.ts';

/** フックが受け取る JSON（Claude Code のフックの入力のうち、使う欄だけ） */
export type HookInput = {
  tool_name?: string;
  tool_input?: { skill?: unknown; args?: unknown; command?: unknown };
  /** セッションの今のディレクトリ（worktree に入っていればその中） */
  cwd?: string;
};

/** 見直しを始めた印（git のディレクトリに置く）。blocked は、この印で応答の終わりを一度止めたこと */
export type FlowState = { branch: string; startedAt: number; blocked?: boolean };

/** 印を無視する古さ（見直しを始めてから自動マージを予約せずに、これだけたったら別の作業とみる） */
export const FLOW_EXPIRY_MS = 6 * 60 * 60 * 1000;

const REVIEW_SKILLS = new Set(['simplify', 'code-review']);

/**
 * ツールを使った後の出来事: 今のブランチの差分の見直しのスキルを呼んだら start、自動マージを予約したら done、ほかは null。
 * PR の番号を対象にした見直し（`/code-review 123`）は今のブランチの作業ではないので数えない。自動マージの予約は Bash の
 * `gh pr merge --auto` か GitHub の MCP の enable_pr_auto_merge
 */
export function flowEvent(input: HookInput): 'start' | 'done' | null {
  const { skill, args, command } = input.tool_input ?? {};
  if (input.tool_name === 'Skill' && typeof skill === 'string' && REVIEW_SKILLS.has(skill))
    return typeof args === 'string' && /(^|\s)#?\d+(\s|$)/.test(args.replace(/--max-findings\s+\S+/g, ''))
      ? null
      : 'start';
  if (input.tool_name === 'mcp__github__enable_pr_auto_merge') return 'done';
  if (input.tool_name === 'Bash' && typeof command === 'string' && /\bgh\s+pr\s+merge\b[^\n]*--auto\b/.test(command))
    return 'done';
  return null;
}

export const BLOCK_REASON =
  '見直しを始めた後、自動マージを予約する前に応答を終えようとしている。AGENTS.md「コミット手順」のとおり、オーナーに確かめずに' +
  'PR を出して自動マージを予約するまで続け、見直しの結果は PR の後にまとめて報告する。オーナーの判断がどうしても要るなら、' +
  'その理由を書いてもう一度終えれば通す。';

/**
 * 応答を終えるときの判定: 今のブランチで見直しを始めて自動マージをまだ予約していなければ止める（block。Claude Code の Stop の
 * フックの decision: block）。この印で一度止めた後の終わりは通して印を消す（release。オーナーの判断が要るとき）。ほかの Stop の
 * フックが止めた後の終わり（stop_hook_active）は数えない。印が無い・別のブランチの印・古い印は何もしない（null）
 */
export function stopDecision(
  state: FlowState | null,
  ctx: { branch: string | null; now: number },
): 'block' | 'release' | null {
  if (state === null || state.branch !== ctx.branch || ctx.now - state.startedAt > FLOW_EXPIRY_MS) return null;
  return state.blocked === true ? 'release' : 'block';
}

/** 印のファイルの中身を読む（壊れていれば null） */
export function parseFlowState(text: string): FlowState | null {
  const v = parseJson<Partial<FlowState>>(text);
  return typeof v?.branch === 'string' && typeof v.startedAt === 'number'
    ? { branch: v.branch, startedAt: v.startedAt, ...(v.blocked === true ? { blocked: true } : {}) }
    : null;
}

/** 構造が変わる PR の線（AGENTS.md「コミット手順」の 1。文と同じ値にする） */
export const SIMPLIFY_MIN_ADDED = 100;

/** 見直しの規模に数えるコードのファイル（packages/・apps/・tools/ のスクリプトで、テストでないもの） */
export function isReviewedCode(path: string): boolean {
  return (
    /^(packages|apps|tools)\//.test(path) && /\.(?:[cm]?[jt]s|tsx)$/.test(path) && !/(\.test\.|__tests__\/)/.test(path)
  );
}

/**
 * /simplify を呼ぶ前の判定（plan/design-workflow-simplification-13.md 3 節）: ブランチの基からの差分に、コードの新しいファイルが無く、
 * コードの追加が SIMPLIFY_MIN_ADDED 行以下なら、構造が変わる PR ではないので止める理由を返す。要るなら null
 */
export function simplifyGate(files: readonly { path: string; added: number; isNew: boolean }[]): string | null {
  const code = files.filter((f) => isReviewedCode(f.path));
  const added = code.reduce((sum, f) => sum + f.added, 0);
  if (code.some((f) => f.isNew) || added > SIMPLIFY_MIN_ADDED) return null;
  return (
    `構造が変わる PR ではない（コードの新しいファイルが無く、追加は ${added} 行で ${SIMPLIFY_MIN_ADDED} 行以下。` +
    'AGENTS.md「コミット手順」の 1）ので、/simplify は回さない。/code-review へ進む。'
  );
}

/** git diff --numstat の出力から、ファイルごとの追加の行数（バイナリは 0） */
export function parseNumstat(text: string): { path: string; added: number }[] {
  return text.split('\n').flatMap((line) => {
    const [add, , path] = line.split('\t');
    return path ? [{ path, added: Number(add) || 0 }] : [];
  });
}
