// data/ の <resourceId>.json の列挙と、data/skills に定義のあるキャラの一覧。Node の側（道具とテスト）はここで引く（画面は生成物
// support.json の defined を読む）。import は node:fs だけにする（テストの共通の道具 src/__tests__/data.ts から読んでも、計算の本体を
// 読み込まない）
import { readdirSync } from 'node:fs';

export const SKILLS_DIR = new URL('../data/skills/', import.meta.url);

/** キャラごとのファイルの名前（<resourceId>.json） */
export const RESOURCE_FILE = /^(\d+)\.json$/;

/** ディレクトリの <resourceId>.json の resourceId（昇順） */
export function resourceIdsIn(dir: string | URL): number[] {
  return readdirSync(dir)
    .flatMap((name) => RESOURCE_FILE.exec(name)?.[1] ?? [])
    .map(Number)
    .sort((a, b) => a - b);
}

/** data/skills に定義のあるキャラ（昇順） */
export function definedSkillIds(): number[] {
  return resourceIdsIn(SKILLS_DIR);
}
