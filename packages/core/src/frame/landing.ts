// Stage 18-C（plan/design-stage18.md 12.3 節）: 条件が「自動」の枠の、着地点ごとの条件（コア命中率・距離ボーナス・弾丸命中率）。
// calc と sim で共通。着地点は敵の出来事（的のジャンプ）だけで決まり、射撃やバフには依らないので、1 パス目の前に決まる。
//
// - 距離ボーナス: 着地点の距離の範囲が、キャラの bonusRange に丸ごと入るか（C-0026・C-0031・C-0044）。
// - コア命中率: 的の表の値 p（着地点の id → 帯 → all の順で引く）に、常時の命中率▲ N で min(1, p ÷ (1 − N)²)。N ≥ 1 なら 1
//   （C-0036・C-0037）。N は枠の常時の BuffTotals.hitRate（育成の効果層・常時パッシブ）。持続の▲（フルバーストの頭で配られるもの）は効かせない。
// - 弾丸命中率: 的の表の値。通常攻撃のダメージと 1 パス目のゲージに掛ける（Stage 15 の condition.hitRate と同じ扱い）。
// - 表が null（未測定）の項目・的の表の無い敵・並びより後の区間は、手入力の値（slot.condition）を使い、注記を出す。
// - 配分（中遠の 3 か所）の区間は、着地点ごとの 1 トリガーの値を重みで足す（Σ w_k × T_k）。
import {
  computeTriggerDamage,
  conditionNotes,
  type EnemyInput,
  type ModelNote,
  type TriggerDamage,
  type TriggerDamageInput,
} from '../damage.ts';
import { LANDING_BAND_LABEL, LANDING_BANDS } from '../enemies.ts';
import type { SlotBuffState } from '../skills/timeline.ts';
import type { SlotCondition, TeamSlotInput } from '../team.ts';
import type { CharacterData, LandingBand, LandingPoint, TargetProfile, TargetRateTable } from '../types.ts';
import { FPS } from '../weapons.ts';

export type ConditionMode = 'manual' | 'auto';

/** 着地点の区間 1 つ（フレーム。[start, end)）。landing は着地点か配分の id、null は着地点が未測定 */
export type LandingFrameSpan = { start: number; end: number; landing: string | null };

/** 着地点 1 か所ぶんの条件と重み。手入力の枠・未測定の区間は landing が null で重み 1 */
export type LandingPart = { landing: LandingPoint | null; weight: number; condition: SlotCondition };

/** 着地点の計画（自動の枠が 1 つも無い、または的の表の無い敵では作らない） */
export type LandingPlan = {
  /** [0, frames) を隙間なく覆う */
  spans: LandingFrameSpan[];
  /** 枠ごと: 条件が自動で、的の表がある */
  autoSlots: boolean[];
  /** 枠ごと: 着地点の id（null = 未測定）→ 条件の配分。自動でない枠は null */
  parts: (ReadonlyMap<string | null, readonly LandingPart[]> | null)[];
  /** 枠ごと: 掛けた常時の命中率▲ N（自動でない枠は 0） */
  hitRateUp: number[];
};

/** 自動で使った条件の平均（発数で重みを付けた）。画面の条件欄と CLI の表示用 */
export type AutoConditionSummary = {
  /** 射撃の数（1 パス目の射撃の列） */
  shots: number;
  /** コア命中率 P(コア｜命中) の発数平均 */
  coreHitRate: number;
  /** 距離ボーナスが乗った発の割合 */
  distanceBonus: number;
  /** 弾丸命中率の発数平均 */
  hitRate: number;
  /** 掛けた常時の命中率▲ */
  hitRateUp: number;
};

/** 枠の条件が自動か（省略は手入力）。的の表が無い敵では、自動でも手入力の値を使う（注記を出す） */
export function isAutoCondition(slot: Pick<TeamSlotInput, 'conditionMode'>): boolean {
  return slot.conditionMode === 'auto';
}

/** 表の値（着地点の id → 帯 → all の順）。null = 未測定 */
export function targetRateOf(table: TargetRateTable, character: CharacterData, landing: LandingPoint): number | null {
  const row = table[character.weaponType];
  if (row === null || row === undefined) return null;
  return row[landing.id] ?? row[landing.band] ?? row.all ?? null;
}

