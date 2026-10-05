// Stage 18-C（plan/design-stage18.md 12.3 節）: 条件が「自動」の枠の、着地点ごとの条件（コア命中率・距離ボーナス・弾丸命中率）。
// calc と sim で共通。着地点は敵の出来事（的のジャンプ）だけで決まり、射撃やバフには依らないので、1 パス目の前に決まる。
//
// - 距離ボーナス: 着地点の距離の範囲が、キャラの bonusRange に丸ごと入るか（C-0026・C-0031・C-0044）。
// - コア命中率: 的の表の値 p（着地点の id → 帯 → all の順で引く）に、命中率▲ N で min(1, p ÷ (1 − N)²)。N ≥ 1 なら 1
//   （C-0036・C-0037）。計画（planLandings）は枠の常時の BuffTotals.hitRate（育成の効果層・常時パッシブ）で出し、
//   持続の▲（フルバーストの頭などで配られるもの。C-0170）が効いている区間は、使う時点で区間の N で出し直す（landingPartsWith）。
// - 弾丸命中率: 的の表の値。通常攻撃のダメージと 1 パス目のゲージに掛ける（Stage 15 の condition.hitRate と同じ扱い）。
//   AR・SMG・MG は命中率▲ N で外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にする（C-0192。確かめたのは SMG の遠だけ。plan/design-hit-rate-up-bullet-h2.md）。
//   コア命中率と同じく、計画は常時の N で出し、持続の▲の区間は landingPartsWith で出し直す（1 パス目のゲージは計画の値のまま）。
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
import { SKILL_SLOTS } from '../skills/types.ts';
import type { SlotBuffState } from '../skills/timeline.ts';
import type { SlotCondition, TeamSlotInput } from '../team.ts';
import type {
  CharacterData,
  LandingBand,
  LandingPoint,
  SkillSlot,
  TargetProfile,
  TargetRateByProjectile,
  TargetRateRow,
  TargetRateTable,
} from '../types.ts';
import { endSecondsToFrame, framesToGameSeconds, gameSecondsToFrame } from '../time.ts';
import { windowEndFirstShotFrames } from './shooter.ts';

export type ConditionMode = 'manual' | 'auto';

/**
 * 着地点の区間 1 つ（フレーム。[start, end)）。landing は着地点か配分の id、null は着地点が未測定。
 * band は距離帯（配分は構成する着地点の帯がそろっていればその帯。表示用）
 */
export type LandingFrameSpan = { start: number; end: number; landing: string | null; band: LandingBand | null };

/** 着地点か配分の id の距離帯。配分の着地点の帯がそろわない・無い id は null */
export function landingBandOf(
  profile: Pick<TargetProfile, 'landings' | 'mixes'>,
  id: string | null,
): LandingBand | null {
  if (id === null) return null;
  const ids = profile.mixes[id]?.map(([landing]) => landing) ?? [id];
  const bands = new Set(ids.map((x) => profile.landings.find((l) => l.id === x)?.band ?? null));
  return bands.size === 1 ? ([...bands][0] ?? null) : null;
}

/**
 * 着地点 1 か所ぶんの条件と重み。手入力の枠・未測定の区間は landing が null で重み 1。
 * measuredHitRate は弾丸命中率を的の表から取ったか（省略 false。SG のゲージの割合を決める。plan/design-sg-hit-rate.md 3 節）。
 * tableCoreHitRate は的の表のコア命中率（命中率▲を掛ける前。表が null・手入力は省略）。区間の N で出し直すのに使う。
 * tableBulletHitRate は的の表の弾丸命中率（命中率▲を掛ける前。▲を効かせる武器種で、表から取ったときだけ）
 */
export type LandingPart = {
  landing: LandingPoint | null;
  weight: number;
  condition: SlotCondition;
  measuredHitRate?: boolean;
  tableCoreHitRate?: number;
  tableBulletHitRate?: number;
};

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
  /** 掛けた命中率▲ N（常時 + 持続。発数で重みを付けた平均） */
  hitRateUp: number;
  /** 持続の命中率▲が効いている区間で撃った発があったか */
  timedHitRateUp: boolean;
};

/** 枠の条件が自動か（省略は手入力）。的の表が無い敵では、自動でも手入力の値を使う（注記を出す） */
export function isAutoCondition(slot: Pick<TeamSlotInput, 'conditionMode'>): boolean {
  return slot.conditionMode === 'auto';
}

