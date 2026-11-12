// 観測値の検査（plan/design-stage19.md 2.3 節）。1 つの観測値を、欄・比べる指定・比べる設定の順に見る
// （plan/design-observations-split.md 3.3 節）
import type { EnemyPresetMaster } from '../../types.ts';
import type { RecordingEntry } from '../recordings.ts';
import { METRICS } from './metrics/index.ts';
import {
  FAR_LANDINGS,
  holdFireRangesOf,
  jumpWindowsOf,
  manualBurstsOf,
  MID_FAR_LANDINGS,
  NEAR_LANDINGS,
  type CompareSetup,
} from './setup.ts';
import {
  type CompareSpec,
  type Observation,
  OBSERVATION_KINDS,
  OBSERVATION_SOURCES,
  OBSERVATION_USES,
  type ObservationScope,
} from './types.ts';

type Enemies = Pick<EnemyPresetMaster, 'enemies' | 'eventSets'>;

export function validateObservations(
  observations: readonly Observation[],
  recordings: ReadonlyMap<string, RecordingEntry>,
  enemies: Enemies,
): string[] {
  // 比べる設定が ID で指す観測値（同じ ID が 2 つあれば先のもの）
  const byId = new Map<string, Observation>();
  for (const o of observations) if (!byId.has(o.id)) byId.set(o.id, o);
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const o of observations) {
    if (seen.has(o.id)) errors.push(`${o.id}: id が重複している`);
    seen.add(o.id);
    errors.push(...fieldErrors(o, recordings));
    if (o.compare !== undefined) errors.push(...compareErrors(o, o.compare, byId, recordings, enemies));
  }
  return errors;
}

/** scope の検査。teamSize は録画の編成の枠の数（録画が無ければ undefined で、枠の範囲は見ない） */
export function validateScope(scope: ObservationScope, teamSize: number | undefined, at: string): string[] {
  const errors: string[] = [];
  const slots = scope.slot === 'all' ? [] : Array.isArray(scope.slot) ? scope.slot : [scope.slot];
  if (scope.slot !== 'all' && slots.length === 0) errors.push(`${at}: scope.slot が空`);
  for (const s of slots)
    if (!Number.isInteger(s) || s < 1 || (teamSize !== undefined && s > teamSize))
      errors.push(`${at}: scope.slot は録画の編成の枠（1〜${teamSize ?? '?'}）か 'all'（${JSON.stringify(s)}）`);
  if (new Set(slots).size !== slots.length) errors.push(`${at}: scope.slot に同じ枠が 2 回ある`);
  if (!OBSERVATION_SOURCES.includes(scope.source)) errors.push(`${at}: scope.source が語彙に無い: ${scope.source}`);
  if (scope.frames !== undefined) {
    const f = scope.frames;
    if (!Array.isArray(f) || f.length !== 2 || !f.every((x) => Number.isInteger(x) && x >= 0) || f[0] > f[1])
      errors.push(`${at}: scope.frames は [始まり, 終わり]（0 以上の整数で、始まり ≤ 終わり）`);
  }
  return errors;
}

/** 観測値の欄（ID・録画・語彙・必須の文・複数の録画・単位と幅・日付・失効・scope・use と compare の組） */
function fieldErrors(o: Observation, recordings: ReadonlyMap<string, RecordingEntry>): string[] {
  const at = o.id;
  const errors: string[] = [];
  if (!o.id.startsWith(`${o.recording}-`) || !/^\d{2,}$/.test(o.id.slice(o.recording.length + 1)))
    errors.push(`${at}: id は <録画 id>-<2 桁以上の連番>`);
  if (!recordings.has(o.recording)) errors.push(`${at}: 録画 ${o.recording} が records/recordings/ に無い`);
  if (!OBSERVATION_KINDS.includes(o.kind)) errors.push(`${at}: kind が語彙に無い: ${o.kind}`);
  if (!OBSERVATION_USES.includes(o.use)) errors.push(`${at}: use が語彙に無い: ${o.use}`);
  if (o.description.trim() === '' || o.source.trim() === '') errors.push(`${at}: description と source は必須`);
  // Stage 20-E: 複数の録画・単位と幅・読み取った日・失効の印
  if (o.recordings !== undefined) {
    const first = [...o.recordings].sort(recordingOrder)[0];
    if (!o.recordings.includes(o.recording) || first !== o.recording)
      errors.push(`${at}: recording は recordings のうち最も若い番号にし、recordings にも含める`);
    for (const r of o.recordings) if (!recordings.has(r)) errors.push(`${at}: 録画 ${r} が records/recordings/ に無い`);
    if (o.recordings.length > 1 && o.use === 'compare')
      errors.push(`${at}: 複数の録画にまたがる観測値は compare に使わない`);
  }
  if (o.unit !== undefined && o.unit.trim() === '') errors.push(`${at}: unit が空`);
  if (o.spread !== undefined) {
    const s = o.spread;
    if (s.kind !== 'range' && s.kind !== 'ci95') errors.push(`${at}: spread の kind は range か ci95`);
    if (!(s.low <= s.high)) errors.push(`${at}: spread は low ≤ high`);
    if (typeof o.value === 'number' && !(s.low <= o.value && o.value <= s.high))
      errors.push(`${at}: 値が spread の外にある`);
  }
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (o.readAt !== undefined && !isDate(o.readAt)) errors.push(`${at}: readAt は YYYY-MM-DD`);
  if (o.invalid !== undefined && (o.invalid.reason.trim() === '' || !isDate(o.invalid.date)))
    errors.push(`${at}: invalid には reason と date（YYYY-MM-DD）が要る`);
  if (o.scope !== undefined) errors.push(...validateScope(o.scope, recordings.get(o.recording)?.team.length, at));
  if (o.use === 'compare' && o.compare === undefined) errors.push(`${at}: use が compare なら compare が要る`);
  if (o.use !== 'compare' && o.compare !== undefined) errors.push(`${at}: compare は use が compare のときだけ`);
  return errors;
}

