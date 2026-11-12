// モダン UI のキャラ画像を Blablalink 公開 CDN から取り、data/characters に置く（plan/design-modern-ui.md）。
// - 顔のアイコン（si、128×128）→ data/characters/images/{resourceId}_{コスチューム 2 桁}.webp（トレイ・ドラッグ中の絵）
// - 縦長の絵（mi、256×512）→ data/characters/portraits/{resourceId}_{コスチューム 2 桁}.webp（スロットのカード）
// コスチュームは CDN の番号（00 が初期の絵）。00 から順に取り、CDN に無い番号が MAX_MISSES 続いたら止める
// （plan/design-costume-images.md）。初期の絵が CDN に無ければ、コスチュームも探さない。
// 画面（apps/web の CharacterVisual）はこの場所を読み、無ければ属性の色の札で出す。
// キャラは data/characters/index.json に載っている分。新しいキャラを取り込んだ（fetch-data）後に回す。
//   node scripts/fetch-images.ts [--refresh] [--concurrency N]
// 既にあるファイルは --refresh を付けない限り取り直さない（その次の番号は CDN に聞く）。初期の絵が CDN に無いキャラは一覧に出す。
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { fetchCdnBytes, mapWithConcurrency } from './blablalink/client.ts';
import { characterImagePath, type CharacterImageKind } from './blablalink/path.ts';
import { characterImageFile } from '../src/characterImage.ts';
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

/** CDN に無い番号がこれだけ続いたら止める（番号は飛ぶことがある。2026-11-12 にディーゼルの 03 が無く 04 があった） */
const MAX_MISSES = 3;

let fetched = 0;
/** キャラ × 種類ごとの、置いてある絵の数（初期の絵とコスチューム）と、初期の絵があるか */
const results = await mapWithConcurrency(jobs, Number(args.concurrency), async ({ character, kind }) => {
  let count = 0;
  for (let costume = 0, misses = 0; misses < MAX_MISSES; costume++) {
    const file = path.join(CHARACTERS_DIR, KIND_DIRS[kind], characterImageFile(character.resourceId, costume));
    if (args.refresh || !existsSync(file)) {
      const bytes = await fetchCdnBytes(characterImagePath(character.resourceId, kind, costume));
      if (bytes === null) {
        if (costume === 0) return { count, hasDefault: false };
        misses++;
        continue;
      }
      await writeFile(file, bytes);
      fetched++;
    }
    count++;
    misses = 0;
  }
  return { count, hasDefault: true };
});

const total = results.reduce((a, r) => a + r.count, 0);
const missing = jobs
  .filter((_, i) => !results[i]?.hasDefault)
  .map((j) => `${j.kind} ${j.character.resourceId} ${j.character.name.ja}`);
console.log(
  `fetched ${fetched} images; ${total} present (${jobs.length - missing.length} of ${jobs.length} with the default)`,
);
if (missing.length > 0) console.log(`not on CDN (shown as fallback cards):\n  ${missing.join('\n  ')}`);
