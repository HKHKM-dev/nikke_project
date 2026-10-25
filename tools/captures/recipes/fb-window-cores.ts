// レシピ fb-window-cores: AI の SMG（鈴原サクラ）の、フルバーストの窓の中と外の、着地点ごとのコアのヒットの数（V-0492）。
// V-0354・V-0424 で使い捨てのスクリプトにしていた数え方を、V-0492「読み方」の 1〜3 の形でレシピにしたもの。
//
// - 総ダメージの増分（hud-jumps のキャッシュ）のうち、hitMax 以下で前のフレームも読めた増分（readGap 1）を 1 ヒットとして、
//   胴体 × 受けるダメージ▲（1 か up）× 攻撃力▲（1 か atk。窓の中だけ）× (1 + コア + 会心 + 距離ボーナス + フルバースト補正)
//   の格子で、差 tol 以内で読む。フルバースト補正の有無は窓（時刻）で決め、コアの有無が 1 つに決まる増分だけを数える。
// - フルバーストの入り E は、増分の 25〜114f の途切れの後の最初の増分で、その後 40〜400f にフルバースト補正の無い（攻撃力▲も無い）
//   格子にしか乗らない値が無いもの（1,000f 以内に続く候補は最初のもの）。途切れの前の最後の増分が P。窓は E から 589f。
//   [P − 5, E + 40) と [P + 587, E + 619) は数えない。窓の中で的のジャンプをまたいだ先も数えない（窓の帯は E + 40 以降の最初の
//   ヒットの帯）。どれも V-0424「読み方」（0434-01 の注記）と同じ。
// - 帯は的の立ち上がりのフレーム（--opt jumps。ふだん 5 つ）で区切る。省けば、ヒットの 115f 以上の途切れのうちフルバーストの止まりを
//   含まないものを使い、5 つでなければ止める（ジャンプがフルバーストの入りと重なった回は途切れで見分けられない。V-0424）。
//   4 回目のジャンプが遅く、5 回目が戦闘の終わりより後になる録画（0633）は、--opt jumps で 4 つ渡す（帯は 5 つ）。
// - 着地点: 中近・近 A・近 B・遠（3 つ目と 6 つ目の帯）・中遠 A・中遠 B/C（4 つ目の帯の距離ボーナスの多数決）。近の 2 つの帯の
//   A・B は --opt near で渡す（0354-12 の読み方で読む）。
import { loadHudJumps } from './hud-jumps.ts';
import type { HudRow } from './triggers.ts';
import { observation, type Recipe } from './types.ts';

/** 1 ヒットの格子 */
export type FbGrid = {
  body: number;
  core: number;
  crit: number;
  distance: number;
  /** フルバースト補正の上乗せ */
  fullBurst: number;
  /** 受けるダメージ▲の倍率（1 は自動で入る） */
  up: readonly number[];
  /** 攻撃力▲の倍率（窓の中だけ。1 は自動で入る。空なら対照） */
  atk: readonly number[];
};

export const LANDINGS = ['中近', '近A', '近B', '遠', '中遠A', '中遠BC'] as const;
export type Landing = (typeof LANDINGS)[number];

/** 窓の長さ（10 秒。C-0048 の 58.8f / 秒） */
export const WINDOW = 589;

/** atk は攻撃力▲が入ったか */
type Cand = { core: 0 | 1; dist: 0 | 1; atk: boolean };

/** 増分に乗る格子の候補。fb は窓の中か、withAtk は攻撃力▲の段を入れるか */
export function candidates(inc: number, g: FbGrid, fb: boolean, withAtk: boolean, tol: number): Cand[] {
  const out: Cand[] = [];
  for (const [ai, atk] of (withAtk ? [1, ...g.atk] : [1]).entries())
    for (const up of [1, ...g.up])
      for (const core of [0, 1] as const)
        for (const crit of [0, 1] as const)
          for (const dist of [0, 1] as const) {
            const v =
              g.body * (1 + g.core * core + g.crit * crit + g.distance * dist + (fb ? g.fullBurst : 0)) * up * atk;
            if (Math.abs(v - inc) <= tol) out.push({ core, dist, atk: ai > 0 });
          }
  return out;
}

