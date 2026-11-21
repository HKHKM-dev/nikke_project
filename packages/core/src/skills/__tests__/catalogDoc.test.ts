// スキルの効果の分類の一覧（plan/skill-catalog.md）の書き方: 節の並び・表の形・節ごとの行。
// 区分の付け方と分類の表の名前（スキルを定義するたびに変わる）は見ない。手で作る入力は、表に無い鍵
// （名前は鍵のまま、状況は要確認で出る）と、区分がコードで決まる stat（「?」で始まる名前は要確認）を使う。
import { describe, expect, it } from 'vitest';
import { loadCatalogInput } from '../../../scripts/records-data.ts';
import { classifyCharacters, type CatalogEffect, type CatalogLine, type CatalogStat } from '../catalog.ts';
import {
  buffSection,
  familySection,
  headSection,
  headerLines,
  healSection,
  indirectSection,
  renderSkillCatalog,
  slotGapSection,
  stateSection,
} from '../catalogDoc.ts';

const line = (fields: Partial<CatalogLine>): CatalogLine => ({
  rid: 1,
  name: 'A',
  slot: 'skill1',
  li: 0,
  head: '',
  flat: '',
  triggers: [],
  conditions: [],
  targets: [],
  defined: false,
  ...fields,
});

const effect = (fields: Partial<CatalogEffect>): CatalogEffect => ({
  rid: 1,
  name: 'A',
  slot: 'skill1',
  li: 0,
  defined: false,
  kind: 'kindA',
  triggers: ['trigA'],
  implicit: null,
  conditions: [],
  targets: ['tgtA'],
  side: 'self',
  quote: '',
  head: '',
  subHead: '',
  targetText: '',
  ...fields,
});

const stat = (canon: string, fields: Partial<CatalogStat> = {}): CatalogStat => ({
  name: canon,
  canon,
  dir: 'up',
  scaling: 'scA',
  ...fields,
});

/** キャラ A（定義なし）と B（定義あり） */
const A = { rid: 1, name: 'A', defined: false };
const B = { rid: 2, name: 'B', defined: true };

/** 表の行の欄 */
const cells = (row: string): string[] => row.replace(/^\| /, '').replace(/ \|$/, '').split(' | ');

/** 見出しから次の見出しの前までの行 */
function under(doc: readonly string[], heading: string): string[] {
  const from = doc.findIndex((l) => l.startsWith(heading));
  expect(from).toBeGreaterThanOrEqual(0);
  const rest = doc.slice(from + 1);
  const to = rest.findIndex((l) => l.startsWith('#'));
  return to < 0 ? rest : rest.slice(0, to);
}

/** 表ごとの行（見出し・区切り・中身）を、欄に分けたもの */
function tablesOf(doc: readonly string[]): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] | undefined;
  for (const l of doc) {
    if (!l.startsWith('|')) current = undefined;
    else if (current === undefined) tables.push((current = [cells(l)]));
    else current.push(cells(l));
  }
  return tables;
}

/** 見出しの下の表の行（見出しと区切りの行を除く） */
function tableUnder(doc: readonly string[], heading: string): string[][] {
  const tables = tablesOf(under(doc, heading));
  expect(tables).toHaveLength(1);
  return tables[0]!.slice(2);
}

/** 表の行ごとの「件数・キャラ・定義あり」の 3 欄（その 3 欄の無い表は undefined） */
function countsOf(table: readonly string[][]): string[][] | undefined {
  const header = table[0]!;
  const at = header.indexOf('キャラ');
  if (at < 1 || !header[at + 1]?.includes('定義あり')) return undefined;
  return table.slice(2).map((row) => row.slice(at - 1, at + 2));
}

