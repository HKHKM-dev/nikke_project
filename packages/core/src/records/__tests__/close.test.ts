// 閉じる前の検査（plan/design-records-automation.md 3.7 節）
import { describe, expect, it } from 'vitest';
import type { Claim } from '../claims.ts';
import { closeChecks, markState, prTitle, type CloseInput } from '../close.ts';
import type { Observation } from '../observations.ts';
import { parseVerification } from '../verifications.ts';

const doc = (extra: string[] = [], sections: Partial<Record<string, string>> = {}) =>
  parseVerification(
    'V-0099-x.md',
    [
      '# V-0099: 題名',
      '',
      '- 問い: q',
      '- 話題: 命中率・距離',
      '- 日付: 2026-10-02',
      '- 録画: `101`',
      '- 結論: `C-0001`',
      '- 状態: 調査中',
      ...extra,
      '',
      '## 条件',
      '',
      '## 予測',
      sections['予測'] ?? '仮説 H1',
      '## 読み方',
      '',
      '## 結果',
      '',
      '## 分かったこと・分からないこと',
      sections['分かったこと'] ?? 'x',
      '## 次に撮るもの',
      sections['次'] ?? 'なし',
    ].join('\n'),
  );

const claim = (patch: Partial<Claim> = {}): Claim => ({
  id: 'C-0001',
  text: 't',
  state: '確定',
  topic: '命中率・距離',
  grade: '反復実測',
  basis: '`101-01`。V-0099',
  model: 'm',
  replaces: [],
  updated: '2026-10-02',
  observations: ['101-01'],
  subject: { mechanism: 'targetTable' },
  decidedOn: [],
  ...patch,
});
const obs: Observation = {
  id: '101-01',
  recording: '101',
  kind: 'total',
  use: 'compare',
  value: 1,
  description: '',
  source: 'V-0099',
  scope: { slot: 1, source: 'normal' },
  readAt: '2026-10-02',
};
const base: CloseInput = {
  verification: doc(),
  claims: [claim()],
  observations: [obs],
  gradeCandidates: new Map([['C-0001', '反復実測']]),
  minimal: new Map(),
};

