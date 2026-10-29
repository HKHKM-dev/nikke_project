// デスクトップと Google Drive の双方向同期（plan/design-cloud-environment.md 4 節）。rclone bisync で対ごとに回す。
//   npm run drive:sync [-- --pair captures] [--resync] [--dry-run]
//   npm run drive:conflicts                  衝突で別名にしたファイル（*.conflict-*）の一覧（両側）
//   node tools/drive/sync.ts --hook          SessionStart フックから（PC を付けてから 30 分以内に回っていれば・回っている途中なら飛ばす。
//                                            rclone の準備が無い環境とクラウド環境では何もしない。失敗しても終了コード 0）
// 回すのは作業の節目だけ（道具の終わり・デスクトップのセッションの始め・離席の前の手の操作。2026-10-23 のオーナーの決定）。
// 初回は --resync --dry-run で送られるものを見てから --resync（4.3 節）。フィルタを変えたら、その対だけ --resync する。
// 記録は NIKKE_SYNC_STATE_DIR（無ければホームの下の .nikke-sync。追跡しない）の sync.log に 1 回 1 行、rclone の出力は
// last-<対>.log に残す。
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, uptime } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { capturesDir } from '../captures/dirs.ts';
import { driveCaptures, driveSync, driveUnavailable, lsjson, rclone } from './rclone.ts';
import {
  bisyncArgs,
  hookShouldSkip,
  isConflictName,
  type Lock,
  lockIsLive,
  memoryProjectName,
  type Pair,
  SYNC_MARKER,
  SYNC_MARKER_TEXT,
} from './sync-lib.ts';

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

/** メインのチェックアウト（git worktree list の先頭）。private/・scratch/ はここにだけある */
function mainCheckout(): string {
  const r = spawnSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  const m = /^worktree (.+)$/m.exec(r.stdout ?? '');
  return m?.[1] ?? ROOT;
}
const main = mainCheckout();
const claudeDir = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');

// 対の定義。フィルタは中身で持ち、回すときに記録の場所へ写す（bisync が隣に指紋を書くため）
type PairDef = Omit<Pair, 'filters'> & { filterText: string };
const PAIRS: PairDef[] = [
  {
    name: 'captures',
    local: capturesDir(),
    remote: driveCaptures(),
    filterText: readFileSync(join(ROOT, 'tools/drive/filters/captures.txt'), 'utf8'),
    checkAccess: true,
  },
  // 段 ②: private/・scratch/・Claude のメモリと全体の指示（設計書 4.1 節。Drive の nikke_sync/ の下）
  {
    name: 'private',
    local: join(main, 'private'),
    remote: `${driveSync()}/private`,
    // 直下の *.json（サービスアカウントの鍵と、build:fetch の手元のパスの設定）だけを外す。builds/ の *.json は上げる
    filterText: '# 直下の *.json は同期しない（設計書 4.1 節）\n- /*.json\n',
    // ファイルが owner.md だけなので、目印が無いとクラウドで追記するたびに全部が変わったと見なして止まる（設計書 4.2 節）
    checkAccess: true,
  },
  {
    name: 'scratch',
    local: join(main, 'scratch'),
    remote: `${driveSync()}/scratch`,
    filterText: '- desktop.ini\n',
    checkAccess: false,
  },
  {
    name: 'claude',
    local: claudeDir,
    remote: `${driveSync()}/claude`,
    filterText: `# 全体の CLAUDE.md と、このプロジェクトのメモリだけ（設計書 4.1 節）\n+ /CLAUDE.md\n+ /projects/${memoryProjectName(main)}/memory/**\n- **\n`,
    checkAccess: false,
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

function hasMarker(pair: PairDef): { local: boolean; remote: boolean } {
  const remote = lsjson(pair.remote, ['--files-only', '--max-depth', '1', '--include', SYNC_MARKER]);
  return { local: existsSync(join(pair.local, SYNC_MARKER)), remote: (remote ?? []).length > 0 };
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
if (
  hook &&
  hookShouldSkip(readJson<{ time: number }>(lastOkPath)?.time ?? null, Date.now(), Date.now() - uptime() * 1000)
) {
  log('hook skip（前の成功から 30 分たっていない）');
  process.exit(0);
}
if (!(await takeLock())) done(1, 'ほかの同期が回っていて、ロックが取れなかった');

let failed = 0;
// フックで知らせること（process.exit は finally を飛ばすので、ロックを外した後で出す）
let hookMessage: string | undefined;
try {
  for (const pair of pairs) {
    const mode = `${hook ? 'hook' : 'manual'}${values.resync ? ' resync' : ''}${values['dry-run'] ? ' dry-run' : ''}`;
    let checkAccess = pair.checkAccess;
    if (pair.checkAccess) {
      const t = hasMarker(pair);
      if (!t.local || !t.remote) {
        if (!values.resync) {
          failed++;
          log(`${mode} ${pair.name} skipped (${SYNC_MARKER} が無い)`);
          console.error(
            `${pair.name}: 根に ${SYNC_MARKER} が無い（${t.local ? '' : 'ローカル '}${t.remote ? '' : 'Drive'}）。初回の --resync で置く`,
          );
          continue;
        }
        if (values['dry-run']) {
          checkAccess = false;
          console.log(
            `${pair.name}: ${SYNC_MARKER} が無いので、空打ちでは --check-access を外した（本番の --resync で置く）`,
          );
        } else {
          if (!t.local) writeFileSync(join(pair.local, SYNC_MARKER), SYNC_MARKER_TEXT);
          // Drive 側はローカルのものを写す（更新時刻をそろえる。別々に作ると bisync が食い違いと見る）
          rclone(['copyto', join(pair.local, SYNC_MARKER), `${pair.remote}/${SYNC_MARKER}`]);
        }
      }
    }
    // 初めての対は Drive にフォルダが無い。空打ちでは数えるだけ、本番の --resync では作ってから回す
    if (values.resync && lsjson(pair.remote, ['--max-depth', '1']) === null) {
      if (values['dry-run']) {
        console.log(`${pair.name}: Drive に ${pair.remote} がまだ無い。本番の --resync で作り、ローカルを上げる`);
        continue;
      }
      rclone(['mkdir', pair.remote]);
    }
    // bisync はフィルタの指紋（.md5）をフィルタの隣に書く。リポジトリの中だと worktree ごとに無くなるので、
    // 記録の場所に写して使う（中身が変わったときだけ書き直す。変われば --resync が要る）
    const filters = join(stateDir, `filters-${pair.name}.txt`);
    const text = pair.filterText;
    if (!existsSync(filters) || readFileSync(filters, 'utf8') !== text) writeFileSync(filters, text);
    const args = bisyncArgs(
      { ...pair, filters },
      {
        resync: values.resync,
        dryRun: values['dry-run'],
        checkAccess,
        verbose: !hook || values['dry-run'],
      },
    );
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
