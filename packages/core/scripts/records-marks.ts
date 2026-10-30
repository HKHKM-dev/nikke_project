// 印の notes の添字の付け替え（plan/design-workflow-simplification-5.md 1 節の (a)）を、git の差から回す（records:check が呼ぶ）。
// 分かれ目（git merge-base HEAD origin/main）の版と今の作業ツリーで変わったスキル定義について、分かれ目の版の結論の印から、
// notes の添字を文の一致で今の番号に計算し直して書く（marks.ts の renumberMarks）。origin/main が無い・git が無いときは何もしない。
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type { ClaimFile } from '../src/records/claims.ts';
import { noteMoves, renumberMarks, type NoteMoves } from '../src/records/marks.ts';
import type { SkillDefinition } from '../src/skills/types.ts';
import { CLAIMS_DIR, ROOT, claimFileNames, loadSkillDefinitions } from './records-data.ts';

const SKILLS = 'packages/core/data/skills/';

function git(args: readonly string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1 << 26,
    });
  } catch {
    return undefined;
  }
}

/** 付け替えた印と、付け替えられない印（対応先の無い notes を指す。records:check の誤り） */
export function renumberMarksFromGit(): { changes: string[]; problems: string[] } {
  const changes: string[] = [];
  const problems: string[] = [];
  const base = git(['merge-base', 'HEAD', 'origin/main'])?.trim();
  if (!base) return { changes, problems };
  const changed = (git(['diff', '--name-only', base, '--', SKILLS]) ?? '')
    .split('\n')
    .filter((p) => /\/\d+\.json$/.test(p));
  if (changed.length === 0) return { changes, problems };
  // 今の版は読み込みの検査を通した定義（消した定義・index.json に無い定義は付け替えない）
  const defined = new Map(loadSkillDefinitions().map((d) => [d.definition.resourceId, d]));
  const moves = new Map<string, NoteMoves>();
  for (const path of changed) {
    const now = defined.get(Number(path.slice(SKILLS.length, -'.json'.length)));
    const before = git(['show', `${base}:${path}`]);
    // 前の版は今の形の検査を通らないことがあるので、notes だけを読む
    if (now !== undefined && before !== undefined)
      moves.set(now.name.ja, noteMoves(JSON.parse(before) as SkillDefinition, now.definition));
  }
  const claimsDir = CLAIMS_DIR.slice(ROOT.length);
  for (const name of claimFileNames()) {
    const text = readFileSync(`${CLAIMS_DIR}${name}`, 'utf8');
    // 変わった定義のキャラの印を持つ結論だけ見る（git show を全部の結論に回すと遅い）
    if (![...moves.keys()].some((who) => text.includes(`"${who} `))) continue;
    const baseText = git(['show', `${base}:${claimsDir}${name}`]);
    const r = renumberMarks(
      JSON.parse(text) as ClaimFile,
      baseText === undefined ? undefined : (JSON.parse(baseText) as ClaimFile),
      moves,
    );
    changes.push(...r.changes);
    problems.push(...r.problems);
    if (r.changes.length > 0) writeFileSync(`${CLAIMS_DIR}${name}`, `${JSON.stringify(r.file, null, 2)}\n`);
  }
  return { changes, problems };
}
