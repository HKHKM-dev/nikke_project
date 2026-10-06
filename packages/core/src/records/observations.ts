// Stage 19-B: 観測値（records/observations/<録画 id>.json）の型・検証と、照合ランナー（モデルと比べて残差を出す）。
// plan/design-stage19.md 2.3・2.3.1・2.5 節。
import { BURST_GAUGE_MAX } from '../burst/controller.ts';
import {
  activationFramesOfSlot,
  hitFrameOf,
  hitFramesOf,
  videoFrameOf,
  type BurstSchedule,
} from '../burst/schedule.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { reloadFirstShotFrames } from '../cadence.ts';
import { DISTANCE_BONUS, PER_SHOT_DAMAGE_CORE, SKILL_HIT_FULL_BURST_BONUS } from '../damage.ts';
import { enemyEventsOf, enemyInputOf, enemyLandingsOf, targetProfileOf } from '../enemies.ts';
import { GEAR_PARTS, emptyBuild, type BuildInput } from '../build.ts';
import { resolveBuildEffects, type BuildEffectKind } from '../buildEffects.ts';
import { effectiveMaxAmmo, firingParams } from '../frame/firing.ts';
import { computeFixedSpecAttack, fixedSpecGrowth } from '../fixedSpec.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
import { applyCritBuffs, capCritRate, type AttackRounding } from '../skills/buffs.ts';
import { oneHitValue, type SustainedDamagePlacement } from '../skills/burstDamage.ts';
import { chanceScaleAt, type ChanceOpportunity } from '../skills/chance.ts';
import { MAX_SKILL_LEVELS, isResolvedChance, resolveTimed } from '../skills/resolve.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { gameSecondsToFrame } from '../time.ts';
import {
  SKILL_SLOTS,
  parseSkillDefinition,
  type SkillDefinition,
  type SkillEntry,
  type SkillSlot,
} from '../skills/types.ts';
import type { TeamInput, TeamResult, TeamSlotInput } from '../team.ts';
import { DEFAULT_WEAPON_MODEL } from '../weapons.ts';
import type { BuildMasters, CharacterData, EnemyPresetMaster } from '../types.ts';
import type { RecordingBuild, RecordingEntry } from './recordings.ts';

/** 何を読んだか（人と検索のため）。Stage 20-E: 大きさ（照準円の半径など）・位置（着地点の y など）・ゲージを足した */
export const OBSERVATION_KINDS = [
  'hit',
  'interval',
  'count',
  'timing',
  'total',
  'rate',
  'size',
  'position',
  'gauge',
] as const;
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
  /** 近の着地点を、並びの 1 回目・2 回目の順に固定する（録画で読んだ着地点。C-0155）。省略は配分 */
  nearLanding?: NearLanding[];
  /**
   * V-0086: 録画で読んだ的のジャンプの窓を持つ観測値の id（同じ録画。値は [始まり, 終わり, 始まり, 終わり, …] のゲーム内の秒）。
   * 出来事のセットの狙えない窓（代表値。C-0057）と、着地点の区間の切れ目をこれで置き換える。省略は代表値
   */
  jumpWindows?: string;
  /**
   * 録画の画で数えた、発が壊した障害物（plan/design-anis-star-gauge-timing.md 2.2 節）。slot は枠（1 始まり）、shot はその枠の
   * モデルの発の番号（1 始まり）、count は個数を持つ観測値の id（同じ録画・use が input・値は正の整数）。省略は無し
   */
  obstacles?: { slot: number; shot: number; count: string }[];
  /**
   * V-0165: 持続の命中率▲（C-0170）をコア命中率に効かせるか（TeamInput.sustainedHitRateUp）。省略 true。
   * false は C-0170 の前の形で、予測の仮説（H0）の override に使う
   */
  sustainedHitRateUp?: boolean;
  /**
   * 持続ダメージ▲編（plan/design-sustained-damage-up.md 3.3 節）: 持続ダメージ▲の式の中の置き場所（TeamInput.sustainedDamagePlacement）。
   * 省略はいまのモデル。予測の仮説（H1〜H3）の override に使う
   */
  sustainedDamagePlacement?: SustainedDamagePlacement;
  /**
   * 攻撃力▲の丸め（TeamInput.attackRounding。V-0265）。省略はいまのモデル（C-0027）。
   * 予測の仮説の override に使う
   */
  attackRounding?: AttackRounding;
  /** V-0165: false なら、録画（予測の編成）の宝物の段階を使わず、どの枠も基礎版のスキルにする。省略 true */
  treasure?: boolean;
  /**
   * Stage 13 の残り: スペック固定 OFF の録画で、育成の効果層のうちこの種類（overload・cube・collection）を外す。
   * 「その効果は乗らない」という予測の仮説（H0）の override に使う。攻撃力（キャラ画面の値）は変えない。省略は外さない
   */
  buildEffectsOff?: BuildEffectKind[];
  /**
   * 対象の語彙編（plan/design-target-vocab.md 4 節）: 定義に効果を足す。結論の無い効果を、定義のファイルを変えずに予測の仮説の
   * override でだけ入れる。rid のキャラの skill（treasure なら宝物版）の effects の末尾に、effect（定義の JSON の書き方）を足す。
   * replace（0 始まり）があれば、末尾に足さずにその位置の効果を置き換える（対象を絞るなど、定義の効果の読みを替える仮説）
   */
  addEffects?: AddedEffect[];
  /**
   * V-0231: これらの rid の定義（基礎版・宝物版）から回復（heal）を落とす。回復を定義する前のモデルの形で、予測の仮説（H0）の
   * override に使う（plan/design-heal-vocabulary.md 6 節の論点 2）。省略は無し
   */
  dropHeals?: number[];
};

/** CompareSetup.addEffects の 1 件 */
export type AddedEffect = {
  rid: number;
  skill: SkillSlot;
  treasure?: boolean;
  effect: Record<string, unknown>;
  replace?: number;
};

/**
 * 定義に効果を足して読み直す（読み込みの検査をそのまま通す）。support は読み込みで決まる欄なので、JSON に戻すときに外す
 */
export function withAddedEffects(definition: SkillDefinition, adds: readonly AddedEffect[]): SkillDefinition {
  if (adds.length === 0) return definition;
  const json = JSON.parse(JSON.stringify(definition)) as {
    skills: Record<string, { support?: unknown; effects: unknown[] }>;
    treasureSkills?: Record<string, { support?: unknown; effects: unknown[] }>;
  };
  for (const group of [json.skills, json.treasureSkills ?? {}]) {
    for (const slot of SKILL_SLOTS) delete group[slot]?.support;
  }
  for (const add of adds) {
    const group = add.treasure === true ? json.treasureSkills : json.skills;
    const entry = group?.[add.skill];
    if (entry === undefined)
      throw new Error(`rid ${add.rid} の ${add.treasure === true ? '宝物版の ' : ''}${add.skill} が無い`);
    if (add.replace === undefined) entry.effects.push(add.effect);
    else if (add.replace in entry.effects) entry.effects[add.replace] = add.effect;
    else throw new Error(`rid ${add.rid} の ${add.skill} に ${add.replace} 番目の効果が無い`);
  }
  return parseSkillDefinition(json);
}

