// Apps Script の受け口（tools/drive/gateway/Code.gs）を呼ぶ（plan/design-cloud-environment.md 5 節）。
// 受け口の URL は NIKKE_DRIVE_GATEWAY_URL、合言葉は NIKKE_DRIVE_GATEWAY_KEY。合言葉をネットワークシークレット（Body parameter 型）で
// 付けるときは NIKKE_DRIVE_GATEWAY_KEY を置かない（プロキシが付ける）。応答は script.googleusercontent.com へ転送されて返る。
// 1 回の呼び出しは timeoutMs で打ち切る。打ち切らないと、受け口が答えないときに Node の fetch が応答の頭を 5 分待ち、フック（2 分で
// 打ち切られる）は何も知らせられない。失敗の知らせには、何を確かめるかを添える（plan/cloud-guide.md「困ったとき」）。
// 一覧（snapshot）は中身を付けずに取る。受け口は中身を 1 件ずつ読むのが遅く、件数の多いフォルダを中身ごと頼むと 1 回の実行で終わらない。

export type GatewayRoot = 'sync' | 'captures' | 'record';
export type SnapshotFile = { path: string; size: number; modified: string };

/** 1 回の呼び出しを打ち切るまでの既定（ミリ秒）。受け口の 1 回の実行は 6 分までだが、ふだんの操作は数秒で終わる */
const GATEWAY_TIMEOUT_MS = 120_000;

export function gatewayUrl(): string | null {
  return process.env['NIKKE_DRIVE_GATEWAY_URL'] || null;
}

/** 受け口に届かなかったか、時間内に答えが来なかったときの知らせ */
export function unreachableMessage(op: string, e: unknown, timeoutMs: number): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  if (err.name === 'TimeoutError')
    return (
      `受け口が ${Math.round(timeoutMs / 1000)} 秒たっても答えなかった（${op}）。` +
      '受け口が動いているかは、デスクトップで npm run drive:gateway-check'
    );
  const why = err.cause?.code ?? err.cause?.message ?? err.message ?? String(e);
  return (
    `受け口に届かなかった（${op}: ${why}）。` +
    '受け口の URL（NIKKE_DRIVE_GATEWAY_URL）と、通信の許可（script.google.com・script.googleusercontent.com）を確かめる'
  );
}

/** 受け口の応答を読む。JSON でない・断られたときは、何を確かめるかを添えて投げる */
export function parseAnswer<T>(op: string, status: number, text: string): T & { ok: true } {
  let json: { ok?: boolean; error?: string };
  try {
    json = JSON.parse(text) as { ok?: boolean; error?: string };
  } catch {
    throw new Error(
      `受け口の応答が JSON でない（${op}、HTTP ${status}）: ${text.slice(0, 200)}。` +
        '受け口の URL（NIKKE_DRIVE_GATEWAY_URL）と、公開の設定（アクセスできるユーザー: 全員）を確かめる',
    );
  }
  if (json.ok === true) return json as T & { ok: true };
  const hint =
    json.error === '合言葉が違う'
      ? '。合言葉（NIKKE_DRIVE_GATEWAY_KEY）が受け口のスクリプト プロパティの KEY と同じか確かめる'
      : '';
  throw new Error(`受け口が断った（${op}）: ${json.error ?? '理由なし'}${hint}`);
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
    throw new Error(unreachableMessage(op, e, timeoutMs), { cause: e });
  }
  return parseAnswer<T>(op, status, text);
}

/** 根の下の prefix の一覧（相対パス・大きさ・更新時刻。中身は付けない） */
export const snapshot = (root: GatewayRoot, prefix: string, timeoutMs?: number) =>
  gateway<{ files: SnapshotFile[] }>('snapshot', { root, prefix, maxBytes: 0 }, timeoutMs);

/** 1 ファイルの中身と md5。無ければ null */
export async function get(root: GatewayRoot, path: string, timeoutMs?: number) {
  const r = await gateway<{ md5?: string; content?: string }>('get', { root, path }, timeoutMs);
  return r.md5 === undefined || r.content === undefined ? null : { md5: r.md5, buf: Buffer.from(r.content, 'base64') };
}

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
