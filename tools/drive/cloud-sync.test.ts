// クラウドの往復（cloud-sync.ts）を、手元に立てた偽の受け口と仮の置き場所で通しで回す。受け口の決まり（衝突は別名・消すのは
// md5 が合うときだけ）は tools/drive/gateway/Code.gs と同じにする。
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');
/** 偽の Drive の nikke_sync（パス → 中身）と、受けた操作の数 */
const drive = new Map<string, Buffer>();
const calls: Record<string, number> = {};
/** true なら、合言葉が違うときと同じく全部断る */
let refuse = false;

type Req = { op: string; prefix?: string; maxBytes?: number; path?: string; content?: string; baseMd5?: string | null };
function answer(req: Req): Record<string, unknown> {
  calls[req.op] = (calls[req.op] ?? 0) + 1;
  if (refuse) return { ok: false, error: '合言葉が違う' };
  const at = req.path === undefined ? undefined : drive.get(req.path);
  if (req.op === 'snapshot')
    return {
      ok: true,
      files: [...drive]
        .filter(([p]) => p.startsWith(`${req.prefix}/`))
        .map(([path, b]) => ({
          path,
          size: b.length,
          modified: '2026-10-30T00:00:00.000Z',
          ...(b.length <= (req.maxBytes ?? 0) ? { md5: md5(b), content: b.toString('base64') } : {}),
        })),
    };
  if (req.op === 'get')
    return at === undefined ? { ok: true, missing: true } : { ok: true, md5: md5(at), content: at.toString('base64') };
  if (req.op === 'put') {
    const b = Buffer.from(req.content!, 'base64');
    if (at !== undefined && md5(at) === md5(b)) return { ok: true, md5: md5(b), path: req.path, unchanged: true };
    if (at !== undefined && md5(at) !== req.baseMd5) {
      const other = req.path!.replace(/(\.[^.]+)$/, '.conflict-cloud$1');
      drive.set(other, b);
      return { ok: true, md5: md5(b), path: other, conflict: true };
    }
    drive.set(req.path!, b);
    return { ok: true, md5: md5(b), path: req.path };
  }
  if (req.op === 'trash') {
    if (at === undefined) return { ok: true, missing: true };
    if (md5(at) !== req.baseMd5) return { ok: true, skipped: 'changed' };
    drive.delete(req.path!);
    return { ok: true };
  }
  return { ok: false, error: `知らない操作: ${req.op}` };
}

let server: Server;
let tmp: string;
let env: NodeJS.ProcessEnv;
const repo = () => join(tmp, 'repo');
const memory = () => join(tmp, 'claude', 'projects', `${join(tmp, 'repo').replace(/[^a-zA-Z0-9]/g, '-')}`, 'memory');
const state = (name: string) => join(tmp, 'home', '.cache', 'nikke-sync', name);
const script = join(import.meta.dirname, 'cloud-sync.ts');
const run = (flag: string) =>
  new Promise<string>((resolve, reject) =>
    execFile(process.execPath, [script, flag], { env }, (err, stdout) => (err ? reject(err) : resolve(stdout))),
  );
