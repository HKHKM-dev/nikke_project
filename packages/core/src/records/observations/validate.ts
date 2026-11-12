// 観測値の検査（plan/design-stage19.md 2.3 節）
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
} from './setup.ts';
import { type Observation, OBSERVATION_KINDS, OBSERVATION_USES, validateScope } from './types.ts';

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
    if (!recordings.has(o.recording)) errors.push(`${at}: 録画 ${o.recording} が records/recordings/ に無い`);
    if (!OBSERVATION_KINDS.includes(o.kind)) errors.push(`${at}: kind が語彙に無い: ${o.kind}`);
    if (!OBSERVATION_USES.includes(o.use)) errors.push(`${at}: use が語彙に無い: ${o.use}`);
    if (o.description.trim() === '' || o.source.trim() === '') errors.push(`${at}: description と source は必須`);
    // Stage 20-E: 複数の録画・単位と幅・読み取った日・失効の印
    if (o.recordings !== undefined) {
      const first = [...o.recordings].sort(recordingOrder)[0];
      if (!o.recordings.includes(o.recording) || first !== o.recording)
        errors.push(`${at}: recording は recordings のうち最も若い番号にし、recordings にも含める`);
      for (const r of o.recordings)
        if (!recordings.has(r)) errors.push(`${at}: 録画 ${r} が records/recordings/ に無い`);
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
    const c = o.compare;
    if (c === undefined) continue;
    const metric = METRICS[c.metric];
    if (metric === undefined) {
      errors.push(`${at}: metric が語彙に無い: ${c.metric}`);
      continue;
    }
    for (const name of metric.args)
      if (c.args[name] === undefined) errors.push(`${at}: ${c.metric} の引数 ${name} が無い`);
    // 一本化の段 A-3: calc の経路は消した（2026-10-27）
    if (c.model !== 'sim') errors.push(`${at}: model は sim だけ（calc は 2026-10-27 の一本化で消した）`);
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
    }
    const near = c.setup.nearLanding;
    if (near !== undefined) {
      if (!Array.isArray(near) || near.length === 0 || !near.every((n) => NEAR_LANDINGS.includes(n))) {
        errors.push(`${at}: nearLanding は A・B の並び（1 回目・2 回目の順）`);
      }
    }
    const far = c.setup.farLanding;
    if (far !== undefined) {
      if (!Array.isArray(far) || far.length === 0 || !far.every((n) => FAR_LANDINGS.includes(n))) {
        errors.push(`${at}: farLanding は A・B の並び（1 回目・2 回目の順）`);
      }
    }
    if (condition === 'auto' && preset !== undefined && preset.targetProfile === undefined) {
      errors.push(`${at}: 敵のプリセット ${c.setup.enemy} には的の条件の表が無い`);
    }
    if (c.setup.jumpWindows !== undefined) {
      const ref = observations.find((x) => x.id === c.setup.jumpWindows);
      if (ref === undefined) errors.push(`${at}: jumpWindows の観測値 ${c.setup.jumpWindows} が無い`);
      else {
        if (ref.recording !== o.recording) errors.push(`${at}: jumpWindows の観測値は同じ録画のもの`);
        if (ref.invalid !== undefined) errors.push(`${at}: jumpWindows の観測値 ${ref.id} は失効している`);
        if (jumpWindowsOf(ref.value) === undefined)
          errors.push(`${at}: jumpWindows の観測値 ${ref.id} は [始まり, 終わり, …] の昇順の窓の並びでない`);
      }
    }
    for (const ob of c.setup.obstacles ?? []) {
      if (!Number.isInteger(ob.slot) || ob.slot < 1 || !Number.isInteger(ob.shot) || ob.shot < 1)
        errors.push(`${at}: obstacles の slot・shot は 1 以上の整数`);
      const ref = observations.find((x) => x.id === ob.count);
      if (ref === undefined) errors.push(`${at}: obstacles の観測値 ${ob.count} が無い`);
      else {
        if (ref.recording !== o.recording) errors.push(`${at}: obstacles の観測値は同じ録画のもの`);
        if (ref.use !== 'input') errors.push(`${at}: obstacles の観測値 ${ref.id} の use は input`);
        if (ref.invalid !== undefined) errors.push(`${at}: obstacles の観測値 ${ref.id} は失効している`);
        if (!(typeof ref.value === 'number' && Number.isInteger(ref.value) && ref.value >= 1))
          errors.push(`${at}: obstacles の観測値 ${ref.id} の値は正の整数（個数）`);
      }
    }
    for (const ph of c.setup.pelletHits ?? []) {
      if (!Number.isInteger(ph.slot) || ph.slot < 1) errors.push(`${at}: pelletHits の slot は 1 以上の整数`);
      const ref = observations.find((x) => x.id === ph.counts);
      if (ref === undefined) errors.push(`${at}: pelletHits の観測値 ${ph.counts} が無い`);
      else {
        if (ref.recording !== o.recording) errors.push(`${at}: pelletHits の観測値は同じ録画のもの`);
        if (ref.use !== 'input') errors.push(`${at}: pelletHits の観測値 ${ref.id} の use は input`);
        if (ref.invalid !== undefined) errors.push(`${at}: pelletHits の観測値 ${ref.id} は失効している`);
        if (!(Array.isArray(ref.value) && ref.value.every((n) => Number.isInteger(n) && n >= 0)))
          errors.push(`${at}: pelletHits の観測値 ${ref.id} の値は 0 以上の整数の配列（発ごとの数）`);
      }
    }
    for (const d of c.setup.burstDelays ?? []) {
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
    const size = recordings.get(o.recording)?.team.length;
    const slotLists = {
      noBurstSlots: c.setup.noBurstSlots ?? [],
      noFireSlots: c.setup.noFireSlots ?? [],
      holdFire: (c.setup.holdFire ?? []).map((h) => h.slot),
    };
    for (const [key, list] of Object.entries(slotLists))
      for (const s of list)
        if (!Number.isInteger(s) || s < 1 || (size !== undefined && s > size))
          errors.push(`${at}: ${key} の枠 ${String(s)} が編成の外`);
    if (c.setup.noBurstSlots !== undefined && c.setup.burst !== true)
      errors.push(`${at}: noBurstSlots は burst が true のときだけ書く`);
    if (c.setup.noFireSlots !== undefined && c.setup.condition === 'auto')
      errors.push(`${at}: noFireSlots は condition が auto のときには書かない`);
    if (c.setup.manualBursts !== undefined) {
      if (c.setup.burst === false) errors.push(`${at}: manualBursts は burst が false のときには書かない`);
      const ref = observations.find((x) => x.id === c.setup.manualBursts);
      if (ref === undefined) errors.push(`${at}: manualBursts の観測値 ${c.setup.manualBursts} が無い`);
      else {
        if (ref.recording !== o.recording) errors.push(`${at}: manualBursts の観測値は同じ録画のもの`);
        if (ref.use !== 'input') errors.push(`${at}: manualBursts の観測値 ${ref.id} の use は input`);
        if (ref.invalid !== undefined) errors.push(`${at}: manualBursts の観測値 ${ref.id} は失効している`);
        if (manualBurstsOf(ref.value) === undefined)
          errors.push(`${at}: manualBursts の観測値 ${ref.id} の値は昇順の 0 以上の整数の配列`);
      }
    }
    for (const h of c.setup.holdFire ?? []) {
      const ref = observations.find((x) => x.id === h.frames);
      if (ref === undefined) errors.push(`${at}: holdFire の観測値 ${h.frames} が無い`);
      else {
        if (ref.recording !== o.recording) errors.push(`${at}: holdFire の観測値は同じ録画のもの`);
        if (ref.use !== 'input') errors.push(`${at}: holdFire の観測値 ${ref.id} の use は input`);
        if (ref.invalid !== undefined) errors.push(`${at}: holdFire の観測値 ${ref.id} は失効している`);
        if (holdFireRangesOf(ref.value) === undefined)
          errors.push(`${at}: holdFire の観測値 ${ref.id} の値は昇順の 0 以上の整数の、偶数個の配列`);
      }
    }
    if (new Set(slotLists.holdFire).size !== slotLists.holdFire.length)
      errors.push(`${at}: holdFire の枠が重なっている`);
    const tol = 'rel' in c.tolerance ? c.tolerance.rel : c.tolerance.abs;
    if (!(tol >= 0)) errors.push(`${at}: 許容幅は 0 以上`);
  }
  return errors;
}

/** 録画の ID の並び（このリポジトリの録画は番号順、その後に旧の録画） */
function recordingOrder(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity;
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity;
  return na - nb || a.localeCompare(b);
}
