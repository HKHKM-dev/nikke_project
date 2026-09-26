// Stage 19-B: 観測値（records/observations/<録画 id>.json）の型・検証と、照合ランナー（モデルと比べて残差を出す）。
// plan/design-stage19.md 2.3・2.3.1・2.5 節。
import { computeTeamDamage } from '../calc/model.ts';
import { DISTANCE_BONUS } from '../damage.ts';
import { enemyEventsOf, enemyInputOf, enemyLandingsOf, targetProfileOf } from '../enemies.ts';
import { computeFixedSpecAttack, fixedSpecGrowth } from '../fixedSpec.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
import { applyCritBuffs } from '../skills/buffs.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { SkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamResult, TeamSlotInput } from '../team.ts';
import type { CharacterData, EnemyPresetMaster } from '../types.ts';
import type { RecordingEntry } from './recordings.ts';

/** 何を読んだか（人と検索のため） */
export const OBSERVATION_KINDS = ['hit', 'interval', 'count', 'timing', 'total', 'rate'] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** 観測値の使い道 */
export const OBSERVATION_USES = ['compare', 'input', 'record'] as const;
export type ObservationUse = (typeof OBSERVATION_USES)[number];

/** 予測の条件（録画に書かれていない、モデルの側の設定）。省略は既定値 */
export type CompareSetup = {
  /** data/enemies.json のプリセットの id */
  enemy: string;
  /** 出来事のセット（例: range-3min-jump）。省略は無し */
  events?: string[];
  /** 省略 true */
  burst?: boolean;
  /** 省略 180 */
  durationSeconds?: number;
  /** 省略 1 */
  coreHitRate?: number;
  /** 省略 true */
  distanceBonus?: boolean;
  /** 省略 1 */
  hitRate?: number;
  /**
   * Stage 18-C: 条件の決め方。'auto' は的の条件の表と着地点の時間割り（frame/landing.ts）で決める（coreHitRate・distanceBonus・
   * hitRate は、表が未測定の項目にだけ使う）。**省略は 'manual'**（Stage 19-B の観測値は手入力のまま）
   */
  condition?: 'auto' | 'manual';
  /** Stage 18-C: 中遠の着地点を 1 か所に固定する（録画で読んだ着地点。plan/verification.md「実距離への換算」）。省略は配分 */
  midFarLanding?: MidFarLanding;
};

/** Stage 18-C: 中遠の 3 か所（足元 584・571・561。C-0044） */
export const MID_FAR_LANDINGS = ['A', 'B', 'C'] as const;
export type MidFarLanding = (typeof MID_FAR_LANDINGS)[number];

/** 中遠の着地点を固定する enemyLandingsOf の fixed */
export function midFarFixed(landing: MidFarLanding | undefined): Record<string, string> {
  return landing === undefined ? {} : { midFar: `midFar${landing}` };
}

export type Tolerance = { rel: number } | { abs: number };

export type CompareSpec = {
  model: 'sim' | 'calc';
  metric: string;
  args: Record<string, number | string | boolean>;
  tolerance: Tolerance;
  setup: CompareSetup;
};

export type Observation = {
  id: string;
  recording: string;
  kind: ObservationKind;
  use: ObservationUse;
  value: number | number[];
  /** 何の値か（1〜2 文） */
  description: string;
  /** 値を記録した場所（verification.md の節など） */
  source: string;
  method?: { tool?: string; note?: string };
  evidence?: string[];
  compare?: CompareSpec;
};

// ---- 比べる値の語彙（2.3.1 節） ----

type MetricContext = {
  args: CompareSpec['args'];
  input: TeamInput;
};

type Metric = {
  /** 必須の引数 */
  args: readonly string[];
  sim: (result: SimResult, ctx: MetricContext) => number | number[];
  calc?: (result: TeamResult, ctx: MetricContext) => number | number[];
};

function slotIndexOf(ctx: MetricContext): number {
  return Number(ctx.args.slot) - 1;
}

