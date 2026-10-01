import { describe, expect, it } from 'vitest';
import {
  calibrateExact,
  distribution,
  regimeOfExact,
  regimeOfUnits,
  solveExact,
  solveUnits,
  type ExactValues,
} from '../pellets.ts';

/** ノワール（スペック固定 ON）の 1 ペレットの胴体 27,964 → 単位は 2,796.4 */
const UNIT = 27964 / 10;

describe('solveUnits（スペック固定 ON）', () => {
  it('近: 13h + 5u から h と u が決まり、2 候補あるときは h の大きい方', () => {
    expect(solveUnits(130 * UNIT, UNIT, true, 10)).toMatchObject({ kind: 'near', h: 10, u: 0, alternatives: 1 });
    expect(solveUnits(122 * UNIT, UNIT, true, 10)).toMatchObject({ kind: 'near', h: 9, u: 1, alternatives: 0 });
    expect(solveUnits(145 * UNIT, UNIT, true, 10)).toMatchObject({ kind: 'near', h: 10, u: 3 });
    // 2 発の組は 20 ペレットまで
    expect(solveUnits(272 * UNIT, UNIT, true, 20)).toMatchObject({ kind: 'near', h: 19, u: 5 });
  });

  it('近以外: 5 の倍数なら far、そうでなければ none。単位に乗らなければ none', () => {
    expect(solveUnits(105 * UNIT, UNIT, false, 10)).toEqual({ kind: 'far', N: 105 });
    expect(solveUnits(104 * UNIT, UNIT, false, 10)).toEqual({ kind: 'none', N: 104 });
    expect(solveUnits(104.4 * UNIT, UNIT, true, 10).kind).toBe('none');
  });

  it('regime: 5 の倍数でなければ near（確か）、5 の倍数なら far', () => {
    expect(regimeOfUnits(122 * UNIT, UNIT, 10)).toBe('near');
    expect(regimeOfUnits(130 * UNIT, UNIT, 10)).toBe('far');
    expect(regimeOfUnits(100 * UNIT, UNIT, 10)).toBe('far');
  });
});

/** ノワール（スペック固定 OFF・キューブなし。109-02）: 胴体 117,573・会心 195,688・コア 235,144〜235,146 */
const B = 117573;
const FAR: ExactValues = { body: B, critAdd: 78115, coreAdd: 117571, slack: 2 };
const NEAR: ExactValues = { body: 152845, critAdd: 78115, coreAdd: 117571, slack: 2 };

describe('solveExact（スペック固定 OFF）', () => {
  it('胴体だけ・会心・コア（余り 1〜2）を分ける', () => {
    expect(solveExact(9 * B, FAR, 10)).toMatchObject({ kind: 'ok', h: 9, c: 0, k: 0 });
    expect(solveExact(10 * B + 78115, FAR, 10)).toMatchObject({ kind: 'ok', h: 10, c: 1, k: 0 });
    // 8 個 + コア 1 個（2B − 1）= 9B − 1。余りをコアに読む
    expect(solveExact(9 * B - 1, FAR, 10)).toMatchObject({ kind: 'ok', h: 8, c: 0, k: 1, residual: 1 });
    // 7 個 + 会心 1 + コア 1（2B − 2）
    expect(solveExact(7 * B + 195688 + 235144, FAR, 10)).toMatchObject({ kind: 'ok', h: 9, c: 1, k: 1, residual: 0 });
  });

  it('候補が複数なら h が最大（コアが少ない）のもの', () => {
    // 9B − 2: 8 個 + コア（2B − 2）か、7 個 + コア 2 個（余り 2）。前者
    expect(solveExact(9 * B - 2, FAR, 10)).toMatchObject({ h: 8, k: 1 });
  });

  it('近は胴体だけ ×1.3 で、会心・コアの上乗せは同じ', () => {
    expect(solveExact(7 * 152845 + 2 * 78115, NEAR, 10)).toMatchObject({ kind: 'ok', h: 7, c: 2, k: 0 });
    expect(solveExact(10 * 152845 + 78115 + 117572, NEAR, 10)).toMatchObject({ kind: 'ok', h: 10, c: 1, k: 1 });
  });

  it('regime: 近の 10 個は近以外の 7 個 + コア 3 個とも読めることがあるので unknown。近以外の発は far', () => {
    expect(regimeOfExact(9 * 152845, NEAR, FAR, 10)).toBe('near');
    expect(regimeOfExact(9 * B, NEAR, FAR, 10)).toBe('far');
    // キューブあり（110-02）: 胴体 117,812・近の胴体 153,155。近の 10 個 = 13B − 6 で、7 個 + コア 3 個（2B − 2）と同じ値
    const B2 = 117812;
    const far2: ExactValues = { body: B2, critAdd: 78273, coreAdd: B2 - 2, slack: 2 };
    const near2: ExactValues = { body: 153155, critAdd: 78274, coreAdd: B2 - 2, slack: 2 };
    expect(10 * 153155).toBe(13 * B2 - 6);
    expect(regimeOfExact(10 * 153155, near2, far2, 10)).toBe('unknown');
    expect(regimeOfExact(9 * 153155, near2, far2, 10)).toBe('near');
  });

  it('calibrateExact: 画面の会心の値と刻みが 1 違っても、厳密に合う発の多い上乗せを選ぶ', () => {
    const increments = [8 * B, 9 * B + 78274, 7 * B + 2 * 78274, 9 * B - 1, 10 * B].map((increment) => ({
      increment,
      maxPellets: 10,
    }));
    const values = calibrateExact(increments, [B], 78273, 117571, 2);
    expect(values.critAdd).toBe(78274);
    expect(values.fits).toBe(4);
    expect(values.slack).toBe(2);
  });
});

describe('distribution', () => {
  it('10・9・8・7 以下に数える', () => {
    expect(distribution([10, 10, 9, 8, 7, 6, 10])).toEqual([3, 1, 1, 2]);
  });
});