const HEADINGS = [
  '# スキルの効果の分類',
  '## 1. 効果の大分類',
  '## 2. スロットごとに残る「語彙なし・要確認」',
  '## 3. バフ・デバフ（stat の▲▼）',
  '### 3.1 stat',
  '### 3.2 値の算出',
  '### 3.3 持続の形（効果に付いた修飾）',
  '## 4. 状態',
  '### 4.1 名前の付いた状態と効果の呼び名（名前ごと）',
  '### 4.2 状態の一生（形）',
  '### 4.3 状態を見る側（頭の書き方）',
  '### 4.5 外れ方（解除・消去・解除条件・解除不可）',
  '### 4.6 条件の判定のタイミング',
  '## 5. 回復',
  '### 5.1 回復の形',
  '### 5.2 回復のきっかけと対象',
  '### 5.3 回復を受ける側（回復効果が適用された時）',
  '## 6. 間接に効く経路（HP・防御力・バリア・デコイ・遮蔽物）',
  '## 7. 条件・きっかけ・対象',
  '### 7.1 条件',
  '### 7.2 きっかけ',
  '### 7.3 対象',
];

describe('renderSkillCatalog', () => {
  const { characters, defined } = loadCatalogInput();
  const { lines, effects } = classifyCharacters(characters, defined);
  const doc = renderSkillCatalog(lines, effects).split('\n');
  const tables = tablesOf(doc);

  it('writes the sections in the order of their numbers', () => {
    expect(doc.filter((l) => l.startsWith('#'))).toEqual(HEADINGS);
    // 見出しの前後は空行で、終わりは改行
    for (const [i, l] of doc.entries()) {
      if (!l.startsWith('#')) continue;
      if (i > 0) expect(doc[i - 1]).toBe('');
      expect(doc[i + 1]).toBe('');
    }
    expect(doc.at(-1)).toBe('');
  });

  it('reads the filtered allies decided in the middle of a line (トーブ S2・ラプンツェル：サンクチュアリのバースト)', () => {
    const targetsOf = (name: string, slot: string, li: number) =>
      effects
        .filter((e) => e.name === name && e.slot === slot && e.li === li && e.targets.length > 0)
        .map((e) => [e.quote, tableUnder(headSection([e]), '### 7.3').map((row) => row[0])]);
    // 「自分が「応急改造」のフルスタック状態の時のみ、ショットガンを所持する味方全体に「…」」
    expect(targetsOf('トーブ', 'skill2', 1)).toEqual([['攻撃速度X％▲', ['〈武器〉を所持する味方']]]);
    // 「…戦闘不能状態の味方がX機以上の場合、戦闘不能状態の味方全体に「…」…戦闘不能状態の味方がX機以下の場合、味方全体に「…」」
    const filtered = ['〈状態〉状態の味方'];
    expect(targetsOf('ラプンツェル：サンクチュアリ', 'burst', 0)).toEqual([
      ['ナノ粒子投与：HPX％で復活', filtered],
      ['スキル発動者基準で攻撃力X％▲', filtered],
      ['スキル発動者基準で防御力X％▲', filtered],
      ['スキル発動者基準で攻撃力X％▲', ['味方全体']],
    ]);
  });

  it('writes every table with a header, a separator and rows of the same width', () => {
    // 1 節・2 節・3.1〜3.3 節・4.1〜4.3 節・4.5 節・4.6 節・5.1 節・5.2 節・6 節・7.1〜7.3 節
    expect(tables).toHaveLength(16);
    for (const [header, separator, ...rows] of tables) {
      expect(separator).toEqual(header!.map(() => '---'));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.length !== header!.length)).toEqual([]);
    }
  });

  it('writes the counts as numbers that nest (effects or lines ≥ characters ≥ defined characters)', () => {
    const counts = tables.flatMap((table) => countsOf(table) ?? []);
    expect(counts.length).toBeGreaterThan(100);
    expect(counts.filter((row) => row.some((x) => !/^\d+$/.test(x)))).toEqual([]);
    expect(counts.filter(([count, chars]) => Number(chars) > Number(count))).toEqual([]);
    expect(counts.filter(([, chars, definedChars]) => Number(definedChars) > Number(chars))).toEqual([]);
  });

  it('leaves no holes in the text', () => {
    expect(doc.filter((l) => /undefined|NaN|\[object/.test(l))).toEqual([]);
  });

  it('writes every section, with empty tables, for an empty input', () => {
    const empty = renderSkillCatalog([], []).split('\n');
    expect(empty.filter((l) => l.startsWith('#'))).toEqual(HEADINGS);
    // 行が入力で決まらない表（4.2・4.3・4.5・4.6・6 節）は、件数 0 で行を出す
    const fixedRows = tablesOf(empty).filter((table) => table.length > 2);
    expect(fixedRows).toHaveLength(5);
    for (const table of fixedRows) {
      expect(countsOf(table)).toEqual(table.slice(2).map(() => ['0', '0', '0']));
    }
  });
});

