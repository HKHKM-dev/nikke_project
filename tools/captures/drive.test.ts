import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type RequestListener, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drive, isTransientDriveError } from './drive.ts';

describe('Drive の呼び出しの失敗が、待てば直りうるものか', () => {
  it('keeps waiting on network failures, timeouts, 429 and 5xx', () => {
    expect(isTransientDriveError(new TypeError('fetch failed', { cause: new Error('ECONNRESET') }))).toBe(true);
    expect(isTransientDriveError(new TypeError('terminated'))).toBe(true);
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

    it('times out when the headers do not come', async () => {
      pointTo(await serve(tokenThen(() => undefined)));
      const e: unknown = await (await Drive.connect(100)).download('f', outFile()).catch((x: unknown) => x);
      expect((e as Error).name).toBe('TimeoutError');
    });
  });
});
