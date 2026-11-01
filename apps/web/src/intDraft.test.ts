import { describe, expect, it } from 'vitest';
import { parseIntDraft, settleIntDraft } from './intDraft.ts';

describe('parseIntDraft（打ちかけの値をいつ反映するか）', () => {
  it('reflects only integers inside min..max', () => {
    expect(parseIntDraft('200', 1, Infinity)).toBe(200);
    expect(parseIntDraft('1', 1, 40)).toBe(1);
    expect(parseIntDraft('40', 1, 40)).toBe(40);
  });

  it('keeps an empty, partial, or out-of-range draft without reflecting it', () => {
    // シンクロ LV を消して打ち直す途中: 空欄を 1 にして書き戻すと、続けて打った 200 が 1200 になっていた
    expect(parseIntDraft('', 1, Infinity)).toBeNull();
    expect(parseIntDraft('  ', 1, Infinity)).toBeNull();
    expect(parseIntDraft('0', 1, 40)).toBeNull();
    expect(parseIntDraft('41', 1, 40)).toBeNull();
    expect(parseIntDraft('2.5', 1, 40)).toBeNull();
    expect(parseIntDraft('-', 0, 10)).toBeNull();
  });
});

describe('settleIntDraft（フォーカスが外れたときの確定）', () => {
  it('returns to the current value for an empty or non-numeric draft', () => {
    // 戦闘時間の欄を空にしても、0 秒の計算を出さない
    expect(settleIntDraft('', 180, 1, Infinity)).toBe(180);
    expect(settleIntDraft('-', 5, 0, 10)).toBe(5);
  });

  it('clamps and rounds a numeric draft into min..max', () => {
    expect(settleIntDraft('0', 180, 1, Infinity)).toBe(1);
    expect(settleIntDraft('99', 3, 1, 40)).toBe(40);
    expect(settleIntDraft('4.6', 3, 1, 10)).toBe(5);
    expect(settleIntDraft('7', 3, 1, 10)).toBe(7);
  });
});
