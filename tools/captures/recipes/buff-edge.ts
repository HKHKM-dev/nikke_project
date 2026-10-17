// レシピ buff-edge: 事象（II の発動など）の前後で、味方の 1 発の HUD の増分を「▲の無い格子」と「▲の乗った格子」に当て、
// ▲の無い最後の発と▲の乗った最初の発で、▲の付き始め（か切れ目）を挟む（plan/design-buff-edge-recipe.md）。
// V-0368・V-0378・V-0389 で使い捨てのスクリプトにしていた当て方をレシピにしたもの。
//
// - 格子はモデルの 1 発の値: 録画の編成と setup で sim を回し、--opt off・on のモデルのフレームの区間で、指標 hitDamage を
//   コア × 会心 × 距離の 8 通り出す（フルバースト補正はその区間のもの）。--opt scale の倍率（モデルに無い状態）の版も足す。
// - 増分が片方の格子だけに合えば▲なし・▲あり、両方に合えば区別できない、どちらにも合わなければ外れ（ほかの枠の発など）。
// - 時刻は増分の読みのフレームから事象のフレームを引いた動画のフレーム（止まりの換算はしない。--opt from・to で跨がない）。
// - off・on を省くと、枠の区間の一覧を出して止まる（格子のフレームを選ぶため）。
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadRecordingsFile, loadRecordsData } from '../../../packages/core/scripts/records-data.ts';
import {
  buildTeamInput,
  METRICS,
  type CompareSetup,
  type Observation,
} from '../../../packages/core/src/records/observations.ts';
import type { PredictionFile } from '../../../packages/core/src/records/predictions.ts';
import type { RecordingEntry } from '../../../packages/core/src/records/recordings.ts';
import { runSimulation } from '../../../packages/core/src/sim/engine.ts';
import { loadHudJumps } from './hud-jumps.ts';
import type { HudRow } from './triggers.ts';
import { observation, roundTo, type Recipe, type RecipeObservation } from './types.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type Edge = 'start' | 'end';
export type ShotClass = 'absent' | 'present' | 'both' | 'none';

/** 増分を▲の無い格子（off）と▲の乗った格子（on）に当てる */
export function classify(increment: number, off: readonly number[], on: readonly number[], tol: number): ShotClass {
  const a = off.some((v) => Math.abs(v - increment) <= tol);
  const p = on.some((v) => Math.abs(v - increment) <= tol);
  return a && p ? 'both' : a ? 'absent' : p ? 'present' : 'none';
}

export type EdgeShot = { offset: number; frame: number; increment: number; cls: ShotClass };

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
  const shots: EdgeShot[] = [];
  for (const r of rows) {
    const offset = r.frame - event;
    if (offset < g.from || offset > g.to) continue;
    shots.push({ offset, frame: r.frame, increment: r.increment, cls: classify(r.increment, g.off, g.on, g.tol) });
  }
  const [beforeCls, afterCls]: ShotClass[] = g.edge === 'start' ? ['absent', 'present'] : ['present', 'absent'];
  const after = shots.find((s) => s.cls === afterCls)?.offset;
  const befores = shots.filter((s) => s.cls === beforeCls).map((s) => s.offset);
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
  if (!v || !/^V-\d{4,}$/.test(v)) throw new Error('--opt setup=<観測値の ID|V-NNNN:<指標 id>> が要る');
  const file = loadPrediction(v);
  const t = target === undefined ? file.targets[0] : file.targets.find((x) => x.id === target);
  if (t === undefined) throw new Error(`予測 ${v} に指標 ${target ?? '（最初）'} が無い`);
  return t.setup;
}

type Model = { values: (frame: number) => number[]; segments: () => string[] };

function model(recording: RecordingEntry, setup: CompareSetup, slot: number): Model {
  const data = loadRecordsData(loadRecordingsFile());
  const input = buildTeamInput(recording, setup, data);
  const sim = runSimulation(input);
  const hit = (frame: number, core: boolean, crit: boolean, distance: boolean) =>
    METRICS.hitDamage!.sim(sim, { args: { slot, frame, core, crit, distance }, input }) as number;
  return {
    values(frame) {
      const out: number[] = [];
      for (const core of [false, true])
        for (const crit of [false, true])
          for (const distance of [false, true]) out.push(hit(frame, core, crit, distance));
      return [...new Set(out)];
    },
    segments() {
      const s = sim.slots[slot - 1];
      if (s === undefined) throw new Error(`枠 ${slot} が無い`);
      return s.segments.map((seg) => {
        let values = '（値なし）';
        try {
          values = `胴体 ${hit(seg.start, false, false, false).toFixed(2)}・会心 ${hit(seg.start, false, true, false).toFixed(2)}`;
        } catch {
          // 撃たない区間（命中率 0）
        }
        return `f${seg.start}〜${seg.end}  フルバースト補正 ${seg.trigger.boost.fullBurst}  ${values}`;
      });
    },
  };
}

const fmt = (n: number) => roundTo(n, 2).toLocaleString('en-US');

