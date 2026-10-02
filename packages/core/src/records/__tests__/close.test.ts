// 閉じる前の検査（plan/design-records-automation.md 3.7 節）
import { describe, expect, it } from 'vitest';
import type { Claim } from '../claims.ts';
import { closeChecks, markState, prTitle, type CloseInput } from '../close.ts';
import type { Observation } from '../observations.ts';
import type { RecordingEntry } from '../recordings.ts';
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
      '## 予測（撮る前に書く）',
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
  readAt: '2026-10-02',
};
const recording = { id: '101', date: '2026-10-01', team: [], legacy: false } as unknown as RecordingEntry;
const base: CloseInput = {
  verification: doc(),
  claims: [claim()],
  observations: [obs],
  recordings: new Map([['101', recording]]),
  prediction: {
    verification: 'V-0099',
    team: [],
    fixedSpec: true,
    hypotheses: [{ id: 'H1' }],
    targets: [],
    predicted: { at: '2026-09-30', commit: 'abc1234', values: {} },
  },
  gradeCandidates: new Map([['C-0001', '反復実測']]),
  warnings: [],
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
  });

  it('予測: 無ければ探索と書く、出していない、日付が録画より後', () => {
    expect(closeChecks({ ...base, prediction: undefined }).errors[0]).toContain('予測ファイル');
    expect(closeChecks({ ...base, prediction: undefined, verification: doc([], { 予測: '探索' }) }).errors).toEqual([]);
    expect(closeChecks({ ...base, prediction: { ...base.prediction!, predicted: null } }).errors[0]).toContain(
      '出していない',
    );
    // 起票（2026-10-02）より前に撮った録画（2026-10-01）は読み直しなので、録画の日は見ない（読んだ日と同じ日の予測は通る）
    const reread = { ...base.prediction!, predicted: { at: '2026-10-02', commit: 'abc1234', values: {} } };
    expect(closeChecks({ ...base, prediction: reread }).errors).toEqual([]);
    // 起票の後に撮った録画の日より後の予測は落ちる
    const shot = { ...recording, date: '2026-10-02' } as RecordingEntry;
    const late = { ...base.prediction!, predicted: { at: '2026-10-03', commit: 'abc1234', values: {} } };
    const lateInput = {
      ...base,
      prediction: late,
      recordings: new Map([['101', shot]]),
      observations: [{ ...obs, readAt: '2026-10-03' }],
    };
    expect(closeChecks(lateInput).errors[0]).toContain('より後');
  });

  it('本文の節が空、既に完了、最小構成の警告、失効は注意', () => {
    expect(closeChecks({ ...base, verification: doc([], { 次: '' }) }).errors[0]).toContain('次に撮るもの');
    expect(closeChecks({ ...base, verification: doc([], { 分かったこと: '' }) }).errors[0]).toContain('分かったこと');
    const r = closeChecks({
      ...base,
      warnings: [{ verification: 'V-0099', recording: '101', unconfirmed: ['a', 'b'] }],
      observations: [{ ...obs, invalid: { reason: '読み違い', date: '2026-10-02' } }],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('最小構成'))).toBe(true);
    expect(r.warnings.some((w) => w.includes('失効'))).toBe(true);
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
