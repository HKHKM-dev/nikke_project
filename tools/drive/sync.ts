// デスクトップと Google Drive の双方向同期（plan/design-cloud-environment.md 4 節）。rclone bisync で対ごとに回す。
//   npm run drive:sync [-- --pair captures] [--resync] [--dry-run]
//   npm run drive:conflicts                  衝突で別名にしたファイル（*.conflict-*）の一覧（両側）
//   node tools/drive/sync.ts --hook          SessionStart フックから（30 分以内に回っていれば・回っている途中なら飛ばす。
//                                            rclone の準備が無い環境とクラウド環境では何もしない。失敗しても終了コード 0）
// 回すのは作業の節目だけ（道具の終わり・デスクトップのセッションの始め・離席の前の手の操作。2026-10-23 のオーナーの決定）。
// 初回は --resync --dry-run で送られるものを見てから --resync（4.3 節）。フィルタを変えたら、その対だけ --resync する。
// 記録は NIKKE_SYNC_STATE_DIR（無ければホームの下の .nikke-sync。追跡しない）の sync.log に 1 回 1 行、rclone の出力は
// last-<対>.log に残す。
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { capturesDir } from '../captures/dirs.ts';
import { driveCaptures, driveUnavailable, lsjson, rclone } from './rclone.ts';
import { bisyncArgs, hookShouldSkip, isConflictName, type Lock, lockIsLive, type Pair } from './sync-lib.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

const { values } = parseArgs({
  options: {
    pair: { type: 'string' },
    resync: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    hook: { type: 'boolean', default: false },
    conflicts: { type: 'boolean', default: false },
  },
});
const hook = values.hook;

// 段 ① は録画まわりだけ。private/・scratch/・メモリの対は段 ② で足す（設計書 9 節）
const PAIRS: Pair[] = [
  {
    name: 'captures',
    local: capturesDir(),
    remote: driveCaptures(),
    filters: join(ROOT, 'tools/drive/filters/captures.txt'),
    checkAccess: true,
  },
];

const stateDir = process.env['NIKKE_SYNC_STATE_DIR'] ?? join(homedir(), '.nikke-sync');
const lockPath = join(stateDir, 'sync.lock');
const lastOkPath = join(stateDir, 'last-ok.json');

function done(code: number, message?: string): never {
  if (message !== undefined) {
    if (hook) console.log(JSON.stringify({ systemMessage: `Drive の同期: ${message}` }));
    else (code === 0 ? console.log : console.error)(message);
  }
  process.exit(hook ? 0 : code);
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** ロックを取る。取れなければ false（フックはすぐ諦め、手で回したときは 10 分まで待つ） */
async function takeLock(): Promise<boolean> {
  const deadline = Date.now() + (hook ? 0 : 10 * 60_000);
  for (;;) {
    if (!lockIsLive(readJson<Lock>(lockPath), Date.now(), alive)) rmSync(lockPath, { force: true });
    try {
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, time: Date.now() } satisfies Lock), { flag: 'wx' });
      return true;
    } catch {
      if (Date.now() >= deadline) return false;
      if (!hook) console.error('ほかの同期が回っているので待つ…');
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

function log(line: string): void {
  appendFileSync(join(stateDir, 'sync.log'), `${new Date().toISOString()} ${line}\n`);
}

function hasTestFile(pair: Pair): { local: boolean; remote: boolean } {
  const remote = lsjson(pair.remote, ['--files-only', '--max-depth', '1', '--include', 'RCLONE_TEST']);
  return { local: existsSync(join(pair.local, 'RCLONE_TEST')), remote: (remote ?? []).length > 0 };
}

/** 衝突で別名にしたファイル（ローカルを歩く。derived は見ない） */
function localConflicts(root: string, rel = ''): string[] {
  const dir = join(root, rel);
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = rel === '' ? ent.name : `${rel}/${ent.name}`;
    if (ent.isDirectory()) {
      if (p !== 'derived') out.push(...localConflicts(root, p));
    } else if (isConflictName(ent.name)) out.push(p);
  }
  return out;
}

