// クラウドのセッションと Google Drive の nikke_sync の往復（plan/design-cloud-environment.md 6.1・6.2 節）。フックから呼ぶ。
//   node tools/drive/cloud-sync.ts --pull       SessionStart: private/・メモリ・全体の CLAUDE.md を取って置き、~/.claude/CLAUDE.md を
//                                               組み立てる（前に戻せなかった変更があれば先に戻す）。scratch/ は一覧だけ取り、中身は
//                                               切り離した --pull-rest に渡す（フックは待たない）
//   node tools/drive/cloud-sync.ts --pull-rest  --pull が渡した scratch/ の中身を、新しいものから取って置く。手で回すと、取り切れなかった残りを取る
//   node tools/drive/cloud-sync.ts --push       Stop: 前に取ったときから変わったものを受け口で戻す。クラウドで切り出した証拠フレームも上げる
// クラウド（CLAUDE_CODE_REMOTE=true）で、受け口の URL（NIKKE_DRIVE_GATEWAY_URL）があるときだけ動く。失敗しても終了コード 0。
// 受け口はファイルの中身を 1 件あたり約 1 秒で読み、1 回の実行は 6 分まで。件数の多い scratch/ は 1 件ずつ並べて取る（設計書 6.1 節）。
// --pull と --push は、フックの timeout（120 秒）より前に打ち切って知らせを出す。
// 基準（前に取ったときの md5）は ~/.cache/nikke-sync/base.json。使い回された VM でも同じ結果になるよう、ファイルは上書きで書く。
// --pull-rest と --push は同時に動くので、基準と手元のファイルを書き換える間は lock を持つ。
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { capturesDir } from '../captures/dirs.ts';
import {
  cloudClaudeMd,
  diffAgainstBase,
  localPathOf,
  planPull,
  runUntil,
  settlePut,
  shouldOverwrite,
  shouldPut,
  trackedRoots,
} from './cloud-lib.ts';
import { get, gatewayUrl, put, snapshot, trash, type SnapshotFile } from './gateway.ts';
import { memoryProjectName } from './sync-lib.ts';

const { values } = parseArgs({
  options: {
    pull: { type: 'boolean', default: false },
    'pull-rest': { type: 'boolean', default: false },
    push: { type: 'boolean', default: false },
  },
});
if (process.env['CLAUDE_CODE_REMOTE'] !== 'true' || gatewayUrl() === null) process.exit(0);

/** --pull・--push を打ち切るまで（フックの timeout は 120 秒） */
const BUDGET_MS = 100_000;
/** --pull-rest が取りに行く長さ */
const REST_BUDGET_MS = 10 * 60_000;
/** 受け口を 1 回呼んで待つ長さ（ふだんは一覧が 10 秒、1 件が 3 秒ほど。止まっていたら、フックの終わりより前に知らせる） */
const CALL_MS = 45_000;
/** 受け口を同時に呼ぶ数（受け口は同時に 30 まで） */
const PARALLEL = 8;
/** これより大きいファイルは取らない */
const MAX_BYTES = 5_000_000;

const repo = (process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd()).split('\\').join('/');
const claudeHome = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
const places = {
  repo,
  memoryDir: join(claudeHome, 'projects', memoryProjectName(repo), 'memory').split('\\').join('/'),
  // Drive 上のメモリは、デスクトップのチェックアウトの名前のフォルダにある
  memoryProject: process.env['NIKKE_MEMORY_PROJECT'] ?? 'D--nikke-project',
};
const stateDir = join(homedir(), '.cache', 'nikke-sync');
const basePath = join(stateDir, 'base.json');
/** --pull から --pull-rest への引き渡し（scratch/ の中身を取るパス。新しいものから） */
const restPath = join(stateDir, 'rest.json');
const restPid = join(stateDir, 'pull-rest.pid');
const restLog = join(stateDir, 'pull-rest.log');
const lockPath = join(stateDir, 'lock');
/** 書きかけのファイルの名前の終わり（手元のファイルを数えるときに外す） */
const TMP = '.nikke-sync-tmp';

