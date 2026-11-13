// 見直しから PR までを止めずに進めるフックの判定（plan/design-review-steps.md 3 節）。入出力は review-flow.ts。

/** フックが受け取る JSON（Claude Code のフックの入力のうち、使う欄だけ） */
export type HookInput = {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: { skill?: unknown; command?: unknown };
  stop_hook_active?: boolean;
};

/** 見直しを始めた印（git のディレクトリの REVIEW_FLOW_FILE に置く） */
export type FlowState = { branch: string; startedAt: number };

export const REVIEW_FLOW_FILE = 'claude-review-flow.json';

/** 印を無視する古さ（見直しを始めてから PR を出さずに、これだけたったら別の作業とみる） */
export const FLOW_EXPIRY_MS = 6 * 60 * 60 * 1000;

const REVIEW_SKILLS = new Set(['simplify', 'code-review']);

/**
 * ツールを使った後の出来事: 見直しのスキルを呼んだら start、PR を作ったら done、ほかは null。
 * PR は Bash の `gh pr create` か GitHub の MCP の create_pull_request で作る
 */
export function flowEvent(input: HookInput): 'start' | 'done' | null {
  const skill = input.tool_input?.skill;
  if (input.tool_name === 'Skill' && typeof skill === 'string' && REVIEW_SKILLS.has(skill)) return 'start';
  if (input.tool_name === 'mcp__github__create_pull_request') return 'done';
  const command = input.tool_input?.command;
  if (input.tool_name === 'Bash' && typeof command === 'string' && /\bgh\s+pr\s+create\b/.test(command)) return 'done';
  return null;
}

export const BLOCK_REASON = [
  '見直し（/simplify・/code-review）を始めた後、PR を出す前に応答を終えようとしている（AGENTS.md「コミット手順」）。',
  'オーナーに確かめずに、次の手順へ続けて進める: 直しの commit → /code-review → テスト → npm run pr:prep -- --push → PR → 自動マージの予約。',
  '見直しの結果と見送った指摘の報告は PR を出した後にまとめる。',
  '/simplify のエージェントは run_in_background: false で並べて呼ぶ（裏で待つと、待つ間に応答が終わる）。',
  'オーナーの判断がどうしても要るなら、その理由を書いてもう一度終えれば、このフックは通す。',
].join('\n');

/**
 * 応答を終えるときの判定: 今のブランチで見直しを始めて PR をまだ出していなければ止める（Claude Code の Stop のフックの
 * decision: block）。一度止めた後の終わり（stop_hook_active）と、古い印・別のブランチの印は通す
 */
export function stopDecision(
  state: FlowState | null,
  ctx: { branch: string | null; now: number; stopHookActive: boolean },
): { decision: 'block'; reason: string } | null {
  if (state === null || ctx.stopHookActive || ctx.branch === null) return null;
  if (state.branch !== ctx.branch || ctx.now - state.startedAt > FLOW_EXPIRY_MS) return null;
  return { decision: 'block', reason: BLOCK_REASON };
}

/** 印のファイルの中身を読む（壊れていれば null） */
export function parseFlowState(text: string | null): FlowState | null {
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as Partial<FlowState>;
    return typeof v.branch === 'string' && typeof v.startedAt === 'number'
      ? { branch: v.branch, startedAt: v.startedAt }
      : null;
  } catch {
    return null;
  }
}