/** Stage 18-C: 中遠の 3 か所（足元 584・571・561。C-0044） */
export const MID_FAR_LANDINGS = ['A', 'B', 'C'] as const;
export type MidFarLanding = (typeof MID_FAR_LANDINGS)[number];

/** 近の 2 か所（的の見かけの大きさで分かれる。C-0155） */
export const NEAR_LANDINGS = ['A', 'B'] as const;
export type NearLanding = (typeof NEAR_LANDINGS)[number];

/** 中遠の着地点を固定する enemyLandingsOf の fixed */
export function midFarFixed(landing: MidFarLanding | undefined): Record<string, string> {
  return landing === undefined ? {} : { midFar: `midFar${landing}` };
}

/** 中遠と近の着地点を固定する enemyLandingsOf の fixed（近は 1 回目・2 回目の順） */
export function landingFixed(
  midFar: MidFarLanding | undefined,
  near: readonly NearLanding[] | undefined,
): Record<string, string | string[]> {
  return { ...midFarFixed(midFar), ...(near === undefined ? {} : { near: near.map((n) => `near${n}`) }) };
}

export type Tolerance = { rel: number } | { abs: number };

export type CompareSpec = {
  model: 'sim' | 'calc';
  metric: string;
  args: Record<string, number | string | boolean>;
  tolerance: Tolerance;
  setup: CompareSetup;
};

/** 値の幅（Stage 20-E）。range は最小〜最大、ci95 は 95% 区間 */
export type ObservationSpread = { kind: 'range' | 'ci95'; low: number; high: number };

export type Observation = {
  id: string;
  /** 置き場所の録画（recordings があれば、その中で最も若い番号） */
  recording: string;
  /** 複数の録画にまたがる値のとき、その録画の全部（recording も含める）。compare には使わない（Stage 20-E） */
  recordings?: string[];
  kind: ObservationKind;
  use: ObservationUse;
  value: number | number[];
  /** 値の単位（px・f・%・倍 など。Stage 20-E） */
  unit?: string;
  /** 値の幅（Stage 20-E） */
  spread?: ObservationSpread;
  /** 何の値か（1〜2 文） */
  description: string;
  /** 値を記録した場所。検証記録から作ったものは、その ID（V-NNNN）だけを書く（Stage 20-D） */
  source: string;
  method?: { tool?: string; note?: string };
  evidence?: string[];
  compare?: CompareSpec;
  /** 読み取った日（YYYY-MM-DD。Stage 20-E） */
  readAt?: string;
  /** 使えなくなった観測値（読み違い・条件の誤り・ゲームの更新など）。消さずに付け、照合から外す（Stage 20-E） */
  invalid?: { reason: string; date: string };
};

/** 失効した観測値 → 失効の理由（Stage 20-E） */
export function invalidReasonsOf(observations: readonly Observation[]): Map<string, string> {
  return new Map(observations.flatMap((o) => (o.invalid ? [[o.id, o.invalid.reason] as const] : [])));
}

/** 録画の ID の並び（このリポジトリの録画は番号順、その後に旧の録画） */
function recordingOrder(a: string, b: string): number {
  const na = /^\d+$/.test(a) ? Number(a) : Infinity;
  const nb = /^\d+$/.test(b) ? Number(b) : Infinity;
  return na - nb || a.localeCompare(b);
}

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

function magazineShots(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const count = Number(ctx.args.count);
  const ends = (log.lastShotFrames ?? []).slice(0, count);
  if (ends.length < count) throw new Error(`マガジンが ${ends.length} 本しか撃ち切られていない`);
  let first = 0;
  return ends.map((end) => {
    const last = log.frames.indexOf(end);
    const shots = last - first + 1;
    first = last + 1;
    return shots;
  });
}

/**
 * クラウン編（V-0178）: その枠が出した回復（heal）ごとに、前の回復（初回は戦闘の始め）からその回復までに撃った通常攻撃の
 * 当たる数の期待値（発ごとの区間の弾丸命中率の和）。録画の総ダメージの増分から数えたヒット数と比べる
 */
function healHitCounts(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const slot = slotOf(result.slots, ctx);
  const frames = slotOf(result.shots, ctx).frames;
  const heals = result.timeline.heals.filter((h) => h.sourceSlotIndex === slotIndex).map((h) => h.frame);
  const starts = [...new Set(heals)].sort((a, b) => a - b);
  let from = 0;
  return starts.map((to) => {
    let hits = 0;
    for (const f of frames) {
      if (f < from || f >= to) continue;
      const segment = slot.segments.find((s) => s.start <= f && f < s.end);
      if (!segment) throw new Error(`フレーム ${f} の区間が無い`);
      hits += segment.trigger.hitRate;
    }
    from = to;
    return Math.round(hits * 100) / 100;
  });
}

/**
 * モダニア編（V-0179）: そのフレームの区間の最大装弾数（最大装弾数▲▼を足して丸めた値。C-0017）。録画ではリロードを終えた直後の
 * 照準の横の残弾と比べる
 */
/**
 * Stage 13 の残り（キューブのリロード速度▲）: そのフレームの区間の、リロード 1 回分の長さ（動画のフレーム。ゲーム内の時計で数えた
 * 端数つきの値。C-0145）。録画では、RELOADING のバーが 0 から満ちるまでの長さ（レシピ reload-segments のバーの長さ）と比べる
 */
function reloadFramesAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return firingParams(input.character.shot, segment.trigger.buffs).reloadChunkFrames;
}

/**
 * V-0264（キューブのリロード速度▲の残差）: そのフレームの区間の、マガジンの最終弾から次のマガジンの 1 発目までの長さ（動画のフレーム。
 * リロード 1 回分の端数つきの長さ + リロード明けの 1 発目まで。C-0148）。録画では、レシピ reload-segments の最終弾 → 完了と
 * 完了 → 次の増分の和（リロードごと）と比べる。バーの長さと違い、武器種ごとの切片（C-0135）を含まない形で比べられる
 */
function reloadToNextShotAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const shot = input.character.shot;
  const params = firingParams(shot, segment.trigger.buffs);
  return params.reloadChunkFrames + reloadFirstShotFrames(shot, DEFAULT_WEAPON_MODEL, params);
}

function maxAmmoAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return effectiveMaxAmmo(input.character.shot.maxAmmo, segment.trigger.buffs);
}

