// data/skills に定義のあるキャラの一覧。Node の側（道具とテスト）はここで引く（画面は生成物 support.json の defined を読む）。
// import は node:fs だけにする（テストの共通の道具 src/__tests__/data.ts から読んでも、計算の本体を読み込まない）
import { readdirSync } from 'node:fs';

const SKILLS_DIR = new URL('../data/skills/', import.meta.url);

/** data/skills/<resourceId>.json の resourceId（昇順） */
export function definedSkillIds(): number[] {
  return readdirSync(SKILLS_DIR)
    .flatMap((name) => /^(\d+)\.json$/.exec(name)?.[1] ?? [])
    .map(Number)
    .sort((a, b) => a - b);
}