/**
 * C-0036・C-0037: 常時の命中率▲ N で、コア命中率 p を min(1, p ÷ (1 − N)²) にする。N ≥ 1 なら 1。
 * N ≤ 0 は変えない（命中率▼の効き方は測っていない。注記を出す）
 */
export function coreHitRateWithHitRateUp(p: number, hitRateUp: number): number {
  if (hitRateUp <= 0) return p;
  if (hitRateUp >= 1) return 1;
  return Math.min(1, p / (1 - hitRateUp) ** 2);
}

/** 着地点の距離の範囲が bonusRange に丸ごと入るか（RL のように bonusRange が無ければ false） */
export function distanceBonusAt(character: CharacterData, landing: LandingPoint): boolean {
  const range = character.bonusRange;
  if (range === null) return false;
  return range.min <= landing.range[0] && landing.range[1] <= range.max;
}

/** 着地点 1 か所での自動の条件。表が null の項目は手入力の値 */
export function autoConditionAt(
  profile: TargetProfile,
  landing: LandingPoint,
  character: CharacterData,
  hitRateUp: number,
  manual: SlotCondition,
): SlotCondition {
  const core = targetRateOf(profile.coreHitRate, character, landing);
  const bullet = targetRateOf(profile.bulletHitRate, character, landing);
  return {
    coreHitRate: core === null ? manual.coreHitRate : coreHitRateWithHitRateUp(core, hitRateUp),
    distanceBonus: distanceBonusAt(character, landing),
    fullCharge: manual.fullCharge,
    hitRate: bullet === null ? (manual.hitRate ?? 1) : bullet,
  };
}

/** 着地点か配分の id を、着地点と重みの列にする。無い id は RangeError */
export function landingMix(profile: TargetProfile, id: string): { landing: LandingPoint; weight: number }[] {
  const mix = profile.mixes[id];
  const find = (landingId: string): LandingPoint => {
    const landing = profile.landings.find((l) => l.id === landingId);
    if (landing === undefined) throw new RangeError(`unknown landing ${landingId} in ${profile.id}`);
    return landing;
  };
  if (mix === undefined) return [{ landing: find(id), weight: 1 }];
  return mix.map(([landingId, weight]) => ({ landing: find(landingId), weight }));
}

/** 秒 → フレーム（frame/events.ts の狙えない窓と同じ四捨五入） */
function frameOf(seconds: number): number {
  return Math.round(seconds * FPS);
}

/**
 * 敵の着地点の区間（秒）をフレームにし、[0, frames) を隙間なく覆う列にする。着地点の区間が無ければ、全体を初期位置にする。
 * 区間の外（着地点の列が戦闘時間より短いなど）は null（未測定）
 */
export function landingFrameSpans(enemy: EnemyInput, frames: number): LandingFrameSpan[] {
  const target = enemy.target;
  if (target === undefined || frames <= 0) return [];
  const source = enemy.landings ?? [{ start: 0, end: frames / FPS, landing: target.initialLanding }];
  const spans: LandingFrameSpan[] = [];
  let at = 0;
  const push = (end: number, landing: string | null): void => {
    const last = spans[spans.length - 1];
    if (last !== undefined && last.landing === landing) last.end = end;
    else spans.push({ start: at, end, landing });
    at = end;
  };
  for (const s of [...source].sort((a, b) => a.start - b.start)) {
    const start = Math.max(at, Math.min(frames, frameOf(s.start)));
    const end = Math.min(frames, frameOf(s.end));
    if (start > at) push(start, null);
    if (end > start) push(end, s.landing);
  }
  if (at < frames) push(frames, null);
  return spans;
}

/**
 * 自動の枠の着地点の計画。自動の枠が無い、または的の表が無ければ null（手入力と同じ計算になる）。
 * passive は枠ごとの常時の状態（resolvePassiveStates の結果。命中率▲ N を取る）
 */