/**
 * 5-2 の撮影計画（V-0177）: その枠が受ける timed の効果の窓の終わり（モデルのフレーム。戦闘時間で切った窓は戦闘の終わり）。
 * skill（'skill1' | 'skill2' | 'burst'）と stat で絞る
 */
function buffWindowEnds(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  return result.timeline.windows
    .filter(
      (w) => w.slotIndex === slotIndex && w.effect.source.skill === ctx.args.skill && w.effect.stat === ctx.args.stat,
    )
    .map((w) => w.end);
}

/**
 * ソルジャーE.G. 編（V-0240）: その枠が受ける timed の効果の窓の始まり（モデルのフレーム。昇順・重複なし）。skill と stat で絞る。
 * count を書くと最初の count 個（録画で読めた回数にそろえる）。video が true なら動画のフレーム（フルバーストの入りの止まりを
 * videoFrameOf で足す。戦闘開始からの数）
 */
function buffWindowStarts(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const starts = [
    ...new Set(
      result.timeline.windows
        .filter(
          (w) =>
            w.slotIndex === slotIndex && w.effect.source.skill === ctx.args.skill && w.effect.stat === ctx.args.stat,
        )
        .map((w) => w.start),
    ),
  ]
    .sort((a, b) => a - b)
    .map((f) => (ctx.args.video === true ? videoFrameOf(result.schedule, f) : f));
  return ctx.args.count === undefined ? starts : starts.slice(0, Number(ctx.args.count));
}

/**
 * ソルジャーE.G. 編（V-0241）: 枠の、スロット skill の確率のきっかけの効果の機会（発の次のフレームから、確率 = p × その発の回数の量）と
 * 維持のフレーム。窓の小片（skills/chance.ts）と同じ機会を、射撃の列から作り直す
 */
function chanceSourceOf(
  result: SimResult,
  ctx: MetricContext,
): { opportunities: ChanceOpportunity[]; duration: number } {
  const input = slotOf(ctx.input.slots, ctx);
  if (input.skills === undefined || input.skills.definition === null)
    throw new Error(`枠 ${String(ctx.args.slot)} にスキル定義が無い`);
  const effect = resolveTimed(input.skills.definition, input.character, input.skills.levels).find(
    (e) => e.source.skill === ctx.args.skill && isResolvedChance(e.trigger),
  );
  if (effect === undefined || !isResolvedChance(effect.trigger)) {
    throw new Error(`枠 ${String(ctx.args.slot)} の ${String(ctx.args.skill)} に確率のきっかけの効果が無い`);
  }
  const trigger = effect.trigger;
  const log = slotOf(result.shots, ctx);
  const opportunities = log.frames.flatMap((f, k) => {
    const weight = trigger.count === 'normalHit' ? (log.hits?.[k] ?? 1) : 1;
    return weight > 0 && f + 1 < result.frames ? [{ start: f + 1, q: Math.min(1, trigger.chance * weight) }] : [];
  });
  return { opportunities, duration: effect.durationFrames };
}

/**
 * ソルジャーE.G. 編（V-0241）: 枠の発（[from, to)。省略は全部）のうち、スロット skill の確率のきっかけの効果が付いている発の割合の
 * 期待値（発のフレームの「付いている確率」の平均）。録画では、1 発の値の格子で▲が付いていると読めた発の割合と比べる
 */
function chanceActiveRatio(result: SimResult, ctx: MetricContext): number {
  const { opportunities, duration } = chanceSourceOf(result, ctx);
  const frames = shotFramesIn(result, ctx);
  if (frames.length === 0) throw new Error('発が無い');
  return frames.reduce((sum, f) => sum + chanceScaleAt(opportunities, duration, f), 0) / frames.length;
}

/**
 * ソルジャーE.G. 編（V-0241）: 枠の続けて撃った 2 発（どちらも [from, to)）のうち、前の発で付いていて後の発で切れている組の数の期待値。
 * 付いていない事象は「効いている機会でどれも引かなかった」で、機会は互いに独立なので、
 * P(前で付き・後で切れ) = P(後で切れ) − P(前でも後でも切れ) = Π_{後}(1 − q) − Π_{前 ∪ 後}(1 − q)。
 * 録画では、▲が付いていると読めた発の次の発が付いていないと読めた回数と比べる（上書き延長でなければ、ずっと多くなる）
 */
function chanceExpiries(result: SimResult, ctx: MetricContext): number {
  const { opportunities, duration } = chanceSourceOf(result, ctx);
  const frames = shotFramesIn(result, ctx);
  const activeAt = (f: number) => opportunities.filter((o) => o.start <= f && f < o.start + duration);
  const none = (ops: readonly ChanceOpportunity[]) => ops.reduce((p, o) => p * (1 - o.q), 1);
  let sum = 0;
  for (let k = 1; k < frames.length; k++) {
    const before = activeAt(frames[k - 1]!);
    const after = activeAt(frames[k]!);
    const union = [...new Set([...before, ...after])];
    sum += none(after) - none(union);
  }
  return sum;
}

/**
 * ウンファ：TU S2 の撮影計画: そのフレームの区間の、通常攻撃の会心率（素の会心率 + クリティカル確率▲ + 通常攻撃のクリティカル
 * 確率▲）。録画では、その枠の通常攻撃のヒットのうち会心だった割合と比べる
 */
function critRateAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return capCritRate(
    applyCritBuffs(input.character.crit, segment.trigger.buffs).rate + segment.trigger.buffs.normalCritRate,
  );
}

/**
 * 枠の発のうち [from, to) のもの（モデルのフレーム）。burst（0 始まり）を書くと、from・to はその枠の burst 回目のバーストの
 * 発動からの相対になる（モデルが変わって発動が動いても、同じ窓を数える。V-0227）
 */
function shotFramesIn(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  let base = 0;
  if (ctx.args.burst !== undefined) {
    const n = Number(ctx.args.burst);
    const frames = result.schedule === null ? [] : activationFramesOfSlot(result.schedule, slotIndexOf(ctx));
    const at = frames[n];
    if (at === undefined) throw new Error(`枠 ${String(ctx.args.slot)} のバーストの発動 ${n} 回目（0 始まり）が無い`);
    base = at;
  }
  const from = base + (ctx.args.from === undefined ? 0 : Number(ctx.args.from));
  const to = ctx.args.to === undefined ? result.frames : base + Number(ctx.args.to);
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
  // V-0119: 1 発のヒット数（的の表の hitsPerShot）は 1 ヒットの値に含めない
  return ((t.normal / t.hitRate / t.hitsPerShot / t.boost.total) * boost) / shot.shotCount;
}