/** 弾の種類のキー `<fireType>:<弾速>`（plan/design-rl-core-by-projectile.md 3.1 節）。飛ぶ弾でなければ null */
export function projectileKeyOf(character: CharacterData): string | null {
  const projectile = character.shot.projectile;
  return projectile === undefined ? null : `${character.shot.fireType}:${projectile.speed}`;
}

/**
 * V-0119: 弾の種類の行のキー。爆発の範囲まで書いた `<fireType>:<弾速>:<爆発の範囲>` の行があればそれ、無ければ
 * `<fireType>:<弾速>`（爆発の範囲で振る舞いの違う弾だけ、行を分ける。C-0197）。飛ぶ弾でなければ null
 */
function projectileRowKeyOf(by: TargetRateByProjectile['byProjectile'], character: CharacterData): string | null {
  const key = projectileKeyOf(character);
  const range = character.shot.projectile?.explosionRange;
  if (key === null) return null;
  const withRange = range === undefined ? null : `${key}:${range}`;
  return withRange !== null && withRange in by ? withRange : key;
}

function isByProjectile(cell: TargetRateRow | TargetRateByProjectile): cell is TargetRateByProjectile {
  return 'byProjectile' in cell;
}

/** キャラの行（武器種の行。弾の種類ごとの行なら、そのキャラの弾の種類の行）。null = 未測定 */
export function rateRowOf(table: TargetRateTable, character: CharacterData): TargetRateRow | null {
  const cell = table[character.weaponType];
  if (cell === null || cell === undefined) return null;
  if (!isByProjectile(cell)) return cell;
  const key = projectileRowKeyOf(cell.byProjectile, character);
  return key === null ? null : (cell.byProjectile[key] ?? null);
}

/**
 * 弾の種類ごとの行に、そのキャラの弾の種類が未測定（null）と書いてあるか。測ってはいないが、表とは違うと分かっている
 * 弾の種類（C-0171 の外す側）の注記に使う。表に無いキー（新しい弾の種類）は false
 */
export function projectileRowListedUnmeasured(table: TargetRateTable, character: CharacterData): boolean {
  const cell = table[character.weaponType];
  if (cell === null || cell === undefined || !isByProjectile(cell)) return false;
  const key = projectileRowKeyOf(cell.byProjectile, character);
  return key !== null && key in cell.byProjectile && cell.byProjectile[key] === null;
}