describe('closeChecks', () => {
  it('条件がそろえば誤りなし', () => {
    expect(closeChecks(base)).toEqual({ errors: [], warnings: [] });
  });

  it('結論が無い・根拠に結び付かない・等級が候補より上', () => {
    expect(closeChecks({ ...base, claims: [] }).errors[0]).toContain('結論 C-0001 が無い');
    const untied = claim({ basis: '`074-01`', observations: ['074-01'] });
    expect(closeChecks({ ...base, claims: [untied] }).errors[0]).toContain('観測値も ID');
    const tiedById = claim({ basis: 'V-0099 の読み', observations: [] });
    expect(closeChecks({ ...base, claims: [tiedById] }).errors).toEqual([]);
    expect(closeChecks({ ...base, gradeCandidates: new Map([['C-0001', '単独実測']]) }).errors[0]).toContain(
      '機械の候補',
    );
    expect(
      closeChecks({
        ...base,
        claims: [claim({ grade: 'データ明記' })],
        gradeCandidates: new Map([['C-0001', '単独実測']]),
      }).errors,
    ).toEqual([]);
    // 人の判断で候補より上にした等級は、理由（gradeReason）があれば注意にとどめる（design-minimal-relevance.md 11.7 節）
    const reasoned = closeChecks({
      ...base,
      claims: [claim({ gradeReason: '1 本の録画の中の反復' })],
      gradeCandidates: new Map([['C-0001', '単独実測']]),
    });
    expect(reasoned.errors).toEqual([]);
    expect(reasoned.warnings[0]).toContain('理由: 1 本の録画の中の反復');
  });

  it('撮る前の予測と読みの順は見ない（plan/design-investigation-review.md 1 節）', () => {
    // 予測ファイルが無く、「予測」の節に探索・手計算と書いていなくても通る
    expect(closeChecks({ ...base, verification: doc([], { 予測: 'なし' }) }).errors).toEqual([]);
    // 観測値を読んだ日が予測より前でも通る（予測は入力に無い）
    expect(closeChecks({ ...base, observations: [{ ...obs, readAt: '2026-09-01' }] }).errors).toEqual([]);
  });

  it('確定の反復実測の結論に decidedOn が無ければ誤り（同 1.3 節）', () => {
    const noDecided = claim();
    delete noDecided.decidedOn;
    expect(closeChecks({ ...base, claims: [noDecided] }).errors[0]).toContain('decidedOn が無い');
    // 厳密一致・仮説の結論は問わない
    expect(
      closeChecks({
        ...base,
        claims: [{ ...noDecided, grade: '厳密一致' }],
        gradeCandidates: new Map([['C-0001', '厳密一致']]),
      }).errors,
    ).toEqual([]);
    expect(closeChecks({ ...base, claims: [{ ...noDecided, state: '仮説' }] }).errors).toEqual([]);
    // 書いてあれば通る（空でもよい）
    expect(
      closeChecks({ ...base, claims: [claim({ decidedOn: [{ recording: '101', role: '仮説の出どころ' }] })] }).errors,
    ).toEqual([]);
  });

  it('確定の結論の根拠に compare も scope も無い観測値があれば誤り、subject が無ければ注意（設計書 9 節の 2・3.2 節）', () => {
    const bare: Observation = { ...obs, use: 'record' };
    delete bare.scope;
    expect(closeChecks({ ...base, observations: [bare] }).errors.some((e) => e.includes('scope が無い'))).toBe(true);
    // 仮説の結論なら問わない
    const hypothesis = closeChecks({
      ...base,
      observations: [bare],
      claims: [claim({ state: '仮説', grade: '単独実測' })],
    });
    expect(hypothesis.errors.some((e) => e.includes('scope'))).toBe(false);
    const noSubject = claim();
    delete noSubject.subject;
    expect(closeChecks({ ...base, claims: [noSubject] }).warnings.some((w) => w.includes('subject'))).toBe(true);
  });

  it('本文の節が空、既に完了、ほかの記録の観測値の組の最小構成の警告、失効は注意', () => {
    expect(closeChecks({ ...base, verification: doc([], { 次: '' }) }).errors[0]).toContain('次に撮るもの');
    expect(closeChecks({ ...base, verification: doc([], { 分かったこと: '' }) }).errors[0]).toContain('分かったこと');
    const pair = (observation: string) => ({
      observation,
      recordings: [observation.slice(0, 3)],
      elements: [{ name: 'a', reason: '根拠なし' }],
      marked: [],
    });
    // 失効した観測値で、ほかの記録の観測値（050-01）の組にだけ警告がある
    const r = closeChecks({
      ...base,
      minimal: new Map([['C-0001', [pair('050-01')]]]),
      observations: [{ ...obs, invalid: { reason: '読み違い', date: '2026-10-02' } }],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('最小構成'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('失効'))).toBe(true);
  });

  it('確定の結論で、この記録の観測値の組に最小構成の警告があれば誤り（設計書 11 節）', () => {
    const pair = {
      observation: '101-01',
      recordings: ['101'],
      elements: [{ name: 'a', reason: '根拠なし' }],
      marked: [],
    };
    const r = closeChecks({ ...base, minimal: new Map([['C-0001', [pair]]]) });
    expect(r.errors.some((e) => e.includes('最小構成の警告がある'))).toBe(true);
    // 印だけの組は止めない
    const marked = { ...pair, elements: [], marked: ['a'] };
    expect(closeChecks({ ...base, minimal: new Map([['C-0001', [marked]]]) }).errors).toEqual([]);
    // 仮説の結論は止めない
    const hypothesis = closeChecks({
      ...base,
      claims: [claim({ state: '仮説', grade: '単独実測' })],
      minimal: new Map([['C-0001', [pair]]]),
    });
    expect(hypothesis.errors.some((e) => e.includes('最小構成'))).toBe(false);
  });

  it('確定に残った条件は、人の判断（judgment）で上書きしていなければ誤り（plan/design-investigation-review.md 3 節）', () => {
    const judged = (...overrides: NonNullable<Claim['judgment']>['overrides']) =>
      claim({ judgment: { decided: '2026-10-11', overrides, reason: 'r' } });
    // 比べる指標が無い（機械が等級の候補を出せない）。データ明記は人の等級なので問わない
    expect(closeChecks({ ...base, gradeCandidates: new Map() }).errors[0]).toContain('「指標なし」');
    expect(closeChecks({ ...base, gradeCandidates: new Map(), claims: [judged('指標なし')] }).errors).toEqual([]);
    expect(
      closeChecks({ ...base, gradeCandidates: new Map(), claims: [claim({ grade: 'データ明記' })] }).errors,
    ).toEqual([]);
    // この記録の根拠の観測値が許容外
    expect(closeChecks({ ...base, outside: new Set(['101-01']) }).errors[0]).toContain('許容外（101-01）');
    expect(closeChecks({ ...base, outside: new Set(['101-01']), claims: [judged('許容外')] }).errors).toEqual([]);
    // 予測と合う仮説が 2 つ以上
    expect(closeChecks({ ...base, predictionFits: ['H1', 'H2'] }).errors[0]).toContain('合う仮説が 2 つ（H1・H2）');
    expect(
      closeChecks({ ...base, predictionFits: ['H1', 'H2'], claims: [judged('合う仮説が 2 つ以上')] }).errors,
    ).toEqual([]);
    // この記録の観測値の組の最小構成の警告は、人の判断なら注意にとどめる
    const pair = {
      observation: '101-01',
      recordings: ['101'],
      elements: [{ name: 'a', reason: '根拠なし' }],
      marked: [],
    };
    const r = closeChecks({ ...base, minimal: new Map([['C-0001', [pair]]]), claims: [judged('最小構成の警告')] });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('人の判断（judgment）で通した'))).toBe(true);
    // 仮説の結論は問わない
    expect(
      closeChecks({ ...base, gradeCandidates: new Map(), claims: [claim({ state: '仮説', grade: '単独実測' })] })
        .errors,
    ).toEqual([]);
  });

  it('「結論」が無い記録は完了にできない', () => {
    const v = parseVerification('V-0099-x.md', doc().sections.get('条件') === undefined ? '' : '');
    void v;
    const noClaims = { ...base, verification: { ...base.verification, claims: [] } };
    expect(closeChecks(noClaims).errors[0]).toContain('1 つ以上要る');
  });
});

describe('markState・prTitle', () => {
  it('状態の行を書き換え、題名の案を作る', () => {
    expect(markState('# V\n\n- 問い: q\n- 状態: 調査中\n', '完了')).toBe('# V\n\n- 問い: q\n- 状態: 完了\n');
    expect(() => markState('# V\n', '完了')).toThrow();
    expect(prTitle({ id: 'V-0099', title: '題名', claims: ['C-0001', 'C-0002'] })).toBe(
      '題名（V-0099、C-0001、C-0002）',
    );
  });
});
