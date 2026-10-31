// fb-window-cores の観測値（着地点ごとの数）から、V-0492 の判定の指標 K・K_out と参考の R_B・R_A、σ を出す。
// 複数の録画にまたがる値なので、レシピ（1 本ずつ読む）の外に置く。観測値への書き込みは人がする（値と σ をそのまま写す）。
//   node tools/captures/fb-window-k.ts --a 0434,0435,0436 --b 0437,0438,0439 [--source V-0492] [--landings 中近,近A,近B]
// --a は▲ありの録画、--b は対照。各録画の records/observations/<録画>.json の、method.tool が recipe:fb-window-cores の
// 観測値（--source を付ければ、その検証記録のもの。invalid の付いたものは除く）の最後の 1 つを使う。--landings は K・K_out・R_B・R_A に使う着地点
// （省くと 6 つ全部。V-0542 は中近・近A・近B）。着地点ごとの数の表は、使わない着地点も出す。
import { parseArgs } from 'node:util';
import { countsFromValue, fbWindowK, type Estimate, type RecordingCounts } from './fb-window-k-lib.ts';
import { LANDINGS, type Landing } from './recipes/fb-window-cores.ts';
import { loadObservations } from './records-io.ts';

const { values } = parseArgs({
  options: { a: { type: 'string' }, b: { type: 'string' }, source: { type: 'string' }, landings: { type: 'string' } },
});
if (values.a === undefined || values.b === undefined) {
  console.error(
    'usage: node tools/captures/fb-window-k.ts --a <録画>,... --b <録画>,... [--source V-NNNN] [--landings <着地点>,...]',
  );
  process.exit(1);
}

function load(id: string): RecordingCounts & { obs: string } {
  const hits = loadObservations(id).filter(
    (o) =>
      o.invalid === undefined &&
      o.method?.tool?.startsWith('recipe:fb-window-cores@') === true &&
      (values.source === undefined || o.source === values.source),
  );
  const o = hits.at(-1);
  if (o === undefined || !Array.isArray(o.value)) throw new Error(`${id}: fb-window-cores の観測値が無い`);
  return { recording: id, counts: countsFromValue(o.value), obs: o.id };
}

const split = (s: string) => s.split(',').filter((x) => x !== '');
const isLanding = (l: string): l is Landing => (LANDINGS as readonly string[]).includes(l);
const landings: readonly Landing[] =
  values.landings === undefined
    ? LANDINGS
    : split(values.landings).map((l) => {
        if (!isLanding(l)) throw new Error(`着地点 ${l} は無い（${LANDINGS.join('・')}）`);
        return l;
      });
const a = split(values.a).map(load);
const b = split(values.b).map(load);
const r = fbWindowK(a, b, landings);
const f = (x: number) => x.toFixed(3);
const line = (name: string, e: Estimate) =>
  `${name}: ${f(e.value)}（σ ${f(e.sigma)}。jackknife ${f(e.jackknife)}・2 項分布 ${f(e.binomial)}。ci95 ${f(e.value - 1.96 * e.sigma)}〜${f(e.value + 1.96 * e.sigma)}。` +
  `使ったヒット ${e.hits}、対照の率が無くて除いたヒット ${e.dropped}）`;
console.log(`A: ${a.map((x) => x.obs).join('・')}`);
console.log(`B: ${b.map((x) => x.obs).join('・')}`);
console.log(`使う着地点: ${landings.join('・')}`);
console.log(line('K（A の窓の中 ÷ B の同じ着地点の窓の中）', r.k));
console.log(line('K_out（A の窓の外 ÷ B の同じ着地点の窓の外）', r.kOut));
console.log(line('R_B（参考。B の窓の中 ÷ B の窓の外）', r.rB));
console.log(line('R_A（参考。A の窓の中 ÷ A の窓の外）', r.rA));
const z = (x: number, h: number, s: number) => `${x - h >= 0 ? '+' : ''}${((x - h) / s).toFixed(1)}σ`;
console.log(
  `K の差: 1 から ${z(r.k.value, 1, r.k.sigma)}・H1（1.566）から ${z(r.k.value, 1.566, r.k.sigma)}・H2（1.287）から ${z(r.k.value, 1.287, r.k.sigma)}。` +
    `K_out の 1 から ${z(r.kOut.value, 1, r.kOut.sigma)}`,
);
console.log('着地点ごと（コア / ヒット。A の窓の中・B の窓の中・A の窓の外・B の窓の外）:');
for (const l of LANDINGS) {
  const sum = (rs: RecordingCounts[], k: 'inCores' | 'inHits' | 'outCores' | 'outHits') =>
    rs.reduce((s, x) => s + x.counts[l][k], 0);
  console.log(
    `  ${l}: ${sum(a, 'inCores')}/${sum(a, 'inHits')}・${sum(b, 'inCores')}/${sum(b, 'inHits')}・` +
      `${sum(a, 'outCores')}/${sum(a, 'outHits')}・${sum(b, 'outCores')}/${sum(b, 'outHits')}`,
  );
}
