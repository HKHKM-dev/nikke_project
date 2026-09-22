import { parseSkillDefinition, parseSkillIndex, type SkillDefinition, type SkillIndex } from './skills/types.ts';
import type { CharacterData, CharacterIndex } from './types.ts';

export const CHARACTER_DATA_DIR = 'characters';
export const SKILL_DATA_DIR = 'skills';

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
