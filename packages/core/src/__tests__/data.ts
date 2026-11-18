// テストの共通の道具: データ（packages/core/data/）を読む。import は node:fs と型だけにする（計算の本体を読み込まないので、
// 定義の読み込みだけを見る単体テストも軽いまま使える）。枠・編成・敵を作る道具は teamHelpers.ts
import { readFileSync } from 'node:fs';
import type { CharacterData } from '../types.ts';

const DATA_DIR = new URL('../../data/', import.meta.url);

/** packages/core/data/ からの相対パスの JSON */
export function readData<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, DATA_DIR), 'utf8')) as T;
}

/** data/characters のキャラ */
export function characterOf(id: number): CharacterData {
  return readData<CharacterData>(`characters/${id}.json`);
}

/** 生の定義（読み込む前の JSON）のうち、テストが書き換える所の形 */
export type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };

/** data/skills の生の定義（読み込む前の JSON。書き換えて読み込みに渡す用） */
export function rawDefinition<T = unknown>(id: number): T {
  return readData<T>(`skills/${id}.json`);
}

/** data/skills に定義のあるキャラ（index.json の resourceIds） */
export const DEFINED_IDS: ReadonlySet<number> = new Set(
  readData<{ resourceIds: number[] }>('skills/index.json').resourceIds,
);

/** records/observations/<録画 id>.json（その録画の観測値の列） */
export function readObservations<T>(recording: string): T {
  return JSON.parse(
    readFileSync(new URL(`../../../../records/observations/${recording}.json`, import.meta.url), 'utf8'),
  ) as T;
}