/**
 * V-0165: その時点の区間で通常攻撃に使うコア命中率（条件が自動の枠は、着地点の表の値をその区間の命中率▲ N で出し直したもの。
 * C-0036・C-0170）。1 トリガーの倍率グループのコアの項を、コアのダメージ倍率で割って戻す。着地点の配分が複数の区間（中遠）では
 * 配分の重みの平均で、弾丸命中率の重みは付けない（録画の「コア / 当たった数」と比べるのは、配分が 1 つの区間（近・中近・遠）だけにする）
 */
function coreHitRate(result: SimResult, ctx: MetricContext): number {
  if (!ctx.input.enemy.hasCore) return 0;
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  const shot = t.buffs.weapon?.shot ?? input.character.shot;
  return t.boost.core / (shot.coreDamageRate - 1 + t.buffs.coreDamage);
}

/** その時点の区間の弾丸命中率（1 トリガーの命中の期待値。条件が自動なら的の表と着地点の値。backlog 2-25） */
function bulletHitRate(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return segment.trigger.hitRate;
}

function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('値が無い');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** 発の列（モデルのフレーム）のうち、両端が [from, to) に入る発と発の間（動画のフレーム） */
function videoIntervalsIn(schedule: BurstSchedule, frames: readonly number[], from: number, to: number): number[] {
  const inside = frames.filter((f) => f >= from && f < to).map((f) => videoFrameOf(schedule, f));
  return inside.slice(1).map((f, i) => f - inside[i]!);
}

function fullBurstShotIntervalDiff(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const frames = slotOf(result.shots, ctx).frames;
  const length = window.end - window.start;
  const inside = videoIntervalsIn(schedule, frames, window.start, window.end);
  const before = videoIntervalsIn(schedule, frames, window.start - length, window.start);
  return median(inside) - median(before);
}

function fullBurstStartIntervals(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const starts = schedule.fullBurstWindows.map((w) => videoFrameOf(schedule, w.start));
  const n = Number(ctx.args.n);
  if (starts.length < n + 1) throw new Error(`フルバーストが ${starts.length} 回しかない`);
  return starts.slice(1, n + 1).map((s, i) => s - starts[i]!);
}

/**
 * アニス：スター S2・バースト編（V-0124）: n 回目（0 始まり）のフルバーストの入りから、その後の最初のバーストの発動までの動画のフレーム数
 * （フルバーストの後に I だけ撃って切れる発動の時刻。ゲージの溜まり方と CT で決まる）。入りの止まり（C-0069）は videoFrameOf で足す
 */
function fullBurstToNextActivation(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const window = schedule.fullBurstWindows[n];
  if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
  const next = schedule.activations.find((a) => a.frame > window.start);
  if (next === undefined) throw new Error(`${n} 回目のフルバーストの後に発動が無い`);
  return videoFrameOf(schedule, next.frame) - videoFrameOf(schedule, window.start);
}

/**
 * アニス：スター S2・バースト編（V-0124）: n 回目（0 始まり）のフルバーストの入りから、その後に最初にゲージが満タンになる（BURST バーが
 * 消える。C-0083）までの動画のフレーム数。フルバーストの後のゲージの溜まり方を、CT に左右されずに比べる
 */
function fullBurstToGaugeFull(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const window = schedule.fullBurstWindows[n];
  if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
  const full = schedule.gaugeFullFrames.find((f) => f > window.start);
  if (full === undefined) throw new Error(`${n} 回目のフルバーストの後に満タンが無い`);
  return videoFrameOf(schedule, full) - videoFrameOf(schedule, window.start);
}

/**
 * V-0189: n 回目（0 始まり）にゲージが満タンになった（BURST バーが消えた）フレームから、その後の最初の発動（I）までの動画のフレーム数。
 * ゲージが律速の回の I の段の長さ（C-0073）を比べる
 */
function gaugeFullToActivation(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const full = schedule.gaugeFullFrames[n];
  if (full === undefined) throw new Error(`${n} 回目の満タンが無い`);
  const next = schedule.activations.find((a) => a.frame >= full);
  if (next === undefined) throw new Error(`${n} 回目の満タンの後に発動が無い`);
  return videoFrameOf(schedule, next.frame) - videoFrameOf(schedule, full);
}

function burstActivationSlots(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  if (schedule.activations.length < n) throw new Error(`発動が ${schedule.activations.length} 回しかない`);
  return schedule.activations.slice(0, n).map((a) => a.slotIndex + 1);
}

/**
 * アニス：スター編: 射撃ごとの倍率ダメージ（perShot。「フルチャージ攻撃が命中した時、最終攻撃力の X% の追加ダメージ」など）の 1 回の値。
 * hitDamage と同じく、その時点の区間の 1 トリガーの perShot から、倍率グループ（1 + 会心 + フルバースト）だけをパターンに差し替えて
 * 組み直す。枠に射撃ごとの倍率ダメージが複数あれば合計の値になる
 */