/** 比べる指定。指標が語彙に無ければ、ほかは見ない */
function compareErrors(
  o: Observation,
  c: CompareSpec,
  byId: ReadonlyMap<string, Observation>,
  recordings: ReadonlyMap<string, RecordingEntry>,
  enemies: Enemies,
): string[] {
  const at = o.id;
  const metric = METRICS[c.metric];
  if (metric === undefined) return [`${at}: metric が語彙に無い: ${c.metric}`];
  const errors: string[] = [];
  for (const name of metric.args)
    if (c.args[name] === undefined) errors.push(`${at}: ${c.metric} の引数 ${name} が無い`);
  // 一本化の段 A-3: calc の経路は消した（2026-10-27）
  if (c.model !== 'sim') errors.push(`${at}: model は sim だけ（calc は 2026-10-27 の一本化で消した）`);
  errors.push(...conditionErrors(c.setup, enemies, at));
  errors.push(...setupErrors(o, c.setup, byId, recordings.get(o.recording)?.team.length));
  const tol = 'rel' in c.tolerance ? c.tolerance.rel : c.tolerance.abs;
  if (!(tol >= 0)) errors.push(`${at}: 許容幅は 0 以上`);
  return errors;
}

/** 敵のプリセットと出来事のセット・条件の決め方・着地点 */
function conditionErrors(setup: CompareSetup, enemies: Enemies, at: string): string[] {
  const errors: string[] = [];
  const preset = enemies.enemies.find((e) => e.id === setup.enemy);
  if (preset === undefined) errors.push(`${at}: 敵のプリセット ${setup.enemy} が無い`);
  for (const set of setup.events ?? []) {
    if (!preset?.eventSets.includes(set)) errors.push(`${at}: 出来事のセット ${set} は ${setup.enemy} に無い`);
  }
  const condition = setup.condition ?? 'manual';
  if (condition !== 'auto' && condition !== 'manual') errors.push(`${at}: condition は auto か manual`);
  if (setup.midFarLanding !== undefined && !MID_FAR_LANDINGS.includes(setup.midFarLanding))
    errors.push(`${at}: midFarLanding は A・B・C`);
  // 近と遠は 1 回目・2 回目の順の、空でない並び
  const sequenceOk = (v: unknown, allowed: readonly string[]) =>
    Array.isArray(v) && v.length > 0 && v.every((n) => allowed.includes(n));
  if (setup.nearLanding !== undefined && !sequenceOk(setup.nearLanding, NEAR_LANDINGS))
    errors.push(`${at}: nearLanding は A・B の並び（1 回目・2 回目の順）`);
  if (setup.farLanding !== undefined && !sequenceOk(setup.farLanding, FAR_LANDINGS))
    errors.push(`${at}: farLanding は A・B の並び（1 回目・2 回目の順）`);
  if (condition === 'auto' && preset !== undefined && preset.targetProfile === undefined) {
    errors.push(`${at}: 敵のプリセット ${setup.enemy} には的の条件の表が無い`);
  }
  return errors;
}

