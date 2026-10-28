// 番号の振り直し（plan/design-investigation-review.md 4.3・5 節）。npm run records:renumber の純粋な部分。
// 検証記録（V-NNNN）・結論（C-NNNN）・観測値（<録画>-NN）・録画（NNN。plan/design-recording-renumber.md）の番号を、文書とデータの中の
// 参照ごと置き換える。
import { C_ID, V_ID } from './ids.ts';
import { compressIds } from './relevance.ts';

export type RenumberKind = 'verification' | 'claim' | 'observation' | 'recording';

const OBS_ID = /^((?:\d{3,}|L-[A-Z]{1,3}))-(\d{2,})$/;
/**
 * 録画の番号（3〜4 桁。L- の旧の録画は振り直さない。plan/design-recording-renumber.md 3 節）。古い番号は古い文を読むため 3 桁も受ける。
 * 新しい番号の 4 桁は records-renumber.ts が ids.ts の RECORDING_ID で見る（plan/design-recording-id-4digit.md 6 節）
 */
const REC_ID = /^\d{3,4}$/;

/** ID の種類（形が合わなければ undefined） */
export function renumberKind(id: string): RenumberKind | undefined {
  if (V_ID.test(id)) return 'verification';
  if (C_ID.test(id)) return 'claim';
  if (OBS_ID.test(id)) return 'observation';
  if (REC_ID.test(id)) return 'recording';
  return undefined;
}

/** 古い ID と新しい ID の組の検査。誤りがあれば文を返す */
export function renumberProblems(oldId: string, newId: string): string[] {
  const a = renumberKind(oldId);
  const b = renumberKind(newId);
  if (a === undefined) return [`${oldId}: V-NNNN・C-NNNN・<録画>-NN・録画（3〜4 桁）のどれでもない`];
  if (b === undefined) return [`${newId}: V-NNNN・C-NNNN・<録画>-NN・録画（3〜4 桁）のどれでもない`];
  if (a !== b) return [`${oldId} と ${newId} の種類が違う`];
  if (oldId === newId || (a === 'recording' && Number(oldId) === Number(newId))) return ['古い ID と新しい ID が同じ'];
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

// ---- 録画（plan/design-recording-renumber.md 4 節）----
// 素の 3 桁の数はフレーム数や値と見分けられないので、確かさの高い形だけを置き換える: 「録画」の後の番号の並び・バッククォートの番号の
// 並び・観測値の ID・ファイル名（<YYYYMMDD>-<録画>_・<録画>_f<フレーム>・derived/<録画>/）・records/ の JSON の文字列。

/** 書かれた番号が録画の番号と同じか（2 桁の時代の「録画 41」も 041 と読む） */
const sameRecording = (written: string, id: string) => written.length >= 2 && Number(written) === Number(id);

const NUM = '`?\\d{2,4}`?';
const SEP = '\\s*[・、〜～]\\s*';
/** 「録画」の後の番号の並び（「録画 951・978」「録画（950〜952）」「録画: 951、978」）。「録画 13 本」のような数は除く */
const REC_LIST = new RegExp(
  `(録画(?:[:：] ?| ?)[（(]?)(${NUM}(?:${SEP}${NUM})*)(?![0-9A-Za-z_\`-])(?!\\s*(?:本|回|つ|件|秒|分|f|%|フレーム))`,
  'g',
);
/** バッククォートの番号の並び（「`951`、`978`」「`950`〜`952`」） */
const BT_LIST = new RegExp(`\`\\d{2,4}\`(?:${SEP}\`\\d{2,4}\`)*(?![0-9A-Za-z_-])`, 'g');
/** 観測値の ID（頭が録画の番号） */
const REC_OBS = /(?<![A-Za-z0-9_-])(\d{3,4})-(\d{2,})(?![0-9])/g;
/** 録画をまたぐ観測値の範囲（「`950-06`〜`953-06`」） */
const CROSS_OBS_RANGE = /`?(\d{3,4})-(\d{2,})`?\s*[〜～]\s*`?(\d{3,4})-(\d{2,})`?/g;
/** 動画とスクショのファイル名の頭（<YYYYMMDD>-<録画>_） */
const FILE_HEAD = /(?<![0-9])(\d{8})-(\d{2,4})_/g;

type ListGroup = { raw: string; lo: string; hi: string; backtick: boolean };

/** 番号の並びを、単独の番号と範囲（〜）のまとまりと、その間の区切りに分ける */
function parseList(list: string): { groups: ListGroup[]; seps: string[] } {
  const parts = list.split(new RegExp(`(${SEP})`));
  const items = parts.filter((_, i) => i % 2 === 0);
  const between = parts.filter((_, i) => i % 2 === 1);
  const groups: ListGroup[] = [];
  const seps: string[] = [];
  const num = (s: string) => s.replace(/`/g, '');
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (/[〜～]/.test(between[i] ?? '') && i + 1 < items.length) {
      const next = items[i + 1]!;
      groups.push({ raw: `${item}${between[i]}${next}`, lo: num(item), hi: num(next), backtick: item.startsWith('`') });
      if (i + 1 < between.length) seps.push(between[i + 1]!);
      i++;
    } else {
      groups.push({ raw: item, lo: num(item), hi: num(item), backtick: item.startsWith('`') });
      if (i < between.length) seps.push(between[i]!);
    }
  }
  return { groups, seps };
}