function perShotHitDamage(result: SimResult, ctx: MetricContext): number {
  if (PER_SHOT_DAMAGE_CORE) throw new Error('perShotHitDamage はコアの補正が乗る perShot に未対応');
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const t = segment.trigger;
  if (t.hitRate === 0 || t.perShot === 0) throw new Error('命中率か射撃ごとの倍率ダメージが 0');
  const crit = applyCritBuffs(input.character.crit, t.buffs);
  const fullBurst = SKILL_HIT_FULL_BURST_BONUS ? t.boost.fullBurst : 0;
  const expected = 1 + crit.rate * (crit.damage - 1) + fullBurst;
  const pattern = 1 + (ctx.args.crit === true ? crit.damage - 1 : 0) + fullBurst;
  return (t.perShot / t.hitRate / expected) * pattern;
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
  /**
   * アニス：スター編（V-0122）: 録画の動画のフレームで数えた、フルバーストの入りどうしの間隔（最初の n 個）。入りの止まり
   * （C-0069）を足した動画のフレームの差なので、録画の戦闘開始のずれに依らない
   */
  fullBurstStartIntervals: {
    args: ['n'],
    sim: (r, c) => fullBurstStartIntervals(r, c),
    calc: (r, c) => fullBurstStartIntervals(r, c),
  },
  /** アニス：スター編（V-0121）: バーストを撃った枠（1 始まり）の並び（最初の n 回。チェーンが切れた単独の発動も入る） */
  burstActivationSlots: {
    args: ['n'],
    sim: (r, c) => burstActivationSlots(r, c),
    calc: (r, c) => burstActivationSlots(r, c),
  },
  fullBurstToNextActivation: {
    args: ['n'],
    sim: (r, c) => fullBurstToNextActivation(r, c),
    calc: (r, c) => fullBurstToNextActivation(r, c),
  },
  fullBurstToGaugeFull: {
    args: ['n'],
    sim: (r, c) => fullBurstToGaugeFull(r, c),
    calc: (r, c) => fullBurstToGaugeFull(r, c),
  },
  gaugeFullToActivation: {
    args: ['n'],
    sim: (r, c) => gaugeFullToActivation(r, c),
    calc: (r, c) => gaugeFullToActivation(r, c),
  },
  fullBurstStarts: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
    calc: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
  },
  /**
   * ゲーム内の fromSec 秒から toSec 秒までの、録画の動画のフレーム数。フルバーストの入りの止まり（C-0069）を足す。
   * 3 分モードの残り時間が 02:59 から 00:00 になるまでは fromSec 0・toSec 179
   */
  videoFramesBetween: {
    args: ['fromSec', 'toSec'],
    sim: (r, c) => videoFramesBetween(r.schedule, c),
    calc: (r, c) => videoFramesBetween(r.schedule, c),
  },
  gaugeFullFrame: {
    args: ['n'],
    sim: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
    calc: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
  },
  // 録画 045・046・082 の「n 回目に BURST バーが消えた発の番号」（V-0085）。モデルは全発が当たるので、外れた発のある録画では
  // 当たった発の番号と比べる。満タンが来なければ 0
  gaugeFullShotIndex: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const full = r.schedule?.gaugeFullFrames[Number(c.args.n)];
      if (full === undefined) return 0;
      return slotOf(r.shots, c).frames.filter((f) => f <= full).length;
    },
  },
  // V-0235: n 回目（0 始まり）にチェーンが切れた（ゲージが 0 に戻った。C-0009）フレームの後から、次に BURST バーが消えたフレームまでに
  // 枠が撃った発の数。単騎のオートバーストで、チェーンの待ちの明けから次の満タンまでの溜まり方を比べる
  chainTimeoutToGaugeFullShots: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const timeout = r.schedule?.chainTimeouts[Number(c.args.n)];
      if (timeout === undefined) throw new Error(`${String(c.args.n)} 回目のチェーン切れが無い`);
      const full = r.schedule?.gaugeFullFrames.find((f) => f > timeout);
      if (full === undefined) throw new Error(`${String(c.args.n)} 回目のチェーン切れの後に満タンが無い`);
      return slotOf(r.shots, c).frames.filter((f) => f > timeout && f <= full).length;
    },
  },
  burstCount: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).burst.activations.length,
    calc: (r, c) => slotOf(r.slots, c).burst.activations.length,
  },
  // ニヒリスター編: skill（'skill1' | 'skill2' | 'burst'）を書けば、そのスロットの倍率ダメージだけを数える（任意）
  skillHitCount: {
    args: ['slot'],
    sim: (r, c) =>
      c.args.skill === undefined
        ? slotOf(r.slots, c).skillHits.frames.length
        : r.skillHits.filter((h) => h.slotIndex === slotIndexOf(c) && h.effect.source.skill === c.args.skill).length,
    calc: (r, c) =>
      slotOf(r.slots, c).skillHits.activations.filter(
        (a) => c.args.skill === undefined || a.effect.source.skill === c.args.skill,
      ).length,
  },
  shotCount: { args: ['slot'], sim: (r, c) => shotFramesIn(r, c).length },
  healHitCounts: { args: ['slot'], sim: healHitCounts },
  maxAmmoAt: { args: ['slot', 'frame'], sim: maxAmmoAt },
  reloadFramesAt: { args: ['slot', 'frame'], sim: reloadFramesAt },
  reloadToNextShotAt: { args: ['slot', 'frame'], sim: reloadToNextShotAt },
  buffWindowEnds: { args: ['slot', 'skill', 'stat'], sim: buffWindowEnds },
  buffWindowStarts: { args: ['slot', 'skill', 'stat'], sim: buffWindowStarts },
  chanceActiveRatio: { args: ['slot', 'skill'], sim: chanceActiveRatio },
  chanceExpiries: { args: ['slot', 'skill'], sim: chanceExpiries },
  critRateAt: { args: ['slot', 'frame'], sim: critRateAt },
  // ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 3 節）: 戦闘の始めから count 本のマガジンの発数（リロードからリロードまで。
  // 最後の弾丸の発を含む）。弾丸チャージでマガジンが延びるかを見る
  magazineShots: { args: ['slot', 'count'], sim: magazineShots },
  shotIntervals: {
    args: ['slot'],
    sim: (r, c) => {
      const frames = shotFramesIn(r, c);
      return frames.slice(1).map((f, i) => f - frames[i]!);
    },
  },
  hitDamage: { args: ['slot', 'frame', 'core', 'crit', 'distance'], sim: hitDamage },
  // 対象の語彙編（plan/design-target-vocab.md 4.1 節）: 同じ区間・同じ部位の、会心した 1 ヒットと会心しない 1 ヒットの比。
  // 敵に掛かる別枠の乗数（受けるダメージ▲）と攻撃力は比で消え、倍率グループの会心の項（クリティカルダメージ）だけが残る
  critHitRatio: {
    args: ['slot', 'frame', 'core', 'distance'],
    sim: (r, c) =>
      hitDamage(r, { ...c, args: { ...c.args, crit: true } }) /
      hitDamage(r, { ...c, args: { ...c.args, crit: false } }),
  },
  // 対象の語彙編（同 4.2 節）: n 回目（0 始まり）のフルバーストの窓の中の、枠の発と発の間の中央値から、窓の前の同じ長さの中央値を
  // 引いたもの（動画のフレーム）。チャージ時間▼が窓の間だけ効くかを見る
  fullBurstShotIntervalDiff: { args: ['slot', 'n'], sim: fullBurstShotIntervalDiff },
  coreHitRate: { args: ['slot', 'frame'], sim: coreHitRate },
  bulletHitRate: { args: ['slot', 'frame'], sim: bulletHitRate },
  coreHitRateDiff: {
    args: ['slot', 'frame', 'baseFrame'],
    sim: (r, c) => coreHitRate(r, c) - coreHitRate(r, { ...c, args: { ...c.args, frame: c.args.baseFrame! } }),
  },
  perShotHitDamage: { args: ['slot', 'frame', 'crit'], sim: perShotHitDamage },
  burstHitDamage: { args: ['slot', 'n', 'crit'], sim: burstHitDamage },
  dotHitDamage: { args: ['slot', 'n', 'crit'], sim: dotHitDamage },
  dotTickOffsets: { args: ['slot', 'n'], sim: dotTickOffsets },
  dotStackTickDamage: { args: ['slot', 'frame', 'stacks', 'crit'], sim: dotStackTickDamage },
  skillHitDamage: { args: ['slot', 'n', 'crit'], sim: skillHitDamage },
  skillHitsDamage: { args: ['slot', 'n', 'count', 'crit'], sim: skillHitsDamage },
  burstHitDelays: { args: ['slot', 'count'], sim: burstHitDelays },
  burstHitOffsets: { args: ['slot', 'n'], sim: burstHitOffsets },
  fullBurstCrossingShotGauge: { args: ['slot'], sim: fullBurstCrossingShotGauge },
  shotGauge: { args: ['slot', 'n'], sim: shotGauge },
};

