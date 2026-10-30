// CDN から取り直したデータ（作業ツリーの data/characters・data/masters）を、git の版（既定 HEAD）と比べて分けて出す
// （plan/design-cdn-refresh.md 3 節）。npm run fetch-data の後に回し、出力を PR の本文に貼る。
//   node scripts/data-diff.ts [--base <git の ref>]
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { COLLECTION_SKILL_EFFECTS, CUBE_SKILL_EFFECTS } from '../src/buildEffects.ts';
import type { CharacterData, CharacterIndex, CollectionMaster, CubeMaster } from '../src/types.ts';
import { diffCharacters, diffJson, renderReport, type UnmappedSkill } from './data-diff/compare.ts';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHARACTERS = 'data/characters';
const MASTERS = 'data/masters';

const { values: args } = parseArgs({ options: { base: { type: 'string', default: 'HEAD' } } });
const base = args.base;

const git = (...gitArgs: string[]): string =>
  execFileSync('git', gitArgs, { cwd: PACKAGE_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** dir の JSON のファイル名（index.json を除く）。ref を渡すと git の版、無ければ作業ツリー */
function jsonFiles(dir: string, ref?: string): string[] {
  const names =
    ref === undefined
      ? readdirSync(path.join(PACKAGE_ROOT, dir))
      : git('ls-tree', '--name-only', ref, `${dir}/`)
          .split('\n')
          .map((p) => path.basename(p));
  return names.filter((n) => n.endsWith('.json') && n !== 'index.json').sort();
}

function readJson(file: string, ref?: string): unknown {
  const text =
    ref === undefined ? readFileSync(path.join(PACKAGE_ROOT, file), 'utf8') : git('show', `${ref}:./${file}`);
  return JSON.parse(text) as unknown;
}

/** index.json に載っているキャラ（画面が読むのは index.json の分だけ。載っていないファイルは古い残りなので比べない） */
function characters(ref?: string): Map<number, CharacterData> {
  const map = new Map<number, CharacterData>();
  for (const { resourceId } of (readJson(`${CHARACTERS}/index.json`, ref) as CharacterIndex).characters) {
    map.set(resourceId, readJson(`${CHARACTERS}/${resourceId}.json`, ref) as CharacterData);
  }
  return map;
}

const defined = new Set(
  (JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'data/skills/index.json'), 'utf8')) as { resourceIds: number[] })
    .resourceIds,
);

const baseMasters = new Set(jsonFiles(MASTERS, base));
const masters = jsonFiles(MASTERS).map((name) => {
  const file = `${MASTERS}/${name}`;
  return { file: name, changes: diffJson(baseMasters.has(name) ? readJson(file, base) : undefined, readJson(file)) };
});

const unmapped: UnmappedSkill[] = [];
const cubes = readJson(`${MASTERS}/cubes.json`) as CubeMaster;
for (const cube of cubes.cubes) {
  for (const s of cube.skills) {
    if (CUBE_SKILL_EFFECTS[s.id] === undefined) {
      unmapped.push({ owner: `キューブ ${cube.id} ${cube.name.ja}`, id: s.id, description: s.description.ja });
    }
  }
}
const collections = readJson(`${MASTERS}/collections.json`) as CollectionMaster;
for (const c of collections.collections) {
  for (const s of c.skills) {
    if (COLLECTION_SKILL_EFFECTS[s.id] === undefined) {
      unmapped.push({ owner: `コレクション ${c.id} ${c.name.ja}`, id: s.id, description: s.description.ja });
    }
  }
}

process.stdout.write(
  renderReport({
    base,
    characters: diffCharacters(characters(base), characters(), defined),
    masters,
    unmapped,
  }),
);
