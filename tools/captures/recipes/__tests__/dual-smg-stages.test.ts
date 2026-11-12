import { describe, expect, it } from 'vitest';
import {
  FORMS,
  assignShots,
  bandOfN,
  compareForms,
  fitStages,
  nKey,
  readStageIncrement,
  type HitModel,
  type ModelShot,
  type StageRow,
} from '../dual-smg-stages.ts';

/** 胴体 body・コア +1・会心 +0.5（距離ボーナスは +0.3）の 1 ヒット。parts は効果ごとの命中率▲ */
function hit(body: number, parts: number[], critRate = 0.15): HitModel {
  const cells = (d: number) => [0, 1, 2, 3].map((i) => body * (1 + 0.3 * d + (i >> 1) + 0.5 * (i & 1)));
  return { values: [cells(0), cells(1)], critRate, n: parts.reduce((a, b) => a + b, 0), parts };
}

describe('readStageIncrement', () => {
  const shot: ModelShot = { mag: 0, hits: [hit(10000, [0.1]), hit(11000, [0.2])] };

  it('1 ヒットだけ当たった発は、どちらのヒットかを値で分ける', () => {
    expect(readStageIncrement(13000, shot, [1], 2).map((c) => c.hits)).toEqual([[{ which: 0, core: 0, crit: 0 }]]);
    expect(readStageIncrement(14300, shot, [1], 2).map((c) => c.hits)).toEqual([[{ which: 1, core: 0, crit: 0 }]]);
  });

  it('2 ヒットの和は、1 ヒット目と 2 ヒット目の格子の組で読む', () => {
    // 1 ヒット目コア（23000）+ 2 ヒット目胴体（14300）
    const cs = readStageIncrement(37300, shot, [1], 2);
    expect(cs.map((c) => c.hits)).toContainEqual([
      { which: 0, core: 1, crit: 0 },
      { which: 1, core: 0, crit: 0 },
    ]);
  });

  it('格子に乗らない増分は候補が無い', () => {
    expect(readStageIncrement(12345, shot, [0, 1], 2)).toEqual([]);
  });
});

describe('bandOfN', () => {
  it('帯の上端は帯に入り、最後の上端より上は最後の帯', () => {
    const upper = [0.136, 0.272];
    expect([0, 0.136, 0.1631, 0.272, 0.3].map((n) => bandOfN(n, upper))).toEqual([0, 0, 1, 1, 2]);
  });
});

/** 2 発ごとに段が 1 つ上がるモデル（1 つ目のマガジン 20 発、2 つ目 20 発）。段 s の胴体は 10000 + 1000s、N は 0.05s */
function stagedModel(): ModelShot[] {
  const hm = (s: number) => hit(10000 + 1000 * s, [0.05 * Math.min(s, 6), 0.05 * Math.max(0, s - 6)]);
  const shots: ModelShot[] = [];
  for (const mag of [0, 1]) {
    for (let i = 0; i < 20; i++) {
      const s = Math.min(9, Math.floor(i / 2));
      const next = i + 1 < 20 ? Math.min(9, Math.floor((i + 1) / 2)) : s;
      shots.push({ mag, hits: [hm(s), hm(next)] });
    }
  }
  return shots;
}

describe('assignShots', () => {
  const model = stagedModel();
  const opts = { cuts: [100000], interval: 2.5, tol: 2, carry: 15, reload: 100, ahead: 3, resync: 8 };
  const twoBody = (s: number, t: number) => (10000 + 1000 * s + 10000 + 1000 * t) * 1.3;

  it('2 ヒットとも外れた発を値で飛ばし、リロードの後のマガジンを 2 つ目に当てる', () => {
    const rows = [];
    // 1 つ目のマガジン: 3 発目（i = 2）が 2 ヒットとも外れ
    for (let i = 0; i < 20; i++) {
      if (i === 2) continue;
      const s = Math.floor(i / 2);
      rows.push({ frame: 100 + i * 2.5, increment: twoBody(s, Math.min(9, Math.floor((i + 1) / 2))), readGap: 1 });
    }
    // 2 つ目: 83f の空きの後
    const start2 = 100 + 19 * 2.5 + 83;
    for (let i = 0; i < 4; i++)
      rows.push({
        frame: start2 + i * 2.5,
        increment: twoBody(Math.floor(i / 2), Math.floor((i + 1) / 2)),
        readGap: 1,
      });
    const { rows: read, stats } = assignShots(rows, model, [0, 20], opts);
    expect(stats).toMatchObject({ used: 2, unfitFrames: [] });
    expect(read.map((r) => r.shot)).toEqual([0, 1, ...Array.from({ length: 17 }, (_, k) => k + 3), 20, 21, 22, 23]);
  });

  it('前のマガジンが短いか、ジャンプ（reload を超える空き）の後のマガジンは使わない', () => {
    const rows = [
      { frame: 100, increment: twoBody(0, 0), readGap: 1 },
      { frame: 300, increment: twoBody(0, 0), readGap: 1 },
    ];
    expect(assignShots(rows, model, [0, 20], opts).stats).toMatchObject({ magazines: 2, used: 1 });
  });
});

describe('fitStages・compareForms', () => {
  it('積の形で作ったヒットから、積の最尤の p0 が真の値に寄り、和より対数尤度が高い', () => {
    // 疑似乱数（再現のため mulberry32）
    let seed = 7;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const model = stagedModel();
    const p0 = 0.25;
    const rows: StageRow[] = [];
    for (let rep = 0; rep < 150; rep++) {
      for (let s = 0; s < model.length; s++) {
        const hits = model[s]!.hits.map((h, which) => {
          const core = rand() < FORMS.product.f(p0, h) ? 1 : 0;
          const crit = rand() < h.critRate ? 1 : 0;
          return { which: which as 0 | 1, core: core as 0 | 1, crit: crit as 0 | 1 };
        });
        rows.push({ segment: 1, shot: s, candidates: [{ hits }] });
      }
    }
    const upper = [0.1, 0.3];
    const { fit, groups } = fitStages(rows, model, upper, 50);
    const hitsByKey = new Map<string, HitModel>();
    for (const s of model) for (const h of s.hits) hitsByKey.set(nKey(h.n), h);
    const keys = [...hitsByKey.keys()].sort();
    const keysByBand = [0, 1, 2].map((b) => keys.filter((k) => bandOfN(Number(k), upper) === b));
    const forms = compareForms(groups, fit, 1, hitsByKey, keysByBand, p0);
    const product = forms.find((f) => f.form === 'product')!;
    const sum = forms.find((f) => f.form === 'sum')!;
    expect(Math.abs(product.p0 - p0)).toBeLessThan(2.5 * product.sigma);
    expect(product.given!.dll).toBeGreaterThan(sum.given!.dll);
  });
});
