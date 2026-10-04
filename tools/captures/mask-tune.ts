// 的のマスクの取り方の候補を、SG の着弾点で比べる（V-0127。plan/design-bullet-hit-rate-frame-coverage.md 2 節 3）。
//   node tools/captures/mask-tune.ts <録画 id> [--top 15] [--maxFp 0.02]
//
// sg-dots.ts --dump が保存した撃つ前のコマの窓を、候補ごとに classifyRect（coverage.ts と同じ分け方）で分け直し、
// - 再現率: 数えた着弾点の画素のうち、マスクが的とした割合（照準の印・HUD・重なりで不明の点は数えない）
// - 誤検出率: 的が確かにいない所（照準の中心から SG の照準円の半径 + 40px より外で、findTarget の外接矩形を 25px 広げた外）の
//   画素のうち、マスクが的とした割合
// を出す。選び方（V-0127 の「予測」に固定）: 誤検出率 ≤ maxFp の候補のうち再現率が最大。差 0.01 未満なら処理の少ない方。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { TARGET, UNKNOWN, classifyRect, maskReticle, type CoverageConfig, type Window } from './coverage-lib.ts';
import { capturesDir } from './dirs.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    top: { type: 'string', default: '15' },
    maxFp: { type: 'string', default: '0.02' },
  },
});
const id = positionals[0];
if (!id) {
  console.error('usage: node tools/captures/mask-tune.ts <録画 id> [--top 15] [--maxFp 0.02]');
  process.exit(1);
}
const dir = join(capturesDir(), 'derived', id);
const index = JSON.parse(readFileSync(join(dir, 'sg-dots-dump.json'), 'utf8')) as {
  field: { y0: number; y1: number };
  entries: {
    section: string;
    rect: { x0: number; y0: number; w: number; h: number };
    aim: { x: number; y: number; type: 'ring' | 'cross'; size: number };
    disk: { r: number; edge: number };
    tintOut: { a: number; b: number }[];
    tintIn: { a: number; b: number }[];
    bbox: { x0: number; y0: number; x1: number; y1: number } | null;
    dots: { x: number; y: number; kind?: 'hit' | 'miss' }[];
    offset: number;
  }[];
};
const bin = readFileSync(join(dir, 'sg-dots-dump.bin'));
const base = JSON.parse(readFileSync(new URL('./coverage-config.json', import.meta.url), 'utf8')) as CoverageConfig;

type Params = { dark: number; closeTarget: number; openTarget: number; fillHoles: number };
const grid: Params[] = [];
for (const dark of [8, 10, 12, 15, 18, 22])
  for (const closeTarget of [0, 1, 2, 3])
    for (const openTarget of [0, 1])
      for (const fillHoles of [0, 150, 300, 600]) grid.push({ dark, closeTarget, openTarget, fillHoles });

