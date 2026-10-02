// HUD の総ダメージの増分（hud.ts --mode jumps）から、トリガー（1 発）の列と、的のジャンプで分けた区間を作る（純粋な関数。
// plan/design-records-automation.md 3.4 節の range-intervals）。
//
// - 増分の読みが 1 トリガーで 2 つに割れることがある（HUD の数字の描き替えの途中を読む）。前の増分から mergeBelow 未満の増分は
//   同じ組にまとめ、組の跨ぐ長さから発の数を決める（V-0069・V-0071 の「足し戻し」）。
// - HUD が何フレームか読めなかった後の読み（hud.ts の gap 列が 2 以上）は、増えた時刻がその読めなかった間のどこかにある。
//   組の跨ぐ長さは、組の最初の読みを読めなかった間の真ん中に置いて測る（V-0079。L-S の f1416 は 30f 遅れて読んだ発で、
//   10f 後の次の発と 1 組にまとまり、1 発に数えていた）。
// - 空きの分類: 発と発の間（SG は 39〜40f）、リロード（マガジンの弾数ごとに同じ長さ）、的のジャンプ（100f 超。区間の切れ目）。
//   リロードとジャンプの長さが近い武器（プロダクト23 の 183f）もあるので、長さだけでは決めず、近の区間だけ距離ボーナスで増分の
//   刻みが変わること（regime）で切れ目を確かめる。遠 → 中遠の切れ目は刻みが変わらないので、空きの長さと数で決める。

/** readGap は前の読みからのフレーム数（hud.ts の gap 列。ふだん 1。無い TSV は 1） */
export type HudRow = { frame: number; value: number; increment: number; readGap?: number };

/** hud.ts --mode jumps の出力（frame\tvalue\tincrement\tgap）を読む */
export function parseHudJumpsTsv(text: string): HudRow[] {
  const rows: HudRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [f, v, d, gap] = line.split('\t');
    const frame = Number(f);
    if (line === '' || !Number.isInteger(frame) || v === undefined || d === undefined) continue;
    const readGap = gap === undefined ? 1 : Number(gap);
    rows.push({ frame, value: Number(v), increment: Number(d), readGap: Number.isInteger(readGap) ? readGap : 1 });
  }
  return rows.sort((a, b) => a.frame - b.frame);
}

/**
 * 1 トリガー（発）の組。shots は、組が跨ぐ長さから決めた発の数（ふだん 1。割れた読みが次の発に掛かると 2）。
 * parts は組にまとめた読みごとの増分（読みの順。発ごとに分けるときに使う）
 */
export type TriggerGroup = {
  frame: number;
  last: number;
  increment: number;
  shots: number;
  rows: number;
  parts?: number[];
};

/** 発と発の間の長さ: 30〜60f の空きの中央値（SG の 39〜40f を想定） */
export function shotIntervalOf(frames: readonly number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const g = frames[i]! - frames[i - 1]!;
    if (g >= 30 && g <= 60) gaps.push(g);
  }
  return median(gaps) ?? 40;
}

/**
 * 前の増分から mergeBelow 未満の増分を同じ組にまとめる。組の発の数は round(跨ぐ長さ ÷ 発の間) + 1。
 * 2 つ以上の読みの組は、最初の読みを読めなかった間の真ん中（frame − (readGap − 1) / 2）から跨ぐ長さを測る。読み 1 つの組は 1 発
 */
export function groupIncrements(rows: readonly HudRow[], shotInterval: number, mergeBelow = 30): TriggerGroup[] {
  const groups: TriggerGroup[] = [];
  const starts: number[] = [];
  for (const r of rows) {
    const g = groups.at(-1);
    if (g && r.frame - g.last < mergeBelow) {
      g.last = r.frame;
      g.increment += r.increment;
      g.rows += 1;
      g.parts!.push(r.increment);
    } else {
      groups.push({ frame: r.frame, last: r.frame, increment: r.increment, shots: 1, rows: 1, parts: [r.increment] });
      starts.push(r.frame - ((r.readGap ?? 1) - 1) / 2);
    }
  }
  groups.forEach((g, i) => {
    g.shots = g.rows === 1 ? 1 : Math.max(1, Math.round((g.last - starts[i]!) / shotInterval) + 1);
  });
  return groups;
}