export function planLandings(
  slots: readonly (TeamSlotInput | null)[],
  enemy: EnemyInput,
  frames: number,
  passive: readonly (SlotBuffState | null)[],
): LandingPlan | null {
  const profile = enemy.target;
  if (profile === undefined) return null;
  const autoSlots = slots.map((slot) => slot !== null && isAutoCondition(slot));
  if (!autoSlots.some(Boolean)) return null;
  const spans = landingFrameSpans(enemy, frames);
  const ids = [...new Set(spans.map((s) => s.landing))];
  const hitRateUp = slots.map((_, i) => (autoSlots[i] ? (passive[i]?.buffs.hitRate ?? 0) : 0));
  const parts = slots.map((slot, i) => {
    if (slot === null || !autoSlots[i]) return null;
    const map = new Map<string | null, LandingPart[]>();
    for (const id of ids) {
      map.set(
        id,
        id === null
          ? [{ landing: null, weight: 1, condition: slot.condition }]
          : landingMix(profile, id).map(({ landing, weight }) => ({
              landing,
              weight,
              condition: autoConditionAt(profile, landing, slot.character, hitRateUp[i]!, slot.condition),
            })),
      );
    }
    return map;
  });
  return { spans, autoSlots, parts, hitRateUp };
}

const MANUAL_PART_CACHE = new WeakMap<SlotCondition, readonly LandingPart[]>();

/** 枠 slotIndex の、着地点 landing での条件の配分。計画が無い・自動でない枠は手入力の値 1 つ */
export function landingPartsOf(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition'>,
  slotIndex: number,
  landing: string | null | undefined,
): readonly LandingPart[] {
  const found = plan?.parts[slotIndex]?.get(landing ?? null);
  if (found !== undefined) return found;
  let manual = MANUAL_PART_CACHE.get(slot.condition);
  if (manual === undefined) {
    manual = [{ landing: null, weight: 1, condition: slot.condition }];
    MANUAL_PART_CACHE.set(slot.condition, manual);
  }
  return manual;
}

/** 配分の弾丸命中率（Σ w × 弾丸命中率）。1 パス目のゲージに使う */
export function mixedHitRate(parts: readonly LandingPart[]): number {
  if (parts.length === 1) return parts[0]!.condition.hitRate ?? 1;
  return parts.reduce((sum, p) => sum + p.weight * (p.condition.hitRate ?? 1), 0);
}

/**
 * 枠ごとの弾丸命中率の区間（1 パス目のゲージ用）。自動でない枠は null（TimelineSlot.hitRate の定数のまま）
 */
export function hitRateSpansOf(plan: LandingPlan | null, slotCount: number): (LandingHitRateSpan[] | null)[] {
  return Array.from({ length: slotCount }, (_, i) => {
    const parts = plan?.parts[i];
    if (plan === null || parts === null || parts === undefined) return null;
    return plan.spans.map((s) => ({ start: s.start, end: s.end, hitRate: mixedHitRate(parts.get(s.landing)!) }));
  });
}

export type LandingHitRateSpan = { start: number; end: number; hitRate: number };

/**
 * 条件の配分で 1 トリガーの値を出す。配分が 1 つならそのまま computeTriggerDamage（手入力と 1 の位まで同じ）、
 * 複数なら Σ w_k × T_k（攻撃力・バフなど条件に依らない項目は同じ値）
 */
export function landingTriggerDamage(
  input: Omit<TriggerDamageInput, 'condition'>,
  parts: readonly LandingPart[],
  fullBurst: boolean,
): TriggerDamage {
  if (parts.length === 1) return computeTriggerDamage({ ...input, condition: { ...parts[0]!.condition, fullBurst } });
  const triggers = parts.map((p) => ({
    weight: p.weight,
    t: computeTriggerDamage({ ...input, condition: { ...p.condition, fullBurst } }),
  }));
  const sum = (f: (t: TriggerDamage) => number): number => triggers.reduce((a, { weight, t }) => a + weight * f(t), 0);
  const first = triggers[0]!.t;
  return {
    ...first,
    boost: {
      core: sum((t) => t.boost.core),
      crit: first.boost.crit,
      distance: sum((t) => t.boost.distance),
      fullBurst: first.boost.fullBurst,
      total: sum((t) => t.boost.total),
    },
    normal: sum((t) => t.normal),
    perShot: sum((t) => t.perShot),
    perTrigger: sum((t) => t.perTrigger),
    hitRate: sum((t) => t.hitRate),
  };
}

