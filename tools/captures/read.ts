// 録画をレシピで読み、観測値にする（plan/design-records-automation.md 3.4 節）。
//   node tools/captures/read.ts <録画 id> --recipe <名前> --source V-NNNN [--opt key=value ...] [--write] [--against 074-14,074-18]
//   node tools/captures/read.ts --list                     # レシピの一覧と --opt の説明
//
// - 録画の実体は records/recordings/<録画 id>.json から引く（このリポジトリの録画は置き場所の <folder>/<file>、旧の録画は path）。
// - 中間出力（hud.ts の増分など）は、録画の置き場所の derived/<録画 id>/ にキャッシュする（追跡しない）。
// - 観測値は標準出力に JSON で出す。--write で records/observations/<録画 id>.json に足す（id は次の空き番号。source・readAt を書く）。
//   同じレシピ・同じ版の観測値が既にあれば、同じ値なら足さず、違えば差を出して止まる（人が invalid を付けるか、版を上げる）。
// - --against は、既存の観測値（ID）の値を並べて出す（レシピの出力と目で比べる。旧の観測値の確かめ用）。
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Observation } from '../../packages/core/src/records/observations.ts';
import { isLegacy, type RecordingEntry } from '../../packages/core/src/records/recordings.ts';
import { capturesDir } from './dirs.ts';
import { RECIPES, findRecipe } from './recipes/index.ts';
import { toolName, type RecipeContext, type RecipeObservation } from './recipes/types.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RECORDINGS_DIR = `${ROOT}records/recordings/`;
const OBSERVATIONS_DIR = `${ROOT}records/observations/`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    recipe: { type: 'string' },
    source: { type: 'string' },
    opt: { type: 'string', multiple: true, default: [] },
    write: { type: 'boolean', default: false },
    against: { type: 'string' },
    list: { type: 'boolean', default: false },
    'read-at': { type: 'string' },
  },
});

if (values.list) {
  for (const r of RECIPES) {
    console.log(`${r.name}@${r.version}: ${r.describe}`);
    for (const [k, v] of Object.entries(r.options)) console.log(`  --opt ${k}=…  ${v}`);
  }
  process.exit(0);
}

const id = positionals[0];
const recipe = values.recipe === undefined ? undefined : findRecipe(values.recipe);
if (!id || !values.recipe || !recipe) {
  console.error(
    'usage: node tools/captures/read.ts <録画 id> --recipe <名前> --source V-NNNN [--opt key=value ...] [--write] [--against ID,ID]\n' +
      `recipes: ${RECIPES.map((r) => r.name).join(' ')}（--list で説明）`,
  );
  process.exit(1);
}
if (!values.source && values.write) {
  console.error('--write には --source V-NNNN が要る');
  process.exit(1);
}

function loadRecording(recordingId: string): RecordingEntry {
  const path = `${RECORDINGS_DIR}${recordingId}.json`;
  if (!existsSync(path)) throw new Error(`records/recordings/${recordingId}.json が無い`);
  return JSON.parse(readFileSync(path, 'utf8')) as RecordingEntry;
}

function videoOf(entry: RecordingEntry): string {
  return isLegacy(entry) ? entry.path : join(capturesDir(), entry.folder, entry.file);
}

function loadObservations(recordingId: string): Observation[] {
  const path = `${OBSERVATIONS_DIR}${recordingId}.json`;
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Observation[]) : [];
}

function nextId(recordingId: string, existing: readonly Observation[]): string {
  const used = new Set(existing.map((o) => o.id));
  for (let n = 1; ; n++) {
    const candidate = `${recordingId}-${String(n).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
}

function sameValue(a: number | number[], b: number | number[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

const recording = loadRecording(id);
const video = videoOf(recording);
if (!existsSync(video))
  throw new Error(`録画の実体が無い: ${video}（クラウド環境では tools/captures/fetch.ts で取り寄せる）`);
const options: Record<string, string> = {};
for (const o of values.opt) {
  const at = o.indexOf('=');
  if (at <= 0) throw new Error(`--opt は key=value: ${o}`);
  options[o.slice(0, at)] = o.slice(at + 1);
}
const ctx: RecipeContext = {
  recording,
  video,
  derivedDir: join(capturesDir(), 'derived', id),
  source: values.source ?? '',
  readAt: values['read-at'] ?? new Date().toISOString().slice(0, 10),
  options,
  log: (m) => console.error(m),
};
const produced = await recipe.run(ctx);
const existing = loadObservations(id);
const tool = toolName(recipe);
const finished: Observation[] = [];
for (const p of produced) {
  const prior = existing.find((o) => o.method?.tool === tool && o.kind === p.kind && o.description === p.description);
  if (prior) {
    if (sameValue(prior.value, p.value)) {
      console.error(`${prior.id}: 同じレシピの同じ値がある（足さない）`);
      continue;
    }
    console.error(
      `${prior.id}: 同じレシピの値が違う。前 ${JSON.stringify(prior.value)} → 今 ${JSON.stringify(p.value)}`,
    );
    process.exitCode = 2;
    continue;
  }
  finished.push({
    id: nextId(id, [...existing, ...finished]),
    recording: id,
    ...p,
    source: ctx.source,
    readAt: ctx.readAt,
  } as Observation);
}
console.log(JSON.stringify(finished, null, 2));
if (values.against) {
  const want = values.against.split(',').map((s) => s.trim());
  const all = new Map<string, Observation>();
  for (const w of want) {
    const rec = w.replace(/-\d+$/, '');
    if (!all.has(rec)) for (const o of loadObservations(rec)) all.set(o.id, o);
  }
  console.error('--- 既存の観測値 ---');
  for (const w of want) {
    const o = all.get(w);
    console.error(o ? `${w}: ${JSON.stringify(o.value)}  ${o.description.slice(0, 80)}` : `${w}: 無い`);
  }
}
if (values.write && finished.length > 0) {
  const path = `${OBSERVATIONS_DIR}${id}.json`;
  writeFileSync(path, `${JSON.stringify([...existing, ...finished], null, 2)}\n`);
  spawnSync('npx', ['prettier', '--write', path], { stdio: 'inherit', shell: true });
  console.error(`${path} に ${finished.length} 件を足した（${finished.map((o) => o.id).join('・')}）`);
}

/** 型の確認用（RecipeObservation は Observation から id などを除いたもの） */
export type { RecipeObservation };