/** 組 i の、前の組からの空き（前の組の最初の発から、発の数ぶんを引く）。i = 0 は 0 */
export function gapBefore(groups: readonly TriggerGroup[], i: number, shotInterval: number): number {
  if (i === 0) return 0;
  const prev = groups[i - 1]!;
  return groups[i]!.frame - prev.frame - Math.round((prev.shots - 1) * shotInterval);
}

export type Regime = 'near' | 'far' | 'unknown';

export type Boundary = {
  /** 切れ目の後の最初の組の添字 */
  index: number;
  /** 切れ目の空き（f） */
  gap: number;
  how: 'regime' | 'gap' | 'given';
};

export type GapSummary = {
  shotInterval: number;
  /** 大きな空きとみなす長さ（発の間の 1.5 倍） */
  bigThreshold: number;
  /** マガジンの発の数（大きな空きの間の発の数の最頻値） */
  magazine: number;
  /** リロードの空きの中央値（マガジンを撃ち切った後の大きな空き） */
  reloadGap: number;
  /** 組 i の前の大きな空きからの発の数（組 i を含まない） */
  shotsSinceBigGap: number[];
};

export function summarizeGaps(groups: readonly TriggerGroup[], shotInterval: number): GapSummary {
  const bigThreshold = shotInterval * 1.5;
  const counts: number[] = [];
  const bigGaps: { gap: number; count: number }[] = [];
  const shotsSinceBigGap: number[] = [];
  let since = 0;
  for (let i = 0; i < groups.length; i++) {
    const gap = gapBefore(groups, i, shotInterval);
    shotsSinceBigGap.push(since);
    if (i > 0 && gap > bigThreshold) {
      bigGaps.push({ gap, count: since });
      counts.push(since);
      since = 0;
    }
    since += groups[i]!.shots;
  }
  const magazine = mode(counts) ?? 0;
  const reloadGap =
    median(bigGaps.filter((b) => b.count === magazine).map((b) => b.gap)) ?? median(bigGaps.map((b) => b.gap)) ?? 0;
  return { shotInterval, bigThreshold, magazine, reloadGap, shotsSinceBigGap };
}

/**
 * 窓の中の regime。far は確かでない（近でも h が 10 なら、スペック固定 ON は 5 の倍数の刻み、OFF は 7 ペレット + コア 3 個に読める）ので、
 * near（確か）が 2 つ以上あれば near、known が min 以上で全部 far なら far、それ以外は unknown
 */
export function windowRegime(regimes: readonly Regime[], min = 4): Regime {
  const known = regimes.filter((r) => r !== 'unknown');
  const near = known.filter((r) => r === 'near').length;
  if (near >= 2) return 'near';
  if (known.length >= min && near === 0) return 'far';
  return 'unknown';
}

export type BoundaryResult = { boundaries: Boundary[]; notes: string[]; errors: string[]; summary: GapSummary };

/** 切れ目 k（0 始まり）の前後の regime（区間の並び 中近 → 近 → 遠 → 中遠 → 近 → 遠） */
const TRANSITIONS: readonly { from: Regime; to: Regime }[] = [
  { from: 'far', to: 'near' },
  { from: 'near', to: 'far' },
  { from: 'far', to: 'far' },
  { from: 'far', to: 'near' },
  { from: 'near', to: 'far' },
];

/** リロードの空きとみなす長さの幅（f。プロダクト23 は 172〜184f、ジャンプは 144〜162f） */
const RELOAD_TOLERANCE = 15;

