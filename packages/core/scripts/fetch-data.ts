// Blablalink 公開 CDN からキャラ一覧と roledata（ja/en）、SSR の宝物（ja/en）を取得し、正規化して data/characters に書き出す。
//   node scripts/fetch-data.ts [--limit N] [--refresh] [--concurrency N]
// 生 JSON は .cache/ に保存し、--refresh を付けない限りキャッシュを優先する。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchCdnJson, mapWithConcurrency } from './blablalink/client.ts';
import { favoritePath, favoriteRareMapPath, nikkeListPath, roleDataPath } from './blablalink/path.ts';
import { formatJson } from './format-json.ts';
import {
  findTreasureOwner,
  toCharacterData,
  toIndexEntry,
  toTreasureData,
  type RawFavorite,
  type RawFavoriteRareMap,
  type RawListEntry,
  type RawRoleData,
} from './normalize.ts';
import type { CharacterIndex, CharacterIndexEntry, TreasureData } from '../src/types.ts';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(PACKAGE_ROOT, '.cache');
const DATA_DIR = path.join(PACKAGE_ROOT, 'data', 'characters');

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string' },
    refresh: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '6' },
  },
});
const limit = args.limit === undefined ? undefined : Number(args.limit);
const concurrency = Number(args.concurrency);

async function cachedJson<T>(cacheKey: string, logicalPath: string): Promise<T> {
  const file = path.join(CACHE_DIR, cacheKey);
  if (!args.refresh) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      // キャッシュなし → 取得
    }
  }
  const data = await fetchCdnJson<T>(logicalPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  return data;
}

async function main(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const list = await cachedJson<RawListEntry[]>('en/list.json', nikkeListPath('en'));
  await cachedJson<RawListEntry[]>('ja/list.json', nikkeListPath('ja'));
  const ids = list.map((entry) => entry.resource_id).sort((a, b) => a - b);
  const targets = limit === undefined ? ids : ids.slice(0, limit);
  console.log(`characters: ${targets.length} (of ${ids.length}), concurrency ${concurrency}`);

  const failures: { id: number; error: string }[] = [];
  const roles = await mapWithConcurrency(targets, concurrency, async (id) => {
    try {
      const en = await cachedJson<RawRoleData>(`en/roledata-${id}.json`, roleDataPath(id, 'en'));
      const ja = await cachedJson<RawRoleData>(`ja/roledata-${id}.json`, roleDataPath(id, 'ja'));
      return { id, en, ja };
    } catch (error) {
      failures.push({ id, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });
  const loaded = roles.filter((r): r is { id: number; en: RawRoleData; ja: RawRoleData } => r !== null);

  // Stage 9: 宝物（SSR だけがスキルを差し替える）。name_code で持ち主に対応付ける。照合に失敗したら全体を止める
  const rareMap = await cachedJson<RawFavoriteRareMap>('favorite_rare_map.json', favoriteRareMapPath());
  const favoriteIds = rareMap.SSR ?? [];
  const treasures = new Map<number, TreasureData>();
  await mapWithConcurrency(favoriteIds, concurrency, async (favoriteId) => {
    const en = await cachedJson<RawFavorite>(`en/favorite-${favoriteId}.json`, favoritePath(favoriteId, 'en'));
    const ja = await cachedJson<RawFavorite>(`ja/favorite-${favoriteId}.json`, favoritePath(favoriteId, 'ja'));
    const owner = findTreasureOwner(
      en,
      loaded.map((r) => r.en),
    );
    if (owner === null) {
      console.warn(
        `  favorite ${favoriteId} (${ja.name_localkey}): no character with name_code ${en.name_code}, skipped`,
      );
      return;
    }
    if (treasures.has(owner.resource_id)) throw new Error(`character ${owner.resource_id} has several treasures`);
    treasures.set(owner.resource_id, toTreasureData(en, ja, owner));
  });
  console.log(`treasures: ${treasures.size} (of ${favoriteIds.length} SSR favorites)`);

  const entries = await mapWithConcurrency(loaded, concurrency, async ({ id, en, ja }) => {
    try {
      const data = toCharacterData(en, ja, treasures.get(id) ?? null);
      await writeFile(path.join(DATA_DIR, `${id}.json`), `${formatJson(data)}\n`, 'utf8');
      return toIndexEntry(data);
    } catch (error) {
      failures.push({ id, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  });

  const characters = entries.filter((e): e is CharacterIndexEntry => e !== null);
  const index: CharacterIndex = { formatVersion: 1, characters };
  await writeFile(path.join(DATA_DIR, 'index.json'), `${formatJson(index)}\n`, 'utf8');

  console.log(`written: ${characters.length} characters + index.json -> ${DATA_DIR}`);
  if (failures.length > 0) {
    console.error(`failed: ${failures.length}`);
    for (const f of failures) console.error(`  ${f.id}: ${f.error}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
