// 最小構成の検査の感度（plan/design-minimal-relevance.md 4.1 節・10.6 節）。sim と比べる観測値 O と、その録画の定義の効果 E の組ごとに、
// 基準の予測 P0（O の compare.setup のまま）、E を定義から外した予測 P−、E が持続の効果なら戦闘の始めから終わりまで効かせた予測 P+ を出し、
// P− か P+ が P0 から許容（compare.tolerance）を超えて動けば「効きうる」とする。E のきっかけと維持時間は信じない（6c）。
// ほかの要素はモデルの窓のまま。1 つずつ変える（未確定どうしの重なりは見ない。8 節の限界）。
// 端だけ未確定の要素（plan/design-minimal-edge.md 3.2 節）は、P−・P+ の代わりに、窓の端を仮説の範囲の両端まで広げる・縮める 2 通りを回す。
// 計算は全部で 1 分ほどかかるので records:minimal で回し（既定は入力の変わった観測値だけ。reusedSensitivity）、結果を
// records/minimal/sensitivity.json に置く。records:check はそれを読む。
import { runSimulation, type SimResult } from '../sim/engine.ts';
import { isStatContent, type EdgeShift, type SkillDefinition, type SkillEffect } from '../skills/types.ts';
import { METRICS, buildTeamInput, compareValue, type Observation, type RecordsData } from './observations.ts';
import type { RecordingEntry } from './recordings.ts';
import {
  edgeRangeOf,
  elementsOf,
  impossibleReason,
  sameEdgeRange,
  sensitivityKey,
  unconfirmedReason,
  usesSensitivity,
  type EdgeRange,
  type MinimalElement,
  type RelevanceContext,
  sensitivityId,
  type SensitivityEntry,
  type SensitivityIndex,
} from './relevance.ts';

type Variant = 'minus' | 'plus';

/** 持続の効果（timed・状態の付与）の維持ときっかけを、戦闘の始めから battleSeconds 秒にする */
function alwaysOn<T extends SkillEffect>(effect: T, battleSeconds: number): T {
  const always = { ...effect, trigger: 'battleStart', durationSeconds: battleSeconds } as Record<string, unknown>;
  for (const k of ['durationRef', 'durationShots', 'durationShotsRef', 'durationUntil', 'condition']) delete always[k];
  return always as unknown as T;
}

/**
 * 定義から効果を外す（minus）か、持続の効果を戦闘の始めから終わりまで効かせる（plus）。plus を当てられない効果は undefined。
 * 名前の付いた状態の語彙編（plan/design-named-state-impl.md 1.8 節）: 状態の付与の minus はその付与の発火だけを外し（中身は同じ状態の
 * ほかの付与に移す）、plus は状態を戦闘の始めから付ける（同じ状態のほかの付与は外し、中身はこの付与に集める）。中身の項目の要素
 * （subIndex）の minus は項目を外し、plus は項目を付与の対象の欄のまま戦闘の始めからの timed にする
 */
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
  if (ref.subIndex !== undefined) {
    if (effect.kind !== 'state') return undefined;
    const item = effect.contents?.[ref.subIndex];
    if (item === undefined) return undefined;
    const rest = effect.contents!.filter((_, j) => j !== ref.subIndex);
    const { contents: _contents, ...grant } = effect;
    entry.effects[ref.index] = rest.length > 0 ? { ...grant, contents: rest } : grant;
    if (variant === 'minus') return copy;
    // 2 段目の段 14 の PR 3: 最大スタック数▲の項目は timed にできない（plus は当てない）
    if (!isStatContent(item)) return undefined;
    const { kind: _kind, state: _state, claims: _claims, maxStacks: _m, maxStacksRef: _mr, ...fields } = grant;
    const { claims: _itemClaims, ...value } = item;
    entry.effects.push(alwaysOn({ ...fields, ...value, kind: 'timed' } as SkillEffect, battleSeconds));
    return copy;
  }
  // 同じ根（基礎版か宝物版）の、同じ状態のほかの付与
  const entries = Object.values((ref.root === 'skills' ? copy.skills : copy.treasureSkills) ?? {});
  const others = (state: string) =>
    entries.flatMap((x) =>
      x.effects.flatMap((e, k) => (e.kind === 'state' && e.state === state && e !== effect ? [{ x, e, k }] : [])),
    );
  if (variant === 'minus') {
    if (effect.kind === 'state' && effect.contents !== undefined) {
      const next = others(effect.state)[0];
      if (next !== undefined && next.e.kind === 'state') next.e.contents = effect.contents;
    }
    entry.effects.splice(ref.index, 1);
    return copy;
  }
  if (effect.kind === 'state') {
    const rest = others(effect.state);
    const contents = effect.contents ?? rest.flatMap(({ e }) => (e.kind === 'state' ? (e.contents ?? []) : []));
    const always = alwaysOn(effect, battleSeconds);
    entry.effects[ref.index] = contents.length > 0 ? { ...always, contents } : always;
    // 後ろから外す（同じ効果の列の番号がずれないように）
    for (const { x, k } of [...rest].reverse()) x.effects.splice(k, 1);
    return copy;
  }
  // 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果は、while を外して戦闘中ずっと効かせる
  if (effect.kind === 'passive' && effect.while !== undefined) {
    const { while: _while, ...always } = effect;
    entry.effects[ref.index] = always;
    return copy;
  }
  if (effect.kind !== 'timed') return undefined;
  entry.effects[ref.index] = alwaysOn(effect, battleSeconds);
  return copy;
}

