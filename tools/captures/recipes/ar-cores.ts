// レシピ ar-cores: AR 単騎・射撃場 3 分モードの、区間ごとのコア命中率と、遠のコア命中率・中遠の完全なマガジンの弾丸命中率
// （V-0491）。V-0421・V-0423 で使い捨てのスクリプトにしていた数え方（`0423-01` の注記）をレシピにしたもの。
//
// - 総ダメージの増分（hud-jumps のキャッシュ）を、1 ヒットの格子 胴体 × (1 + コア c + 会心 r + 距離ボーナス d)（c・r・d は 0 か 1）
//   で読む。胴体は --opt body と、攻撃力▲の状態の胴体（--opt atkBody。I-DOLL・サンの S2。C-0551）。格子の値は 1 ヒットごとに
//   四捨五入し、その和と差 tol（既定 0）以内で読む。
// - 前のフレームも読めた増分（readGap 1）は 1 ヒット。読めなかった後の増分は、ceil(readGap ÷ 発の間) ヒットまで。1 つの増分の
//   ヒットは同じ距離ボーナス・同じ胴体。ヒットの数かコアの数が一通りに決まらない増分と、格子に乗らない増分は落とす。
// - 区間の切れ目は --opt cuts か arCuts（装弾数 mag・発の間 interval）。区間の並びは
//   中近 → 近 → 遠 → 中遠 → 近 → 遠（短い遠）。区間の頭を除かない全部のヒットで数える（V-0423「読み方」4）。
// - 完全なマガジン: 増分の間が 40f 以上空いた所で切った連射のうち、区間の最初と最後のもの（ジャンプに接する）・落とした増分を含む
//   もの・区間をまたぐもの・長さが満タンの 93% に届かないものを除いたもの。弾丸命中率は当たったヒット ÷ 装弾数。
// - 比べる観測値（compare）の幅は、表（data/enemies.json の range-bigarms の AR）の値の、その録画の数の 2 項分布の 2σ。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadHudJumps } from './hud-jumps.ts';
import { groupMagazines, segmentOf, type HudIncrement } from './smg-hits.ts';
import { observation, roundTo, type Recipe, type RecipeObservation } from './types.ts';

/** 1 ヒットの格子。bodies は攻撃力▲の段ごとの胴体（最初が▲なし） */
export type ArGrid = { bodies: readonly number[]; core: number; crit: number; distance: number };

export type ArHit = { value: number; core: 0 | 1; crit: 0 | 1; dist: 0 | 1; atk: number };

/** 1 ヒットの格子の値（1 ヒットごとに四捨五入） */
export function arGridValues(g: ArGrid): ArHit[] {
  const out: ArHit[] = [];
  for (const [atk, body] of g.bodies.entries())
    for (const core of [0, 1] as const)
      for (const crit of [0, 1] as const)
        for (const dist of [0, 1] as const)
          out.push({
            value: Math.round(body * (1 + g.core * core + g.crit * crit + g.distance * dist)),
            core,
            crit,
            dist,
            atk,
          });
  return out;
}

export type ArRead = { kind: 'hits'; parts: ArHit[] } | { kind: 'ambiguous' } | { kind: 'unfit' };

/**
 * 増分を 1〜maxHits ヒットの和で読む。1 つの増分のヒットは同じ距離ボーナス・同じ胴体。候補のヒットの数とコアの数が全部同じなら
 * 決まる（会心の内訳は最初の候補）
 */
export function readArIncrement(increment: number, maxHits: number, values: readonly ArHit[], tol: number): ArRead {
  const cands: ArHit[][] = [];
  const groups = new Map<string, ArHit[]>();
  for (const v of values) {
    const k = `${v.atk}:${v.dist}`;
    groups.set(k, [...(groups.get(k) ?? []), v]);
  }
  for (const vs of groups.values()) {
    // 重複を許す組み合わせ（添字の昇順）
    const walk = (start: number, picked: ArHit[], sum: number) => {
      if (picked.length > 0 && Math.abs(increment - sum) <= tol) cands.push([...picked]);
      if (picked.length === maxHits || sum - tol > increment) return;
      for (let i = start; i < vs.length; i++) walk(i, [...picked, vs[i]!], sum + vs[i]!.value);
    };
    walk(0, [], 0);
  }
  if (cands.length === 0) return { kind: 'unfit' };
  const key = (c: ArHit[]) => `${c.length}:${c.reduce((s, v) => s + v.core, 0)}`;
  if (new Set(cands.map(key)).size > 1) return { kind: 'ambiguous' };
  return { kind: 'hits', parts: cands[0]! };
}

export type SegmentCount = { hits: number; cores: number; crits: number; dist: number };

