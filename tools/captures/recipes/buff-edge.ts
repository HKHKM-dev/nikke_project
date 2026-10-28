// レシピ buff-edge: 事象（II の発動など）の前後で、味方の 1 発の HUD の増分を「▲の無い格子」と「▲の乗った格子」に当て、
// ▲の無い最後の発と▲の乗った最初の発で、▲の付き始め（か切れ目）を挟む（plan/design-buff-edge-recipe.md）。
// V-0368・V-0378・V-0389 で使い捨てのスクリプトにしていた当て方をレシピにしたもの。
//
// - 格子はモデルの 1 発の値: 録画の編成と setup で sim を回し、--opt off・on のモデルのフレームの区間で、指標 hitDamage を
//   コア × 会心 × 距離の 8 通り出す（フルバースト補正はその区間のもの）。--opt scale の倍率（モデルに無い状態）の版も足す。
// - 増分が片方の格子だけに合えば▲なし・▲あり、両方に合えば区別できない、どちらにも合わなければ外れ（ほかの枠の発など）。
// - 時刻は増分の読みのフレームから事象のフレームを引いた動画のフレーム（止まりの換算はしない。--opt from・to で跨がない）。
// - off・on を省くと、枠の区間の一覧を出して止まる（格子のフレームを選ぶため）。
// - 版 2: 何人かの格子（--opt grid）に当て、増分ごとに誰のどの格子かを出す。境は --opt pair の 2 つの格子で挟む
//   （V-0489・V-0508・V-0513〜V-0517・V-0523 で使い捨てのスクリプトにしていた当て方。plan/design-buff-edge-recipe.md 8 節）。
//   SG はペレットの値の和に当てる（格子の /x<ペレット数>）。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRecordingsFile, loadRecordsData } from '../../../packages/core/scripts/records-data.ts';
import {
  buildTeamInput,
  METRICS,
  type CompareSetup,
  type Observation,
} from '../../../packages/core/src/records/observations.ts';
import { V_ID } from '../../../packages/core/src/records/ids.ts';
import type { PredictionFile } from '../../../packages/core/src/records/predictions.ts';
import type { RecordingEntry } from '../../../packages/core/src/records/recordings.ts';
import { runSimulation } from '../../../packages/core/src/sim/engine.ts';
import { loadHudJumps } from './hud-jumps.ts';
import type { HudRow } from './triggers.ts';
import { observation, roundTo, type Recipe, type RecipeContext, type RecipeObservation } from './types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type Edge = 'start' | 'end';
export type ShotClass = 'absent' | 'present' | 'both' | 'none';

/** 増分を▲の無い格子（off）と▲の乗った格子（on）に当てる */
export function classify(increment: number, off: readonly number[], on: readonly number[], tol: number): ShotClass {
  const a = off.some((v) => Math.abs(v - increment) <= tol);
  const p = on.some((v) => Math.abs(v - increment) <= tol);
  return a && p ? 'both' : a ? 'absent' : p ? 'present' : 'none';
}

/** 境を挟むときの役。before は境の前の役（付き始めなら▲なし）、after は後の役。both は両方か、ほかの格子にも合う */
export type Role = 'before' | 'after' | 'both' | 'none';

/** 増分が合う格子の名前（格子の並びの順） */
export function matchGrids(increment: number, grids: readonly Pick<Grid, 'name' | 'values'>[], tol: number): string[] {
  return grids.filter((g) => g.values.some((v) => Math.abs(v - increment) <= tol)).map((g) => g.name);
}

/**
 * 合った格子の名前から役を決める。前の組（か後の組）の格子だけに合えばその役、両方の組やほかの格子にも合えば区別できない、
 * どちらの組にも合わなければ外れ
 */
export function roleOf(names: readonly string[], before: readonly string[], after: readonly string[]): Role {
  const b = names.filter((n) => before.includes(n)).length;
  const a = names.filter((n) => after.includes(n)).length;
  if (b === 0 && a === 0) return 'none';
  if (a === 0 && b === names.length) return 'before';
  if (b === 0 && a === names.length) return 'after';
  return 'both';
}

export type EdgeShot = { offset: number; frame: number; increment: number; role: Role };

