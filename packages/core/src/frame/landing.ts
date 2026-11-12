// Stage 18-C（plan/design-stage18.md 12.3 節）: 条件が「自動」の枠の、着地点ごとの条件（コア命中率・距離ボーナス・弾丸命中率）。
// 着地点は敵の出来事（的のジャンプ）だけで決まり、射撃やバフには依らないので、1 パス目の前に決まる。
//
// - 距離ボーナス: 着地点の距離の範囲が、キャラの bonusRange に丸ごと入るか（C-0026・C-0031・C-0044）。
// - コア命中率: 的の表の値 p（着地点の id → 帯 → all の順で引く）に、命中率▲ N で min(1, p ÷ (1 − N)²)。N ≥ 1 なら 1
//   （C-0036・C-0037）。計画（planLandings）は枠の常時の BuffTotals.hitRate（育成の効果層・常時パッシブ）で出し、
//   持続の▲（フルバーストの頭などで配られるもの。C-0170）が効いている区間は、使う時点で区間の N で出し直す（landingPartsWith）。
// - 弾丸命中率: 的の表の値。通常攻撃のダメージと 1 パス目のゲージに掛ける（Stage 15 の condition.hitRate と同じ扱い）。
//   AR・SMG・MG は命中率▲ N で外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にする（C-0192・C-0519。確かめたのは SMG の遠と中遠 B・C だけ。plan/design-hit-rate-up-bullet-h2.md）。
//   SG は近（近 A・近 B）だけ同じ式にし（C-0631）、中近・中遠・遠は表の値のまま（C-0527）。
//   コア命中率と同じく、計画は常時の N で出し、持続の▲の区間は landingPartsWith で出し直す（1 パス目のゲージは計画の値のまま）。
// - 命中率▼（N < 0）: ▼だけが効く区間で、的の▼の表（TargetProfile.hitRateDown。MG・N = −20%・−40%・−60%。plan/design-maids.md 8 節）にある
//   N だけ、コア命中率を「着地点の最初の段の値 × N の倍率」に、弾丸命中率を表の行の値にする。表に無い N・武器種は変えない。
//   ▲と同時に効く区間は、和の N が表のキーに当たっても表を使わず、表に無い N と同じ扱い（和の N で▲の式。N ≤ 0 は変えない。8.4 節）。
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
import { ZERO_HIT_RATE, hitRateNOf, type HitRateN } from '../skills/buffs.ts';
import { SKILL_SLOTS } from '../skills/types.ts';
import { muzzleHitsOf } from '../weapons.ts';
import type { SlotBuffState } from '../skills/timeline.ts';
import type { SlotCondition, TeamSlotInput } from '../team.ts';
import type {
  CharacterData,
  CoreHitRateTable,
  LandingBand,
  LandingPoint,
  SkillSlot,
  TargetProfile,
  HitRateDownTable,
  TargetRateByProjectile,
  TargetRateRow,
  TargetRateTable,
} from '../types.ts';
import { endSecondsToFrame, framesToGameSeconds, gameSecondsToFrame } from '../time.ts';

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
 * tableBulletHitRate は的の表の弾丸命中率（命中率▲を掛ける前。▲を効かせる武器種で、表から取ったときだけ）。
 * hitRateDown はその着地点の命中率▼の値（的の▼の表にその武器種の行があるときだけ）
 */
export type LandingPart = {
  landing: LandingPoint | null;
  weight: number;
  condition: SlotCondition;
  measuredHitRate?: boolean;
  tableCoreHitRate?: number;
  tableBulletHitRate?: number;
  hitRateDown?: HitRateDownAt;
};

