// 受け口の呼び方（gateway.ts）。本物の受け口の代わりに手元の HTTP サーバーを立て、転送・打ち切り・知らせを確かめる。
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { gateway, get, parseAnswer, unreachableMessage } from './gateway.ts';

// 受け口の真似: /exec への POST は本文の op で振る舞いを変える。ok と get は /echo へ転送し（Apps Script と同じ 302）、そこで JSON を返す
let server: Server;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      if (req.url?.startsWith('/echo')) {
        const answer = req.url.includes('get')
          ? { ok: true, md5: 'm', content: Buffer.from('中身').toString('base64') }
          : { ok: true, files: [] };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
        return;
      }
      const { op, path } = JSON.parse(body) as { op: string; path?: string };
      const json = (answer: unknown) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(answer));
      };
      if (op === 'ok' || (op === 'get' && path === 'here')) {
        res.writeHead(302, { location: `${base}/echo?${op}` });
        res.end();
      } else if (op === 'get') json({ ok: true, missing: true });
      else if (op === 'html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>Sign in</html>');
      } else if (op === 'key') json({ ok: false, error: '合言葉が違う' });
      // hang: 答えない（打ち切られるまで待たせる）
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.stubEnv('NIKKE_DRIVE_GATEWAY_URL', `${base}/exec`);
  vi.stubEnv('NIKKE_DRIVE_GATEWAY_KEY', undefined);
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

describe('drive/gateway', () => {
  it('転送に従って JSON を受け取る', async () => {
    await expect(gateway('ok', {})).resolves.toEqual({ ok: true, files: [] });
  });

  it('get は中身を戻して返し、無ければ null', async () => {
    const r = await get('sync', 'here');
    expect(r?.md5).toBe('m');
    expect(r?.buf.toString()).toBe('中身');
    await expect(get('sync', 'gone')).resolves.toBeNull();
  });

  it('答えが来なければ timeoutMs で打ち切り、確かめ方を知らせる', async () => {
    const started = Date.now();
    const err = await gateway('hang', {}, 1_200).catch((e: Error) => e);
    expect(Date.now() - started).toBeLessThan(5000);
    expect((err as Error).message).toBe(
      '受け口が 1 秒たっても答えなかった（hang）。受け口が動いているかは、デスクトップで npm run drive:gateway-check',
    );
  });

  it('時間が残っていなければ呼ばない', async () => {
    await expect(gateway('ok', {}, 0)).rejects.toThrow('時間切れで受け口を呼ばなかった（ok）');
  });

  it('JSON でない応答（ログインの画面など）は、URL と公開の設定を確かめさせる', async () => {
    await expect(gateway('html', {})).rejects.toThrow(/JSON でない（html、HTTP 200）.*公開の設定/);
  });

  it('合言葉で断られたら、合言葉を確かめさせる', async () => {
    await expect(gateway('key', {})).rejects.toThrow(
      /受け口が断った（key）: 合言葉が違う。合言葉（NIKKE_DRIVE_GATEWAY_KEY）/,
    );
  });

  it('届かないときは原因の符号と、URL・通信の許可を出す', () => {
    const e = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
    expect(unreachableMessage('snapshot', e, 10)).toMatch(/^受け口に届かなかった（snapshot: ENOTFOUND）。.*通信の許可/);
    expect(unreachableMessage('get', new TypeError('fetch failed'), 10)).toContain('（get: fetch failed）');
  });

  it('断る理由が合言葉でなければ、確かめ方は足さない', () => {
    expect(() => parseAnswer('put', 200, JSON.stringify({ ok: false, error: 'ここには書けない: x' }))).toThrow(
      /^受け口が断った（put）: ここには書けない: x$/,
    );
    expect(parseAnswer('put', 200, JSON.stringify({ ok: true, md5: 'm' }))).toEqual({ ok: true, md5: 'm' });
  });
});
