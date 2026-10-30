// 1 パス目の最適化の段 2（plan/design-first-pass-perf.md 3.2 節）: 効いている件の組で決まる値を、件の境目まで使い回す。
// 射手の実効値（holders.ts の firingBuffsAt）は毎フレーム × 枠で読まれるが、効いている件の組は件の始まり・終わりでしか変わらない。

/** 件の始まり・終わり（holders.ts の HeldItem のうち、ここで読む欄） */
type Span = { start: number; end: number };

/**
 * count 本の件の列（itemsAt(i)。作り直すと別の配列になる）で決まる値 compute(frame, base) を使い回す関数を作る。
 * 前に計算したフレームを含む区間 [from, until)（件の始まり・終わりのうち、そのフレーム以前で最も遅いものから、より後で最も早いものの手前まで）
 * の中で、どの件の列も作り直されておらず、base が同じなら、前の値を返す。フレームは前後してよい（射撃の回数のきっかけは f + 1 で読む）。
 * 毎フレーム呼ぶので、呼ぶたびの割り当てをしない（関数は作る時に 1 回だけ受け取る）
 */
export function createSpanMemo<B, T>(
  count: number,
  itemsAt: (i: number) => readonly Span[],
  compute: (frame: number, base: B) => T,
): (frame: number, base: B) => T {
  /** 前に計算した時の件の列ごとの件（同じ配列か見る） */
  const items: (readonly Span[] | null)[] = Array.from({ length: count }, () => null);
  let from = 0;
  let until = -1;
  let lastBase: B | undefined;
  let value: T | undefined;
  return (frame, base) => {
    let same = from <= frame && frame < until && base === lastBase;
    for (let i = 0; i < count; i++) {
      const list = itemsAt(i);
      if (list !== items[i]) same = false;
      items[i] = list;
    }
    if (same) return value as T;
    from = 0;
    until = Infinity;
    for (let i = 0; i < count; i++) {
      for (const it of items[i]!) {
        if (it.start <= frame) from = Math.max(from, it.start);
        else until = Math.min(until, it.start);
        if (it.end <= frame) from = Math.max(from, it.end);
        else until = Math.min(until, it.end);
      }
    }
    lastBase = base;
    value = compute(frame, base);
    return value;
  };
}
