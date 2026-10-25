import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { candidates, detectEntries, detectJumps, tallyFbWindows, type FbGrid } from '../fb-window-cores.ts';
import type { HudRow } from '../triggers.ts';

// 鈴原サクラ（スペック固定 ON）。A はドレイク S1 の攻撃力▲を窓の中の格子に入れる（V-0424「読み方」）
const sakura: FbGrid = { body: 7047.8991, core: 1, crit: 0.5, distance: 0.3, fullBurst: 0.5, up: [1.1718], atk: [] };
const drake: FbGrid = { ...sakura, atk: [1.11865] };
const v = (g: FbGrid, k: { core?: number; crit?: number; dist?: number; fb?: boolean; up?: boolean; atk?: boolean }) =>
  Math.round(
    g.body *
      (1 + (k.core ?? 0) + 0.5 * (k.crit ?? 0) + 0.3 * (k.dist ?? 0) + (k.fb ? 0.5 : 0)) *
      (k.up ? 1.1718 : 1) *
      (k.atk ? 1.11865 : 1),
  );
const row = (frame: number, increment: number, readGap = 1): HudRow => ({ frame, value: 0, increment, readGap });

describe('candidates', () => {
  it('同じ増分でも、窓の中（補正 0.5 あり）と外でコアの有無が変わる（補正の有無は時刻で決める）', () => {
    // 2 倍: 窓の中では会心 + 補正（コアでない）、窓の外ではコア
    const inc = v(sakura, { core: 1 });
    expect(candidates(inc, sakura, true, false, 3).map((c) => c.core)).toEqual([0]);
    expect(candidates(inc, sakura, false, false, 3).map((c) => c.core)).toEqual([1]);
  });

  it('攻撃力▲の段は、withAtk のときだけ入る', () => {
    const inc = v(drake, { core: 1, fb: true, atk: true });
    expect(candidates(inc, drake, true, false, 3)).toEqual([]);
    expect(candidates(inc, drake, true, true, 3)).toEqual([{ core: 1, dist: 0, atk: true }]);
  });
});

describe('detectEntries（録画 0434 の 1 回目のフルバーストの前後）', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/fb-window-0434.json', import.meta.url), 'utf8')) as {
    rows: [number, number, number, number][];
  };
  const rows = fixture.rows.map(([frame, value, increment, readGap]) => ({ frame, value, increment, readGap }));

  it('リロードの途切れ（83f）は入りにせず、止まりの後の最初の増分を入りにする（0434-01 の E f1747・P f1719）', () => {
    expect(detectEntries(rows, drake, 100000, 3)).toEqual([{ e: 1747, p: 1719 }]);
  });

  it('窓の中と外を数える（V-0424 の読みと同じ数）', () => {
    const entries = detectEntries(rows, drake, 100000, 3);
    // 2 つ目から 6 つ目の帯に 1 ヒットずつ足して、帯を 6 つにする
    const extra = [3000, 4000, 5000, 6000, 7000].map((f) => row(f, v(drake, { dist: 1 })));
    const t = tallyFbWindows(
      [...rows, ...extra],
      drake,
      entries,
      [2500, 3500, 4500, 5500, 6500],
      ['B', 'A'],
      100000,
      3,
    );
    expect(t.windowBands).toEqual([0]);
    expect(t.counts['中近']).toEqual({ inCores: 37, inHits: 162, outCores: 8, outHits: 67 });
    expect(t.atkInWindow[0]).toBe(0);
    expect(t.unfit + t.ambiguous).toBe(0);
  });
});

describe('detectJumps', () => {
  it('ヒットの 115f 以上の途切れのうち、フルバーストの止まりを含むものは除く', () => {
    const rows = [row(100, 1), row(183, 1), row(400, 1), row(500, 1), row(650, 1)];
    // 183 → 400 はジャンプ、500 → 650 はフルバーストの止まり（P 500・E 650）
    expect(detectJumps(rows, [{ e: 650, p: 500 }], 100000)).toEqual([292]);
  });
});

describe('tallyFbWindows', () => {
  const near = ['A', 'B'] as const;
  const jumps = [1000, 2000, 3000, 4000, 5000];

  it('窓の中でジャンプをまたいだ先は数えず、帯を着地点に分ける', () => {
    const rows = [
      row(100, v(sakura, { dist: 1 })),
      // 2 つ目の帯（近 A）: 入り E f1500（P f1440）。窓の中の 1 ヒット（コア）
      row(1200, v(sakura, { dist: 1 })),
      row(1440, v(sakura, { dist: 1 })),
      row(1500, v(sakura, { dist: 1, fb: true })),
      row(1600, v(sakura, { core: 1, dist: 1, fb: true })),
      // 窓（f1500〜2088）の中で 3 つ目の帯に入った先は数えない
      row(2050, v(sakura, { fb: true })),
      row(2200, v(sakura, {})),
      row(3200, v(sakura, { dist: 1 })),
      row(4200, v(sakura, { core: 1, dist: 1 })),
      row(5200, v(sakura, {})),
    ];
    const t = tallyFbWindows(rows, sakura, [{ e: 1500, p: 1440 }], jumps, near, 100000, 3);
    expect(t.counts['近A']).toEqual({ inCores: 1, inHits: 1, outCores: 0, outHits: 1 });
    expect(t.counts['遠']).toEqual({ inCores: 0, inHits: 0, outCores: 0, outHits: 2 });
    expect(t.counts['中遠A']).toEqual({ inCores: 0, inHits: 0, outCores: 0, outHits: 1 });
    expect(t.counts['近B']).toEqual({ inCores: 0, inHits: 0, outCores: 1, outHits: 1 });
    expect(t.counts['中近']).toEqual({ inCores: 0, inHits: 0, outCores: 0, outHits: 1 });
    expect(t.excluded).toBe(3);
  });

  it('戦闘の中のジャンプが 4 回なら、帯は 5 つ（5 つ目の帯の近まで）', () => {
    const rows = [100, 1200, 2200, 3200, 4200].map((f) => row(f, v(sakura, { dist: 1 })));
    const t = tallyFbWindows(rows, sakura, [], [1000, 2000, 3000, 4000], near, 100000, 3);
    expect(t.bands).toHaveLength(5);
    expect(t.counts['近B'].outHits).toBe(1);
    expect(t.counts['遠'].outHits).toBe(1);
  });
});
