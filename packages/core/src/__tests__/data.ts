// テストの共通の道具: データ（packages/core/data/）と観測値（records/observations/）を読む。import は node:fs・型と、node:fs だけを読む scripts/defined-skills.ts にする
// （計算の本体を読み込まないので、定義の読み込みだけを見る単体テストも軽いまま使える）。枠・編成・敵を作る道具は teamHelpers.ts
import { readFileSync } from 'node:fs';
import { definedSkillIds } from '../../scripts/defined-skills.ts';
import type { CharacterData } from '../types.ts';

const DATA_DIR = new URL('../../data/', import.meta.url);
const OBSERVATIONS_DIR = new URL('../../../../records/observations/', import.meta.url);

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

/** data/skills に定義のあるキャラ（昇順） */
export const DEFINED_IDS: ReadonlySet<number> = new Set(definedSkillIds());

/** records/observations/<録画 id>.json（その録画の観測値の列） */
export function readObservations<T>(recording: string): T {
  return JSON.parse(readFileSync(new URL(`${recording}.json`, OBSERVATIONS_DIR), 'utf8')) as T;
}
