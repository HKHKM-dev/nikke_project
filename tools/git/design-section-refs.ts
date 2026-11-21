// 設計書のほかのファイル（コード・データ・AGENTS.md・手引きなど）が「設計書のファイル名と N 節」の形で指す設計書の節が、その設計書に
// 見出しとしてあるかを見る（plan/design-design-doc-trim.md 5 節・9 節）。設計書は要らない記述を消してよいが、現状の文書・コードの
// コメント・データが指す節は残す（AGENTS.md「文書の書き方」の設計の型）。記録・設計書・生成物・凍結の文書は書いた時点の版を指すので
// 見ない。リポジトリの全部を見る確かめは design-section-refs.test.ts にあり、npm test（pr:prep と GitHub の CI）で回る。テストや例で
// 仮の設計書の名前と節を書くときは、文字列をつないで書く（そのまま書くと、切れた参照として落ちる）。

/** 設計書のパス（AGENTS.md「記録の置き場所」の設計書の行） */
const DESIGN_DOC = /^plan\/(?:design-[^/]+|burst-effect-delay-candidates)\.md$/;

/** 書いた時点の版を指してよいもの: 記録（records/ のうち課題と README のほか）と、凍結の文書・記録の型の plan/ の文書 */
const POINT_IN_TIME =
  /^(?:records\/(?!backlog\/|(?:[^/]+\/)*README\.md$)|plan\/(?:verification|roadmap-archive|captures\/legacy-usage|captures\/backup-log[^/]*)\.md$)/;

/** 文を持つファイル */
const TEXT = /\.(?:ts|tsx|mts|js|mjs|cjs|json|md|ya?ml|css|html)$/;

export function isDesignDoc(path: string): boolean {
  return DESIGN_DOC.test(path);
}

/** 参照を見る側か。generated は生成物のパス */
export function isCurrentSource(path: string, generated: readonly string[]): boolean {
  return TEXT.test(path) && !isDesignDoc(path) && !POINT_IN_TIME.test(path) && !generated.includes(path);
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

// 設計書のファイル名（リンクの形・plan/ 付きも）の直後の「3 節」「の 2.5 節」。1 つ目の組はファイル名の前のディレクトリ
const REF =
  /(?<![\w./-])((?:[\w.-]+\/)*)(design-[\w.-]+?|burst-effect-delay-candidates)\.md\)?\s*(?:の\s*)?(\d+(?:\.\d+)*)\s*節/g;

/** 文の中の、設計書の節への参照 */
export function sectionRefs(path: string, text: string): SectionRef[] {
  const out: SectionRef[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    for (const m of l.matchAll(REF))
      // plan/ のほかのディレクトリの design-*.md は設計書でない
      if (m[1] === '' || m[1]!.endsWith('plan/'))
        out.push({ path, line: i + 1, doc: `plan/${m[2]}.md`, section: m[3]! });
  });
  return out;
}

/** 設計書の見出し（"## 3. 題" "### 2.5 題" など）の節の番号。コードブロック（``` か ~~~ で囲んだ行）の中は見ない */
export function headingNumbers(text: string): Set<string> {
  const out = new Set<string>();
  let fenced = false;
  for (const l of text.split(/\r?\n/)) {
    if (/^\s*(?:```|~~~)/.test(l)) fenced = !fenced;
    if (fenced) continue;
    const m = /^#{1,6}\s+(\d+(?:\.\d+)*)(?:[.\s]|$)/.exec(l);
    if (m) out.add(m[1]!);
  }
  return out;
}

/** 見る側のファイル（sources）の、切れた参照（指す設計書が無いか、指す節の見出しが無い）。read はファイルの中身（無ければ undefined） */
export function brokenSectionRefs(
  sources: readonly string[],
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
    return text === undefined ? [] : sectionRefs(path, text).filter((r) => !headsOf(r.doc)?.has(r.section));
  });
}
