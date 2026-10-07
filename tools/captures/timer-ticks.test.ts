import { describe, expect, it } from 'vitest';
import { gameTicksAt, TICKS_PER_SECOND, timerOffsets, timerSteps } from './timer-ticks.ts';

/** 戦闘開始 start から、stalls（[経過秒, 止まりのフレーム数]）の止まりを入れた秒の変わり目（整数フレーム。最初に達したフレーム） */
function changes(start: number, seconds: number, stalls: [number, number][] = []): number[] {
  const out: number[] = [];
  for (let k = 1; k <= seconds; k++) {
    const stalled = stalls.filter(([s]) => s <= k).reduce((a, [, n]) => a + n, 0);
    out.push(start + Math.ceil(k * TICKS_PER_SECOND - 1e-9) + stalled);
  }
  return out;
}

describe('timerOffsets', () => {
  it('numbers the changes by elapsed seconds and keeps o within the 0〜1 saw without stalls', () => {
    const offs = timerOffsets(changes(800, 60), 800);
    expect(offs).toHaveLength(60);
    expect(offs.map((x) => x.k)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    for (const x of offs) {
      expect(x.o).toBeGreaterThanOrEqual(0);
      expect(x.o).toBeLessThan(1);
    }
  });

  it('skips a stray change from an overlay and keeps counting through a 22f stop', () => {
    const real = changes(800, 60, [[20, 22]]);
    const offs = timerOffsets([...real.slice(0, 30), real[29]! + 25, ...real.slice(30)], 800);
    expect(offs.map((x) => x.c)).toEqual(real);
    expect(offs.at(-1)!.k).toBe(60);
    expect(offs.at(-1)!.o).toBeGreaterThanOrEqual(22);
  });

  it('counts a missed change as two seconds', () => {
    const real = changes(800, 40);
    const offs = timerOffsets([...real.slice(0, 10), ...real.slice(11)], 800);
    expect(offs.find((x) => x.c === real[11])!.k).toBe(12);
  });
});

describe('gameTicksAt と timerSteps', () => {
  it('removes stalls from the ticks between two frames', () => {
    const start = 800;
    const offs = timerOffsets(changes(start, 60, [[20, 22]]), start);
    const a = start + 300;
    const b = start + 2000;
    // a と b のあいだに 22f の止まり。ゲーム内のティックの差は動画の差 − 22（読みの幅 ± 1）
    const d = gameTicksAt(offs, start, b).ticks - gameTicksAt(offs, start, a).ticks;
    expect(Math.abs(d - (b - a - 22))).toBeLessThanOrEqual(1);
  });

  it('finds the step of a stall', () => {
    const start = 800;
    const offs = timerOffsets(changes(start, 60, [[30, 2]]), start);
    const steps = timerSteps(offs);
    expect(steps).toHaveLength(1);
    // 段は止まりの入った秒の変わり目か、その 2 つ後まで（前後の 3 点の最小で見るので、鋸歯の位置で前後する）
    const c = changes(start, 60, [[30, 2]]);
    expect(steps[0]!.c).toBeGreaterThanOrEqual(c[29]!);
    expect(steps[0]!.c).toBeLessThanOrEqual(c[31]!);
    expect(steps[0]!.size).toBeGreaterThanOrEqual(1);
  });
});