/** 表の値（着地点の id → 帯 → all の順）。null = 未測定 */
export function targetRateOf(table: TargetRateTable, character: CharacterData, landing: LandingPoint): number | null {
  const row = rateRowOf(table, character);
  if (row === null) return null;
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

/**
 * C-0192: 命中率▲ N で、弾丸命中率 p の外れの割合 1 − p を (1 − p) ^ (1 ÷ (1 − N)²) にする（H2）。N ≥ 1 なら 1。
 * N ≤ 0 は変えない（命中率▼の効き方は測っていない）。確かめたのは SMG の遠だけ（plan/design-hit-rate-up-bullet-h2.md）
 */
export function bulletHitRateWithHitRateUp(p: number, hitRateUp: number): number {
  if (hitRateUp <= 0) return p;
  if (hitRateUp >= 1) return 1;
  return 1 - (1 - p) ** (1 / (1 - hitRateUp) ** 2);
}

/** 命中率▲を弾丸命中率に効かせる武器種（AR・SMG・MG。SG は C-0157 と H2 が合わないので効かせない） */
export function hitRateUpRaisesBulletHitRate(character: Pick<CharacterData, 'weaponType'>): boolean {
  const weapon = character.weaponType;
  return weapon === 'AR' || weapon === 'SMG' || weapon === 'MG';
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
  // V-0119: 1 発のヒット数は表にある弾の種類だけ（無ければ 1 発 1 ヒット）。手入力の条件には無い
  const hits = profile.hitsPerShot === undefined ? null : targetRateOf(profile.hitsPerShot, character, landing);
  return {
    coreHitRate: core === null ? manual.coreHitRate : coreHitRateWithHitRateUp(core, hitRateUp),
    distanceBonus: distanceBonusAt(character, landing),
    fullCharge: manual.fullCharge,
    hitRate:
      bullet === null
        ? (manual.hitRate ?? 1)
        : hitRateUpRaisesBulletHitRate(character)
          ? bulletHitRateWithHitRateUp(bullet, hitRateUp)
          : bullet,
    ...(hits === null || hits === 1 ? {} : { hitsPerShot: hits }),
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
  return gameSecondsToFrame(seconds);
}

/**
 * 敵の着地点の区間（秒）をフレームにし、[0, frames) を隙間なく覆う列にする。着地点の区間が無ければ、全体を初期位置にする。
 * 区間の外（着地点の列が戦闘時間より短いなど）は null（未測定）
 */
export function landingFrameSpans(enemy: EnemyInput, frames: number): LandingFrameSpan[] {
  const target = enemy.target;
  if (target === undefined || frames <= 0) return [];
  const source = enemy.landings ?? [{ start: 0, end: framesToGameSeconds(frames), landing: target.initialLanding }];
  const spans: LandingFrameSpan[] = [];
  let at = 0;
  const push = (end: number, landing: string | null): void => {
    const last = spans[spans.length - 1];
    if (last !== undefined && last.landing === landing) last.end = end;
    else spans.push({ start: at, end, landing, band: landingBandOf(target, landing) });
    at = end;
  };
  for (const s of [...source].sort((a, b) => a.start - b.start)) {
    const start = Math.max(at, Math.min(frames, frameOf(s.start)));
    const end = endSecondsToFrame(s.end, frames);
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
          : landingMix(profile, id).map(({ landing, weight }) => {
              const table = targetRateOf(profile.coreHitRate, slot.character, landing);
              const bullet = targetRateOf(profile.bulletHitRate, slot.character, landing);
              return {
                landing,
                weight,
                condition: autoConditionAt(profile, landing, slot.character, hitRateUp[i]!, slot.condition),
                measuredHitRate: bullet !== null,
                ...(table === null ? {} : { tableCoreHitRate: table }),
                ...(bullet === null || !hitRateUpRaisesBulletHitRate(slot.character)
                  ? {}
                  : { tableBulletHitRate: bullet }),
              };
            }),
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

const PARTS_WITH_CACHE = new WeakMap<LandingPlan, Map<string, readonly LandingPart[]>>();

/**
 * C-0170: landingPartsOf の条件のコア命中率を、命中率▲ hitRateUp（常時 + その区間の持続の▲。区間の状態の buffs.hitRate）で
 * 出し直す。C-0192: ▲を効かせる武器種は弾丸命中率も出し直す。計画の常時の N と同じなら計画の配分をそのまま返す。
 * 距離ボーナスは変えない
 */
export function landingPartsWith(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition'>,
  slotIndex: number,
  landing: string | null | undefined,
  hitRateUp: number,
): readonly LandingPart[] {
  const parts = landingPartsOf(plan, slot, slotIndex, landing);
  if (plan === null || !plan.autoSlots[slotIndex] || hitRateUp === (plan.hitRateUp[slotIndex] ?? 0)) return parts;
  if (!parts.some((p) => p.tableCoreHitRate !== undefined || p.tableBulletHitRate !== undefined)) return parts;
  let cache = PARTS_WITH_CACHE.get(plan);
  if (cache === undefined) {
    cache = new Map();
    PARTS_WITH_CACHE.set(plan, cache);
  }
  const key = `${slotIndex}|${landing === null || landing === undefined ? '' : `L:${landing}`}|${hitRateUp}`;
  let found = cache.get(key);
  if (found === undefined) {
    found = parts.map((p) =>
      p.tableCoreHitRate === undefined && p.tableBulletHitRate === undefined
        ? p
        : {
            ...p,
            condition: {
              ...p.condition,
              ...(p.tableCoreHitRate === undefined
                ? {}
                : { coreHitRate: coreHitRateWithHitRateUp(p.tableCoreHitRate, hitRateUp) }),
              ...(p.tableBulletHitRate === undefined
                ? {}
                : { hitRate: bulletHitRateWithHitRateUp(p.tableBulletHitRate, hitRateUp) }),
            },
          },
    );
    cache.set(key, found);
  }
  return found;
}

/**
 * ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 2.2 節）: 配分の 1 発のコアの命中の期待値
 * （Σ w × 弾丸命中率 × コア命中率）。敵のコアの有無は見ない（1 パス目が掛ける）
 */
export function mixedCoreHits(parts: readonly LandingPart[]): number {
  return parts.reduce((sum, p) => sum + p.weight * (p.condition.hitRate ?? 1) * p.condition.coreHitRate, 0);
}

/** 配分の弾丸命中率（Σ w × 弾丸命中率）。1 パス目のゲージに使う */
export function mixedHitRate(parts: readonly LandingPart[]): number {
  if (parts.length === 1) return parts[0]!.condition.hitRate ?? 1;
  return parts.reduce((sum, p) => sum + p.weight * (p.condition.hitRate ?? 1), 0);
}

/**
 * 枠ごとの弾丸命中率の区間（1 パス目のゲージ・命中の期待値用）。自動でない枠は null（TimelineSlot.hitRate の定数のまま）。
 * 値は計画の値（常時の命中率▲だけ）。持続の▲の効いているフレームは、1 パス目が hitRateSpanWith で出し直す
 * （plan/design-sustained-hit-rate-gauge.md）
 */
export function hitRateSpansOf(plan: LandingPlan | null, slotCount: number): (LandingHitRateSpan[] | null)[] {
  return Array.from({ length: slotCount }, (_, i) => {
    const parts = plan?.parts[i];
    if (plan === null || parts === null || parts === undefined) return null;
    return plan.spans.map((s) => {
      const landingParts = parts.get(s.landing)!;
      return {
        start: s.start,
        end: s.end,
        landing: s.landing,
        hitRate: mixedHitRate(landingParts),
        coreHits: mixedCoreHits(landingParts),
        measured: landingParts.every((p) => p.measuredHitRate === true),
      };
    });
  });
}

/**
 * measured: 区間の弾丸命中率を的の表から取ったか（配分は全部の着地点で）。SG のゲージの割合を決める。
 * coreHits: 1 発のコアの命中の期待値（mixedCoreHits。coreHit の回数トリガーに使う）。
 * landing: 区間の着地点（hitRateSpanWith で出し直すときの鍵。省略は着地点なし）
 */
export type LandingHitRateSpan = {
  start: number;
  end: number;
  landing?: string | null;
  hitRate: number;
  coreHits: number;
  measured: boolean;
};

/**
 * plan/design-sustained-hit-rate-gauge.md: 区間 span の弾丸命中率とコアの命中の期待値を、計画の常時の N に持続の命中率▲
 * timedHitRateUp を足した N で出し直す（2 パス目の landingPartsWith と同じ式。C-0170・C-0192）。▲が 0 なら span の値のまま
 */
export function hitRateSpanWith(
  plan: LandingPlan,
  slot: Pick<TeamSlotInput, 'condition'>,
  slotIndex: number,
  span: LandingHitRateSpan,
  timedHitRateUp: number,
): { hitRate: number; coreHits: number } {
  if (timedHitRateUp === 0) return span;
  const parts = landingPartsWith(
    plan,
    slot,
    slotIndex,
    span.landing ?? null,
    (plan.hitRateUp[slotIndex] ?? 0) + timedHitRateUp,
  );
  return { hitRate: mixedHitRate(parts), coreHits: mixedCoreHits(parts) };
}

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

/** 区間ごとの命中率▲ N（区間の状態の buffs.hitRate）。autoConditionSummary に渡す */
export type HitRateUpSpan = { start: number; end: number; hitRateUp: number };

/** 持続バフの区間から、枠 slotIndex の区間ごとの N を取る */
export function hitRateUpSpansOf(
  timeline: { segments: readonly { start: number; end: number; slots: readonly (SlotBuffState | null)[] }[] },
  slotIndex: number,
): HitRateUpSpan[] {
  return timeline.segments.map((s) => ({
    start: s.start,
    end: s.end,
    hitRateUp: s.slots[slotIndex]?.buffs.hitRate ?? 0,
  }));
}

/**
 * 自動で使った条件の平均（1 パス目の射撃の列で発数の重みを付ける）。自動でない枠は null。
 * hitRateSpans（区間ごとの N。省略は計画の常時の N）を渡すと、持続の命中率▲が効いている発のコア命中率をその N で出す
 */
export function autoConditionSummary(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  shotFrames: readonly number[],
  hitRateSpans?: readonly HitRateUpSpan[],
): AutoConditionSummary | null {
  const parts = plan?.parts[slotIndex];
  if (plan === null || parts === null || parts === undefined) return null;
  const constant = plan.hitRateUp[slotIndex] ?? 0;
  let shots = 0;
  let core = 0;
  let distance = 0;
  let hit = 0;
  let upSum = 0;
  let timed = false;
  let k = 0;
  let h = 0;
  const nAt = (frame: number): number => {
    if (hitRateSpans === undefined) return constant;
    while (h < hitRateSpans.length && hitRateSpans[h]!.end <= frame) h += 1;
    const span = hitRateSpans[h];
    return span !== undefined && span.start <= frame ? span.hitRateUp : constant;
  };
  for (const span of plan.spans) {
    while (k < shotFrames.length && shotFrames[k]! < span.start) k += 1;
    // 同じ N が続く発をまとめて足す（持続の▲が無ければ着地点の区間ごとに 1 回で、今までと同じ足し方）
    while (k < shotFrames.length && shotFrames[k]! < span.end) {
      const up = nAt(shotFrames[k]!);
      let n = 0;
      while (k < shotFrames.length && shotFrames[k]! < span.end && nAt(shotFrames[k]!) === up) {
        n += 1;
        k += 1;
      }
      for (const p of landingPartsWith(plan, slot, slotIndex, span.landing, up)) {
        core += n * p.weight * p.condition.coreHitRate;
        distance += n * p.weight * (p.condition.distanceBonus && slot.character.bonusRange !== null ? 1 : 0);
        hit += n * p.weight * (p.condition.hitRate ?? 1);
      }
      if (up !== constant) timed = true;
      upSum += n * up;
      shots += n;
    }
  }
  const mean = (v: number) => (shots > 0 ? v / shots : 0);
  return {
    shots,
    coreHitRate: mean(core),
    distanceBonus: mean(distance),
    hitRate: mean(hit),
    hitRateUp: timed ? mean(upSum) : constant,
    timedHitRateUp: timed,
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
 * plan/design-landing-aim.md 4.1 節: 窓の明けから 1 発目までがこれより短い RL・SR は、照準がコアに着く前に撃つ回がある
 * （C-0193・C-0194・C-0199。着く時刻の実測の最長は 42f）。注記を出す条件だけに使い、結論にはしない
 */
export const LANDING_AIM_MISS_FRAMES = 50;

/**
 * 着地の後の 1 発目を除いて決めた RL の弾の種類の行（直進弾 100・誘導弾 100・曲射 1500。C-0174・C-0175・C-0242）。
 * その 1 発目は遠・中遠の区間で外すことがあり（V-0097 の 077-18・121-05）、モデルに入っていない
 */
const FIRST_SHOT_EXCLUDED_ROWS: ReadonlySet<string> = new Set([
  'ProjectileDirect:100',
  'HomingProjectile:100',
  'ProjectileCurve:1500',
]);

/** キャラが引く RL の弾の種類の行のキー（弾の種類ごとの行でなければ null） */
function rateRowKeyOf(table: TargetRateTable, character: CharacterData): string | null {
  const cell = table[character.weaponType];
  if (cell === null || cell === undefined || !isByProjectile(cell)) return null;
  return projectileRowKeyOf(cell.byProjectile, character);
}

/**
 * 自動の枠の注記。的の表が無い敵では「この敵の条件は未測定」、未測定の項目・区間は手入力の値を使ったこと、
 * 着地の後の照準（RL・SR の 1 発目の外れ、AR・SMG の撃ち始めの待ち）・MG の撃ち始めを未実装・近似として知らせる。自動でない枠は空
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
  const raisesBullet = hitRateUpRaisesBulletHitRate(slot.character);
  const ja = [
    `${profile.name.ja}の表（単騎 AUTO の実測）でコア命中率・距離ボーナス・弾丸命中率を決めた`,
    ...mixes.map((id) => mixLabel(profile, id).ja),
    ...(n > 0 ? [`常時の命中率▲ ${pct(n)} でコア命中率を 1/(1 − N)² 倍（上限 1）`] : []),
    'フルバースト中などに配られる持続の命中率▲も、効いている区間で N に足してコア命中率に効かせた（C-0170。仮説）',
    raisesBullet
      ? '命中率▲（常時 + 持続）で弾丸命中率の外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にした（C-0192。確かめたのは SMG の遠だけで、ほかの帯と AR・MG には同じ式を当てた）。持続の▲による上がりも、1 パス目のゲージと命中の回数に入れた（C-0265。仮説）'
      : '命中率▲は弾丸命中率に効かせていない（未実装。SG の近 A では上がるが（C-0157）、効き方の式が決まっていない）',
  ];
  const en = [
    `Core hit rate, distance bonus and bullet hit rate come from the ${profile.name.en} table (solo AUTO recordings)`,
    ...mixes.map((id) => mixLabel(profile, id).en),
    ...(n > 0 ? [`constant hit rate up ${pct(n)} scales core hit rate by 1/(1 − N)² (max 1)`] : []),
    'timed hit rate buffs (e.g. given at full burst) are added to N while active and change core hit rate (C-0170; hypothesis)',
    raisesBullet
      ? 'hit rate buffs (constant + timed) turn the bullet miss rate 1 − p into (1 − p) ^ (1 ÷ (1 − N)²) (C-0192; checked only for SMG at far range, and the same formula is used for the other bands and for AR and MG); the rise from timed buffs is also fed into the burst gauge and the hit counts (C-0265; hypothesis)'
      : 'hit rate buffs do not change bullet hit rate (not modeled; they raise it for SG at near A (C-0157), but the formula is unknown)',
  ];
  notes.push({ level: 'approx', code: 'auto-condition', message: { ja: ja.join('。'), en: en.join('; ') } });
  if (n < 0) {
    notes.push({
      level: 'unsupported',
      code: 'hit-rate-down',
      message: {
        ja: `常時の命中率▼（${pct(n)}）はコア命中率・弾丸命中率に効かせていない（効き方を測っていない）`,
        en: `Constant hit rate down (${pct(n)}) does not change core or bullet hit rate (not measured)`,
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
  if (projectileRowListedUnmeasured(profile.coreHitRate, slot.character)) {
    const key = projectileKeyOf(slot.character);
    notes.push({
      level: 'unsupported',
      code: 'core-miss-by-projectile',
      message: {
        ja: `この弾の種類（${key}）の ${weapon} は、近の区間ではほとんど外さず、遠の区間で多くコアを外す（C-0171）。割合は未測定なので、手入力のコア命中率（${pct(manual.coreHitRate)}）は実際より高い`,
        en: `${weapon} with this projectile (${key}) rarely misses the core at near range but often misses it at far range (C-0171); the rate is not measured, so the manual core hit rate (${pct(manual.coreHitRate)}) is higher than actual`,
      },
    });
  }
  const unknown = plan.spans.find((s) => s.landing === null);
  if (unknown !== undefined) {
    notes.push({
      level: 'unsupported',
      code: 'landing-unmeasured',
      message: {
        ja: `${framesToGameSeconds(unknown.start).toFixed(1)} 秒以降の着地点は未測定なので、手入力の値（${manualText.ja}）で計算した`,
        en: `Landing points after ${framesToGameSeconds(unknown.start).toFixed(1)} s are not measured; manual values are used (${manualText.en})`,
      },
    });
  }
  // plan/design-landing-aim.md 4.1 節（2026-10-05 オーナー承認。案 A・B-3）
  if ((weapon === 'RL' || weapon === 'SR') && windowEndFirstShotFrames(slot.character.shot) < LANDING_AIM_MISS_FRAMES) {
    notes.push({
      level: 'unsupported',
      code: 'landing-first-shot-miss',
      message: {
        ja: '着地の後の 1 発目は、照準がまだコアに着いていないとコアを外す（C-0194。照準は窓の明けから動き出す。C-0193・C-0199）。紅蓮：ブラックシャドウ単騎で 180 秒に 0〜2 発。未実装',
        en: 'The first shot after a landing misses the core if the aim has not reached it yet (C-0194; the aim starts moving when the window ends, C-0193, C-0199); 0-2 shots in 180 s on a solo Scarlet: Black Shadow; not modeled',
      },
    });
  }
  const rowKey = weapon === 'RL' ? rateRowKeyOf(profile.coreHitRate, slot.character) : null;
  if (rowKey !== null && FIRST_SHOT_EXCLUDED_ROWS.has(rowKey)) {
    notes.push({
      level: 'unsupported',
      code: 'landing-first-shot-excluded',
      message: {
        ja: `この弾の種類（${rowKey}）のコア命中率は、着地の後の 1 発目を除いて決めた（C-0174・C-0175・C-0242）。その 1 発目は遠・中遠の区間で外すことがある。未実装`,
        en: `The core hit rate of this projectile (${rowKey}) excludes the first shot after each landing (C-0174, C-0175, C-0242); that shot can miss the core at far and mid-far landings; not modeled`,
      },
    });
  }
  if (weapon === 'AR' || weapon === 'SMG') {
    notes.push({
      level: 'unsupported',
      code: 'landing-aim-wait',
      message: {
        ja: '着地の後、照準が的に掛かるまで撃たない（C-0195、仮説。操作キャラで確かめた）。モデルは窓の明けから構えの 12f で撃ち始めるので、通常攻撃の発の数が多めに出る。未実装',
        en: 'After a landing, the character does not fire until the aim is on the target (C-0195; hypothesis, seen on the controlled character); the model starts firing 12 frames after the window, so it counts slightly more normal shots; not modeled',
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

// ---- 飛ぶ時間（plan/design-anis-star-gauge-timing.md 3・4 節） ----

/** 飛ぶ時間の区間（フレーム）。[start, end) に撃った発・刻みのヒットは、frames 後に着く */
export type FlightFrameSpan = { start: number; end: number; frames: number };

/** 枠の飛ぶ時間。shot は通常攻撃の発、autoAttacks はスキルのスロットごとの周期の自動攻撃（無いもの・どこも 0 のものは省く） */
export type SlotFlight = {
  shot: FlightFrameSpan[] | null;
  autoAttacks: Partial<Record<SkillSlot, FlightFrameSpan[]>>;
};

/** 着地点の区間ごとに、行の値（着地点・配分の id → 帯 → all の順。無ければ 0）を引く。どこも 0 なら null */
function flightSpansOf(
  spans: readonly LandingFrameSpan[],
  row: TargetRateRow | null | undefined,
): FlightFrameSpan[] | null {
  if (row === null || row === undefined) return null;
  const out = spans.map((s) => ({
    start: s.start,
    end: s.end,
    frames:
      (s.landing === null ? undefined : row[s.landing]) ?? (s.band === null ? undefined : row[s.band]) ?? row.all ?? 0,
  }));
  return out.some((s) => s.frames > 0) ? out : null;
}

/**
 * 枠ごとの飛ぶ時間。的の表の flightFrames と着地点の時間割り（landingFrameSpans）で決まり、条件の決め方（自動・手入力）には
 * 依らない（3.3 節）。的の表の無い敵・表の無い枠は null（飛ぶ時間 0。発射・刻みのフレームに着く）
 */
export function slotFlightsOf(
  slots: readonly (Pick<TeamSlotInput, 'character'> | null)[],
  enemy: EnemyInput,
  frames: number,
): (SlotFlight | null)[] {
  const table = enemy.target?.flightFrames;
  if (table === undefined) return slots.map(() => null);
  const spans = landingFrameSpans(enemy, frames);
  return slots.map((slot) => {
    if (slot === null) return null;
    const shot = table.shots === undefined ? null : flightSpansOf(spans, rateRowOf(table.shots, slot.character));
    const autoAttacks: SlotFlight['autoAttacks'] = {};
    for (const skill of SKILL_SLOTS) {
      const s = flightSpansOf(spans, table.autoAttacks?.[`${slot.character.resourceId}:${skill}`]);
      if (s !== null) autoAttacks[skill] = s;
    }
    return shot === null && Object.keys(autoAttacks).length === 0 ? null : { shot, autoAttacks };
  });
}

/** フレーム frame に撃った発・刻みのヒットの飛ぶ時間（区間の外・spans なしは 0） */
export function flightFramesAt(spans: readonly FlightFrameSpan[] | null | undefined, frame: number): number {
  if (!spans) return 0;
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = spans[mid]!;
    if (frame < s.start) hi = mid - 1;
    else if (frame >= s.end) lo = mid + 1;
    else return s.frames;
  }
  return 0;
}