/**
 * アニス：スター編（plan/design-anis-star-gauge-timing.md 7 節の V-B）: 枠の n 発目（1 始まり）が溜めたゲージ（バーの最大に対する %。
 * 発・射撃ごとの倍率ダメージのヒット・その発が壊した障害物の物のゲージの合計。着弾のフレームは問わない）
 */
function shotGauge(result: SimResult, ctx: MetricContext): number {
  const slotIndex = slotIndexOf(ctx);
  const n = Number(ctx.args.n);
  const frame = result.shots[slotIndex]?.frames[n - 1];
  if (frame === undefined) throw new Error(`${n} 発目が無い`);
  const energy = result.shotGauges
    .filter((g) => g.slotIndex === slotIndex && g.shotFrame === frame)
    .reduce((a, g) => a + g.energy, 0);
  return Math.round((energy / BURST_GAUGE_MAX) * 10_000) / 100;
}

/**
 * アニス：スター編（plan/design-anis-star-gauge-timing.md 3.5 節・7 節の V-A）: 録画の窓の終わりを跨ぐ発（窓の中で撃ち、窓の後に着いた発）が
 * 溜めたゲージ（バーの最大に対する %。発と射撃ごとの倍率ダメージのヒットの合計）と比べる、モデルの発 1 つ分のゲージ。
 * 窓の順に、窓の始まりより後に撃って窓の終わりより後（終わりのフレームを含む）に着いた最初の発（跨ぐ発か、窓の後に撃った発）の値。
 * モデルにどの窓の終わりを跨ぐ発があるかは発の位相で 1f ごとに入れ替わるので、跨ぐ発に限らない（V-0189 の論点 3 の X1）。
 * 跨ぐ発も着弾のフレームに溜めること（C-0259）は、1 パス目の単体テストで見る。窓の後に着く発が無ければ誤り
 */
function fullBurstCrossingShotGauge(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const windows = schedule.fullBurstWindows;
  for (const [k, w] of windows.entries()) {
    const next = windows[k + 1]?.start ?? Infinity;
    const after = result.shotGauges.filter(
      (g) => g.slotIndex === slotIndex && w.start <= g.shotFrame && g.shotFrame < next && g.frame >= w.end,
    );
    if (after.length === 0) continue;
    const first = Math.min(...after.map((g) => g.shotFrame));
    const energy = after.filter((g) => g.shotFrame === first).reduce((a, g) => a + g.energy, 0);
    return Math.round((energy / BURST_GAUGE_MAX) * 10_000) / 100;
  }
  throw new Error('フルバーストの窓の後に着く発が無い');
}

function videoFramesBetween(schedule: SimResult['schedule'], ctx: MetricContext): number {
  const from = gameSecondsToFrame(Number(ctx.args.fromSec));
  const to = gameSecondsToFrame(Number(ctx.args.toSec));
  return videoFrameOf(schedule, to) - videoFrameOf(schedule, from);
}

/**
 * バーストの倍率ダメージ（burstDamage）の n 回目（0 始まり）の 1 発動の値。hitDamage と同じく、
 * 会心の期待値を外して、会心したか（crit）で組み直す。効果が複数あるときは、その合計（HUD の 1 ヒットと同じとは限らない）
 */
function burstHitDamage(result: SimResult, ctx: MetricContext): number {
  const hit = slotOf(result.slots, ctx).burst.hits[Number(ctx.args.n)];
  if (hit === undefined) throw new Error(`${String(ctx.args.n)} 回目のバーストの倍率ダメージが無い`);
  return oneHitValue(hit, ctx.args.crit === true);
}

/**
 * ニヒリスター編: 持続ダメージ（dot）の n 回目（0 始まり。枠の全 tick を通した順）の 1 tick の値。burstHitDamage と同じく、
 * 会心の期待値を外して、会心したか（crit）で組み直す（plan/design-nihilister.md 4 節）。
 * コアの経路編（plan/design-anis-star-core-path.md 3.1 節）: 省略できる引数 core が true なら、コアに当たったヒットの値
 * （boost に コア倍率 − 1 を足す）。core の効果でないヒットに core: true は拒否する
 */
function dotHitDamage(result: SimResult, ctx: MetricContext): number {
  const ticks = result.skillHits.filter((h) => h.slotIndex === slotIndexOf(ctx) && h.effect.dot !== undefined);
  const tick = ticks[Number(ctx.args.n)];
  if (tick === undefined) throw new Error(`${String(ctx.args.n)} 回目の持続ダメージの tick が無い`);
  if (ctx.args.core === true && tick.effect.core !== true) throw new Error('コアに当たらない効果の tick に core: true');
  return oneHitValue(tick.hit, ctx.args.crit === true, ctx.args.core === true);
}

/**
 * 持続ダメージ▲編（レイヴン。V-0227）: スタックする持続ダメージの、フレーム frame 以降の最初の tick を、スタックの数 stacks の tick に
 * 組み直した値（1 スタックの値 × stacks。会心は dotHitDamage と同じく組み直す）。録画の tick のスタックの数がモデルと違っても、
 * その時点のバフの乗り方だけを比べられる（tick は全スタックの和が 1 つのダメージ。C-0182）
 */
function dotStackTickDamage(result: SimResult, ctx: MetricContext): number {
  const frame = Number(ctx.args.frame);
  const tick = result.skillHits.find(
    (h) => h.slotIndex === slotIndexOf(ctx) && h.effect.dot !== undefined && h.frame >= frame,
  );
  if (tick === undefined) throw new Error(`フレーム ${frame} 以降に持続ダメージの tick が無い`);
  if (tick.stacks === undefined) throw new Error('スタックしない持続ダメージの tick');
  return (oneHitValue(tick.hit, ctx.args.crit === true) / tick.stacks) * Number(ctx.args.stacks);
}

/**
 * 受けるダメージ編（イサベル）: 倍率ダメージ（damage。持続ダメージを除く）の n 回目（0 始まり。枠の発動を通した順）の 1 発動の値。
 * dotHitDamage と同じく、会心の期待値を外して、会心したか（crit）で組み直す
 */
function skillHitDamage(result: SimResult, ctx: MetricContext): number {
  const hits = result.skillHits.filter((h) => h.slotIndex === slotIndexOf(ctx) && h.effect.dot === undefined);
  const hit = hits[Number(ctx.args.n)];
  if (hit === undefined) throw new Error(`${String(ctx.args.n)} 回目の倍率ダメージが無い`);
  return oneHitValue(hit.hit, ctx.args.crit === true);
}