// conflicts: 衝突を返された手元の版の md5。同じ版のままなら次の応答の終わりに送り直さない
type Base = {
  files: Record<string, string>;
  frames: Record<string, string>;
  conflicts: { files: Record<string, string>; frames: Record<string, string> };
};
type Rest = { writtenAt: number; paths: string[] };

const md5 = (buf: Buffer) => createHash('md5').update(buf).digest('hex');
const emptyBase = (): Base => ({ files: {}, frames: {}, conflicts: { files: {}, frames: {} } });
const call = (until: number) => Math.min(CALL_MS, until - Date.now());
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const header = 'Drive との往復';

function logRest(text: string): void {
  mkdirSync(stateDir, { recursive: true });
  appendFileSync(restLog, `${new Date().toISOString()} ${text}\n`);
}

/** 書きかけを残さないよう、同じフォルダの一時ファイルに書いてから名前を変える */
function writeWhole(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}${TMP}`);
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function readBase(): Base | null {
  const base = readJson<Omit<Base, 'conflicts'> & Partial<Base>>(basePath);
  return base === null ? null : { ...base, conflicts: base.conflicts ?? { files: {}, frames: {} } };
}
const saveBase = (base: Base) => writeWhole(basePath, JSON.stringify(base));

/** pid がこの道具（cloud-sync.ts）の動いているプロセスか（使い回された VM では、残った pid が別のプロセスに当たりうる） */
function ours(pid: number): boolean {
  if (!(pid > 0) || pid === process.pid) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('cloud-sync.ts');
  } catch {
    return false;
  }
}

/**
 * lock を持って fn を回す。until までに持てなければ回さずに null。持ち主が動いていない lock と、5 分より古い lock は外す
 * （持つのは長くても --pull・--push の 100 秒）
 */
async function withLock<T>(until: number, fn: () => Promise<T>): Promise<T | null> {
  mkdirSync(stateDir, { recursive: true });
  for (;;) {
    try {
      writeFileSync(lockPath, String(process.pid), { flag: 'wx' });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    let holder: number;
    let age: number;
    try {
      holder = Number(readFileSync(lockPath, 'utf8'));
      age = Date.now() - statSync(lockPath).mtimeMs;
    } catch {
      continue; // 持ち主が外したところ
    }
    // 中身が無いのは、作った直後で pid を書く前
    if (age > 5 * 60_000 || (holder > 0 ? !ours(holder) : age > 5_000)) {
      rmSync(lockPath, { force: true });
      continue;
    }
    if (Date.now() >= until) return null;
    await sleep(200);
  }
  try {
    return await fn();
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/**
 * --pull-rest を切り離して起こす（フックの終わりを待たせず、フックより長く動けるように。出力はログへ。
 * フックの出力の管につないだままにすると、フックが終わらない）
 */
function startRest(): void {
  mkdirSync(stateDir, { recursive: true });
  const log = openSync(restLog, 'a');
  spawn(process.execPath, [...process.execArgv, import.meta.filename, '--pull-rest'], {
    detached: true,
    stdio: ['ignore', 'ignore', log],
    env: process.env,
  })
    .on('error', (e) => logRest(`${header}（scratch/ の取り寄せ）を起こせなかった: ${reason(e)}`))
    .unref();
  closeSync(log);
}

/** 前のセッションの始めの --pull-rest が残っていれば止める（今の --pull が一覧から渡し直す） */
function stopRest(): void {
  const pid = readJson<number>(restPid) ?? 0;
  if (ours(pid)) process.kill(pid, 'SIGTERM');
  rmSync(restPid, { force: true });
}

function walk(dir: string, rel = ''): string[] {
  const at = join(dir, rel);
  if (!existsSync(at)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(at, { withFileTypes: true })) {
    const p = rel === '' ? ent.name : `${rel}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walk(dir, p));
    else if (!ent.name.endsWith(TMP)) out.push(p);
  }
  return out;
}

/** 手元の private・scratch・メモリ（Drive のパス → md5 と中身） */
function localFiles(): Map<string, { md5: string; buf: Buffer }> {
  const out = new Map<string, { md5: string; buf: Buffer }>();
  for (const r of trackedRoots(places))
    for (const rel of walk(r.local)) {
      const buf = readFileSync(join(r.local, rel));
      out.set(`${r.drive}/${rel}`, { md5: md5(buf), buf });
    }
  return out;
}

