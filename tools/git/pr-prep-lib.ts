// PR の前のリベースの決まりごと（plan/design-workflow-simplification-4.md 2 節）。git を呼ぶ部分（pr-prep.ts）と分けてテストする。
import { idsInPaths, nextId } from '../../packages/core/src/records/drafts.ts';

/** 衝突したファイルを、main の版を取ってよい生成物と、人が直すものに分ける */
export function splitConflicts(
  conflicted: readonly string[],
  generated: readonly string[],
): { generated: string[]; other: string[] } {
  const set = new Set(generated);
  return {
    generated: conflicted.filter((p) => set.has(p)),
    other: conflicted.filter((p) => !set.has(p)),
  };
}

/**
 * 作り直しのコマンド。ブランチが感度（sensitivity.json）を変えていたか、それが衝突したときは、感度の入力（スキル定義・録画の台帳・
 * 観測値の比べる指定）がブランチと main の両方で変わったので、計算し直す（records:minimal。records:check も回る）
 */
export function regenerateScript(
  branchChanged: readonly string[],
  conflicted: readonly string[],
  sensitivityPath: string,
): 'records:minimal' | 'records:check' {
  return branchChanged.includes(sensitivityPath) || conflicted.includes(sensitivityPath)
    ? 'records:minimal'
    : 'records:check';
}

/**
 * git rebase origin/main の後の様子。0 以外で終わってもリベースの途中なら衝突で止まっただけ（続きはループで解く）。途中でもなければ、
 * リベースは始まらなかった（追跡していないファイルが main のファイルと重なったなど）ので、取り込まずに先へ進んではいけない
 */
export function rebaseOutcome(status: number, rebasing: boolean): 'clean' | 'conflicted' | 'notStarted' {
  if (status === 0) return 'clean';
  return rebasing ? 'conflicted' : 'notStarted';
}

export type Collision = { id: string; suggestion?: string };

/**
 * ブランチで足した検証記録・結論・録画の ID のうち、main も足したもの。suggestion は振り直しの番号の案（V・C だけ。taken はほかの
 * ブランチが使った ID も含めた、避ける ID）
 */
export function collisions(
  branchAdded: readonly string[],
  mainFiles: readonly string[],
  taken: readonly string[],
): Collision[] {
  const own = [...idsInPaths(branchAdded.join('\n')), ...recordingIds(branchAdded)];
  const main = new Set([...idsInPaths(mainFiles.join('\n')), ...recordingIds(mainFiles)]);
  const avoid = [...main, ...own, ...taken];
  const out: Collision[] = [];
  for (const id of own) {
    if (!main.has(id)) continue;
    const prefix = id.slice(0, 1);
    if (prefix === 'V' || prefix === 'C') {
      const suggestion = nextId(prefix, avoid);
      avoid.push(suggestion);
      out.push({ id, suggestion });
    } else out.push({ id });
  }
  return out;
}

/** records/recordings/<id>.json の id（README などは除く） */
function recordingIds(paths: readonly string[]): string[] {
  return paths
    .map((p) => /^records\/recordings\/(\d{3,})\.json$/.exec(p.trim())?.[1])
    .filter((x): x is string => x !== undefined);
}
