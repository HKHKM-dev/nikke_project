// 確率のきっかけの dot の期待値の tick（plan/design-chance-dot-damage.md 3.1 節。frame/dot.ts の chanceDotTicks）。
// 確率 1 なら確率の無い dot（dotTicks）と同じ tick を重み 1 で出すこと（退化）と、付き方を振って dotTicks を回した平均（モンテカルロ）と
// フレームごとに合うこと
import { describe, expect, it } from 'vitest';
import { chanceDotTicks, dotTicks, type ChanceDotFire, type ChanceDotTick } from '../dot.ts';
import type { DotFirstTick } from '../../skills/types.ts';

const FRAMES = 3000;

/** 再現できる乱数（mulberry32） */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** フレーム → 重みの和 */
function byFrame(ticks: readonly { frame: number; weight: number }[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of ticks) out.set(t.frame, (out.get(t.frame) ?? 0) + t.weight);
  return out;
}

/** 発の間隔がまちまちな機会の列（SR のように 1 維持に 2〜4 発） */
function firesOf(seed: number, q: (i: number) => number): ChanceDotFire[] {
  const r = rng(seed);
  const out: ChanceDotFire[] = [];
  for (let f = 5, i = 0; f < FRAMES; f += 40 + Math.floor(r() * 120), i++) out.push({ frame: f, q: q(i) });
  return out;
}

describe('chanceDotTicks', () => {
  for (const firstTick of ['atApplication', 'afterInterval'] as DotFirstTick[]) {
    it(`gives the ticks of dotTicks with weight 1 when every chance is 1 (${firstTick})`, () => {
      const fires = firesOf(1, () => 1);
      const expected = dotTicks(
        fires.map((x) => x.frame),
        1,
        5,
        FRAMES,
        firstTick,
      ).map((t) => t.frame);
      const ticks = chanceDotTicks(fires, 1, 5, FRAMES, firstTick);
      expect(ticks.map((t) => t.frame)).toEqual(expected);
      expect(ticks.every((t) => t.weight === 1)).toBe(true);
    });

    it(`matches the Monte Carlo mean of dotTicks per frame (${firstTick})`, () => {
      const fires = firesOf(2, (i) => [0.25, 0.6, 0.1][i % 3]!);
      const model = byFrame(chanceDotTicks(fires, 1, 5, FRAMES, firstTick));
      const r = rng(3);
      const trials = 20_000;
      const counts = new Map<number, number>();
      let total = 0;
      for (let n = 0; n < trials; n++) {
        const applied = fires.filter((x) => r() < x.q).map((x) => x.frame);
        for (const t of dotTicks(applied, 1, 5, FRAMES, firstTick)) {
          counts.set(t.frame, (counts.get(t.frame) ?? 0) + 1);
          total += 1;
        }
      }
      const modelTotal = [...model.values()].reduce((a, b) => a + b, 0);
      // 合計の tick の数（1 回あたり数十）の平均は、モンテカルロの標準誤差（1 回の合計の揺れ ÷ √trials）の数倍の中
      expect(Math.abs(modelTotal - total / trials)).toBeLessThan(0.15);
      // フレームごとの確率は、二項の標準誤差の 5 倍の中
      for (const frame of new Set([...model.keys(), ...counts.keys()])) {
        const p = model.get(frame) ?? 0;
        const observed = (counts.get(frame) ?? 0) / trials;
        const se = Math.sqrt(Math.max(p * (1 - p), 1e-4) / trials);
        expect(Math.abs(observed - p)).toBeLessThan(5 * se);
      }
    });
  }

  it('drops fires at or after the end of the battle and ticks at or after it', () => {
    const ticks: ChanceDotTick[] = chanceDotTicks(
      [
        { frame: 100, q: 0.5 },
        { frame: FRAMES, q: 1 },
      ],
      1,
      5,
      FRAMES,
    );
    expect(ticks.every((t) => t.frame < FRAMES)).toBe(true);
    expect(ticks.every((t) => t.weight === 0.5)).toBe(true);
  });

  it('rejects halfAfterLatest', () => {
    expect(() => chanceDotTicks([{ frame: 0, q: 0.5 }], 1, 5, FRAMES, 'halfAfterLatest')).toThrow(/halfAfterLatest/);
  });
});
