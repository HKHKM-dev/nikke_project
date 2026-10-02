import { describe, expect, it } from 'vitest';
import {
  findJumpBoundaries,
  gapBefore,
  groupIncrements,
  parseHudJumpsTsv,
  shotIntervalOf,
  splitIntervals,
  summarizeGaps,
  windowRegime,
  type HudRow,
  type Regime,
  type TriggerGroup,
} from '../triggers.ts';

describe('parseHudJumpsTsv・groupIncrements', () => {
  it('hud.ts の TSV を読み、30f 未満の増分を同じ組にまとめ、跨ぐ長さから発の数を決める', () => {
    const text =
      'frame\tvalue\tincrement\tgap\n100\t10\t10\t1\n140\t25\t15\t1\n143\t27\t2\t1\n180\t40\t13\t1\n200\t52\t12\t1\n260\t60\t8\t1\n';
    const rows = parseHudJumpsTsv(text);
    expect(rows).toHaveLength(6);
    const groups = groupIncrements(rows, 40);
    // 140 と 143 は 1 発（3f）、180 と 200 は跨ぐ 20f ≈ 0.5 発 → 2 発
    expect(groups.map((g) => [g.frame, g.increment, g.shots])).toEqual([
      [100, 10, 1],
      [140, 17, 1],
      [180, 25, 2],
      [260, 8, 1],
    ]);
    // 2 発の組の次の空きは、組の最初の発から 2 発ぶんを引く
    expect(gapBefore(groups, 3, 40)).toBe(260 - 180 - 40);
  });

  it('読めなかった後の読みは、読めなかった間の真ん中から組の跨ぐ長さを測る（V-0079 の L-S f1416）', () => {
    // f1347 の発の後、HUD が 30f 読めず f1416 で読んだ発（本当は f1386）と、f1426 の発
    const text = 'frame\tvalue\tincrement\tgap\n1347\t10\t10\t1\n1416\t25\t15\t30\n1426\t40\t15\t1\n';
    const groups = groupIncrements(parseHudJumpsTsv(text), 39);
    expect(groups.map((g) => [g.frame, g.increment, g.shots])).toEqual([
      [1347, 10, 1],
      [1416, 30, 2],
    ]);
    // 読み 1 つの組は、読めなかった間が長くても 1 発
    const single = groupIncrements(parseHudJumpsTsv('frame\tvalue\tincrement\tgap\n100\t5\t5\t40\n'), 39);
    expect(single[0]!.shots).toBe(1);
  });

  it('発の間は 30〜60f の空きの中央値', () => {
    expect(shotIntervalOf([0, 39, 79, 118, 158, 300, 340])).toBe(40);
    expect(shotIntervalOf([0, 3])).toBe(40);
  });
});

/** 発の列を作る。pattern は [発の数, その前の空き] の並び（最初の空きは無視） */
function sequence(parts: readonly { shots: number; gapBefore: number; regime: Regime; increment?: number }[]): {
  groups: TriggerGroup[];
  regimeOf: (g: TriggerGroup) => Regime;
} {
  const groups: TriggerGroup[] = [];
  const regimes = new Map<number, Regime>();
  let frame = 800;
  for (const part of parts) {
    frame += part.gapBefore;
    for (let i = 0; i < part.shots; i++) {
      groups.push({ frame, last: frame, increment: part.increment ?? 100, shots: 1, rows: 1 });
      regimes.set(frame, part.regime);
      frame += 40;
    }
    frame -= 40;
  }
  return { groups, regimeOf: (g) => regimes.get(g.frame) ?? 'unknown' };
}

/** 9 発ごとにリロード（reload f）を挟んだ n 発 */
function magazines(n: number, reload: number, regime: Regime, first: number) {
  const parts: { shots: number; gapBefore: number; regime: Regime }[] = [];
  let left = n;
  let gap = first;
  while (left > 0) {
    parts.push({ shots: Math.min(9, left), gapBefore: gap, regime });
    left -= 9;
    gap = reload;
  }
  return parts;
}