export type Entry = { e: number; p: number };

/** フルバーストの入り E と、その前の最後の増分 P（冒頭のコメントの規則） */
export function detectEntries(rows: readonly HudRow[], g: FbGrid, hitMax: number, tol: number): Entry[] {
  const out: Entry[] = [];
  for (let i = 1; i < rows.length; i++) {
    const gap = rows[i]!.frame - rows[i - 1]!.frame;
    if (gap < 25 || gap > 114) continue;
    const e = rows[i]!.frame;
    if (out.length > 0 && e < out.at(-1)!.e + 1000) continue;
    const plain = rows.some(
      (r) =>
        r.frame >= e + 40 &&
        r.frame <= e + 400 &&
        r.increment <= hitMax &&
        (r.readGap ?? 1) === 1 &&
        candidates(r.increment, g, false, false, tol).length > 0 &&
        candidates(r.increment, g, true, true, tol).length === 0,
    );
    if (!plain) out.push({ e, p: rows[i - 1]!.frame });
  }
  return out;
}

/** ジャンプ（帯の区切り）: ヒットの 115f 以上の途切れのうち、フルバーストの止まり [P, E] を含まないものの真ん中 */
export function detectJumps(rows: readonly HudRow[], entries: readonly Entry[], hitMax: number): number[] {
  const hits = rows.filter((r) => r.increment <= hitMax);
  const out: number[] = [];
  for (let i = 1; i < hits.length; i++) {
    const a = hits[i - 1]!.frame;
    const b = hits[i]!.frame;
    if (b - a < 115) continue;
    if (entries.some((en) => en.p >= a && en.e <= b)) continue;
    out.push(Math.round((a + b) / 2));
  }
  return out;
}

export type LandingCount = { inCores: number; inHits: number; outCores: number; outHits: number };
export type FbTally = {
  counts: Record<Landing, LandingCount>;
  /** 帯ごとの [最初, 最後] のヒットのフレーム */
  bands: [number, number][];
  /** 窓ごとの帯の番号（0 から。-1 は帯が無い） */
  windowBands: number[];
  midFar: '中遠A' | '中遠BC';
  /** 数えなかった増分（端と、窓の中でジャンプをまたいだ先） */
  excluded: number;
  /** 前のフレームが読めていない増分 */
  gapped: number;
  unfit: number;
  ambiguous: number;
  /** 窓の中で攻撃力▲の段が決まったヒットの [なし, あり] */
  atkInWindow: [number, number];
};

const emptyCounts = (): Record<Landing, LandingCount> =>
  Object.fromEntries(LANDINGS.map((l) => [l, { inCores: 0, inHits: 0, outCores: 0, outHits: 0 }])) as Record<
    Landing,
    LandingCount
  >;

