// 書き込みのできるデプロイキー（secret の GENERATED_DEPLOY_KEY。plan/design-pr-conflicts.md 5 節）で git の ssh を回す環境変数。
// CI の生成物の commit（ci-generated.ts）と、自動マージを待つ PR の衝突の直し（auto-rebase.ts）が使う。
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** 鍵をファイルに置き、git の ssh に渡す環境変数を返す */
export function sshEnv(key: string): Record<string, string> {
  const keyPath = join(process.env['RUNNER_TEMP'] ?? tmpdir(), 'generated-deploy-key');
  writeFileSync(keyPath, key.endsWith('\n') ? key : `${key}\n`, { mode: 0o600 });
  return { GIT_SSH_COMMAND: `ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new` };
}

/** origin を ssh で指す URL（owner/repo） */
export const sshRemote = (repo: string): string => `git@github.com:${repo}.git`;
