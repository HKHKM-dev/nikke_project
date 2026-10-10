// 予測（plan/design-records-automation.md 3.2 節）。検証記録ごとに records/predictions/V-NNNN.json を置き、
// 手書きの部分（編成・仮説・比べる指標）から `npm run records:predict -- V-NNNN` が sim（calc）を回して predicted を書き込む。
// records:check は、同じ検証記録を source にする観測値と突き合わせて、仮説ごとに合うかを plan/verifications.md に出す（3.5 節）。
// 予測は任意の道具で、確定の条件ではない。撮る前の順番も問わない（plan/design-investigation-review.md 1 節。2026-10-10 の
// オーナーの決定）。撮影計画で、その録画で仮説を見分けられるかを確かめるのに使う。
import { computeTeamDamage } from '../calc/model.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
import type { TeamInput, TeamResult } from '../team.ts';
import {
  buildTeamInput,
  compareValue,
  METRICS,
  type CompareSetup,
  type CompareSpec,
  type Observation,
  type RecordsData,
} from './observations.ts';
import {
  validateRecordingBuild,
  type LegacyRecording,
  type RecordingBuild,
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
  /** 結び付ける観測値の ID（省略すると、同じ検証記録を source にする観測値のうち metric・args・setup が同じもの） */
  observations?: string[];
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
  /** records:predict が書き込む。無ければまだ予測を出していない */
  predicted: Predicted | null;
};

const V_ID = /^V-\d{4,}$/;

/** 今日（手元の時刻。YYYY-MM-DD） */
export function todayLocal(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** 予測ファイルの検証。問題があれば 1 件 1 行 */
export function validatePredictions(
  files: readonly PredictionFile[],
  ctx: { verificationIds: ReadonlySet<string>; knownRids: ReadonlySet<number>; observations: readonly Observation[] },
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
    if (f.team.length === 0 || f.team.length > 5) errors.push(`${at}: 編成は 1〜5 体`);
    for (const m of f.team) if (!ctx.knownRids.has(m.rid)) errors.push(`${at}: rid ${m.rid} のキャラのデータが無い`);
    f.team.forEach((m, i) => {
      if (m.build === undefined) return;
      if (f.fixedSpec !== false) errors.push(`${at}: 育成（build）はスペック固定 OFF の予測にだけ書く`);
      errors.push(...validateRecordingBuild(m.build, `${at} 枠 ${i + 1}`));
    });
    if (f.team.filter((m) => m.controlled === true).length > 1) errors.push(`${at}: 操作した枠が 2 つ以上ある`);
    if (typeof f.fixedSpec !== 'boolean') errors.push(`${at}: fixedSpec は true か false`);
    if (f.hypotheses.length === 0) errors.push(`${at}: 仮説が 1 つ以上要る`);
    const hyp = new Set<string>();
    for (const h of f.hypotheses) {
      if (h.id.trim() === '' || hyp.has(h.id)) errors.push(`${at}: 仮説の id が空か重複している: ${h.id}`);
      hyp.add(h.id);
    }
    if (f.targets.length === 0) errors.push(`${at}: 比べる指標が 1 つ以上要る`);
    const tgt = new Set<string>();
    for (const t of f.targets) {
      if (t.id.trim() === '' || tgt.has(t.id)) errors.push(`${at}: 指標の id が空か重複している: ${t.id}`);
      tgt.add(t.id);
      const metric = METRICS[t.metric];
      if (metric === undefined) errors.push(`${at}: 指標 ${t.id} の metric ${t.metric} が語彙に無い`);
      else {
        if (t.model !== 'sim' && t.model !== 'calc') errors.push(`${at}: 指標 ${t.id} の model は sim か calc`);
        if (t.model === 'calc' && metric.calc === undefined)
          errors.push(`${at}: 指標 ${t.id} の ${t.metric} は calc の出力に無い`);
        for (const a of metric.args) {
          if (t.args?.[a] === undefined) errors.push(`${at}: 指標 ${t.id} に引数 ${a} が要る`);
        }
      }
      if (typeof t.setup?.enemy !== 'string') errors.push(`${at}: 指標 ${t.id} の setup.enemy が要る`);
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

/** 予測の編成を、照合ランナーの入力の組み方（buildTeamInput）に渡せる形にする */
function asRecording(file: PredictionFile): LegacyRecording {
  const team: RecordingMember[] = file.team.map((m, i) => ({
    slot: i + 1,
    rid: m.rid,
    name: String(m.rid),
    controlled: m.controlled ?? false,
    ...(m.treasurePhase === undefined ? {} : { treasurePhase: m.treasurePhase }),
    ...(m.build === undefined ? {} : { build: m.build }),
  }));
  return {
    id: `prediction:${file.verification}`,
    legacy: true,
    path: '',
    team,
    target: { name: '', element: null },
    mode: null,
    fixedSpec: file.fixedSpec,
    autoFire: null,
    autoBurst: null,
    conditionNote: '',
  };
}

/** 仮説ごと・指標ごとにモデルを回す（同じ条件は 1 回だけ） */
export function runPredictions(file: PredictionFile, data: RecordsData): Predicted['values'] {
  const recording = asRecording(file);
  const cache = new Map<string, { input: TeamInput; sim?: SimResult; calc?: TeamResult }>();
  const values: Predicted['values'] = {};
  for (const h of file.hypotheses) {
    values[h.id] = {};
    for (const t of file.targets) {
      const metric = METRICS[t.metric];
      if (metric === undefined) throw new Error(`metric ${t.metric} が語彙に無い`);
      const setup: CompareSetup = { ...t.setup, ...(h.override ?? {}) };
      const key = JSON.stringify(setup);
      let run = cache.get(key);
      if (run === undefined) {
        run = { input: buildTeamInput(recording, setup, data) };
        cache.set(key, run);
      }
      const ctx = { args: t.args ?? {}, input: run.input };
      if (t.model === 'sim') {
        run.sim ??= runSimulation(run.input);
        values[h.id]![t.id] = metric.sim(run.sim, ctx);
      } else {
        if (metric.calc === undefined) throw new Error(`${t.metric} は calc の出力に無い`);
        run.calc ??= computeTeamDamage(run.input);
        values[h.id]![t.id] = metric.calc(run.calc, ctx);
      }
    }
  }
  return values;
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
};

/** 予測と観測値の突き合わせ（predicted が無ければ空） */
export function comparePredictions(file: PredictionFile, observations: readonly Observation[]): PredictionComparison {
  const score = new Map<string, { ok: number; total: number }>();
  for (const h of file.hypotheses) score.set(h.id, { ok: 0, total: 0 });
  const targets: TargetComparison[] = [];
  if (file.predicted === null) return { file, targets, score };
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
  return { file, targets, score };
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
  return lines;
}