export type EventEdge = {
  event: number;
  shots: EdgeShot[];
  /**
   * 境の前の役の最後の発（start: ▲の無い最後の発。end: ▲の乗った最後の発）。after があれば、それより前のものだけ
   */
  before?: number;
  /** 境の後の役の最初の発（start: ▲の乗った最初の発。end: ▲の無い最初の発） */
  after?: number;
  /** after より後に出た、前の役の発の時刻（食い違い） */
  conflicts: number[];
};

/** 事象 1 つの境。from・to は事象からの動画のフレームの範囲（両端を含む） */
export function edgeOf(
  rows: readonly Pick<HudRow, 'frame' | 'increment'>[],
  event: number,
  g: { off: readonly number[]; on: readonly number[]; tol: number; from: number; to: number; edge: Edge },
): EventEdge {
  const roles: Record<ShotClass, Role> =
    g.edge === 'start'
      ? { absent: 'before', present: 'after', both: 'both', none: 'none' }
      : { absent: 'after', present: 'before', both: 'both', none: 'none' };
  return edgeBy(rows, event, { role: (inc) => roles[classify(inc, g.off, g.on, g.tol)], from: g.from, to: g.to });
}

/** 事象 1 つの境（役は増分ごとに role で決める） */
export function edgeBy(
  rows: readonly Pick<HudRow, 'frame' | 'increment'>[],
  event: number,
  g: { role: (increment: number) => Role; from: number; to: number },
): EventEdge {
  const shots: EdgeShot[] = [];
  for (const r of rows) {
    const offset = r.frame - event;
    if (offset < g.from || offset > g.to) continue;
    shots.push({ offset, frame: r.frame, increment: r.increment, role: g.role(r.increment) });
  }
  const after = shots.find((s) => s.role === 'after')?.offset;
  const befores = shots.filter((s) => s.role === 'before').map((s) => s.offset);
  const before = befores.filter((o) => after === undefined || o < after).at(-1);
  const conflicts = after === undefined ? [] : befores.filter((o) => o > after);
  return {
    event,
    shots,
    ...(before === undefined ? {} : { before }),
    ...(after === undefined ? {} : { after }),
    conflicts,
  };
}

/** 境の幅（before + 1 〜 after）。片側が無ければ undefined */
export function rangeOf(e: Pick<EventEdge, 'before' | 'after'>): { low: number; high: number } | undefined {
  return e.before === undefined || e.after === undefined ? undefined : { low: e.before + 1, high: e.after };
}

/**
 * 全回の共通部分。下端は前の役の発の最も遅いもの + 1、上端は後の役の発の最も早いもの（片側だけの回も、その側で狭める）。
 * 片側がどの回にも無いか、空なら undefined
 */
export function commonRange(
  edges: readonly Pick<EventEdge, 'before' | 'after'>[],
): { low: number; high: number } | undefined {
  const befores = edges.flatMap((e) => (e.before === undefined ? [] : [e.before]));
  const afters = edges.flatMap((e) => (e.after === undefined ? [] : [e.after]));
  if (befores.length === 0 || afters.length === 0) return undefined;
  const low = Math.max(...befores) + 1;
  const high = Math.min(...afters);
  return low <= high ? { low, high } : undefined;
}

/** 格子に倍率の版を足す（1 は元の値） */
export function withScales(values: readonly number[], scales: readonly number[]): number[] {
  return [1, ...scales].flatMap((s) => values.map((v) => v * s));
}

function parseNumbers(text: string | undefined, key: string): number[] {
  if (text === undefined || text === '') return [];
  return text.split(',').map((s) => {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`--opt ${key} の値が数でない: ${s}`);
    return n;
  });
}

function loadObservation(id: string): Observation {
  const rec = id.replace(/-\d+$/, '');
  const path = `${ROOT}records/observations/${rec}.json`;
  const o = existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8')) as Observation[]).find((x) => x.id === id)
    : undefined;
  if (o === undefined) throw new Error(`観測値 ${id} が無い`);
  return o;
}

/** 事象の時刻: 数の列か、値が数の列の観測値の ID */
export function parseEvents(text: string | undefined): number[] {
  if (text === undefined || text === '') throw new Error('--opt events=<f,f,...|観測値の ID> が要る');
  if (/^\d+-\d+$/.test(text)) {
    const v = loadObservation(text).value;
    if (!Array.isArray(v)) throw new Error(`観測値 ${text} の値が数の列でない`);
    return v;
  }
  return parseNumbers(text, 'events');
}