export type ArMagazine = { segment: number; start: number; end: number; hits: number; complete: boolean };

export type ArTally = {
  segments: SegmentCount[];
  atkHits: number[];
  magazines: ArMagazine[];
  ambiguous: number;
  unfit: number;
};

/** 増分の列を区間ごとに数え、マガジンに分ける */
export function tallyAr(
  rows: readonly HudIncrement[],
  grid: ArGrid,
  cuts: readonly number[],
  opts: { interval: number; mag: number; tol: number; segments?: number },
): ArTally {
  const values = arGridValues(grid);
  const nSeg = opts.segments ?? 6;
  const t: ArTally = {
    segments: Array.from({ length: nSeg }, () => ({ hits: 0, cores: 0, crits: 0, dist: 0 })),
    atkHits: grid.bodies.map(() => 0),
    magazines: [],
    ambiguous: 0,
    unfit: 0,
  };
  const read = rows.map((r) => {
    const maxHits = r.readGap <= 1 ? 1 : Math.ceil(r.readGap / opts.interval);
    return { row: r, read: readArIncrement(r.increment, maxHits, values, opts.tol) };
  });
  for (const { row, read: rd } of read) {
    if (rd.kind === 'unfit') {
      t.unfit++;
      continue;
    }
    if (rd.kind === 'ambiguous') {
      t.ambiguous++;
      continue;
    }
    const seg = t.segments[Math.min(segmentOf(row.frame, cuts), nSeg - 1)]!;
    for (const p of rd.parts) {
      seg.hits++;
      seg.cores += p.core;
      seg.crits += p.crit;
      seg.dist += p.dist;
      t.atkHits[p.atk]!++;
    }
  }
  const full = (opts.mag - 1) * opts.interval;
  const groups = groupMagazines(read.map((x) => ({ frame: x.row.frame, x })));
  const segOf = (f: number) => Math.min(segmentOf(f, cuts), nSeg - 1);
  groups.forEach((g, i) => {
    const start = g[0]!.frame;
    const end = g.at(-1)!.frame;
    const segment = segOf(start);
    const prevSame = i > 0 && segOf(groups[i - 1]![0]!.frame) === segment;
    const nextSame = i < groups.length - 1 && segOf(groups[i + 1]![0]!.frame) === segment;
    const clean = g.every((m) => m.x.read.kind === 'hits');
    const hits = g.reduce((s, m) => s + (m.x.read.kind === 'hits' ? m.x.read.parts.length : 0), 0);
    t.magazines.push({
      segment,
      start,
      end,
      hits,
      complete: prevSame && nextSame && clean && segOf(end) === segment && end - start >= 0.93 * full,
    });
  });
  return t;
}

/**
 * AR の区間の切れ目（ジャンプの前の最後の増分のフレーム）。ジャンプはマガジンの途中で連射を切る（長さが満タンの 93% に届かない
 * まとまりの終わり）か、リロードの間に入って空きを延ばす（空きが gapOver f を超える）。候補を前から取り、前に取った切れ目から
 * minSpacing f 未満の候補は飛ばす（ジャンプの間隔は約 2,000f。読めないヒットで短く見えるマガジンを拾わない）。最後のまとまりは
 * 切れ目にしない
 */
export function arCuts(
  rows: readonly { frame: number }[],
  mag: number,
  interval: number,
  gapOver = 180,
  minSpacing = 1500,
): number[] {
  const groups = groupMagazines(rows);
  const full = (mag - 1) * interval;
  const cands: number[] = [];
  groups.forEach((g, i) => {
    if (i === groups.length - 1) return;
    const end = g.at(-1)!.frame;
    const short = end - g[0]!.frame < 0.93 * full;
    const gap = groups[i + 1]![0]!.frame - end;
    if (short || gap > gapOver) cands.push(end);
  });
  const cuts: number[] = [];
  for (const c of cands) if (cuts.length === 0 || c - cuts.at(-1)! >= minSpacing) cuts.push(c);
  return cuts;
}

export const AR_SEGMENTS = ['中近', '近', '遠', '中遠', '近', '短い遠'] as const;

type BandTable = { near: number; midNear: number; midFar: number; far: number };

function arTable(): { core: BandTable; bullet: BandTable } {
  const path = fileURLToPath(new URL('../../../packages/core/data/enemies.json', import.meta.url));
  const raw = JSON.parse(readFileSync(path, 'utf8')) as {
    targetProfiles: { id: string; coreHitRate: { AR: BandTable }; bulletHitRate: { AR: BandTable } }[];
  };
  const p = raw.targetProfiles.find((x) => x.id === 'range-bigarms');
  if (p === undefined) throw new Error('data/enemies.json に range-bigarms が無い');
  return { core: p.coreHitRate.AR, bullet: p.bulletHitRate.AR };
}

