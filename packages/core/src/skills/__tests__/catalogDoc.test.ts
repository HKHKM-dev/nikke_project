// スキルの効果の分類の一覧（plan/skill-catalog.md）の書き方: 節の並び・表の形・節ごとの行。
// 区分の付け方（分類の表の中身）は見ない（スキルを定義するたびに変わる）。
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
  kind: 'damage:dot',
  triggers: ['burstUse'],
  implicit: null,
  conditions: [],
  targets: ['self'],
  side: 'self',
  quote: '',
  head: '',
  subHead: '',
  ...fields,
});

const stat = (canon: string, fields: Partial<CatalogStat> = {}): CatalogStat => ({
  name: canon,
  canon,
  dir: 'up',
  scaling: 'ratio',
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

/** 表の行（見出しと区切りの行を除く） */
function tableUnder(doc: readonly string[], heading: string): string[][] {
  return under(doc, heading)
    .filter((l) => l.startsWith('| '))
    .slice(2)
    .map(cells);
}

/** 表の行を、最初の欄で引く */
function rowsUnder(doc: readonly string[], heading: string): Map<string, string[]> {
  return new Map(tableUnder(doc, heading).map((row) => [row[0]!, row]));
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

/** 表ごとの行（見出し・区切り・中身） */
function tablesOf(doc: readonly string[]): string[][] {
  const tables: string[][] = [];
  let current: string[] | undefined;
  for (const l of doc) {
    if (!l.startsWith('|')) current = undefined;
    else if (current === undefined) tables.push((current = [l]));
    else current.push(l);
  }
  return tables;
}

describe('renderSkillCatalog', () => {
  const { characters, defined } = loadCatalogInput();
  const { lines, effects } = classifyCharacters(characters, defined);
  const doc = renderSkillCatalog(lines, effects).split('\n');

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

  it('writes every table with a header, a separator and rows of the same width', () => {
    const tables = tablesOf(doc);
    // 1 節・2 節・3.1〜3.3 節・4.1〜4.3 節・4.5 節・4.6 節・5.1 節・5.2 節・6 節・7.1〜7.3 節
    expect(tables).toHaveLength(16);
    for (const table of tables) {
      const [header, separator, ...rows] = table.map(cells);
      expect(separator).toEqual(header!.map(() => '---'));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.filter((row) => row.length !== header!.length)).toEqual([]);
    }
  });

  it('writes the counts as numbers that nest (effects or lines ≥ characters ≥ defined characters)', () => {
    let checked = 0;
    for (const table of tablesOf(doc)) {
      const [header, , ...rows] = table.map(cells);
      const at = header!.indexOf('キャラ');
      if (at < 1 || !header![at + 1]?.includes('定義あり')) continue;
      for (const row of rows) {
        const [count, chars, definedChars] = row.slice(at - 1, at + 2);
        expect([count, chars, definedChars].filter((x) => !/^\d+$/.test(x!))).toEqual([]);
        expect(Number(chars)).toBeLessThanOrEqual(Number(count));
        expect(Number(definedChars)).toBeLessThanOrEqual(Number(chars));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
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
      const [header, , ...rows] = table.map(cells);
      const at = header!.indexOf('キャラ');
      expect(rows.map((row) => row.slice(at - 1, at + 2))).toEqual(rows.map(() => ['0', '0', '0']));
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
      effect({ ...A, kind: 'stat', stat: stat('attack') }),
      // 状態の中身の stat は、stat に数えて「うち状態の中身」にも出す
      effect({ ...B, kind: 'stat', stat: stat('attack'), state: 'X' }),
      // 名前だけの付与は「うち状態の中身」に数えない
      effect({ ...B, kind: 'state:grant', state: 'Y' }),
    ];
    const rows = tableUnder(familySection(E), '## 1.');
    expect(rows.map((row) => row.slice(0, 5))).toEqual([
      ['バフ・デバフ（stat の▲▼）', '2', '2', '1', '1'],
      ['ダメージ', '1', '1', '0', '0'],
      ['状態の操作（名前だけの付与・解除・消去・切り替え・発動不可など）', '1', '1', '1', '0'],
    ]);
    // 区分ごとの数の和は、効果の数
    for (const row of rows) {
      expect(row.slice(5).reduce((sum, n) => sum + Number(n), 0)).toBe(Number(row[1]));
    }
  });
});

describe('slotGapSection', () => {
  // 爆発範囲は要確認、パーツダメージは前提の外（どちらも式に無い stat）
  const open = (who: typeof A, slot: string, fields: Partial<CatalogEffect> = {}) =>
    effect({ ...who, slot, kind: 'stat', stat: stat('explosionRange'), ...fields });

  it('collects what remains by slot, and counts the slots where it is the only one', () => {
    const E = [
      open(A, 'skill1'),
      open(A, 'skill1'),
      open(B, 'skill1'),
      open(B, 'skill1', { stat: stat('?unknown') }),
      effect({ ...B, slot: 'skill2', kind: 'stat', stat: stat('partsDamage') }),
      effect({ ...B, slot: 'burst', kind: 'stat', stat: stat('attack') }),
    ];
    const section = slotGapSection(E);
    expect(section).toContain('- 残りのあるスロット: 2 / 4（効果の句のあるスロット）');
    expect(tableUnder(section, '## 2.')).toEqual([
      ['効果: 爆発範囲', '2', '1'],
      ['効果: ?unknown', '1', '0'],
    ]);
  });

  it('keeps the active skills without a written trigger apart from what remains', () => {
    const E = [
      effect({ ...A, slot: 'skill1', triggers: [], implicit: 'none', kind: 'stat', stat: stat('attack') }),
      open(B, 'skill1', { triggers: [], implicit: 'none' }),
    ];
    const section = slotGapSection(E);
    expect(section.find((l) => l.startsWith('- 別枠'))).toContain(
      'のあるスロット 2（うち、ほかに残りの無いスロット 1）',
    );
    expect([...rowsUnder(section, '## 2.').keys()]).toEqual(['効果: 爆発範囲']);
  });
});

describe('buffSection', () => {
  it('splits a stat by the side and the direction, with the defined characters first', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('attack') }),
      effect({ ...B, kind: 'stat', stat: stat('attack'), side: 'ally' }),
      effect({ ...A, kind: 'stat', stat: stat('attack'), side: 'ally' }),
      effect({ ...B, kind: 'stat', stat: stat('defense', { dir: 'down' }), side: 'enemy' }),
      effect({ ...A, kind: 'damage:dot' }),
    ];
    const rows = tableUnder(buffSection([], E), '### 3.1');
    expect(rows.map((row) => [...row.slice(0, 6), row.at(-1)])).toEqual([
      ['攻撃力', '味方', '▲', '3', '2', '1', '**B**、A'],
      ['防御力', '敵', '▼', '1', '1', '1', '**B**'],
    ]);
  });

  it('counts how the value is computed, over the stat effects only', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('attack') }),
      effect({ ...A, kind: 'stat', stat: stat('maxAmmo', { scaling: 'flat' }) }),
      effect({ ...B, kind: 'stat', stat: stat('critRate') }),
      effect({ ...B, kind: 'damage:dot' }),
    ];
    const rows = tableUnder(buffSection([], E), '### 3.2');
    expect(rows.map((row) => row.slice(0, 4))).toEqual([
      ['対象自身の値の X%', '2', '2', '1'],
      ['実数（発・個）', '1', '1', '0'],
    ]);
  });

  it('counts the modifiers of the effects and of the lines together', () => {
    const L = [line({ ...B, lineMods: ['dur:seconds'] })];
    const E = [effect({ ...A, mods: ['dur:seconds', 'stack:max'] }), effect({ ...A, mods: ['dur:seconds'] })];
    const rows = tableUnder(buffSection(L, E), '### 3.3');
    expect(rows.map((row) => row.slice(0, 4))).toEqual([
      ['N 秒間維持', '3', '2', '1'],
      ['N スタック', '1', '1', '0'],
    ]);
  });
});