describe('headerLines', () => {
  it('counts the characters, the slots, the lines and the effects of the input', () => {
    const L = [line({ ...A, slot: 'skill1' }), line({ ...A, slot: 'skill1', li: 1 }), line({ ...B, slot: 'burst' })];
    const E = [effect(A), effect(A), effect(A), effect(B)];
    expect(headerLines(L, E).find((l) => l.startsWith('- 元データ'))).toContain(
      'キャラ 2・スロット 2（宝物版を含む）・■ の行 3・効果の句 4',
    );
  });
});

describe('familySection', () => {
  it('counts each effect once by what it does, the most frequent family first', () => {
    const E = [
      effect({ ...A, kind: 'damage:dot' }),
      effect({ ...A, kind: 'stat', stat: stat('?a') }),
      // 状態の中身の stat は、stat に数えて「うち状態の中身」にも出す
      effect({ ...B, kind: 'stat', stat: stat('?a'), state: 'X' }),
      // 名前だけの付与は「うち状態の中身」に数えない
      effect({ ...B, kind: 'state:grant', state: 'Y' }),
    ];
    const rows = tableUnder(familySection(E), '## 1.');
    expect(rows.map((row) => row.slice(0, 5))).toEqual([
      ['バフ・デバフ（stat の▲▼）', '2', '2', '1', '1'],
      ['ダメージ', '1', '1', '0', '0'],
      [expect.stringContaining('状態の操作'), '1', '1', '1', '0'],
    ]);
    // 区分ごとの数の和は、効果の数
    for (const row of rows) {
      expect(row.slice(5).reduce((sum, n) => sum + Number(n), 0)).toBe(Number(row[1]));
    }
  });
});

describe('slotGapSection', () => {
  const open = (who: typeof A, slot: string, canon: string, fields: Partial<CatalogEffect> = {}) =>
    effect({ ...who, slot, kind: 'stat', stat: stat(canon), ...fields });

  it('collects what remains by slot, and counts the slots where it is the only one', () => {
    const E = [
      open(A, 'skill1', '?a'),
      open(A, 'skill1', '?a'),
      open(B, 'skill1', '?a'),
      open(B, 'skill1', '?b'),
      // 間接に効く効果（味方の防御力▲）は数えない
      open(B, 'skill2', 'defense', { side: 'ally' }),
    ];
    const section = slotGapSection(E);
    expect(section).toContain('- 残りのあるスロット: 2 / 3（効果の句のあるスロット）');
    expect(tableUnder(section, '## 2.')).toEqual([
      ['効果: ?a', '2', '1'],
      ['効果: ?b', '1', '0'],
    ]);
  });

  it('marks what remains on the enemy side, and keeps one row for each kind of what remains', () => {
    const E = [open(A, 'skill1', '?a', { side: 'enemy' }), open(A, 'skill1', '?a')];
    expect(tableUnder(slotGapSection(E), '## 2.')).toEqual([
      ['効果: ?a（敵）', '1', '0'],
      ['効果: ?a', '1', '0'],
    ]);
  });

  it('keeps the active skills without a written trigger apart from what remains', () => {
    const E = [
      open(A, 'skill1', 'defense', { side: 'ally', triggers: [], implicit: 'none' }),
      open(B, 'skill1', '?a', { triggers: [], implicit: 'none' }),
    ];
    const section = slotGapSection(E);
    expect(section.find((l) => l.startsWith('- 別枠'))).toContain(
      'のあるスロット 2（うち、ほかに残りの無いスロット 1）',
    );
    expect(tableUnder(section, '## 2.')).toEqual([['効果: ?a', '1', '1']]);
  });
});

