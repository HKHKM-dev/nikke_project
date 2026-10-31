// 育成データの置き場所（plan/design-build-snapshot.md 5 節）。store.ts・fetch.ts・tools/captures/intake.ts から使う。
// private/ はメインのチェックアウトの直下にだけある（追跡しない。クラウドでは始めのフックがリポジトリの直下に置く）。
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SNAPSHOT_NAME } from '../../packages/core/src/records/ids.ts';
import type { BuildSnapshot } from '../../packages/core/src/shiftypad.ts';
import { mainCheckout } from '../git/main-checkout.ts';

let privateCache: string | undefined;
/** private/ のパス（git に聞くのは初めの 1 回だけ） */
export const privateDir = (): string => (privateCache ??= join(mainCheckout(), 'private'));
export const buildsDir = (): string => join(privateDir(), 'builds');

/** private/builds/<名前><suffix> の名前（名前の形のものだけ）。private/builds/ が無ければ null */
export function namesIn(suffix: string): string[] | null {
  const dir = buildsDir();
  if (!existsSync(dir)) return null;
  return readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .filter((n) => SNAPSHOT_NAME.test(n));
}

/** 写したスナップショット（private/builds/<名前>.json）の名前。private/builds/ が無ければ null */
export const snapshotNames = (): string[] | null => namesIn('.json');

/** 写したスナップショット（private/builds/<名前>.json）。無ければ null */
export function readSnapshot(name: string): BuildSnapshot | null {
  const path = join(buildsDir(), `${name}.json`);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as BuildSnapshot) : null;
}
