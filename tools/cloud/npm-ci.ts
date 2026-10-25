// クラウドのセッションの始めに、node_modules が無いか lockfile と合わなければ npm ci を回す（plan/design-workflow-simplification.md 5 節）。
//   node tools/cloud/npm-ci.ts   SessionStart のフックから呼ぶ
// クラウド（CLAUDE_CODE_REMOTE=true）だけで動く。デスクトップの worktree は AGENTS.md「worktree では最初に npm ci」。
// node_modules が無いと、生成の道具の prettier が全体の別の版に落ちて書式の差分が出るため。失敗しても終了コード 0。
import { spawnSync } from 'node:child_process';
import { ensureInstalled } from './npm-ci-lib.ts';

if (process.env['CLAUDE_CODE_REMOTE'] !== 'true') process.exit(0);

const repo = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
const outcome = ensureInstalled(repo, () => {
  // フックの出力はセッションに渡るので、npm の出力は捨て、結果だけを 1 行で出す
  const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: repo, stdio: 'ignore' });
  return r.status === 0;
});
if (outcome === 'installed')
  console.log('npm ci を回した（package-lock.json が前に入れたときと違うか、node_modules が無かった）');
if (outcome === 'failed') console.log('npm ci が失敗した。セッションの中で npm ci を回して原因を見る');
