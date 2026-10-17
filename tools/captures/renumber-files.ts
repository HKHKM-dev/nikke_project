// 録画の番号の振り直しで、リポジトリの外のファイル（録画の置き場所と Google Drive のバックアップ先）の名前を変える
// （plan/design-recording-renumber.md 5・6 節）。npm run records:renumber が使う。
// - 動画（台帳の folder と file）・録画に付くスクショ（動画と同じ名前_<内容>）・証拠フレーム（frames/<録画>_f*、2 桁の時代は
//   frames/<動画の名前>_f*）・中間出力のキャッシュ（derived/<録画>/。meta の sha256 が台帳と同じときだけ）の番号の部分を変える。
// - 同じ番号の別の動画がある（番号が重なった）ときは、frames/<録画>_f* のうちリポジトリの文書に名前が出てくるものだけを変える。
// - 先に全部を確かめてから変える。もう変えてあるもの（移す元が無く、移す先がある）は飛ばす（途中で止まった後に回し直せる）。
// - 置き場所が無い環境（クラウド環境など）では変えず、オーナーが回す Rename-Item の行を出す。
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type CaptureRoot = { label: string; dir: string };

export type CaptureRename = {
  label: string;
  /** 置き場所（root.dir） */
  dir: string;
  /** dir からの相対 */
  from: string;
  to: string;
  kind: 'video' | 'screenshot' | 'frame' | 'derived';
  /** false なら変えずに一覧だけ出す（置き場所が無い環境） */
  apply: boolean;
};

export type CapturePlan = {
  renames: CaptureRename[];
  /** もう変えてあるもの */
  done: CaptureRename[];
  /** 止める理由 */
  problems: string[];
  /** 人が見ること（変えずに残したもの） */
  notes: string[];
};

const VIDEO = /\.(mp4|mkv|mov)$/i;
const NOT_RECORDINGS = new Set(['frames', 'derived', 'reference']);

/** ファイル名の頭（<YYYYMMDD>-<録画>_）の番号を変える。形が合わなければ undefined */
export function renumberedName(name: string, oldId: string, newId: string): string | undefined {
  const m = /^(\d{8})-(\d{2,4})_/.exec(name);
  if (m === null || m[2]!.length < 2 || Number(m[2]) !== Number(oldId)) return undefined;
  return `${m[1]}-${newId}_${name.slice(m[0].length)}`;
}

const stemOf = (file: string) => file.replace(/\.[^.]+$/, '');
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

/** 置き場所の中の、録画の番号のファイル（動画とスクショ。種別フォルダの直下）。dir からの相対 */
function numbered(dir: string, id: string): string[] {
  const out: string[] = [];
  for (const folder of list(dir)) {
    if (NOT_RECORDINGS.has(folder) || !isDir(join(dir, folder))) continue;
    for (const name of list(join(dir, folder))) {
      const m = /^\d{8}-(\d{2,4})_/.exec(name);
      if (m !== null && m[1]!.length >= 2 && Number(m[1]) === Number(id)) out.push(`${folder}/${name}`);
    }
  }
  return out;
}