/** 回しきれなかった・失敗した件数の知らせ（失敗は最初の理由を添える） */
function shortfall<T>(what: string, r: { rest: T[]; failed: { error: unknown }[] }, then: string): string[] {
  const notes: string[] = [];
  if (r.rest.length > 0) notes.push(`${what}: ${r.rest.length} 件は時間内に回らなかった（${then}）`);
  if (r.failed.length > 0)
    notes.push(`${what}: ${r.failed.length} 件が失敗した（${then}）。最初の理由: ${reason(r.failed[0]!.error)}`);
  return notes;
}

async function push(base: Base, until: number): Promise<string[]> {
  const notes: string[] = [];
  const local = localFiles();
  const d = diffAgainstBase(new Map([...local].map(([p, v]) => [p, v.md5])), base.files, base.conflicts.files);
  const puts = await runUntil(d.put, PARALLEL, until, async (p) => {
    const { buf, md5: sum } = local.get(p.path)!;
    const r = await put('sync', p.path, buf, p.baseMd5, call(until));
    if (r.conflict) notes.push(`衝突: ${p.path}（Drive 側も変わっていたので、クラウドの版を ${r.path} として置いた）`);
    settlePut(base.files, base.conflicts.files, p.path, sum, r);
  });
  const trashes = await runUntil(d.trash, PARALLEL, until, async (t) => {
    const r = await trash('sync', t.path, t.baseMd5, call(until));
    if (r.skipped === 'changed') notes.push(`消していない: ${t.path}（Drive 側で変わっていた）`);
    delete base.files[t.path];
  });
  // クラウドで切り出した証拠フレーム（取り寄せたものは中身が同じなので、受け口が何もしない）
  const framesDir = join(capturesDir(), 'frames');
  const frames = walk(framesDir).flatMap((rel) => {
    const buf = readFileSync(join(framesDir, rel));
    const sum = md5(buf);
    return shouldPut(sum, base.frames[rel], base.conflicts.frames[rel]) ? [{ rel, buf, sum }] : [];
  });
  const sent = await runUntil(frames, PARALLEL, until, async (f) => {
    const r = await put('captures', `frames/${f.rel}`, f.buf, base.frames[f.rel] ?? null, call(until));
    if (r.conflict)
      notes.push(
        `衝突: frames/${f.rel}（同じ名前で中身の違う証拠フレームが Drive にあったので ${r.path} として置いた）`,
      );
    settlePut(base.frames, base.conflicts.frames, f.rel, f.sum, r);
  });
  saveBase(base);
  const okPut = d.put.length - puts.rest.length - puts.failed.length;
  const okTrash = d.trash.length - trashes.rest.length - trashes.failed.length;
  if (okPut + okTrash > 0) notes.unshift(`Drive に戻した: ${okPut} 件、ごみ箱へ: ${okTrash} 件`);
  const then = '次の応答の終わりにやり直す';
  notes.push(
    ...shortfall('Drive に戻す', puts, then),
    ...shortfall('ごみ箱へ移す', trashes, then),
    ...shortfall('証拠フレームを上げる', sent, then),
  );
  return notes;
}