function slotOf<T>(slots: readonly (T | null)[], ctx: MetricContext): T {
  const slot = slots[slotIndexOf(ctx)];
  if (slot === null || slot === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  return slot;
}

function shotFramesIn(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const from = ctx.args.from === undefined ? 0 : Number(ctx.args.from);
  const to = ctx.args.to === undefined ? result.frames : Number(ctx.args.to);
  return log.frames.filter((f) => f >= from && f < to);
}

/**
 * 1 ヒットの値。モデルは会心・コアを期待値で持っているので、その時点の区間の 1 トリガーの値から、
 * 倍率グループ（1 + コア + 会心 + 距離 + フルバースト）だけをパターンに差し替えて組み直す。通常攻撃の 1 ヒット。
 * SG は 1 トリガー（武器倍率 = 全ペレットの合計）を shotCount で割った 1 ペレットの値
 */
function hitDamage(result: SimResult, ctx: MetricContext): number {
  if ((ctx.args.source ?? 'normal') !== 'normal')
    throw new Error(`hitDamage の source ${String(ctx.args.source)} は未対応`);
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  if (t.hitRate === 0 || t.boost.total === 0) throw new Error('命中率か倍率グループが 0');
  const character: CharacterData = input.character;
  const shot = t.buffs.weapon?.shot ?? character.shot;
  const core = ctx.args.core === true && ctx.input.enemy.hasCore ? shot.coreDamageRate - 1 + t.buffs.coreDamage : 0;
  const crit = ctx.args.crit === true ? applyCritBuffs(character.crit, t.buffs).damage - 1 : 0;
  const distance = ctx.args.distance === true && character.bonusRange !== null ? DISTANCE_BONUS : 0;
  const boost = 1 + core + crit + distance + t.boost.fullBurst;
  return ((t.normal / t.hitRate / t.boost.total) * boost) / shot.shotCount;
}

export const METRICS: Readonly<Record<string, Metric>> = {
  teamTotalDamage: { args: [], sim: (r) => r.totalDamage, calc: (r) => r.totalDamage },
  slotTotalDamage: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).totalDamage,
    calc: (r, c) => slotOf(r.slots, c).totalDamage,
  },
  rangeDamage: {
    args: ['fromSec', 'toSec'],
    sim: (r, c) => {
      const perSecond = c.args.slot === undefined ? r.damagePerSecond.total : slotOf(r.damagePerSecond.slots, c);
      return perSecond.slice(Number(c.args.fromSec), Number(c.args.toSec)).reduce((a, b) => a + b, 0);
    },
  },
  fullBurstCount: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.length ?? 0,
    calc: (r) => r.schedule?.fullBurstWindows.length ?? 0,
  },
  fullBurstStarts: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
    calc: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
  },
  gaugeFullFrame: {
    args: ['n'],
    sim: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
    calc: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
  },
  burstCount: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).burst.activations.length,
    calc: (r, c) => slotOf(r.slots, c).burst.activations.length,
  },
  skillHitCount: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).skillHits.frames.length,
    calc: (r, c) => slotOf(r.slots, c).skillHits.activations.length,
  },
  shotCount: { args: ['slot'], sim: (r, c) => shotFramesIn(r, c).length },
  shotIntervals: {
    args: ['slot'],
    sim: (r, c) => {
      const frames = shotFramesIn(r, c);
      return frames.slice(1).map((f, i) => f - frames[i]!);
    },
  },
  hitDamage: { args: ['slot', 'frame', 'core', 'crit', 'distance'], sim: hitDamage },
};

function gaugeFull(frames: readonly number[] | undefined, ctx: MetricContext): number {
  const value = frames?.[Number(ctx.args.n)];
  if (value === undefined) throw new Error(`${String(ctx.args.n)} 回目の満タンが無い`);
  return value;
}

// ---- 検証 ----

