import { parseSkillDefinition, parseSkillIndex, type SkillDefinition, type SkillIndex } from './skills/types.ts';
import type {
  AffectionMaster,
  BuildMasters,
  CharacterData,
  CharacterIndex,
  CollectionMaster,
  CubeMaster,
  GearMaster,
  OverloadMaster,
  RecycleRoomMaster,
} from './types.ts';

export const CHARACTER_DATA_DIR = 'characters';
export const SKILL_DATA_DIR = 'skills';
/** Stage 12: 育成のマスタ（gear / affection / cubes / collections / recycleRoom） */
export const MASTER_DATA_DIR = 'masters';

export type LoadOptions = {
  /** データを配信しているベース URL（末尾スラッシュ任意）。既定 "/" */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

function joinUrl(baseUrl: string, relativePath: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}${relativePath}`;
}

export function characterIndexPath(): string {
  return `${CHARACTER_DATA_DIR}/index.json`;
}

export function characterDataPath(resourceId: number): string {
  return `${CHARACTER_DATA_DIR}/${resourceId}.json`;
}

export function skillIndexPath(): string {
  return `${SKILL_DATA_DIR}/index.json`;
}

export function skillDefinitionPath(resourceId: number): string {
  return `${SKILL_DATA_DIR}/${resourceId}.json`;
}

export const MASTER_FILES: Record<keyof BuildMasters, string> = {
  gear: 'gear.json',
  affection: 'affection.json',
  cubes: 'cubes.json',
  collections: 'collections.json',
  recycleRoom: 'recycleRoom.json',
  overload: 'overload.json',
};

export function masterDataPath(name: keyof BuildMasters): string {
  return `${MASTER_DATA_DIR}/${MASTER_FILES[name]}`;
}

async function fetchJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function loadCharacterIndex(options: LoadOptions = {}): Promise<CharacterIndex> {
  const { baseUrl = '/', fetchImpl = fetch } = options;
  return fetchJson<CharacterIndex>(joinUrl(baseUrl, characterIndexPath()), fetchImpl);
}

export async function loadCharacter(resourceId: number, options: LoadOptions = {}): Promise<CharacterData> {
  const { baseUrl = '/', fetchImpl = fetch } = options;
  return fetchJson<CharacterData>(joinUrl(baseUrl, characterDataPath(resourceId)), fetchImpl);
}

/** 定義済みキャラの一覧。手書き JSON なので読み込み時に検証する */
export async function loadSkillIndex(options: LoadOptions = {}): Promise<SkillIndex> {
  const { baseUrl = '/', fetchImpl = fetch } = options;
  return parseSkillIndex(await fetchJson<unknown>(joinUrl(baseUrl, skillIndexPath()), fetchImpl));
}

/** スキル定義。手書き JSON なので読み込み時に検証する（不正なら Error） */
export async function loadSkillDefinition(resourceId: number, options: LoadOptions = {}): Promise<SkillDefinition> {
  const { baseUrl = '/', fetchImpl = fetch } = options;
  const def = parseSkillDefinition(
    await fetchJson<unknown>(joinUrl(baseUrl, skillDefinitionPath(resourceId)), fetchImpl),
  );
  if (def.resourceId !== resourceId) {
    throw new Error(`skill definition ${resourceId}: file declares resourceId ${def.resourceId}`);
  }
  return def;
}

function assertFormatVersion(name: string, value: { formatVersion?: unknown }): void {
  if (value.formatVersion !== 1)
    throw new Error(`master ${name}: unsupported formatVersion ${String(value.formatVersion)}`);
}

/** Stage 12: 育成のマスタをまとめて読む（calc の起動時に 1 回）。Stage 13 で OL の上昇値の表を足した */
export async function loadBuildMasters(options: LoadOptions = {}): Promise<BuildMasters> {
  const { baseUrl = '/', fetchImpl = fetch } = options;
  const load = <T extends { formatVersion?: unknown }>(name: keyof BuildMasters) =>
    fetchJson<T>(joinUrl(baseUrl, masterDataPath(name)), fetchImpl).then((v) => {
      assertFormatVersion(name, v);
      return v;
    });
  const [gear, affection, cubes, collections, recycleRoom, overload] = await Promise.all([
    load<GearMaster>('gear'),
    load<AffectionMaster>('affection'),
    load<CubeMaster>('cubes'),
    load<CollectionMaster>('collections'),
    load<RecycleRoomMaster>('recycleRoom'),
    load<OverloadMaster>('overload'),
  ]);
  return { gear, affection, cubes, collections, recycleRoom, overload };
}
