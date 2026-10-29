// 検証記録・結論・録画の ID の形。例の ID は実在の番号と重ならない 9 千番台にする（renumber.test.ts の冒頭と同じ理由）
import { describe, expect, it } from 'vitest';
import { C_ID, RECORDING_ID, V_ID, V_ID_IN_TEXT } from '../ids.ts';

describe('records/ids', () => {
  it('accepts 4 or more digits and nothing else', () => {
    expect(V_ID.test('V-9401')).toBe(true);
    expect(V_ID.test('V-94010')).toBe(true);
    expect(V_ID.test('V-940')).toBe(false);
    expect(V_ID.test('V-9401a')).toBe(false);
    expect(V_ID.test('C-9401')).toBe(false);
    expect(C_ID.test('C-9530')).toBe(true);
    expect(C_ID.test('C-95300')).toBe(true);
    expect(C_ID.test('C-953')).toBe(false);
    expect(C_ID.test('V-9530')).toBe(false);
  });

  it('takes recording numbers of exactly 4 digits', () => {
    expect(RECORDING_ID.test('0942')).toBe(true);
    expect(RECORDING_ID.test('9420')).toBe(true);
    expect(RECORDING_ID.test('942')).toBe(false);
    expect(RECORDING_ID.test('94200')).toBe(false);
    expect(RECORDING_ID.test('0001')).toBe(true);
    expect(RECORDING_ID.test('0000')).toBe(false);
  });

  it('finds a verification ID inside text', () => {
    expect(V_ID_IN_TEXT.test('根拠は V-9401 の観測値')).toBe(true);
    expect(V_ID_IN_TEXT.test('根拠は C-9530')).toBe(false);
  });
});