export function validateObservations(
  observations: readonly Observation[],
  recordings: ReadonlyMap<string, RecordingEntry>,
  enemies: Pick<EnemyPresetMaster, 'enemies' | 'eventSets'>,
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const o of observations) {
    const at = o.id;
    if (seen.has(o.id)) errors.push(`${at}: id が重複している`);
    seen.add(o.id);
    if (!o.id.startsWith(`${o.recording}-`) || !/^\d{2,}$/.test(o.id.slice(o.recording.length + 1)))
      errors.push(`${at}: id は <録画 id>-<2 桁以上の連番>`);
    if (!recordings.has(o.recording)) errors.push(`${at}: 録画 ${o.recording} が records/recordings.json に無い`);
    if (!OBSERVATION_KINDS.includes(o.kind)) errors.push(`${at}: kind が語彙に無い: ${o.kind}`);
    if (!OBSERVATION_USES.includes(o.use)) errors.push(`${at}: use が語彙に無い: ${o.use}`);
    if (o.description.trim() === '' || o.source.trim() === '') errors.push(`${at}: description と source は必須`);
    if (o.use === 'compare' && o.compare === undefined) errors.push(`${at}: use が compare なら compare が要る`);
    if (o.use !== 'compare' && o.compare !== undefined) errors.push(`${at}: compare は use が compare のときだけ`);
    const c = o.compare;
    if (c === undefined) continue;
    const metric = METRICS[c.metric];
    if (metric === undefined) {
      errors.push(`${at}: metric が語彙に無い: ${c.metric}`);
      continue;
    }
    for (const name of metric.args)
      if (c.args[name] === undefined) errors.push(`${at}: ${c.metric} の引数 ${name} が無い`);
    if (c.model === 'calc' && metric.calc === undefined) errors.push(`${at}: ${c.metric} は calc の出力に無い`);
    const preset = enemies.enemies.find((e) => e.id === c.setup.enemy);
    if (preset === undefined) errors.push(`${at}: 敵のプリセット ${c.setup.enemy} が無い`);
    for (const set of c.setup.events ?? []) {
      if (!preset?.eventSets.includes(set)) errors.push(`${at}: 出来事のセット ${set} は ${c.setup.enemy} に無い`);
    }
    const condition = c.setup.condition ?? 'manual';
    if (condition !== 'auto' && condition !== 'manual') errors.push(`${at}: condition は auto か manual`);
    const midFar = c.setup.midFarLanding;
    if (midFar !== undefined) {
      if (!MID_FAR_LANDINGS.includes(midFar)) errors.push(`${at}: midFarLanding は A・B・C`);
      if (condition !== 'auto') errors.push(`${at}: midFarLanding は condition が auto のときだけ`);
    }
    if (condition === 'auto' && preset !== undefined && preset.targetProfile === undefined) {
      errors.push(`${at}: 敵のプリセット ${c.setup.enemy} には的の条件の表が無い`);
    }
    const tol = 'rel' in c.tolerance ? c.tolerance.rel : c.tolerance.abs;
    if (!(tol >= 0)) errors.push(`${at}: 許容幅は 0 以上`);
  }
  return errors;
}

// ---- 照合ランナー ----

export type RecordsData = {
  characters: ReadonlyMap<number, CharacterData>;
  skills: ReadonlyMap<number, SkillDefinition>;
  enemies: EnemyPresetMaster;
};