const restLog = () => (existsSync(state('pull-rest.log')) ? readFileSync(state('pull-rest.log'), 'utf8') : '');
/** --pull を回し、裏の --pull-rest が終わるまで待つ（ログに 1 行足したら終わり）。--pull の出力と、ログに足した行を返す */
async function pull(): Promise<{ out: string; rest: string }> {
  const lines = restLog().split('\n').length;
  const out = await run('--pull');
  for (let i = 0; i < 100; i++) {
    const log = restLog().split('\n');
    if (log.length > lines) return { out, rest: log.slice(lines - 1).join('\n') };
    await sleep(100);
  }
  throw new Error('--pull-rest が終わらない');
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c: Buffer) => (body += c.toString()));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(answer(JSON.parse(body) as Req)));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  tmp = mkdtempSync(join(tmpdir(), 'cloud-sync-'));
  env = {
    PATH: process.env['PATH'],
    HOME: join(tmp, 'home'),
    CLAUDE_CODE_REMOTE: 'true',
    CLAUDE_PROJECT_DIR: repo(),
    CLAUDE_CONFIG_DIR: join(tmp, 'claude'),
    NIKKE_CAPTURES_DIR: join(tmp, 'captures'),
    NIKKE_DRIVE_GATEWAY_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}/exec`,
  };
  mkdirSync(repo(), { recursive: true });
  drive.set('private/owner.md', Buffer.from('owner\n'));
  drive.set('claude/CLAUDE.md', Buffer.from('# 言語設定\n'));
  drive.set('claude/projects/D--nikke-project/memory/MEMORY.md', Buffer.from('- [a](a.md) — x\n'));
  drive.set('scratch/old.md', Buffer.from('old\n'));
  drive.set('scratch/notes/new.md', Buffer.from('new\n'));
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(tmp, { recursive: true, force: true });
});

describe('drive/cloud-sync', () => {
  it('--pull は private/・メモリ・CLAUDE.md を置き、scratch/ は一覧だけ取って裏の --pull-rest が中身を置く', async () => {
    const { out, rest } = await pull();
    expect(out).toContain('Drive から private/・メモリを 2 件取った');
    expect(out).toContain('scratch/ の 2 件は、裏で新しいものから取っている');
    expect(readFileSync(join(repo(), 'private/owner.md'), 'utf8')).toBe('owner\n');
    expect(readFileSync(join(memory(), 'MEMORY.md'), 'utf8')).toBe('- [a](a.md) — x\n');
    expect(readFileSync(join(tmp, 'claude', 'CLAUDE.md'), 'utf8')).toContain('- [a](a.md) — x');
    expect(rest).toContain('scratch/ を 2 件取った（2 件のうち）');
    expect(readFileSync(join(repo(), 'scratch/notes/new.md'), 'utf8')).toBe('new\n');
    expect(Object.keys(JSON.parse(readFileSync(state('base.json'), 'utf8')).files)).toHaveLength(4);
    expect(existsSync(state('lock'))).toBe(false);
  });

  it('--push は変えた・増やした・消したものだけを戻し、Drive 側も変わっていれば別名で置く', async () => {
    writeFileSync(join(repo(), 'private/owner.md'), 'owner edited\n');
    writeFileSync(join(repo(), 'scratch/made.md'), 'made\n');
    rmSync(join(repo(), 'scratch/old.md'));
    drive.set('scratch/notes/new.md', Buffer.from('changed on desktop\n'));
    writeFileSync(join(repo(), 'scratch/notes/new.md'), 'changed in cloud\n');
    const out = JSON.parse(await run('--push')) as { systemMessage: string };
    expect(out.systemMessage).toContain('Drive に戻した: 3 件、ごみ箱へ: 1 件');
    expect(drive.get('private/owner.md')?.toString()).toBe('owner edited\n');
    expect(drive.get('scratch/made.md')?.toString()).toBe('made\n');
    expect(drive.has('scratch/old.md')).toBe(false);
    expect(drive.get('scratch/notes/new.conflict-cloud.md')?.toString()).toBe('changed in cloud\n');
    // 変わっていなければ何も送らない
    const before = calls['put'];
    expect(await run('--push')).toBe('');
    expect(calls['put']).toBe(before);
  });

  it('次の --pull は、衝突として送った版を Drive の版で上書きし、Drive で消えたものを手元からも消す', async () => {
    drive.delete('scratch/made.md');
    expect((await pull()).rest).toContain('scratch/ を 2 件取った（2 件のうち）');
    expect(readFileSync(join(repo(), 'scratch/notes/new.md'), 'utf8')).toBe('changed on desktop\n');
    expect(readFileSync(join(repo(), 'scratch/notes/new.conflict-cloud.md'), 'utf8')).toBe('changed in cloud\n');
    expect(existsSync(join(repo(), 'scratch/made.md'))).toBe(false);
  });
  it('受け口に断られたら、手元をそのままにして、何を確かめるかを 1 つにまとめて知らせる', async () => {
    const base = readFileSync(state('base.json'), 'utf8');
    refuse = true;
    try {
      const out = await run('--pull');
      expect(out).toContain(
        'private/・scratch/・メモリを取れなかった: 受け口が断った（snapshot）: 合言葉が違う。合言葉',
      );
      expect(out).toContain('確かめ方は plan/cloud-guide.md「困ったとき」');
      expect(out).not.toContain('Drive から private/・メモリを');
      expect(readFileSync(join(repo(), 'private/owner.md'), 'utf8')).toBe('owner edited\n');
      expect(JSON.parse(readFileSync(state('base.json'), 'utf8'))).toEqual(JSON.parse(base));
    } finally {
      refuse = false;
    }
  });
});