const inGroup = (g: ListGroup, id: string) =>
  g.lo === g.hi ? sameRecording(g.lo, id) : Number(g.lo) <= Number(id) && Number(id) <= Number(g.hi);

/** 並びが録画に触れているか */
const listMentions = (list: string, id: string) => parseList(list).groups.some((g) => inGroup(g, id));

/**
 * 並びの中の古い番号を新しい番号にする。範囲に入っていれば、展開して置き換えてからまとめ直す（例: 950〜952 の 951 → 990 は
 * 950・952・990）。並びに古い番号が無ければ undefined
 */
function remapList(list: string, oldId: string, newId: string): string | undefined {
  const { groups, seps } = parseList(list);
  if (!groups.some((g) => inGroup(g, oldId))) return undefined;
  const joiner = seps.find((s) => !/[〜～]/.test(s))?.trim() ?? '・';
  const texts = groups.map((g) => {
    if (!inGroup(g, oldId)) return g.raw;
    const q = g.backtick ? '`' : '';
    if (g.lo === g.hi) return `${q}${newId}${q}`;
    const width = g.lo.length;
    const nums = [];
    for (let n = Number(g.lo); n <= Number(g.hi); n++) if (n !== Number(oldId)) nums.push(n);
    nums.push(Number(newId));
    nums.sort((a, b) => a - b);
    const show = (n: number) => `${q}${n === Number(newId) ? newId : String(n).padStart(width, '0')}${q}`;
    const out: string[] = [];
    for (let i = 0; i < nums.length;) {
      let j = i;
      // 新しい番号は範囲にまとめない（桁が違うことがあり、別の録画の並びに見えないように）
      const isNew = (n: number) => n === Number(newId);
      while (j + 1 < nums.length && !isNew(nums[i]!) && !isNew(nums[j + 1]!) && nums[j + 1] === nums[j]! + 1) j++;
      out.push(j === i ? show(nums[i]!) : `${show(nums[i]!)}〜${show(nums[j]!)}`);
      i = j + 1;
    }
    return out.join(joiner);
  });
  return texts.map((t, i) => t + (seps[i] ?? '')).join('');
}

export type RecordingTextOptions = {
  /** 古い録画の観測値の ID（これだけを観測値として置き換える） */
  observations: ReadonlySet<string>;
  /** records/ の下の JSON（"<録画>" の文字列も置き換える） */
  json: boolean;
};

/** 人が見る所（置き換えなかった、または置き換えても意味が変わりうる所） */
export type ManualSpot = { line: number; text: string; reason: string };

const lineText = (text: string, line: number) => {
  const s = text.split('\n')[line - 1]!.trim();
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
};

/**
 * 文の中の録画の番号を置き換える。count は置き換えた所の数。manual は人が見る所: 録画をまたぐ観測値の範囲・観測値のファイルに無い
 * 観測値の ID・置き換えなかった素の番号のうち同じ行に「録画」があるもの
 */