/** 着地点の計画（自動の枠が 1 つも無い、または的の表の無い敵では作らない） */
export type LandingPlan = {
  /** [0, frames) を隙間なく覆う */
  spans: LandingFrameSpan[];
  /** 枠ごと: 条件が自動で、的の表がある */
  autoSlots: boolean[];
  /** 枠ごと: 着地点の id（null = 未測定）→ 条件の配分。自動でない枠は null */
  parts: (ReadonlyMap<string | null, readonly LandingPart[]> | null)[];
  /** 枠ごと: 掛けた常時の命中率の和 N（自動でない枠は 0） */
  hitRate: HitRateN[];
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
 * `<fireType>:<弾速>`（爆発の範囲で振る舞いの違う弾だけ、行を分ける。C-0424）。飛ぶ弾でなければ null
 */
function projectileRowKeyOf(by: TargetRateByProjectile['byProjectile'], character: CharacterData): string | null {
  const key = projectileKeyOf(character);
  const range = character.shot.projectile?.explosionRange;
  if (key === null) return null;
  const withRange = range === undefined ? null : `${key}:${range}`;
  return withRange !== null && withRange in by ? withRange : key;
}

/** 行を引く表（コア命中率の表だけ fire_type の行 fireTypes を持つ） */
type RateTableLookup = TargetRateTable & Pick<CoreHitRateTable, 'fireTypes' | 'dualWield'>;

function isByProjectile(cell: TargetRateRow | TargetRateByProjectile): cell is TargetRateByProjectile {
  return 'byProjectile' in cell;
}

/**
 * キャラの行（武器種の行。弾の種類ごとの行なら、そのキャラの弾の種類の行）。null = 未測定。
 * 紅蓮：神殺編（plan/design-new-chars-1029.md 12.2 節の a）: コア命中率の表に fire_type の行（fireTypes）があれば、それを先に引く。
 * 次に、二丁持ちなら二丁持ちの行（dualWield）
 */
export function rateRowOf(table: RateTableLookup, character: CharacterData): TargetRateRow | null {
  const byFireType = table.fireTypes?.[character.shot.fireType];
  if (byFireType !== undefined) return byFireType;
  // クエンシー：エスケープクイーン編（plan/design-quency-eq.md 2 節の論点 1）: 二丁持ちの行（コア命中率の表だけ）
  const dual =
    muzzleHitsOf(character.weaponType, character.shot) > 1 ? table.dualWield?.[character.weaponType] : undefined;
  if (dual !== undefined) return dual;
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

/** 行の値（着地点の id → 帯 → all の順）。無ければ undefined */
function rateAtLanding(row: TargetRateRow, landing: Pick<LandingPoint, 'id' | 'band'>): number | undefined {
  return row[landing.id] ?? row[landing.band] ?? row.all;
}

/** 表の値（着地点の id → 帯 → all の順）。null = 未測定 */
export function targetRateOf(table: RateTableLookup, character: CharacterData, landing: LandingPoint): number | null {
  const row = rateRowOf(table, character);
  if (row === null) return null;
  return rateAtLanding(row, landing) ?? null;
}

/** 命中率の和 N と値の組の列 */
type ValuesByN = readonly (readonly [n: number, value: number])[];

/** 1 か所の着地点の命中率▼の値。core はコア命中率、bullet は弾丸命中率 */
export type HitRateDownAt = { core: ValuesByN; bullet: ValuesByN };

/** N の値（浮動小数の和のずれを見込んで 1e-9 で比べる）。無ければ undefined */
function valueAtN(values: ValuesByN | undefined, n: number): number | undefined {
  return values?.find(([key]) => Math.abs(key - n) < 1e-9)?.[1];
}

/**
 * plan/design-maids.md 8.2・8.3 節（V-0683）: 武器種と着地点の命中率▼の値。コア命中率は着地点の最初の段の値 × N の倍率、
 * 弾丸命中率は N の行の値（行に無い着地点は持たない）。的の▼の表にその武器種が無ければ undefined
 */
export function hitRateDownAt(
  table: HitRateDownTable | undefined,
  character: Pick<CharacterData, 'weaponType'>,
  landing: Pick<LandingPoint, 'id' | 'band'>,
): HitRateDownAt | undefined {
  const entry = table?.[character.weaponType];
  if (entry === undefined) return undefined;
  const core: [number, number][] = [];
  const base = entry.core === undefined ? undefined : rateAtLanding(entry.core.base, landing);
  if (entry.core !== undefined && base !== undefined) {
    for (const [n, r] of Object.entries(entry.core.ratio)) core.push([Number(n), base * r]);
  }
  const bullet: [number, number][] = [];
  for (const [n, row] of Object.entries(entry.bullet ?? {})) {
    const v = rateAtLanding(row, landing);
    if (v !== undefined) bullet.push([Number(n), v]);
  }
  return core.length === 0 && bullet.length === 0 ? undefined : { core, bullet };
}

/**
 * 命中率の和が▼だけ（N < 0 で、▲が同時に効いていない）か。▼の表は▼だけが効く区間の実測（V-0683）で、▲と同時の区間は
 * 測っていないので、その区間には表を使わない（plan/design-maids.md 8.4 節）
 */
function downOnly(hitRate: HitRateN): boolean {
  return hitRate.up === 0 && hitRate.n < 0;
}

/**
 * 的の表のコア命中率 p を、命中率の和 hitRate で出し直す。▼だけの和（downOnly）は命中率▼の値 down に N の値があればそれ
 * （plan/design-maids.md 8.2 節）、無ければ p のまま。ほかは N で▲の式（coreHitRateWithHitRateUp。N ≤ 0 は p のまま）
 */
export function coreHitRateAt(p: number, hitRate: HitRateN, down: HitRateDownAt | undefined): number {
  return downOnly(hitRate) ? (valueAtN(down?.core, hitRate.n) ?? p) : coreHitRateWithHitRateUp(p, hitRate.n);
}

/** 弾丸命中率で coreHitRateAt と同じ（▲の式は bulletHitRateWithHitRateUp。plan/design-maids.md 8.3 節） */
export function bulletHitRateAt(p: number, hitRate: HitRateN, down: HitRateDownAt | undefined): number {
  return downOnly(hitRate) ? (valueAtN(down?.bullet, hitRate.n) ?? p) : bulletHitRateWithHitRateUp(p, hitRate.n);
}

/**
 * C-0036・C-0037: 常時の命中率▲ N で、コア命中率 p を min(1, p ÷ (1 − N)²) にする。N ≥ 1 なら 1。
 * N ≤ 0 は変えない（命中率▼は coreHitRateAt が的の▼の表で引く）
 */
export function coreHitRateWithHitRateUp(p: number, hitRateUp: number): number {
  if (hitRateUp <= 0) return p;
  if (hitRateUp >= 1) return 1;
  return Math.min(1, p / (1 - hitRateUp) ** 2);
}

/**
 * C-0192: 命中率▲ N で、弾丸命中率 p の外れの割合 1 − p を (1 − p) ^ (1 ÷ (1 − N)²) にする（H2）。N ≥ 1 なら 1。
 * 確かめたのは SMG の遠と中遠 B・C（C-0519）と SG の近（C-0631）だけ（plan/design-hit-rate-up-bullet-h2.md）。
 * N ≤ 0 は変えない（命中率▼は bulletHitRateAt が的の▼の表で引く）
 */
export function bulletHitRateWithHitRateUp(p: number, hitRateUp: number): number {
  if (hitRateUp <= 0) return p;
  if (hitRateUp >= 1) return 1;
  return 1 - (1 - p) ** (1 / (1 - hitRateUp) ** 2);
}

/**
 * 命中率▲を弾丸命中率に効かせるか。AR・SMG・MG はどの着地点も。SG は近（近 A・近 B）だけ（C-0631）で、中近・中遠・遠は
 * 効かせない（中近・遠では H2 ほど上がらない（C-0527）が、効き方の式は決まっていない）
 */
export function hitRateUpRaisesBulletHitRate(
  character: Pick<CharacterData, 'weaponType'>,
  landing: Pick<LandingPoint, 'band'>,
): boolean {
  const weapon = character.weaponType;
  if (weapon === 'SG') return landing.band === 'near';
  return weapon === 'AR' || weapon === 'SMG' || weapon === 'MG';
}

/**
 * 着地点の距離の範囲が bonusRange に丸ごと入るか（RL のように bonusRange が無ければ false）。エード：エージェントバニー編
 * （plan/design-agent-bunny.md 2.1 節）: 適正最小射程距離▲ の和 minRange が正で着地点に代表の距離があれば、下端を 下端 × (1 − minRange)
 * に縮め、下端は代表の距離で比べる（上端はいまと同じく範囲で比べる。C-1043。式は R1 の仮説 C-1033）
 */
export function distanceBonusAt(
  character: Pick<CharacterData, 'bonusRange'>,
  landing: LandingPoint,
  minRange = 0,
): boolean {
  const range = character.bonusRange;
  if (range === null) return false;
  if (minRange > 0 && landing.distance !== undefined) {
    const min = range.min * (1 - Math.min(1, minRange));
    return min <= landing.distance && landing.range[1] <= range.max;
  }
  return range.min <= landing.range[0] && landing.range[1] <= range.max;
}

/** 着地点 1 か所での自動の条件。表が null の項目は手入力の値。hitRate は掛ける命中率の和（coreHitRateAt） */
export function autoConditionAt(
  profile: TargetProfile,
  landing: LandingPoint,
  character: CharacterData,
  hitRate: HitRateN,
  manual: SlotCondition,
  down: HitRateDownAt | undefined = hitRateDownAt(profile.hitRateDown, character, landing),
): SlotCondition {
  const core = targetRateOf(profile.coreHitRate, character, landing);
  const bullet = targetRateOf(profile.bulletHitRate, character, landing);
  // V-0119: 1 発のヒット数は表にある弾の種類だけ（無ければ 1 発 1 ヒット）。手入力の条件には無い
  const hits = profile.hitsPerShot === undefined ? null : targetRateOf(profile.hitsPerShot, character, landing);
  return {
    coreHitRate: core === null ? manual.coreHitRate : coreHitRateAt(core, hitRate, down),
    distanceBonus: distanceBonusAt(character, landing),
    fullCharge: manual.fullCharge,
    hitRate:
      bullet === null
        ? (manual.hitRate ?? 1)
        : hitRateUpRaisesBulletHitRate(character, landing)
          ? bulletHitRateAt(bullet, hitRate, down)
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
 * passive は枠ごとの常時の状態（resolvePassiveStates の結果。命中率の和 N を取る）
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
  const hitRate = slots.map((_, i) => {
    const buffs = passive[i]?.buffs;
    return autoSlots[i] && buffs !== undefined ? hitRateNOf(buffs) : ZERO_HIT_RATE;
  });
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
              const down = hitRateDownAt(profile.hitRateDown, slot.character, landing);
              return {
                landing,
                weight,
                condition: autoConditionAt(profile, landing, slot.character, hitRate[i]!, slot.condition, down),
                measuredHitRate: bullet !== null,
                ...(table === null ? {} : { tableCoreHitRate: table }),
                ...(bullet === null || !hitRateUpRaisesBulletHitRate(slot.character, landing)
                  ? {}
                  : { tableBulletHitRate: bullet }),
                ...(down === undefined ? {} : { hitRateDown: down }),
              };
            }),
      );
    }
    return map;
  });
  return { spans, autoSlots, parts, hitRate };
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

