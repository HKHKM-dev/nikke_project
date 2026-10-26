// 録画をレシピで読み、観測値にする（plan/design-records-automation.md 3.4 節）。
//   node tools/captures/read.ts <録画 id>[,<録画 id>...] --recipe <名前> --source V-NNNN [--opt key=value ...] [--write] [--against 0074-14,0074-18]
//   node tools/captures/read.ts --list                     # レシピの一覧と --opt の説明
//
// - 録画は複数受ける（, で並べるか、空白で並べる）。同じレシピ・同じ --opt で 1 本ずつ読み、失敗したらそこで止める（それまでの分は書いたまま）。
// - 録画の実体は records/recordings/<録画 id>.json から引く（このリポジトリの録画は置き場所の <folder>/<file>、旧の録画は path）。
//   無い録画は、取り寄せの準備（NIKKE_DRIVE_SA_KEY）があれば fetch.ts で Drive から取り寄せてから読む（クラウド環境。
//   plan/design-workflow-simplification-2.md 2 節）。
// - 中間出力（hud.ts の増分など）は、録画の置き場所の derived/<録画 id>/ にキャッシュする（追跡しない）。
// - 観測値は標準出力に JSON で出す。--write で records/observations/<録画 id>.json に足す（id は次の空き番号。source・readAt を書く）。
//   空き番号は、どれかのブランチ（手元か origin。main を含む）がこの録画に足したことのある番号を避ける（並行する読み取りが同じ番号を
//   取らない。plan/design-investigation-review.md 4.3 節）。
//   同じレシピ・同じ版の観測値が既にあれば、同じ値なら足さず、違えば差を出して止まる（人が invalid を付けるか、版を上げる）。
// - --against は、既存の観測値（ID）の値を並べて出す（レシピの出力と目で比べる。旧の観測値の確かめ用）。
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { Observation } from '../../packages/core/src/records/observations.ts';
import { todayLocal } from '../../packages/core/src/records/predictions.ts';
import { capturesDir } from './dirs.ts';
import { RECIPES, findRecipe } from './recipes/index.ts';
import { toolName, type RecipeContext, type RecipeObservation } from './recipes/types.ts';
import {
  existingVideoOf,
  loadObservations,
  loadRecording,
  prepareObservations,
  videoOf,
  writeObservations,
} from './records-io.ts';

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

const ids = positionals.flatMap((p) => p.split(',')).filter((x) => x !== '');
const recipe = values.recipe === undefined ? undefined : findRecipe(values.recipe);
if (ids.length === 0 || !values.recipe || !recipe) {
  console.error(
    'usage: node tools/captures/read.ts <録画 id>[,<録画 id>...] --recipe <名前> --source V-NNNN [--opt key=value ...] [--write] [--against ID,ID]\n' +
      `recipes: ${RECIPES.map((r) => r.name).join(' ')}（--list で説明）`,
  );
  process.exit(1);
}
if (!values.source && values.write) {
  console.error('--write には --source V-NNNN が要る');
  process.exit(1);
}
const options: Record<string, string> = {};
for (const o of values.opt) {
  const at = o.indexOf('=');
  if (at <= 0) throw new Error(`--opt は key=value: ${o}`);
  options[o.slice(0, at)] = o.slice(at + 1);
}

// 無い録画を取り寄せる（取り寄せの準備があるときだけ。無ければ existingVideoOf が止める）
const recordings = ids.map((id) => loadRecording(id));
const missing = recordings.filter((r) => !existsSync(videoOf(r))).map((r) => r.id);
if (missing.length > 0 && process.env['NIKKE_DRIVE_SA_KEY']) {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./fetch.ts', import.meta.url)), ...missing], {
    stdio: ['ignore', 2, 'inherit'],
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

for (const recording of recordings) {
  const id = recording.id;
  if (ids.length > 1) console.error(`--- 録画 ${id}`);
  const ctx: RecipeContext = {
    recording,
    video: existingVideoOf(recording),
    derivedDir: join(capturesDir(), 'derived', id),
    source: values.source ?? '',
    readAt: values['read-at'] ?? todayLocal(),
    options,
    log: (m) => console.error(m),
  };
  const produced = await recipe.run(ctx);
  const { existing, finished } = prepareObservations(id, produced, {
    tool: toolName(recipe),
    source: ctx.source,
    readAt: ctx.readAt,
  });
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
  if (values.write) writeObservations(id, existing, finished);
}

/** 型の確認用（RecipeObservation は Observation から id などを除いたもの） */
export type { RecipeObservation };