describe('summarizeGaps・findJumpBoundaries', () => {
  it('ノワール: リロード 80f・ジャンプ 130〜150f で 5 つの切れ目を見つける', () => {
    const { groups, regimeOf } = sequence([
      ...magazines(45, 80, 'far', 0),
      ...magazines(43, 80, 'unknown', 140), // 近 B（h が 10 の発は far に見える）
      ...magazines(50, 80, 'far', 150),
      ...magazines(47, 80, 'far', 139),
      ...magazines(44, 80, 'near', 151),
      ...magazines(2, 80, 'far', 134),
    ]);
    // 近 B の区間にも、確かな near を 2 つ以上置く
    const near2 = groups.slice(45, 88);
    const regimes = new Map(groups.map((g) => [g.frame, regimeOf(g)]));
    for (const g of [near2[0]!, near2[5]!, near2[12]!, near2[30]!, near2[42]!]) regimes.set(g.frame, 'near');
    const summary = summarizeGaps(groups, 40);
    expect(summary.magazine).toBe(9);
    expect(summary.reloadGap).toBe(80);
    const found = findJumpBoundaries(groups, (g) => regimes.get(g.frame)!, undefined);
    expect(found.errors).toEqual([]);
    expect(found.boundaries.map((b) => b.gap)).toEqual([140, 150, 139, 151, 134]);
    const intervals = splitIntervals(groups, found.boundaries);
    expect(intervals.map((iv) => [iv.label, iv.triggers, iv.short])).toEqual([
      ['中近', 45, false],
      ['近', 43, false],
      ['遠', 50, false],
      ['中遠', 47, false],
      ['近', 44, false],
      ['遠', 2, true],
    ]);
    expect(intervals[1]!.nth).toBe(1);
    expect(intervals[4]!.nth).toBe(2);
  });

  it('プロダクト23: リロード 183f がジャンプより長く、5 番目の切れ目がリロードと重なる', () => {
    const { groups, regimeOf } = sequence([
      ...magazines(32, 183, 'far', 0),
      // ジャンプの明けの最初のマガジンは途中から（7 発）
      { shots: 7, gapBefore: 162, regime: 'near' },
      ...magazines(30, 183, 'near', 181),
      { shots: 3, gapBefore: 144, regime: 'far' },
      ...magazines(39, 183, 'far', 183),
      { shots: 6, gapBefore: 151, regime: 'far' },
      ...magazines(31, 183, 'far', 183),
      { shots: 4, gapBefore: 144, regime: 'near' },
      ...magazines(31, 183, 'near', 183),
      // 5 番目: マガジンを撃ち切った後の 185f（リロードと同じ長さ）。後ろは遠の 6 発
      { shots: 6, gapBefore: 185, regime: 'far' },
    ]);
    const found = findJumpBoundaries(groups, regimeOf, undefined);
    expect(found.errors).toEqual([]);
    expect(found.boundaries.map((b) => [b.gap, b.how])).toEqual([
      [162, 'gap'],
      [144, 'gap'],
      [151, 'gap'],
      [144, 'gap'],
      [185, 'regime'],
    ]);
  });

  it('近の区間の中の長いリロード（+16f）は、前後の刻みが変わらないので切れ目にしない', () => {
    const { groups, regimeOf } = sequence([
      ...magazines(40, 112, 'far', 0),
      { shots: 9, gapBefore: 159, regime: 'near' },
      { shots: 9, gapBefore: 128, regime: 'near' }, // ジャンプの明けの最初のリロードは長い
      ...magazines(27, 112, 'near', 112),
      ...magazines(47, 112, 'far', 162),
      ...magazines(45, 112, 'far', 152),
      ...magazines(39, 112, 'near', 136),
    ]);
    const found = findJumpBoundaries(groups, regimeOf, undefined);
    expect(found.errors).toEqual([]);
    expect(found.boundaries.map((b) => b.gap)).toEqual([159, 162, 152, 136]);
    expect(found.notes.some((n) => n.includes('128f'))).toBe(true);
  });

  it('cuts を与えればそのまま使い、無い発は誤りにする', () => {
    const { groups, regimeOf } = sequence([...magazines(18, 80, 'far', 0), ...magazines(9, 80, 'near', 140)]);
    const cut = groups[18]!.frame;
    const found = findJumpBoundaries(groups, regimeOf, [cut, cut + 1]);
    expect(found.boundaries.map((b) => [b.index, b.how])).toEqual([[18, 'given']]);
    expect(found.errors).toEqual([`cuts の f${cut + 1} に発が無い`]);
  });

  it('候補が 4 つに満たなければ誤りにする', () => {
    const { groups, regimeOf } = sequence([...magazines(18, 80, 'far', 0), ...magazines(9, 80, 'near', 140)]);
    const found = findJumpBoundaries(groups, regimeOf, undefined);
    expect(found.errors[0]).toContain('切れ目の候補が 1 個');
  });
});

describe('windowRegime', () => {
  it('確かな near が 2 つ以上なら near、分かる発が 4 つ以上で全部 far なら far', () => {
    expect(windowRegime(['far', 'unknown', 'near', 'far', 'near'])).toBe('near');
    expect(windowRegime(['far', 'far', 'far', 'far', 'unknown'])).toBe('far');
    expect(windowRegime(['far', 'far', 'far'])).toBe('unknown');
    expect(windowRegime(['far', 'far', 'far', 'far', 'near'])).toBe('unknown');
  });
});

describe('HudRow の型', () => {
  it('増分の列を持つ', () => {
    const row: HudRow = { frame: 1, value: 2, increment: 2 };
    expect(row.increment).toBe(2);
  });
});
