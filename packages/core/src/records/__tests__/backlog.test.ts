// 残っている仕事の一覧（plan/backlog.md）を課題のファイルと雛形から作る（plan/design-backlog-files.md）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACKLOG_PATH, renderBacklogOfData } from '../../../scripts/records-data.ts';
import { parseBacklogTemplate, renderBacklog, validateBacklog, type BacklogItem } from '../backlog.ts';

const TEMPLATE = [
  '# 一覧',
  '',
  '## 1. 撮ると決まっている',
  '',
  '<!-- backlog 1 -->',
  '',
  '## 2. 機構',
  '',
  '<!-- backlog 2 | # | 課題 | 要るもの | -->',
  '',
  '## 3. 残差',
  '',
  '<!-- backlog 3 | 観測値 | 内容 | -->',
  '',
  '## 8. 課題',
  '',
  '<!-- backlog 8 -->',
  '',
].join('\n');

const ITEMS: BacklogItem[] = [
  { name: '2-10', section: '2', cells: { 課題: 'b', 要るもの: '撮影' } },
  { name: '2-9', section: '2', cells: { 課題: 'a', 要るもの: '—' } },
  { name: 'later', section: '8', order: 20, text: '後の課題' },
  { name: 'first', section: '8', order: -5, text: '先の課題' },
  { name: 'same-b', section: '3', order: 10, cells: { 観測値: '`0001-02`', 内容: 'y' } },
  { name: 'same-a', section: '3', order: 10, cells: { 観測値: '`0001-01`', 内容: 'x' } },
];

describe('parseBacklogTemplate', () => {
  it('reads the markers: list sections without columns, table sections with the columns in order', () => {
    expect(parseBacklogTemplate(TEMPLATE)).toEqual([
      { section: '1' },
      { section: '2', columns: ['#', '課題', '要るもの'] },
      { section: '3', columns: ['観測値', '内容'] },
      { section: '8' },
    ]);
  });
});

describe('renderBacklog', () => {
  it('fills tables (# from the name, by number) and lists (by order, then name), and （なし） for empty sections', () => {
    expect(renderBacklog(TEMPLATE, ITEMS)).toBe(
      [
        '# 一覧',
        '',
        '## 1. 撮ると決まっている',
        '',
        '（なし）',
        '',
        '## 2. 機構',
        '',
        '<!-- prettier-ignore -->',
        '| # | 課題 | 要るもの |',
        '| --- | --- | --- |',
        '| 2-9 | a | — |',
        '| 2-10 | b | 撮影 |',
        '',
        '## 3. 残差',
        '',
        '<!-- prettier-ignore -->',
        '| 観測値 | 内容 |',
        '| --- | --- |',
        '| `0001-01` | x |',
        '| `0001-02` | y |',
        '',
        '## 8. 課題',
        '',
        '- 先の課題',
        '- 後の課題',
        '',
      ].join('\n'),
    );
  });
});

describe('validateBacklog', () => {
  const slots = parseBacklogTemplate(TEMPLATE);
  const ctx = { ids: new Set(['V-0001', 'C-0002']), exists: (p: string) => p === 'design-a.md' };

  it('accepts well-formed items with known IDs and links', () => {
    const ok: BacklogItem[] = [
      ...ITEMS,
      {
        name: 'linked',
        section: '8',
        order: 30,
        text: '題（V-0001・C-0002）: [design-a.md](design-a.md#x)、[外](https://example.com)',
      },
    ];
    expect(validateBacklog(slots, ok, ctx)).toEqual([]);
  });

  it('reports the shape, the name, the order, the cells and the references', () => {
    const bad: BacklogItem[] = [
      { name: 'x', section: '9', order: 1, text: 't' },
      { name: 'not-numbered', section: '2', cells: { 課題: 'a', 要るもの: 'b' } },
      { name: '2-11', section: '2', order: 5, cells: { 要るもの: 'b', 課題: 'a' } },
      { name: '8-1', section: '8', order: 1, text: 't' },
      { name: 'no-order', section: '8', text: 't' },
      { name: 'no-text', section: '8', order: 1 },
      { name: 'pipe', section: '3', order: 1, cells: { 観測値: 'a | b', 内容: '1\n2' } },
      { name: 'refs', section: '8', order: 1, text: 'V-0009 と [d](design-missing.md)' },
    ];
    expect(validateBacklog(slots, bad, ctx)).toEqual([
      'records/backlog/x.json: 節 9 が雛形（records/backlog/template.md）の印に無い',
      'records/backlog/not-numbered.json: 節 2 の課題は、名前を番号（2-NN）にする',
      'records/backlog/2-11.json: 節 2 は番号順なので order を持たない',
      'records/backlog/2-11.json: 節 2 は表なので cells の列を 課題・要るもの の順にする（いま 要るもの・課題）',
      'records/backlog/8-1.json: 名前は英小文字・数字・ハイフンにし、番号（N-NN）の形にしない（番号は # の列のある節だけ）',
      'records/backlog/no-order.json: order（節の中の並び。数）が無い',
      'records/backlog/no-text.json: 節 8 は箇条なので text が要る',
      'records/backlog/pipe.json: セルにエスケープしていない | がある（\\| にする）',
      'records/backlog/pipe.json: 文に改行がある（1 行で書く）',
      'records/backlog/refs.json: V-0009 が無い',
      'records/backlog/refs.json: リンクの先 design-missing.md（plan/ からの相対パス）が無い',
    ]);
  });
});

describe('plan/backlog.md', () => {
  it('is generated from records/backlog/ and the template (run npm run records:check)', () => {
    expect(readFileSync(BACKLOG_PATH, 'utf8')).toBe(renderBacklogOfData());
  });
});
