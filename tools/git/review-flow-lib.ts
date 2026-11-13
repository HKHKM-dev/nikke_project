// 見直しから自動マージの予約までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。入出力は review-flow.ts。
import { parseJson } from './sync-after-merge-lib.ts';

/** フックが受け取る JSON（Claude Code のフックの入力のうち、使う欄だけ） */
export type HookInput = {
  tool_name?: string;
  tool_input?: { skill?: unknown; args?: unknown; command?: unknown };
  stop_hook_active?: boolean;
};

/** 見直しを始めた印（git のディレクトリに置く） */
export type FlowState = { branch: string; startedAt: number };

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
    return typeof args === 'string' && /(^|\s)#?\d+(\s|$)/.test(args) ? null : 'start';
  if (input.tool_name === 'mcp__github__enable_pr_auto_merge') return 'done';
  if (input.tool_name === 'Bash' && typeof command === 'string' && /\bgh\s+pr\s+merge\b[^\n]*--auto\b/.test(command))
    return 'done';
  return null;
}

const BLOCK_REASON =
  '見直しを始めた後、自動マージを予約する前に応答を終えようとしている。AGENTS.md「コミット手順」のとおり、オーナーに確かめずに' +
  'PR を出して自動マージを予約するまで続け、見直しの結果は PR の後にまとめて報告する。オーナーの判断がどうしても要るなら、' +
  'その理由を書いてもう一度終えれば通す。';

/**
 * 応答を終えるときの判定: 今のブランチで見直しを始めて自動マージをまだ予約していなければ止める（Claude Code の Stop のフックの
 * decision: block）。一度止めた後の終わり（stop_hook_active）と、別のブランチの印・古い印は通す
 */
export function stopDecision(
  state: FlowState | null,
  ctx: { branch: string | null; now: number; stopHookActive: boolean },
): { decision: 'block'; reason: string } | null {
  if (state === null || ctx.stopHookActive) return null;
  if (state.branch !== ctx.branch || ctx.now - state.startedAt > FLOW_EXPIRY_MS) return null;
  return { decision: 'block', reason: BLOCK_REASON };
}

/** 印のファイルの中身を読む（壊れていれば null） */
export function parseFlowState(text: string): FlowState | null {
  const v = parseJson<Partial<FlowState>>(text);
  return typeof v?.branch === 'string' && typeof v.startedAt === 'number'
    ? { branch: v.branch, startedAt: v.startedAt }
    : null;
}
