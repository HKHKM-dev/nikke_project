// Blablalink 公開 CDN のパス難読化。
// 仕様: 先頭 "/" を除いたフルパスを "/" で分割し、最後以外のセグメントは
// "<2文字>-<2桁>"（フルパスの djb2 ハッシュ、セグメント位置ごとの素数でソルト）、
// 最後のセグメントは "<md5(フルパス)>.<元の拡張子>" に置き換える。
import { createHash } from 'node:crypto';

export const CDN_BASE_URL = 'https://sg-tools-cdn.blablalink.com';

const SEGMENT_PRIMES = [224737, 1000639, 2654435761, 2654435769, 1000621, 4294967291] as const;

/** djb2 風ローリングハッシュ。各ステップで符号付き int32 に切り詰める。 */
export function djb2Int32(text: string, seed: number): number {
  let acc = seed;
  for (let i = 0; i < text.length; i++) {
    acc = (acc * 33 + text.charCodeAt(i)) | 0;
  }
  return acc;
}

function normalizedHash(text: string, prime: number): number {
  const h = djb2Int32(text, prime);
  return ((h % prime) + prime) % prime;
}

function twoLetters(text: string, prime: number): string {
  const r = normalizedHash(text, prime);
  return String.fromCharCode(97 + (Math.floor(r / 26) % 26), 97 + (r % 26));
}

function twoDigits(text: string, prime: number): string {
  const r = normalizedHash(text, prime) % 99;
  return String(r).padStart(2, '0');
}

function md5Hex(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

/** 論理パス（例 "/roledata/90-v2-ja.json"）を難読化済みの相対パスに変換する。 */
export function obfuscatePath(path: string): string {
  const full = path.replace(/^\/+/, '');
  const segments = full.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) throw new Error(`empty path: ${JSON.stringify(path)}`);
  return segments
    .map((segment, i) => {
      if (i < segments.length - 1) {
        const prime = SEGMENT_PRIMES[i];
        if (prime === undefined) throw new Error(`path too deep for obfuscation: ${path}`);
        return `${twoLetters(full, prime)}-${twoDigits(full, prime)}`;
      }
      const extension = segment.split('.').slice(1).join('.');
      return `${md5Hex(full)}.${extension}`;
    })
    .join('/');
}

export function cdnUrl(path: string): string {
  return `${CDN_BASE_URL}/${obfuscatePath(path)}`;
}

export type CdnLocale = 'ja' | 'en';

export function nikkeListPath(locale: CdnLocale): string {
  return `/character/${locale}/nikke_list_${locale}_v2.json`;
}

export function roleDataPath(resourceId: number, locale: CdnLocale): string {
  return `/roledata/${resourceId}-v2-${locale}.json`;
}

/** Stage 9: 宝物 ID の一覧（レア度ごと） */
export function favoriteRareMapPath(): string {
  return '/equip/favorite_rare_map.json';
}

/** Stage 9: 宝物 1 個分。SSR だけが宝物版のスキル（favoriteitem_skill_group_data）を持つ */
export function favoritePath(favoriteId: number, locale: CdnLocale): string {
  return `/equip/${locale}/favorite_${favoriteId}.json`;
}

// ---- Stage 12: 育成のマスタ ----

/** 装備マスタ（ティア・クラス・部位ごとの Lv0 のステータス。強化 Lv 別の値は無い） */
export function itemEquipTablePath(locale: CdnLocale): string {
  return `/equip/ItemEquipTable-${locale}.json`;
}

/** 好感度（rank 1〜40 のクラス別加算） */
export function attractiveLevelTablePath(): string {
  return '/character/AttractiveLevelTable.json';
}

/** リサイクルルーム研究（1 Lv あたりの加算） */
export function recycleResearchStatTablePath(): string {
  return '/character/RecycleResearchStatTable.json';
}

/** キューブ（ID は 1000301 から連番） */
export function cubePath(cubeId: number, locale: CdnLocale): string {
  return `/equip/${locale}/cube_${cubeId}.json`;
}

// ---- Stage 13: 効果層 ----

/** OL 装備のオプション（名前と state_effect の ID だけ。Lv 別の数値は CDN に無い） */
export function equipOptionTablePath(locale: CdnLocale): string {
  return `/equip/equip_option_table_v2-${locale}.json`;
}
