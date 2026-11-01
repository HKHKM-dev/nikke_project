// 残っている仕事の一覧（plan/backlog.md）を、課題のファイル（records/backlog/<名前>.json。1 件 1 ファイル）と雛形
// （records/backlog/template.md）から作る（plan/design-backlog-files.md）。読む・検査・書くの純粋な部分。
import { idReferencesIn } from './references.ts';

/** 課題のファイルの中身（2.1 節） */
export type BacklogFile = {
  /** 節の番号（雛形の印にあるもの） */
  section: string;
  /** 節の中の並び（小さいほど上）。`#` の列のある節（番号順）は持たない */
  order?: number;
  /** 表の節: 列の名前 → セルの文（`#` の列は持たない。ファイル名から出す） */
  cells?: Record<string, string>;
  /** 箇条の節: 行頭の `- ` を除いた 1 行 */
  text?: string;
};

/** name はファイル名から .json を除いたもの */
export type BacklogItem = BacklogFile & { name: string };

/** 雛形の印 1 つ。columns が無ければ箇条の節 */
export type BacklogSlot = { section: string; columns?: string[] };

/** `#` の列（ファイル名の番号を出す列） */
export const ID_COLUMN = '#';

const MARKER = /^<!-- backlog (\S+)(?: (\|.*\|))? -->$/;
/** 番号のない課題の名前（英小文字・数字・ハイフン） */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NUMBERED = /^(\d+(?:\.\d+)?)-(\d+)$/;

function slotOf(line: string): BacklogSlot | undefined {
  const m = MARKER.exec(line.trim());
  if (m === null) return undefined;
  if (m[2] === undefined) return { section: m[1]! };
  const columns = m[2]
    .split('|')
    .map((c) => c.trim())
    .filter((c) => c !== '');
  return { section: m[1]!, columns };
}

/** 雛形の印（書いた順） */
export function parseBacklogTemplate(template: string): BacklogSlot[] {
  return template.split('\n').flatMap((line) => slotOf(line) ?? []);
}

