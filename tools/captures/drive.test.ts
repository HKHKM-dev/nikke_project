import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drive, isRateLimitError, isTransientDriveError } from './drive.ts';

describe('Drive の呼び出しの失敗が、待てば直りうるものか', () => {
  it('keeps waiting on network failures, timeouts, 429 and 5xx', () => {
    expect(isTransientDriveError(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }))).toBe(true);
    expect(isTransientDriveError(new TypeError('terminated'))).toBe(true);
    const reset = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    expect(isTransientDriveError(new TypeError('network error', { cause: reset }))).toBe(true);
    expect(isTransientDriveError(new DOMException('The operation timed out.', 'TimeoutError'))).toBe(true);
    expect(isTransientDriveError(Object.assign(new Error('rate'), { status: 429 }))).toBe(true);
    expect(isTransientDriveError(Object.assign(new Error('server'), { status: 503 }))).toBe(true);
  });

  it('stops on other HTTP errors and on errors that are not about the connection', () => {
    expect(isTransientDriveError(Object.assign(new Error('auth'), { status: 401 }))).toBe(false);
    expect(isTransientDriveError(Object.assign(new Error('gone'), { status: 404 }))).toBe(false);
    expect(isTransientDriveError(new SyntaxError('Unexpected end of JSON input'))).toBe(false);
    expect(isTransientDriveError(new TypeError("Cannot read properties of undefined (reading 'size')"))).toBe(false);
    expect(isTransientDriveError(null)).toBe(false);
  });
});

describe('Drive の打ち切り（手元のサーバーをトークンと API の宛先にする）', () => {
  const privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });
  const servers: Server[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    for (const s of servers.splice(0)) s.close().closeAllConnections();
  });

  /** 手元の port を token_uri にした鍵を NIKKE_DRIVE_SA_KEY に入れ、API の宛先も同じ port にする */
  function pointTo(port: number): void {
    const key = {
      client_email: 'test@example.com',
      private_key: privateKey,
      token_uri: `http://127.0.0.1:${port}/token`,
    };
    vi.stubEnv('NIKKE_DRIVE_SA_KEY', JSON.stringify(key));
    vi.stubEnv('NIKKE_DRIVE_API', `http://127.0.0.1:${port}`);
  }
  async function serve(handler: RequestListener = () => undefined): Promise<number> {
    const s = createServer(handler);
    servers.push(s);
    await new Promise<void>((done) => s.listen(0, '127.0.0.1', done));
    return (s.address() as AddressInfo).port;
  }
  /** トークンはすぐ返し、ほかは media で答える */
  const tokenThen =
    (media: (res: ServerResponse) => void) =>
    (req: IncomingMessage, res: ServerResponse): void => {
      if (req.url === '/token') res.end(JSON.stringify({ access_token: 't' }));
      else media(res);
    };

  it('times out a token request that gets no answer, and the timeout counts as transient', async () => {
    pointTo(await serve()); // 応答の頭を返さない
    const e: unknown = await Drive.connect(100).catch((x: unknown) => x);
    expect((e as Error).name).toBe('TimeoutError');
    expect(isTransientDriveError(e)).toBe(true);
  });

  it('treats a refused connection as transient', async () => {
    const closed = createServer();
    await new Promise<void>((done) => closed.listen(0, '127.0.0.1', done));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((done) => closed.close(done));
    pointTo(port);
    const e: unknown = await Drive.connect(1000).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect(isTransientDriveError(e)).toBe(true);
  });

  describe('利用上限の 403 は待って 2 回まで再試行する', () => {
    const rateLimited = JSON.stringify({
      error: { code: 403, errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded' }] },
    });
    /** 初めの fails 回は status と body で答え、その後はファイルのメタデータを返す。呼ばれた回数を数える */
    async function flaky(fails: number, status: number, body: string): Promise<{ calls: () => number }> {
      let calls = 0;
      pointTo(
        await serve(
          tokenThen((res) => {
            calls += 1;
            if (calls <= fails) {
              res.writeHead(status);
              res.end(body);
            } else res.end(JSON.stringify({ id: 'f', name: 'a.mp4', mimeType: 'video/mp4' }));
          }),
        ),
      );
      return { calls: () => calls };
    }

    it('succeeds after two rate-limit errors', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const server = await flaky(2, 403, rateLimited);
      const file = await (await Drive.connect(1000, [1, 1])).file('f');
      expect(file.name).toBe('a.mp4');
      expect(server.calls()).toBe(3);
    });

    it('retries a 429 the same way', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const server = await flaky(1, 429, '');
      expect((await (await Drive.connect(1000, [1, 1])).file('f')).name).toBe('a.mp4');
      expect(server.calls()).toBe(2);
    });

    it('gives up after the second retry', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const server = await flaky(3, 403, rateLimited);
      const e: unknown = await (await Drive.connect(1000, [1, 1])).file('f').catch((x: unknown) => x);
      expect(isRateLimitError(e)).toBe(true);
      expect(server.calls()).toBe(3);
    });

    it('does not retry the daily limit, which waiting does not clear', async () => {
      const server = await flaky(
        1,
        403,
        JSON.stringify({ error: { errors: [{ domain: 'usageLimits', reason: 'dailyLimitExceeded' }] } }),
      );
      const e: unknown = await (await Drive.connect(1000, [1, 1])).file('f').catch((x: unknown) => x);
      expect(isRateLimitError(e)).toBe(false);
      expect(server.calls()).toBe(1);
    });

    it('does not retry other 403s', async () => {
      const server = await flaky(
        1,
        403,
        JSON.stringify({ error: { errors: [{ reason: 'insufficientFilePermissions' }] } }),
      );
      const e: unknown = await (await Drive.connect(1000, [1, 1])).file('f').catch((x: unknown) => x);
      expect((e as { status?: number }).status).toBe(403);
      expect(isRateLimitError(e)).toBe(false);
      expect(server.calls()).toBe(1);
    });
  });

  describe('download は応答の頭が届くまでだけ打ち切る', () => {
    const dirs: string[] = [];
    afterEach(() => {
      for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    });
    const outFile = () => {
      const d = mkdtempSync(join(tmpdir(), 'drive-'));
      dirs.push(d);
      return join(d, 'out.bin');
    };

    it('waits for a body that takes longer than the timeout', async () => {
      pointTo(
        await serve(
          tokenThen((res) => {
            res.write('ab');
            setTimeout(() => res.end('cd'), 300);
          }),
        ),
      );
      const out = outFile();
      await (await Drive.connect(100)).download('f', out);
      expect(readFileSync(out, 'utf8')).toBe('abcd');
    });

    it('times out a failed response whose body stalls', async () => {
      pointTo(
        await serve(
          tokenThen((res) => {
            res.writeHead(500);
            res.write('a');
          }),
        ),
      );
      const e: unknown = await (await Drive.connect(100)).download('f', outFile()).catch((x: unknown) => x);
      expect((e as Error).name).toBe('TimeoutError');
    });

    it('times out when the headers do not come', async () => {
      pointTo(await serve(tokenThen(() => undefined)));
      const e: unknown = await (await Drive.connect(100)).download('f', outFile()).catch((x: unknown) => x);
      expect((e as Error).name).toBe('TimeoutError');
    });
  });
});