describe('buffSection', () => {
  it('splits a stat by the side and the direction, with the defined characters first', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('?a') }),
      effect({ ...B, kind: 'stat', stat: stat('?a'), side: 'ally' }),
      effect({ ...A, kind: 'stat', stat: stat('?a'), side: 'ally' }),
      effect({ ...B, kind: 'stat', stat: stat('?a', { dir: 'down' }), side: 'enemy' }),
      effect({ ...A, kind: 'damage:dot' }),
    ];
    const rows = tableUnder(buffSection([], E), '### 3.1');
    expect(rows.map((row) => [...row.slice(0, 7), row.at(-1)])).toEqual([
      ['?a', '味方', '▲', '3', '2', '1', '要確認', '**B**、A'],
      ['?a', '敵', '▼', '1', '1', '1', '要確認', '**B**'],
    ]);
  });

  it('counts how the value is computed, over the stat effects only', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('?a') }),
      effect({ ...A, kind: 'stat', stat: stat('?b', { scaling: 'scB' }) }),
      effect({ ...B, kind: 'stat', stat: stat('?c') }),
      effect({ ...B, kind: 'damage:dot' }),
    ];
    expect(tableUnder(buffSection([], E), '### 3.2')).toEqual([
      ['scA', '2', '2', '1', '要確認', '**B**、A'],
      ['scB', '1', '1', '0', '要確認', 'A'],
    ]);
  });

  it('counts the modifiers of the effects and of the lines together', () => {
    const L = [line({ ...B, lineMods: ['modA'] })];
    const E = [effect({ ...A, mods: ['modA', 'modB'] }), effect({ ...A, mods: ['modA'] })];
    expect(tableUnder(buffSection(L, E), '### 3.3')).toEqual([
      ['modA', '3', '2', '1', '要確認', '**B**、A'],
      ['modB', '1', '1', '0', '要確認', 'A'],
    ]);
  });
});

