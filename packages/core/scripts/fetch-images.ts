// モダン UI のキャラ画像（顔のアイコン、128×128）を Blablalink 公開 CDN から取り、data/characters/images/{resourceId}.webp に置く
// （plan/design-modern-ui.md）。画面（apps/web の CharacterVisual）はこの場所を読み、無ければ属性の色の札で出す。
// キャラは data/characters/index.json に載っている分。新しいキャラを取り込んだ（fetch-data）後に回す。
//   node scripts/fetch-images.ts [--refresh] [--concurrency N]
// 既にあるファイルは --refresh を付けない限り取り直さない。CDN に無い画像（404）は飛ばして一覧に出す。
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchCdnBytes, mapWithConcurrency } from './blablalink/client.ts';
import { characterIconPath } from './blablalink/path.ts';
import type { CharacterIndex } from '../src/types.ts';

const CHARACTERS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'characters');
const IMAGES_DIR = path.join(CHARACTERS_DIR, 'images');

const { values: args } = parseArgs({
  options: {
    refresh: { type: 'boolean', default: false },
    concurrency: { type: 'string', default: '6' },
  },
});

const index = JSON.parse(await readFile(path.join(CHARACTERS_DIR, 'index.json'), 'utf8')) as CharacterIndex;
await mkdir(IMAGES_DIR, { recursive: true });

let fetched = 0;
const found = await mapWithConcurrency(index.characters, Number(args.concurrency), async (c) => {
  const file = path.join(IMAGES_DIR, `${c.resourceId}.webp`);
  if (!args.refresh && existsSync(file)) return true;
  const bytes = await fetchCdnBytes(characterIconPath(c.resourceId));
  if (bytes === null) return false;
  await writeFile(file, bytes);
  fetched++;
  return true;
});

const missing = index.characters.filter((_, i) => !found[i]).map((c) => `${c.resourceId} ${c.name.ja}`);
console.log(
  `fetched ${fetched} images; ${index.characters.length - missing.length} of ${index.characters.length} present`,
);
if (missing.length > 0) console.log(`not on CDN (shown as fallback cards):\n  ${missing.join('\n  ')}`);
