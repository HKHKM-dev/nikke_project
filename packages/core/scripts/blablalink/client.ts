import { cdnUrl } from './path.ts';

export type CdnClientOptions = {
  /** 失敗時の試行回数（既定 3） */
  retries?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 論理パスを難読化して CDN から取得し、read で読む。User-Agent ヘッダは必須。nullOn404 なら 404 は null（再試行しない） */
async function fetchCdn<T>(
  path: string,
  options: CdnClientOptions,
  read: (res: Response) => Promise<T>,
  nullOn404 = false,
): Promise<T | null> {
  const { retries = 3, userAgent = 'Mozilla/5.0', fetchImpl = fetch } = options;
  const url = cdnUrl(path);
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': userAgent } });
      if (res.status === 404 && nullOn404) return null;
      if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status} (${url})`);
      return await read(res);
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(500 * attempt);
    }
  }
  throw lastError;
}

/** 論理パスを難読化して CDN から JSON を取得する。 */
export async function fetchCdnJson<T = unknown>(path: string, options: CdnClientOptions = {}): Promise<T> {
  return (await fetchCdn(path, options, async (res) => (await res.json()) as T)) as T;
}

/** 論理パスを難読化して CDN からバイナリ（画像）を取得する。CDN に無ければ null */
export function fetchCdnBytes(path: string, options: CdnClientOptions = {}): Promise<Uint8Array | null> {
  return fetchCdn(path, options, async (res) => new Uint8Array(await res.arrayBuffer()), true);
}

/** 並列数を制限して items を順に処理する。結果は入力順。 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}