export function planCaptureRenames(input: {
  roots: readonly CaptureRoot[];
  folder: string;
  file: string;
  oldId: string;
  newId: string;
  sha256: string;
  /** 証拠フレームの名前がリポジトリの文書に出てくるか */
  mentioned: (frame: string) => boolean;
}): CapturePlan {
  const { folder, file, oldId, newId } = input;
  const plan: CapturePlan = { renames: [], done: [], problems: [], notes: [] };
  const newFile = renumberedName(file, oldId, newId);
  if (newFile === undefined) {
    plan.problems.push(`台帳の file（${file}）の頭が <YYYYMMDD>-${oldId}_ の形でない`);
    return plan;
  }
  const stem = stemOf(file);
  const newStem = stemOf(newFile);
  const present = input.roots.filter((r) => isDir(r.dir));
  const missing = input.roots.filter((r) => !isDir(r.dir));

  /** 1 つの置き場所の中で変えるもの（apply は呼ぶ側が決める） */
  const planIn = (root: CaptureRoot): Omit<CaptureRename, 'apply'>[] => {
    const out: Omit<CaptureRename, 'apply'>[] = [];
    const add = (kind: CaptureRename['kind'], from: string, to: string) =>
      out.push({ label: root.label, dir: root.dir, from, to, kind });
    add('video', `${folder}/${file}`, `${folder}/${newFile}`);
    for (const name of list(join(root.dir, folder)))
      if (name.startsWith(`${stem}_`) && !VIDEO.test(name))
        add('screenshot', `${folder}/${name}`, `${folder}/${newStem}${name.slice(stem.length)}`);
    // 番号が重なっている: 同じ番号の、この録画のものでない動画かスクショがある
    const others = numbered(root.dir, oldId).filter(
      (p) => !p.startsWith(`${folder}/${stem}_`) && p !== `${folder}/${file}`,
    );
    for (const name of list(join(root.dir, 'frames'))) {
      if (name.startsWith(`${stem}_f`) && /^\d/.test(name.slice(stem.length + 2))) {
        add('frame', `frames/${name}`, `frames/${newStem}${name.slice(stem.length)}`);
      } else if (name.startsWith(`${oldId}_f`) && /^\d/.test(name.slice(oldId.length + 2))) {
        if (others.length > 0 && !input.mentioned(name)) {
          plan.notes.push(
            `${root.label} frames/${name}: 同じ番号の別の録画（${others.join('・')}）があり、文書に名前が出てこないので変えていない`,
          );
          continue;
        }
        add('frame', `frames/${name}`, `frames/${newId}${name.slice(oldId.length)}`);
      }
    }
    const derived = join(root.dir, 'derived', oldId);
    if (isDir(derived)) {
      const metas = list(derived).filter((n) => n.endsWith('.meta.json'));
      const shas = metas.map((n) => (JSON.parse(readFileSync(join(derived, n), 'utf8')) as { sha256?: string }).sha256);
      if (metas.length > 0 && shas.every((s) => s === input.sha256))
        add('derived', `derived/${oldId}`, `derived/${newId}`);
      else
        plan.notes.push(
          `${root.label} derived/${oldId}/: キャッシュの sha256 が台帳（${input.sha256}）と違うか meta が無いので変えていない（作り直されるだけ）`,
        );
    }
    return out;
  };

  for (const root of present) {
    for (const r of planIn(root)) {
      const from = existsSync(join(root.dir, r.from));
      const to = existsSync(join(root.dir, r.to));
      if (from && to) plan.problems.push(`${root.label} ${r.to} が既にある（${r.from} を移せない）`);
      else if (from) plan.renames.push({ ...r, apply: true });
    }
    // もう変えてあるもの（回し直し）: 新しい名前の動画・スクショ・フレーム・キャッシュ
    const doneVideo = existsSync(join(root.dir, folder, newFile)) && !existsSync(join(root.dir, folder, file));
    if (doneVideo)
      plan.done.push({
        label: root.label,
        dir: root.dir,
        from: `${folder}/${file}`,
        to: `${folder}/${newFile}`,
        kind: 'video',
        apply: false,
      });
    else if (!existsSync(join(root.dir, folder, file))) plan.notes.push(`${root.label} に ${folder}/${file} が無い`);
    // 新しい番号のファイルが既にあれば止める。動画をもう変えてあれば（回し直し）、新しい番号のものはこの録画のものと読む
    if (!doneVideo) {
      const taken = [
        ...numbered(root.dir, newId),
        ...list(join(root.dir, 'frames'))
          .filter((n) => n.startsWith(`${newId}_f`) || n.startsWith(`${newStem}_f`))
          .map((n) => `frames/${n}`),
        ...(isDir(join(root.dir, 'derived', newId)) ? [`derived/${newId}`] : []),
      ];
      for (const p of taken) plan.problems.push(`${root.label} に新しい番号のファイル ${p} が既にある`);
    }
  }

  // 片方の置き場所にしか無いもの（まだ同期していないフレームなど）。変えた後の名前で、次に手で同期する
  for (const a of present)
    for (const b of present) {
      if (a === b) continue;
      for (const r of plan.renames.filter((x) => x.label === a.label && x.kind !== 'video'))
        if (!existsSync(join(b.dir, r.from)) && !existsSync(join(b.dir, r.to)))
          plan.notes.push(`${b.label} に ${r.from} が無い（${a.label} で ${r.to} にした。同期は手で）`);
    }

  // 置き場所が無い環境: ある方の置き場所の計画を写すか、動画だけを出す
  const model = present[0];
  for (const root of missing) {
    const base =
      model === undefined
        ? [{ from: `${folder}/${file}`, to: `${folder}/${newFile}`, kind: 'video' as const }]
        : plan.renames.filter((r) => r.label === model.label);
    for (const r of base)
      plan.renames.push({ label: root.label, dir: root.dir, from: r.from, to: r.to, kind: r.kind, apply: false });
    plan.notes.push(
      model === undefined
        ? `${root.label}（${root.dir}）が無い環境。下の Rename-Item のほか、${folder}/${stem}_*（スクショ）・frames/${stem}_f*・frames/${oldId}_f*・derived/${oldId}/ があれば同じく変える`
        : `${root.label}（${root.dir}）が無い環境。${model.label} と同じものを、下の Rename-Item で変える`,
    );
  }
  plan.problems = [...new Set(plan.problems)];
  return plan;
}

/** オーナーが回す PowerShell の行 */
export function renameCommand(r: CaptureRename): string {
  const name = r.to.split('/').pop()!;
  return `Rename-Item -LiteralPath '${join(r.dir, r.from).replace(/'/g, "''")}' -NewName '${name.replace(/'/g, "''")}'`;
}

/**
 * apply の名前を変える（キャッシュの meta の video も直す）。途中で失敗したら、そこで止めて、変えたものと失敗を返す。
 * oldFile・newFile は meta の video を直すのに使う
 */
export function applyCaptureRenames(
  renames: readonly CaptureRename[],
  oldFile: string,
  newFile: string,
): { applied: CaptureRename[]; error?: string } {
  const applied: CaptureRename[] = [];
  for (const r of renames) {
    if (!r.apply) continue;
    try {
      renameSync(join(r.dir, r.from), join(r.dir, r.to));
      if (r.kind === 'derived')
        for (const n of readdirSync(join(r.dir, r.to)).filter((x) => x.endsWith('.meta.json'))) {
          const p = join(r.dir, r.to, n);
          const meta = JSON.parse(readFileSync(p, 'utf8')) as { video?: string };
          if (typeof meta.video === 'string') meta.video = meta.video.replace(oldFile, newFile);
          writeFileSync(p, `${JSON.stringify(meta, null, 2)}\n`);
        }
      applied.push(r);
    } catch (e) {
      return { applied, error: `${r.label} ${r.from} → ${r.to}: ${(e as Error).message}` };
    }
  }
  return { applied };
}
