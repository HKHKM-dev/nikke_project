// 予測（plan/design-records-automation.md 3.2 節）。検証記録ごとに records/predictions/V-NNNN.json を置き、
// 手書きの部分（編成・仮説・比べる指標）から `npm run records:predict -- V-NNNN` が sim を回して predicted を書き込む。
// records:check は、同じ検証記録を source にする観測値と突き合わせて、仮説ごとに合うかを plan/verifications.md に出す（3.5 節）。
// 予測は任意の道具で、確定の条件ではない。撮る前の順番も問わない（plan/design-investigation-review.md 1 節。2026-10-10 の
// オーナーの決定）。撮影計画で、その録画で仮説を見分けられるかを確かめるのに使う。
import { runSimulation, type SimResult } from '../sim/engine.ts';
import type { TeamInput } from '../team.ts';
import { V_ID } from './ids.ts';
import {
  buildTeamInput,
  compareValue,
  METRICS,
  type CompareSetup,
  type CompareSpec,
  type Observation,
  type RecordsData,
  type Tolerance,
} from './observations.ts';
import {
  validateRecordingBuild,
  type LegacyRecording,
  type RecordingBuild,
  type RecordingEntry,
  type RecordingMember,
} from './recordings.ts';

export type PredictionMember = {
  rid: number;
  /** 操作した枠なら true */
  controlled?: boolean;
  treasurePhase?: number;
  /** スペック固定 OFF の育成（撮る前に分かっている値。録画の素性の build と同じ形） */
  build?: RecordingBuild;
};

export type PredictionHypothesis = {
  /** 検証記録の予測の節と同じ名前（H1・H2 など） */
  id: string;
  note?: string;
  /** この仮説で上書きする予測の条件（setup の項目） */
  override?: Partial<CompareSetup>;
};

export type PredictionTarget = {
  /** 予測の中での名前（観測値と結び付けるときの手がかり） */
  id: string;
  model: CompareSpec['model'];
  metric: string;
  args?: CompareSpec['args'];
  setup: CompareSetup;
  note?: string;
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 4 節）: この指標だけ、ファイルの team の代わりに使う録画（台帳の編成・
   * スペック固定・育成で組む。jumpWindows・manualBursts などの観測値もその録画のものを引ける）。team と一緒には書かない
   */
  recording?: string;
  /** 同: この指標だけの編成（撮る前の編成。ファイルの team と同じ形）。fixedSpec を省略するとファイルの fixedSpec */
  team?: PredictionMember[];
  fixedSpec?: boolean;
  /** 結び付ける観測値の ID（省略すると、同じ検証記録を source にする観測値のうち metric・args・setup が同じもの） */
  observations?: string[];
  /**
   * 撮影計画の見分けの確かめに使う許容の幅（観測値の compare.tolerance と同じ形）。仮説どうしの予測の差がこの幅の中なら、
   * records:predict が「見分けられない」と出す（plan/design-investigation-review.md 2.1 節）
   */
  tolerance?: Tolerance;
};

export type Predicted = {
  /** 予測を出した日（YYYY-MM-DD） */
  at: string;
  /** 予測を出したときの commit */
  commit: string;
  /** 仮説 ID → 指標 ID → 値 */
  values: Record<string, Record<string, number | number[]>>;
  /**
   * 予測の時点の控え: 検証記録の「録画」に挙げた録画 → そのとき既にあった観測値の ID（plan/design-reread-prediction.md 5 節の B1）。
   * 2026-10-04〜10-10 の予測ファイルにだけある。2026-10-10 から書かず、読まない（plan/design-investigation-review.md 1.3 節）
   */
  seen?: Record<string, string[]>;
};

/** records/predictions/V-NNNN.json の中身 */
export type PredictionFile = {
  verification: string;
  /** 後から書いたときなどの注記 */
  note?: string;
  /** 枠順 */
  team: PredictionMember[];
  fixedSpec: boolean;
  hypotheses: PredictionHypothesis[];
  targets: PredictionTarget[];
  /**
   * 撮る前の入力の値（id → 値）。観測値の id を指す比べる指定の項目（manualBursts・jumpWindows など）は、撮る前には指す観測値が無いので、
   * 予定の値をここに置いて id で指す（V-0619 の手で撃つ予定のチェーンの時刻）。観測値の id と重ねない
   */
  values?: Record<string, number | number[]>;
  /** records:predict が書き込む。無ければまだ予測を出していない */
  predicted: Predicted | null;
};

