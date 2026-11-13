// 見直しから PR までを止めずに進めるフック。Claude Code のフック（.claude/settings.json）から呼ぶ。
//   node tools/git/review-flow.ts --post   PostToolUse（Skill・Bash・GitHub の MCP の create_pull_request）
//   node tools/git/review-flow.ts --stop   Stop
// --post: 見直しのスキル（/simplify・/code-review）を呼んだら、git のディレクトリに印（今のブランチと時刻）を置き、PR を作ったら消す。
// --stop: 印があれば、応答の終わりを止めて、PR まで続けるよう返す（判定は review-flow-lib.ts の stopDecision。
// plan/design-review-steps.md 3 節）。
// フックの入力は標準入力の JSON。何が起きてもフックを壊さない（常に終了コード 0。止めるときだけ標準出力に JSON）。
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flowEvent, type HookInput, parseFlowState, REVIEW_FLOW_FILE, stopDecision } from './review-flow-lib.ts';

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 }).trim();
  } catch {
    return null;
  }
}

function readInput(): HookInput {
  try {
    return JSON.parse(readFileSync(0, 'utf8')) as HookInput;
  } catch {
    return {};
  }
}

function main(): void {
  const mode = process.argv[2];
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  if (gitDir === null) return;
  const file = join(gitDir, REVIEW_FLOW_FILE);
  const branch = git(['branch', '--show-current']) || null;
  const input = readInput();
  if (mode === '--post') {
    const event = flowEvent(input);
    if (event === 'start' && branch !== null) writeFileSync(file, JSON.stringify({ branch, startedAt: Date.now() }));
    if (event === 'done') rmSync(file, { force: true });
    return;
  }
  if (mode === '--stop') {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return; // 印が無い
    }
    const decision = stopDecision(parseFlowState(text), {
      branch,
      now: Date.now(),
      stopHookActive: input.stop_hook_active === true,
    });
    if (decision !== null) process.stdout.write(JSON.stringify(decision));
  }
}

try {
  main();
} catch {
  // フックを壊さない
}
