// 現状の型のファイル（コード・AGENTS.md・手引きなど）が「設計書のファイル名と N 節」の形で指す設計書の節が、その設計書に見出しとしてあるかを見る
// （plan/design-design-doc-trim.md 5 節）。設計書は要らない記述を消してよいが、現状の文書とコードのコメントが指す節は残す（AGENTS.md
// 「文書の書き方」の設計の型）。記録・設計書・生成物・凍結の文書は書いた時点の版を指すので見ない。

/** 設計書のパス（AGENTS.md「記録の置き場所」の設計書の行） */
const DESIGN_DOC = /^plan\/(?:design-[^/]+|burst-effect-delay-candidates)\.md$/;

/** 凍結の文書と、記録の型の plan/ の文書（AGENTS.md「記録の置き場所」） */
const NOT_CURRENT = [
  /^plan\/verification\.md$/,
  /^plan\/roadmap-archive\.md$/,
  /^plan\/captures\/legacy-usage\.md$/,
  /^plan\/captures\/backup-log[^/]*\.md$/,
];

export function isDesignDoc(path: string): boolean {
  return DESIGN_DOC.test(path);
}

/** 参照を見る側（現状の型のファイル）か。generated は生成物のパス */
export function isCurrentSource(path: string, generated: readonly string[]): boolean {
  if (generated.includes(path)) return false;
  if (/^(?:packages|apps|tools)\/.+\.(?:ts|tsx|mts|js|mjs|cjs)$/.test(path)) return !path.includes('/node_modules/');
  if (path === 'AGENTS.md' || path === 'README.md') return true;
  if (/^records\/backlog\/[^/]+\.json$/.test(path)) return true;
  if (/^records\/(?:[^/]+\/)*README\.md$/.test(path)) return true;
  if (/^plan\/.+\.md$/.test(path)) return !isDesignDoc(path) && !NOT_CURRENT.some((re) => re.test(path));
  return false;
}

export interface SectionRef {
  /** 指している側のファイル */
  path: string;
  /** 1 始まりの行の番号 */
  line: number;
  /** 指している設計書のパス（plan/ から） */
  doc: string;
  /** 節の番号（"2.5" など） */
  section: string;
}

// 設計書のファイル名（リンクの形・plan/ 付きも）の直後の「3 節」「の 2.5 節」
const REF = /(design-[\w.-]+?|burst-effect-delay-candidates)\.md\)?\s*(?:の\s*)?(\d+(?:\.\d+)*)\s*節/g;

/** 文の中の、設計書の節への参照 */
export function sectionRefs(path: string, text: string): SectionRef[] {
  const out: SectionRef[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(REF)) out.push({ path, line: i + 1, doc: `plan/${m[1]}.md`, section: m[2]! });
  });
  return out;
}

/** 設計書の見出し（"## 3. 題" "### 2.5 題" など）の節の番号 */
export function headingNumbers(text: string): Set<string> {
  const out = new Set<string>();
  for (const l of text.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(\d+(?:\.\d+)*)(?:[.\s]|$)/.exec(l);
    if (m) out.add(m[1]!);
  }
  return out;
}

/**
 * 切れた参照（指す設計書が無いか、指す節の見出しが無い）。見るのは、ブランチで変えた見る側のファイル（changedSources）の参照と、
 * ブランチで変えた（消した）設計書（changedDesigns）を指す参照だけ（main に切れた参照があっても、関係の無いブランチを止めない）。
 * sources は見る側のファイルの全部、read はファイルの中身（無ければ undefined）
 */
export function brokenSectionRefs(
  sources: readonly string[],
  changedSources: ReadonlySet<string>,
  changedDesigns: ReadonlySet<string>,
  read: (path: string) => string | undefined,
): SectionRef[] {
  const heads = new Map<string, Set<string> | undefined>();
  const headsOf = (doc: string) => {
    if (!heads.has(doc)) {
      const text = read(doc);
      heads.set(doc, text === undefined ? undefined : headingNumbers(text));
    }
    return heads.get(doc);
  };
  return sources.flatMap((path) => {
    const text = read(path);
    if (text === undefined) return [];
    return sectionRefs(path, text).filter(
      (r) => (changedSources.has(path) || changedDesigns.has(r.doc)) && !headsOf(r.doc)?.has(r.section),
    );
  });
}

/**
 * git でファイルの一覧とブランチ（base...HEAD）の変更を読んで、brokenSectionRefs で決める。run は git を引数で呼んで標準出力を返すもの
 * （-z の出力を nul で分けるのは呼ぶ側の paths）、read は作業ツリーのファイルの中身。ブランチが設計書も見る側のファイルも変えていなければ
 * ファイルを読まない
 */
export function branchBrokenSectionRefs(
  base: string,
  paths: (args: readonly string[]) => string[],
  generated: readonly string[],
  read: (path: string) => string | undefined,
): SectionRef[] {
  const changed = paths(['diff', '--name-only', `${base}...HEAD`]);
  const changedDesigns = new Set(changed.filter(isDesignDoc));
  const changedSources = new Set(changed.filter((p) => isCurrentSource(p, generated)));
  if (changedDesigns.size === 0 && changedSources.size === 0) return [];
  const sources = paths(['ls-files']).filter((p) => isCurrentSource(p, generated));
  return brokenSectionRefs(sources, changedSources, changedDesigns, read);
}
