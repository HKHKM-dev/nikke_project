// 衝突の直しのワークフロー（.github/workflows/auto-rebase.yml）の、ジョブごとのキャッシュの権限。main の push の実行は main のスコープの
// キャッシュを書けるので、PR のブランチの道具を回す prepare は読むだけ、ほかのジョブは使わない（plan/design-deploy-key-scope.md 6 節）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WORKFLOW = new URL('../../.github/workflows/auto-rebase.yml', import.meta.url);

/** ジョブの名前と、そのジョブの cache-mode（ジョブに無ければワークフローの値。どちらにも無ければ GitHub の既定の write） */
function cacheModes(yaml: string): Record<string, string> {
  const lines = yaml.split(/\r?\n/);
  const top = lines.map((l) => /^cache-mode:\s*(\S+)/.exec(l)?.[1]).find((m) => m !== undefined) ?? 'write';
  const start = lines.findIndex((l) => /^jobs:\s*(#.*)?$/.test(l));
  if (start < 0) throw new Error('jobs: が無い');
  const modes: Record<string, string> = {};
  let job: string | undefined;
  for (const line of lines.slice(start + 1)) {
    const name = /^ {2}([\w-]+):\s*$/.exec(line)?.[1];
    if (name !== undefined) {
      job = name;
      modes[job] = top;
      continue;
    }
    const mode = /^ {4}cache-mode:\s*(\S+)/.exec(line)?.[1];
    if (job !== undefined && mode !== undefined) modes[job] = mode;
  }
  return modes;
}

describe('auto-rebase.yml の cache-mode', () => {
  it('prepare は読むだけ、find と push はキャッシュを使わない（ジョブを足したら、ここで権限を決める）', () => {
    expect(cacheModes(readFileSync(WORKFLOW, 'utf8'))).toEqual({ find: 'none', prepare: 'read', push: 'none' });
  });

  it('読み方: ジョブの値はワークフローの値より優先し、どちらも無ければ write', () => {
    expect(cacheModes('jobs:\n  a:\n    runs-on: x\n  b:\n    cache-mode: read\n')).toEqual({ a: 'write', b: 'read' });
    expect(
      cacheModes('cache-mode: none # 既定\non:\n  push:\njobs: # ジョブ\n  a:\n    steps:\n      - run: x\n'),
    ).toEqual({
      a: 'none',
    });
  });
});
