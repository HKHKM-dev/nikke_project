import { describe, expect, it } from 'vitest';
import { classOf, formatPanelTsv, panelEvents, parsePanelTsv, type PanelRow } from '../burst-panel-lib.ts';

// 試作で録画から測った特徴の値（plan/design-burst-panel-recipe.md 1 節）
const GREEN = { r: 66, g: 174, b: 72 };
const DARK_GREEN = { r: 60, g: 149, b: 64 };
const ORANGE = { r: 248, g: 196, b: 64 };
const RED = { r: 218, g: 114, b: 92 };
const FLASH = { r: 254, g: 252, b: 227 };
const NONE = { r: 98, g: 75, b: 31 };
const FB_OVERLAY = { r: 174, g: 145, b: 110 };

type Color = { r: number; g: number; b: number };
type Patch = Partial<Omit<PanelRow, 'frame'>>;

/** [色, フレーム数, ほかの特徴] の並びから、frame が 0 からの行を作る */
function rows(...runs: [Color, number, Patch?][]): PanelRow[] {
  const out: PanelRow[] = [];
  for (const [color, n, patch] of runs)
    for (let i = 0; i < n; i++) out.push({ frame: out.length, magenta: 0, white: 0, dim: 80, ...color, ...patch });
  return out;
}

describe('classOf', () => {
  it('六角形の色を色相で I・II・III に分け、白い光り・暗い背景・フルバーストの紫を分ける', () => {
    const at = (c: Color, patch: Patch = {}) => classOf({ frame: 0, magenta: 0, white: 0, dim: 0, ...c, ...patch });
    expect(at(GREEN)).toBe('1');
    expect(at(DARK_GREEN)).toBe('1');
    expect(at(ORANGE)).toBe('2');
    expect(at({ r: 253, g: 242, b: 109 })).toBe('2');
    expect(at(RED)).toBe('3');
    expect(at({ r: 245, g: 154, b: 130 })).toBe('3');
    expect(at(FLASH)).toBe('-');
    expect(at(NONE)).toBe('-');
    expect(at(FB_OVERLAY)).toBe('-');
    expect(at(FB_OVERLAY, { magenta: 485 })).toBe('F');
  });
});

describe('panelEvents の替わり目', () => {
  it('前の段の色の最後のフレームの次を替わり目にし、新しい色が白い光りの後に出ても同じ', () => {
    // I が f0〜9、f10〜34 は白い光り（II の色はまだ出ない）、f35 から II
    const ev = panelEvents(rows([GREEN, 10], [FLASH, 25], [ORANGE, 10]));
    expect(ev.oneToTwo).toEqual([{ frame: 10, firstColor: 35 }]);
  });

  it('白い光りが 40f を超えたら替わり目にしない', () => {
    expect(panelEvents(rows([GREEN, 10], [FLASH, 41], [ORANGE, 10])).oneToTwo).toEqual([]);
  });

  it('前後と違う 1 フレームだけの色は読まない', () => {
    const ev = panelEvents(rows([GREEN, 10], [ORANGE, 1], [GREEN, 5], [ORANGE, 5]));
    expect(ev.oneToTwo.map((c) => c.frame)).toEqual([16]);
  });

  it('00.00 は II → III の後、III の次に初めて紫が出たフレーム。フルバースト中の紫の途切れと背景の色は数えない', () => {
    const ev = panelEvents(
      rows(
        [GREEN, 5],
        [ORANGE, 29],
        [RED, 29],
        [FB_OVERLAY, 3, { magenta: 485 }],
        [FB_OVERLAY, 22],
        [FB_OVERLAY, 20, { magenta: 600 }],
        [RED, 3],
        [FB_OVERLAY, 10, { magenta: 600 }],
      ),
    );
    expect(ev.twoToThree.map((c) => c.frame)).toEqual([34]);
    expect(ev.fullBurst).toEqual([63]);
  });

  it('各段ではその段と次の段の色と I の緑だけを読む（画面が赤みがかった回の、I → II の白い光りの終わりの赤み）', () => {
    // 録画 0735 の 3 回目のチェーン（f6118〜）の六角形の色。白い光りが II の色に戻る途中の 2 フレームが III の色相になる
    const ev = panelEvents(
      rows(
        [GREEN, 10],
        [FLASH, 10],
        [{ r: 213, g: 166, b: 146 }, 2],
        [{ r: 226, g: 176, b: 149 }, 1],
        [{ r: 238, g: 185, b: 152 }, 1],
        [{ r: 250, g: 215, b: 158 }, 5],
        [{ r: 247, g: 160, b: 54 }, 5],
        [FLASH, 24],
        [{ r: 238, g: 114, b: 96 }, 4],
        [FB_OVERLAY, 3, { magenta: 495 }],
      ),
    );
    expect(classOf({ frame: 0, magenta: 0, white: 0, dim: 0, r: 238, g: 185, b: 152 })).toBe('3');
    expect(ev.oneToTwo).toEqual([{ frame: 10, firstColor: 24 }]);
    expect(ev.twoToThree).toEqual([{ frame: 34, firstColor: 58 }]);
    expect(ev.fullBurst).toEqual([62]);
  });
});