/**
 * V-0265: 倍率ダメージの n 回目から count 回（skillHitDamage と同じ通し番号）の和。同じ発で出る 2 つの倍率ダメージ
 * （ドレイクの S2 の毎回のヒットと「5 回攻撃」）は HUD の総ダメージの 1 つの増分に乗るので、和で比べる
 */
function skillHitsDamage(result: SimResult, ctx: MetricContext): number {
  const n = Number(ctx.args.n);
  let sum = 0;
  for (let i = n; i < n + Number(ctx.args.count); i++)
    sum += skillHitDamage(result, { ...ctx, args: { ...ctx.args, n: i } });
  return sum;
}

/**
 * バーストの着弾編（plan/design-burst-landing.md）: 枠のバーストの、発動からヒット（バーストの倍率ダメージ。分かれたヒットは 1 ヒット目）までの
 * 動画のフレーム数（発動の順に最初の count 回）。フルバーストの入りの止まりは videoFrameOf で足す
 */
function burstHitDelays(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const count = Number(ctx.args.count);
  if (mine.length < count) throw new Error(`発動が ${mine.length} 回しかない`);
  return mine.slice(0, count).map((a) => videoFrameOf(schedule, hitFrameOf(a)) - videoFrameOf(schedule, a.frame));
}

/**
 * 持続ダメージ▲編（plan/design-sustained-damage-up.md 5.1 節）: 枠の n 回目（0 始まり）のバーストの発動から、その発動の後に出た
 * バーストのスロットの持続ダメージの tick（次の発動の前まで）までの動画のフレーム数の列（フルバーストの入りの止まりを含む）
 */
function dotTickOffsets(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex);
  const n = Number(ctx.args.n);
  const activation = mine[n];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  const end = mine[n + 1]?.frame ?? Number.POSITIVE_INFINITY;
  const ticks = result.skillHits.filter(
    (h) =>
      h.slotIndex === slotIndex &&
      h.effect.dot !== undefined &&
      h.effect.source.skill === 'burst' &&
      h.frame >= activation.frame &&
      h.frame < end,
  );
  if (ticks.length === 0) throw new Error(`${String(ctx.args.n)} 回目の発動の後に持続ダメージの tick が無い`);
  const from = videoFrameOf(schedule, activation.frame);
  return ticks.map((h) => videoFrameOf(schedule, h.frame) - from);
}

/**
 * 分かれたヒット編（plan/design-burst-split-hits.md 4.4 節）: n 回目（0 始まり）の発動の、1 ヒット目から各ヒットまでの動画のフレーム数
 * （先頭は 0。1 ヒットなら [0]）
 */
function burstHitOffsets(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const activation = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx))[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  const frames = hitFramesOf(activation).map((f) => videoFrameOf(schedule, f));
  return frames.map((f) => f - frames[0]!);
}

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
    const near = c.setup.nearLanding;
    if (near !== undefined) {
      if (!Array.isArray(near) || near.length === 0 || !near.every((n) => NEAR_LANDINGS.includes(n))) {
        errors.push(`${at}: nearLanding は A・B の並び（1 回目・2 回目の順）`);
      }
      if (condition !== 'auto') errors.push(`${at}: nearLanding は condition が auto のときだけ`);
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
  /** 観測値の id → 値（setup.jumpWindows を引く。無ければ jumpWindows は使えない） */
  observationValues?: ReadonlyMap<string, number | number[]>;
  /** 育成のマスタ（スペック固定 OFF の録画の効果層を引く。無ければ固定 OFF の録画は比べられない） */
  buildMasters?: BuildMasters;
};

/**
 * 録画の育成（RecordingBuild）を効果層の入力（BuildInput）にする。攻撃力はキャラ画面の値を attackOverride に入れるので、
 * ステータス層の項目（装備のティア・Lv・好感度など）は効かない。OL の行は OL 装備の部位に置く（Lv は検証を通す 0）
 */
function buildInputOf(build: RecordingBuild): BuildInput {
  const out = emptyBuild();
  for (const part of GEAR_PARTS) {
    const lines = build.overload?.[part];
    if (lines !== undefined && lines.length > 0) out.gear[part] = { type: 'OL', level: 0, overload: lines };
  }
  out.cube = build.cube ?? null;
  out.collection = build.collection ?? null;
  return out;
}

/** setup.jumpWindows の観測値の値（[始まり, 終わり, …] の秒）を窓の列にする */
export function jumpWindowsOf(value: number | number[] | undefined): { start: number; end: number }[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0) return undefined;
  const out: { start: number; end: number }[] = [];
  for (let i = 0; i < value.length; i += 2) {
    const start = value[i]!;
    const end = value[i + 1]!;
    if (!(start < end) || (out.length > 0 && start < out.at(-1)!.end)) return undefined;
    out.push({ start, end });
  }
  return out;
}

/** drop なら、定義の各スロット（基礎版・宝物版）から回復（heal）を落とした写しを返す（CompareSetup.dropHeals） */
function withoutHealsIf(definition: SkillDefinition | null, drop: boolean): SkillDefinition | null {
  if (definition === null || !drop) return definition;
  const strip = (entry: SkillEntry): SkillEntry => ({
    ...entry,
    effects: entry.effects.filter((e) => e.kind !== 'heal'),
  });
  const skills = { ...definition.skills };
  for (const slot of SKILL_SLOTS) skills[slot] = strip(skills[slot]);
  const out: SkillDefinition = { ...definition, skills };
  if (definition.treasureSkills !== undefined) {
    const treasureSkills: SkillDefinition['treasureSkills'] = {};
    for (const slot of SKILL_SLOTS) {
      const entry = definition.treasureSkills[slot];
      if (entry !== undefined) treasureSkills[slot] = strip(entry);
    }
    out.treasureSkills = treasureSkills;
  }
  return out;
}

