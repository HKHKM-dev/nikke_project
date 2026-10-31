// クラウドのセッションと Drive の nikke_sync の往復の決まりごと（plan/design-cloud-environment.md 6.1・6.2 節）。テストのために、
// 受け口を呼ぶ部分（cloud-sync.ts）と分ける。

/** Drive の nikke_sync の下のパスを、クラウドの手元の置き場所に読み替える。扱わないものは null */
export function localPathOf(
  drivePath: string,
  places: { repo: string; memoryDir: string; memoryProject: string },
): string | null {
  if (drivePath.startsWith('private/') || drivePath.startsWith('scratch/')) return `${places.repo}/${drivePath}`;
  const memory = `claude/projects/${places.memoryProject}/memory/`;
  if (drivePath.startsWith(memory)) return `${places.memoryDir}/${drivePath.slice(memory.length)}`;
  return null;
}

/** 手元の置き場所（private・scratch・メモリ）と、その Drive の nikke_sync の下の頭・知らせでの呼び名 */
export function trackedRoots(places: { repo: string; memoryDir: string; memoryProject: string }) {
  return [
    { local: `${places.repo}/private`, drive: 'private', label: 'private/' },
    { local: `${places.repo}/scratch`, drive: 'scratch', label: 'scratch/' },
    { local: places.memoryDir, drive: `claude/projects/${places.memoryProject}/memory`, label: 'メモリ' },
  ];
}
export type TrackedRoot = ReturnType<typeof trackedRoots>[number];

/** クラウドの往復で、受け口を 1 回呼んで待つ長さ（ふだんは一覧が 10 秒、1 件が 3 秒ほど。止まっていたら、フックの終わりより前に知らせる） */
export const CALL_MS = 45_000;

/**
 * 手元の版を受け口へ送るか。基準（前に取った・戻した版）と同じか、前に衝突を返された版のままなら送らない
 * （送り直すと、受け口が同じ中身の衝突ファイルを次の番号で作り続ける）
 */
export function shouldPut(md5: string, base: string | undefined, conflicted: string | undefined): boolean {
  return md5 !== base && md5 !== conflicted;
}

/** put の結果を基準に書き込む。衝突なら基準は動かさず、衝突を返された手元の版の md5 を覚える */
export function settlePut(
  base: Record<string, string>,
  conflicts: Record<string, string>,
  path: string,
  localMd5: string,
  result: { md5: string; conflict?: boolean },
): void {
  if (result.conflict) {
    conflicts[path] = localMd5;
    return;
  }
  base[path] = result.md5;
  delete conflicts[path];
}

/**
 * 手元（パス → md5）を、前に取ったときの基準と比べる。変わった・増えたものは put、消えたものは trash。
 * 前に衝突を返された版のままのもの（conflicts）は put しない
 */
export function diffAgainstBase(
  local: ReadonlyMap<string, string>,
  base: Readonly<Record<string, string>>,
  conflicts: Readonly<Record<string, string>> = {},
): { put: { path: string; baseMd5: string | null }[]; trash: { path: string; baseMd5: string }[] } {
  const put: { path: string; baseMd5: string | null }[] = [];
  const trash: { path: string; baseMd5: string }[] = [];
  for (const [path, md5] of local) {
    const was = base[path];
    if (shouldPut(md5, was, conflicts[path])) put.push({ path, baseMd5: was ?? null });
  }
  for (const [path, md5] of Object.entries(base)) if (!local.has(path)) trash.push({ path, baseMd5: md5 });
  return { put, trash };
}

/**
 * Drive の版で手元のファイルを上書きしてよいか。手元に無いか、応答の終わりに送らないもの（shouldPut の逆。前に取った・戻した版のまま、
 * 衝突として送った版のまま）か、Drive と同じ中身なら上書きする。それ以外は Drive にまだ送っていない手元の変更なので残し、応答の終わりに
 * 送る（Drive 側も変わっていれば衝突になる）
 */
export function shouldOverwrite(
  local: string | undefined,
  base: string | undefined,
  conflicted: string | undefined,
  drive: string,
): boolean {
  return local === undefined || local === drive || !shouldPut(local, base, conflicted);
}

/** Drive の一覧の 1 件の大きさと更新時刻（前に置いたときと同じなら取り直さない。デスクトップの rclone と同じ比べ方） */
export const stampOf = (f: { size: number; modified: string }) => `${f.size} ${f.modified}`;

