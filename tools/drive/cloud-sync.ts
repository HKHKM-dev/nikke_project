// クラウドのセッションと Google Drive の nikke_sync の往復（plan/design-cloud-environment.md 6.1・6.2 節）。フックから呼ぶ。
//   node tools/drive/cloud-sync.ts --pull   SessionStart: private/・scratch/・メモリ・全体の CLAUDE.md を取って置き、
//                                           ~/.claude/CLAUDE.md を組み立てる（前に戻せなかった変更があれば先に戻す）
//   node tools/drive/cloud-sync.ts --push   Stop: 前に取ったときから変わったものを受け口で戻す。クラウドで切り出した証拠フレームも上げる
// クラウド（CLAUDE_CODE_REMOTE=true）で、受け口の URL（NIKKE_DRIVE_GATEWAY_URL）があるときだけ動く。失敗しても終了コード 0。
// 基準（前に取ったときの md5）は ~/.cache/nikke-sync/base.json。使い回された VM でも同じ結果になるよう、ファイルは上書きで書く。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { capturesDir } from '../captures/dirs.ts';
import { cloudClaudeMd, diffAgainstBase, localPathOf, trackedRoots } from './cloud-lib.ts';
import { gatewayUrl, put, snapshot, trash } from './gateway.ts';
import { memoryProjectName } from './sync-lib.ts';

const { values } = parseArgs({
  options: { pull: { type: 'boolean', default: false }, push: { type: 'boolean', default: false } },
});
if (process.env['CLAUDE_CODE_REMOTE'] !== 'true' || gatewayUrl() === null) process.exit(0);

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
type Base = { files: Record<string, string>; frames: Record<string, string> };

const md5 = (buf: Buffer) => createHash('md5').update(buf).digest('hex');

function readBase(): Base | null {
  try {
    return JSON.parse(readFileSync(basePath, 'utf8')) as Base;
  } catch {
    return null;
  }
}
function saveBase(base: Base): void {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(basePath, JSON.stringify(base));
}

function walk(dir: string, rel = ''): string[] {
  const at = join(dir, rel);
  if (!existsSync(at)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(at, { withFileTypes: true })) {
    const p = rel === '' ? ent.name : `${rel}/${ent.name}`;
    if (ent.isDirectory()) out.push(...walk(dir, p));
    else out.push(p);
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

async function push(base: Base): Promise<string[]> {
  const notes: string[] = [];
  const local = localFiles();
  const d = diffAgainstBase(new Map([...local].map(([p, v]) => [p, v.md5])), base.files);
  for (const p of d.put) {
    const r = await put('sync', p.path, local.get(p.path)!.buf, p.baseMd5);
    if (r.conflict) notes.push(`衝突: ${p.path}（Drive 側も変わっていたので、クラウドの版を ${r.path} として置いた）`);
    else base.files[p.path] = r.md5;
  }
  for (const t of d.trash) {
    const r = await trash('sync', t.path, t.baseMd5);
    if (r.skipped === 'changed') notes.push(`消していない: ${t.path}（Drive 側で変わっていた）`);
    delete base.files[t.path];
  }
  // クラウドで切り出した証拠フレーム（取り寄せたものは中身が同じなので、受け口が何もしない）
  const frames = join(capturesDir(), 'frames');
  for (const rel of walk(frames)) {
    const buf = readFileSync(join(frames, rel));
    const sum = md5(buf);
    if (base.frames[rel] === sum) continue;
    const r = await put('captures', `frames/${rel}`, buf, base.frames[rel] ?? null);
    if (r.conflict)
      notes.push(`衝突: frames/${rel}（同じ名前で中身の違う証拠フレームが Drive にあったので ${r.path} として置いた）`);
    else base.frames[rel] = r.md5;
  }
  saveBase(base);
  if (d.put.length + d.trash.length > 0)
    notes.unshift(`Drive に戻した: ${d.put.length} 件、ごみ箱へ: ${d.trash.length} 件`);
  return notes;
}

async function pull(): Promise<string[]> {
  const notes: string[] = [];
  const old = readBase();
  // 前の応答で戻せなかった変更があれば先に戻す（使い回された VM）
  if (old !== null) notes.push(...(await push(old)));
  const files = [
    ...(await snapshot('sync', 'private', 5_000_000)).files,
    ...(await snapshot('sync', 'scratch', 5_000_000)).files,
    ...(await snapshot('sync', 'claude', 5_000_000)).files,
  ];
  const base: Base = { files: {}, frames: old?.frames ?? {} };
  let globalMd = '';
  for (const f of files) {
    if (f.content === undefined || f.md5 === undefined) {
      notes.push(`大きすぎて取っていない: ${f.path}`);
      continue;
    }
    const buf = Buffer.from(f.content, 'base64');
    if (f.path === 'claude/CLAUDE.md') {
      globalMd = buf.toString('utf8');
      continue;
    }
    const to = localPathOf(f.path, places);
    if (to === null) continue;
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, buf);
    base.files[f.path] = f.md5;
  }
  // Drive で消えたもの（前に取ったときのままの手元のファイル）は手元からも消す
  for (const [path, v] of localFiles())
    if (base.files[path] === undefined && old?.files[path] === v.md5) {
      const to = localPathOf(path, places);
      if (to !== null) rmSync(to, { force: true });
    }
  const index = existsSync(join(places.memoryDir, 'MEMORY.md'))
    ? readFileSync(join(places.memoryDir, 'MEMORY.md'), 'utf8')
    : '';
  mkdirSync(claudeHome, { recursive: true });
  writeFileSync(join(claudeHome, 'CLAUDE.md'), cloudClaudeMd(globalMd, index, places.memoryDir));
  saveBase(base);
  notes.unshift(`Drive から private/・scratch/・メモリを ${Object.keys(base.files).length} 件取った`);
  return notes;
}

try {
  if (values.pull) {
    const notes = await pull();
    console.log(notes.join('\n'));
  } else if (values.push) {
    const base = readBase();
    if (base === null) process.exit(0);
    const notes = await push(base);
    if (notes.length > 0) console.log(JSON.stringify({ systemMessage: `Drive との往復: ${notes.join('。')}` }));
  }
} catch (e) {
  const message = `Drive との往復に失敗した: ${(e as Error).message}`;
  console.log(values.pull ? message : JSON.stringify({ systemMessage: message }));
}