function loadPrediction(id: string): PredictionFile {
  const path = `${ROOT}records/predictions/${id}.json`;
  if (!existsSync(path)) throw new Error(`records/predictions/${id}.json が無い`);
  return JSON.parse(readFileSync(path, 'utf8')) as PredictionFile;
}

/** モデルを回す条件: 観測値の ID（compare の setup）、V-NNNN:<指標 id>、省略なら --source の予測ファイルの最初の指標 */
function resolveSetup(text: string | undefined, source: string): CompareSetup {
  if (text !== undefined && /^\d+-\d+$/.test(text)) {
    const c = loadObservation(text).compare;
    if (c === undefined) throw new Error(`観測値 ${text} に compare が無い`);
    return c.setup;
  }
  const [v, target] = (text ?? source).split(':');
  if (!v || !V_ID.test(v)) throw new Error('--opt setup=<観測値の ID|V-NNNN:<指標 id>> が要る');
  const file = loadPrediction(v);
  const t = target === undefined ? file.targets[0] : file.targets.find((x) => x.id === target);
  if (t === undefined) throw new Error(`予測 ${v} に指標 ${target ?? '（最初）'} が無い`);
  return t.setup;
}

/** モデルの 1 ヒットの値（コア × 会心 × 距離） */
export type Cell = { core: boolean; crit: boolean; distance: boolean; value: number };

type Model = { cells: (slot: number, frame: number) => Cell[]; segments: (slot: number) => string[] };

function model(recording: RecordingEntry, setup: CompareSetup): Model {
  const data = loadRecordsData(loadRecordingsFile());
  const input = buildTeamInput(recording, setup, data);
  const sim = runSimulation(input);
  const hit = (slot: number, frame: number, core: boolean, crit: boolean, distance: boolean) =>
    METRICS.hitDamage!.sim(sim, { args: { slot, frame, core, crit, distance }, input }) as number;
  return {
    cells(slot, frame) {
      const out: Cell[] = [];
      for (const core of [false, true])
        for (const crit of [false, true])
          for (const distance of [false, true])
            out.push({ core, crit, distance, value: hit(slot, frame, core, crit, distance) });
      return out;
    },
    segments(slot) {
      const s = sim.slots[slot - 1];
      if (s === undefined || s === null) throw new Error(`枠 ${slot} が無い`);
      return s.segments.map((seg) => {
        let values = '（値なし）';
        try {
          values = `胴体 ${hit(slot, seg.start, false, false, false).toFixed(2)}・会心 ${hit(slot, seg.start, false, true, false).toFixed(2)}`;
        } catch {
          // 撃たない区間（命中率 0）
        }
        return `f${seg.start}〜${seg.end}  フルバースト補正 ${seg.trigger.boost.fullBurst}  ${values}`;
      });
    },
  };
}

const distinct = (values: readonly number[]) => [...new Set(values)];

/** 格子の指定（--opt grid の 1 つ）。<名前>=<枠>@<f>[+<f>...][/x<ペレット数>][/*<倍率>[,<倍率>...]] */
export type GridSpec = { name: string; slot: number; frames: number[]; pellets: number; scales: number[] };

export function parseGrids(text: string): GridSpec[] {
  const specs = text
    .split(';')
    .map((t) => t.trim())
    .filter((t) => t !== '')
    .map((t) => {
      const m = /^([^=]+)=(\d+)@(\d+(?:\+\d+)*)((?:\/[x*][\d.,]+)*)$/.exec(t);
      if (m === null)
        throw new Error(`--opt grid の形が違う（<名前>=<枠>@<f>[+<f>...][/x<ペレット数>][/*<倍率>]）: ${t}`);
      const parts = m[4]!.split('/').filter((x) => x !== '');
      const [pellets, ...morePellets] = parts.filter((x) => x.startsWith('x'));
      if (morePellets.length > 0) throw new Error(`--opt grid のペレット数が 2 つある: ${t}`);
      const scales = parts.filter((x) => x.startsWith('*')).flatMap((x) => parseNumbers(x.slice(1), 'grid の倍率'));
      return {
        name: m[1]!.trim(),
        slot: Number(m[2]),
        frames: m[3]!.split('+').map(Number),
        pellets: pellets === undefined ? 1 : Number(pellets.slice(1)),
        scales,
      };
    });
  const names = specs.map((g) => g.name);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup !== undefined) throw new Error(`--opt grid の名前が重なる: ${dup}`);
  for (const g of specs) {
    if (!Number.isInteger(g.pellets) || g.pellets < 1) throw new Error(`--opt grid のペレット数が違う: ${g.name}`);
  }
  return specs;
}

