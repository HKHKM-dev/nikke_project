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

/** 手元の置き場所（private・scratch・メモリ）と、その Drive の nikke_sync の下の頭 */
export function trackedRoots(places: { repo: string; memoryDir: string; memoryProject: string }) {
  return [
    { local: `${places.repo}/private`, drive: 'private' },
    { local: `${places.repo}/scratch`, drive: 'scratch' },
    { local: places.memoryDir, drive: `claude/projects/${places.memoryProject}/memory` },
  ];
}

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
    '- `private/`（owner.md）と `scratch/` は、リポジトリの直下に置いた（デスクトップのメインのチェックアウトと同じ相対パス）。直したものも応答の終わりに戻る。',
    '',
    '## 索引（MEMORY.md）',
    '',
    memoryIndex.trim(),
    '',
  ].join('\n');
}
