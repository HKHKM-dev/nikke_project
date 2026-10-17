// 番号の振り直し（plan/design-investigation-review.md 4.3・5 節）の純粋な部分。
// 例の ID は、実在の番号と重ならない 9 千番台・900 番台の録画にする（records:renumber は追跡しているコードの中の ID も置き換えるので、
// 実在の番号を例に使うと、その番号を振り直したときにこのテストまで書き換わる）
import { describe, expect, it } from 'vitest';
import {
  mentions,
  rangesContaining,
  recordingMentions,
  renumberInText,
  renumberKind,
  renumberProblems,
  renumberRecordingInText,
} from '../renumber.ts';

describe('records/renumber', () => {
  it('knows the kinds and rejects mismatched pairs', () => {
    expect(renumberKind('V-9401')).toBe('verification');
    expect(renumberKind('C-9530')).toBe('claim');
    expect(renumberKind('942-12')).toBe('observation');
    expect(renumberKind('L-AD-98')).toBe('observation');
    expect(renumberKind('942')).toBe('recording');
    expect(renumberKind('9420')).toBe('recording');
    expect(renumberKind('94200')).toBeUndefined();
    expect(renumberKind('L-AD')).toBeUndefined();
    expect(renumberProblems('942', '0942')).toEqual(['古い ID と新しい ID が同じ']);
    expect(renumberProblems('942', '942-01')).toEqual(['942 と 942-01 の種類が違う']);
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

describe('records/renumber（録画）', () => {
  const obs = new Set(['951-01', '951-02', '951-03']);
  const md = { observations: obs, json: false };

  it('replaces the recording in lists after 録画, backquoted lists, observation ids and file names', () => {
    const text = [
      '- 録画: `951`、`978`',
      '録画 951・978 の読み直し。録画（951）の中で。`951`・`9510` と 1951・951,000',
      '根拠: `951-01`〜`951-03`・`952-01`。`20261002-951_rl_x.mp4`・`951_f1200_ammo.jpg`・`derived/951/`',
    ].join('\n');
    const r = renumberRecordingInText(text, '951', '9605', md);
    expect(r.text).toBe(
      [
        '- 録画: `9605`、`978`',
        '録画 9605・978 の読み直し。録画（9605）の中で。`9605`・`9510` と 1951・951,000',
        '根拠: `9605-01`〜`9605-03`・`952-01`。`20261002-9605_rl_x.mp4`・`9605_f1200_ammo.jpg`・`derived/9605/`',
      ].join('\n'),
    );
    expect(r.count).toBe(9);
    // 素の 951 は置き換えず、同じ行に「録画」があれば出す
    expect(r.manual).toEqual([
      { line: 2, text: expect.stringContaining('951,000'), reason: '素の番号（置き換えていない）' },
    ]);
  });

  it('expands and recompresses a range that contains the old number', () => {
    const r = renumberRecordingInText('録画 950〜953 と `950`〜`954`、`960`', '952', '990', md);
    // まとめ直した並びは、元の並びの区切り（ここでは「、」）でつなぐ
    expect(r.text).toBe('録画 950〜951・953・990 と `950`〜`951`、`953`〜`954`、`990`、`960`');
    expect(renumberRecordingInText('録画 950〜952 の', '951', '949', md).text).toBe('録画 949・950・952 の');
  });

  it('does not take counts, other numbers or ids of other kinds', () => {
    const text = '録画 951 本・録画 951f・V-0951・C-0951・`951-04`・L-951';
    const r = renumberRecordingInText(text, '951', '960', md);
    expect(r.text).toBe(text);
    expect(r.manual).toEqual([
      { line: 1, text, reason: '観測値のファイルに無い 951-04（置き換えていない）' },
      { line: 1, text, reason: '素の番号（置き換えていない）' },
    ]);
  });

  it('reports observation ranges across recordings', () => {
    const text = '`950-06`〜`953-06`';
    const r = renumberRecordingInText(text, '951', '960', md);
    expect(r.text).toBe(text);
    expect(r.manual[0]!.reason).toContain('録画をまたぐ観測値の範囲');
  });

  it('replaces JSON strings only when asked, and reads the 2-digit writing of an early recording', () => {
    const json = '{ "id": "951", "recording": "951", "file": "20261002-951_rl_x.mp4", "n": 951 }';
    expect(renumberRecordingInText(json, '951', '960', { observations: obs, json: true }).text).toBe(
      '{ "id": "960", "recording": "960", "file": "20261002-960_rl_x.mp4", "n": 951 }',
    );
    expect(renumberRecordingInText(json, '951', '960', md).text).toContain('"id": "951"');
    // 2 桁の時代（001〜063）の書き方。実在の録画の番号を文字のまま書かない（振り直しでこのテストが書き換わらないように）
    const early = String(5 * 9).padStart(3, '0');
    const two = String(Number(early));
    const r = renumberRecordingInText(
      `録画 ${two}・${Number(early) + 1} と \`2026092${two.length}-${two}_SG_x.mp4\`、\`2026092${two.length}-${two}_SG_x_f100.jpg\``,
      early,
      '9606',
      md,
    );
    expect(r.text).toBe(
      `録画 9606・${Number(early) + 1} と \`2026092${two.length}-9606_SG_x.mp4\`、\`2026092${two.length}-9606_SG_x_f100.jpg\``,
    );
  });

  it('counts mentions of a number, so that a new number is only taken when nothing refers to it', () => {
    expect(recordingMentions('録画 950〜953', '952', false)).toBe(1);
    expect(recordingMentions('`952-04` と `20261002-952_x.mp4`', '952', false)).toBe(2);
    expect(recordingMentions('`950-06`〜`953-06`', '952', false)).toBe(1);
    expect(recordingMentions('{ "recording": "952" }', '952', true)).toBe(1);
    expect(recordingMentions('{ "recording": "952" }', '952', false)).toBe(0);
    expect(recordingMentions('952 本・V-0952・録画 952 本', '952', false)).toBe(0);
  });
});
