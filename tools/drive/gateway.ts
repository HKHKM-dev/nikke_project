// Apps Script の受け口（tools/drive/gateway/Code.gs）を呼ぶ（plan/design-cloud-environment.md 5 節）。
// 受け口の URL は NIKKE_DRIVE_GATEWAY_URL、合言葉は NIKKE_DRIVE_GATEWAY_KEY。合言葉をネットワークシークレット（Body parameter 型）で
// 付けるときは NIKKE_DRIVE_GATEWAY_KEY を置かない（プロキシが付ける）。応答は script.googleusercontent.com へ転送されて返る。

export type GatewayRoot = 'sync' | 'captures' | 'record';
export type SnapshotFile = { path: string; size: number; modified: string; md5?: string; content?: string };

export function gatewayUrl(): string | null {
  return process.env['NIKKE_DRIVE_GATEWAY_URL'] || null;
}

export async function gateway<T extends Record<string, unknown>>(
  op: string,
  body: Record<string, unknown>,
): Promise<T & { ok: true }> {
  const url = gatewayUrl();
  if (url === null) throw new Error('NIKKE_DRIVE_GATEWAY_URL が無い');
  const key = process.env['NIKKE_DRIVE_GATEWAY_KEY'];
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ ...(key ? { key } : {}), op, ...body }),
    redirect: 'follow',
  });
  const text = await res.text();
  let json: { ok?: boolean; error?: string };
  try {
    json = JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    throw new Error(`受け口の応答が JSON でない（HTTP ${res.status}）: ${text.slice(0, 200)}`);
  }
  if (json.ok !== true) throw new Error(`受け口が断った（${op}）: ${json.error ?? '理由なし'}`);
  return json as T & { ok: true };
}

export const snapshot = (root: GatewayRoot, prefix: string, maxBytes: number) =>
  gateway<{ files: SnapshotFile[] }>('snapshot', { root, prefix, maxBytes });

export const put = (root: GatewayRoot, path: string, content: Buffer, baseMd5: string | null) =>
  gateway<{ md5: string; path: string; conflict?: boolean; unchanged?: boolean }>('put', {
    root,
    path,
    content: content.toString('base64'),
    baseMd5,
  });

export const trash = (root: GatewayRoot, path: string, baseMd5: string) =>
  gateway<{ missing?: boolean; skipped?: string }>('trash', { root, path, baseMd5 });

export const move = (root: GatewayRoot, from: string, to: string) =>
  gateway<{ how: string; note?: string }>('move', { root, from, toRoot: 'captures', to });