/**
 * ペレットの値の和（1 発のペレットは同じ距離ボーナス。1 ペレットごとに四捨五入して足す）。
 * cells の距離ごとに、コア × 会心の 4 通りから 1〜pellets 個を選ぶ組の和
 */
export function pelletSums(cells: readonly Cell[], pellets: number): number[] {
  const out = new Set<number>();
  for (const distance of [false, true]) {
    const values = distinct(cells.filter((c) => c.distance === distance).map((c) => Math.round(c.value)));
    const walk = (from: number, left: number, sum: number) => {
      if (sum > 0) out.add(sum);
      if (left === 0) return;
      for (let i = from; i < values.length; i++) walk(i, left - 1, sum + values[i]!);
    };
    walk(0, pellets, 0);
  }
  return [...out].sort((a, b) => a - b);
}

/** 格子の値（倍率の版を含む） */
export type Grid = GridSpec & { values: number[]; base: number[] };

export function gridOf(spec: GridSpec, cellsAt: (slot: number, frame: number) => Cell[]): Grid {
  const cells = spec.frames.flatMap((f) => cellsAt(spec.slot, f));
  const base = spec.pellets === 1 ? distinct(cells.map((c) => c.value)) : pelletSums(cells, spec.pellets);
  return { ...spec, base, values: withScales(base, spec.scales) };
}

const fmt = (n: number) => roundTo(n, 2).toLocaleString('en-US');

/** --opt pair（<前の格子>[,...]><後の格子>[,...]）。無ければ undefined */
export function parsePair(
  text: string | undefined,
  grids: readonly Pick<Grid, 'name'>[],
): { before: string[]; after: string[] } | undefined {
  if (text === undefined || text === '') return undefined;
  const sides = text.split('>').map((side) =>
    side
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x !== ''),
  );
  const [before, after] = sides;
  if (sides.length !== 2 || before!.length === 0 || after!.length === 0) {
    throw new Error(`--opt pair=<前の格子>[,...]><後の格子>[,...] の形が違う: ${text}`);
  }
  for (const n of [...before!, ...after!]) {
    if (!grids.some((g) => g.name === n)) throw new Error(`--opt pair の名前が --opt grid に無い: ${n}`);
    if (before!.includes(n) && after!.includes(n)) throw new Error(`--opt pair の両側に同じ格子がある: ${n}`);
  }
  return { before: before!, after: after! };
}

type EdgeOutput = {
  /** 観測値の説明の主語と述語（「▲が サン の 1 発に付く」） */
  subject: string;
  beforeJa: string;
  afterJa: string;
  note: string;
};

/** 事象ごとの境と全回の共通部分を観測値にする（版 1 の形） */
function edgeObservations(
  recipe: Recipe,
  edges: readonly EventEdge[],
  events: readonly number[],
  o: EdgeOutput,
): RecipeObservation[] {
  const out: RecipeObservation[] = [];
  edges.forEach((e, i) => {
    const r = rangeOf(e);
    if (r === undefined) return;
    out.push(
      observation(
        recipe,
        'timing',
        (r.low + r.high) / 2,
        `${o.subject}までの時刻の幅（${i + 1} 番目の事象 f${e.event} から数えた動画のフレーム）。` +
          `${o.beforeJa}は ${e.before}f、${o.afterJa}は ${e.after}f（値は幅の真ん中）`,
        o.note,
        { unit: 'f', spread: { kind: 'range', ...r } },
      ),
    );
  });
  const common = commonRange(edges);
  if (common === undefined) {
    process.exitCode = 2;
    return out;
  }
  const lastBefore = Math.max(...edges.flatMap((e) => (e.before === undefined ? [] : [e.before])));
  const firstAfter = Math.min(...edges.flatMap((e) => (e.after === undefined ? [] : [e.after])));
  out.push(
    observation(
      recipe,
      'timing',
      (common.low + common.high) / 2,
      `${o.subject}までの時刻の幅の、${events.length} 回の事象（f${events.join('・')}）の共通部分（事象から数えた動画のフレーム）。` +
        `${o.beforeJa}の最も遅いものは ${lastBefore}f、${o.afterJa}の最も早いものは ${firstAfter}f（値は幅の真ん中）`,
      o.note,
      { unit: 'f', spread: { kind: 'range', ...common } },
    ),
  );
  return out;
}

