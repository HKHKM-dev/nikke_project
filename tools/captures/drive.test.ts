import { generateKeyPairSync } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
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

describe('Drive.connect の打ち切り（手元のサーバーをトークンの宛先にする）', () => {
  const servers: Server[] = [];
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const s of servers.splice(0)) s.close().closeAllConnections();
  });

  /** 手元の port を token_uri にした鍵を NIKKE_DRIVE_SA_KEY に入れる（鍵はその場で作る） */
  function keyTo(port: number): void {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const key = { client_email: 'test@example.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
    vi.stubEnv('NIKKE_DRIVE_SA_KEY', JSON.stringify({ ...key, token_uri: `http://127.0.0.1:${port}/token` }));
  }
  const listen = (s: Server) =>
    new Promise<number>((done) => s.listen(0, '127.0.0.1', () => done((s.address() as AddressInfo).port)));

  it('times out a token request that gets no answer, and the timeout counts as transient', async () => {
    const silent = createServer(() => undefined); // 応答の頭を返さない
    servers.push(silent);
    keyTo(await listen(silent));
    const e: unknown = await Drive.connect(100).catch((x: unknown) => x);
    expect((e as Error).name).toBe('TimeoutError');
    expect(isTransientDriveError(e)).toBe(true);
  });

  it('treats a refused connection as transient', async () => {
    const closed = createServer();
    const port = await listen(closed);
    await new Promise((done) => closed.close(done));
    keyTo(port);
    const e: unknown = await Drive.connect(1000).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(TypeError);
    expect(isTransientDriveError(e)).toBe(true);
  });
});
