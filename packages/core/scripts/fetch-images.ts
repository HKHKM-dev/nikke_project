// モダン UI のキャラ画像を Blablalink 公開 CDN から取り、data/characters に置く（plan/design-modern-ui.md）。
// - 顔のアイコン（si、128×128）→ data/characters/images/{resourceId}.webp（トレイ・ドラッグ中の絵）
// - 縦長の絵（mi、256×512）→ data/characters/portraits/{resourceId}.webp（スロットのカード）
// 画面（apps/web の CharacterVisual）はこの場所を読み、無ければ属性の色の札で出す。
// キャラは data/characters/index.json に載っている分。新しいキャラを取り込んだ（fetch-data）後に回す。
//   node scripts/fetch-images.ts [--refresh] [--concurrency N]
// 既にあるファイルは --refresh を付けない限り取り直さない。CDN に無い画像（404）は飛ばして一覧に出す。
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchCdnBytes, mapWithConcurrency } from './blablalink/client.ts';
import { characterImagePath, type CharacterImageKind } from './blablalink/path.ts';
import type { CharacterIndex } from '../src/types.ts';

const CHARACTERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'characters');
/** 画像の種類ごとの置き場所（data/characters の下） */
const KIND_DIRS: Record<CharacterImageKind, string> = { si: 'images', mi: 'portraits' };

const { values: args } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '6' },
  },
});

const index = JSON.parse(await readFile(path.join(CHARACTERS_DIR, 'index.json'), 'utf8')) as CharacterIndex;
const kinds = Object.keys(KIND_DIRS) as CharacterImageKind[];
for (const kind of kinds) await mkdir(path.join(CHARACTERS_DIR, KIND_DIRS[kind]), { recursive: true });
const jobs = index.characters.flatMap((c) => kinds.map((kind) => ({ character: c, kind })));

let fetched = 0;
const found = await mapWithConcurrency(jobs, Number(args.concurrency), async ({ character, kind }) => {
  const file = path.join(CHARACTERS_DIR, KIND_DIRS[kind], `${character.resourceId}.webp`);
  if (!args.refresh && existsSync(file)) return true;
  const bytes = await fetchCdnBytes(characterImagePath(character.resourceId, kind));
  if (bytes === null) return false;
  await writeFile(file, bytes);
  fetched++;
  return true;
});

const missing = jobs
  .filter((_, i) => !found[i])
  .map((j) => `${j.kind} ${j.character.resourceId} ${j.character.name.ja}`);
console.log(`fetched ${fetched} images; ${jobs.length - missing.length} of ${jobs.length} present`);
if (missing.length > 0) console.log(`not on CDN (shown as fallback cards):\n  ${missing.join('\n  ')}`);