/** 録画の条件と予測の条件から、モデルの入力を組む（npm run sim の --fixed-spec と同じ組み方） */
export function buildTeamInput(recording: RecordingEntry, setup: CompareSetup, data: RecordsData): TeamInput {
  if (recording.fixedSpec === false) throw new Error('スペック固定 OFF の録画は未対応（育成入力が要る）');
  if (recording.fixedSpec === null) throw new Error('スペック固定かどうか記録が無い');
  const preset = data.enemies.enemies.find((e) => e.id === setup.enemy);
  if (preset === undefined) throw new Error(`敵のプリセット ${setup.enemy} が無い`);
  const durationSeconds = setup.durationSeconds ?? 180;
  const auto = setup.condition === 'auto';
  const target = auto ? targetProfileOf(data.enemies, preset) : undefined;
  const condition = {
    coreHitRate: setup.coreHitRate ?? 1,
    distanceBonus: setup.distanceBonus ?? true,
    fullCharge: true,
    hitRate: setup.hitRate ?? 1,
  };
  const slots: TeamSlotInput[] = recording.team.map((member) => {
    const character = data.characters.get(member.rid);
    if (character === undefined) throw new Error(`rid ${member.rid} のデータが無い`);
    if (member.cube !== undefined) throw new Error('キューブを付けた枠は未対応（スペック固定では乗らない）');
    return {
      character,
      growth: fixedSpecGrowth(character),
      condition,
      ...(auto ? { conditionMode: 'auto' as const } : {}),
      attackOverride: computeFixedSpecAttack(character).attack,
      skills: {
        definition: data.skills.get(member.rid) ?? null,
        levels: MAX_SKILL_LEVELS,
        treasurePhase: (member.treasurePhase ?? 0) as TreasurePhase,
      },
    };
  });
  const controlled = recording.team.findIndex((m) => m.controlled === true);
  return {
    slots,
    enemy: {
      ...enemyInputOf(preset),
      events: enemyEventsOf(data.enemies, setup.events ?? [], durationSeconds),
      ...(target === undefined
        ? {}
        : {
            target,
            landings: enemyLandingsOf(
              data.enemies,
              setup.events ?? [],
              durationSeconds,
              target,
              midFarFixed(setup.midFarLanding),
            ),
          }),
    },
    durationSeconds,
    burst: setup.burst ?? true,
    burstModel: 'dynamic',
    controlledSlot: controlled < 0 ? null : controlled,
  };
}

export type ResidualStatus = 'ok' | 'outside' | 'error';

export type Residual = {
  observation: Observation;
  status: ResidualStatus;
  predicted: number | number[] | null;
  /** 比べた差（列なら要素ごとの差の最大。rel は比、abs は差） */
  diff: number | null;
  message?: string;
};

function within(measured: number, predicted: number, tolerance: Tolerance): { diff: number; ok: boolean } {
  if ('rel' in tolerance) {
    const diff = measured === 0 ? (predicted === 0 ? 0 : Infinity) : (predicted - measured) / measured;
    return { diff, ok: Math.abs(diff) <= tolerance.rel };
  }
  const diff = predicted - measured;
  return { diff, ok: Math.abs(diff) <= tolerance.abs };
}

export function compareValue(
  measured: number | number[],
  predicted: number | number[],
  tolerance: Tolerance,
): { diff: number; ok: boolean } {
  if (Array.isArray(measured) !== Array.isArray(predicted)) return { diff: Infinity, ok: false };
  if (!Array.isArray(measured) || !Array.isArray(predicted))
    return within(measured as number, predicted as number, tolerance);
  if (measured.length !== predicted.length) return { diff: Infinity, ok: false };
  let worst = 0;
  let ok = true;
  measured.forEach((m, i) => {
    const r = within(m, predicted[i]!, tolerance);
    if (Math.abs(r.diff) > Math.abs(worst)) worst = r.diff;
    ok &&= r.ok;
  });
  return { diff: worst, ok };
}

/** use が compare の観測値をすべてモデルと比べる。同じ録画・同じ条件のモデルは 1 回だけ回す */
export function runObservations(
  observations: readonly Observation[],
  recordings: ReadonlyMap<string, RecordingEntry>,
  data: RecordsData,
): Residual[] {
  const cache = new Map<string, { input: TeamInput; sim?: SimResult; calc?: TeamResult }>();
  const residuals: Residual[] = [];
  for (const o of observations) {
    const c = o.compare;
    if (o.use !== 'compare' || c === undefined) continue;
    try {
      const recording = recordings.get(o.recording);
      if (recording === undefined) throw new Error(`録画 ${o.recording} が無い`);
      const metric = METRICS[c.metric];
      if (metric === undefined) throw new Error(`metric ${c.metric} が語彙に無い`);
      const key = `${o.recording}:${JSON.stringify(c.setup)}`;
      let run = cache.get(key);
      if (run === undefined) {
        run = { input: buildTeamInput(recording, c.setup, data) };
        cache.set(key, run);
      }
      const ctx: MetricContext = { args: c.args, input: run.input };
      let predicted: number | number[];
      if (c.model === 'sim') {
        run.sim ??= runSimulation(run.input);
        predicted = metric.sim(run.sim, ctx);
      } else {
        if (metric.calc === undefined) throw new Error(`${c.metric} は calc の出力に無い`);
        run.calc ??= computeTeamDamage(run.input);
        predicted = metric.calc(run.calc, ctx);
      }
      const { diff, ok } = compareValue(o.value, predicted, c.tolerance);
      residuals.push({ observation: o, status: ok ? 'ok' : 'outside', predicted, diff });
    } catch (e) {
      residuals.push({ observation: o, status: 'error', predicted: null, diff: null, message: (e as Error).message });
    }
  }
  return residuals;
}