/** 今日（手元の時刻。YYYY-MM-DD） */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 予測ファイルの検証。問題があれば 1 件 1 行 */
export function validatePredictions(
  files: readonly PredictionFile[],
  ctx: {
    verificationIds: ReadonlySet<string>;
    knownRids: ReadonlySet<number>;
    observations: readonly Observation[];
    /** 指標の recording を確かめる（省略なら確かめない） */
    recordingIds?: ReadonlySet<string>;
  },
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  const observationIds = new Set(ctx.observations.map((o) => o.id));
  for (const f of files) {
    const at = `予測 ${f.verification}`;
    if (!V_ID.test(f.verification)) errors.push(`${at}: verification は V-NNNN`);
    else if (!ctx.verificationIds.has(f.verification)) errors.push(`${at}: 検証記録が無い`);
    if (seen.has(f.verification)) errors.push(`${at}: 予測ファイルが重複している`);
    seen.add(f.verification);
    errors.push(...validateTeam(f.team, f.fixedSpec, at, ctx.knownRids));
    if (typeof f.fixedSpec !== 'boolean') errors.push(`${at}: fixedSpec は true か false`);
    if (f.hypotheses.length === 0) errors.push(`${at}: 仮説が 1 つ以上要る`);
    const hyp = new Set<string>();
    for (const h of f.hypotheses) {
      if (h.id.trim() === '' || hyp.has(h.id)) errors.push(`${at}: 仮説の id が空か重複している: ${h.id}`);
      hyp.add(h.id);
    }
    for (const [id, v] of Object.entries(f.values ?? {})) {
      if (observationIds.has(id)) errors.push(`${at}: values の id ${id} が観測値の id と重なる`);
      if (typeof v !== 'number' && !(Array.isArray(v) && v.every((x) => typeof x === 'number')))
        errors.push(`${at}: values の ${id} は数か数の配列`);
    }
    if (f.targets.length === 0) errors.push(`${at}: 比べる指標が 1 つ以上要る`);
    const tgt = new Set<string>();
    for (const t of f.targets) {
      if (t.id.trim() === '' || tgt.has(t.id)) errors.push(`${at}: 指標の id が空か重複している: ${t.id}`);
      tgt.add(t.id);
      const metric = METRICS[t.metric];
      if (metric === undefined) errors.push(`${at}: 指標 ${t.id} の metric ${t.metric} が語彙に無い`);
      else {
        // 一本化の段 A-3: calc の経路は消した（2026-10-27）
        if (t.model !== 'sim')
          errors.push(`${at}: 指標 ${t.id} の model は sim だけ（calc は 2026-10-27 の一本化で消した）`);
        for (const a of metric.args) {
          if (t.args?.[a] === undefined) errors.push(`${at}: 指標 ${t.id} に引数 ${a} が要る`);
        }
      }
      if (t.recording !== undefined) {
        if (t.team !== undefined || t.fixedSpec !== undefined)
          errors.push(`${at}: 指標 ${t.id} の recording は team・fixedSpec と一緒に書かない`);
        if (ctx.recordingIds !== undefined && !ctx.recordingIds.has(t.recording))
          errors.push(`${at}: 指標 ${t.id} の録画 ${t.recording} が無い`);
      }
      if (t.team !== undefined)
        errors.push(...validateTeam(t.team, t.fixedSpec ?? f.fixedSpec, `${at} 指標 ${t.id}`, ctx.knownRids));
      else if (t.fixedSpec !== undefined && t.recording === undefined)
        errors.push(`${at}: 指標 ${t.id} の fixedSpec は team と一緒に書く`);
      if (typeof t.setup?.enemy !== 'string') errors.push(`${at}: 指標 ${t.id} の setup.enemy が要る`);
      if (t.tolerance !== undefined) {
        const tol: unknown = t.tolerance;
        const ok =
          typeof tol === 'object' &&
          tol !== null &&
          Object.keys(tol).length === 1 &&
          (('rel' in tol && typeof tol.rel === 'number' && tol.rel >= 0) ||
            ('abs' in tol && typeof tol.abs === 'number' && tol.abs >= 0));
        if (!ok) errors.push(`${at}: 指標 ${t.id} の tolerance は { rel } か { abs }（0 以上の数）`);
      }
      for (const o of t.observations ?? []) {
        if (!observationIds.has(o)) errors.push(`${at}: 指標 ${t.id} の観測値 ${o} が無い`);
      }
    }
    if (f.predicted !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.predicted.at)) errors.push(`${at}: predicted.at は YYYY-MM-DD`);
      if (!/^[0-9a-f]{7,40}$/.test(f.predicted.commit)) errors.push(`${at}: predicted.commit は commit の hash`);
      for (const [h, values] of Object.entries(f.predicted.values)) {
        if (!hyp.has(h)) errors.push(`${at}: predicted に無い仮説 ${h} がある`);
        for (const t of Object.keys(values)) if (!tgt.has(t)) errors.push(`${at}: predicted に無い指標 ${t} がある`);
      }
      for (const h of hyp) {
        for (const t of tgt) {
          if (f.predicted.values[h]?.[t] === undefined)
            errors.push(`${at}: predicted に ${h} の ${t} が無い（records:predict で出し直す）`);
        }
      }
    }
  }
  return errors;
}