/** 4 番目の切れ目から 5 番目までの長さの範囲（f。ジャンプの間隔は約 2,100〜2,300f） */
const FIFTH_JUMP_AFTER: readonly [number, number] = [1500, 2600];

/**
 * 的のジャンプの切れ目を見つける。区間の並びは 中近 → 近 → 遠 → 中遠 → 近 → 遠（C-0031。最後の遠は録画の終わりで無いことがある）。
 * 候補は 100f 以上の空きのうちリロードでないもの（リロードの空き ±15f でないもの）。候補は並びの順に当てはめ、
 * 前後の窓の regime が並びどおりの反転（近との境）か、近でない（遠 → 中遠）ことを確かめ、合わないものは落とす。5 番目の切れ目がリロードと重なる（プロダクト23 の 183f など）
 * ときは、4 番目から 1,500〜2,600f 後のリロードの空きのうち、後ろが全部 far・前に near があるものを 5 番目にする。
 * cuts（切れ目の後の最初の発のフレーム）が与えられていれば、それをそのまま使う。
 */
export function findJumpBoundaries(
  groups: readonly TriggerGroup[],
  regimeOf: (g: TriggerGroup) => Regime,
  cuts: readonly number[] | undefined,
  window = 16,
): BoundaryResult {
  const shotInterval = shotIntervalOf(groups.map((g) => g.frame));
  const summary = summarizeGaps(groups, shotInterval);
  const notes: string[] = [];
  const errors: string[] = [];
  if (cuts !== undefined) {
    const boundaries: Boundary[] = [];
    for (const cut of cuts) {
      const index = groups.findIndex((g) => g.frame === cut);
      if (index < 0) errors.push(`cuts の f${cut} に発が無い`);
      else boundaries.push({ index, gap: gapBefore(groups, index, shotInterval), how: 'given' });
    }
    return { boundaries, notes, errors, summary };
  }
  const regimes = groups.map(regimeOf);
  // リロードの空き ±15f で、前の大きな空きからの発の数がマガジン以下（ジャンプの明けの最初のマガジンは途中から）
  const isReloadLike = (i: number, gap: number): boolean =>
    summary.shotsSinceBigGap[i]! <= summary.magazine && Math.abs(gap - summary.reloadGap) <= RELOAD_TOLERANCE;
  const around = (i: number): { before: Regime; after: Regime } => ({
    before: windowRegime(regimes.slice(Math.max(0, i - window), i)),
    after: windowRegime(regimes.slice(i, i + window)),
  });
  // 近との境（1・2・4・5 番目）は前後の窓の刻みが並びどおりに確かめられること、遠 → 中遠（3 番目）は前後に近が無いこと。
  // 5 番目は後ろが録画の終わりで短いことがあるので、後ろは近でなければよい
  const fits = (i: number, t: { from: Regime; to: Regime }, last: boolean): boolean => {
    const { before, after } = around(i);
    if (t.from === t.to) return before !== 'near' && after !== 'near';
    if (last) return before === t.from && after !== 'near';
    return before === t.from && after === t.to;
  };
  const candidates: Boundary[] = [];
  for (let i = 1; i < groups.length; i++) {
    const gap = gapBefore(groups, i, shotInterval);
    if (gap >= 100 && !isReloadLike(i, gap)) candidates.push({ index: i, gap, how: 'gap' });
  }
  const label = (b: Boundary) => `f${groups[b.index]!.frame}（${b.gap}f）`;
  // 並びどおりに当てはめる。前後の regime が分かって合わない候補は落とす
  const boundaries: Boundary[] = [];
  for (const c of candidates) {
    const t = TRANSITIONS[boundaries.length];
    if (t === undefined) {
      errors.push(`切れ目の候補が 6 個以上: ${candidates.map(label).join('・')}。--opt cuts=... で与える`);
      break;
    }
    if (fits(c.index, t, boundaries.length === TRANSITIONS.length - 1)) boundaries.push(c);
    else notes.push(`${label(c)} は ${boundaries.length + 1} 番目の切れ目の前後の刻みに合わないので使わない`);
  }
  if (boundaries.length < 4) {
    errors.push(
      `切れ目の候補が ${boundaries.length} 個（4 個以上要る）: ${boundaries.map(label).join('・') || 'なし'}。--opt cuts=... で与える`,
    );
    return { boundaries, notes, errors, summary };
  }
  if (boundaries.length === 4) {
    // 5 番目がリロードと重なったとき: 4 番目から 1,500〜2,600f 後のリロードの空きで、後ろが全部 far・前に near があるもの
    const fourth = groups[boundaries[3]!.index]!.frame;
    for (let i = boundaries[3]!.index + 1; i < groups.length; i++) {
      const gap = gapBefore(groups, i, shotInterval);
      const dt = groups[i]!.frame - fourth;
      if (gap <= summary.bigThreshold || dt < FIFTH_JUMP_AFTER[0] || dt > FIFTH_JUMP_AFTER[1]) continue;
      const after = regimes.slice(i);
      const before = regimes.slice(Math.max(0, i - window), i);
      if (after.length >= 2 && after.every((r) => r !== 'near') && before.some((r) => r === 'near')) {
        boundaries.push({ index: i, gap, how: 'regime' });
        notes.push(
          `5 番目の切れ目はリロードと重なる空き ${label(boundaries[4]!)}（後ろの ${after.length} 発が全部 近以外の刻み）`,
        );
        break;
      }
    }
    if (boundaries.length === 4) notes.push('5 番目の切れ目（近 → 遠）は無い（録画の終わりまで近の区間）');
  }
  return { boundaries, notes, errors, summary };
}