/** 命中率の和が同じか（▲の側も見る。▼の表を使うかが変わる） */
function sameHitRate(a: HitRateN, b: HitRateN): boolean {
  return a.n === b.n && a.up === b.up;
}

/**
 * C-0170: landingPartsOf の条件のコア命中率を、命中率の和 hitRate（常時 + その区間の持続の▲▼。区間の状態の hitRateNOf）で
 * 出し直す。C-0192: ▲を効かせる武器種は弾丸命中率も出し直す。▼だけの和なら命中率▼の値（plan/design-maids.md 8 節。coreHitRateAt）。
 * 計画の常時の和と同じなら計画の配分をそのまま返す。
 * エード：エージェントバニー編（plan/design-agent-bunny.md 2.1 節）: 適正最小射程距離▲ の和 minRange（区間の状態の minEffectiveRange）が
 * 正なら、着地点のある配分の距離ボーナスを縮めた適正射程距離で出し直す（distanceBonusAt）。0 なら距離ボーナスは変えない
 */
export function landingPartsWith(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  landing: string | null | undefined,
  hitRate: HitRateN,
  minRange = 0,
): readonly LandingPart[] {
  const parts = landingPartsOf(plan, slot, slotIndex, landing);
  if (plan === null || !plan.autoSlots[slotIndex]) return parts;
  const rehit =
    !sameHitRate(hitRate, plan.hitRate[slotIndex] ?? ZERO_HIT_RATE) &&
    parts.some((p) => p.tableCoreHitRate !== undefined || p.tableBulletHitRate !== undefined);
  const redistance = minRange > 0 && slot.character.bonusRange !== null && parts.some((p) => p.landing !== null);
  if (!rehit && !redistance) return parts;
  let cache = PARTS_WITH_CACHE.get(plan);
  if (cache === undefined) {
    cache = new Map();
    PARTS_WITH_CACHE.set(plan, cache);
  }
  const key = `${slotIndex}|${landing === null || landing === undefined ? '' : `L:${landing}`}|${rehit ? `${hitRate.n}|${hitRate.up}` : ''}|${redistance ? minRange : 0}`;
  let found = cache.get(key);
  if (found === undefined) {
    found = parts.map((p) => {
      const core = rehit && p.tableCoreHitRate !== undefined;
      const bullet = rehit && p.tableBulletHitRate !== undefined;
      const distance = redistance && p.landing !== null;
      if (!core && !bullet && !distance) return p;
      return {
        ...p,
        condition: {
          ...p.condition,
          ...(core ? { coreHitRate: coreHitRateAt(p.tableCoreHitRate!, hitRate, p.hitRateDown) } : {}),
          ...(bullet ? { hitRate: bulletHitRateAt(p.tableBulletHitRate!, hitRate, p.hitRateDown) } : {}),
          ...(distance ? { distanceBonus: distanceBonusAt(slot.character, p.landing!, minRange) } : {}),
        },
      };
    });
    cache.set(key, found);
  }
  return found;
}