/** 端を広げる（widen）・縮める（narrow）ずらし（plan/design-minimal-edge.md 3.2 節）。動かさない変換は undefined */
export function edgeShiftOf(range: EdgeRange, variant: 'widen' | 'narrow'): EdgeShift | undefined {
  const shift =
    variant === 'widen' ? { start: range.start[0], end: range.end[1] } : { start: range.start[1], end: range.end[0] };
  return shift.start === 0 && shift.end === 0 ? undefined : shift;
}

/** timed の効果に端のずらし（edgeShift）を付けた定義。timed でなければ undefined */
export function edgeDefinition(
  def: SkillDefinition,
  ref: NonNullable<MinimalElement['effectRef']>,
  shift: EdgeShift,
): SkillDefinition | undefined {
  const copy = structuredClone(def);
  const entry = ref.root === 'skills' ? copy.skills[ref.slot] : copy.treasureSkills?.[ref.slot];
  const effect = entry?.effects[ref.index];
  if (effect === undefined || effect.kind !== 'timed' || ref.subIndex !== undefined) return undefined;
  entry!.effects[ref.index] = { ...effect, edgeShift: shift };
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

export type SensitivityContext = RelevanceContext;

/**
 * 観測値の感度の結果。対象は、根拠が確定でなく、その録画で起きうる定義の効果（結論の対象かどうかは結論ごとに違うので問わない）。
 * 基準の予測が出せない観測値は空（静的な判定に戻る）
 */
type EffectRef = NonNullable<MinimalElement['effectRef']>;
const hasEffectRef = (e: MinimalElement): e is MinimalElement & { effectRef: EffectRef } => e.effectRef !== undefined;

/** 感度を出す要素（根拠が確定でなく、その録画で起きうる定義の効果）と端の範囲。sensitivityOf と reusedSensitivity が同じものを選ぶ */
function sensitivityElements(
  recording: RecordingEntry,
  ctx: RelevanceContext,
): { element: MinimalElement & { effectRef: EffectRef }; edge: EdgeRange | undefined }[] {
  const byId = new Map(ctx.claims.map((c) => [c.id, c]));
  return elementsOf(recording, ctx).flatMap((e) =>
    e.type === 'effect' &&
    hasEffectRef(e) &&
    unconfirmedReason(e, recording, ctx, byId) !== undefined &&
    impossibleReason(e, recording) === undefined
      ? [{ element: e, edge: edgeRangeOf(e, recording, ctx, byId) }]
      : [],
  );
}

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
    p0 = predict(o, recording, ctx, cache, setupKey);
  } catch {
    return [];
  }
  const key = sensitivityKey(o, recording, ctx);
  const battleSeconds = o.compare!.setup.durationSeconds ?? 180;
  const out: SensitivityEntry[] = [];
  for (const { element: e, edge } of sensitivityElements(recording, ctx)) {
    const entry: SensitivityEntry = {
      observation: o.id,
      element: e.name,
      key,
      effective: false,
      minus: null,
      plus: null,
    };
    const base = ctx.skills.get(e.effectRef.rid);
    if (edge !== undefined) {
      entry.edge = { range: edge, widen: null, narrow: null };
      for (const variant of ['widen', 'narrow'] as const) {
        const shift = edgeShiftOf(edge, variant);
        if (base === undefined || shift === undefined) continue;
        try {
          const def = edgeDefinition(base, e.effectRef, shift);
          if (def === undefined) throw new Error('timed でない効果');
          const skills = new Map(ctx.skills);
          skills.set(e.effectRef.rid, def);
          const pv = predict(o, recording, { ...ctx, skills }, cache, `${setupKey}|${e.name}|${variant}`);
          const { diff, ok } = compareValue(p0, pv, o.compare!.tolerance);
          entry.edge[variant] = Number.isFinite(diff) ? diff : null;
          if (!ok) entry.effective = true;
        } catch (err) {
          entry.effective = true;
          entry.error = `${variant}: ${(err as Error).message}`;
        }
      }
      out.push(entry);
      continue;
    }
    for (const variant of ['minus', 'plus'] as const) {
      if (base === undefined) continue;
      const def = variantDefinition(base, e.effectRef, variant, battleSeconds);
      if (def === undefined) continue;
      try {
        const skills = new Map(ctx.skills);
        skills.set(e.effectRef.rid, def);
        const pv = predict(o, recording, { ...ctx, skills }, cache, `${setupKey}|${e.name}|${variant}`);
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

/**
 * 前の結果を使い回せるなら、その観測値の組を返す（plan/design-workflow-simplification-5.md 7.2 節）。sensitivityOf が出す要素の
 * どれにも、鍵と端の範囲が今と同じ前の組があるときだけ使い回す。1 つでも無ければ undefined（その観測値を計算し直す）。
 * 鍵はモデルのコードを含まないので、全部を計算し直す records:minimal -- --all をときどき回して差が無いことを見る
 */
export function reusedSensitivity(
  o: Observation,
  ctx: SensitivityContext,
  previous: SensitivityIndex,
): SensitivityEntry[] | undefined {
  if (!usesSensitivity(o)) return [];
  const recording = ctx.recordings.get(o.recording);
  if (recording === undefined) return [];
  const key = sensitivityKey(o, recording, ctx);
  const out: SensitivityEntry[] = [];
  for (const { element, edge } of sensitivityElements(recording, ctx)) {
    const p = previous.get(sensitivityId(o.id, element.name));
    if (p === undefined || p.key !== key || !sameEdgeRange(p.edge?.range, edge)) return undefined;
    out.push(p);
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
  loaded: SensitivityIndex,
): Map<string, SensitivityEntry> {
  const out = new Map(loaded);
  const cache = new Map<string, SimResult>();
  for (const o of observations)
    for (const e of sensitivityOf(o, ctx, cache)) out.set(sensitivityId(e.observation, e.element), e);
  return out;
}
