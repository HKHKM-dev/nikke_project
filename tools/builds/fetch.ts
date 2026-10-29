// ShiftyPad（Blablalink）からオーナーの育成データを取り、npm run build:import と同じ取り込みを通す
// （plan/design-build-snapshot.md 2.2 節・14 節。案 A）。デスクトップで、オーナーのもとで回す。
//   npm run build:fetch
// 1. インストール済みの Chrome を、リポジトリの外の専用のユーザーデータのフォルダで画面ありで開く
//    （フォルダのパスは private/build-fetch.json の userDataDir。無ければ既定のパスで作る）
// 2. ログインの画面なら、オーナーがその窓でログインし終わるまで待つ（ツールは入力に触れない）
// 3. ページ自身が送る API のリクエストから、ヘッダ（content-length・host・cookie を除く）とアカウントの欄を拾う
// 4. ページの文脈で読み取りの 3 つの API を呼び、応答を Node 側へ返す（page.evaluate の戻り値。ページの CSP のため、
//    ダウンロードやクリップボードは使わない）
// 5. アカウントの欄を除いて取り込む（store.ts）
// パスワード・トークン・Cookie は読まない・書き出さない。拾ったヘッダは処理の間だけメモリに置く。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { chromium, type BrowserContext, type Page, type Request } from 'playwright-core';
import type { ShiftyPadRaw } from '../../packages/core/src/shiftypad.ts';
import {
  API_BASE,
  API_PATHS,
  charactersOf,
  chunks,
  dedupe,
  DETAILS_CHUNK,
  detailsOf,
  outpostOf,
  unwrapResponse,
  captureRequest,
  type Captured,
} from './fetch-lib.ts';
import { privateDir } from './dirs.ts';
import { importRaw } from './store.ts';

const ROOT = join(import.meta.dirname, '../..');
const URL = 'https://www.blablalink.com/shiftyspad';
const PRIVATE = privateDir();
const CONFIG = join(PRIVATE, 'build-fetch.json');
/** 拾えるまで待つ長さ（ログインを含む） */
const WAIT_MS = 15 * 60e3;
/** これだけ待っても拾えなければ、ニケを 1 体開くよう案内する */
const HINT_MS = 20e3;

const log = (s: string): void => console.log(`[build:fetch] ${s}`);

/** 専用のユーザーデータのフォルダ（private/build-fetch.json。無ければ既定のパスで作る） */
function userDataDir(): string {
  if (!existsSync(CONFIG)) {
    mkdirSync(PRIVATE, { recursive: true });
    const dir = join(homedir(), '.nikke-shiftypad-chrome');
    writeFileSync(CONFIG, `${JSON.stringify({ userDataDir: dir }, null, 2)}\n`);
    log(`${CONFIG} を作った（userDataDir: ${dir}）`);
  }
  const dir = (JSON.parse(readFileSync(CONFIG, 'utf8')) as { userDataDir?: unknown }).userDataDir;
  if (typeof dir !== 'string' || !isAbsolute(dir)) throw new Error(`${CONFIG} の userDataDir が絶対パスでない`);
  const rel = relative(resolve(ROOT), resolve(dir));
  if (!rel.startsWith('..') && !isAbsolute(rel)) throw new Error(`userDataDir がリポジトリの中にある: ${dir}`);
  return dir;
}

/** ページ自身が送る API のリクエストを待ち、ヘッダとアカウントの欄・送ったページを得る */
function waitForCapture(context: BrowserContext): Promise<{ captured: Captured; page: Page }> {
  return new Promise((done, fail) => {
    const onRequest = (req: Request): void => {
      if (req.method() !== 'POST') return;
      // headers() は cookie などの security に関わるヘッダを返さない（allHeaders() は使わない）
      const captured = captureRequest(req.url(), req.headers(), req.postData());
      if (captured === null) return;
      let page: Page;
      try {
        page = req.frame().page();
      } catch {
        return; // Service Worker のリクエスト
      }
      finish();
      done({ captured, page });
    };
    const onClose = (): void => {
      finish();
      fail(new Error('拾う前にブラウザが閉じられた'));
    };
    const hint = setTimeout(
      () => log('まだ拾えていない。ログインし終わっていれば、ShiftyPad でニケを 1 体開いてください'),
      HINT_MS,
    );
    const timeout = setTimeout(() => {
      finish();
      fail(new Error(`${WAIT_MS / 60e3} 分待っても、API のリクエストを拾えなかった`));
    }, WAIT_MS);
    function finish(): void {
      clearTimeout(hint);
      clearTimeout(timeout);
      context.off('request', onRequest);
      context.off('close', onClose);
    }
    context.on('request', onRequest);
    context.on('close', onClose);
  });
}

/** ページの文脈で API を 1 つ POST で呼ぶ（Cookie はブラウザが付ける）。応答の data を返す */
async function call(page: Page, c: Captured, path: string, extra: Record<string, unknown> = {}): Promise<unknown> {
  const r = await page.evaluate(
    async ({ url, headers, body }) => {
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { ...headers, 'content-type': 'application/json' },
        body,
      });
      return res.ok ? { json: (await res.json()) as unknown } : { status: res.status };
    },
    { url: API_BASE + path, headers: c.headers, body: JSON.stringify({ ...c.account, ...extra }) },
  );
  if ('status' in r) throw new Error(`${path}: HTTP ${r.status}`);
  return unwrapResponse(path, r.json);
}

async function fetchRaw(page: Page, c: Captured): Promise<ShiftyPadRaw> {
  const characters = charactersOf(await call(page, c, API_PATHS.characters));
  log(`所持 ${characters.length} 体`);
  const details: unknown[] = [];
  const stateEffects: unknown[] = [];
  const codes = characters.map((x) => x.name_code);
  for (const part of chunks(codes, DETAILS_CHUNK)) {
    const d = detailsOf(await call(page, c, API_PATHS.details, { name_codes: part }));
    details.push(...d.details);
    stateEffects.push(...d.stateEffects);
    log(`詳細 ${details.length} / ${codes.length}`);
  }
  if (details.length !== characters.length)
    log(`注意: 詳細の数 ${details.length} がキャラの数 ${characters.length} と違う`);
  const outpost = outpostOf(await call(page, c, API_PATHS.outpost));
  return {
    fetchedAt: new Date().toISOString(),
    source: `Blablalink ShiftyPad (${Object.values(API_PATHS).join(', ')})`,
    outpost,
    characters,
    details,
    stateEffects: dedupe(stateEffects),
  } as unknown as ShiftyPadRaw;
}

const dir = userDataDir();
log(`Chrome を開く（ユーザーデータ: ${dir}）`);
const context = await chromium.launchPersistentContext(dir, { channel: 'chrome', headless: false, viewport: null });
let raw: ShiftyPadRaw;
try {
  const capturing = waitForCapture(context);
  capturing.catch(() => undefined); // goto が先に失敗したとき、閉じたことによる拒否を未処理にしない
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(URL);
  log('ログインの画面なら、この窓でログインしてください（ツールは入力に触れない）。ログインの後はそのまま待つ');
  const { captured, page: from } = await capturing;
  log('ページのリクエストを拾った。取得を始める');
  raw = await fetchRaw(from, captured);
} finally {
  await context.close().catch(() => undefined);
}
importRaw(raw, 'npm run build:fetch');