export function renumberRecordingInText(
  text: string,
  oldId: string,
  newId: string,
  opts: RecordingTextOptions,
): { text: string; count: number; manual: ManualSpot[] } {
  let count = 0;
  const manual: ManualSpot[] = [];
  const spot = (src: string, index: number, reason: string) => {
    const line = lineOf(src, index);
    manual.push({ line, text: lineText(src, line), reason });
  };
  let out = text;
  for (const m of out.matchAll(CROSS_OBS_RANGE)) {
    if (m[1] === m[3]) continue;
    if (Number(m[1]) <= Number(oldId) && Number(oldId) <= Number(m[3]))
      spot(out, m.index, '録画をまたぐ観測値の範囲（範囲の意味が変わりうる）');
  }
  out = out.replace(REC_LIST, (whole, head: string, list: string) => {
    const r = remapList(list, oldId, newId);
    if (r === undefined) return whole;
    count++;
    return head + r;
  });
  out = out.replace(BT_LIST, (whole: string) => {
    const r = remapList(whole, oldId, newId);
    if (r === undefined) return whole;
    count++;
    return r;
  });
  out = out.replace(REC_OBS, (whole: string, rec: string, nn: string, offset: number, src: string) => {
    if (rec !== oldId) return whole;
    if (!opts.observations.has(whole)) {
      spot(src, offset, `観測値のファイルに無い ${whole}（置き換えていない）`);
      return whole;
    }
    count++;
    return `${newId}-${nn}`;
  });
  out = out.replace(FILE_HEAD, (whole: string, date: string, rec: string) => {
    if (!sameRecording(rec, oldId)) return whole;
    count++;
    return `${date}-${newId}_`;
  });
  const simple: [RegExp, (head: string) => string][] = [
    [new RegExp(`(?<![0-9A-Za-z_-])()${oldId}_f(?=\\d)`, 'g'), () => `${newId}_f`],
    [new RegExp(`(derived[/\\\\])${oldId}(?=[/\\\\])`, 'g'), (head) => `${head}${newId}`],
    ...(opts.json ? [[new RegExp(`()"${oldId}"`, 'g'), () => `"${newId}"`] as [RegExp, () => string]] : []),
  ];
  for (const [re, to] of simple)
    out = out.replace(re, (_whole: string, head: string) => {
      count++;
      return to(head);
    });
  const lines = out.split('\n');
  const bare = /(?<![0-9A-Za-z_.`/-])(\d{2,4})(?![0-9A-Za-z_`])/g;
  lines.forEach((l, i) => {
    if (!l.includes('録画')) return;
    for (const m of l.matchAll(bare))
      if (sameRecording(m[1]!, oldId)) {
        manual.push({ line: i + 1, text: lineText(out, i + 1), reason: '素の番号（置き換えていない）' });
        return;
      }
  });
  return { text: out, count, manual };
}

/** 文が録画に触れている数（4 節の形と、観測値の ID の頭）。新しい番号がどこにも出てこないことの確かめに使う */
export function recordingMentions(text: string, id: string, json: boolean): number {
  let n = 0;
  for (const m of text.matchAll(REC_LIST)) if (listMentions(m[2]!, id)) n++;
  for (const m of text.matchAll(BT_LIST)) if (listMentions(m[0], id)) n++;
  for (const m of text.matchAll(REC_OBS)) if (m[1] === id) n++;
  for (const m of text.matchAll(CROSS_OBS_RANGE))
    if (m[1] !== m[3] && Number(m[1]) <= Number(id) && Number(id) <= Number(m[3])) n++;
  for (const m of text.matchAll(FILE_HEAD)) if (sameRecording(m[2]!, id)) n++;
  n += [...text.matchAll(new RegExp(`(?<![0-9A-Za-z_-])${id}_f(?=\\d)`, 'g'))].length;
  n += [...text.matchAll(new RegExp(`derived[/\\\\]${id}(?=[/\\\\])`, 'g'))].length;
  if (json) n += [...text.matchAll(new RegExp(`"${id}"`, 'g'))].length;
  return n;
}
