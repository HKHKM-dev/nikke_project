// レシピ smg-mags: SMG 単騎・射撃場 3 分モードの、距離帯ごとの完全なマガジンの弾丸命中率（V-0200）。
// 総ダメージの増分（hud-jumps のキャッシュ）を smg-hits.ts でヒットの数に分け、照準の横の残弾（reticle-ammo.ts --mode series。
// キャッシュ reticle-ammo-series@1）で、1 つの増分に入るヒットの数を上から抑える。
// 区間の切れ目（ジャンプの前の最後の増分のフレーム）は、マガジンの切れ方と距離ボーナスの替わり目から決める（detectCuts。
// --opt cuts で与えてもよい）。区間の並びは 中近 → 近 → 遠 → 中遠 → 近 → 遠。
// 完全なマガジン = 前後をリロードの空きで区切られたマガジン（区間の最初と最後のまとまりは使わない）。撃った数は装弾数。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { derived } from './cache.ts';
import { loadHudJumps } from './hud-jumps.ts';
import {
  detectCuts,
  fixedSpecGrid,
  groupMagazines,
  parseAmmoSeries,
  segmentOf,
  singleHitDistance,
  splitHits,
  type AmmoRow,
  type DistanceMode,
  type SplitIncrement,
} from './smg-hits.ts';
import { observation, roundTo, type Recipe, type RecipeContext, type RecipeObservation } from './types.ts';

const AMMO_CACHE_KEY = 'reticle-ammo-series@1';
const BANDS = ['midNear', 'near', 'far', 'midFar', 'near', 'far'] as const;
const BAND_JA = { midNear: '中近', near: '近', far: '遠', midFar: '中遠' } as const;

function runAmmo(video: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const script = fileURLToPath(new URL('../reticle-ammo.ts', import.meta.url));
    const child = spawn(process.execPath, [script, video, '--mode', 'series'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (c: Buffer) => (out += c.toString()));
    child.stderr.on('data', (c: Buffer) => (err += c.toString()));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new Error(`reticle-ammo.ts が ${code} で終わった: ${err}`)),
    );
  });
}

async function loadAmmo(ctx: RecipeContext): Promise<AmmoRow[]> {
  const sha = 'sha256' in ctx.recording ? ctx.recording.sha256 : undefined;
  const text = await derived(ctx.derivedDir, AMMO_CACHE_KEY, ctx.video, sha, () => runAmmo(ctx.video), ctx.log);
  return parseAmmoSeries(text);
}

/** 残弾の読みで、マガジンが装弾数から撃ち始めて 0 まで撃ったか（最初と最後の 15f の読み） */
function ammoConfirms(ammo: readonly AmmoRow[], start: number, end: number, mag: number): boolean {
  const head = ammo.filter((a) => a.frame >= start - 15 && a.frame <= start + 15).map((a) => a.value);
  const tail = ammo.filter((a) => a.frame >= end - 15 && a.frame <= end + 15).map((a) => a.value);
  return head.length > 0 && tail.length > 0 && Math.max(...head) >= mag - 3 && Math.min(...tail) <= 3;
}

