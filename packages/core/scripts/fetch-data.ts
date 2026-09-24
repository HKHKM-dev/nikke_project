// Blablalink 公開 CDN からキャラ一覧と roledata（ja/en）、SSR の宝物（ja/en）を取得し、正規化して data/characters に書き出す。
// Stage 12: 育成のマスタ（好感度・キューブ・R/SR のコレクション・リサイクルルーム）も取得して data/masters に書き出し、
// 手書きの装備マスタ（data/masters/gear.json）の Lv0 が CDN の ItemEquipTable と一致することを確かめる。
// Stage 13: 手書きの OL の表（data/masters/overload.json）のオプションが CDN の equip_option_table_v2 と一致することを確かめる。
//   node scripts/fetch-data.ts [--limit N] [--refresh] [--concurrency N]
// 生 JSON は .cache/ に保存し、--refresh を付けない限りキャッシュを優先する。
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchCdnJson, mapWithConcurrency } from './blablalink/client.ts';
import {
  attractiveLevelTablePath,
  cubePath,
  equipOptionTablePath,
  favoritePath,
  favoriteRareMapPath,
  itemEquipTablePath,
  nikkeListPath,
  recycleResearchStatTablePath,
  roleDataPath,
} from './blablalink/path.ts';
import { formatJson } from './format-json.ts';
import {
  checkGearMaster,
  checkOverloadMaster,
  findTreasureOwner,
  toAffectionMaster,
  toCharacterData,
  toCollectionData,
  toCubeData,
  toIndexEntry,
  toRecycleRoomMaster,
  toTreasureData,
  toTreasureStats,
  type RawAttractiveTable,
  type RawCollection,
  type RawCube,
  type RawEquipOption,
  type RawEquipTable,
  type RawFavorite,
  type RawFavoriteRareMap,
  type RawListEntry,
  type RawRecycleTable,
  type RawRoleData,
} from './normalize.ts';
import type {
  CharacterIndex,
  CharacterIndexEntry,
  CollectionMaster,
  CubeMaster,
  GearMaster,
  OverloadMaster,
  TreasureData,
} from '../src/types.ts';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(PACKAGE_ROOT, '.cache');
const DATA_DIR = path.join(PACKAGE_ROOT, 'data', 'characters');
const MASTERS_DIR = path.join(PACKAGE_ROOT, 'data', 'masters');
/** キューブの ID は 1000301 から連番。404 で探索を止める */
const CUBE_FIRST_ID = 1000301;
const CUBE_MAX_COUNT = 100;

const { values: args } = parseArgs({
  options: {
    limit: { type: 'string' },
    refresh: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '6' },
  },
});
const limit = args.limit === undefined ? undefined : Number(args.limit);
const concurrency = Number(args.concurrency);

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function cachedJson<T>(cacheKey: string, logicalPath: string): Promise<T> {
  const file = path.join(CACHE_DIR, cacheKey);
  if (!args.refresh) {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch {
      // キャッシュなし → 取得
    }
  }
  const data = await fetchCdnJson<T>(logicalPath, {
    fetchImpl: async (url, init) => {
      const res = await fetch(url, init);
      // 404 は再試行しても変わらないので、そのまま投げる（キューブの探索の終端）
      if (res.status === 404) throw new HttpError(404, `GET ${logicalPath} -> HTTP 404`);
      return res;
    },
  });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data), 'utf8');
  return data;
}

async function writeData(dir: string, name: string, value: unknown): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), `${formatJson(value)}\n`, 'utf8');
}

async function fetchMasters(rareMap: RawFavoriteRareMap): Promise<void> {
  // 装備: 手書きのマスタの Lv0 を CDN と突き合わせる（Lv1〜5 は CDN に無い）
  const gear = JSON.parse(await readFile(path.join(MASTERS_DIR, 'gear.json'), 'utf8')) as GearMaster;
  const equipTable = await cachedJson<RawEquipTable>('ItemEquipTable-ja.json', itemEquipTablePath('ja'));
  const gearProblems = checkGearMaster(gear, equipTable);
  if (gearProblems.length > 0) {
    throw new Error(`gear master (data/masters/gear.json) differs from CDN at Lv0:\n  ${gearProblems.join('\n  ')}`);
  }
  console.log(`gear: master Lv0 matches CDN (${equipTable.records.length} records)`);

  // Stage 13: OL の表はオプションの一覧だけ CDN と突き合わせる（Lv 別の数値は CDN に無い）
  const overload = JSON.parse(await readFile(path.join(MASTERS_DIR, 'overload.json'), 'utf8')) as OverloadMaster;
  const optionTable = await cachedJson<RawEquipOption[]>('equip_option_table_v2-ja.json', equipOptionTablePath('ja'));
  const overloadProblems = checkOverloadMaster(overload, optionTable);
  if (overloadProblems.length > 0) {
    throw new Error(
      `overload master (data/masters/overload.json) differs from CDN:\n  ${overloadProblems.join('\n  ')}`,
    );
  }
  console.log(`overload: master options match CDN (${overload.options.length} options)`);

  const affection = toAffectionMaster(
    await cachedJson<RawAttractiveTable>('AttractiveLevelTable.json', attractiveLevelTablePath()),
  );
  await writeData(MASTERS_DIR, 'affection.json', affection);
  console.log(`affection: ${affection.ranks.length} ranks`);

  const recycleRoom = toRecycleRoomMaster(
    await cachedJson<RawRecycleTable>('RecycleResearchStatTable.json', recycleResearchStatTablePath()),
  );
  await writeData(MASTERS_DIR, 'recycleRoom.json', recycleRoom);
  console.log(`recycle room: ${Object.keys(recycleRoom.corporation).length} corporations`);

  const cubes: CubeMaster = { formatVersion: 1, cubes: [] };
  for (let id = CUBE_FIRST_ID; id < CUBE_FIRST_ID + CUBE_MAX_COUNT; id++) {
    let en: RawCube;
    try {
      en = await cachedJson<RawCube>(`en/cube-${id}.json`, cubePath(id, 'en'));
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) break;
      throw error;
    }
    const ja = await cachedJson<RawCube>(`ja/cube-${id}.json`, cubePath(id, 'ja'));
    cubes.cubes.push(toCubeData(en, ja));
  }
  if (cubes.cubes.length === 0) throw new Error('no cubes found');
  await writeData(MASTERS_DIR, 'cubes.json', cubes);
  console.log(`cubes: ${cubes.cubes.length}`);

  const collectionIds = [...(rareMap.R ?? []), ...(rareMap.SR ?? [])];
  const collections = await mapWithConcurrency(collectionIds, concurrency, async (id) => {
    const en = await cachedJson<RawCollection>(`en/favorite-${id}.json`, favoritePath(id, 'en'));
    const ja = await cachedJson<RawCollection>(`ja/favorite-${id}.json`, favoritePath(id, 'ja'));
    return toCollectionData(en, ja);
  });
  const ssrId = rareMap.SSR?.[0];
  if (ssrId === undefined) throw new Error('no SSR favorite for treasure stats');
  const ssr = await cachedJson<RawCollection>(`en/favorite-${ssrId}.json`, favoritePath(ssrId, 'en'));
  const master: CollectionMaster = { formatVersion: 1, collections, treasureStats: toTreasureStats(ssr) };
  await writeData(MASTERS_DIR, 'collections.json', master);
  console.log(`collections: ${collections.length} (R ${rareMap.R?.length ?? 0}, SR ${rareMap.SR?.length ?? 0})`);
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

  // Stage 12: 育成のマスタ
  await fetchMasters(rareMap);
  console.log(`written: masters -> ${MASTERS_DIR}`);

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