export const buffEdge: Recipe = {
  name: 'buff-edge',
  version: 2,
  describe:
    '味方の 1 発の HUD の増分をモデルの 1 ヒットの格子に当てる。事象（II の発動など）の前後で、▲の無い最後の発と▲の乗った最初の発で付き始め（か切れ目）を挟んだ幅（事象ごとと全回の共通部分。timing）。' +
    '--opt grid で何人かの格子に当て、増分ごとに合う格子を出す（--opt pair で境を挟む）',
  options: {
    slot: '値を当てる枠（1 始まり。grid を使わないとき）',
    off: '▲の無い格子を取るモデルのフレーム（カンマ区切り）。省くと枠の区間の一覧を出して止まる',
    on: '▲の乗った格子を取るモデルのフレーム（カンマ区切り）',
    grid: '格子の並び（; 区切り）: <名前>=<枠>@<モデルのフレーム>[+<f>...][/x<ペレット数>][/*<倍率>]。例 サン=2@1300;サン▲=2@380;ナガ=1@1300/x10。slot・off・on の代わり',
    pair: '境を挟む格子の組: <前の格子>[,...]><後の格子>[,...]（付き始めなら ▲なし>▲あり、切れ目なら ▲あり>▲なし。何人かの発で挟むなら , で並べる）。省くと増分ごとの当て方だけを出す',
    segments: '区間の一覧を出して止まる枠（カンマ区切り。grid のフレームを選ぶため）',
    events: '事象の時刻（動画のフレーム）をカンマ区切りで、か値が数の列の観測値の ID（burst-panel の出力など）',
    from: '事象からの範囲の始め（動画のフレーム。既定 -60）',
    to: '事象からの範囲の終わり（既定 60。フルバーストの入りの止まりを跨がない）',
    tol: '格子の値との差の許し（既定 1.5）',
    scale: 'モデルに無い状態の倍率（カンマ区切り。両方の格子に × 倍率の版を足す。結論の ID を検証記録に書く）',
    edge: 'start（既定。付き始め）か end（切れ目）。grid を使わないとき',
    setup:
      'モデルを回す条件: compare を持つ観測値の ID か V-NNNN:<指標 id>（省くと --source の予測ファイルの最初の指標）',
    what: '観測値の説明に書く▲の名前（既定「▲」）',
  },
  async run(ctx) {
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const tol = num('tol', 1.5);
    const from = num('from', -60);
    const to = num('to', 60);
    const what = ctx.options.what ?? '▲';
    const setup = resolveSetup(ctx.options.setup, ctx.source);
    const m = model(ctx.recording, setup);
    const nameOf = (slot: number) => ctx.recording.team.find((t) => t.slot === slot)?.name ?? `枠 ${slot}`;
    if (ctx.options.segments !== undefined) {
      for (const slot of parseNumbers(ctx.options.segments, 'segments')) {
        ctx.log(`枠 ${slot}（${nameOf(slot)}）の区間（モデルのフレーム。setup ${JSON.stringify(setup)}）:`);
        for (const line of m.segments(slot)) ctx.log(`  ${line}`);
      }
      return [];
    }
    if (ctx.options.grid !== undefined) return runGrids(this, ctx, m, { setup, tol, from, to, what, nameOf });

    const slot = Number(ctx.options.slot);
    if (!Number.isInteger(slot) || slot < 1) throw new Error('--opt slot=<枠> か --opt grid が要る');
    const edge = (ctx.options.edge ?? 'start') as Edge;
    if (edge !== 'start' && edge !== 'end') throw new Error('--opt edge は start か end');
    const offFrames = parseNumbers(ctx.options.off, 'off');
    const onFrames = parseNumbers(ctx.options.on, 'on');
    if (offFrames.length === 0 || onFrames.length === 0) {
      ctx.log(`枠 ${slot} の区間（モデルのフレーム。setup ${JSON.stringify(setup)}）:`);
      for (const line of m.segments(slot)) ctx.log(`  ${line}`);
      ctx.log('--opt off・on に格子を取るフレームを書く');
      return [];
    }
    const scales = parseNumbers(ctx.options.scale, 'scale');
    const valuesAt = (f: number) => distinct(m.cells(slot, f).map((c) => c.value));
    const offBase = offFrames.flatMap(valuesAt);
    const onBase = onFrames.flatMap(valuesAt);
    const off = withScales(offBase, scales);
    const on = withScales(onBase, scales);
    const overlap = offBase.filter((v) => onBase.some((w) => Math.abs(v - w) <= tol));
    ctx.log(`▲なしの格子: ${offBase.map(fmt).join('・')}`);
    ctx.log(
      `▲ありの格子: ${onBase.map(fmt).join('・')}${scales.length > 0 ? `（× ${scales.join('・')} の版も）` : ''}`,
    );
    if (overlap.length > 0) ctx.log(`区別できない値（両方の格子にある）: ${overlap.map(fmt).join('・')}`);

    const rows = (await loadHudJumps(ctx)).rows;
    const events = parseEvents(ctx.options.events);
    const edges = events.map((e) => edgeOf(rows, e, { off, on, tol, from, to, edge }));
    const [beforeMark, afterMark] = edge === 'start' ? ['なし', 'あり'] : ['あり', 'なし'];
    const mark: Record<Role, string> = { before: beforeMark, after: afterMark, both: '不明', none: '外れ' };
    logEdges(ctx, edges, mark);

    const who = nameOf(slot);
    const [beforeJa, afterJa] =
      edge === 'start' ? ['▲の無い最後の発', '▲の乗った最初の発'] : ['▲の乗った最後の発', '▲の無い最初の発'];
    const verb = edge === 'start' ? '付く' : '切れる';
    const count = (c: Role) => edges.reduce((s, e) => s + e.shots.filter((x) => x.role === c).length, 0);
    const [absent, present] = edge === 'start' ? (['before', 'after'] as const) : (['after', 'before'] as const);
    const conflicts = edges.reduce((s, e) => s + e.conflicts.length, 0);
    const note =
      `${who}（枠 ${slot}）の増分を、モデル（setup ${JSON.stringify(setup)}）の hitDamage の格子に ±${tol} で当てた。` +
      `▲なしはモデルの f${offFrames.join('・')}（${offBase.map(fmt).join('・')}）、▲ありは f${onFrames.join('・')}（${onBase.map(fmt).join('・')}）` +
      `${scales.length > 0 ? `。どちらも × ${scales.join('・')}（モデルに無い状態）の版を足した` : ''}。` +
      `範囲は事象の ${from}〜${to}f。▲なし ${count(absent)}・▲あり ${count(present)}・区別できない ${count('both')}・外れ ${count('none')}` +
      `・食い違い（${afterJa}より後の${beforeJa.replace(/最後の発$/, '発')}） ${conflicts}`;
    const out = edgeObservations(this, edges, events, {
      subject: `${what}が ${who} の 1 発に${verb}`,
      beforeJa,
      afterJa,
      note,
    });
    if (commonRange(edges) === undefined) ctx.log('全回の共通部分が無い（片側の発が無いか、幅が重ならない）');
    return out;
  },
};