async function pull(until: number): Promise<string[]> {
  const notes: string[] = [];
  // 前の引き渡しの残り（--pull-rest が取らなかったもの）は捨てる。今の一覧から渡し直す
  rmSync(restPath, { force: true });
  // 前の応答で戻せなかった変更があれば先に戻す（使い回された VM）。戻せなかったものも、下の決まりで手元に残る
  const before = readBase();
  if (before !== null) notes.push(...(await push(before, until)));
  const old = readBase() ?? emptyBase();
  // 一覧（中身なし）を取り、private/・メモリ・全体の CLAUDE.md の中身は 1 件ずつ並べて取る。scratch/ の中身は裏の --pull-rest
  const listing = (prefix: string) => snapshot('sync', prefix, 0, call(until)).then((r) => r.files);
  // scratch/ の一覧は待つ間に断られても落ちないよう、先に allSettled にくるむ
  const scratchListing = Promise.allSettled([listing('scratch')]);
  const [priv, claude] = await Promise.allSettled([listing('private'), listing('claude')]);
  const wanted = [priv, claude]
    .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .filter((f) => f.size <= MAX_BYTES && (f.path === 'claude/CLAUDE.md' || localPathOf(f.path, places) !== null));
  const contents = new Map<string, { md5: string; buf: Buffer }>();
  const fetched = await runUntil(wanted, PARALLEL, until, async (f) => {
    const r = await get('sync', f.path, call(until));
    if (r.md5 !== undefined && r.content !== undefined)
      contents.set(f.path, { md5: r.md5, buf: Buffer.from(r.content, 'base64') });
  });
  const [scratch] = await scratchListing;
  // 証拠フレームは触らないので、基準と衝突の記憶をそのまま残す
  const base: Base = { files: {}, frames: old.frames, conflicts: { files: {}, frames: old.conflicts.frames } };
  const local = localFiles();
  const failed = new Map<string, string[]>();
  let placed = 0;
  let toFetch: SnapshotFile[] = [];
  for (const root of trackedRoots(places)) {
    const label = root.drive.startsWith('claude/') ? 'メモリ' : `${root.drive}/`;
    const listed = root.drive === 'private' ? priv : root.drive === 'scratch' ? scratch : claude;
    const under = (path: string) => path.startsWith(`${root.drive}/`);
    if (listed.status === 'rejected') {
      // 取れなかった根は、手元も基準もそのまま
      const why = reason(listed.reason);
      failed.set(why, [...(failed.get(why) ?? []), label]);
      for (const [path, sum] of Object.entries(old.files)) if (under(path)) base.files[path] = sum;
      for (const [path, sum] of Object.entries(old.conflicts.files)) if (under(path)) base.conflicts.files[path] = sum;
      continue;
    }
    const files = listed.value.filter((f) => under(f.path));
    for (const f of files)
      if (f.size > MAX_BYTES) notes.push(`大きすぎて取っていない: ${f.path}（${(f.size / 1e6).toFixed(1)}MB）`);
    if (root.drive === 'scratch') toFetch = files.filter((f) => f.size <= MAX_BYTES);
    const plan = planPull(
      files.map((f) => f.path),
      new Map(files.flatMap((f) => (contents.has(f.path) ? [[f.path, contents.get(f.path)!.md5]] : []))),
      new Map([...local].flatMap(([path, v]) => (under(path) ? [[path, v.md5]] : []))),
      { files: old.files, conflicts: old.conflicts.files },
    );
    for (const path of plan.write) {
      writeWhole(localPathOf(path, places)!, contents.get(path)!.buf);
      placed++;
    }
    for (const path of plan.remove) rmSync(localPathOf(path, places)!, { force: true });
    for (const path of plan.keep)
      notes.push(`手元で変わっているので Drive の版で上書きしていない: ${path}（応答の終わりに戻す）`);
    Object.assign(base.files, plan.files);
    Object.assign(base.conflicts.files, plan.conflicts);
  }
  if (claude.status === 'fulfilled') {
    const index = existsSync(join(places.memoryDir, 'MEMORY.md'))
      ? readFileSync(join(places.memoryDir, 'MEMORY.md'), 'utf8')
      : '';
    const globalMd = contents.get('claude/CLAUDE.md')?.buf.toString('utf8') ?? '';
    writeWhole(join(claudeHome, 'CLAUDE.md'), cloudClaudeMd(globalMd, index, places.memoryDir));
  }
  saveBase(base);
  // 新しいものから取る（いま使っているものほど要る）
  const paths = toFetch.sort((a, b) => b.modified.localeCompare(a.modified)).map((f) => f.path);
  if (paths.length > 0) {
    writeWhole(restPath, JSON.stringify({ writtenAt: Date.now(), paths } satisfies Rest));
    startRest();
  }
  if (priv.status === 'fulfilled' || claude.status === 'fulfilled')
    notes.unshift(`Drive から private/・メモリを ${placed} 件取った`);
  notes.push(...shortfall('private/・メモリを取る', fetched, 'node tools/drive/cloud-sync.ts --pull で取り直せる'));
  for (const [why, labels] of failed) notes.push(`${labels.join('・')}を取れなかった: ${why}`);
  if (paths.length > 0)
    notes.push(
      `scratch/ の ${paths.length} 件は、裏で新しいものから取っている（数分かかる。終わったか・取れなかったものは ${restLog} の` +
        '最後の行。止まっていたら node tools/drive/cloud-sync.ts --pull-rest で残りを取る）',
    );
  if (failed.size > 0 || fetched.failed.length + fetched.rest.length > 0)
    notes.push('確かめ方は plan/cloud-guide.md「困ったとき」');
  return notes;
}

