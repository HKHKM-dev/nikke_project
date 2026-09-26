// Stage 20-D: 検証記録（records/verifications/）の書式・状態の規則・一覧（plan/verifications.md）と、
// 文書の中の ID の参照がどれも実在すること（plan/design-stage20.md 3.2・3.2.1・3.6 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROOT,
  VERIFICATIONS_PATH,
  documentPaths,
  loadClaims,
  loadObservations,
  loadRecordingsFile,
  loadVerifications,
} from '../../../scripts/records-data.ts';
import type { Observation } from '../observations.ts';
import { idReferencesIn } from '../references.ts';
import {
  VERIFICATION_SECTIONS,
  parseVerification,
  renderVerifications,
  validateVerifications,
  type Verification,
} from '../verifications.ts';

const claims = loadClaims();
const observations = loadObservations();
const recordingIds = new Set(loadRecordingsFile().recordings.map((r) => r.id));
const verifications = loadVerifications();

/** 検証記録の本文を組む（header は冒頭の箇条書きの行） */
function doc(id: string, header: string[], body: Partial<Record<string, string>> = {}): string {
  return [
    `# ${id}: 題名 ${id}`,
    '',
    ...header,
    '',
    ...VERIFICATION_SECTIONS.flatMap((h) => [`## ${h}`, '', body[h] ?? '', '']),
  ].join('\n');
}
const header = (state: string, extra: string[] = []) => [
  '- 問い: 何かを知りたい',
  '- 話題: 命中率・距離',
  '- 日付: 2026-09-27',
  `- 状態: ${state}`,
  ...extra,
];
const record = (id: string, state: string, extra: string[] = [], body: Partial<Record<string, string>> = {}) =>
  parseVerification(`${id}-x.md`, doc(id, header(state, extra), body));
const check = (list: Verification[], obs: readonly Observation[] = []) =>
  validateVerifications(list, { claims, recordingIds, observations: obs });