/** 編成の検証（ファイルの team と指標の team で共通） */
function validateTeam(
  team: readonly PredictionMember[],
  fixedSpec: boolean,
  at: string,
  knownRids: ReadonlySet<number>,
): string[] {
  const errors: string[] = [];
  if (team.length === 0 || team.length > 5) errors.push(`${at}: 編成は 1〜5 体`);
  for (const m of team) if (!knownRids.has(m.rid)) errors.push(`${at}: rid ${m.rid} のキャラのデータが無い`);
  team.forEach((m, i) => {
    if (m.build === undefined) return;
    if (fixedSpec === true) errors.push(`${at}: 育成（build）はスペック固定 OFF の予測にだけ書く`);
    errors.push(...validateRecordingBuild(m.build, `${at} 枠 ${i + 1}`));
  });
  if (team.filter((m) => m.controlled === true).length > 1) errors.push(`${at}: 操作した枠が 2 つ以上ある`);
  return errors;
}

/** 予測ファイルに出てくる rid（ファイルの team と指標の team。データの読み込みに使う） */
export function predictionRids(file: PredictionFile): number[] {
  return [...file.team, ...file.targets.flatMap((t) => t.team ?? [])].map((m) => m.rid);
}

/**
 * 撮影計画の見分けの確かめ（plan/design-investigation-review.md 2.1 節）: 許容の幅（tolerance）のある指標のうち、どの 2 つの仮説の
 * 予測の差もその幅の中のもの（その録画とその指標では仮説を見分けられない）。仮説が 1 つか、予測を出していなければ空
 */
export function indistinguishableTargets(file: PredictionFile): { target: string; hypotheses: string[] }[] {
  if (file.predicted === null || file.hypotheses.length < 2) return [];
  const out: { target: string; hypotheses: string[] }[] = [];
  for (const t of file.targets) {
    if (t.tolerance === undefined) continue;
    const values = file.hypotheses.map((h) => file.predicted!.values[h.id]?.[t.id]);
    if (values.some((v) => v === undefined)) continue;
    let close = true;
    for (let i = 0; i < values.length && close; i++)
      for (let j = i + 1; j < values.length && close; j++) close = compareValue(values[i]!, values[j]!, t.tolerance).ok;
    if (close) out.push({ target: t.id, hypotheses: file.hypotheses.map((h) => h.id) });
  }
  return out;
}

/** 予測の編成を、照合ランナーの入力の組み方（buildTeamInput）に渡せる形にする */
function asRecording(
  file: PredictionFile,
  members: readonly PredictionMember[] = file.team,
  fixedSpec: boolean = file.fixedSpec,
  suffix = '',
): LegacyRecording {
  const team: RecordingMember[] = members.map((m, i) => ({
    slot: i + 1,
    rid: m.rid,
    name: String(m.rid),
    controlled: m.controlled ?? false,
    ...(m.treasurePhase === undefined ? {} : { treasurePhase: m.treasurePhase }),
    ...(m.build === undefined ? {} : { build: m.build }),
  }));
  return {
    id: `prediction:${file.verification}${suffix}`,
    legacy: true,
    path: '',
    team,
    target: { name: '', element: null },
    mode: null,
    fixedSpec,
    autoFire: null,
    autoBurst: null,
    conditionNote: '',
  };
}

