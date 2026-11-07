// tools/builds の道具が読む CDN のデータ（キャラの索引・キャラ・育成のマスタ）。store.ts・combat-power.ts から使う。
// 読むだけで、書き込み先は持たない。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MASTER_FILES } from '../../packages/core/src/load.ts';
import type { BuildMasters, CharacterData, CharacterIndex } from '../../packages/core/src/types.ts';

const DATA = join(import.meta.dirname, '../../packages/core/data');

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
export const index = readJson<CharacterIndex>(join(DATA, 'characters/index.json')).characters;
export const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, readJson(join(DATA, 'masters', f))]),
) as BuildMasters;

const indexById = new Map(index.map((c) => [c.resourceId, c]));
/** キャラの日本語名（データに無ければその旨） */
export const nameOf = (id: number): string => indexById.get(id)?.name.ja ?? '（データに無い）';

const characterCache = new Map<number, CharacterData>();
export function characterOf(id: number): CharacterData {
  let c = characterCache.get(id);
  if (c === undefined) {
    c = readJson<CharacterData>(join(DATA, `characters/${id}.json`));
    characterCache.set(id, c);
  }
  return c;
}