/** 取り直しの計画（1 つの根の分） */
export type PullPlan = {
  /** 前に置いたときから Drive で変わったか、まだ置いていないので、中身を取るもの */
  fetch: string[];
  /** Drive で消えて、手元は前に取ったときのままなので、手元からも消すもの */
  remove: string[];
  /** この根の新しい基準・衝突の記憶・置いたときの一覧の値（取るものは、置くまで前のものを引き継ぐ） */
  files: Record<string, string>;
  conflicts: Record<string, string>;
  seen: Record<string, string>;
};

/**
 * 1 つの根（private・scratch・メモリ）を Drive に合わせる計画。listed は Drive の一覧（パス → stampOf）、local は手元（パス → md5）、
 * old は前の基準・衝突の記憶・置いたときの一覧の値。Drive の一覧の値が置いたときと同じものは取らない。
 * listedFiles は、一覧を取り始める前の基準（files）。一覧の後に応答の終わりの --push が基準を進めたもの（送ったばかりで一覧に無い）は、
 * Drive で消えたものと見なさない。省略は old.files と同じ（一覧から計画まで lock を持っている）
 */
export function planPull(
  listed: ReadonlyMap<string, string>,
  local: ReadonlyMap<string, string>,
  old: {
    files: Readonly<Record<string, string>>;
    conflicts: Readonly<Record<string, string>>;
    seen: Readonly<Record<string, string>>;
  },
  listedFiles: Readonly<Record<string, string>> = old.files,
): PullPlan {
  const out: PullPlan = { fetch: [], remove: [], files: {}, conflicts: {}, seen: {} };
  const carry = (path: string) => {
    for (const [from, to] of [
      [old.files, out.files],
      [old.conflicts, out.conflicts],
      [old.seen, out.seen],
    ] as const)
      if (from[path] !== undefined) to[path] = from[path];
  };
  for (const [path, stamp] of listed) {
    carry(path);
    if (old.seen[path] !== stamp) out.fetch.push(path);
  }
  // Drive で消えたもの: 手元が前に取ったときのままなら手元からも消す。手元で変わっていれば残し、応答の終わりに戻す
  for (const [path, md5] of local) {
    if (listed.has(path)) continue;
    if (md5 === old.files[path] && listedFiles[path] === old.files[path]) out.remove.push(path);
    else carry(path);
  }
  return out;
}

/**
 * items を n 本ずつ並べて fn に渡す。now() が until を過ぎたら新しく始めない。始めなかったものと、until を過ぎてから失敗したもの
 * （時間切れで打ち切ったもの）は rest に、それより前に失敗したものは failed に入れて返す
 */
export async function runUntil<T>(
  items: readonly T[],
  n: number,
  until: number,
  fn: (item: T) => Promise<void>,
  now: () => number = Date.now,
): Promise<{ rest: T[]; failed: { item: T; error: unknown }[] }> {
  const rest: T[] = [];
  const failed: { item: T; error: unknown }[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length && now() < until) {
      const item = items[next++]!;
      try {
        await fn(item);
      } catch (error) {
        if (now() >= until) rest.push(item);
        else failed.push({ item, error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return { rest: [...rest, ...items.slice(next)], failed };
}

/** クラウドの ~/.claude/CLAUDE.md の中身（全体の指示と、自動メモリの代わりの節。設計書 6.1 節） */
export function cloudClaudeMd(globalMd: string, memoryIndex: string, memoryDir: string): string {
  return [
    globalMd.trim(),
    '',
    '# メモリ（クラウド）',
    '',
    'このセッションはクラウドで動いていて、自動メモリが使えない。代わりに、デスクトップの自動メモリと同じものを下に置いた（セッションの始めのフックが Google Drive から取った。plan/design-cloud-environment.md 6.1 節）。',
    '',
    `- 本文は \`${memoryDir}\` にある（1 件 1 ファイル）。要るものは Read で読む。`,
    '- 新しく覚えることは、デスクトップの自動メモリと同じ形式（frontmatter に name・description・metadata.type、本文、[[name]] のリンク）で、そのフォルダに 1 件 1 ファイルで書き、下の索引（MEMORY.md）にも 1 行足す。古くなったものは直すか消す。',
    '- 書いたものは、応答の終わりのフックが Drive に戻し、デスクトップのメモリにも届く。',
    '- `private/`（owner.md）と `scratch/` は、リポジトリの直下に置く（デスクトップのメインのチェックアウトと同じ相対パス）。`scratch/` は始めのフックの後に裏で置くので、数分は揃っていないことがある（plan/cloud-guide.md「困ったとき」）。直したものも応答の終わりに戻る。',
    '',
    '## 索引（MEMORY.md）',
    '',
    memoryIndex.trim(),
    '',
  ].join('\n');
}