// ---- 残差の一覧（plan/residuals.md） ----

function fmtValue(v: number | number[] | null): string {
  if (v === null) return '—';
  if (Array.isArray(v)) return v.map((x) => fmtNumber(x)).join(', ');
  return fmtNumber(v);
}

function fmtNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function fmtDiff(r: Residual): string {
  const tol = r.observation.compare!.tolerance;
  if (r.diff === null) return '—';
  if (!Number.isFinite(r.diff)) return '長さが違う';
  if ('rel' in tol) return `${r.diff >= 0 ? '+' : ''}${(r.diff * 100).toFixed(2)}%`;
  return `${r.diff >= 0 ? '+' : ''}${fmtNumber(Math.round(r.diff * 1000) / 1000)}`;
}

function fmtTolerance(t: Tolerance): string {
  return 'rel' in t ? `±${(t.rel * 100).toFixed(2).replace(/\.?0+$/, '')}%` : `±${fmtNumber(t.abs)}`;
}

/** 引数と、手入力でない条件（Stage 18-C の自動の条件・中遠の固定）。手入力の観測値は今までと同じ表示 */
function fmtArgs(args: CompareSpec['args'], setup?: CompareSetup): string {
  const entries: [string, unknown][] = Object.entries(args);
  if (setup?.condition === 'auto') entries.push(['condition', 'auto']);
  if (setup?.midFarLanding !== undefined) entries.push(['midFar', setup.midFarLanding]);
  return entries.length === 0 ? '' : `（${entries.map(([k, v]) => `${k}=${String(v)}`).join('、')}）`;
}

const STATUS_JA: Record<ResidualStatus, string> = { ok: '許容内', outside: '**許容外**', error: '**比べられない**' };

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** 残差の一覧の本文（生成する部分） */
export function renderResiduals(
  residuals: readonly Residual[],
  observations: readonly Observation[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
): string {
  const claimText = (id: string) => (claimsOf.get(id) ?? []).join('・') || '—';
  const count = (s: ResidualStatus) => residuals.filter((r) => r.status === s).length;
  const lines = [
    `比べた観測値 ${residuals.length} 件: 許容内 ${count('ok')}・許容外 ${count('outside')}・比べられない ${count('error')}。`,
    '',
    '| 観測値 | 読んだもの | 比べる値 | モデル | 実測 | 予測 | 差 | 許容 | 判定 | 結論 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of residuals) {
    const o = r.observation;
    const c = o.compare!;
    lines.push(
      `| ${[
        o.id,
        cell(o.description),
        `\`${c.metric}\`${cell(fmtArgs(c.args, c.setup))}`,
        c.model,
        fmtValue(o.value),
        fmtValue(r.predicted),
        fmtDiff(r),
        fmtTolerance(c.tolerance),
        r.status === 'error' ? `${STATUS_JA.error}: ${cell(r.message ?? '')}` : STATUS_JA[r.status],
        claimText(o.id),
      ].join(' | ')} |`,
    );
  }
  const others = observations.filter((o) => o.use !== 'compare');
  lines.push('', `### モデルと比べない観測値（${others.length} 件）`, '');
  lines.push('| 観測値 | 使い道 | 読んだもの | 値 | 結論 |', '| --- | --- | --- | --- | --- |');
  for (const o of others) {
    lines.push(`| ${[o.id, o.use, cell(o.description), fmtValue(o.value), claimText(o.id)].join(' | ')} |`);
  }
  return lines.join('\n');
}
