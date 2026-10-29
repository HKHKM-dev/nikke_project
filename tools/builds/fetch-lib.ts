// ShiftyPad からの取得の純関数（plan/design-build-snapshot.md 2.2 節・14 節）。fetch.ts から使う。
// ブラウザやファイルには触れない。

/** ページ自身が送る API の宛先。ここ宛ての、body に intl_open_id があるリクエストからヘッダを拾う */
export const API_BASE = 'https://api.blablalink.com/api/game/proxy/';

/** 呼ぶのは読み取りの 3 つだけ（plan/design-build-snapshot.md 1 節） */
export const API_PATHS = {
  characters: 'Game/GetUserCharacters',
  details: 'Game/GetUserCharacterDetails',
  outpost: 'Game/GetUserProfileOutpostInfo',
} as const;

/** GetUserCharacterDetails に 1 回で渡す name_code の数 */
export const DETAILS_CHUNK = 20;

/** 写さないヘッダ（ブラウザが付けるもの。cookie は値を見ないためにも除く） */
const DROP_HEADERS = /^(content-length|host|cookie)$/i;

/** API を呼ぶ body のアカウントの欄 */
export type ApiAccount = { intl_open_id: string; nikke_area_id: unknown };

/** 拾ったリクエストのヘッダとアカウントの欄（処理の間だけメモリに置き、書き出さない） */
export type Captured = { headers: Record<string, string>; account: ApiAccount };

/** ヘッダから content-length・host・cookie を除く（名前は小文字にする） */
export function pickHeaders(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (!DROP_HEADERS.test(k)) out[k.toLowerCase()] = v;
  return out;
}

/** ページが送ったリクエストが API 宛てで、body に intl_open_id があれば、そのヘッダとアカウントの欄を返す */
export function captureRequest(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: string | null,
): Captured | null {
  if (!url.startsWith(API_BASE) || body === null) return null;
  let b: unknown;
  try {
    b = JSON.parse(body);
  } catch {
    return null;
  }
  if (b === null || typeof b !== 'object') return null;
  const { intl_open_id, nikke_area_id } = b as Record<string, unknown>;
  if (typeof intl_open_id !== 'string' || intl_open_id === '') return null;
  return { headers: pickHeaders(headers), account: { intl_open_id, nikke_area_id } };
}

/** API の応答の JSON。code が 0 でなければ失敗にし、data があればそれを返す */
export function unwrapResponse(path: string, json: unknown): unknown {
  if (json === null || typeof json !== 'object') throw new Error(`${path}: 応答が JSON のオブジェクトでない`);
  const { code, msg, data } = json as Record<string, unknown>;
  if (code !== 0) throw new Error(`${path}: code ${String(code)} ${typeof msg === 'string' ? msg : ''}`.trimEnd());
  return data ?? json;
}

/** 条件に合う最初の値を深さ優先で探す（応答の入れ子の形に頼らないため） */
export function findDeep(value: unknown, pred: (v: unknown) => boolean): unknown {
  if (pred(value)) return value;
  if (value !== null && typeof value === 'object')
    for (const v of Object.values(value)) {
      const f = findDeep(v, pred);
      if (f !== undefined) return f;
    }
  return undefined;
}

/** 先頭の要素が key を持つ、空でない配列 */
const arrayOf =
  (key: string) =>
  (v: unknown): boolean =>
    Array.isArray(v) && v.length > 0 && v[0] !== null && typeof v[0] === 'object' && key in v[0];

const preview = (v: unknown): string => JSON.stringify(v).slice(0, 300);

/** GetUserCharacters の応答からキャラの配列（name_code を持つもの）を出す */
export function charactersOf(data: unknown): Record<string, unknown>[] {
  const found = findDeep(data, arrayOf('name_code'));
  if (found === undefined) throw new Error(`${API_PATHS.characters} の応答にキャラの配列が無い: ${preview(data)}`);
  return found as Record<string, unknown>[];
}

/** GetUserCharacterDetails の応答から、詳細の配列（head_equip_tid を持つもの）と state_effects を出す */
export function detailsOf(data: unknown): { details: unknown[]; stateEffects: unknown[] } {
  const details = (findDeep(data, arrayOf('head_equip_tid')) as unknown[] | undefined) ?? [];
  const own = data !== null && typeof data === 'object' ? (data as Record<string, unknown>).state_effects : undefined;
  const stateEffects = Array.isArray(own)
    ? own
    : ((findDeep(data, arrayOf('function_details')) as unknown[] | undefined) ?? []);
  return { details, stateEffects };
}

/** GetUserProfileOutpostInfo の応答から、synchro_level を持つオブジェクトを出す */
export function outpostOf(data: unknown): Record<string, unknown> {
  const found = findDeep(data, (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && 'synchro_level' in v);
  if (found === undefined) throw new Error(`${API_PATHS.outpost} の応答に synchro_level が無い: ${preview(data)}`);
  return found as Record<string, unknown>;
}

/** 中身の同じものを除く（20 体ずつ取ると、同じ state_effects が何度も返る） */
export function dedupe<T>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const k = JSON.stringify(v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** n 個ずつに分ける */
export function chunks<T>(values: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < values.length; i += n) out.push(values.slice(i, i + n));
  return out;
}
