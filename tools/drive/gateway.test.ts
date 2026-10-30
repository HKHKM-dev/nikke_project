// 受け口の呼び方（gateway.ts）。本物の受け口の代わりに手元の HTTP サーバーを立て、転送・打ち切り・知らせを確かめる。
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { answerMessage, gateway, unreachableMessage } from './gateway.ts';

// 受け口の真似: /exec への POST は本文の op で振る舞いを変える。ok は /echo へ転送し（Apps Script と同じ 302）、そこで JSON を返す
let server: Server;
let base: string;
const saved = { url: process.env['NIKKE_DRIVE_GATEWAY_URL'], key: process.env['NIKKE_DRIVE_GATEWAY_KEY'] };
const restore = (name: string, value: string | undefined) =>
  value === undefined ? delete process.env[name] : (process.env[name] = value);

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      if (req.url?.startsWith('/echo')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, files: [] }));
        return;
      }
      const op = (JSON.parse(body) as { op: string }).op;
      if (op === 'ok') {
        res.writeHead(302, { location: `${base}/echo` });
        res.end();
      } else if (op === 'html') {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<html>Sign in</html>');
      } else if (op === 'key') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: '合言葉が違う' }));
      }
      // hang: 答えない（打ち切られるまで待たせる）
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env['NIKKE_DRIVE_GATEWAY_URL'] = `${base}/exec`;
  delete process.env['NIKKE_DRIVE_GATEWAY_KEY'];
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  restore('NIKKE_DRIVE_GATEWAY_URL', saved.url);
  restore('NIKKE_DRIVE_GATEWAY_KEY', saved.key);
});

describe('drive/gateway', () => {
  it('転送に従って JSON を受け取る', async () => {
    await expect(gateway('ok', {})).resolves.toEqual({ ok: true, files: [] });
  });

  it('答えが来なければ timeoutMs で打ち切り、受け口の遅さと確かめ方を知らせる', async () => {
    const started = Date.now();
    const err = await gateway('hang', {}, 300).catch((e: Error) => e);
    expect(Date.now() - started).toBeLessThan(5000);
    expect((err as Error).message).toMatch(/^受け口が 0 秒たっても答えなかった（hang）/);
    expect((err as Error).message).toContain('npm run drive:gateway-check');
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
    expect(answerMessage('put', 200, JSON.stringify({ ok: false, error: 'ここには書けない: x' }))).toBe(
      '受け口が断った（put）: ここには書けない: x',
    );
    expect(answerMessage('put', 200, JSON.stringify({ ok: true }))).toBeNull();
  });
});
