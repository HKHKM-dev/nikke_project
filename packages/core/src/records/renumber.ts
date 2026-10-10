// 番号の振り直し（plan/design-investigation-review.md 4.3・5 節）。npm run records:renumber の純粋な部分。
// 検証記録（V-NNNN）・結論（C-NNNN）・観測値（<録画>-NN）の番号を、文書とデータの中の参照ごと置き換える。
import { compressIds } from './relevance.ts';

export type RenumberKind = 'verification' | 'claim' | 'observation';

const V_ID = /^V-\d{4,}$/;
const C_ID = /^C-\d{4,}$/;
const OBS_ID = /^((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})$/;

/** ID の種類（形が合わなければ undefined） */
export function renumberKind(id: string): RenumberKind | undefined {
  if (V_ID.test(id)) return 'verification';
  if (C_ID.test(id)) return 'claim';
  if (OBS_ID.test(id)) return 'observation';
  return undefined;
}

/** 古い ID と新しい ID の組の検査。誤りがあれば文を返す */
export function renumberProblems(oldId: string, newId: string): string[] {
  const a = renumberKind(oldId);
  const b = renumberKind(newId);
  if (a === undefined) return [`${oldId}: V-NNNN・C-NNNN・<録画>-NN のどれでもない`];
  if (b === undefined) return [`${newId}: V-NNNN・C-NNNN・<録画>-NN のどれでもない`];
  if (a !== b) return [`${oldId} と ${newId} の種類が違う`];
  if (oldId === newId) return ['古い ID と新しい ID が同じ'];
  if (a === 'observation' && OBS_ID.exec(oldId)![1] !== OBS_ID.exec(newId)![1])
    return [`観測値の振り直しは同じ録画の中だけ（${oldId} と ${newId} は録画が違う）`];
  return [];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 文の中の ID（前後に英数字・- が続く所、つまり別の番号の一部は除く） */
const wholeId = (id: string) => new RegExp(`(?<![A-Za-z0-9-])${escape(id)}(?![0-9])`, 'g');

/** ID を前（録画か V・C）と番号に分ける */
function split(id: string): { head: string; n: number } | undefined {
  const m = /^(.+)-(\d+)$/.exec(id);
  return m === null ? undefined : { head: m[1]!, n: Number(m[2]) };
}

/** 根拠の書き方の観測値の範囲（「`<録画>-NN`〜`<録画>-MM`」。claims.ts の observationIdsIn が展開する形） */
const OBS_RANGE = /`((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})`\s*〜\s*`\1-(\d{2,})`/g;
/** 範囲の書き方の全般（バッククォートの有無を問わない。V・C の「C-NNNN〜C-MMMM」も） */
const LOOSE_RANGE = /(?<![A-Za-z0-9-])`?(\d{3,}|L-[A-Z]{1,3}|V|C)-(\d{2,})`?\s*[〜～~]\s*`?\1-(\d{2,})`?(?![0-9])/g;

/** 文の中の行の番号（1 から） */
const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** 範囲の書き方のうち、ID を含むもの（端も含む）。行の番号つき */
export function rangesContaining(text: string, id: string): { range: string; line: number }[] {
  const s = split(id);
  if (s === undefined) return [];
  const out: { range: string; line: number }[] = [];
  for (const m of text.matchAll(LOOSE_RANGE)) {
    if (m[1] !== s.head) continue;
    if (Number(m[2]) <= s.n && s.n <= Number(m[3])) out.push({ range: m[0], line: lineOf(text, m.index) });
  }
  return out;
}

/** 文が ID に触れている数（そのままの ID と、ID を含む範囲の書き方）。新しい ID がどこにも出てこないことの確かめに使う */
export function mentions(text: string, id: string): number {
  return [...text.matchAll(wholeId(id))].length + rangesContaining(text, id).length;
}

/**
 * 文の中の古い ID を新しい ID に置き換える。観測値の根拠の書き方の範囲（「`<録画>-NN`〜`<録画>-MM`」）に古い ID が入っていれば、展開して
 * 置き換えてからまとめ直す（範囲の意味を保つ）。それ以外の範囲の書き方（V・C の範囲、バッククォートの無い観測値の範囲）に古い ID が
 * 入っていれば、ID は置き換え、範囲は ranges に出す（人が直す）。count は置き換えた所の数
 */
export function renumberInText(
  text: string,
  oldId: string,
  newId: string,
): { text: string; count: number; ranges: { range: string; line: number }[] } {
  let count = 0;
  let out = text;
  const s = split(oldId);
  if (renumberKind(oldId) === 'observation' && s !== undefined) {
    out = out.replace(OBS_RANGE, (whole, rec: string, lo: string, hi: string) => {
      if (rec !== s.head || !(Number(lo) <= s.n && s.n <= Number(hi))) return whole;
      count++;
      const ids: string[] = [];
      for (let n = Number(lo); n <= Number(hi); n++) ids.push(`${rec}-${String(n).padStart(lo.length, '0')}`);
      const mapped = ids.map((id) => (id === oldId ? newId : id));
      const num = (id: string) => split(id)!.n;
      return compressIds([...new Set(mapped)].sort((a, b) => num(a) - num(b))).join('・');
    });
  }
  const ranges = rangesContaining(out, oldId);
  out = out.replace(wholeId(oldId), () => {
    count++;
    return newId;
  });
  return { text: out, count, ranges };
}