export const buffEdge: Recipe = {
  name: 'buff-edge',
  version: 1,
  describe:
    '事象（II の発動など）の前後で、味方の 1 発の HUD の増分をモデルの▲の無い格子と▲の乗った格子に当て、▲の無い最後の発と▲の乗った最初の発で付き始め（か切れ目）を挟んだ幅（事象ごとと全回の共通部分。timing）',
  options: {
    slot: '値を当てる枠（1 始まり）',
    off: '▲の無い格子を取るモデルのフレーム（カンマ区切り）。省くと枠の区間の一覧を出して止まる',
    on: '▲の乗った格子を取るモデルのフレーム（カンマ区切り）',
    events: '事象の時刻（動画のフレーム）をカンマ区切りで、か値が数の列の観測値の ID',
    from: '事象からの範囲の始め（動画のフレーム。既定 -60）',
    to: '事象からの範囲の終わり（既定 60。フルバーストの入りの止まりを跨がない）',
    tol: '格子の値との差の許し（既定 1.5）',
    scale: 'モデルに無い状態の倍率（カンマ区切り。両方の格子に × 倍率の版を足す。結論の ID を検証記録に書く）',
    edge: 'start（既定。付き始め）か end（切れ目）',
    setup:
      'モデルを回す条件: compare を持つ観測値の ID か V-NNNN:<指標 id>（省くと --source の予測ファイルの最初の指標）',
    what: '観測値の説明に書く▲の名前（既定「▲」）',
  },
  async run(ctx) {
    const slot = Number(ctx.options.slot);
    if (!Number.isInteger(slot) || slot < 1) throw new Error('--opt slot=<枠> が要る');
    const edge = (ctx.options.edge ?? 'start') as Edge;
    if (edge !== 'start' && edge !== 'end') throw new Error('--opt edge は start か end');
    const setup = resolveSetup(ctx.options.setup, ctx.source);
    const m = model(ctx.recording, setup, slot);
    const offFrames = parseNumbers(ctx.options.off, 'off');
    const onFrames = parseNumbers(ctx.options.on, 'on');
    if (offFrames.length === 0 || onFrames.length === 0) {
      ctx.log(`枠 ${slot} の区間（モデルのフレーム。setup ${JSON.stringify(setup)}）:`);
      for (const line of m.segments()) ctx.log(`  ${line}`);
      ctx.log('--opt off・on に格子を取るフレームを書く');
      return [];
    }
    const scales = parseNumbers(ctx.options.scale, 'scale');
    const num = (k: string, d: number) => (ctx.options[k] === undefined ? d : Number(ctx.options[k]));
    const tol = num('tol', 1.5);
    const from = num('from', -60);
    const to = num('to', 60);
    const offBase = offFrames.flatMap((f) => m.values(f));
    const onBase = onFrames.flatMap((f) => m.values(f));
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
    const mark: Record<ShotClass, string> = { absent: 'なし', present: 'あり', both: '不明', none: '外れ' };
    for (const e of edges) {
      ctx.log(
        `f${e.event}: 前 ${e.before ?? '—'} / 後 ${e.after ?? '—'}${e.conflicts.length > 0 ? ` 食い違い ${e.conflicts.join('・')}` : ''}`,
      );
      ctx.log(`  ${e.shots.map((s) => `${s.offset}:${s.increment}${mark[s.cls]}`).join(' ')}`);
    }

    const what = ctx.options.what ?? '▲';
    const who = ctx.recording.team.find((t) => t.slot === slot)?.name ?? `枠 ${slot}`;
    const [beforeJa, afterJa] =
      edge === 'start' ? ['▲の無い最後の発', '▲の乗った最初の発'] : ['▲の乗った最後の発', '▲の無い最初の発'];
    const verb = edge === 'start' ? '付く' : '切れる';
    const count = (c: ShotClass) => edges.reduce((s, e) => s + e.shots.filter((x) => x.cls === c).length, 0);
    const conflicts = edges.reduce((s, e) => s + e.conflicts.length, 0);
    const note =
      `${who}（枠 ${slot}）の増分を、モデル（setup ${JSON.stringify(setup)}）の hitDamage の格子に ±${tol} で当てた。` +
      `▲なしはモデルの f${offFrames.join('・')}（${offBase.map(fmt).join('・')}）、▲ありは f${onFrames.join('・')}（${onBase.map(fmt).join('・')}）` +
      `${scales.length > 0 ? `。どちらも × ${scales.join('・')}（モデルに無い状態）の版を足した` : ''}。` +
      `範囲は事象の ${from}〜${to}f。▲なし ${count('absent')}・▲あり ${count('present')}・区別できない ${count('both')}・外れ ${count('none')}` +
      `・食い違い（${afterJa}より後の${beforeJa.replace(/最後の発$/, '発')}） ${conflicts}`;

    const out: RecipeObservation[] = [];
    edges.forEach((e, i) => {
      const r = rangeOf(e);
      if (r === undefined) return;
      out.push(
        observation(
          this,
          'timing',
          (r.low + r.high) / 2,
          `${what}が ${who} の 1 発に${verb}までの時刻の幅（${i + 1} 番目の事象 f${e.event} から数えた動画のフレーム）。` +
            `${beforeJa}は ${e.before}f、${afterJa}は ${e.after}f（値は幅の真ん中）`,
          note,
          { unit: 'f', spread: { kind: 'range', ...r } },
        ),
      );
    });
    const common = commonRange(edges);
    if (common === undefined) {
      ctx.log('全回の共通部分が無い（片側の発が無いか、幅が重ならない）');
      process.exitCode = 2;
    } else {
      const lastBefore = Math.max(...edges.flatMap((e) => (e.before === undefined ? [] : [e.before])));
      const firstAfter = Math.min(...edges.flatMap((e) => (e.after === undefined ? [] : [e.after])));
      out.push(
        observation(
          this,
          'timing',
          (common.low + common.high) / 2,
          `${what}が ${who} の 1 発に${verb}までの時刻の幅の、${events.length} 回の事象（f${events.join('・')}）の共通部分（事象から数えた動画のフレーム）。` +
            `${beforeJa}の最も遅いものは ${lastBefore}f、${afterJa}の最も早いものは ${firstAfter}f（値は幅の真ん中）`,
          note,
          { unit: 'f', spread: { kind: 'range', ...common } },
        ),
      );
    }
    return out;
  },
};