/** 予測ファイルの撮る前の入力の値（values）を、観測値の値に足した RecordsData */
function withPlannedValues(file: PredictionFile, data: RecordsData): RecordsData {
  if (file.values === undefined) return data;
  return { ...data, observationValues: new Map([...(data.observationValues ?? []), ...Object.entries(file.values)]) };
}

/**
 * 仮説ごと・指標ごとにモデルを回す（同じ条件は 1 回だけ）。指標の recording（plan/design-compare-setup-extension.md 4 節）を引くには
 * recordings を渡す
 */
export function runPredictions(
  file: PredictionFile,
  data: RecordsData,
  recordings: ReadonlyMap<string, RecordingEntry> = new Map(),
): Predicted['values'] {
  const recordingOf = (t: PredictionTarget): RecordingEntry => {
    if (t.recording !== undefined) {
      const r = recordings.get(t.recording);
      if (r === undefined) throw new Error(`指標 ${t.id} の録画 ${t.recording} が無い`);
      return r;
    }
    if (t.team !== undefined) return asRecording(file, t.team, t.fixedSpec ?? file.fixedSpec, `:${t.id}`);
    return asRecording(file);
  };
  const withValues = withPlannedValues(file, data);
  const cache = new Map<string, { input: TeamInput; sim?: SimResult }>();
  const values: Predicted['values'] = {};
  for (const h of file.hypotheses) {
    values[h.id] = {};
    for (const t of file.targets) {
      const metric = METRICS[t.metric];
      if (metric === undefined) throw new Error(`metric ${t.metric} が語彙に無い`);
      const setup: CompareSetup = { ...t.setup, ...(h.override ?? {}) };
      const recording = recordingOf(t);
      const key = `${recording.id}:${JSON.stringify(setup)}`;
      let run = cache.get(key);
      if (run === undefined) {
        run = { input: buildTeamInput(recording, setup, withValues) };
        cache.set(key, run);
      }
      const ctx = { args: t.args ?? {}, input: run.input };
      run.sim ??= runSimulation(run.input);
      values[h.id]![t.id] = metric.sim(run.sim, ctx);
    }
  }
  return values;
}

/** 予測の後のモデルの変更: いま出し直すと値が変わる仮説 × 指標か、いまのモデルでは出し直せない（例外）こと */
export type Staleness =
  | {
      kind: 'changed';
      targets: { hypothesis: string; target: string; saved: number | number[]; now: number | number[] }[];
    }
  | { kind: 'error'; message: string };