describe('stateSection', () => {
  it('lists the named states with the stages merged, the sides, the contents and whether a head refers to them', () => {
    const L = [line({ ...B, head: '自分がペインロード状態なら' })];
    const E = [
      effect({ ...B, kind: 'stat', stat: stat('attack'), state: 'ペインロード1' }),
      effect({ ...B, kind: 'stat', stat: stat('defense', { dir: 'down' }), state: 'ペインロード2', side: 'enemy' }),
      effect({ ...A, kind: 'damage:dot', state: 'エグゾスパイン Mk2' }),
    ];
    const rows = tableUnder(stateSection(L, E), '### 4.1');
    // キャラの resourceId の順
    expect(rows).toEqual([
      ['エグゾスパイン Mk2', '味方', '—', '持続ダメージ', 'A'],
      ['ペインロード', '味方・敵', 'あり', '攻撃力▲、防御力▼', '**B**'],
    ]);
  });

  it('counts the forms of the life of a state', () => {
    const E = [
      effect({ ...A, kind: 'stat', stat: stat('attack'), state: 'X' }),
      effect({ ...A, kind: 'damage:dot', state: 'X' }),
      effect({ ...B, kind: 'state:grant', state: 'Y' }),
      effect({ ...B, kind: 'state:remove', state: 'Y' }),
      effect({ ...B, kind: 'state:cancel', state: 'Y' }),
    ];
    const rows = tableUnder(stateSection([], E), '### 4.2');
    expect(rows.map((row) => row[1])).toEqual(['1', '1', '1', '1', '1', '0', '0']);
  });

  it('gives the heads that look at a state the status of the same key in section 7', () => {
    const heads: [string, Partial<CatalogLine>, string][] = [
      ['条件: 自分が〈状態〉なら', { conditions: ['selfState'] }, '### 7.1'],
      ['条件: 自分が〈状態〉のフルスタックなら', { conditions: ['selfState:fullStack'] }, '### 7.1'],
      ['条件: 自分が〈状態〉でなければ', { conditions: ['selfState:absent'] }, '### 7.1'],
      ['条件: 自分に〈状態〉適用中', { conditions: ['selfState:while'] }, '### 7.1'],
      ['条件: 対象（敵）が〈状態〉なら', { conditions: ['enemyState'] }, '### 7.1'],
      ['きっかけ: 〈状態〉が適用された時', { triggers: ['stateApplied'] }, '### 7.2'],
      ['きっかけ: 〈状態〉が終了した時', { triggers: ['stateEnded'] }, '### 7.2'],
      ['きっかけ: フルスタックでスタック解除後', { triggers: ['fullStackConsume'] }, '### 7.2'],
      ['対象: 〈状態〉状態の味方', { targets: ['ally:alliesFiltered'], head: '〈状態〉状態の味方全体に' }, '### 7.3'],
    ];
    for (const [form, fields, section] of heads) {
      const viewers = rowsUnder(stateSection([line(fields)], []), '### 4.3');
      expect([...viewers.keys()]).toEqual(heads.map(([name]) => name));
      // 見る形の行にだけ 1 行が数えられる
      expect([...viewers].filter(([, row]) => row[1] !== '0').map(([name]) => name)).toEqual([form]);
      // 7 節は 1 行だけ（その鍵の行）
      const [reference] = [
        ...rowsUnder(headSection([effect({ ...fields, triggers: fields.triggers ?? [] })]), section),
      ];
      expect(form.endsWith(reference![0])).toBe(true);
      expect(viewers.get(form)![4]).toBe(reference![1][4]);
    }
  });

  it('does not count「〈stat〉増加状態なら」as looking at a state', () => {
    const L = [line({ conditions: ['selfState'], head: '自分が攻撃力増加状態なら' })];
    expect(rowsUnder(stateSection(L, []), '### 4.3').get('条件: 自分が〈状態〉なら')![1]).toBe('0');
  });

  it('collects how effects and states come off, and whether what is erased or removed was granted undispellable', () => {
    const L = [
      line({ ...A, flat: '「変身：攻撃力X％▲」「持続」「解除不可」' }),
      line({ ...A, li: 1, flat: '「変身消去」「集中解除」' }),
      line({ ...B, flat: '「バフ効果解除X個」' }),
    ];
    const section = stateSection(L, []);
    const rows = rowsUnder(section, '### 4.5');
    expect(rows.get('解除不可（効果解除で外れない）')!.slice(2, 5)).toEqual(['1', '1', '0']);
    expect(rows.get('〈名前〉消去（同じスキルが外す）')!.slice(2, 5)).toEqual(['1', '1', '0']);
    expect(rows.get('効果解除（バフ・デバフ効果解除 N 個）')!.slice(2, 5)).toEqual(['1', '1', '1']);
    expect(section).toContain('- 消去の相手: 変身（解除不可で付く）');
    // 効果解除は、名前の付いた状態の解除に数えない
    expect(section).toContain('- 解除の相手: 集中（解除不可でない）');
  });

  it('splits the conditions by when they are judged', () => {
    const L = [
      line({ ...A, conditions: ['hp'], triggers: ['burstUse'], head: 'バーストスキル使用時、HPがX％以上なら' }),
      line({ ...A, li: 1, conditions: ['hp'], head: 'HPがX％以上の時に限り', flat: '「持続」「解除不可」' }),
      line({ ...B, conditions: ['hp'], head: 'HPがX％以上なら' }),
      line({ ...B, li: 1, head: '条件の無い行' }),
    ];
    const section = stateSection(L, []);
    const rows = tableUnder(section, '### 4.6');
    expect(rows.map((row) => row.slice(1, 4))).toEqual([
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
      effect({ ...A, kind: 'heal:instant', targets: ['ally:allies'] }),
      effect({ ...B, kind: 'heal:instant', mods: ['meta:interval'], conditions: ['selfState'] }),
      effect({ ...B, kind: 'damage:dot' }),
    ];
    const section = healSection(L, E);
    expect(tableUnder(section, '### 5.1').map((row) => row.slice(0, 4))).toEqual([
      ['回復（1 回）', '2', '1', '0'],
      [expect.stringContaining('間隔'), '1', '1', '1'],
    ]);
    // きっかけ（条件）× 対象
    expect(tableUnder(section, '### 5.2').map((row) => row.slice(0, 2))).toEqual([
      ['バーストスキル使用時（回数の段を含む） × 自分', '1'],
      ['バーストスキル使用時（回数の段を含む） × 味方全体', '1'],
      ['バーストスキル使用時（回数の段を含む）（自分が〈状態〉なら） × 自分', '1'],
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
      effect({ ...A, conditions: ['selfState', 'hp'], triggers: ['burstUse', 'fullBurstStart'] }),
      // 「自分が〈stat〉増加状態なら」は、状態を見る条件と分ける
      effect({ ...B, conditions: ['selfState'], head: '自分が攻撃力増加状態なら', targets: [] }),
      // きっかけが書かれていない: バーストのスロット・持続（常時）・CT ごと
      effect({ ...B, triggers: [], implicit: 'burstUse' }),
      effect({ ...B, triggers: [], implicit: 'none', mods: ['dur:permanent'] }),
      effect({ ...B, triggers: [], implicit: 'none' }),
    ];
    const section = headSection(E);
    expect(tableUnder(section, '### 7.1').map((row) => row.slice(0, 2))).toEqual([
      ['自分が〈状態〉なら', '1'],
      [expect.stringContaining('HP'), '1'],
      ['自分が〈stat〉増加状態なら', '1'],
    ]);
    expect(tableUnder(section, '### 7.2').map((row) => row.slice(0, 2))).toEqual([
      ['バーストスキル使用時（回数の段を含む）', '2'],
      ['フルバーストタイム発動時', '1'],
      ['（バーストのスロットで書かれていない＝バースト使用時）', '1'],
      ['（スキルのスロットで書かれていない・持続＝常時）', '1'],
      [expect.stringContaining('（スキルのスロットで書かれていない'), '1'],
    ]);
    expect(tableUnder(section, '### 7.3').map((row) => row.slice(0, 2))).toEqual([
      ['自分', '4'],
      ['（対象を読み取れなかったもの）', '1'],
    ]);
  });

  it('splits the filtered allies by how they are filtered', () => {
    const E = [
      effect({ ...A, targets: ['ally:alliesFiltered'], head: '〈状態〉状態の味方全体に' }),
      // 行の頭ではなく、句の前の対象に味方が書かれていれば、そちらを読む
      effect({ ...A, targets: ['ally:alliesFiltered'], head: '〈状態〉状態の味方全体に', subHead: '火力型の味方' }),
      effect({ ...A, targets: ['ally:alliesFiltered'], head: '読み取れない絞り方の味方に' }),
    ];
    expect([...rowsUnder(headSection(E), '### 7.3').keys()]).toEqual([
      '〈状態〉状態の味方',
      '〈クラス〉型の味方',
      '絞った味方全体（絞り方を読み取れなかったもの）',
    ]);
  });
});