describe('stateSection', () => {
  it('lists the named states with the stages merged, the sides, the contents and whether a head refers to them', () => {
    const L = [line({ ...B, head: '自分がペインロード状態なら' })];
    const E = [
      effect({ ...B, kind: 'stat', stat: stat('?a'), state: 'ペインロード1' }),
      effect({ ...B, kind: 'stat', stat: stat('?b', { dir: 'down' }), state: 'ペインロード2', side: 'enemy' }),
      effect({ ...A, state: 'エグゾスパイン Mk2' }),
    ];
    // キャラの resourceId の順
    expect(tableUnder(stateSection(L, E), '### 4.1')).toEqual([
      ['エグゾスパイン Mk2', '味方', '—', 'kindA', 'A'],
      ['ペインロード', '味方・敵', 'あり', '?a▲、?b▼', '**B**'],
    ]);
  });

  it('counts the forms of the life of a state', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('?a'), state: 'X' }),
      effect({ ...A, kind: 'damage:dot', state: 'X' }),
      effect({ ...B, kind: 'state:grant', state: 'Y' }),
      effect({ ...B, kind: 'state:remove', state: 'Y' }),
      effect({ ...B, kind: 'state:cancel', state: 'Y' }),
    ];
    const rows = tableUnder(stateSection([], E), '### 4.2');
    expect(rows.map((row) => row[1])).toEqual(['1', '1', '1', '1', '1', '0', '0']);
  });

  // 見る形ごとに、その形だけを持つ行と、同じ鍵を持つ効果を作る
  const VIEWERS: [kind: string, fields: Partial<CatalogLine>, section: string][] = [
    ['条件', { conditions: ['selfState'] }, '### 7.1'],
    ['条件', { conditions: ['selfState:fullStack'] }, '### 7.1'],
    ['条件', { conditions: ['selfState:absent'] }, '### 7.1'],
    ['条件', { conditions: ['selfState:while'] }, '### 7.1'],
    ['条件', { conditions: ['enemyState'] }, '### 7.1'],
    ['きっかけ', { triggers: ['stateApplied'] }, '### 7.2'],
    ['きっかけ', { triggers: ['stateEnded'] }, '### 7.2'],
    ['きっかけ', { triggers: ['fullStackConsume'] }, '### 7.2'],
    ['対象', { targets: ['ally:alliesFiltered'], head: '〈状態〉状態の味方全体に' }, '### 7.3'],
  ];

  it.each(VIEWERS)(
    'gives a head that looks at a state (%s %j) the name and the status of the same key in section 7',
    (kind, fields, section) => {
      const e = effect({ triggers: [], targets: [], ...fields, targetText: fields.head ?? '' });
      const viewers = tableUnder(stateSection([line(fields)], [e]), '### 4.3');
      expect(viewers.map((row) => row[0]!.split(': ')[0])).toEqual(VIEWERS.map(([k]) => k));
      // 入力の 1 行は、見る形 1 つにだけ数える
      const counted = viewers.filter((row) => row[1] !== '0');
      expect(counted).toHaveLength(1);
      // 7 節の表は、その鍵の 1 行だけ
      const reference = tableUnder(headSection([e]), section);
      expect(reference).toHaveLength(1);
      expect(counted[0]![0]).toBe(`${kind}: ${reference[0]![0]}`);
      expect(counted[0]![4]).toBe(reference[0]![4]);
    },
  );

  it('does not count「〈stat〉増加状態なら」or the full stack as looking at whether the state is there', () => {
    const counts = (fields: Partial<CatalogLine>) =>
      tableUnder(stateSection([line(fields)], []), '### 4.3').map((row) => row[1]);
    expect(counts({ conditions: ['selfState'], head: '自分が攻撃力増加状態なら' })).toEqual(Array(9).fill('0'));
    expect(counts({ conditions: ['selfState', 'selfState:fullStack'] })).toEqual([
      ...['0', '1', '0', '0', '0'],
      ...['0', '0', '0', '0'],
    ]);
  });

  it('counts a line as targeting allies in a state when one of its effects does, reading the text that decided the target', () => {
    const counts = (l: Partial<CatalogLine>, e: Partial<CatalogEffect>) =>
      tableUnder(stateSection([line(l)], [effect(e)]), '### 4.3').map((row) => row[1]);
    const targeting = [...Array(8).fill('0'), '1'];
    // 対象を決めた文（ここでは「効果N：」の小項目の頭）に書かれた対象
    expect(
      counts({}, { targets: ['ally:alliesFiltered'], head: '', targetText: '〈状態〉状態ではない味方全体に' }),
    ).toEqual(targeting);
    // 行の頭にあっても、句の対象が絞った味方でなければ数えない
    expect(
      counts({ head: '〈状態〉状態の味方全体に' }, { targets: ['ally:self'], head: '〈状態〉状態の味方全体に' }),
    ).toEqual(Array(9).fill('0'));
    // 効果は、同じキャラ・スロット・番号の行にだけ数える
    const state = { targets: ['ally:alliesFiltered'], targetText: '〈状態〉状態の味方全体に' };
    const viewer = (L: CatalogLine[]) =>
      tableUnder(stateSection(L, [effect({ ...state, slot: 'burst', li: 1 })]), '### 4.3')
        .at(-1)!
        .slice(1, 3);
    expect(
      viewer([line({ slot: 'burst', li: 0 }), line({ slot: 'skill1', li: 1 }), line({ rid: 2, slot: 'burst', li: 1 })]),
    ).toEqual(['0', '0']);
    expect(viewer([line({ slot: 'burst', li: 1 }), line({ slot: 'skill1', li: 1 })])).toEqual(['1', '1']);
  });

  it('collects how effects and states come off, and whether what is erased or removed was granted undispellable', () => {
    const L = [
      line({ ...A, flat: '「変身：攻撃力X％▲」「持続」「解除不可」' }),
      line({ ...A, li: 1, flat: '「変身消去」「集中解除」' }),
      line({ ...B, flat: '「バフ効果解除X個」' }),
    ];
    const section = stateSection(L, []);
    const rows = new Map(tableUnder(section, '### 4.5').map((row) => [row[0], row.slice(2, 5)]));
    expect(rows.get('解除不可（効果解除で外れない）')).toEqual(['1', '1', '0']);
    expect(rows.get('〈名前〉消去（同じスキルが外す）')).toEqual(['1', '1', '0']);
    expect(rows.get('効果解除（バフ・デバフ効果解除 N 個）')).toEqual(['1', '1', '1']);
    expect(section).toContain('- 消去の相手: 変身（解除不可で付く）');
    // 効果解除は、名前の付いた状態の解除に数えない
    expect(section).toContain('- 解除の相手: 集中（解除不可でない）');
  });

  it('splits the conditions by when they are judged', () => {
    const L = [
      line({ ...A, conditions: ['condA'], triggers: ['trigA'], head: 'バーストスキル使用時、HPがX％以上なら' }),
      line({ ...A, li: 1, conditions: ['condA'], head: 'HPがX％以上の時に限り', flat: '「持続」「解除不可」' }),
      line({ ...B, conditions: ['condA'], head: 'HPがX％以上なら' }),
      line({ ...B, li: 1, head: '条件の無い行' }),
    ];
    const section = stateSection(L, []);
    // 発火の瞬間・続いている間・きっかけの無い条件
    expect(tableUnder(section, '### 4.6').map((row) => row.slice(1, 4))).toEqual([
      ['1', '1', '0'],
      ['1', '1', '0'],
      ['1', '1', '1'],
    ]);
    expect(section).toContain('- 続いている間の条件で、効果が「持続」「解除不可」のもの: 1 行（A）');
  });
});