/** 節の中の並び: `#` の列のある節は番号順、ほかは order の小さい順（同じなら名前順） */
function sortItems(slot: BacklogSlot, items: readonly BacklogItem[]): BacklogItem[] {
  const numbered = slot.columns?.includes(ID_COLUMN) === true;
  const num = (i: BacklogItem) => Number(NUMBERED.exec(i.name)?.[2] ?? NaN);
  return [...items].sort((a, b) =>
    numbered ? num(a) - num(b) : (a.order ?? 0) - (b.order ?? 0) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
}

function renderSlot(slot: BacklogSlot, items: readonly BacklogItem[]): string[] {
  if (items.length === 0) return ['（なし）'];
  const sorted = sortItems(slot, items);
  if (slot.columns === undefined) return sorted.map((i) => `- ${i.text ?? ''}`);
  const row = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [
    '<!-- prettier-ignore -->',
    row(slot.columns),
    row(slot.columns.map(() => '---')),
    ...sorted.map((i) => row(slot.columns!.map((c) => (c === ID_COLUMN ? i.name : (i.cells?.[c] ?? ''))))),
  ];
}

/** plan/backlog.md の中身（雛形の印を、その節の課題の表・箇条か「（なし）」に置き換える） */
export function renderBacklog(template: string, items: readonly BacklogItem[]): string {
  return template
    .split('\n')
    .flatMap((line) => {
      const slot = slotOf(line);
      return slot === undefined
        ? [line]
        : renderSlot(
            slot,
            items.filter((i) => i.section === slot.section),
          );
    })
    .join('\n');
}

export type BacklogContext = {
  /** あるかを見る ID（検証記録・結論・録画・観測値） */
  ids: ReadonlySet<string>;
  /** plan/ からの相対パスのファイルがあるか */
  exists: (pathFromPlan: string) => boolean;
};

/** 文の中のリンクの先（外のリンクとページの中の印は除く。#… は外す） */
function relativeLinks(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1]!)
    .filter((href) => !/^[a-z]+:/i.test(href) && !href.startsWith('#'))
    .map((href) => href.replace(/#.*$/, ''));
}

/** 課題のファイルと雛形の検査（plan/design-backlog-files.md 2.7 節）。問題の文の一覧 */
export function validateBacklog(
  slots: readonly BacklogSlot[],
  items: readonly BacklogItem[],
  ctx: BacklogContext,
): string[] {
  const errors: string[] = [];
  const bySection = new Map<string, BacklogSlot>();
  for (const s of slots) {
    if (bySection.has(s.section)) errors.push(`backlog の雛形: 節 ${s.section} の印が 2 つある`);
    bySection.set(s.section, s);
  }
  for (const item of items) {
    const at = `records/backlog/${item.name}.json`;
    const slot = bySection.get(item.section);
    if (slot === undefined) {
      errors.push(`${at}: 節 ${item.section} が雛形（records/backlog/template.md）の印に無い`);
      continue;
    }
    const numbered = slot.columns?.includes(ID_COLUMN) === true;
    const n = NUMBERED.exec(item.name);
    if (numbered && n?.[1] !== item.section)
      errors.push(`${at}: 節 ${item.section} の課題は、名前を番号（${item.section}-NN）にする`);
    if (!numbered && (n !== null || !SLUG.test(item.name)))
      errors.push(`${at}: 名前は英小文字・数字・ハイフンにし、番号（N-NN）の形にしない（番号は # の列のある節だけ）`);
    if (numbered && item.order !== undefined) errors.push(`${at}: 節 ${item.section} は番号順なので order を持たない`);
    if (!numbered && (typeof item.order !== 'number' || !Number.isFinite(item.order)))
      errors.push(`${at}: order（節の中の並び。数）が無い`);
    if (item.cells !== undefined && item.text !== undefined) errors.push(`${at}: cells と text の両方がある`);
    let texts: string[];
    if (slot.columns === undefined) {
      if (typeof item.text !== 'string' || item.text.trim() === '')
        errors.push(`${at}: 節 ${item.section} は箇条なので text が要る`);
      texts = [item.text ?? ''];
    } else {
      const want = slot.columns.filter((c) => c !== ID_COLUMN);
      const got = Object.keys(item.cells ?? {});
      if (item.cells === undefined || want.join('\u0000') !== got.join('\u0000'))
        errors.push(
          `${at}: 節 ${item.section} は表なので cells の列を ${want.join('・')} の順にする（いま ${got.join('・') || 'なし'}）`,
        );
      texts = Object.values(item.cells ?? {});
      for (const t of texts)
        if (/(?<!\\)\|/.test(t)) errors.push(`${at}: セルにエスケープしていない | がある（\\| にする）`);
    }
    for (const t of texts) {
      if (typeof t !== 'string') {
        errors.push(`${at}: 文でない値がある`);
        continue;
      }
      if (/[\r\n]/.test(t)) errors.push(`${at}: 文に改行がある（1 行で書く）`);
      for (const r of idReferencesIn(t)) if (!ctx.ids.has(r.id)) errors.push(`${at}: ${r.id} が無い`);
      for (const href of relativeLinks(t))
        if (!ctx.exists(href)) errors.push(`${at}: リンクの先 ${href}（plan/ からの相対パス）が無い`);
    }
  }
  return errors;
}

/** 番号の課題の名前（`2-44` など）。ほかは undefined */
export function backlogNumber(name: string): { section: string; n: number } | undefined {
  const m = NUMBERED.exec(name);
  return m === null ? undefined : { section: m[1]!, n: Number(m[2]) };
}

/** records/backlog/<名前>.json のパスから名前（雛形などは undefined） */
export function backlogNameOfPath(path: string): string | undefined {
  return /^records\/backlog\/([^/]+)\.json$/.exec(path.trim())?.[1];
}

/** 進み具合の書き写しを見る節（8 節と、その下の 8.2 節。plan/design-backlog-files.md 2.8 節） */
export function isIssueSection(section: string): boolean {
  return section === '8' || section.startsWith('8.');
}

/**
 * 手で直した plan/backlog.md の行（2.11 節）: ブランチで足した行のうち、課題のファイルと雛形から作った版に無いもの。
 * 空の行は見ない
 */
export function handEditedLines(addedLines: readonly string[], generated: string): string[] {
  const lines = new Set(generated.split('\n'));
  return addedLines.filter((l) => l.trim() !== '' && !lines.has(l));
}