export type IntervalLabel = '中近' | '近' | '遠' | '中遠';
/** 射撃場 3 分モードの区間の並び（C-0031） */
export const RANGE_ORDER: readonly IntervalLabel[] = ['中近', '近', '遠', '中遠', '近', '遠'];

export type Interval = {
  label: IntervalLabel;
  /** 近の 1 回目・2 回目（近だけ） */
  nth?: 1 | 2;
  groups: TriggerGroup[];
  /** 最初と最後の発のフレーム */
  first: number;
  last: number;
  /** 発の数（組の shots の和） */
  triggers: number;
  /** 10 トリガー未満の最後の遠（割合には使わない。V-0062） */
  short: boolean;
};

export function splitIntervals(groups: readonly TriggerGroup[], boundaries: readonly Boundary[]): Interval[] {
  const starts = [0, ...boundaries.map((b) => b.index).sort((a, b) => a - b), groups.length];
  const out: Interval[] = [];
  let nearCount = 0;
  for (let k = 0; k + 1 < starts.length; k++) {
    const part = groups.slice(starts[k], starts[k + 1]);
    if (part.length === 0) continue;
    const label = RANGE_ORDER[k];
    if (label === undefined) throw new Error(`区間が ${RANGE_ORDER.length} 個を超えた`);
    const triggers = part.reduce((s, g) => s + g.shots, 0);
    const iv: Interval = {
      label,
      groups: part,
      first: part[0]!.frame,
      last: part.at(-1)!.frame,
      triggers,
      short: k === RANGE_ORDER.length - 1 && triggers < 10,
    };
    if (label === '近') iv.nth = ++nearCount === 1 ? 1 : 2;
    out.push(iv);
  }
  return out;
}

export function intervalName(iv: Interval): string {
  return iv.nth === undefined ? iv.label : `${iv.label} ${iv.nth} 回目`;
}

export function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export function mode(values: readonly number[]): number | undefined {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | undefined;
  for (const [v, c] of counts) {
    if (best === undefined || c > counts.get(best)! || (c === counts.get(best)! && v > best)) best = v;
  }
  return best;
}
