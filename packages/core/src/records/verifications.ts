// Stage 20-D: 検証記録（records/verifications/V-NNNN-<短い名前>.md）の読み込み・検証と、一覧（plan/verifications.md）の生成。
// plan/design-stage20.md 3.2・3.2.1 節。1 回の検証（1 つの問い）を 1 ファイルにする。冒頭の箇条書きは書式を厳密に決め、
// 合わない行は黙って読み飛ばさずに問題として返す。ID の結び付きは片側だけに書き、逆向きは一覧の生成で引く。
import { CLAIM_TOPICS, type Claim } from './claims.ts';
import type { Observation } from './observations.ts';

export const VERIFICATION_STATES = ['調査中', '保留', '完了', '打ち切り'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

/** 冒頭の箇条書きの項目名の語彙 */
export const VERIFICATION_ITEMS = [
  '問い',
  '話題',
  '日付',
  'Stage',
  '録画',
  '結論',
  '状態',
  '依存',
  '待ち',
  '派生元',
  '訂正',
] as const;
type VerificationItem = (typeof VERIFICATION_ITEMS)[number];
const REQUIRED_ITEMS: readonly VerificationItem[] = ['問い', '話題', '日付', '状態'];

/** 本文の見出し（## の語彙と順） */
export const VERIFICATION_SECTIONS = [
  '条件',
  '予測（撮る前に書く）',
  '読み方',
  '結果',
  '分かったこと・分からないこと',
  '次に撮るもの',
] as const;

export type Verification = {
  id: string;
  /** ファイル名（records/verifications/ の下） */
  file: string;
  title: string;
  question: string;
  topic: string;
  date: string;
  stage: string | undefined;
  recordings: string[];
  claims: string[];
  state: string;
  dependsOn: string[];
  waitingFor: string | undefined;
  derivedFrom: string[];
  corrects: string[];
  /** 本文の節（見出し → 中身） */
  sections: Map<string, string>;
  /** 読み取りで見つかった書式の問題 */
  problems: string[];
};

const FILE_NAME = /^(V-\d{4,})-[a-z0-9][a-z0-9-]*\.md$/;
const V_ID = /^V-\d{4,}$/;

/** 「`064`〜`069`、`071`」のような ID の並びを読む。範囲（〜）は ranges が true のときだけ許す */
function parseIdList(value: string, ranges: boolean): string[] | undefined {
  const ids: string[] = [];
  for (const part of value.split('、').map((p) => p.trim())) {
    const range = /^`(\d{3,})`〜`(\d{3,})`$/.exec(part);
    if (range && ranges) {
      const width = range[1]!.length;
      for (let n = Number(range[1]); n <= Number(range[2]); n++) ids.push(String(n).padStart(width, '0'));
      continue;
    }
    const one = /^`([^`]+)`$/.exec(part);
    if (!one) return undefined;
    ids.push(one[1]!);
  }
  return ids;
}

/** 検証記録を 1 ファイル読む。書式の問題は problems に入れる */
export function parseVerification(file: string, markdown: string): Verification {
  const problems: string[] = [];
  const lines = markdown.split('\n');
  const fileId = FILE_NAME.exec(file)?.[1];
  if (fileId === undefined) problems.push(`${file}: ファイル名は V-<4 桁以上の数字>-<英小文字・数字・->.md`);
  const title = /^# (V-\d{4,}): (.+)$/.exec(lines[0] ?? '');
  if (title === null) problems.push(`${file}: 1 行目は「# V-NNNN: 題名」`);
  const id = title?.[1] ?? fileId ?? file;
  if (title && fileId && title[1] !== fileId) problems.push(`${id}: ファイル名の ID と 1 行目の ID が違う`);

  const items = new Map<VerificationItem, string>();
  let i = 1;
  while (i < lines.length && lines[i]!.trim() === '') i++;
  for (; i < lines.length && lines[i]!.startsWith('- '); i++) {
    const m = /^- ([^:：]+): (.*)$/.exec(lines[i]!);
    const name = m?.[1] as VerificationItem | undefined;
    if (m === null || name === undefined || !VERIFICATION_ITEMS.includes(name)) {
      problems.push(`${id}: 冒頭の行が書式に合わない: ${lines[i]}`);
      continue;
    }
    if (items.has(name)) problems.push(`${id}: 冒頭の項目が重複している: ${name}`);
    items.set(name, m[2]!.trim());
  }
  for (const name of REQUIRED_ITEMS) if (!items.has(name)) problems.push(`${id}: 冒頭に「${name}」が無い`);

  const list = (name: VerificationItem, ranges = false): string[] => {
    const value = items.get(name);
    if (value === undefined || value === '') return [];
    const ids = parseIdList(value, ranges);
    if (ids === undefined) {
      problems.push(`${id}: 「${name}」はバッククォートで囲んだ ID を「、」で区切って書く: ${value}`);
      return [];
    }
    return ids;
  };

  const sections = new Map<string, string>();
  let current: string | undefined;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      current = heading[1]!.trim();
      if (!(VERIFICATION_SECTIONS as readonly string[]).includes(current))
        problems.push(`${id}: 本文の見出しが語彙に無い: ${current}`);
      if (sections.has(current)) problems.push(`${id}: 本文の見出しが重複している: ${current}`);
      sections.set(current, '');
    } else if (current !== undefined) sections.set(current, `${sections.get(current)}${line}\n`);
    else if (line.trim() !== '') problems.push(`${id}: 冒頭の箇条書きと本文の見出しのあいだに文がある: ${line}`);
  }
  const order = [...sections.keys()].filter((h) => (VERIFICATION_SECTIONS as readonly string[]).includes(h));
  const expected = VERIFICATION_SECTIONS.filter((h) => sections.has(h));
  if (order.join('|') !== expected.join('|')) problems.push(`${id}: 本文の見出しの順が違う`);
  for (const h of VERIFICATION_SECTIONS) if (!sections.has(h)) problems.push(`${id}: 本文に「## ${h}」が無い`);

  return {
    id,
    file,
    title: title?.[2] ?? '',
    question: items.get('問い') ?? '',
    topic: items.get('話題') ?? '',
    date: items.get('日付') ?? '',
    stage: items.get('Stage'),
    recordings: list('録画', true),
    claims: list('結論'),
    state: items.get('状態') ?? '',
    dependsOn: list('依存'),
    waitingFor: items.get('待ち'),
    derivedFrom: list('派生元'),
    corrects: list('訂正'),
    sections,
    problems,
  };
}