const twoSigma = (p: number, n: number) => roundTo(2 * Math.sqrt((p * (1 - p)) / n), 4);

function parseList(text: string | undefined, name: string): number[] {
  const xs = (text ?? '')
    .split(',')
    .filter((x) => x !== '')
    .map(Number);
  if (xs.some((x) => !Number.isFinite(x))) throw new Error(`--opt ${name}=<数>,<数>,... の形が違う`);
  return xs;
}

/** 比べる設定（V-0491 の予測ファイルの指標と同じ。着地点は表の値に効かないので書かない） */
const SETUP = {
  enemy: 'range-bigarms-fire',
  events: ['range-3min-jump'],
  burst: false,
  condition: 'auto' as const,
};

export const arCores: Recipe = {
  name: 'ar-cores',
  version: 1,
  describe:
    'AR 単騎・射撃場 3 分モードの、区間ごとのコア命中率（rate）とコア・当たったヒットの数（count）、遠（2 区間）のコア命中率と中遠の完全なマガジンの弾丸命中率（rate。表と比べる）、中遠のマガジンごとの当たった数（count）',
  options: {
    body: '1 ヒットの胴体（距離ボーナスなし・非会心・攻撃力▲の外）',
    atkBody: '攻撃力▲の状態の胴体をカンマ区切りで（I-DOLL・サンの S2 は 10880.55。`0423-01`）',
    core: 'コアの上乗せ（既定 1）',
    crit: '会心の上乗せ（既定 0.5）',
    distance: '距離ボーナスの上乗せ（既定 0.3）',
    tol: '格子の値の和との差の許し（既定 0）',
    interval: '発の間（f。既定 5）',
    mag: '装弾数（既定 60）',
    cuts: '区間の切れ目（ジャンプの前の最後の増分のフレーム）をカンマ区切りで（5 つ）。省けば arCuts（満タンに届かない連射の終わりか、180f を超える空き）',
  },
  async run(ctx) {
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体> が要る');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const grid: ArGrid = {
      bodies: [body, ...parseList(ctx.options.atkBody, 'atkBody')],
      core: num('core', 1),
      crit: num('crit', 0.5),
      distance: num('distance', 0.3),
    };
    const tol = num('tol', 0);
    const interval = num('interval', 5);
    const mag = num('mag', 60);
    const rows = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const given = parseList(ctx.options.cuts, 'cuts');
    const cuts = given.length > 0 ? given : arCuts(rows, mag, interval);
    if (cuts.length !== 5) throw new Error(`区間の切れ目が ${cuts.length} 個（3 分モードは 5 個）: ${cuts.join(',')}`);
    const t = tallyAr(rows, grid, cuts, { interval, mag, tol });
    const s = t.segments;
    // 距離ボーナスの確かめ: 中近・中遠は全部、近・遠は無し（AR の範囲 25〜45 に中遠の 3 か所とも入る。C-0032・C-0044）
    const distNote = s.map((c) => c.dist).join('・');
    ctx.log(
      `区間の切れ目 ${cuts.join(',')}・区間ごとのヒット ${s.map((c) => c.hits).join('・')}・距離ボーナス ${distNote}`,
    );
    const first = rows[0]?.frame ?? 0;
    const last = rows.at(-1)?.frame ?? 0;
    const segFrames = [first, ...cuts, last];
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const allHits = s.reduce((a, c) => a + c.hits, 0);
    const gridNote =
      `hud-jumps のキャッシュの増分を、胴体 ${grid.bodies.join('・')}（攻撃力▲の段）×（1 + コア ${grid.core} + 会心 ${grid.crit} + 距離ボーナス ${grid.distance}）の` +
      `${arGridValues(grid).length} 通りの、1 ヒットごとに四捨五入した値の和で、差 ${tol} 以内で読んだ。前のフレームも読めた増分は 1 ヒット、` +
      `読めなかった後の増分は（読めなかったフレーム数 ÷ ${interval} の切り上げ）ヒットまで。1 つの増分のヒットは同じ距離ボーナス・同じ胴体。` +
      `ヒットの数・コアの数が一通りに決まらない増分（${t.ambiguous}）と格子に乗らない増分（${t.unfit}）は落とした（増分 ${rows.length} 個）。` +
      `区間の切れ目（ジャンプの前の最後の増分）は ${cuts.map((c) => `f${c}`).join('・')}（${given.length > 0 ? '--opt cuts' : 'arCuts'}）。` +
      `区間ごとのコア / ヒットは ${s.map((c) => `${c.cores} / ${c.hits}`).join('・')}、距離ボーナスの乗ったヒットは ${distNote}、` +
      `会心の割合は ${s.map((c) => (c.hits > 0 ? roundTo(c.crits / c.hits, 3) : 0)).join('・')}。攻撃力▲の段ごとのヒットは ${t.atkHits.join('・')}（全部 ${allHits}）`;
    const table = arTable();
    const far = { hits: s[2]!.hits + s[5]!.hits, cores: s[2]!.cores + s[5]!.cores };
    const midFarMags = t.magazines.filter((m) => m.segment === 3 && m.complete);
    const mfHits = midFarMags.reduce((a, m) => a + m.hits, 0);
    const mfShots = midFarMags.length * mag;
    const out: RecipeObservation[] = [
      observation(
        this,
        'rate',
        s.map((c) => (c.hits > 0 ? roundTo(c.cores / c.hits, 4) : 0)),
        `${who}（AR）単騎の、的のジャンプで分けた区間（中近 → 近 → 遠 → 中遠 → 近 → 短い遠）ごとのコア命中率（コアのヒット ÷ 当たったヒット。区間の頭を除かない全部のヒット）`,
        gridNote,
      ),
      observation(
        this,
        'count',
        [...s.map((c) => c.cores), ...s.map((c) => c.hits)],
        `${who}（AR）単騎の、区間ごとのコアのヒットの数（6 つ）と当たったヒットの数（6 つ）。区間は中近 → 近 → 遠 → 中遠 → 近 → 短い遠`,
        gridNote,
        { unit: 'ヒット' },
      ),
    ];
    if (far.hits > 0) {
      out.push({
        ...observation(
          this,
          'rate',
          roundTo(far.cores / far.hits, 4),
          `${who}（AR）単騎の遠のコア命中率（遠の 2 区間を合わせた、コア ${far.cores} ÷ 当たったヒット ${far.hits}。区間の頭を除かない全部のヒット）。表（range-bigarms の AR）と比べる。幅は表の値の 2 項分布の 2σ`,
          `同じ録画の区間ごとのコア命中率と同じ読み。遠は 3 区間目（f${segFrames[2]! + 1}〜${segFrames[3]}）と 6 区間目（f${segFrames[5]! + 1}〜${segFrames[6]}）`,
          { use: 'compare', unit: '割合' },
        ),
        scope: { slot: 1, source: 'normal', frames: [segFrames[2]! + 1, segFrames[6]!] },
        compare: {
          model: 'sim',
          metric: 'coreHitRate',
          args: { slot: 1, frame: 5500 },
          tolerance: { abs: twoSigma(table.core.far, far.hits) },
          setup: SETUP,
        },
      });
    }
    if (mfShots > 0) {
      out.push({
        ...observation(
          this,
          'rate',
          roundTo(mfHits / mfShots, 4),
          `${who}（AR）単騎の中遠の完全なマガジンの弾丸命中率 = 当たったヒット ${mfHits} ÷ 撃った数 ${mfShots}（${midFarMags.length} 本 × ${mag}）。表と比べる。幅は表の値の 2 項分布の 2σ`,
          `同じ録画の区間ごとのコア命中率と同じ分け方。完全なマガジンは、増分の間が 40f 以上空いた所で切った連射のうち、区間の最初と最後（ジャンプに接する）・` +
            `落とした増分を含む・区間をまたぐ・長さが満タン（${(mag - 1) * interval}f）の 93% に届かないものを除いたもの。` +
            `マガジンごとの当たった数は ${midFarMags.map((m) => `${m.hits}（f${m.start}〜）`).join('・')}`,
          { use: 'compare', unit: '割合' },
        ),
        scope: { slot: 1, source: 'normal', frames: [segFrames[3]! + 1, segFrames[4]!] },
        compare: {
          model: 'sim',
          metric: 'bulletHitRate',
          args: { slot: 1, frame: 7800 },
          tolerance: { abs: twoSigma(table.bullet.midFar, mfShots) },
          setup: SETUP,
        },
      });
    }
    const midFarAll = t.magazines.filter((m) => m.segment === 3);
    out.push(
      observation(
        this,
        'count',
        midFarAll.map((m) => m.hits),
        `${who}（AR）単騎の中遠（4 区間目）の、連射のまとまり（マガジン）ごとの当たったヒットの数（完全でないものを含む。順に始まりのフレーム ${midFarAll.map((m) => `f${m.start}`).join('・')}）`,
        `完全なマガジン（中遠の弾丸命中率に使ったもの）は ${
          midFarAll
            .filter((m) => m.complete)
            .map((m) => `f${m.start}`)
            .join('・') || 'なし'
        }。` + 'まとまりの切り方と完全の決め方は、同じ録画の中遠の弾丸命中率と同じ',
        { unit: 'ヒット' },
      ),
    );
    return out;
  },
};
