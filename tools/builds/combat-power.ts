// 育成データの JSON（スナップショット。npm run build:import が書く形）から戦闘力を出し、ゲームの戦闘力と並びを突き合わせる
// （C-0981。plan/design-combat-power-sort.md）。結果は画面に出すだけで、ファイルには書かない。
//   npm run build:combat-power                         private/builds/ のいちばん新しいスナップショット
//   npm run build:combat-power -- <スナップショット> [--actual <生の JSON>] [--list]
// ゲームの戦闘力は、ShiftyPad の生のデータ（<スナップショットの名前>.raw.json）の combat（GetUserCharacterDetails）。
// --list で、モデルの降順の並びと、実際の降順の並びの位置を全部出す。
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { computeCombatPower } from '../../packages/core/src/combatPower.ts';
import { MASTER_FILES } from '../../packages/core/src/load.ts';
import type { BuildSnapshot, ShiftyPadRaw } from '../../packages/core/src/shiftypad.ts';
import type { BuildMasters, CharacterData, CharacterIndex } from '../../packages/core/src/types.ts';
import { compareCombatPower, sortByCombatPower, type CombatPowerRow } from './combat-power-lib.ts';
import { buildsDir, snapshotNames } from './dirs.ts';
import { sortNames } from './import-lib.ts';

const { values, positionals } = parseArgs({
  options: { actual: { type: 'string' }, list: { type: 'boolean', default: false } },
  allowPositionals: true,
});
if (positionals.length > 1) {
  console.error('usage: npm run build:combat-power -- [<スナップショット>] [--actual <生の JSON>] [--list]');
  process.exit(2);
}

let snapshotPath = positionals[0];
if (snapshotPath === undefined) {
  const latest = sortNames(snapshotNames() ?? []).at(-1);
  if (latest === undefined) {
    console.error(`${buildsDir()} にスナップショットが無い（npm run build:import で作る）`);
    process.exit(1);
  }
  snapshotPath = join(buildsDir(), `${latest}.json`);
}
const actualPath = values.actual ?? join(dirname(snapshotPath), `${basename(snapshotPath, '.json')}.raw.json`);
for (const path of [snapshotPath, actualPath]) {
  if (!existsSync(path)) {
    console.error(`${path} が無い`);
    process.exit(1);
  }
}

const DATA = join(import.meta.dirname, '../../packages/core/data');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const masters = Object.fromEntries(
  Object.entries(MASTER_FILES).map(([k, f]) => [k, readJson(join(DATA, 'masters', f))]),
) as BuildMasters;
const index = readJson<CharacterIndex>(join(DATA, 'characters/index.json')).characters;
const snapshot = readJson<BuildSnapshot>(snapshotPath);
const raw = readJson<ShiftyPadRaw & { details: Record<string, number>[] }>(actualPath);
const actualByCode = new Map(raw.details.map((d) => [d['name_code'], d['combat']]));

const names = new Map<number, string>();
const errors: string[] = [];
const rows: CombatPowerRow[] = [];
for (const [id, c] of Object.entries(snapshot.characters)) {
  const resourceId = Number(id);
  const entry = index.find((e) => e.resourceId === resourceId);
  const actual = entry === undefined ? undefined : actualByCode.get(entry.nameCode);
  names.set(resourceId, entry?.name.ja ?? '（データに無い）');
  if (actual === undefined) {
    errors.push(`${id} ${names.get(resourceId)}: 生のデータに戦闘力が無い（飛ばした）`);
    continue;
  }
  let model: number | null = null;
  try {
    const character = readJson<CharacterData>(join(DATA, `characters/${id}.json`));
    model = computeCombatPower(
      character,
      { growth: c.growth, build: c, skillLevels: c.skillLevels, treasure: c.treasure !== null },
      masters,
    ).value;
  } catch (e) {
    errors.push(`${id} ${names.get(resourceId)}: ${(e as Error).message}`);
  }
  rows.push({ id: resourceId, model, actual });
}

const result = compareCombatPower(rows);
const label = (r: CombatPowerRow) => `${r.id} ${names.get(r.id)}`;
console.log(`${snapshotPath}（ゲームの戦闘力: ${actualPath}）`);
console.log(`戦闘力: ${rows.length} 体中 ${result.matched} 体が一致`);
for (const r of result.mismatched) console.log(`  ${label(r)}: モデル ${r.model ?? '出せない'}・ゲーム ${r.actual}`);
console.log(
  `並び（降順）: 高低が食い違う組 ${result.inversions}（ゲームの戦闘力が同じ組 ${result.actualTies} は数えない）`,
);
for (const e of errors) console.log(`  ${e}`);
if (values.list) {
  const actualRank = new Map(sortByCombatPower(rows, (r) => r.actual).map((r, i) => [r.id, i + 1]));
  console.log('順位（モデル）・順位（ゲーム）・モデル・ゲーム・キャラ');
  sortByCombatPower(rows, (r) => r.model).forEach((r, i) =>
    console.log(`  ${i + 1}\t${actualRank.get(r.id)}\t${r.model ?? '-'}\t${r.actual}\t${label(r)}`),
  );
}
if (result.mismatched.length > 0 || result.inversions > 0 || errors.length > 0) process.exitCode = 1;