export const smgMags: Recipe = {
  name: 'smg-mags',
  version: 1,
  describe:
    'SMG 単騎・射撃場 3 分モードの、距離帯ごと（中近・近・遠・中遠）の完全なマガジンの弾丸命中率（rate）。中遠は着地点（A か B・C）を説明に書く',
  options: {
    body: '1 ヒットの胴体（距離ボーナスなし・非会心）。スペック固定 ON の格子（距離 0.3・会心 0.5・コア 1.0）で分ける',
    cuts: '区間の切れ目（ジャンプの前の最後の増分のフレーム）をカンマ区切りで（5 つ）。省けば smg-hits.ts の detectCuts で決める',
    mag: '装弾数（既定 120）',
  },
  async run(ctx) {
    const body = Number(ctx.options.body);
    if (!Number.isFinite(body) || body <= 0) throw new Error('--opt body=<胴体> が要る');
    const mag = ctx.options.mag === undefined ? 120 : Number(ctx.options.mag);
    const grid = fixedSpecGrid(body);
    const rows = (await loadHudJumps(ctx)).rows.map((r) => ({ ...r, readGap: r.readGap ?? 1 }));
    const ammo = await loadAmmo(ctx);
    const who = ctx.recording.team.map((m) => m.name).join('・');
    const spans = groupMagazines(rows)
      .map((g) => (g.at(-1)!.frame - g[0]!.frame) / (mag - 1))
      .filter((d) => d > 2.1 && d < 2.8)
      .sort((a, b) => a - b);
    const interval = spans.length > 0 ? spans[Math.floor(spans.length / 2)]! : 2.43;
    const given = (ctx.options.cuts ?? '')
      .split(',')
      .filter((x) => x !== '')
      .map(Number);
    if (given.some((c) => !Number.isInteger(c))) throw new Error('--opt cuts=<f>,<f>,... の形が違う');
    const cuts = given.length > 0 ? given : detectCuts(rows, grid, mag, interval);
    if (cuts.length !== 5) ctx.log(`区間の切れ目が ${cuts.length} 個（3 分モードは 5 個）: ${cuts.join(',')}`);

    // 中遠の距離ボーナス: 4 区間目の 1 ヒットの増分（前のフレームも読めたもの）の多いほう。両方 3 個以上なら混ざる
    let d1 = 0;
    let d0 = 0;
    for (const r of rows) {
      if (BANDS[segmentOf(r.frame, cuts)] !== 'midFar' || r.readGap !== 1) continue;
      const d = singleHitDistance(r.increment, grid);
      if (d === 1) d1++;
      if (d === 0) d0++;
    }
    const midFarMode: DistanceMode = d0 <= 2 ? 'all' : d1 <= 2 ? 'none' : 'mixed';
    const modeAt = (frame: number): DistanceMode => {
      const band = BANDS[segmentOf(frame, cuts)] ?? 'far';
      return band === 'far' ? 'none' : band === 'midFar' ? midFarMode : 'all';
    };
    const { increments, unfit } = splitHits(rows, grid, modeAt, ammo, interval);

    const bySegment = new Map<number, SplitIncrement[][]>();
    for (const g of groupMagazines(increments)) {
      const s = segmentOf(g[0]!.frame, cuts);
      bySegment.set(s, [...(bySegment.get(s) ?? []), g]);
    }
    const out: RecipeObservation[] = [];
    for (const band of ['midNear', 'near', 'midFar', 'far'] as const) {
      const segs = BANDS.flatMap((b, i) => (b === band ? [i] : []));
      const parts: string[] = [];
      let hits = 0;
      let n = 0;
      let amb = 0;
      let confirmed = 0;
      const bounds = { frame: 0, ammo: 0, interval: 0 };
      for (const s of segs) {
        const mags = (bySegment.get(s) ?? []).slice(1, -1);
        if (mags.length === 0) continue;
        const counts = mags.map((m) => m.reduce((a, x) => a + x.hits, 0));
        parts.push(`${s + 1} 区間目 ${counts.join('・')}`);
        for (const [i, m] of mags.entries()) {
          hits += counts[i]!;
          n += mag;
          amb += m.filter((x) => x.ambiguous).length;
          for (const x of m) if (x.candidates.length > 1) bounds[x.boundFrom]++;
          if (ammoConfirms(ammo, m[0]!.frame, m.at(-1)!.frame, mag)) confirmed++;
        }
      }
      if (n === 0) continue;
      const landing =
        band === 'midFar'
          ? `。着地点は ${midFarMode === 'none' ? 'B・C（35 以上）' : 'A（35 未満）'}（4 区間目の 1 ヒットの増分のうち距離ボーナスの付いたもの ${d1}、付かないもの ${d0}）`
          : '';
      out.push(
        observation(
          this,
          'rate',
          roundTo(hits / n, 4),
          `${who}（SMG）単騎の${BAND_JA[band]}（${segs.map((s) => s + 1).join('・')} 区間目）の完全なマガジンの弾丸命中率 = 当たった数 ${hits} ÷ 撃った数 ${n}（外れ ${n - hits}）。マガジンごとの当たった数は ${parts.join('、')}（各 ${mag} 発）${landing}`,
          `胴体 ${body} の格子。区間の切れ目は ${cuts.map((c) => `f${c}`).join('・')}（${given.length > 0 ? '--opt cuts' : 'detectCuts'}）。` +
            `ヒットの数の候補が 2 つ以上あった増分の上限の出どころ: 前のフレームも読めた ${bounds.frame}・残弾 ${bounds.ammo}・刻み（${roundTo(interval, 3)}f）からの見積もり ${bounds.interval}。` +
            `上限を当てても決まらなかった増分 ${amb}。残弾の読みで ${mag} → 0 を確かめたマガジン ${confirmed} / ${n / mag}。` +
            `次の増分と足しても格子に乗らず捨てた増分は録画全体で ${unfit.length}`,
        ),
      );
    }
    return out;
  },
};