/** 着地点ごとに数える。jumps は 5 つ（戦闘の中のジャンプが 4 回なら 4 つ）、near は 2 つ目と 5 つ目の帯の近の着地点 */
export function tallyFbWindows(
  rows: readonly HudRow[],
  g: FbGrid,
  entries: readonly Entry[],
  jumps: readonly number[],
  near: readonly ['A' | 'B', 'A' | 'B'],
  hitMax: number,
  tol: number,
): FbTally {
  if (jumps.length !== 5 && jumps.length !== 4) throw new Error(`ジャンプは 5 つか 4 つ（${jumps.length} 個）`);
  const small = rows.filter((r) => r.increment <= hitMax);
  const cuts = [-Infinity, ...jumps, Infinity];
  const bands: [number, number][] = [];
  for (let k = 0; k <= jumps.length; k++) {
    const h = small.filter((r) => r.frame > cuts[k]! && r.frame < cuts[k + 1]!);
    if (h.length === 0) throw new Error(`${k + 1} つ目の帯にヒットが無い`);
    bands.push([h[0]!.frame, h.at(-1)!.frame]);
  }
  const bandOf = (f: number) => bands.findIndex(([a, b]) => f >= a && f <= b);
  const windowBands = entries.map((en) => {
    const first = small.find((r) => r.frame >= en.e + 40);
    return first === undefined ? -1 : bandOf(first.frame);
  });
  const t: FbTally = {
    counts: emptyCounts(),
    bands,
    windowBands,
    midFar: '中遠A',
    excluded: 0,
    gapped: 0,
    unfit: 0,
    ambiguous: 0,
    atkInWindow: [0, 0],
  };
  type Hit = { band: number; win: boolean; core: 0 | 1; dist: 0 | 1 | undefined };
  const hits: Hit[] = [];
  for (const r of small) {
    const band = bandOf(r.frame);
    if (band < 0) continue;
    let excluded = false;
    let win = false;
    for (const [k, en] of entries.entries()) {
      if (r.frame >= en.p - 5 && r.frame < en.e + 40) excluded = true;
      if (r.frame >= en.p + WINDOW - 2 && r.frame < en.e + WINDOW + 30) excluded = true;
      if (r.frame >= en.e && r.frame < en.e + WINDOW) {
        if (band === windowBands[k]) win = true;
        else excluded = true;
      }
    }
    if (excluded) {
      t.excluded++;
      continue;
    }
    if ((r.readGap ?? 1) !== 1) {
      t.gapped++;
      continue;
    }
    const cs = candidates(r.increment, g, win, win, tol);
    if (cs.length === 0) {
      t.unfit++;
      continue;
    }
    if (new Set(cs.map((c) => c.core)).size > 1) {
      t.ambiguous++;
      continue;
    }
    if (win && g.atk.length > 0) {
      const atks = new Set(cs.map((c) => c.atk));
      if (atks.size === 1) t.atkInWindow[cs[0]!.atk ? 1 : 0]++;
    }
    const dists = new Set(cs.map((c) => c.dist));
    hits.push({ band, win, core: cs[0]!.core, dist: dists.size === 1 ? cs[0]!.dist : undefined });
  }
  const mf = hits.filter((h) => h.band === 3 && h.dist !== undefined);
  t.midFar = mf.filter((h) => h.dist === 1).length * 2 > mf.length ? '中遠A' : '中遠BC';
  const landingOf = (band: number): Landing =>
    band === 0 ? '中近' : band === 1 ? `近${near[0]}` : band === 4 ? `近${near[1]}` : band === 3 ? t.midFar : '遠';
  for (const h of hits) {
    const c = t.counts[landingOf(h.band)];
    if (h.win) {
      c.inHits++;
      c.inCores += h.core;
    } else {
      c.outHits++;
      c.outCores += h.core;
    }
  }
  return t;
}

function parseList(text: string | undefined, name: string): number[] {
  const xs = (text ?? '')
    .split(',')
    .filter((x) => x !== '')
    .map(Number);
  if (xs.some((x) => !Number.isFinite(x))) throw new Error(`--opt ${name}=<数>,<数>,... の形が違う`);
  return xs;
}