type Count = { tp: number; fn: number; hidden: number; fp: number; neg: number };
const zero = (): Count => ({ tp: 0, fn: 0, hidden: 0, fp: 0, neg: 0 });
const sections = [...new Set(index.entries.map((e) => e.section.replace(/ \d 回目$/, '')))];
const results: { p: Params; all: Count; bySection: Record<string, Count> }[] = [];
for (const p of grid) {
  const cfg = { ...base, ...p };
  const all = zero();
  const bySection: Record<string, Count> = Object.fromEntries(sections.map((s) => [s, zero()]));
  for (const e of index.entries) {
    const { rect } = e;
    const n = rect.w * rect.h * 3;
    const frame = bin.subarray(e.offset, e.offset + n);
    const bg = bin.subarray(e.offset + n, e.offset + 2 * n);
    // 窓の座標に置き直す（戦場の外の行は後で不明にする）
    const local = (x: number, y: number) => ({ x: x - rect.x0, y: y - rect.y0 });
    const aim = local(e.aim.x, e.aim.y);
    const hud = [{ x0: aim.x - 112, x1: aim.x - 36, y0: aim.y - 28, y1: aim.y + 28 }];
    const disk = { x: aim.x, y: aim.y, r: e.disk.r, edge: e.disk.edge, tint: e.tintIn };
    const win: Window = classifyRect(
      frame,
      rect.w,
      bg,
      { y0: 0, y1: rect.h },
      e.tintOut,
      { x0: 0, y0: 0, w: rect.w, h: rect.h },
      cfg,
      hud,
      disk,
    );
    for (let j = 0; j < rect.h; j++) {
      const y = rect.y0 + j;
      if (y < index.field.y0 || y >= index.field.y1)
        for (let i = 0; i < rect.w; i++) win.labels[j * rect.w + i] = UNKNOWN;
    }
    maskReticle(win, aim, e.aim.type, e.aim.size);
    const c = bySection[e.section.replace(/ \d 回目$/, '')]!;
    // 再現率は当たりの点（白）だけで見る（kind の無い古い dump の点は、全部当たり）
    for (const d of e.dots.filter((d) => d.kind !== 'miss')) {
      const q = local(Math.round(d.x), Math.round(d.y));
      if (q.x < 0 || q.x >= rect.w || q.y < 0 || q.y >= rect.h) continue;
      const l = win.labels[q.y * rect.w + q.x];
      const key = l === TARGET ? 'tp' : l === UNKNOWN ? 'hidden' : 'fn';
      c[key] += 1;
      all[key] += 1;
    }
    if (e.bbox) {
      const bx0 = e.bbox.x0 - 25 - rect.x0;
      const bx1 = e.bbox.x1 + 25 - rect.x0;
      const by0 = e.bbox.y0 - 25 - rect.y0;
      const by1 = e.bbox.y1 + 25 - rect.y0;
      const rr = (e.disk.r + 40) ** 2;
      for (let j = 0; j < rect.h; j += 2)
        for (let i = 0; i < rect.w; i += 2) {
          if ((i - aim.x) ** 2 + (j - aim.y) ** 2 <= rr) continue;
          if (i >= bx0 && i <= bx1 && j >= by0 && j <= by1) continue;
          const l = win.labels[j * rect.w + i];
          if (l === UNKNOWN) continue;
          c.neg += 1;
          all.neg += 1;
          if (l === TARGET) {
            c.fp += 1;
            all.fp += 1;
          }
        }
    }
  }
  results.push({ p, all, bySection });
}

const recall = (c: Count): number => c.tp / Math.max(1, c.tp + c.fn);
const fpr = (c: Count): number => c.fp / Math.max(1, c.neg);
const effort = (p: Params): number => p.closeTarget * 1000 + p.fillHoles + p.openTarget;
const fmt = (r: { p: Params; all: Count }): string =>
  `dark ${r.p.dark}・close ${r.p.closeTarget}・open ${r.p.openTarget}・holes ${r.p.fillHoles}: ` +
  `再現率 ${recall(r.all).toFixed(3)}（${r.all.tp} / ${r.all.tp + r.all.fn}、不明 ${r.all.hidden}）・誤検出率 ${fpr(r.all).toFixed(4)}（${r.all.fp} / ${r.all.neg}）`;
const maxFp = Number(values.maxFp);
const ok = results.filter((r) => fpr(r.all) <= maxFp).sort((a, b) => recall(b.all) - recall(a.all));
console.log(`候補 ${results.length}・誤検出率 ≤ ${maxFp} のもの ${ok.length}`);
for (const r of ok.slice(0, Number(values.top))) console.log('  ' + fmt(r));
const best = ok[0];
if (best) {
  const close = ok.filter((r) => recall(best.all) - recall(r.all) < 0.01).sort((a, b) => effort(a.p) - effort(b.p));
  const chosen = close[0]!;
  console.log(`選んだもの（差 0.01 未満で処理の少ない方）: ${fmt(chosen)}`);
  for (const s of sections) {
    const c = chosen.bySection[s]!;
    const sBest = results
      .filter((r) => fpr(r.bySection[s]!) <= maxFp)
      .sort((a, b) => recall(b.bySection[s]!) - recall(a.bySection[s]!))[0];
    console.log(
      `  ${s}: 再現率 ${recall(c).toFixed(3)}（${c.tp} / ${c.tp + c.fn}、不明 ${c.hidden}）・誤検出率 ${fpr(c).toFixed(4)}` +
        (sBest
          ? `｜この区間だけで選ぶと dark ${sBest.p.dark}・close ${sBest.p.closeTarget}・open ${sBest.p.openTarget}・holes ${sBest.p.fillHoles}（再現率 ${recall(sBest.bySection[s]!).toFixed(3)}）`
          : ''),
    );
  }
}
const v1 = results.find(
  (r) =>
    r.p.dark === base.dark &&
    r.p.closeTarget === base.closeTarget &&
    r.p.openTarget === base.openTarget &&
    r.p.fillHoles === base.fillHoles,
);
if (v1) console.log(`いまの設定（版 ${base.version}）: ${fmt(v1)}`);