function sameValue(a: number | number[] | undefined, b: number | number[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/**
 * いまのモデルで予測を出し直し、保存した値と比べる（plan/design-prediction-staleness.md 1 節）。同じコードとデータなら計算は
 * 決定的なので、厳密に同じかで比べる。値が変わらなければ undefined。予測をまだ出していなければ見ない
 */
export function predictionStaleness(file: PredictionFile, data: RecordsData): Staleness | undefined {
  if (file.predicted === null) return undefined;
  let now: Predicted['values'];
  try {
    now = runPredictions(file, data);
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
  const targets: Extract<Staleness, { kind: 'changed' }>['targets'] = [];
  for (const h of file.hypotheses) {
    for (const t of file.targets) {
      const v = now[h.id]![t.id]!;
      const saved = file.predicted.values[h.id]?.[t.id];
      if (!sameValue(saved, v)) targets.push({ hypothesis: h.id, target: t.id, saved: saved ?? Number.NaN, now: v });
    }
  }
  return targets.length > 0 ? { kind: 'changed', targets } : undefined;
}

const STALE_SHOWN = 5;

/** 予測の後のモデルの変更の注意（先頭の 1 行と、仮説 × 指標ごとの旧 → 新の行。先頭は「- 」で始まり、続く行は 2 字下げる） */
function renderStaleness(file: PredictionFile, stale: Staleness): string[] {
  const head = '- **予測の後にモデルが変わった**: ';
  const redo = `\`npm run records:predict -- ${file.verification}\` で出し直す`;
  if (stale.kind === 'error') return [`${head}いまのモデルでは出し直せない（${stale.message}）`];
  const lines = [`${head}いま出し直すと、仮説 × 指標 ${stale.targets.length} つの値が変わる（${redo}）`];
  for (const x of stale.targets.slice(0, STALE_SHOWN))
    lines.push(`  - ${x.hypothesis} ${x.target}: ${fmt(x.saved)} → ${fmt(x.now)}`);
  if (stale.targets.length > STALE_SHOWN) lines.push(`  - ほか ${stale.targets.length - STALE_SHOWN} つ`);
  return lines;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${stable(v)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** 指標に結び付く観測値（指定があればそれ、無ければ同じ検証記録を source にする観測値のうち metric・args・setup が同じもの） */
export function observationsOfTarget(
  file: PredictionFile,
  target: PredictionTarget,
  observations: readonly Observation[],
): Observation[] {
  if (target.observations !== undefined) {
    return target.observations.flatMap((id) => observations.filter((o) => o.id === id));
  }
  return observations.filter(
    (o) =>
      o.source === file.verification &&
      o.compare !== undefined &&
      o.invalid === undefined &&
      o.compare.metric === target.metric &&
      stable(o.compare.args) === stable(target.args ?? {}) &&
      stable(o.compare.setup) === stable(target.setup),
  );
}

export type TargetComparison = {
  target: PredictionTarget;
  observation: Observation | undefined;
  /** 仮説 ID → 予測の値と差（観測値があれば）。ok は許容（観測値の compare.tolerance）か spread の中 */
  byHypothesis: { hypothesis: string; predicted: number | number[]; diff: number | null; ok: boolean | null }[];
};

export type PredictionComparison = {
  file: PredictionFile;
  targets: TargetComparison[];
  /** 仮説 ID → 観測値のある指標のうち許容内の数 / その指標の数 */
  score: Map<string, { ok: number; total: number }>;
  /** 予測の後のモデルの変更（records:check が開いている検証の予測だけ出し直して見る。plan/design-prediction-staleness.md） */
  stale?: Staleness;
};

/** 予測と観測値の突き合わせ（predicted が無ければ空） */
export function comparePredictions(
  file: PredictionFile,
  observations: readonly Observation[],
  stale?: Staleness,
): PredictionComparison {
  const score = new Map<string, { ok: number; total: number }>();
  for (const h of file.hypotheses) score.set(h.id, { ok: 0, total: 0 });
  const targets: TargetComparison[] = [];
  if (file.predicted === null) return { file, targets, score, ...(stale ? { stale } : {}) };
  for (const t of file.targets) {
    const observation = observationsOfTarget(file, t, observations)[0];
    const byHypothesis = file.hypotheses.map((h) => {
      const predicted = file.predicted!.values[h.id]?.[t.id];
      if (predicted === undefined) return { hypothesis: h.id, predicted: Number.NaN, diff: null, ok: null };
      if (observation === undefined) return { hypothesis: h.id, predicted, diff: null, ok: null };
      const r = withinObservation(observation, predicted);
      const s = score.get(h.id)!;
      s.total++;
      if (r.ok) s.ok++;
      return { hypothesis: h.id, predicted, diff: r.diff, ok: r.ok };
    });
    targets.push({ target: t, observation, byHypothesis });
  }
  return { file, targets, score, ...(stale ? { stale } : {}) };
}

/** 観測値の許容（compare.tolerance）か幅（spread）で、予測が合うか */
function withinObservation(o: Observation, predicted: number | number[]): { diff: number; ok: boolean } {
  if (o.compare !== undefined) return compareValue(o.value, predicted, o.compare.tolerance);
  if (o.spread !== undefined && typeof predicted === 'number' && typeof o.value === 'number') {
    return { diff: predicted - o.value, ok: predicted >= o.spread.low && predicted <= o.spread.high };
  }
  const { diff } = compareValue(o.value, predicted, { abs: 0 });
  return { diff, ok: diff === 0 };
}

function fmt(v: number | number[]): string {
  const one = (x: number) =>
    Number.isInteger(x) ? x.toLocaleString('en-US') : x.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return Array.isArray(v) ? `[${v.map(one).join(', ')}]` : one(v);
}

function fmtDiff(o: Observation, diff: number | null): string {
  if (diff === null) return '';
  if (!Number.isFinite(diff)) return '長さが違う';
  if (o.compare !== undefined && 'rel' in o.compare.tolerance)
    return `${diff >= 0 ? '+' : ''}${(diff * 100).toFixed(2)}%`;
  return `${diff >= 0 ? '+' : ''}${fmt(Math.round(diff * 1000) / 1000)}`;
}

/** 検証記録の「結果」の生成ブロックに書く表（予測 × 観測値。plan/design-records-automation.md 3.6 節） */
export function renderPredictionTable(comparison: PredictionComparison): string {
  const { file, targets } = comparison;
  if (file.predicted === null) return '予測はまだ出していない（`npm run records:predict`）。';
  const hyps = file.hypotheses.map((h) => h.id);
  const header = `| 指標 | 実測 | ${hyps.map((h) => `予測 ${h}`).join(' | ')} |`;
  const sep = `| --- | --- | ${hyps.map(() => '---').join(' | ')} |`;
  const rows = targets.map((t) => {
    const observed =
      t.observation === undefined ? '（実測なし）' : `${fmt(t.observation.value)}（\`${t.observation.id}\`）`;
    const cells = t.byHypothesis.map((b) => {
      if (t.observation === undefined) return fmt(b.predicted);
      const mark = b.ok === null ? '' : b.ok ? '許容内' : '**許容外**';
      return `${fmt(b.predicted)}（${[fmtDiff(t.observation, b.diff), mark].filter(Boolean).join('、')}）`;
    });
    return `| ${t.target.id}（${t.target.metric}） | ${observed} | ${cells.join(' | ')} |`;
  });
  return [
    `予測は ${file.predicted.at}（commit ${file.predicted.commit.slice(0, 7)}）に出した。`,
    '',
    ...(comparison.stale ? [...renderStaleness(file, comparison.stale), ''] : []),
    header,
    sep,
    ...rows,
  ].join('\n');
}

/** plan/verifications.md の検証記録の項に足す行（「  - 」で始まる。無ければ空） */
export function renderPredictionLines(comparison: PredictionComparison): string[] {
  const { file, targets, score } = comparison;
  if (file.predicted === null) return ['  - 予測: 予測ファイルはあるが、まだ出していない（`npm run records:predict`）'];
  const lines = [`  - 予測（${file.predicted.at}、commit ${file.predicted.commit.slice(0, 7)}）との比べ:`];
  for (const t of targets) {
    const parts = t.byHypothesis.map((b) => {
      const mark = b.ok === null ? '' : b.ok ? '許容内' : '**許容外**';
      const diff = t.observation === undefined ? '' : fmtDiff(t.observation, b.diff);
      return `${b.hypothesis} ${fmt(b.predicted)}${diff || mark ? `（${[diff, mark].filter(Boolean).join('、')}）` : ''}`;
    });
    const observed =
      t.observation === undefined ? '実測なし' : `実測 ${fmt(t.observation.value)}（${t.observation.id}）`;
    lines.push(`    - ${t.target.id}（${t.target.metric}）: ${observed}。${parts.join('、')}`);
  }
  const fits = [...score.entries()].filter(([, s]) => s.total > 0);
  if (fits.length > 0) {
    const text = fits.map(([h, s]) => `${h} ${s.ok}/${s.total}`).join('・');
    const all = fits.filter(([, s]) => s.ok === s.total).map(([h]) => h);
    const verdict =
      all.length === 1
        ? `合う仮説は ${all[0]} だけ`
        : all.length === 0
          ? '合う仮説は無い'
          : `合う仮説が ${all.length} つ（${all.join('・')}）`;
    lines.push(`    - 許容内の指標: ${text}。${verdict}`);
  }
  if (comparison.stale) lines.push(...renderStaleness(file, comparison.stale).map((l) => `  ${l}`));
  return lines;
}
