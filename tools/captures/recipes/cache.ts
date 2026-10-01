// 中間出力のキャッシュ（plan/design-records-automation.md 3.4 節）。録画と同じ置き場所の derived/<録画 id>/ に置き、追跡しない。
// 鍵は、道具の名前と版と、録画のファイルの大きさ（録画の sha256 が台帳にあれば、それも控える）。
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Meta = { video: string; sizeBytes: number; sha256?: string; createdAt: string };

function metaPath(dir: string, key: string): string {
  return join(dir, `${key}.meta.json`);
}

/**
 * key（例: hud-jumps@1）のキャッシュを返す。無いか、録画の大きさが変わっていれば compute で作って保存する。
 * sha256 は台帳の値（先頭 12 桁）を控えるだけで、照合には使わない（全体の計算に時間がかかる）。
 */
export async function derived(
  dir: string,
  key: string,
  video: string,
  sha256: string | undefined,
  compute: () => Promise<string>,
  log: (message: string) => void,
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const dataPath = join(dir, `${key}.tsv`);
  const sizeBytes = statSync(video).size;
  if (existsSync(dataPath) && existsSync(metaPath(dir, key))) {
    const meta = JSON.parse(readFileSync(metaPath(dir, key), 'utf8')) as Meta;
    if (meta.sizeBytes === sizeBytes && (sha256 === undefined || meta.sha256 === undefined || meta.sha256 === sha256)) {
      log(`${key}: キャッシュを使う（${dataPath}）`);
      return readFileSync(dataPath, 'utf8');
    }
    log(`${key}: 録画が変わっているのでキャッシュを作り直す`);
  } else {
    log(`${key}: キャッシュが無いので作る（${dataPath}）`);
  }
  const text = await compute();
  writeFileSync(dataPath, text);
  const meta: Meta = { video, sizeBytes, createdAt: new Date().toISOString(), ...(sha256 ? { sha256 } : {}) };
  writeFileSync(metaPath(dir, key), `${JSON.stringify(meta, null, 2)}\n`);
  return text;
}