/** 自動で使った条件の平均（1 パス目の射撃の列で発数の重みを付ける）。自動でない枠は null */
export function autoConditionSummary(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  shotFrames: readonly number[],
): AutoConditionSummary | null {
  const parts = plan?.parts[slotIndex];
  if (plan === null || parts === null || parts === undefined) return null;
  let shots = 0;
  let core = 0;
  let distance = 0;
  let hit = 0;
  let k = 0;
  for (const span of plan.spans) {
    while (k < shotFrames.length && shotFrames[k]! < span.start) k += 1;
    let n = 0;
    while (k < shotFrames.length && shotFrames[k]! < span.end) {
      n += 1;
      k += 1;
    }
    if (n === 0) continue;
    for (const p of parts.get(span.landing)!) {
      core += n * p.weight * p.condition.coreHitRate;
      distance += n * p.weight * (p.condition.distanceBonus && slot.character.bonusRange !== null ? 1 : 0);
      hit += n * p.weight * (p.condition.hitRate ?? 1);
    }
    shots += n;
  }
  const mean = (v: number) => (shots > 0 ? v / shots : 0);
  return {
    shots,
    coreHitRate: mean(core),
    distanceBonus: mean(distance),
    hitRate: mean(hit),
    hitRateUp: plan.hitRateUp[slotIndex] ?? 0,
  };
}

/**
 * 枠の条件の注記（calc と sim で共通）。弾丸命中率の近似（damage.ts の conditionNotes）は、自動の枠なら使った弾丸命中率の
 * 発数平均で出す。自動の枠の注記（landingNotes）を続ける
 */
export function slotConditionNotes(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character' | 'conditionMode'>,
  slotIndex: number,
  enemy: EnemyInput,
  summary: AutoConditionSummary | null,
): ModelNote[] {
  // 配分の重みの和の丸めで 1 をわずかに下回らないように、平均は 1e-9 で丸める
  const hitRate =
    summary !== null && summary.shots > 0 ? { hitRate: Math.round(summary.hitRate * 1e9) / 1e9 } : slot.condition;
  return [...conditionNotes(hitRate), ...landingNotes(plan, slot, slotIndex, enemy)];
}

const pct = (v: number) => `${Math.round(v * 10000) / 100}%`;

function mixLabel(profile: TargetProfile, id: string): { ja: string; en: string } {
  const band = (LANDING_BANDS as readonly string[]).includes(id) ? LANDING_BAND_LABEL[id as LandingBand] : null;
  const weights = profile.mixes[id]!.map(([, w]) => Math.round(w * 100) / 10).join(' : ');
  const n = profile.mixes[id]!.length;
  return {
    ja: `${band?.ja ?? id}の着地点は ${n} か所を ${weights} で配分`,
    en: `${band?.en ?? id} landings are split over ${n} points (${weights})`,
  };
}

/**
 * 自動の枠の注記。的の表が無い敵では「この敵の条件は未測定」、未測定の項目・区間は手入力の値を使ったこと、
 * 着地直後の外れ（RL・SR）・MG の撃ち始めを未実装・近似として知らせる。自動でない枠は空
 */
