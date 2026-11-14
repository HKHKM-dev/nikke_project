// 見直しから自動マージの予約までを止めずに進めるフック。Claude Code のフック（.claude/settings.json）から呼ぶ。
//   node tools/git/review-flow.ts --pre    PreToolUse（Skill）
//   node tools/git/review-flow.ts --post   PostToolUse（Skill・Bash・GitHub の MCP の enable_pr_auto_merge）
//   node tools/git/review-flow.ts --stop   Stop
// --pre: /simplify を呼ぶ前に、ブランチの基（origin/main との merge-base）からの作業ツリーの差分が構造が変わる PR か見て、当たらなければ
// 止める（判定は simplifyGate。plan/design-workflow-simplification-13.md 3 節）。
// --post: 見直しのスキル（/simplify・/code-review）を呼んだら、git のディレクトリに印（今のブランチと時刻）を置き、自動マージを
// 予約したら消す。
// --stop: 印があれば、応答の終わりを止めて、自動マージの予約まで続けるよう返す（判定は review-flow-lib.ts の stopDecision）。
// この印で一度止めた後の終わり（オーナーの判断が要るとき）は通して印を消す（plan/design-review-steps.md 3 節）。
// フックの入力は標準入力の JSON。何が起きてもフックを壊さない（常に終了コード 0。止めるときだけ標準出力に JSON）。
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BLOCK_REASON,
  flowEvent,
  type HookInput,
  parseFlowState,
  parseNumstat,
  simplifyGate,
  stopDecision,
} from './review-flow-lib.ts';
import { parseJson } from './sync-after-merge-lib.ts';

const FLOW_FILE = 'claude-review-flow.json';

let cwd: string | undefined;

function git(args: readonly string[]): string | null {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
    }).trim();
  } catch {
    return null;
  }
}

const flowFile = (): string | null => {
  const gitDir = git(['rev-parse', '--absolute-git-dir']);
  return gitDir === null ? null : join(gitDir, FLOW_FILE);
};
const currentBranch = (): string | null => git(['branch', '--show-current']) || null;

/** ブランチの基からの作業ツリーの差分（追跡していない新しいファイルも入れる）。基が分からなければ null */
function branchChanges(): { path: string; added: number; isNew: boolean }[] | null {
  const base = git(['merge-base', 'HEAD', 'origin/main']);
  if (base === null) return null;
  const added = parseNumstat(git(['diff', '--numstat', base]) ?? '');
  const created = new Set((git(['diff', '--name-only', '--diff-filter=A', base]) ?? '').split('\n').filter(Boolean));
  const files = [...added].map(([path, n]) => ({ path, added: n, isNew: created.has(path) }));
  for (const path of (git(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n').filter(Boolean))
    files.push({ path, added: 0, isNew: true });
  return files;
}

function main(): void {
  const mode = process.argv[2];
  const input = parseJson<HookInput>(readFileSync(0, 'utf8')) ?? {};
  if (typeof input.cwd === 'string') cwd = input.cwd;
  if (mode === '--pre') {
    if (input.tool_name !== 'Skill' || input.tool_input?.skill !== 'simplify') return;
    const files = branchChanges();
    const reason = files === null ? null : simplifyGate(files);
    if (reason !== null)
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
          },
        }),
      );
    return;
  }
  if (mode === '--post') {
    const event = flowEvent(input);
    if (event === null) return;
    const file = flowFile();
    if (file === null) return;
    if (event === 'done') {
      rmSync(file, { force: true });
      return;
    }
    const branch = currentBranch();
    if (branch !== null) writeFileSync(file, JSON.stringify({ branch, startedAt: Date.now() }));
    return;
  }
  if (mode === '--stop') {
    const file = flowFile();
    if (file === null) return;
    const state = parseFlowState(readFileSync(file, 'utf8')); // 印が無ければ外の catch で終わる
    const decision = stopDecision(state, { branch: currentBranch(), now: Date.now() });
    if (decision === 'release') rmSync(file, { force: true });
    if (decision === 'block') {
      writeFileSync(file, JSON.stringify({ ...state, blocked: true }));
      process.stdout.write(JSON.stringify({ decision: 'block', reason: BLOCK_REASON }));
    }
  }
}

try {
  main();
} catch {
  // フックを壊さない
}