/** 検証記録を ID の番号順に並べる */
export function sortVerifications(list: readonly Verification[]): Verification[] {
  const num = (v: Verification) => Number(v.id.slice(2));
  return [...list].sort((a, b) => num(a) - num(b) || a.id.localeCompare(b.id));
}

type Context = {
  claims: readonly Claim[];
  recordingIds: ReadonlySet<string>;
  observations: readonly Observation[];
};

/** 検証記録の検証（3.2.1 節の状態の規則・ID の実在・依存の循環・観測値の source） */
export function validateVerifications(list: readonly Verification[], ctx: Context): string[] {
  const errors: string[] = [];
  const byId = new Map<string, Verification>();
  for (const v of list) {
    errors.push(...v.problems);
    if (byId.has(v.id)) errors.push(`${v.id}: ID が重複している`);
    byId.set(v.id, v);
  }
  const claims = new Map(ctx.claims.map((c) => [c.id, c]));
  for (const v of list) {
    const at = v.id;
    if (!(VERIFICATION_STATES as readonly string[]).includes(v.state))
      errors.push(`${at}: 状態が語彙に無い: ${v.state}`);
    if (!(CLAIM_TOPICS as readonly string[]).includes(v.topic)) errors.push(`${at}: 話題が語彙に無い: ${v.topic}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errors.push(`${at}: 日付は YYYY-MM-DD`);
    if (v.title.trim() === '' || v.question.trim() === '') errors.push(`${at}: 題名と問いは必須`);
    for (const r of v.recordings) if (!ctx.recordingIds.has(r)) errors.push(`${at}: 録画 ${r} が無い`);
    for (const c of v.claims) if (!claims.has(c)) errors.push(`${at}: 結論 ${c} が無い`);
    for (const [name, ids] of [
      ['依存', v.dependsOn],
      ['派生元', v.derivedFrom],
      ['訂正', v.corrects],
    ] as const) {
      for (const d of ids) {
        if (!V_ID.test(d) || !byId.has(d)) errors.push(`${at}: ${name}の検証記録 ${d} が無い`);
        else if (d === v.id) errors.push(`${at}: ${name}に自分を書いている`);
      }
    }
    if (v.state === '調査中' || v.state === '保留') {
      if (v.claims.length > 0) errors.push(`${at}: ${v.state}の検証記録には「結論」を書かない`);
    }
    if (v.state === '保留' && v.dependsOn.length === 0 && (v.waitingFor ?? '').trim() === '')
      errors.push(`${at}: 保留には「依存」か「待ち」が要る`);
    if (v.state === '完了' && v.claims.length === 0) errors.push(`${at}: 完了の検証記録には「結論」が 1 つ以上要る`);
    if (v.state === '打ち切り') {
      for (const c of v.claims) {
        const claim = claims.get(c);
        if (claim !== undefined && claim.state !== '範囲外')
          errors.push(`${at}: 打ち切りの「結論」に書けるのは範囲外の結論だけ（${c} は${claim.state}）`);
      }
      if ((v.sections.get('分かったこと・分からないこと') ?? '').trim() === '')
        errors.push(`${at}: 打ち切りには「分かったこと・分からないこと」の本文が要る`);
    }
  }
  // 依存の循環
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, path: string[]): void => {
    if (done.has(id)) return;
    if (visiting.has(id)) {
      errors.push(`${id}: 依存が循環している（${[...path, id].join(' → ')}）`);
      return;
    }
    visiting.add(id);
    for (const d of byId.get(id)?.dependsOn ?? []) if (byId.has(d)) visit(d, [...path, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const v of list) visit(v.id, []);
  // 観測値の source に書いた検証記録
  for (const o of ctx.observations) {
    if (V_ID.test(o.source) && !byId.has(o.source)) errors.push(`${o.id}: source の検証記録 ${o.source} が無い`);
  }
  return errors;
}

/** 結論 ID → それを「結論」に書いた検証記録の ID */
export function verificationsByClaim(list: readonly Verification[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const v of list) for (const c of v.claims) map.set(c, [...(map.get(c) ?? []), v.id]);
  return map;
}

// ---- plan/verifications.md（生成） ----

const HEADER = `# 検証記録の一覧

- **このファイルは生成する（手で書かない）**。検証記録は \`records/verifications/V-NNNN-<短い名前>.md\` に 1 件 1 ファイルで置き、\`npm run records:check\` で作り直す（[design-stage20.md](design-stage20.md) 3.2 節。書式は [records/verifications/README.md](../records/verifications/README.md)）。
- 状態は \`調査中\`・\`保留\`・\`完了\`・\`打ち切り\` のどれか。打ち切りの検証は結論の台帳（[claims.md](claims.md)）には載らないが、ここには載る。
- 観測値は、観測値の \`source\` にその検証記録の ID を書いたもの。止めている検証・派生した検証・訂正された記録は、相手の冒頭から逆に引いたもの。
- 2026-09-26 までの実測は [verification.md](verification.md)（凍結）にある。`;

const listText = (ids: readonly string[]) => ids.join('、');

/** plan/verifications.md の全文 */
export function renderVerifications(list: readonly Verification[], observations: readonly Observation[]): string {
  const sorted = sortVerifications(list);
  const byId = new Map(sorted.map((v) => [v.id, v]));
  const reverse = (pick: (v: Verification) => readonly string[]) => {
    const map = new Map<string, string[]>();
    for (const v of sorted) for (const t of pick(v)) map.set(t, [...(map.get(t) ?? []), v.id]);
    return map;
  };
  const blocking = reverse((v) => v.dependsOn);
  const derived = reverse((v) => v.derivedFrom);
  const correctedBy = reverse((v) => v.corrects);
  const observationsOf = new Map<string, string[]>();
  for (const o of observations) {
    if (V_ID.test(o.source)) observationsOf.set(o.source, [...(observationsOf.get(o.source) ?? []), o.id]);
  }
  const count = (state: VerificationState) => sorted.filter((v) => v.state === state).length;
  const lines = [
    HEADER,
    '',
    `件数: ${VERIFICATION_STATES.map((s) => `${s} ${count(s)}`).join('・')}（計 ${sorted.length}）`,
    '',
    '## 開いている検証',
    '',
  ];
  const open = sorted.filter((v) => v.state === '調査中' || v.state === '保留');
  if (open.length === 0) lines.push('なし。');
  for (const v of open) {
    const notes = [`状態: ${v.state}`];
    if (v.dependsOn.length > 0) notes.push(`依存: ${listText(v.dependsOn)}`);
    if (v.waitingFor) notes.push(`待ち: ${v.waitingFor}`);
    let mark = '';
    if (v.state === '保留' && v.dependsOn.length > 0) {
      const states = v.dependsOn.map((d) => byId.get(d)?.state);
      if (states.includes('打ち切り')) mark = ' — **依存先が打ち切り（前提を見直す）**';
      else if (states.every((s) => s === '完了')) mark = ' — **再開できる**';
    }
    lines.push(`- **${v.id}** ${v.title}（${notes.join('・')}）${mark}`);
  }
  lines.push('', '## 全件', '');
  if (sorted.length === 0) lines.push('まだ無い（最初の 1 件は、次に行う実際の検証で作る）。');
  for (const v of sorted) {
    const meta = [`話題: ${v.topic}`, `日付: ${v.date}`, `状態: ${v.state}`, ...(v.stage ? [`Stage: ${v.stage}`] : [])];
    lines.push(`- **[${v.id}](../records/verifications/${v.file})** ${v.title}`, `  - 問い: ${v.question}`);
    lines.push(`  - ${meta.join('・')}`);
    const rows: [string, readonly string[] | undefined][] = [
      ['録画', v.recordings],
      ['観測値', observationsOf.get(v.id)],
      ['結論', v.claims],
      ['依存', v.dependsOn],
      ['派生元', v.derivedFrom],
      ['訂正', v.corrects],
      ['止めている検証', blocking.get(v.id)],
      ['派生した検証', derived.get(v.id)],
      ['訂正された（訂正した記録）', correctedBy.get(v.id)],
    ];
    for (const [name, ids] of rows)
      if (ids !== undefined && ids.length > 0) lines.push(`  - ${name}: ${listText(ids)}`);
    if (v.waitingFor) lines.push(`  - 待ち: ${v.waitingFor}`);
  }
  return `${lines.join('\n')}\n`;
}