/**
 * エード：エージェントバニー編（plan/design-agent-bunny.md 2.2 節）: 条件「適正射程距離内なら」（inEffectiveRange）。枠 slotIndex のフレーム
 * frame の着地点が、適正最小射程距離▲ の和 minRange で縮めた適正射程距離の中か（距離ボーナスと同じ判定。distanceBonusAt）。配分の着地点で
 * 割れたら重みの和が 0.5 以上の側。計画が無い・自動でない枠と、着地点の無い配分（未測定）は手入力の距離ボーナスの有無
 */
export function inEffectiveRangeAt(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  frame: number,
  minRange: number,
): boolean {
  if (plan === null || !plan.autoSlots[slotIndex]) return slot.condition.distanceBonus;
  const landing = spanAt(plan.spans, frame)?.landing ?? null;
  let weight = 0;
  for (const p of landingPartsWith(plan, slot, slotIndex, landing, plan.hitRate[slotIndex] ?? ZERO_HIT_RATE, minRange))
    if (p.condition.distanceBonus) weight += p.weight;
  return weight >= 0.5;
}

/**
 * 2 段目の段 11（plan/design-skill-stage11.md 2.1 節）: 即着弾に替えた使用武器の変更（ChangedWeapon.targetRowKey）が効いている区間の
 * 配分。条件のコア命中率を、的の表の coreHitRate.weaponChanges の行（着地点の id → 帯 → all）に替える。行が無い・null、着地点の無い
 * 配分（手入力）はそのまま。命中率▲は掛けない（使い手のいる変更の行は 1 で、▲の効き方を確かめていない）。
 * ナユタ編（plan/design-nayuta.md 2.6 節）: 弾丸命中率も、bulletHitRate.weaponChanges に行があればそれに替える（チャージ武器に替えた
 * SMG の発。基礎の武器種の帯の値を使わない）
 */
