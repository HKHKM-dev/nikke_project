import { describe, expect, it } from 'vitest';
import {
  CARD_SLOTS,
  type CardRaw,
  changesOf,
  formatHpTsv,
  geometryOf,
  type HpRawRow,
  measureCard,
  parseHpTsv,
  parseRanges,
  plateausOf,
  presentPositions,
  rangeMedian,
  ratioOf,
  runEdges,
  type Sample,
} from '../hp-bars-lib.ts';

type RGB = [number, number, number];
const DARK: RGB = [10, 12, 8];
const WHITE: RGB = [255, 254, 255];
const CYAN: RGB = [0, 173, 254];
const GREY: RGB = [77, 75, 73];
const SHIELD: RGB = [87, 191, 231];

/** 置き場所 1 のカードの画素。白は 671 から whitePx 画素（最後の画素は tail の明るさ）、その右は behind の色 */
function card1(whitePx: number, opts: { tail?: number; behind?: RGB; shield?: number } = {}) {
  const { tail, behind = DARK, shield = 0 } = opts;
  return (x: number, y: number): RGB => {
    if (y >= 1025 && y <= 1027) return x >= 672 && x <= 759 ? CYAN : DARK;
    if (y < 1030 || y > 1038) return DARK;
    const end = 671 + whitePx - 1;
    if (x >= 671 && x < end) return WHITE;
    if (x === end) {
      if (tail === undefined) return WHITE;
      const v = Math.round(behind[0] + (255 - behind[0]) * tail);
      return [v, v, v];
    }
    if (x > end && x <= end + shield) return SHIELD;
    if (x > end && x <= 759) return behind;
    return DARK;
  };
}

const raw = (p: Partial<CardRaw> = {}): CardRaw => ({
  whiteLeft: 671,
  whiteRight: 760,
  level: 254,
  shield: 0,
  cyanRight: 760,
  ...p,
});
const NONE = raw({ whiteLeft: NaN, whiteRight: NaN, level: NaN, shield: NaN, cyanRight: NaN });

describe('runEdges', () => {
  it('端の画素の満ち具合で按分する', () => {
    const v = [0, 0, 0.2, 1, 1, 1, 0.6, 0.1, 0];
    const r = runEdges((x) => v[x] ?? 0, 0, 5)!;
    // 左: 3 − 0.2（左隣のにじみ）、右: 7（6 の終わり）− 0.4（6 の欠け）+ 0.1（右隣のにじみ）
    expect(r.left).toBeCloseTo(2.8);
    expect(r.right).toBeCloseTo(6.7);
    expect(r.last).toBe(6);
  });

  it('探す範囲に始まりが無ければ undefined', () => {
    expect(runEdges(() => 0, 0, 5)).toBeUndefined();
  });

  it('右端だけ別の背景で按分できる', () => {
    const v = [1, 1, 1, 0.25];
    const r = runEdges(
      (x) => v[x] ?? 0,
      0,
      3,
      (x) => (x === 3 ? 0 : (v[x] ?? 0)),
    )!;
    expect(r.right).toBe(3);
  });
});

describe('measureCard', () => {
  it('満タンの白と水色は同じ右端', () => {
    const c = measureCard(card1(89), CARD_SLOTS[0]);
    expect(c.whiteLeft).toBeCloseTo(671);
    expect(c.whiteRight).toBeCloseTo(760);
    expect(c.cyanRight).toBeCloseTo(760);
    expect(c.shield).toBe(0);
  });

  it('白の右端の画素を明るさで按分する', () => {
    const c = measureCard(card1(60, { tail: 0.5 }), CARD_SLOTS[0]);
    expect(c.whiteRight).toBeCloseTo(730.5, 1);
  });

  it('減った所が灰色でも、右隣の灰色をにじみに数えない', () => {
    const c = measureCard(card1(51, { behind: GREY }), CARD_SLOTS[0]);
    expect(c.whiteRight).toBeCloseTo(722);
  });

  it('白の右に続くシールドの色の画素を数える', () => {
    const c = measureCard(card1(70, { shield: 8 }), CARD_SLOTS[0]);
    expect(c.shield).toBe(7);
  });

  it('カードの無い置き場所は NaN', () => {
    const c = measureCard(() => DARK, CARD_SLOTS[4]);
    expect(Number.isNaN(c.whiteRight)).toBe(true);
    expect(Number.isNaN(c.cyanRight)).toBe(true);
  });
});