export function landingNotes(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character' | 'conditionMode'>,
  slotIndex: number,
  enemy: EnemyInput,
): ModelNote[] {
  if (!isAutoCondition(slot)) return [];
  const manual = slot.condition;
  const manualText = {
    ja: `コア命中率 ${pct(manual.coreHitRate)}・距離ボーナス ${manual.distanceBonus ? 'あり' : 'なし'}・弾丸命中率 ${pct(manual.hitRate ?? 1)}`,
    en: `core hit rate ${pct(manual.coreHitRate)}, distance bonus ${manual.distanceBonus ? 'on' : 'off'}, bullet hit rate ${pct(manual.hitRate ?? 1)}`,
  };
  const profile = enemy.target;
  const parts = plan?.parts[slotIndex];
  if (profile === undefined || plan === null || parts === null || parts === undefined) {
    return [
      {
        level: 'unsupported',
        code: 'auto-condition-no-target',
        message: {
          ja: `この敵の条件（コア命中率・距離・弾丸命中率）は未測定。手入力の値（${manualText.ja}）で計算した`,
          en: `Conditions for this enemy are not measured; manual values are used (${manualText.en})`,
        },
      },
    ];
  }
  const notes: ModelNote[] = [];
  const weapon = slot.character.weaponType;
  const mixes = [...new Set(plan.spans.map((s) => s.landing))].filter(
    (id): id is string => id !== null && id in profile.mixes,
  );
  const n = plan.hitRateUp[slotIndex] ?? 0;
  const ja = [
    `${profile.name.ja}の表（単騎 AUTO の実測）でコア命中率・距離ボーナス・弾丸命中率を決めた`,
    ...mixes.map((id) => mixLabel(profile, id).ja),
    ...(n > 0 ? [`常時の命中率▲ ${pct(n)} でコア命中率を 1/(1 − N)² 倍（上限 1）`] : []),
    'フルバースト中などに配られる持続の命中率▲はコア命中率に効かせていない',
  ];
  const en = [
    `Core hit rate, distance bonus and bullet hit rate come from the ${profile.name.en} table (solo AUTO recordings)`,
    ...mixes.map((id) => mixLabel(profile, id).en),
    ...(n > 0 ? [`constant hit rate up ${pct(n)} scales core hit rate by 1/(1 − N)² (max 1)`] : []),
    'timed hit rate buffs (e.g. given at full burst) do not change core hit rate',
  ];
  notes.push({ level: 'approx', code: 'auto-condition', message: { ja: ja.join('。'), en: en.join('; ') } });
  if (n < 0) {
    notes.push({
      level: 'unsupported',
      code: 'hit-rate-down',
      message: {
        ja: `常時の命中率▼（${pct(n)}）はコア命中率に効かせていない（効き方を測っていない）`,
        en: `Constant hit rate down (${pct(n)}) does not change core hit rate (not measured)`,
      },
    });
  }
  const landings = profile.landings;
  const unmeasured: { ja: string; en: string }[] = [];
  if (landings.some((l) => targetRateOf(profile.coreHitRate, slot.character, l) === null)) {
    unmeasured.push({
      ja: `コア命中率（${pct(manual.coreHitRate)}）`,
      en: `core hit rate (${pct(manual.coreHitRate)})`,
    });
  }
  if (landings.some((l) => targetRateOf(profile.bulletHitRate, slot.character, l) === null)) {
    unmeasured.push({
      ja: `弾丸命中率（${pct(manual.hitRate ?? 1)}）`,
      en: `bullet hit rate (${pct(manual.hitRate ?? 1)})`,
    });
  }
  if (unmeasured.length > 0) {
    notes.push({
      level: 'unsupported',
      code: 'auto-condition-unmeasured',
      message: {
        ja: `${weapon} の${unmeasured.map((u) => u.ja).join('・')}はこの的で未測定なので、手入力の値を使った`,
        en: `${weapon} ${unmeasured.map((u) => u.en).join(', ')} not measured on this target; manual values are used`,
      },
    });
  }
  const unknown = plan.spans.find((s) => s.landing === null);
  if (unknown !== undefined) {
    notes.push({
      level: 'unsupported',
      code: 'landing-unmeasured',
      message: {
        ja: `${(unknown.start / FPS).toFixed(1)} 秒以降の着地点は未測定なので、手入力の値（${manualText.ja}）で計算した`,
        en: `Landing points after ${(unknown.start / FPS).toFixed(1)} s are not measured; manual values are used (${manualText.en})`,
      },
    });
  }
  if (weapon === 'RL' || weapon === 'SR') {
    notes.push({
      level: 'unsupported',
      code: 'landing-first-shot-miss',
      message: {
        ja: '着地直後の 1 発はコアを外すことがある（紅蓮：ブラックシャドウ単騎で 180 秒に 2 発、約 1%）。未実装',
        en: 'The first shot after a landing can miss the core (2 shots in 180 s, about 1%, on a solo RL); not modeled',
      },
    });
  }
  if (weapon === 'MG') {
    notes.push({
      level: 'approx',
      code: 'mg-spin-up-core',
      message: {
        ja: 'MG の撃ち始め（約 10 ヒット）のコアの外れは、表の値（帯の平均）に含めた。撃ち始めの回数が録画と違う場面（ジャンプの無い初期位置・装弾数▲）では 0.5〜1% ずれうる',
        en: 'Core misses in the first ~10 MG hits are folded into the band averages; scenes with a different number of fire starts can differ by 0.5-1%',
      },
    });
  }
  return notes;
}