describe('healSection', () => {
  it('splits a heal with an interval from a single heal, and counts the heads that follow a heal', () => {
    const L = [line({ ...B, triggers: ['healed'] }), line({ ...A })];
    const E = [
      effect({ ...A, kind: 'heal:instant' }),
      effect({ ...A, kind: 'heal:instant', targets: ['tgtA', 'tgtB'] }),
      effect({ ...B, kind: 'heal:instant', mods: ['meta:interval'], conditions: ['condA'] }),
      effect({ ...B, kind: 'damage:dot' }),
    ];
    const section = healSection(L, E);
    // 1 回の回復（2 件）と、間隔の付いた回復（1 件）
    expect(tableUnder(section, '### 5.1').map((row) => row.slice(1, 4))).toEqual([
      ['2', '1', '0'],
      ['1', '1', '1'],
    ]);
    // きっかけ（条件）× 対象
    expect(tableUnder(section, '### 5.2').map((row) => row.slice(0, 2))).toEqual([
      ['trigA × tgtA', '1'],
      ['trigA × tgtA・tgtB', '1'],
      ['trigA（condA） × tgtA', '1'],
    ]);
    expect(section).toContain('- 行: 1。キャラ: **B**');
  });
});

describe('indirectSection', () => {
  it('counts the effects that move a path and the lines that read it', () => {
    const L = [line({ ...A, conditions: ['hp'] }), line({ ...B, flat: '「最大HPのみX％▲」' })];
    const E = [
      effect({ ...B, kind: 'stat', stat: stat('maxHp') }),
      effect({ ...A, kind: 'stat', stat: stat('maxHp', { dir: 'down' }) }),
      effect({ ...A, kind: 'shield:barrier' }),
    ];
    const rows = tableUnder(indirectSection(L, E), '## 6.');
    const counts = new Map(rows.map((row) => [`${row[0]}/${row[1]}/${row[2]}`, row.slice(3, 6)]));
    expect(counts.get('HP/動かす/最大HP▲（最大HP のみ▲を含む）')).toEqual(['1', '1', '1']);
    expect(counts.get('HP/動かす/最大HP のみ▲（現在の HP は増えない読み）')).toEqual(['1', '1', '1']);
    expect(counts.get('HP/読む/HP の割合の条件（以上・以下・最大）')).toEqual(['1', '1', '0']);
    expect(counts.get('バリア/動かす/バリアの付与（個別・共用）')).toEqual(['1', '1', '0']);
    expect(counts.get('デコイ/動かす/デコイ（分身）の付与')).toEqual(['0', '0', '0']);
  });
});