describe('panelEvents の CT の明け', () => {
  it('秒の字のある暗い顔が明るくなったフレームを、その段の CT の明けにする（替わり目からは次の段）', () => {
    const ev = panelEvents(
      rows(
        [GREEN, 5],
        [ORANGE, 10],
        // II の色の後の白い光りの中（III の段）で III の顔の CT が明ける
        [FLASH, 4, { white: 800, dim: 62 }],
        [FLASH, 4, { white: 1900, dim: 93 }],
        [RED, 6],
        [FB_OVERLAY, 5, { magenta: 480 }],
      ),
    );
    expect(ev.twoToThree.map((c) => c.frame)).toEqual([15]);
    expect(ev.ctEnd).toEqual([[], [], [19]]);
  });

  it('暗い顔（明るさの上がりが小さい）でも比が 1.25 倍以上なら数え、秒の字の無い明るさの上がりは数えない', () => {
    const ev = panelEvents(
      rows(
        [GREEN, 5, { white: 770, dim: 23.4 }],
        [GREEN, 5, { white: 35, dim: 36.8 }],
        [GREEN, 5, { white: 0, dim: 20 }],
        [GREEN, 5, { white: 0, dim: 60 }],
      ),
    );
    // 表示の事象（I → II）が無いので、事象の前にない候補に入る
    expect(ev.ctEnd).toEqual([[], [], []]);
    expect(ev.ctEndOther).toEqual([[5], [], []]);
  });

  it('値は段の表示の事象の 15f 前までの候補だけ。それより前の候補はほかの候補に入れる', () => {
    const digits = { white: 800, dim: 50 };
    const ev = panelEvents(
      rows(
        [GREEN, 5, digits],
        [GREEN, 16, { dim: 80 }],
        [ORANGE, 5],
        [GREEN, 5, digits],
        [GREEN, 15, { dim: 80 }],
        [ORANGE, 5],
      ),
    );
    expect(ev.oneToTwo.map((c) => c.frame)).toEqual([21, 46]);
    expect(ev.ctEnd[0]).toEqual([31]);
    expect(ev.ctEndOther[0]).toEqual([5]);
  });

  it('段の外（I の緑の前）の上がりは捨てる', () => {
    const ev = panelEvents(rows([NONE, 5, { white: 480, dim: 35 }], [NONE, 5, { white: 0, dim: 80 }]));
    expect(ev.ctEnd).toEqual([[], [], []]);
    expect(ev.ctEndOutside).toEqual([5]);
  });

  it('偽の上がり: 2 フレーム続く・顔が暗くなったばかり・替わり目の前後・六角形の分類の切り替わりは数えない', () => {
    const digits = { white: 800, dim: 50 };
    // 2 フレーム続けて上がる（段の待ちが切れて顔が滑り出す）
    expect(
      panelEvents(rows([GREEN, 5, digits], [GREEN, 1, { white: 700, dim: 70 }], [GREEN, 5, { dim: 100 }])).ctEnd[0],
    ).toEqual([]);
    // 前のフレームで顔が暗くなったばかり（次の段の顔が滑り込む）
    expect(
      panelEvents(rows([GREEN, 5, { white: 800, dim: 120 }], [GREEN, 1, digits], [GREEN, 5, { dim: 80 }])).ctEnd[0],
    ).toEqual([]);
    // 六角形の分類が前のフレームで切り替わった（I の緑の後の白い光り）
    expect(
      panelEvents(rows([GREEN, 5, digits], [FLASH, 1, digits], [FLASH, 5, { dim: 80 }], [GREEN, 5])).ctEnd[0],
    ).toEqual([]);
    // 替わり目の 2f 前
    const ev = panelEvents(rows([GREEN, 8, digits], [GREEN, 2, { dim: 80 }], [ORANGE, 5, { dim: 80 }]));
    expect(ev.oneToTwo.map((c) => c.frame)).toEqual([10]);
    expect(ev.ctEnd[0]).toEqual([]);
  });
});

describe('burst-panel の TSV', () => {
  it('書いて読むと同じ行になる', () => {
    const r = rows([GREEN, 2, { white: 12, dim: 62.5 }], [ORANGE, 1, { magenta: 3 }]);
    expect(parsePanelTsv(formatPanelTsv(r))).toEqual(r);
  });
});

describe('panelEvents のフルバーストの終わり（2 段目の段 21）', () => {
  // 録画 0542 の 5 回目の窓の終わりの前後の六角形の所の色（f11379 → f11380）
  const FB_BACK = { r: 154, g: 123, b: 107 };
  const GREY = { r: 169, g: 158, b: 151 };
  const chain = (): [Color, number, Patch?][] => [
    [GREEN, 5],
    [ORANGE, 29],
    [RED, 29],
  ];

  it('00.00 の 300f 後から、橙から灰色に替わったフレームを終わりにする（バーの紫が尽きた後でも、紫の切れ目は使わない）', () => {
    const ev = panelEvents(
      rows(...chain(), [FB_BACK, 400, { magenta: 300 }], [FB_BACK, 209], [GREY, 20], ...chain(), [
        FB_BACK,
        10,
        { magenta: 600 },
      ]),
    );
    expect(ev.fullBurst).toEqual([63, 755]);
    expect(ev.fullBurstEnd).toEqual([672, null]);
  });

  it('00.00 の 300f 前までの色の上がりは終わりにしない', () => {
    const ev = panelEvents(rows(...chain(), [FB_BACK, 100, { magenta: 300 }], [GREY, 5], [FB_BACK, 400], [GREY, 5]));
    expect(ev.fullBurstEnd).toEqual([568]);
  });
});
