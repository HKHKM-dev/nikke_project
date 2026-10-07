// 最小構成の検査の感度（plan/design-minimal-relevance.md 4.1 節・10.6 節）。sim と比べる観測値 O と、その録画の定義の効果 E の組ごとに、
// 基準の予測 P0（O の compare.setup のまま）、E を定義から外した予測 P−、E が持続の効果なら戦闘の始めから終わりまで効かせた予測 P+ を出し、
// P− か P+ が P0 から許容（compare.tolerance）を超えて動けば「効きうる」とする。E のきっかけと維持時間は信じない（6c）。
// ほかの要素はモデルの窓のまま。1 つずつ変える（未確定どうしの重なりは見ない。8 節の限界）。
// 計算は数分かかるので records:minimal で回し、結果を records/minimal/sensitivity.json に置く。records:check はそれを読む。
import { runSimulation, type SimResult } from '../sim/engine.ts';
import type { SkillDefinition, SkillEffect } from '../skills/types.ts';
import { METRICS, buildTeamInput, compareValue, type Observation, type RecordsData } from './observations.ts';
import type { RecordingEntry } from './recordings.ts';
import {
  elementsOf,
  impossibleReason,
  sensitivityKey,
  unconfirmedReason,
  usesSensitivity,
  type MinimalElement,
  type RelevanceContext,
  type SensitivityEntry,
} from './relevance.ts';

type Variant = 'minus' | 'plus';

/** 定義から効果を外す（minus）か、持続の効果を戦闘の始めから終わりまで効かせる（plus）。plus を当てられない効果は undefined */
export function variantDefinition(
  def: SkillDefinition,
  ref: NonNullable<MinimalElement['effectRef']>,
  variant: Variant,
  battleSeconds: number,
): SkillDefinition | undefined {
  const copy = structuredClone(def);
  const entry = ref.root === 'skills' ? copy.skills[ref.slot] : copy.treasureSkills?.[ref.slot];
  if (entry === undefined) return undefined;
  const effect = entry.effects[ref.index];
  if (effect === undefined) return undefined;
  if (variant === 'minus') {
    entry.effects.splice(ref.index, 1);
    return copy;
  }
  if (effect.kind !== 'timed') return undefined;
  const always = { ...effect, trigger: 'battleStart', durationSeconds: battleSeconds } as Record<string, unknown>;
  for (const k of ['durationRef', 'durationShots', 'durationShotsRef', 'durationUntil', 'condition']) delete always[k];
  entry.effects[ref.index] = always as unknown as SkillEffect;
  return copy;
}

/** 観測値の予測（sim）。同じ入力の sim は cache で 1 回にする */
function predict(
  o: Observation,
  recording: RecordingEntry,
  data: RecordsData,
  cache: Map<string, SimResult>,
  cacheKey: string,
): number | number[] {
  const c = o.compare!;
  const metric = METRICS[c.metric];
  if (metric === undefined) throw new Error(`metric ${c.metric} が語彙に無い`);
  const input = buildTeamInput(recording, c.setup, data);
  let sim = cache.get(cacheKey);
  if (sim === undefined) {
    sim = runSimulation(input);
    cache.set(cacheKey, sim);
  }
  return metric.sim(sim, { args: c.args, input });
}

export type SensitivityContext = RelevanceContext & { data: RecordsData };

/**
 * 観測値の感度の結果。対象は、根拠が確定でなく、その録画で起きうる定義の効果（結論の対象かどうかは結論ごとに違うので問わない）。
 * 基準の予測が出せない観測値は空（静的な判定に戻る）
 */
export function sensitivityOf(
  o: Observation,
  ctx: SensitivityContext,
  cache = new Map<string, SimResult>(),
): SensitivityEntry[] {
  if (!usesSensitivity(o)) return [];
  const recording = ctx.recordings.get(o.recording);
  if (recording === undefined) return [];
  const setupKey = `${o.recording}:${JSON.stringify(o.compare!.setup)}`;
  let p0: number | number[];
  try {
    p0 = predict(o, recording, ctx.data, cache, setupKey);
  } catch {
    return [];
  }
  const key = sensitivityKey(o, recording, ctx);
  const battleSeconds = o.compare!.setup.durationSeconds ?? 180;
  const out: SensitivityEntry[] = [];
  for (const e of elementsOf(recording, ctx)) {
    if (e.type !== 'effect' || e.effectRef === undefined) continue;
    if (unconfirmedReason(e, recording, ctx) === undefined) continue;
    if (impossibleReason(e, recording) !== undefined) continue;
    const entry: SensitivityEntry = {
      observation: o.id,
      element: e.name,
      key,
      effective: false,
      minus: null,
      plus: null,
    };
    for (const variant of ['minus', 'plus'] as const) {
      const base = ctx.data.skills.get(e.effectRef.rid);
      if (base === undefined) continue;
      const def = variantDefinition(base, e.effectRef, variant, battleSeconds);
      if (def === undefined) continue;
      try {
        const skills = new Map(ctx.data.skills);
        skills.set(e.effectRef.rid, def);
        const pv = predict(o, recording, { ...ctx.data, skills }, cache, `${setupKey}|${e.name}|${variant}`);
        const { diff, ok } = compareValue(p0, pv, o.compare!.tolerance);
        entry[variant] = Number.isFinite(diff) ? diff : null;
        if (!ok) entry.effective = true;
      } catch (err) {
        // 計算できない形（外すと定義が崩れるなど）は、効きうるとみる
        entry.effective = true;
        entry.error = `${variant}: ${(err as Error).message}`;
      }
    }
    out.push(entry);
  }
  return out;
}

/** 確定の結論の根拠で、sim と比べる観測値（重ねずに 1 回ずつ） */
export function sensitivityTargets(observations: readonly Observation[], ctx: RelevanceContext): Observation[] {
  const ids = new Set(ctx.claims.filter((c) => c.state === '確定').flatMap((c) => c.observations));
  return observations.filter((o) => ids.has(o.id) && usesSensitivity(o));
}

/** 読み込んだ感度の結果に、指定の観測値の感度をその場で計算して重ねる（records:new・records:close。新しい観測値は結果が無いので） */
export function withFreshSensitivity(
  observations: readonly Observation[],
  ctx: SensitivityContext,
  loaded: ReadonlyMap<string, SensitivityEntry>,
): Map<string, SensitivityEntry> {
  const out = new Map(loaded);
  const cache = new Map<string, SimResult>();
  for (const o of observations)
    for (const e of sensitivityOf(o, ctx, cache)) out.set(`${e.observation}|${e.element}`, e);
  return out;
}
