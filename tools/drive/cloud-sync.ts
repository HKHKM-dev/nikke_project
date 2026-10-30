// クラウドのセッションと Google Drive の nikke_sync の往復（plan/design-cloud-environment.md 6.1・6.2 節）。フックから呼ぶ。
//   node tools/drive/cloud-sync.ts --pull       SessionStart: private/・メモリ・全体の CLAUDE.md を Drive に合わせ、~/.claude/CLAUDE.md を
//                                               組み立てる（前に戻せなかった変更があれば先に戻す）。終わりに --pull-rest を切り離して起こす
//   node tools/drive/cloud-sync.ts --pull-rest  scratch/ と、--pull が取り切れなかったものを Drive に合わせる（フックは待たない）。
//                                               手で回すと、取り切れなかった残りを取る
//   node tools/drive/cloud-sync.ts --push       Stop: 前に取ったときから変わったものを受け口で戻す。クラウドで切り出した証拠フレームも上げる
// クラウド（CLAUDE_CODE_REMOTE=true）で、受け口の URL（NIKKE_DRIVE_GATEWAY_URL）があるときだけ動く。失敗しても終了コード 0。
// 受け口は中身を 1 件ずつ読むのが遅いので、一覧（中身なし）を取って、前に置いたときから変わったものだけを 1 件ずつ並べて取る。
// --pull と --push は、フックの timeout（120 秒）より前に打ち切って知らせを出す。
// 基準（前に取ったときの md5 と一覧の値）は ~/.cache/nikke-sync/base.json。使い回された VM でも同じ結果になるよう、上書きで書く。
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
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { capturesDir } from '../captures/dirs.ts';
import {
  CALL_MS,
  cloudClaudeMd,
  diffAgainstBase,
  localPathOf,
  planPull,
  runUntil,
  settlePut,
  shouldOverwrite,
  shouldPut,
  stampOf,
  trackedRoots,
  type TrackedRoot,
} from './cloud-lib.ts';
import { get, gatewayUrl, put, snapshot, trash, type SnapshotFile } from './gateway.ts';
import { lockIsLive, memoryProjectName, type Lock } from './sync-lib.ts';

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
/** 受け口を同時に呼ぶ数（受け口は同時に 30 まで。--pull-rest と --push が重なっても収まるように） */
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
const lockPath = join(stateDir, 'lock');
/** 動いている --pull-rest（1 つだけ動かす） */
const restPid = join(stateDir, 'pull-rest.pid');
const restLog = join(stateDir, 'pull-rest.log');
/** 書きかけのファイルの名前の終わり（手元のファイルを数えるときに外す） */
const TMP = '.nikke-sync-tmp';
const header = 'Drive との往復';
const retryRest = 'node tools/drive/cloud-sync.ts --pull-rest で残りを取る';

// conflicts: 衝突を返された手元の版の md5。同じ版のままなら次の応答の終わりに送り直さない
// seen: 置いたときの Drive の一覧の値（stampOf）。同じなら取り直さない
type Base = {
  files: Record<string, string>;
  frames: Record<string, string>;
  conflicts: { files: Record<string, string>; frames: Record<string, string> };
  seen: Record<string, string>;
};
type Listing = { root: TrackedRoot; files: SnapshotFile[] } | { root: TrackedRoot; error: string };
/** lock を持って、いまの基準で fn を回す（持てなければ null） */
type Locked = <T>(fn: (base: Base) => T) => Promise<T | null>;

const md5 = (buf: Buffer) => createHash('md5').update(buf).digest('hex');
const call = (until: number) => Math.min(CALL_MS, until - Date.now());
const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
const keptNote = (path: string) => `手元で変わっているので Drive の版で上書きしていない: ${path}（応答の終わりに戻す）`;

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

function readBase(): Base {
  const base = readJson<Partial<Base>>(basePath);
  return {
    files: base?.files ?? {},
    frames: base?.frames ?? {},
    conflicts: base?.conflicts ?? { files: {}, frames: {} },
    seen: base?.seen ?? {},
  };
}
const saveBase = (base: Base) => writeWhole(basePath, JSON.stringify(base));

/** pid がこの道具（cloud-sync.ts）の動いているほかのプロセスか（使い回された VM では、残った pid が別のプロセスに当たりうる） */
function ours(pid: number): boolean {
  if (pid === process.pid) return false;
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').includes('cloud-sync.ts');
  } catch {
    return false;
  }
}

/**
 * path に pid と時刻を排他で書いて持つ。until までに持てなければ false。持ち主が動いていないものと staleMs より古いものは外す。
 * このプロセスの中のほかの呼び出しが持っていれば待つ
 */
async function acquire(path: string, staleMs: number, until: number): Promise<boolean> {
  mkdirSync(dirname(path), { recursive: true });
  const running = (pid: number) => pid === process.pid || ours(pid);
  for (;;) {
    if (!lockIsLive(readJson<Lock>(path), Date.now(), running, staleMs)) rmSync(path, { force: true });
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, time: Date.now() } satisfies Lock), { flag: 'wx' });
      return true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    if (Date.now() >= until) return false;
    await sleep(200);
  }
}