/** --pull が渡した scratch/ の中身を取って置く */
async function pullRest(): Promise<string[]> {
  const rest = readJson<Rest>(restPath);
  if (rest === null || rest.paths.length === 0) {
    const pid = readJson<number>(restPid) ?? 0;
    return [ours(pid) ? `裏で scratch/ を取っている途中（pid ${pid}）。終わるのを待つ` : '取り残した scratch/ は無い'];
  }
  // 受け取ったので消す（取り切れなかったものは終わりに書き戻す）。次のセッションの始めの --pull が止められるよう pid を残す
  rmSync(restPath, { force: true });
  writeWhole(restPid, String(process.pid));
  const until = Date.now() + REST_BUDGET_MS;
  let placed = 0;
  const kept: string[] = [];
  const r = await runUntil(rest.paths, PARALLEL, until, async (path) => {
    const got = await get('sync', path, call(until));
    if (got.missing || got.md5 === undefined || got.content === undefined) return; // 一覧の後で Drive から消えた
    const drive = got.md5;
    const content = Buffer.from(got.content, 'base64');
    // 置く間は lock を持つ（応答の終わりの --push と同時に基準を書き換えない）
    const done = await withLock(Date.now() + 2 * BUDGET_MS, async () => {
      const base = readBase() ?? emptyBase();
      const to = localPathOf(path, places)!;
      const here = existsSync(to) ? md5(readFileSync(to)) : undefined;
      if (!shouldOverwrite(here, base.files[path], base.conflicts.files[path], drive)) {
        kept.push(path);
        return;
      }
      writeWhole(to, content);
      base.files[path] = drive;
      delete base.conflicts.files[path];
      saveBase(base);
      placed++;
    });
    if (done === null) throw new Error('ほかの往復が lock を持ったままだった');
  });
  const leftover = [...r.rest, ...r.failed.map((f) => f.item)];
  if (leftover.length > 0)
    writeWhole(restPath, JSON.stringify({ writtenAt: Date.now(), paths: leftover } satisfies Rest));
  rmSync(restPid, { force: true });
  const notes = [`scratch/ を ${placed} 件取った（${rest.paths.length} 件のうち）`];
  for (const path of kept)
    notes.push(`手元で変わっているので Drive の版で上書きしていない: ${path}（応答の終わりに戻す）`);
  notes.push(...shortfall('scratch/ を取る', r, 'node tools/drive/cloud-sync.ts --pull-rest で残りを取る'));
  return notes;
}

try {
  if (values.pull) {
    stopRest();
    const until = Date.now() + BUDGET_MS;
    const notes = await withLock(until, () => pull(until));
    console.log((notes ?? [`${header}: ほかの往復が lock を持ったままで、取らなかった`]).join('\n'));
  } else if (values['pull-rest']) {
    const text = `${header}（scratch/ の取り寄せ）: ${(await pullRest()).join('。')}`;
    logRest(text);
    console.log(text);
  } else if (values.push) {
    const until = Date.now() + BUDGET_MS;
    const notes = await withLock(Date.now() + 30_000, async () => {
      const base = readBase();
      return base === null ? [] : push(base, until);
    });
    const text = (notes ?? ['ほかの往復が回っていたので、Drive に戻すのは次の応答の終わりにする']).join('。');
    if (text !== '') console.log(JSON.stringify({ systemMessage: `${header}: ${text}` }));
  }
} catch (e) {
  const message = `${header}に失敗した: ${reason(e)}（plan/cloud-guide.md「困ったとき」）`;
  if (values['pull-rest']) logRest(message);
  console.log(values.push ? JSON.stringify({ systemMessage: message }) : message);
}