describe('headSection', () => {
  it('counts an effect under each of its conditions, triggers and targets', () => {
    const E = [
      effect({ ...A, conditions: ['condA', 'condB'], triggers: ['trigA', 'trigB'], targets: ['tgtA', 'tgtB'] }),
      effect({ ...B, conditions: ['condA'] }),
      effect({ ...B }),
    ];
    const section = headSection(E);
    // 表に無い鍵は、鍵のまま・要確認で出す
    expect(tableUnder(section, '### 7.1')).toEqual([
      ['condA', '2', '2', '1', '要確認', '', '**B**、A'],
      ['condB', '1', '1', '0', '要確認', '', 'A'],
    ]);
    expect(tableUnder(section, '### 7.2')).toEqual([
      ['trigA', '3', '2', '1', '要確認', '**B**、A'],
      ['trigB', '1', '1', '0', '要確認', 'A'],
    ]);
    expect(tableUnder(section, '### 7.3')).toEqual([
      ['tgtA', '3', '2', '1', '要確認', '**B**、A'],
      ['tgtB', '1', '1', '0', '要確認', 'A'],
    ]);
  });

  it('writes the name of the table for a key that the table has', () => {
    const rows = tableUnder(headSection([effect({ triggers: ['burstUse'] })]), '### 7.2');
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toContain('バースト');
    expect(rows[0]![0]).not.toBe('burstUse');
  });

  it('files the effects without a written trigger or target under their own rows', () => {
    const E = [
      // きっかけが書かれていない: バーストのスロット・持続（常時）・CT ごと
      effect({ ...A, triggers: [], implicit: 'burstUse', targets: [] }),
      effect({ ...A, triggers: [], implicit: 'none', mods: ['dur:permanent'] }),
      effect({ ...A, triggers: [], implicit: 'none' }),
    ];
    const section = headSection(E);
    expect(tableUnder(section, '### 7.2').map((row) => row.slice(0, 2))).toEqual([
      [expect.stringContaining('バーストのスロットで書かれていない'), '1'],
      [expect.stringContaining('常時'), '1'],
      [expect.stringContaining('スキルのスロットで書かれていない'), '1'],
    ]);
    expect(tableUnder(section, '### 7.3').map((row) => row.slice(0, 2))).toEqual([
      ['tgtA', '2'],
      [expect.stringContaining('読み取れなかった'), '1'],
    ]);
  });

  it('files「自分が〈stat〉増加状態なら」apart from the conditions that look at a state', () => {
    const E = [
      effect({ ...A, conditions: ['selfState'], head: '自分が攻撃力増加状態なら' }),
      effect({ ...A, conditions: ['selfState'], head: '自分が変身状態なら' }),
    ];
    const rows = tableUnder(headSection(E), '### 7.1');
    expect(rows.map((row) => row[1])).toEqual(['1', '1']);
    expect(rows[0]![0]).not.toBe(rows[1]![0]);
  });

  it('splits the filtered allies by how they are filtered, reading the text that decided the target', () => {
    const filtered = (targetText: string, head = '', subHead = '') =>
      tableUnder(
        headSection([effect({ targets: ['ally:alliesFiltered'], head, subHead, targetText })]),
        '### 7.3',
      )[0]![0];
    const byState = filtered('〈状態〉状態の味方全体に');
    // 行の頭や小項目の頭ではなく、対象を決めた文を読む
    const byClass = filtered('火力型の味方に', '〈状態〉状態の味方全体に', '〈状態〉状態の味方全体に');
    const unread = filtered('読み取れない絞り方の味方に', '火力型の味方に');
    expect(new Set([byState, byClass, unread]).size).toBe(3);
    expect(byState).toContain('状態');
    expect(byClass).toContain('型');
  });
});