describe('records/verifications・plan/verifications.md', () => {
  it('passes validation and matches plan/verifications.md (npm run records:check)', () => {
    expect(validateVerifications(verifications, { claims, recordingIds, observations })).toEqual([]);
    expect(readFileSync(VERIFICATIONS_PATH, 'utf8')).toBe(renderVerifications(verifications, observations));
  });

  it('reads the header items, id lists and sections', () => {
    const v = parseVerification(
      'V-0012-aim-circle.md',
      doc('V-0012', [
        ...header('完了', ['- Stage: 18-B2', '- 録画: `064`〜`066`、`L-AD`', '- 結論: `C-0038`、`C-0044`']),
      ]),
    );
    expect(v.problems).toEqual([]);
    expect(v).toMatchObject({
      id: 'V-0012',
      title: '題名 V-0012',
      question: '何かを知りたい',
      topic: '命中率・距離',
      state: '完了',
      stage: '18-B2',
      recordings: ['064', '065', '066', 'L-AD'],
      claims: ['C-0038', 'C-0044'],
    });
    expect([...v.sections.keys()]).toEqual([...VERIFICATION_SECTIONS]);
    expect(check([v])).toEqual([]);
  });

  it('reports what does not follow the format, instead of skipping it', () => {
    const problems = parseVerification(
      'V-0003_bad.md',
      [
        '# V-0004: 題名',
        '',
        '- 問い: q',
        '- 話題: 命中率・距離',
        '- 問い: q2',
        '- 状態: 調査中',
        '- メモ: x',
        '- 録画: 064, 065',
        '',
        'ここに文',
        '## 条件',
        '## 読み方',
        '## 予測（撮る前に書く）',
        '## 余談',
      ].join('\n'),
    ).problems;
    expect(problems).toEqual([
      'V-0003_bad.md: ファイル名は V-<4 桁以上の数字>-<英小文字・数字・->.md',
      'V-0004: 冒頭の項目が重複している: 問い',
      'V-0004: 冒頭の行が書式に合わない: - メモ: x',
      'V-0004: 冒頭に「日付」が無い',
      'V-0004: 冒頭の箇条書きと本文の見出しのあいだに文がある: ここに文',
      'V-0004: 本文の見出しが語彙に無い: 余談',
      'V-0004: 本文の見出しの順が違う',
      'V-0004: 本文に「## 結果」が無い',
      'V-0004: 本文に「## 分かったこと・分からないこと」が無い',
      'V-0004: 本文に「## 次に撮るもの」が無い',
      'V-0004: 「録画」はバッククォートで囲んだ ID を「、」で区切って書く: 064, 065',
    ]);
    expect(parseVerification('V-0005-x.md', doc('V-0006', header('調査中'))).problems).toEqual([
      'V-0006: ファイル名の ID と 1 行目の ID が違う',
    ]);
  });

  it('checks the rules of the states, the ids and the cycles of dependencies', () => {
    const errors = check(
      [
        record('V-0001', '完了'),
        record('V-0002', '保留'),
        record('V-0003', '調査中', ['- 結論: `C-0038`']),
        record('V-0004', '打ち切り', ['- 結論: `C-0038`']),
        record('V-0005', '保留', ['- 依存: `V-0006`']),
        record('V-0006', '保留', ['- 依存: `V-0005`']),
        record('V-0007', '中断', ['- 録画: `999`', '- 結論: `C-9999`', '- 派生元: `V-0999`', '- 訂正: `V-0007`']),
        record('V-0008', '保留', ['- 待ち: 育成', '- 依存: `V-0001`']),
        record('V-0009', '打ち切り', ['- 結論: `C-0004`'], { '分かったこと・分からないこと': '描画落ちで読めない' }),
      ],
      [{ ...observations[0]!, id: '999-01', source: 'V-0998' }],
    );
    expect(errors).toEqual([
      'V-0001: 完了の検証記録には「結論」が 1 つ以上要る',
      'V-0002: 保留には「依存」か「待ち」が要る',
      'V-0003: 調査中の検証記録には「結論」を書かない',
      'V-0004: 打ち切りの「結論」に書けるのは範囲外の結論だけ（C-0038 は確定）',
      'V-0004: 打ち切りには「分かったこと・分からないこと」の本文が要る',
      'V-0007: 状態が語彙に無い: 中断',
      'V-0007: 録画 999 が無い',
      'V-0007: 結論 C-9999 が無い',
      'V-0007: 派生元の検証記録 V-0999 が無い',
      'V-0007: 訂正に自分を書いている',
      'V-0005: 依存が循環している（V-0005 → V-0006 → V-0005）',
      '999-01: source の検証記録 V-0998 が無い',
    ]);
  });

  it('lists the open ones first, marking what can resume and what lost its premise', () => {
    const list = [
      record('V-0010', '完了', ['- 結論: `C-0038`']),
      record('V-0011', '打ち切り', [], { '分かったこと・分からないこと': '再現しない' }),
      record('V-0012', '保留', ['- 依存: `V-0010`', '- 派生元: `V-0010`']),
      record('V-0013', '保留', ['- 依存: `V-0010`、`V-0011`']),
      record('V-0014', '保留', ['- 依存: `V-0012`', '- 待ち: 育成']),
      record('V-0015', '調査中', ['- 訂正: `V-0010`']),
    ];
    expect(check(list)).toEqual([]);
    const text = renderVerifications(list, [{ ...observations[0]!, id: '064-01', source: 'V-0010' }]);
    const open = text.slice(text.indexOf('## 開いている検証'), text.indexOf('## 全件'));
    expect(open).toContain('**V-0012** 題名 V-0012（状態: 保留・依存: V-0010） — **再開できる**');
    expect(open).toContain(
      '**V-0013** 題名 V-0013（状態: 保留・依存: V-0010、V-0011） — **依存先が打ち切り（前提を見直す）**',
    );
    expect(open).toContain('**V-0014** 題名 V-0014（状態: 保留・依存: V-0012・待ち: 育成）\n');
    expect(open).toContain('**V-0015**');
    expect(open).not.toContain('V-0010**');
    const all = text.slice(text.indexOf('## 全件'));
    expect(all).toContain('[V-0010](../records/verifications/V-0010-x.md)');
    expect(all).toMatch(/V-0010-x\.md\)\*\* [^\n]*\n(?: {2}- [^\n]*\n)*? {2}- 観測値: 064-01\n/);
    expect(all).toContain('  - 止めている検証: V-0012、V-0013');
    expect(all).toContain('  - 派生した検証: V-0012');
    expect(all).toContain('  - 訂正された（訂正した記録）: V-0015');
  });
});

describe('文書の中の ID の参照', () => {
  it('picks prefixed ids, but not numbers, file names or code blocks', () => {
    const text = [
      'C-0001 と `C-0002`、V-0003。`C-20260926-1` や XC-0004、C-12 は拾わない。',
      '`L-AD` と `L-AD-01` は拾い、囲まない L-AI と `064`・`064-01` は拾わない。',
      '```',
      'C-0005',
      '```',
    ].join('\n');
    expect(idReferencesIn(text)).toEqual([
      { kind: 'claim', id: 'C-0001' },
      { kind: 'claim', id: 'C-0002' },
      { kind: 'verification', id: 'V-0003' },
      { kind: 'recording', id: 'L-AD' },
      { kind: 'observation', id: 'L-AD-01' },
    ]);
  });

  it('finds every referenced id in plan/, records/ and AGENTS.md', () => {
    const exists = {
      claim: new Set(claims.map((c) => c.id)),
      verification: new Set(verifications.map((v) => v.id)),
      recording: recordingIds,
      observation: new Set(observations.map((o) => o.id)),
    };
    const missing = documentPaths().flatMap((path) =>
      idReferencesIn(readFileSync(`${ROOT}${path}`, 'utf8'))
        .filter((r) => !exists[r.kind].has(r.id))
        .map((r) => `${path}: ${r.id}`),
    );
    expect(missing).toEqual([]);
  });
});