/** 録画の条件と予測の条件から、モデルの入力を組む（npm run sim の --fixed-spec と同じ組み方） */
export function buildTeamInput(recording: RecordingEntry, setup: CompareSetup, data: RecordsData): TeamInput {
  if (recording.fixedSpec === null) throw new Error('スペック固定かどうか記録が無い');
  const fixedSpec = recording.fixedSpec;
  if (!fixedSpec) {
    // Stage 13 の残り: 固定 OFF は、枠ごとの育成（録画に映した値）で組む
    const missing = recording.team.filter((m) => m.build === undefined).map((m) => m.slot);
    if (missing.length > 0)
      throw new Error(`スペック固定 OFF の録画で、枠 ${missing.join('・')} の育成（build）が無い`);
    if (data.buildMasters === undefined) throw new Error('スペック固定 OFF の録画には育成のマスタが要る');
  } else if (setup.buildEffectsOff !== undefined) throw new Error('buildEffectsOff はスペック固定 OFF の録画だけ');
  const preset = data.enemies.enemies.find((e) => e.id === setup.enemy);
  if (preset === undefined) throw new Error(`敵のプリセット ${setup.enemy} が無い`);
  const durationSeconds = setup.durationSeconds ?? 180;
  let windows: { start: number; end: number }[] | undefined;
  if (setup.jumpWindows !== undefined) {
    windows = jumpWindowsOf(data.observationValues?.get(setup.jumpWindows));
    if (windows === undefined) throw new Error(`jumpWindows の観測値 ${setup.jumpWindows} が無いか、窓の並びでない`);
  }
  const auto = setup.condition === 'auto';
  // 的の表は条件の決め方に依らず付ける（apps/web の enemyForCalc と同じ）。手入力の枠の命中率・コアは変わらず、飛ぶ時間
  // （plan/design-anis-star-gauge-timing.md 3.3 節）だけが着地点で決まる
  const target = targetProfileOf(data.enemies, preset);
  const condition = {
    coreHitRate: setup.coreHitRate ?? 1,
    distanceBonus: setup.distanceBonus ?? true,
    fullCharge: true,
    hitRate: setup.hitRate ?? 1,
  };
  const slots: TeamSlotInput[] = recording.team.map((member) => {
    const character = data.characters.get(member.rid);
    if (character === undefined) throw new Error(`rid ${member.rid} のデータが無い`);
    const definition = withoutHealsIf(
      data.skills.get(member.rid) ?? null,
      setup.dropHeals?.includes(member.rid) === true,
    );
    const adds = (setup.addEffects ?? []).filter((a) => a.rid === member.rid);
    if (adds.length > 0 && definition === null) throw new Error(`addEffects: rid ${member.rid} の定義が無い`);
    if (fixedSpec && member.cube !== undefined)
      throw new Error('キューブを付けた枠は未対応（スペック固定では乗らない）');
    const treasurePhase = (setup.treasure === false ? 0 : (member.treasurePhase ?? 0)) as TreasurePhase;
    const build = fixedSpec ? undefined : member.build!;
    const off = new Set(setup.buildEffectsOff ?? []);
    const buildEffects =
      build === undefined
        ? undefined
        : resolveBuildEffects(character, buildInputOf(build), data.buildMasters!, { treasurePhase }).effects.filter(
            (e) => !off.has(e.source.kind),
          );
    return {
      character,
      growth: fixedSpecGrowth(character),
      condition,
      ...(auto ? { conditionMode: 'auto' as const } : {}),
      attackOverride: build === undefined ? computeFixedSpecAttack(character).attack : build.attack,
      ...(buildEffects === undefined ? {} : { buildEffects }),
      skills: {
        definition: definition === null ? null : withAddedEffects(definition, adds),
        levels: { ...MAX_SKILL_LEVELS, ...(build?.skillLevels ?? {}) },
        treasurePhase,
      },
    };
  });
  const controlled = recording.team.findIndex((m) => m.controlled === true);
  const obstacleBreaks = (setup.obstacles ?? []).map((ob) => {
    const count = data.observationValues?.get(ob.count);
    if (typeof count !== 'number') throw new Error(`obstacles の観測値 ${ob.count} が無いか、個数でない`);
    return { slotIndex: ob.slot - 1, shot: ob.shot, count };
  });
  return {
    slots,
    enemy: {
      ...enemyInputOf(preset),
      events: enemyEventsOf(data.enemies, setup.events ?? [], durationSeconds, windows),
      ...(target === undefined
        ? {}
        : {
            target,
            landings: enemyLandingsOf(
              data.enemies,
              setup.events ?? [],
              durationSeconds,
              target,
              landingFixed(setup.midFarLanding, setup.nearLanding),
              windows,
            ),
          }),
    },
    durationSeconds,
    burst: setup.burst ?? true,
    burstModel: 'dynamic',
    controlledSlot: controlled < 0 ? null : controlled,
    ...(obstacleBreaks.length === 0 ? {} : { obstacleBreaks }),
    ...(setup.sustainedHitRateUp === false ? { sustainedHitRateUp: false } : {}),
    ...(setup.sustainedDamagePlacement === undefined
      ? {}
      : { sustainedDamagePlacement: setup.sustainedDamagePlacement }),
    ...(setup.attackRounding === undefined ? {} : { attackRounding: setup.attackRounding }),
  };
}

/** invalid は失効した観測値（比べずに一覧に残す。Stage 20-E） */
export type ResidualStatus = 'ok' | 'outside' | 'error' | 'invalid';

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
    if (o.invalid !== undefined) {
      residuals.push({ observation: o, status: 'invalid', predicted: null, diff: null, message: o.invalid.reason });
      continue;
    }
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

/** 引数と、手入力でない条件（Stage 18-C の自動の条件・中遠と近の固定）。手入力の観測値は今までと同じ表示 */
function fmtArgs(args: CompareSpec['args'], setup?: CompareSetup): string {
  const entries: [string, unknown][] = Object.entries(args);
  if (setup?.condition === 'auto') entries.push(['condition', 'auto']);
  if (setup?.midFarLanding !== undefined) entries.push(['midFar', setup.midFarLanding]);
  if (setup?.nearLanding !== undefined) entries.push(['near', setup.nearLanding.join('・')]);
  return entries.length === 0 ? '' : `（${entries.map(([k, v]) => `${k}=${String(v)}`).join('、')}）`;
}

const STATUS_JA: Record<ResidualStatus, string> = {
  ok: '許容内',
  outside: '**許容外**',
  error: '**比べられない**',
  invalid: '失効',
};

/** 実測の値（単位と幅があれば添える。Stage 20-E） */
function fmtObserved(o: Observation): string {
  const unit = o.unit === undefined ? '' : ` ${o.unit}`;
  const s = o.spread;
  const spread =
    s === undefined ? '' : `（${s.kind === 'ci95' ? '95% 区間 ' : ''}${fmtNumber(s.low)}〜${fmtNumber(s.high)}）`;
  const invalid = o.invalid === undefined ? '' : `（失効: ${o.invalid.reason}）`;
  return `${fmtValue(o.value)}${unit}${spread}${invalid}`;
}

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
  const invalid = count('invalid') > 0 ? `・失効 ${count('invalid')}` : '';
  const lines = [
    `比べた観測値 ${residuals.length} 件: 許容内 ${count('ok')}・許容外 ${count('outside')}・比べられない ${count('error')}${invalid}。`,
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
        cell(fmtObserved(o)),
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
    lines.push(`| ${[o.id, o.use, cell(o.description), cell(fmtObserved(o)), claimText(o.id)].join(' | ')} |`);
  }
  return lines.join('\n');
}