/** lock を持って fn を回す。until までに持てなければ回さずに null（持つのは長くても --pull・--push の 100 秒） */
async function withLock<T>(until: number, fn: () => T | Promise<T>): Promise<T | null> {
  if (!(await acquire(lockPath, 5 * 60_000, until))) return null;
  try {
    return await fn();
  } finally {
    rmSync(lockPath, { force: true });
  }
}

/** --pull が lock を持ったまま使う（持ち直さない） */
const held: Locked = async (fn) => fn(readBase());
/** --pull-rest が 1 回ずつ lock を持って使う（応答の終わりの --push を長く待たせない） */
const locking: Locked = (fn) => withLock(Date.now() + 2 * BUDGET_MS, () => fn(readBase()));

/** --pull-rest を切り離して起こす（フックの終わりを待たせず、フックより長く動けるように。出力はフックの管につながずにログへ） */
function startRest(): void {
  const log = openSync(restLog, 'a');
  spawn(process.execPath, [...process.execArgv, import.meta.filename, '--pull-rest'], {
    detached: true,
    stdio: ['ignore', 'ignore', log],
  })
    .on('error', (e) => logRest(`${header}: --pull-rest を起こせなかった: ${reason(e)}`))
    .unref();
  closeSync(log);
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
function shortfall(what: string, r: { rest: unknown[]; failed: { error: unknown }[] }, then: string): string[] {
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
    const sum = md5(readFileSync(join(framesDir, rel)));
    return shouldPut(sum, base.frames[rel], base.conflicts.frames[rel]) ? [{ rel, sum }] : [];
  });
  const sent = await runUntil(frames, PARALLEL, until, async (f) => {
    const buf = readFileSync(join(framesDir, f.rel));
    const r = await put('captures', `frames/${f.rel}`, buf, base.frames[f.rel] ?? null, call(until));
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

/** 根ごとの一覧（中身なし）を並べて取る。メモリの根は claude/ ごと取る（全体の CLAUDE.md もその中にある） */
function listRoots(roots: TrackedRoot[], until: number): Promise<Listing[]> {
  return Promise.all(
    roots.map((root) =>
      snapshot('sync', root.drive.split('/')[0]!, call(until)).then(
        (r) => ({ root, files: r.files }),
        (e: unknown) => ({ root, error: reason(e) }),
      ),
    ),
  );
}

/** 取れなかった根を、理由ごとにまとめて知らせる */
function listingNotes(lists: Listing[]): string[] {
  const failed = new Map<string, string[]>();
  for (const l of lists) if ('error' in l) failed.set(l.error, [...(failed.get(l.error) ?? []), l.root.label]);
  return [...failed].map(([why, labels]) => `${labels.join('・')}を取れなかった: ${why}`);
}

/**
 * 一覧を基準・手元と比べ、Drive で消えたものを手元から消し、前に置いたときから変わったものを新しいものから取って置く。置くかは、
 * lock の中で、いまの基準と手元で決める（取っている間に応答の終わりの --push が基準を進めたら置かない）。置かなかったものは基準を
 * 引き継ぐので、次に回すと続きから取る。一覧を取れなかった根は、手元も基準もそのまま
 */
async function bring(lists: Listing[], until: number, locked: Locked) {
  const notes: string[] = [];
  const queue = await locked((base) => {
    const local = localFiles();
    const out: { file: SnapshotFile; was: string | undefined }[] = [];
    for (const l of lists) {
      if ('error' in l) continue;
      const under = (path: string) => path.startsWith(`${l.root.drive}/`);
      const files = new Map(l.files.filter((f) => under(f.path)).map((f) => [f.path, f]));
      const plan = planPull(
        new Map([...files].map(([path, f]) => [path, stampOf(f)])),
        new Map([...local].flatMap(([path, v]) => (under(path) ? [[path, v.md5]] : []))),
        { files: base.files, conflicts: base.conflicts.files, seen: base.seen },
      );
      for (const path of plan.remove) rmSync(localPathOf(path, places)!, { force: true });
      // この根の基準を、計画の基準で置き換える
      for (const m of [base.files, base.conflicts.files, base.seen])
        for (const path of Object.keys(m)) if (under(path)) delete m[path];
      Object.assign(base.files, plan.files);
      Object.assign(base.conflicts.files, plan.conflicts);
      Object.assign(base.seen, plan.seen);
      for (const path of plan.fetch) {
        const f = files.get(path)!;
        if (f.size > MAX_BYTES) notes.push(`大きすぎて取っていない: ${path}（${(f.size / 1e6).toFixed(1)}MB）`);
        else out.push({ file: f, was: base.files[path] });
      }
    }
    saveBase(base);
    // 新しいものから取る（いま使っているものほど要る）
    return out.sort((a, b) => b.file.modified.localeCompare(a.file.modified));
  });
  if (queue === null) throw new Error('ほかの往復が lock を持ったままだった');
  let placed = 0;
  const r = await runUntil(queue, PARALLEL, until, async ({ file, was }) => {
    const got = await get('sync', file.path, call(until));
    if (got === null) return; // 一覧の後で Drive から消えた
    const done = await locked((base) => {
      // 取っている間に --push が基準を進めた。次に回すときに決め直す
      if (base.files[file.path] !== was) return;
      const to = localPathOf(file.path, places)!;
      const here = existsSync(to) ? md5(readFileSync(to)) : undefined;
      if (!shouldOverwrite(here, was, base.conflicts.files[file.path], got.md5)) {
        notes.push(keptNote(file.path));
        return;
      }
      writeWhole(to, got.buf);
      base.files[file.path] = got.md5;
      base.seen[file.path] = stampOf(file);
      delete base.conflicts.files[file.path];
      saveBase(base);
      placed++;
    });
    if (done === null) throw new Error('ほかの往復が lock を持ったままだった');
  });
  return { placed, queued: queue.length, notes, r };
}

async function pull(until: number): Promise<string[]> {
  // 前の応答で戻せなかった変更があれば先に戻す（使い回された VM）。戻せなかったものも、取り直しの決まりで手元に残る
  const notes = existsSync(basePath) ? await push(readBase(), until) : [];
  // 最初の応答の前に要る private/・メモリ・全体の CLAUDE.md だけを取る。scratch/ と、ここで取り切れなかったものは --pull-rest
  const lists = await listRoots(
    trackedRoots(places).filter((r) => r.drive !== 'scratch'),
    until,
  );
  const claude = lists.find((l) => l.root.drive.startsWith('claude/'))!;
  const globalMd =
    'files' in claude && claude.files.some((f) => f.path === 'claude/CLAUDE.md')
      ? get('sync', 'claude/CLAUDE.md', call(until)).then(
          (r) => r?.buf.toString('utf8') ?? '',
          (e: unknown) => {
            notes.push(`全体の CLAUDE.md を取れなかった: ${reason(e)}`);
            return '';
          },
        )
      : Promise.resolve('');
  const b = await bring(lists, until, held);
  if ('files' in claude) {
    const index = existsSync(join(places.memoryDir, 'MEMORY.md'))
      ? readFileSync(join(places.memoryDir, 'MEMORY.md'), 'utf8')
      : '';
    writeWhole(join(claudeHome, 'CLAUDE.md'), cloudClaudeMd(await globalMd, index, places.memoryDir));
  }
  startRest();
  const failed = listingNotes(lists);
  if (lists.some((l) => 'files' in l)) notes.unshift(`Drive から private/・メモリを ${b.placed} 件置いた`);
  notes.push(...b.notes, ...shortfall('private/・メモリを取る', b.r, '裏の --pull-rest が続きを取る'), ...failed);
  notes.push(
    `scratch/ は、裏の --pull-rest が新しいものから Drive に合わせている（数分かかる。終わったか・取れなかったものは ` +
      `${restLog} の最後の行。止まっていたら ${retryRest}）`,
  );
  if (failed.length > 0 || b.r.failed.length > 0) notes.push('確かめ方は plan/cloud-guide.md「困ったとき」');
  return notes;
}

/** scratch/ と、--pull が取り切れなかったものを Drive に合わせる（1 つだけ動かす） */
async function pullRest(): Promise<string[]> {
  if (!(await acquire(restPid, REST_BUDGET_MS + 60_000, 0)))
    return [`裏で取っている途中（pid ${readJson<Lock>(restPid)?.pid}）。終わるのを待つ`];
  try {
    const until = Date.now() + REST_BUDGET_MS;
    const lists = await listRoots(trackedRoots(places), until);
    const b = await bring(lists, until, locking);
    return [
      `${b.placed} 件置いた（取るものは ${b.queued} 件）`,
      ...b.notes,
      ...shortfall('取る', b.r, retryRest),
      ...listingNotes(lists),
    ];
  } finally {
    rmSync(restPid, { force: true });
  }
}

try {
  if (values.pull) {
    const until = Date.now() + BUDGET_MS;
    const notes = await withLock(until, () => pull(until));
    console.log((notes ?? [`${header}: ほかの往復が lock を持ったままで、取らなかった`]).join('\n'));
  } else if (values['pull-rest']) {
    const text = `${header}（裏の取り寄せ）: ${(await pullRest()).join('。')}`;
    logRest(text);
    console.log(text);
  } else if (values.push) {
    const until = Date.now() + BUDGET_MS;
    const notes = await withLock(Date.now() + 30_000, () => (existsSync(basePath) ? push(readBase(), until) : []));
    const text = (notes ?? ['ほかの往復が回っていたので、Drive に戻すのは次の応答の終わりにする']).join('。');
    if (text !== '') console.log(JSON.stringify({ systemMessage: `${header}: ${text}` }));
  }
} catch (e) {
  const message = `${header}に失敗した: ${reason(e)}（plan/cloud-guide.md「困ったとき」）`;
  if (values['pull-rest']) logRest(message);
  console.log(values.push ? JSON.stringify({ systemMessage: message }) : message);
}