const pairs = values.pair === undefined ? PAIRS : PAIRS.filter((p) => p.name === values.pair);
if (pairs.length === 0) done(1, `--pair は ${PAIRS.map((p) => p.name).join(' / ')}`);

const unavailable = driveUnavailable();
if (unavailable !== null) {
  // フックは、準備の前とクラウド環境では黙って何もしない
  if (hook) process.exit(0);
  done(1, `Drive と同期できない（${unavailable}）`);
}

if (values.conflicts) {
  for (const pair of pairs) {
    const local = localConflicts(pair.local);
    const r = rclone(['lsf', '-R', '--files-only', '--include', '*.conflict-*', pair.remote]);
    const remote = r.status === 0 ? r.stdout.split(/\r?\n/).filter((l) => l !== '' && isConflictName(l)) : [];
    console.log(`${pair.name}: ローカル ${local.length} 件・Drive ${remote.length} 件`);
    for (const p of local) console.log(`  ローカル ${p}`);
    for (const p of remote) console.log(`  Drive ${p}`);
    if (r.status !== 0) console.error(`  Drive の一覧を取れなかった: ${r.stderr.trim()}`);
  }
  process.exit(0);
}

mkdirSync(stateDir, { recursive: true });
if (hook && hookShouldSkip(readJson<{ time: number }>(lastOkPath)?.time ?? null, Date.now())) process.exit(0);
if (!(await takeLock())) done(1, 'ほかの同期が回っていて、ロックが取れなかった');

let failed = 0;
// フックで知らせること（process.exit は finally を飛ばすので、ロックを外した後で出す）
let hookMessage: string | undefined;
try {
  for (const pair of pairs) {
    const mode = `${hook ? 'hook' : 'manual'}${values.resync ? ' resync' : ''}${values['dry-run'] ? ' dry-run' : ''}`;
    let checkAccess = pair.checkAccess;
    if (pair.checkAccess) {
      const t = hasTestFile(pair);
      if (!t.local || !t.remote) {
        if (!values.resync) {
          failed++;
          log(`${mode} ${pair.name} skipped (RCLONE_TEST が無い)`);
          console.error(
            `${pair.name}: 根に RCLONE_TEST が無い（${t.local ? '' : 'ローカル '}${t.remote ? '' : 'Drive'}）。初回の --resync で置く`,
          );
          continue;
        }
        if (values['dry-run']) {
          checkAccess = false;
          console.log(
            `${pair.name}: RCLONE_TEST が無いので、空打ちでは --check-access を外した（本番の --resync で置く）`,
          );
        } else {
          if (!t.local) writeFileSync(join(pair.local, 'RCLONE_TEST'), '');
          if (!t.remote) rclone(['touch', `${pair.remote}/RCLONE_TEST`]);
        }
      }
    }
    const args = bisyncArgs(pair, {
      resync: values.resync,
      dryRun: values['dry-run'],
      checkAccess,
      verbose: !hook || values['dry-run'],
    });
    const started = Date.now();
    const r = rclone(args, !hook);
    if (hook) writeFileSync(join(stateDir, `last-${pair.name}.log`), `${r.stdout}${r.stderr}`);
    log(`${mode} ${pair.name} exit=${r.status} ${Math.round((Date.now() - started) / 1000)}s`);
    if (r.status !== 0) {
      failed++;
      const hint =
        r.status === 7
          ? `重大なエラー（終了コード 7）。npm run drive:sync -- --pair ${pair.name} --resync --dry-run で何が動くかを見てから --resync する`
          : `終了コード ${r.status}`;
      if (hook) hookMessage = `${pair.name} の同期が失敗した（${hint}。${join(stateDir, `last-${pair.name}.log`)}）`;
      else console.error(`${pair.name}: 同期が失敗した（${hint}）`);
    }
  }
} finally {
  rmSync(lockPath, { force: true });
}

if (failed === 0 && !values['dry-run']) writeFileSync(lastOkPath, JSON.stringify({ time: Date.now() }));
if (failed > 0) done(1, hookMessage);
if (!hook) console.log(values['dry-run'] ? '空打ちを終えた（何も変えていない）' : '同期を終えた');
