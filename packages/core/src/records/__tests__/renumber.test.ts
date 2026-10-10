// 番号の振り直し（plan/design-investigation-review.md 4.3・5 節）の純粋な部分。
// 例の ID は、実在の番号と重ならない 9 千番台・900 番台の録画にする（records:renumber は追跡しているコードの中の ID も置き換えるので、
// 実在の番号を例に使うと、その番号を振り直したときにこのテストまで書き換わる）
import { describe, expect, it } from 'vitest';
import { mentions, rangesContaining, renumberInText, renumberKind, renumberProblems } from '../renumber.ts';

describe('records/renumber', () => {
  it('knows the kinds and rejects mismatched pairs', () => {
    expect(renumberKind('V-9401')).toBe('verification');
    expect(renumberKind('C-9530')).toBe('claim');
    expect(renumberKind('942-12')).toBe('observation');
    expect(renumberKind('L-AD-98')).toBe('observation');
    expect(renumberKind('942')).toBeUndefined();
    expect(renumberProblems('V-9401', 'V-9402')).toEqual([]);
    expect(renumberProblems('V-9401', 'C-9402')).toEqual(['V-9401 と C-9402 の種類が違う']);
    expect(renumberProblems('942-12', '943-12')[0]).toContain('同じ録画の中だけ');
    expect(renumberProblems('V-9401', 'V-9401')).toEqual(['古い ID と新しい ID が同じ']);
  });

  it('replaces only whole ids, not parts of other numbers', () => {
    const text = 'V-9401 と V-94010、`942-12`・`942-120`・`1942-12`・V-9401。C-9040 と C-90401';
    expect(renumberInText(text, 'V-9401', 'V-9405')).toEqual({
      text: 'V-9405 と V-94010、`942-12`・`942-120`・`1942-12`・V-9405。C-9040 と C-90401',
      count: 2,
      ranges: [],
    });
    expect(renumberInText(text, '942-12', '942-15').text).toBe(
      'V-9401 と V-94010、`942-15`・`942-120`・`1942-12`・V-9401。C-9040 と C-90401',
    );
    expect(renumberInText(text, 'C-9040', 'C-9041').count).toBe(1);
  });

  it('expands and recompresses an observation range that contains the old id, keeping its meaning', () => {
    const text = '根拠: `942-11`〜`942-14`・`942-20` と `941-01`〜`941-03`';
    expect(renumberInText(text, '942-12', '942-30')).toEqual({
      text: '根拠: `942-11`・`942-13`〜`942-14`・`942-30`・`942-20` と `941-01`〜`941-03`',
      count: 1,
      ranges: [],
    });
    // 端の ID も同じ（範囲の終わりを替えると、間の番号まで範囲に入ってしまうため）
    expect(renumberInText(text, '942-14', '942-15').text).toBe(
      '根拠: `942-11`〜`942-13`・`942-15`・`942-20` と `941-01`〜`941-03`',
    );
  });

  it('reports the other range notations (V・C, observations without backquotes) for a person to fix', () => {
    const text = '前置き\nC-9160〜C-9162 と V-9216〜V-9218。942-11〜942-13\n`974-01`〜`977-01` は別の録画どうし';
    expect(rangesContaining(text, 'C-9161')).toEqual([{ range: 'C-9160〜C-9162', line: 2 }]);
    expect(rangesContaining(text, 'V-9218')).toEqual([{ range: 'V-9216〜V-9218', line: 2 }]);
    expect(rangesContaining(text, '942-13')).toEqual([{ range: '942-11〜942-13', line: 2 }]);
    expect(rangesContaining(text, '975-01')).toEqual([]);
    const r = renumberInText(text, 'C-9160', 'C-9170');
    expect(r.ranges).toEqual([{ range: 'C-9160〜C-9162', line: 2 }]);
    expect(r.text).toContain('C-9170〜C-9162');
  });

  it('counts mentions, including ranges, so that a new id is only taken when nothing refers to it', () => {
    const text = '`942-11`〜`942-14` と C-9160〜C-9162、V-9401';
    expect(mentions(text, '942-13')).toBe(1);
    expect(mentions(text, '942-15')).toBe(0);
    expect(mentions(text, 'C-9161')).toBe(1);
    expect(mentions(text, 'V-9401')).toBe(1);
    expect(mentions(text, 'V-9402')).toBe(0);
  });
});
