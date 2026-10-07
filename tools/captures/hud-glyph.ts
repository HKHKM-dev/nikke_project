// HUD の総ダメージの数字の塊の純粋な部分。hud.ts が使い、hud-glyph.test.ts でテストする。録画は読まない。

/** 2 値の画の連結成分（前景は 8 近傍でつなぐ） */
export type Component = { minX: number; maxX: number; minY: number; maxY: number; pixels: [number, number][] };

/**
 * 成分の穴（外とつながらない背景の塊。背景は 4 近傍でつなぐ）のうち、minArea px 以上のものの数。
 * 0 は 1 個、8 は 2 個で、見本との照合で分けにくい 0 と 8 を分けるのに使う（V-0299）
 */
export function holes(c: Component, minArea = 1): number {
  // 外枠を 1px 足し、外の背景を 1 つの塊にする
  const w = c.maxX - c.minX + 3;
  const h = c.maxY - c.minY + 3;
  const fg = new Uint8Array(w * h);
  for (const [x, y] of c.pixels) fg[(y - c.minY + 1) * w + (x - c.minX + 1)] = 1;
  const seen = new Uint8Array(w * h);
  let count = 0;
  for (let start = 0; start < w * h; start++) {
    if (fg[start] || seen[start]) continue;
    let area = 0;
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      area++;
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !fg[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    // 左上の画素から始まる最初の塊は外の背景
    if (start > 0 && area >= minArea) count++;
  }
  return count;
}