export function weaponChangeParts(
  enemy: EnemyInput,
  parts: readonly LandingPart[],
  rowKey: string | undefined,
): readonly LandingPart[] {
  if (rowKey === undefined) return parts;
  const row = enemy.target?.coreHitRate.weaponChanges?.[rowKey] ?? null;
  const bulletRow = enemy.target?.bulletHitRate.weaponChanges?.[rowKey] ?? null;
  if (row === null && bulletRow === null) return parts;
  return parts.map((p) => {
    if (p.landing === null) return p;
    const core = row === null ? undefined : rateAtLanding(row, p.landing);
    const bullet = bulletRow === null ? undefined : rateAtLanding(bulletRow, p.landing);
    if (core === undefined && bullet === undefined) return p;
    return {
      ...p,
      condition: {
        ...p.condition,
        ...(core === undefined ? {} : { coreHitRate: core }),
        ...(bullet === undefined ? {} : { hitRate: bullet }),
      },
    };
  });
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
 * plan/design-sustained-hit-rate-gauge.md: 区間 span の弾丸命中率とコアの命中の期待値を、計画の常時の和に持続の命中率▲▼の和
 * timed を足した和で出し直す（2 パス目の landingPartsWith と同じ式。C-0170・C-0192）。timed が▲も▼も 0 なら span の値のまま
 */
export function hitRateSpanWith(
  plan: LandingPlan,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  span: LandingHitRateSpan,
  timed: HitRateN,
): { hitRate: number; coreHits: number } {
  if (timed.n === 0 && timed.up === 0) return span;
  const constant = plan.hitRate[slotIndex] ?? ZERO_HIT_RATE;
  const parts = landingPartsWith(plan, slot, slotIndex, span.landing ?? null, {
    n: constant.n + timed.n,
    up: constant.up + timed.up,
  });
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

/**
 * 区間ごとの命中率の和（区間の状態の hitRateNOf）と、適正最小射程距離▲ の和（区間の状態の minEffectiveRange。エード：エージェントバニー編）。
 * autoConditionSummary に渡す
 */
export type HitRateNSpan = { start: number; end: number; hitRate: HitRateN; minRange: number };

/** 持続バフの区間から、枠 slotIndex の区間ごとの命中率の和を取る */
export function hitRateNSpansOf(
  timeline: { segments: readonly { start: number; end: number; slots: readonly (SlotBuffState | null)[] }[] },
  slotIndex: number,
): HitRateNSpan[] {
  return timeline.segments.map((s) => {
    const buffs = s.slots[slotIndex]?.buffs;
    return {
      start: s.start,
      end: s.end,
      hitRate: buffs === undefined ? ZERO_HIT_RATE : hitRateNOf(buffs),
      minRange: buffs?.minEffectiveRange ?? 0,
    };
  });
}

/**
 * 自動で使った条件の平均（1 パス目の射撃の列で発数の重みを付ける）。自動でない枠は null。
 * hitRateSpans（区間ごとの N。省略は計画の常時の N）を渡すと、持続の命中率▲が効いている発のコア命中率をその N で出す。
 * 適正最小射程距離▲ の効いている発の距離ボーナスは、区間の minRange で出し直す
 */
export function autoConditionSummary(
  plan: LandingPlan | null,
  slot: Pick<TeamSlotInput, 'condition' | 'character'>,
  slotIndex: number,
  shotFrames: readonly number[],
  hitRateSpans?: readonly HitRateNSpan[],
): AutoConditionSummary | null {
  const parts = plan?.parts[slotIndex];
  if (plan === null || parts === null || parts === undefined) return null;
  const constant = plan.hitRate[slotIndex] ?? ZERO_HIT_RATE;
  let shots = 0;
  let core = 0;
  let distance = 0;
  let hit = 0;
  let upSum = 0;
  let timed = false;
  let k = 0;
  let h = 0;
  /** フレームの区間（命中率の和と適正最小射程距離▲ の和）。区間の外は計画の常時の N */
  const timedAt = (frame: number): HitRateNSpan | undefined => {
    if (hitRateSpans === undefined) return undefined;
    while (h < hitRateSpans.length && hitRateSpans[h]!.end <= frame) h += 1;
    const span = hitRateSpans[h];
    return span !== undefined && span.start <= frame ? span : undefined;
  };

  for (const span of plan.spans) {
    while (k < shotFrames.length && shotFrames[k]! < span.start) k += 1;
    // 同じ N（と適正最小射程距離▲ の和）が続く発をまとめて足す（持続の▲が無ければ着地点の区間ごとに 1 回で、今までと同じ足し方）
    while (k < shotFrames.length && shotFrames[k]! < span.end) {
      const first = timedAt(shotFrames[k]!);
      const at = first?.hitRate ?? constant;
      const range = first?.minRange ?? 0;
      let n = 0;
      while (k < shotFrames.length && shotFrames[k]! < span.end) {
        const t = timedAt(shotFrames[k]!);
        if (!sameHitRate(t?.hitRate ?? constant, at) || (t?.minRange ?? 0) !== range) break;
        n += 1;
        k += 1;
      }
      for (const p of landingPartsWith(plan, slot, slotIndex, span.landing, at, range)) {
        core += n * p.weight * p.condition.coreHitRate;
        distance += n * p.weight * (p.condition.distanceBonus && slot.character.bonusRange !== null ? 1 : 0);
        hit += n * p.weight * (p.condition.hitRate ?? 1);
      }
      if (at.n !== constant.n) timed = true;
      upSum += n * at.n;
      shots += n;
    }
  }
  const mean = (v: number) => (shots > 0 ? v / shots : 0);
  return {
    shots,
    coreHitRate: mean(core),
    distanceBonus: mean(distance),
    hitRate: mean(hit),
    hitRateUp: timed ? mean(upSum) : constant.n,
    timedHitRateUp: timed,
  };
}

/**
 * 枠の条件の注記。弾丸命中率の近似（damage.ts の conditionNotes）は、自動の枠なら使った弾丸命中率の
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
 * 自動の枠の注記のうち、命中率▲を弾丸命中率に効かせたかの文。判定はモデルの値と同じ hitRateUpRaisesBulletHitRate で、
 * 帯のどれに効かせる武器種か（全部・一部・無し）と、枠の計画の着地点（parts。未測定の区間は除く）に効かせたものがあるかで分ける
 */
function bulletHitRateUpNote(
  character: CharacterData,
  parts: ReadonlyMap<string | null, readonly LandingPart[]>,
): { ja: string; en: string } {
  const raisedBands = LANDING_BANDS.filter((band) => hitRateUpRaisesBulletHitRate(character, { band }));
  const raisedInPlan = [...parts.values()]
    .flat()
    .some((p) => p.landing !== null && hitRateUpRaisesBulletHitRate(character, p.landing));
  const someBands = raisedBands.length > 0 && raisedBands.length < LANDING_BANDS.length;
  if (raisedInPlan && !someBands) {
    return {
      ja: '命中率▲（常時 + 持続）で弾丸命中率の外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にした（C-0192・C-0519。確かめたのは SMG の遠と中遠 B・C だけで、ほかの帯と AR・MG には同じ式を当てた）。持続の▲による上がりも、1 パス目のゲージ（C-0362）と命中の回数（C-0363。仮説）に入れた',
      en: 'hit rate buffs (constant + timed) turn the bullet miss rate 1 − p into (1 − p) ^ (1 ÷ (1 − N)²) (C-0192, C-0519; checked only for SMG at far range and mid-far landings B and C, and the same formula is used for the other bands and for AR and MG); the rise from timed buffs is also fed into the burst gauge (C-0362) and the hit counts (C-0363; hypothesis)',
    };
  }
  if (raisedInPlan) {
    return {
      ja: '命中率▲（常時 + 持続）で、近（近 A・近 B）の弾丸命中率の外れの割合を (1 − p) ^ (1 ÷ (1 − N)²) にした（C-0631。確かめたのは常時の▲ 5.09% だけ）。中近・中遠・遠の弾丸命中率には効かせていない（未実装。中近・遠では H2 ほど上がらない（C-0527）が、効き方の式は決まっていない）',
      en: 'hit rate buffs (constant + timed) turn the bullet miss rate 1 − p into (1 − p) ^ (1 ÷ (1 − N)²) at near range (landings A and B) (C-0631; checked only for a constant 5.09% buff); they do not change bullet hit rate at mid-near, mid-far or far range (not modeled; the rise there is smaller than this formula (C-0527), but the formula is unknown)',
    };
  }
  if (someBands) {
    const raised = raisedBands.map((band) => LANDING_BAND_LABEL[band]);
    return {
      ja: `命中率▲は弾丸命中率に効かせていない（未実装。この枠の計画に${raised.map((l) => l.ja).join('・')}の着地点が無い。中近・中遠・遠の効き方の式は決まっていない（中近・遠では H2 ほど上がらない。C-0527））`,
      en: `hit rate buffs do not change bullet hit rate (not modeled; this slot's plan has no ${raised.map((l) => l.en.toLowerCase()).join(' or ')} landing, and the formula at mid-near, mid-far and far range is unknown (the rise at mid-near and far range is smaller than the H2 formula, C-0527))`,
    };
  }
  return {
    ja: '命中率▲は弾丸命中率に効かせていない（未実装）',
    en: 'hit rate buffs do not change bullet hit rate (not modeled)',
  };
}

/**
 * 自動の枠の注記。的の表が無い敵では「この敵の条件は未測定」、未測定の項目・区間は手入力の値を使ったこと、
 * MG の撃ち始めを近似として知らせる。自動でない枠は空。着地の後の照準の動きは枠ごとに出さず、画面の一覧の「モデル全体」に
 * 1 行だけ出す（plan/design-landing-aim.md 10 節）
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
  const n = plan.hitRate[slotIndex]?.n ?? 0;
  const bullet = bulletHitRateUpNote(slot.character, parts);
  const ja = [
    `${profile.name.ja}の表（単騎 AUTO の実測）でコア命中率・距離ボーナス・弾丸命中率を決めた`,
    ...mixes.map((id) => mixLabel(profile, id).ja),
    ...(n > 0 ? [`常時の命中率▲ ${pct(n)} でコア命中率を 1/(1 − N)² 倍（上限 1）`] : []),
    'フルバースト中などに配られる持続の命中率▲も、効いている区間で N に足してコア命中率に効かせた（C-0170。仮説）',
    bullet.ja,
  ];
  const en = [
    `Core hit rate, distance bonus and bullet hit rate come from the ${profile.name.en} table (solo AUTO recordings)`,
    ...mixes.map((id) => mixLabel(profile, id).en),
    ...(n > 0 ? [`constant hit rate up ${pct(n)} scales core hit rate by 1/(1 − N)² (max 1)`] : []),
    'timed hit rate buffs (e.g. given at full burst) are added to N while active and change core hit rate (C-0170; hypothesis)',
    bullet.en,
  ];
  notes.push({ level: 'approx', code: 'auto-condition', message: { ja: ja.join('。'), en: en.join('; ') } });
  if (n < 0) {
    notes.push({
      level: 'unsupported',
      code: 'hit-rate-down',
      message: {
        ja: `常時の命中率▼（${pct(n)}）は、的の▼の表（plan/design-maids.md 8 節）にある武器種と N だけ効かせ、ほかはコア命中率・弾丸命中率に効かせていない（効き方を測っていない）`,
        en: `Constant hit rate down (${pct(n)}) only applies where the target's hit-rate-down table has the weapon type and N; otherwise it does not change core or bullet hit rate (not measured)`,
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

/**
 * コアの経路編（plan/design-anis-star-core-path.md 3.2 節）: 枠ごと・スキルのスロットごとの、周期の自動攻撃のヒットのコアに
 * 当たる割合の区間。的の表の coreHitRate.autoAttacks と着地点の時間割りで決まる（飛ぶ時間と同じ引き方。値は frames に入れる）。
 * 行の無いスロットは省き、どこにも無ければ null（コアに当たらない）
 */
export function slotAutoAttackCoreRatesOf(
  slots: readonly (Pick<TeamSlotInput, 'character'> | null)[],
  enemy: EnemyInput,
  frames: number,
): (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[] {
  const rows = enemy.target?.coreHitRate.autoAttacks;
  if (rows === undefined) return slots.map(() => null);
  const spans = landingFrameSpans(enemy, frames);
  return slots.map((slot) => {
    if (slot === null) return null;
    const out: Partial<Record<SkillSlot, FlightFrameSpan[]>> = {};
    for (const skill of SKILL_SLOTS) {
      const s = flightSpansOf(spans, rows[`${slot.character.resourceId}:${skill}`]);
      if (s !== null) out[skill] = s;
    }
    return Object.keys(out).length === 0 ? null : out;
  });
}

/** 注記のスキルのスロットの名前（日本語・英語） */
const SKILL_SLOT_TEXT = {
  skill1: ['スキル 1', 'Skill 1'],
  skill2: ['スキル 2', 'Skill 2'],
  burst: ['バースト', 'Burst'],
} as const;

/**
 * plan/design-anis-star-unimplemented.md 4 節: コアに当たりうるスキルのヒット（効果の core）のうち、敵の的の表に
 * coreHitRate.autoAttacks の行が無いスロットを知らせる（コアに当たらないとして計算した）。行のある敵・コアの無い敵・該当の効果の無い枠は空
 */
export function autoAttackCoreRowNotes(
  slot: Pick<TeamSlotInput, 'character' | 'skills'>,
  enemy: EnemyInput,
): ModelNote[] {
  const definition = slot.skills?.definition;
  if (!definition || !enemy.hasCore) return [];
  const rows = enemy.target?.coreHitRate.autoAttacks;
  const missing = SKILL_SLOTS.filter(
    (skill) =>
      definition.skills[skill].effects.some((e) => 'core' in e && e.core === true) &&
      (rows?.[`${slot.character.resourceId}:${skill}`] ?? null) === null,
  );
  if (missing.length === 0) return [];
  return [
    {
      level: 'unsupported',
      code: 'auto-attack-core-no-row',
      message: {
        ja: `この敵の表に、${missing.map((m) => SKILL_SLOT_TEXT[m][0]).join('・')}のヒットがコアに当たる割合が無い（未測定）。コアに当たらないとして計算した`,
        en: `This enemy's table has no core hit rate for the ${missing.map((m) => SKILL_SLOT_TEXT[m][1]).join(' and ')} hits (not measured); they are treated as never hitting the core`,
      },
    },
  ];
}

/**
 * 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.2 節）: 枠ごとの、通常攻撃に距離ボーナスの付く割合の区間（倍率ダメージの distance の
 * ヒットが読む。値は frames に入れる）。条件が自動の枠は着地点の計画の配分（autoConditionSummary と同じ足し方）、手入力の枠は条件の
 * distanceBonus で、[0, frames) を覆う 1 つの区間。距離ボーナスの範囲の無い武器は 0
 */
export function slotDistanceRatesOf(
  plan: LandingPlan | null,
  slots: readonly (Pick<TeamSlotInput, 'condition' | 'character'> | null)[],
  frames: number,
): (FlightFrameSpan[] | null)[] {
  return slots.map((slot, slotIndex) => {
    if (slot === null || slot.character.bonusRange === null) return null;
    if (plan === null || !plan.autoSlots[slotIndex]) {
      return slot.condition.distanceBonus ? [{ start: 0, end: frames, frames: 1 }] : null;
    }
    return plan.spans.map((span) => ({
      start: span.start,
      end: span.end,
      frames: landingPartsOf(plan, slot, slotIndex, span.landing).reduce(
        (sum, p) => sum + p.weight * (p.condition.distanceBonus ? 1 : 0),
        0,
      ),
    }));
  });
}

/**
 * 炸裂弾の時刻編（plan/design-eunhwa-tu-burst-shot-timing.md 4 節）: 枠ごと・スキルのスロットごとの、使用武器変更の最初の発の、発動の印
 * （hexagonFrameOf）から着弾までのフレームの区間。的の表の weaponChangeFirstHitFrames と着地点の時間割りで決まる（飛ぶ時間と同じ引き方）。
 * 行の無いスロットは省き、どこにも無ければ null（チャージ武器の最初の発の待ち）
 */
export function slotWeaponChangeFirstHitsOf(
  slots: readonly (Pick<TeamSlotInput, 'character'> | null)[],
  enemy: EnemyInput,
  frames: number,
): (Partial<Record<SkillSlot, FlightFrameSpan[]>> | null)[] {
  const rows = enemy.target?.weaponChangeFirstHitFrames;
  if (rows === undefined) return slots.map(() => null);
  const spans = landingFrameSpans(enemy, frames);
  return slots.map((slot) => {
    if (slot === null) return null;
    const out: Partial<Record<SkillSlot, FlightFrameSpan[]>> = {};
    for (const skill of SKILL_SLOTS) {
      const s = flightSpansOf(spans, rows[`${slot.character.resourceId}:${skill}`]);
      if (s !== null) out[skill] = s;
    }
    return Object.keys(out).length === 0 ? null : out;
  });
}

/** フレーム frame に撃った発・刻みのヒットの飛ぶ時間（区間の外・spans なしは 0） */
export function flightFramesAt(spans: readonly FlightFrameSpan[] | null | undefined, frame: number): number {
  return (spans && spanAt(spans, frame)?.frames) ?? 0;
}

/** 始まりの順に並んだ重ならない区間 [start, end) のうち、frame を含むもの（二分探索。無ければ undefined） */
export function spanAt<T extends { start: number; end: number }>(spans: readonly T[], frame: number): T | undefined {
  let lo = 0;
  let hi = spans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = spans[mid]!;
    if (frame < s.start) hi = mid - 1;
    else if (frame >= s.end) lo = mid + 1;
    else return s;
  }
  return undefined;
}