describe('ratioOf', () => {
  const g = { position: 0, left: 671, full: 760 };

  it('（白の右端 − 左端）÷（満タンの右端 − 左端）', () => {
    expect(ratioOf(raw({ whiteRight: 760 }), g)).toEqual({ ratio: 100, unread: null });
    expect(ratioOf(raw({ whiteRight: 671 + 44.5 }), g).ratio).toBeCloseTo(50);
  });

  it('隠れた画・暗い画・シールドの画は読まない', () => {
    expect(ratioOf(NONE, g).unread).toBe('hidden');
    expect(ratioOf(raw({ whiteLeft: 675 }), g).unread).toBe('hidden');
    expect(ratioOf(raw({ cyanRight: 740 }), g).unread).toBe('hidden');
    expect(ratioOf(raw({ level: 225 }), g).unread).toBe('dim');
    expect(ratioOf(raw({ shield: 8 }), g).unread).toBe('shield');
  });
});

describe('置き場所と録画を通した端', () => {
  const rows: HpRawRow[] = [0, 1, 2, 3].map((frame) => ({
    frame,
    cards: [
      raw({ whiteLeft: 671 + frame * 0.1 }),
      NONE,
      raw({ cyanRight: frame === 0 ? NaN : 1013 }),
      raw({ cyanRight: 1145 }),
      NONE,
    ],
  }));

  it('水色のバーが半分より多くの画で読める置き場所', () => {
    expect(presentPositions(rows)).toEqual([0, 2, 3]);
  });

  it('左端と満タンの右端は読めた画の中央値', () => {
    const g = geometryOf(rows, 0);
    expect(g.left).toBeCloseTo(671.15);
    expect(g.full).toBe(760);
    expect(geometryOf(rows, 2).full).toBe(1013);
  });

  it('TSV を往復する', () => {
    const back = parseHpTsv(formatHpTsv(rows));
    expect(back).toHaveLength(4);
    expect(back[1]!.cards[0]).toEqual(raw({ whiteLeft: 671.1 }));
    expect(Number.isNaN(back[2]!.cards[1]!.whiteRight)).toBe(true);
  });
});

const series = (values: (number | null)[], step = 5): Sample[] =>
  values.map((v, i) => ({ frame: i * step, ratio: v ?? NaN, unread: v === null ? 'hidden' : null }));

describe('rangeMedian', () => {
  it('区間の中の読めた測りの中央値と、読まなかった数', () => {
    const s = series([80, 81, null, 82, 90]);
    const m = rangeMedian(s, { from: 0, to: 15 });
    expect(m.value).toBe(81);
    expect(m.used).toBe(3);
    expect(m.skipped).toEqual({ hidden: 1, dim: 0, shield: 0 });
    expect(Number.isNaN(rangeMedian(s, { from: 100, to: 200 }).value)).toBe(true);
  });

  it('区間の書き方', () => {
    expect(parseRanges('960-1600, 2640-3520')).toEqual([
      { from: 960, to: 1600 },
      { from: 2640, to: 3520 },
    ]);
    expect(() => parseRanges('960')).toThrow();
    expect(() => parseRanges('20-10')).toThrow();
  });
});

describe('changesOf', () => {
  it('閾値より大きく伸び、次の測りでも伸びたままの所', () => {
    const s = series([70, 70, 77.9, 77.9, 77.9, 79, 70.5, 70.5]);
    expect(changesOf(s, 1, 1)).toEqual([{ frame: 10, before: 70, after: 77.9 }]);
    expect(changesOf(s, 1, -1)).toEqual([{ frame: 30, before: 79, after: 70.5 }]);
  });

  it('次の測りで戻る 1 つだけの跳ねは数えない', () => {
    expect(changesOf(series([70, 70, 75, 70, 70]), 1, 1)).toEqual([]);
  });

  it('続く測りにまたがる伸びは 1 つにまとめる', () => {
    expect(changesOf(series([70, 70, 74, 78, 78]), 1, 1)).toEqual([{ frame: 10, before: 70, after: 78 }]);
  });

  it('読めない測りは飛ばしてつなぐ', () => {
    expect(changesOf(series([70, null, 78, 78]), 1, 1)).toEqual([{ frame: 10, before: 70, after: 78 }]);
  });
});

describe('plateausOf', () => {
  it('ほぼ一定の段のうち、長さが足りるもの', () => {
    const s = series([100, 100, 100, 100, 82, 82.2, 82, 50]);
    expect(plateausOf(s, 0.6, 10)).toEqual([
      { from: 0, to: 15, value: 100 },
      { from: 20, to: 30, value: 82 },
    ]);
  });
});
