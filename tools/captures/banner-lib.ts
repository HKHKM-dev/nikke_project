// 左のスキルの帯（「スキル2 ○○」）の立ち上がり（V-0313）。帯は左から滑り込むので、欄の灰色の平均の明るさが急に上がる。

/** 明るさの列（[フレーム, 明るさ]）から、1 フレームで +4 以上・3 フレームで +15 以上上がった最初のフレームを全部挙げる（続く 8 フレームは同じ立ち上がり） */
export function bannerRises(series: readonly (readonly [number, number])[]): number[] {
  const out: number[] = [];
  for (let i = 1; i + 2 < series.length; i++) {
    const prev = series[i - 1]![1];
    if (series[i]![1] - prev >= 4 && series[i + 2]![1] - prev >= 15) {
      out.push(series[i]![0]);
      i += 8;
    }
  }
  return out;
}

/** ヒットのフレームごとに、その前（window フレーム）から 5 フレーム後までの立ち上がりを、ヒットからの差 D（ヒット − 立ち上がり）で返す */
export function risesBeforeHits(
  rises: readonly number[],
  hits: readonly number[],
  window = 140,
): { hit: number; ds: number[] }[] {
  return hits.map((hit) => ({
    hit,
    ds: rises.filter((r) => r >= hit - window && r <= hit + 5).map((r) => hit - r),
  }));
}