/** 比べる設定の欄（ID で指す観測値・遅れの上書き・枠の並び）。欄の順に見る */
function setupErrors(
  o: Observation,
  setup: CompareSetup,
  byId: ReadonlyMap<string, Observation>,
  teamSize: number | undefined,
): string[] {
  const at = o.id;
  const errors: string[] = [];
  const ref = (id: string, label: string, rule: RefRule) => errors.push(...refErrors(o, byId.get(id), id, label, rule));
  if (setup.jumpWindows !== undefined) ref(setup.jumpWindows, 'jumpWindows', JUMP_WINDOWS);
  for (const ob of setup.obstacles ?? []) {
    if (!Number.isInteger(ob.slot) || ob.slot < 1 || !Number.isInteger(ob.shot) || ob.shot < 1)
      errors.push(`${at}: obstacles の slot・shot は 1 以上の整数`);
    ref(ob.count, 'obstacles', OBSTACLES);
  }
  for (const ph of setup.pelletHits ?? []) {
    if (!Number.isInteger(ph.slot) || ph.slot < 1) errors.push(`${at}: pelletHits の slot は 1 以上の整数`);
    ref(ph.counts, 'pelletHits', PELLET_HITS);
  }
  errors.push(...burstDelaysErrors(setup, at));
  const holdFireSlots = (setup.holdFire ?? []).map((h) => h.slot);
  const slotLists = {
    noBurstSlots: setup.noBurstSlots ?? [],
    noFireSlots: setup.noFireSlots ?? [],
    holdFire: holdFireSlots,
  };
  for (const [key, list] of Object.entries(slotLists))
    for (const s of list)
      if (!Number.isInteger(s) || s < 1 || (teamSize !== undefined && s > teamSize))
        errors.push(`${at}: ${key} の枠 ${String(s)} が編成の外`);
  if (setup.noBurstSlots !== undefined && setup.burst !== true)
    errors.push(`${at}: noBurstSlots は burst が true のときだけ書く`);
  if (setup.noFireSlots !== undefined && setup.condition === 'auto')
    errors.push(`${at}: noFireSlots は condition が auto のときには書かない`);
  if (setup.manualBursts !== undefined) {
    if (setup.burst === false) errors.push(`${at}: manualBursts は burst が false のときには書かない`);
    ref(setup.manualBursts, 'manualBursts', MANUAL_BURSTS);
  }
  for (const h of setup.holdFire ?? []) ref(h.frames, 'holdFire', HOLD_FIRE);
  if (new Set(holdFireSlots).size !== holdFireSlots.length) errors.push(`${at}: holdFire の枠が重なっている`);
  return errors;
}

/** ID で指す観測値の決まり。input は use が input であること、shape は値の形が違うときの文（観測値の ID の後に続ける） */
type RefRule = { input: boolean; valueOk: (value: number | number[]) => boolean; shape: string };

const JUMP_WINDOWS: RefRule = {
  input: false,
  valueOk: (v) => jumpWindowsOf(v) !== undefined,
  shape: 'は [始まり, 終わり, …] の昇順の窓の並びでない',
};
const OBSTACLES: RefRule = {
  input: true,
  valueOk: (v) => typeof v === 'number' && Number.isInteger(v) && v >= 1,
  shape: 'の値は正の整数（個数）',
};
const PELLET_HITS: RefRule = {
  input: true,
  valueOk: (v) => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0),
  shape: 'の値は 0 以上の整数の配列（発ごとの数）',
};
const MANUAL_BURSTS: RefRule = {
  input: true,
  valueOk: (v) => manualBurstsOf(v) !== undefined,
  shape: 'の値は昇順の 0 以上の整数の配列',
};
const HOLD_FIRE: RefRule = {
  input: true,
  valueOk: (v) => holdFireRangesOf(v) !== undefined,
  shape: 'の値は昇順の 0 以上の整数の、偶数個の配列',
};

/** 比べる設定が ID で指す観測値の検査: 有るか・同じ録画か・use が input か・失効していないか・値の形 */
function refErrors(o: Observation, ref: Observation | undefined, id: string, label: string, rule: RefRule): string[] {
  const at = o.id;
  if (ref === undefined) return [`${at}: ${label} の観測値 ${id} が無い`];
  const errors: string[] = [];
  if (ref.recording !== o.recording) errors.push(`${at}: ${label} の観測値は同じ録画のもの`);
  if (rule.input && ref.use !== 'input') errors.push(`${at}: ${label} の観測値 ${ref.id} の use は input`);
  if (ref.invalid !== undefined) errors.push(`${at}: ${label} の観測値 ${ref.id} は失効している`);
  if (!rule.valueOk(ref.value)) errors.push(`${at}: ${label} の観測値 ${ref.id} ${rule.shape}`);
  return errors;
}

/** 遅れの上書き（burstDelays） */
function burstDelaysErrors(setup: CompareSetup, at: string): string[] {
  const errors: string[] = [];
  for (const d of setup.burstDelays ?? []) {
    if (!Number.isInteger(d.rid)) errors.push(`${at}: burstDelays の rid は整数`);
    const r = d.row;
    if (r === undefined) errors.push(`${at}: burstDelays の row は行か null`);
    else if (r !== null) {
      if (!Number.isInteger(r.hitFrames) || !Number.isInteger(r.effectFrames))
        errors.push(`${at}: burstDelays の hitFrames・effectFrames は整数`);
      if (r.origin !== undefined && r.origin !== 'mark' && r.origin !== 'activation')
        errors.push(`${at}: burstDelays の origin は mark か activation`);
      if (
        r.hitOffsets !== undefined &&
        !(
          r.hitOffsets[0] === 0 &&
          r.hitOffsets.every((x, i) => Number.isInteger(x) && (i === 0 || x > r.hitOffsets![i - 1]!))
        )
      )
        errors.push(`${at}: burstDelays の hitOffsets は 0 から始まる昇順の整数`);
    }
  }
  return errors;
}

/** 録画の ID の並び（このリポジトリの録画は番号順、その後に旧の録画） */
function recordingOrder(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity;
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity;
  return na - nb || a.localeCompare(b);
}