export const fbWindowCores: Recipe = {
  name: 'fb-window-cores',
  version: 1,
  describe:
    'AI の SMG の、フルバーストの入りから 589f の窓の中と外の、着地点（中近・近 A・近 B・遠・中遠 A・中遠 B/C）ごとのコアのヒットの数とヒットの数（count。V-0492）',
  options: {
    body: '1 ヒットの胴体（距離ボーナスなし・非会心・フルバースト補正なし。鈴原サクラは 7047.8991）',
    up: '受けるダメージ▲の倍率をカンマ区切りで（1 は自動で入る。鈴原サクラ S1 は 1.1718）',
    atk: '窓の中の攻撃力▲の倍率をカンマ区切りで（1 は自動で入る。ドレイク S1 は 1.11865。対照では省く）',
    near: '2 つ目と 5 つ目の帯の近の着地点（例: B,A）',
    jumps:
      '的の立ち上がりのフレームをカンマ区切りで（5 つ。戦闘の中のジャンプが 4 回なら 4 つ）。省けばヒットの途切れから探す',
    hitMax: '1 ヒットとみなす増分の上限（既定 100000）',
    tol: '格子の値との差の許し（既定 3）',
  },
  async run(ctx) {
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体> が要る');
    const near = (ctx.options.near ?? '').split(',');
    if (near.length !== 2 || near.some((n) => n !== 'A' && n !== 'B')) throw new Error('--opt near=<A|B>,<A|B> が要る');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const g: FbGrid = {
      body,
      core: 1,
      crit: 0.5,
      distance: 0.3,
      fullBurst: 0.5,
      up: parseList(ctx.options.up, 'up'),
      atk: parseList(ctx.options.atk, 'atk'),
    };
    const hitMax = num('hitMax', 100000);
    const tol = num('tol', 3);
    const rows = (await loadHudJumps(ctx)).rows;
    const entries = detectEntries(rows, g, hitMax, tol);
    const given = parseList(ctx.options.jumps, 'jumps');
    const jumps = given.length > 0 ? given : detectJumps(rows, entries, hitMax);
    if (given.length === 0 && jumps.length !== 5)
      throw new Error(
        `ヒットの途切れから探したジャンプが ${jumps.length} 個（${jumps.join(',')}）。--opt jumps で的の立ち上がりのフレームを渡す`,
      );
    const t = tallyFbWindows(rows, g, entries, jumps, near as ['A' | 'B', 'A' | 'B'], hitMax, tol);
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const role =
      g.atk.length > 0
        ? `▲あり（窓の中の攻撃力▲ ${g.atk.join('・')} を格子に入れた）`
        : '対照（攻撃力▲を格子に入れない）';
    const value = LANDINGS.flatMap((l) => {
      const c = t.counts[l];
      return [c.inCores, c.inHits, c.outCores, c.outHits];
    });
    const note =
      `${body} × 受けるダメージ▲（1・${g.up.join('・')}）× 攻撃力▲（窓の中だけ。1${g.atk.map((a) => `・${a}`).join('')}）× ` +
      `(1 + コア ${g.core} + 会心 ${g.crit} + 距離ボーナス ${g.distance} + フルバースト補正 ${g.fullBurst}) の格子で、差 ${tol} 以内で読み、` +
      `コアの有無が 1 つに決まる増分だけを数えた（読み方は V-0492「読み方」の 1〜3）。フルバーストの入り E は ` +
      `${entries.map((en) => `f${en.e}`).join('・')}（止まりの前の最後の増分 P は ${entries.map((en) => `f${en.p}`).join('・')}）。` +
      `窓の帯は ${t.windowBands.map((b) => b + 1).join('・')} つ目。帯の区切り（ジャンプ）は ${jumps.map((j) => `f${j}`).join('・')}` +
      `（${given.length > 0 ? '--opt jumps' : 'ヒットの途切れ'}）、帯の最初と最後のヒットは ${t.bands.map(([a, b]) => `f${a}〜${b}`).join('・')}。` +
      `近の着地点は ${near.join('・')}（--opt near）、中遠は ${t.midFar === '中遠A' ? '中遠 A（距離ボーナスあり）' : '中遠 B/C（距離ボーナスなし）'}。` +
      `数えなかった増分: 端と窓の中のジャンプの先 ${t.excluded}、前のフレームが読めていない ${t.gapped}、格子に合わない ${t.unfit}、` +
      `コアの有無が決まらない ${t.ambiguous}。` +
      (g.atk.length > 0
        ? `窓の中で攻撃力▲の有無が決まったヒットは、なし ${t.atkInWindow[0]}・あり ${t.atkInWindow[1]}`
        : '');
    return [
      {
        ...observation(
          this,
          'count',
          value,
          `${who} の 1 枠目（AI の SMG）の的へのヒットのうち、着地点ごと（${LANDINGS.join('・')}）の [フルバーストの入りから ${WINDOW}f の窓の中のコア, 中のヒット, 外のコア, 外のヒット]（24 個）。${role}`,
          note,
          { unit: 'ヒット' },
        ),
        scope: { slot: 1, source: 'normal' },
      },
    ];
  },
};