function logEdges(ctx: RecipeContext, edges: readonly EventEdge[], mark: Record<Role, string>): void {
  for (const e of edges) {
    ctx.log(
      `f${e.event}: 前 ${e.before ?? '—'} / 後 ${e.after ?? '—'}${e.conflicts.length > 0 ? ` 食い違い ${e.conflicts.join('・')}` : ''}`,
    );
    ctx.log(`  ${e.shots.map((s) => `${s.offset}:${s.increment}${mark[s.role]}`).join(' ')}`);
  }
}

/** 版 2: 何人かの格子に当てる */
async function runGrids(
  recipe: Recipe,
  ctx: RecipeContext,
  m: Model,
  o: {
    setup: CompareSetup;
    tol: number;
    from: number;
    to: number;
    what: string;
    nameOf: (slot: number) => string;
  },
): Promise<RecipeObservation[]> {
  const grids = parseGrids(ctx.options.grid!).map((spec) => gridOf(spec, m.cells));
  const describeGrid = (g: Grid) =>
    `${g.name}: 枠 ${g.slot}（${o.nameOf(g.slot)}）のモデルの f${g.frames.join('・')}` +
    `${g.pellets > 1 ? `のペレット ${g.pellets} 個までの和` : ''}${g.scales.length > 0 ? `（× ${g.scales.join('・')} の版も）` : ''}`;
  for (const g of grids) {
    ctx.log(`${describeGrid(g)}: ${g.pellets > 1 ? `${g.base.length} 通り` : g.base.map(fmt).join('・')}`);
  }
  for (const [i, g] of grids.entries()) {
    for (const h of grids.slice(i + 1)) {
      const both = g.values.filter((v) => h.values.some((w) => Math.abs(v - w) <= o.tol));
      if (both.length > 0)
        ctx.log(
          `区別できない値（${g.name}・${h.name}）: ${both.slice(0, 8).map(fmt).join('・')}${both.length > 8 ? ' …' : ''}`,
        );
    }
  }
  const rows = (await loadHudJumps(ctx)).rows;
  const labelOf = (inc: number) => matchGrids(inc, grids, o.tol);

  // 増分ごとの当て方（録画の全部）を derived に書き、格子ごとの数を出す
  const labelled = rows.map((r) => ({ frame: r.frame, increment: r.increment, names: labelOf(r.increment) }));
  mkdirSync(ctx.derivedDir, { recursive: true });
  const tsv = join(ctx.derivedDir, 'buff-edge-grid.tsv');
  writeFileSync(
    tsv,
    [
      'frame\tincrement\tgrids',
      ...labelled.map((r) => `${r.frame}\t${r.increment}\t${r.names.join('|') || '外れ'}`),
    ].join('\n') + '\n',
  );
  const counts = new Map<string, number>();
  for (const r of labelled) {
    const k =
      r.names.length === 0 ? '外れ' : r.names.length === 1 ? r.names[0]! : `区別できない（${r.names.join('・')}）`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  ctx.log(
    `増分 ${rows.length} 個の当て方: ${[...counts].map(([k, n]) => `${k} ${n}`).join('・')}（増分ごとは ${tsv}）`,
  );

  const pair = parsePair(ctx.options.pair, grids);
  if (pair === undefined && ctx.options.events === undefined) return [];
  const events = parseEvents(ctx.options.events);
  const role = (inc: number): Role => (pair === undefined ? 'none' : roleOf(labelOf(inc), pair.before, pair.after));
  const edges = events.map((e) => edgeBy(rows, e, { role, from: o.from, to: o.to }));
  if (pair === undefined) {
    // 境を挟まずに、事象の前後の増分の当て方を並べる
    for (const e of edges) {
      ctx.log(`f${e.event}:`);
      ctx.log(
        `  ${e.shots.map((s) => `${s.offset}:${s.increment}:${labelOf(s.increment).join('|') || '外れ'}`).join(' ')}`,
      );
    }
    return [];
  }
  const beforeName = pair.before.join('・');
  const afterName = pair.after.join('・');
  logEdges(ctx, edges, { before: `[${beforeName}]`, after: `[${afterName}]`, both: '[不明]', none: '[外れ]' });
  const count = (c: Role) => edges.reduce((s, e) => s + e.shots.filter((x) => x.role === c).length, 0);
  const conflicts = edges.reduce((s, e) => s + e.conflicts.length, 0);
  const beforeJa = `${beforeName}の最後の発`;
  const afterJa = `${afterName}の最初の発`;
  const note =
    `HUD の増分を、モデル（setup ${JSON.stringify(o.setup)}）の hitDamage の格子に ±${o.tol} で当てた。` +
    `格子は ${grids.map(describeGrid).join('、')}。` +
    `境は ${beforeName} → ${afterName}（両方の組やほかの格子にも合う増分は区別できないとして外す）。` +
    `範囲は事象の ${o.from}〜${o.to}f。${beforeName} ${count('before')}・${afterName} ${count('after')}・区別できない ${count('both')}・外れ ${count('none')}` +
    `・食い違い（${afterJa}より後の${beforeName}の発） ${conflicts}`;
  const slots = [...new Set(grids.filter((g) => [...pair.before, ...pair.after].includes(g.name)).map((g) => g.slot))];
  const who = slots.map(o.nameOf).join('・');
  const out = edgeObservations(recipe, edges, events, {
    subject: `${o.what}（${beforeName} → ${afterName}）が ${who} の 1 発で替わる`,
    beforeJa,
    afterJa,
    note,
  });
  if (commonRange(edges) === undefined) ctx.log('全回の共通部分が無い（片側の発が無いか、幅が重ならない）');
  return out;
}
