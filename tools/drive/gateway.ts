// Apps Script の受け口（tools/drive/gateway/Code.gs）を呼ぶ（plan/design-cloud-environment.md 5 節）。
// 受け口の URL は NIKKE_DRIVE_GATEWAY_URL、合言葉は NIKKE_DRIVE_GATEWAY_KEY。合言葉をネットワークシークレット（Body parameter 型）で
// 付けるときは NIKKE_DRIVE_GATEWAY_KEY を置かない（プロキシが付ける）。応答は script.googleusercontent.com へ転送されて返る。
// 1 回の呼び出しは timeoutMs で打ち切る。打ち切らないと、受け口が答えないときに Node の fetch が応答の頭を 5 分待ち、フック（2 分で
// 打ち切られる）は何も知らせられない。失敗の知らせには、何を確かめるかを添える（plan/cloud-guide.md「困ったとき」）。

export type GatewayRoot = 'sync' | 'captures' | 'record';
export type SnapshotFile = { path: string; size: number; modified: string; md5?: string; content?: string };

/** 1 回の呼び出しを打ち切るまでの既定（ミリ秒）。受け口の 1 回の実行は 6 分までだが、ふだんの操作は数秒で終わる */
const GATEWAY_TIMEOUT_MS = 120_000;

export function gatewayUrl(): string | null {
  return process.env['NIKKE_DRIVE_GATEWAY_URL'] || null;
}

/** 受け口に届かなかったか、時間内に答えが来なかったときの知らせ */
export function unreachableMessage(op: string, e: unknown, elapsedMs: number): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err.name === 'TimeoutError')
    return (
      `受け口が ${Math.round(elapsedMs / 1000)} 秒たっても答えなかった（${op}）。` +
      '受け口（Apps Script）はファイルの中身を 1 件あたり約 1 秒で読み、1 回の実行は 6 分まで。' +
      '受け口が動いているかは、デスクトップで npm run drive:gateway-check'
    );
  const why = err.cause?.code ?? err.cause?.message ?? err.message ?? String(e);
  return (
    `受け口に届かなかった（${op}: ${why}）。` +
    '受け口の URL（NIKKE_DRIVE_GATEWAY_URL）と、通信の許可（script.google.com・script.googleusercontent.com）を確かめる'
  );
}

/** 受け口が JSON 以外を返した・断ったときの知らせ */
export function answerMessage(op: string, status: number, text: string): string | null {
  let json: { ok?: boolean; error?: string };
  try {
    json = JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    return (
      `受け口の応答が JSON でない（${op}、HTTP ${status}）: ${text.slice(0, 200)}。` +
      '受け口の URL（NIKKE_DRIVE_GATEWAY_URL）と、公開の設定（アクセスできるユーザー: 全員）を確かめる'
    );
  }
  if (json.ok === true) return null;
  const hint =
    json.error === '合言葉が違う'
      ? '。合言葉（NIKKE_DRIVE_GATEWAY_KEY）が受け口のスクリプト プロパティの KEY と同じか確かめる'
      : '';
  return `受け口が断った（${op}）: ${json.error ?? '理由なし'}${hint}`;
}

export async function gateway<T extends Record<string, unknown>>(
  op: string,
  body: Record<string, unknown>,
  timeoutMs = GATEWAY_TIMEOUT_MS,
): Promise<T & { ok: true }> {
  const url = gatewayUrl();
  if (url === null) throw new Error('NIKKE_DRIVE_GATEWAY_URL が無い');
  if (timeoutMs <= 0) throw new Error(`時間切れで受け口を呼ばなかった（${op}）`);
  const key = process.env['NIKKE_DRIVE_GATEWAY_KEY'];
  const started = Date.now();
  let status: number;
  let text: string;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ ...(key ? { key } : {}), op, ...body }),
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    text = await res.text();
  } catch (e) {
    throw new Error(unreachableMessage(op, e, Date.now() - started), { cause: e });
  }
  const failed = answerMessage(op, status, text);
  if (failed !== null) throw new Error(failed);
  return JSON.parse(text) as T & { ok: true };
}

export const snapshot = (root: GatewayRoot, prefix: string, maxBytes: number, timeoutMs?: number) =>
  gateway<{ files: SnapshotFile[] }>('snapshot', { root, prefix, maxBytes }, timeoutMs);

export const get = (root: GatewayRoot, path: string, timeoutMs?: number) =>
  gateway<{ missing?: boolean; md5?: string; content?: string }>('get', { root, path }, timeoutMs);

export const put = (root: GatewayRoot, path: string, content: Buffer, baseMd5: string | null, timeoutMs?: number) =>
  gateway<{ md5: string; path: string; conflict?: boolean; unchanged?: boolean }>(
    'put',
    { root, path, content: content.toString('base64'), baseMd5 },
    timeoutMs,
  );

export const trash = (root: GatewayRoot, path: string, baseMd5: string, timeoutMs?: number) =>
  gateway<{ missing?: boolean; skipped?: string }>('trash', { root, path, baseMd5 }, timeoutMs);

export const move = (root: GatewayRoot, from: string, to: string) =>
  gateway<{ how: string; note?: string }>('move', { root, from, toRoot: 'captures', to });
