// 印の notes の添字の付け替え（plan/design-workflow-simplification-5.md 1 節の (a)）を、git の差から回す（records:check が呼ぶ）。
// 分かれ目（git merge-base HEAD origin/main）の版と今の作業ツリーで変わったスキル定義について、分かれ目の版の結論にそのままある印の
// notes の添字を、文の一致で今の番号に書き替える。origin/main が無い・git が無いときは何もしない。
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { ClaimFile } from '../src/records/claims.ts';
import { renumberMarks } from '../src/records/marks.ts';
import type { SkillDefinition } from '../src/skills/types.ts';
import type { CharacterData } from '../src/types.ts';
import { ROOT } from './records-data.ts';

const SKILLS_DIR = 'packages/core/data/skills/';
const CLAIMS_DIR = 'records/claims/';

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
export function renumberMarksFromGit(characters: ReadonlyMap<number, CharacterData>): {
  changes: string[];
  problems: string[];
} {
  const base = git(['merge-base', 'HEAD', 'origin/main'])?.trim();
  if (!base) return { changes: [], problems: [] };
  const changed = (git(['diff', '--name-only', base, '--', SKILLS_DIR]) ?? '')
    .split('\n')
    .filter((p) => /\/\d+\.json$/.test(p));
  const defs = new Map<string, { before: SkillDefinition; after: SkillDefinition }>();
  for (const path of changed) {
    const before = git(['show', `${base}:${path}`]);
    const name = characters.get(Number(path.slice(SKILLS_DIR.length, -'.json'.length)))?.name.ja;
    let after: string;
    try {
      after = readFileSync(`${ROOT}${path}`, 'utf8');
    } catch {
      continue; // 消した定義
    }
    if (before === undefined || name === undefined) continue;
    defs.set(name, { before: JSON.parse(before) as SkillDefinition, after: JSON.parse(after) as SkillDefinition });
  }
  const changes: string[] = [];
  const problems: string[] = [];
  if (defs.size === 0) return { changes, problems };
  for (const name of readdirSync(`${ROOT}${CLAIMS_DIR}`).filter((n) => n.endsWith('.json'))) {
    const path = `${ROOT}${CLAIMS_DIR}${name}`;
    const text = readFileSync(path, 'utf8');
    // 変わった定義のキャラの印を持つ結論だけ見る（git show を全部の結論に回すと遅い）
    if (![...defs.keys()].some((who) => text.includes(`"${who} `))) continue;
    const file = JSON.parse(text) as ClaimFile;
    if (file.minimal === undefined) continue;
    const baseText = git(['show', `${base}:${CLAIMS_DIR}${name}`]);
    const r = renumberMarks(file, baseText === undefined ? undefined : (JSON.parse(baseText) as ClaimFile), defs);
    changes.push(...r.changes);
    problems.push(...r.problems);
    if (r.changes.length > 0) writeFileSync(path, `${JSON.stringify(r.file, null, 2)}\n`);
  }
  return { changes, problems };
}
