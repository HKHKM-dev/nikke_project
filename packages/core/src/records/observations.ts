// Stage 19-B: 観測値（records/observations/<録画 id>.json）の型・検証と、照合ランナー（モデルと比べて残差を出す）。
// plan/design-stage19.md 2.3・2.3.1・2.5 節。
import { BURST_GAUGE_MAX } from '../burst/controller.ts';
import type { BurstDelayOverride } from '../burst/landing.ts';
import {
  activationFramesOfSlot,
  activationVideoFrameOf,
  effectFrameOf,
  FULL_BURST_AFTER_ACTIVATION_FRAMES,
  hexagonFrameOf,
  hitFrameOf,
  hitFramesOf,
  isInFullBurst,
  videoFrameOf,
  type BurstSchedule,
} from '../burst/schedule.ts';
import { rateAfterShots, reloadFirstShotFrames } from '../cadence.ts';
import { DISTANCE_BONUS, PER_SHOT_DAMAGE_CORE, SKILL_HIT_FULL_BURST_BONUS } from '../damage.ts';
import { enemyEventsOf, enemyInputOf, enemyLandingsOf, targetProfileOf } from '../enemies.ts';
import { GEAR_PARTS, emptyBuild, type BuildInput } from '../build.ts';
import { resolveBuildEffects, type BuildEffectKind } from '../buildEffects.ts';
import { effectiveMaxAmmo, firingParams } from '../frame/firing.ts';
import { landingFrameSpans } from '../frame/landing.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, computeFixedSpecHp, fixedSpecGrowth } from '../fixedSpec.ts';
import { runSimulation, type SimResult } from '../sim/engine.ts';
import { applyCritBuffs, capCritRate, type AttackRounding } from '../skills/buffs.ts';
import { oneHitValue, type SustainedDamagePlacement } from '../skills/burstDamage.ts';
import { chanceScaleAt, type ChanceOpportunity } from '../skills/chance.ts';
import { itemsOf, valuePiecesOf, type ValuePiece } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS, isResolvedChance, isResolvedShotCount, resolveTimed } from '../skills/resolve.ts';
import type { NamedStateId } from '../skills/states.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import { gameSecondsToFrame, gameSecondsToFrames } from '../time.ts';
import {
  SKILL_SLOTS,
  isStateStat,
  parseSkillDefinition,
  statContentsOf,
  type SkillDefinition,
  type SkillEntry,
  type SkillSlot,
} from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM } from '../weapons.ts';
import type { BuildMasters, CharacterData, EnemyPresetMaster } from '../types.ts';
import { CLAIM_TOPICS } from './claims.ts';
import type { RecordingBuild, RecordingEntry } from './recordings.ts';
import type { SkillRoot } from './skills.ts';

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
  /** 遠の着地点を、並びの 1 回目・2 回目の順に固定する（録画で読んだ着地点。C-0477・V-0328）。省略は配分 */
  farLanding?: FarLanding[];
  /**
   * V-0086: 録画で読んだ的のジャンプの窓を持つ観測値の id（同じ録画。値は [始まり, 終わり, 始まり, 終わり, …] のゲーム内の秒）。
   * 出来事のセットの狙えない窓（代表値。C-0546・C-0553）と、着地点の区間の切れ目をこれで置き換える。省略は代表値
   */
  jumpWindows?: string;
  /**
   * 録画の画で数えた、発が壊した障害物（plan/design-anis-star-gauge-timing.md 2.2 節）。slot は枠（1 始まり）、shot はその枠の
   * モデルの発の番号（1 始まり）、count は個数を持つ観測値の id（同じ録画・use が input・値は正の整数）。省略は無し
   */
  obstacles?: { slot: number; shot: number; count: string }[];
  /**
   * ペレットの命中編（plan/design-pellet-hit.md 3 節）: 録画で数えた、発ごとに的に当たったペレットの数（TeamInput.pelletHits）。
   * slot は枠（1 始まり）、counts は 1 発目からの数の並びを持つ観測値の id（同じ録画・use が input・値は 0 以上の整数の配列）。
   * 回数トリガー pelletHit の回数にだけ効く。省略は無し
   */
  pelletHits?: { slot: number; counts: string }[];
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
  /**
   * エレグの段 3（plan/design-elegg-s3.md 経過）: 定義から効果を落とす。モデルには撃たない枠が無いので、録画で撃たなかった枠の、射撃の
   * 回数で起きる効果（実機では起きない）を外して比べる。rid のキャラの skill（treasure なら宝物版）の effects の index（0 始まり）。
   * addEffects より前に落とす
   */
  dropEffects?: DroppedEffect[];
  /**
   * 比べる設定の拡張（plan/design-compare-setup-extension.md 2 節）: バーストの遅れの表（burst/landing.ts）を rid ごとに上書きする。
   * row が null なら表の行を外す（遅れ 0）。予測の仮説の override と、条件の違いを試す観測値に使う。省略は表のまま
   */
  burstDelays?: BurstDelayOverrideSetup[];
  /**
   * 同 3 節: 手で撃ったチェーンの始まり（I の本当の発動）のゲーム内のフレームの並びを持つ観測値の id（同じ録画・use が input・
   * 値は昇順の 0 以上の整数の配列。TeamInput.manualBursts）。省略はオートバースト
   */
  manualBursts?: string;
  /**
   * 語彙はあるのに撮っていない効果の撮影（plan/design-skill-unrecorded.md 5 節）: バーストを使わない枠（1 始まり。オートバースト OFF で
   * 手で撃たなかった枠。TeamInput.noBurstSlots）。burst が true のときだけ。省略は全員使う
   */
  noBurstSlots?: number[];
  /**
   * 2 段目の段 12 の PR 3（V-0541）: 録画で撃たなかった枠（1 始まり。台帳の fires: false の枠）。モデルには撃たない枠が無いので、
   * 代わりに弾丸命中率を 0 にする（通常攻撃のダメージもゲージも出ない）。射撃の回数のきっかけは残るので、要れば dropEffects で外す
   * （撃たない枠をモデルに足せば要らなくなる）。
   * 条件が auto（射撃場の表）のときは書かない。省略は全員撃つ
   */
  noFireSlots?: number[];
};

/** CompareSetup.burstDelays の 1 件 */
export type BurstDelayOverrideSetup = {
  rid: number;
  treasure?: boolean;
  row: null | {
    hitFrames: number;
    effectFrames: number;
    hitOffsets?: number[];
    windowFromActivation?: true;
    sameActivationBuffsOnHit?: true;
    origin?: 'mark' | 'activation';
  };
};

/** 比べる設定の遅れの上書きを、キャラの burstDelayOverride にする（結論の ID は無いので、表の行の claim は空） */
export function burstDelayOverrideOf(o: BurstDelayOverrideSetup): BurstDelayOverride {
  const r = o.row;
  return {
    ...(o.treasure === true ? { treasure: true } : {}),
    row:
      r === null
        ? null
        : {
            resourceIds: [o.rid],
            ...(r.windowFromActivation === true ? { windowFromActivation: true as const } : {}),
            ...(r.sameActivationBuffsOnHit === true ? { sameActivationBuffsOnHit: true as const } : {}),
            delays: {
              hitFrames: r.hitFrames,
              effectFrames: r.effectFrames,
              ...(r.hitOffsets === undefined ? {} : { hitOffsets: r.hitOffsets }),
              ...(r.origin === undefined ? {} : { origin: r.origin }),
            },
            claim: '',
          },
  };
}

/** CompareSetup.addEffects の 1 件 */
export type AddedEffect = {
  rid: number;
  skill: SkillSlot;
  treasure?: boolean;
  effect: Record<string, unknown>;
  replace?: number;
};

/**
 * 定義に効果を足して読み直す（読み込みの検査をそのまま通す）。support・burstStepMode は読み込みで決まる欄なので、JSON に戻すときに外す。
 * エレグのバースト編: 敵に付く状態の付与は、読み込みで target を "allies" に読み替えて enemy の印を付けるので、JSON の形
 * （target: "enemy"）に戻す
 */
export function withAddedEffects(definition: SkillDefinition, adds: readonly AddedEffect[]): SkillDefinition {
  if (adds.length === 0) return definition;
  const json = JSON.parse(JSON.stringify(definition)) as {
    skills: Record<string, { support?: unknown; effects: unknown[] }>;
    treasureSkills?: Record<string, { support?: unknown; effects: unknown[] }>;
  };
  for (const group of [json.skills, json.treasureSkills ?? {}]) {
    for (const slot of SKILL_SLOTS) {
      delete group[slot]?.support;
      for (const effect of (group[slot]?.effects ?? []) as Record<string, unknown>[]) {
        // 2 段目の段 12: バースト段階の変更の側（burstStepMode）も読み込みで書く欄
        delete effect.burstStepMode;
        if (effect.kind !== 'state' || effect.enemy !== true) continue;
        delete effect.enemy;
        effect.target = 'enemy';
      }
    }
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

/** 遠の 2 か所（足元 542・534 前後。C-0477） */
export const FAR_LANDINGS = ['A', 'B'] as const;
export type FarLanding = (typeof FAR_LANDINGS)[number];

/** 中遠の着地点を固定する enemyLandingsOf の fixed */
export function midFarFixed(landing: MidFarLanding | undefined): Record<string, string> {
  return landing === undefined ? {} : { midFar: `midFar${landing}` };
}

/** 中遠・近・遠の着地点を固定する enemyLandingsOf の fixed（近と遠は 1 回目・2 回目の順） */
export function landingFixed(
  midFar: MidFarLanding | undefined,
  near: readonly NearLanding[] | undefined,
  far?: readonly FarLanding[],
): Record<string, string | string[]> {
  return {
    ...midFarFixed(midFar),
    ...(near === undefined ? {} : { near: near.map((n) => `near${n}`) }),
    ...(far === undefined ? {} : { far: far.map((n) => `far${n}`) }),
  };
}

export type Tolerance = { rel: number } | { abs: number };

export type CompareSpec = {
  /**
   * モデル。sim だけ（一本化の段 A-3。plan/design-unify-sim-calc.md 8 節）。2026-10-27 までは calc も書けた（使う指定は無かった）。
   * 観測値・予測の全件が "sim" を書いているので、欄は残し、ほかの値は検査で落とす
   */
  model: 'sim';
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
  /** 最小構成の検査編: 観測量の範囲（plan/design-minimal-relevance.md 3.1 節） */
  scope?: ObservationScope;
};

/**
 * 観測量の出どころ（plan/design-minimal-relevance.md 3.1 節）。normal = 通常攻撃のヒット、skill = 倍率ダメージ・追加ダメージ、
 * burst = バーストのヒット、dot = 持続ダメージ、gauge = ゲージ、burstChain = バーストの段・CT、clock = 時計・止まり、
 * target = 的の動き・大きさ、firing = 射撃の刻み・リロード
 */
export const OBSERVATION_SOURCES = [
  'normal',
  'skill',
  'burst',
  'dot',
  'gauge',
  'burstChain',
  'clock',
  'target',
  'firing',
] as const;
export type ObservationSource = (typeof OBSERVATION_SOURCES)[number];

/**
 * 観測量の範囲。slot はどの枠のものか（1 始まり。複数なら配列、編成の全体なら 'all'）。frames は読んだ範囲（動画のフレーム。省略可）で、
 * 人が読む範囲の記録（未確定の要素の判定には使わない。同 4.1 節の 6c）
 */
export type ObservationScope = {
  slot: number | number[] | 'all';
  source: ObservationSource;
  frames?: [number, number];
};

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
};

function slotIndexOf(ctx: MetricContext): number {
  return Number(ctx.args.slot) - 1;
}

/**
 * シンデレラ S1 編（plan/design-cinderella-s1-charge.md 3 節）: 引数 frame のフレーム。省略できる引数 fullBurst（n。0 始まり）があれば、
 * frame は n 回目のフルバーストの開始からの相対。モデルの時刻表が変わっても、録画と同じ場面（何回目のフルバーストの中か）を指す
 */
function frameArgOf(result: SimResult, ctx: MetricContext): number {
  const frame = Number(ctx.args.frame);
  if (ctx.args.fullBurst === undefined) return frame;
  const start = result.schedule?.fullBurstWindows[Number(ctx.args.fullBurst)]?.start;
  if (start === undefined) throw new Error(`${String(ctx.args.fullBurst)} 回目のフルバーストが無い`);
  return start + frame;
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
 * V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717）: 1 フレーム 1 発で撃っている区間の、射撃の止まり（前後の発と発の間が 1f で、そこだけ
 * 2f の所）から次の止まりまでの発の数（間の発と発の間がすべて 1f の組だけ）。スピンアップが 1 フレーム 1 発に届く前の発の 2f は数えない。
 * どの組も同じならその数、違えば違う数の並び（昇順）。録画では、HUD の総ダメージが 1 フレームだけ増えなかったフレームから次のその
 * フレームまでの通常攻撃のヒットを数える
 */
function steadyPauseShots(result: SimResult, ctx: MetricContext): number | number[] {
  const frames = slotOf(result.shots, ctx).frames;
  // 2 段目の段 12 の PR 2（V-0537）: 省略できる引数 fullBurst が true なら、両端の止まりがどちらもフルバーストの窓の中の組だけ、false なら
  // どちらも外の組だけを数える（バースト III の回数条件▼の窓はフルバーストの窓とほぼ重なる）
  const schedule = result.schedule;
  const inWindow = (f: number): boolean => schedule !== null && isInFullBurst(schedule, f);
  const side = ctx.args.fullBurst === undefined ? null : ctx.args.fullBurst === true;
  const shot = slotOf(ctx.input.slots, ctx).character.shot;
  // 撃ち始め（リロード・的のジャンプの後。前の発との間が 2f より長い発）から何発目で 1 フレーム 1 発に届くか
  let spun = 0;
  while (rateAfterShots(shot, spun) < MAX_RPM) {
    // レートは発ごとに上がるか止まるかだけなので、上がらなくなったら 1 フレーム 1 発には届かない（スピンアップの無い武器など）
    if (rateAfterShots(shot, spun + 1) <= rateAfterShots(shot, spun))
      throw new Error(`枠 ${String(ctx.args.slot)} の武器は 1 フレーム 1 発に届かない`);
    spun += 1;
  }
  const gap = (k: number): number => frames[k]! - frames[k - 1]!;
  const counts = new Set<number>();
  let runStart = 0;
  let last: number | null = null;
  for (let k = 1; k + 1 < frames.length; k++) {
    if (gap(k) > 2) {
      runStart = k;
      last = null;
    }
    if (k - runStart <= spun || gap(k) !== 2 || gap(k - 1) !== 1 || gap(k + 1) !== 1) continue;
    if (last !== null) {
      let steady = true;
      for (let q = last + 1; q < k; q++) if (gap(q) !== 1) steady = false;
      const sideOk = side === null || (inWindow(frames[last]!) === side && inWindow(frames[k]!) === side);
      if (steady && sideOk) counts.add(k - last);
    }
    last = k;
  }
  const values = [...counts].sort((a, b) => a - b);
  if (values.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} に 1 フレーム 1 発の区間の止まりの組が無い`);
  return values.length === 1 ? values[0]! : values;
}

/**
 * V-0534（C-0718）: 枠のマガジンの最後の弾丸から次の発までのフレーム数の中央値を、最後の弾丸が戦闘の始めから数えて every 発の倍数の発
 * だったマガジンと、そうでないマガジンに分けて [倍数, ほか] で返す（的のジャンプに掛かったリロードの外れは中央値で落とす）
 */
function lastShotGapMedians(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const every = Number(ctx.args.every);
  const groups: [number[], number[]] = [[], []];
  for (const end of log.lastShotFrames ?? []) {
    const k = log.frames.indexOf(end);
    const next = log.frames[k + 1];
    if (next === undefined) continue;
    groups[(k + 1) % every === 0 ? 0 : 1].push(next - end);
  }
  return groups.map((g, i) => {
    if (g.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} の${i === 0 ? '倍数の' : 'ほかの'}マガジンが無い`);
    const sorted = [...g].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  });
}

/**
 * V-0356（紅蓮：ブラックシャドウの S2）: フルバーストごとに、開始のフレームから、その後で最初にマガジンを撃ち切った発までの発の数
 * （開始のフレームの発を含む）。最大装弾数▲と弾丸チャージ（▲の後の最大まで足す）が効けば、開始の前の残弾やリロード中かに依らず
 * ▲の後の最大になる。count を書くと最初の count 回（録画で読めた回数にそろえる）。撃ち切る前に戦闘が終わった回は数えない
 */
function fullBurstMagazineShots(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const ends = log.lastShotFrames ?? [];
  const out: number[] = [];
  for (const w of result.schedule?.fullBurstWindows ?? []) {
    const end = ends.find((f) => f >= w.start);
    if (end === undefined) break;
    out.push(log.frames.filter((f) => f >= w.start && f <= end).length);
  }
  if (ctx.args.count === undefined) return out;
  const count = Number(ctx.args.count);
  if (out.length < count) throw new Error(`撃ち切ったフルバーストが ${out.length} 回しか無い`);
  return out.slice(0, count);
}

/**
 * V-0356（紅蓮：ブラックシャドウのバースト）: 段の間隔の変更の窓ごとに、窓の前の最後の段の後の段なしの発の数 p・窓の中の発の数 n・
 * 窓の後で最初に段が出たのが何発目か k の和を every（窓の外の段の間隔）で割った余り。通算のカウンタなら 0 になり、射撃の位相に依らない。
 * 窓の前に段が無い窓と、窓の後に段が出る前に戦闘が終わった窓は除く
 */
function cycleWindowResidues(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const every = Number(ctx.args.every);
  const shots = slotOf(result.shots, ctx).frames;
  // 段を出した射撃のフレーム（回数トリガーの遅れ編の第 2 段: 段のヒットは射撃の delayFrames 後。C-0651）
  const tiers = new Set(
    result.skillHits
      .filter((h) => h.slotIndex === slotIndex && h.effect.cycle !== undefined)
      .map((h) => h.frame - (h.effect.delayFrames ?? 0)),
  );
  const out: number[] = [];
  // 持ち主ごとの一覧編（段 D の 5）: 間隔の変更の件（時刻の順）
  for (const w of itemsOf(result.history, { holder: slotIndex, kind: 'cycleEvery' })) {
    const before = shots.filter((f) => f < w.start);
    let last = before.length - 1;
    while (last >= 0 && !tiers.has(before[last]!)) last -= 1;
    const k = shots.filter((f) => f >= w.end).findIndex((f) => tiers.has(f)) + 1;
    if (last < 0 || k === 0) continue;
    const p = before.length - 1 - last;
    const n = shots.filter((f) => f >= w.start && f < w.end).length;
    out.push((p + n + k) % every);
  }
  return out;
}

/** 雪子編（V-0501）: 枠が出した回復のフレーム（同じフレームの対象ごとの記録・ほかの効果の回復は 1 つにまとめる）の昇順 */
function healFramesOf(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const frames = result.history.heals.filter((h) => h.sourceSlotIndex === slotIndex).map((h) => h.frame);
  return [...new Set(frames)].sort((a, b) => a - b);
}

/** 雪子編（V-0501）: 枠が出した n 回目（0 始まり）の回復のフレームを、動画のフレームにする */
function healVideoFrame(result: SimResult, ctx: MetricContext): number {
  const frame = eventFrames(result, withArgs(ctx, { event: 'heal' }))[Number(ctx.args.n)];
  if (frame === undefined) throw new Error(`枠 ${String(ctx.args.slot)} の ${String(ctx.args.n)} 回目の回復が無い`);
  return frame;
}

/**
 * クラウン編（V-0178）: その枠が出した回復（heal）ごとに、前の回復（初回は戦闘の始め）からその回復までに撃った通常攻撃の
 * 当たる数の期待値（発ごとの区間の弾丸命中率の和）。録画の総ダメージの増分から数えたヒット数と比べる
 */
function healHitCounts(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const slot = slotOf(result.slots, ctx);
  const frames = slotOf(result.shots, ctx).frames;
  const heals = result.history.heals.filter((h) => h.sourceSlotIndex === slotIndex).map((h) => h.frame);
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
 * 2 段目の段 4（V-0435。トーブの宝物版 S1）: 枠の shot 発目（1 始まり。戦闘の始めから数える）を撃ったフレームの最大装弾数（最大装弾数▲の
 * 後の値）。録画では、その発の後の枠アイコンの上の「残弾/最大」の最大を読む（ゲーム内の時刻に依らない）
 */
function maxAmmoAtShot(result: SimResult, ctx: MetricContext): number {
  const frame = slotOf(result.shots, ctx).frames[Number(ctx.args.shot) - 1];
  if (frame === undefined) throw new Error(`枠 ${String(ctx.args.slot)} の ${String(ctx.args.shot)} 発目が無い`);
  return maxAmmoAt(result, { ...ctx, args: { ...ctx.args, frame } });
}

/**
 * 同: 枠に入った弾丸チャージの発数（最初の count 回。最大で止まった回は、足せた分だけ）。録画では照準の左の残弾の増え
 * （`reticle-ammo.ts --mode mags`）を読む
 */
function ammoRefillAmounts(result: SimResult, ctx: MetricContext): number[] {
  const count = Number(ctx.args.count);
  const amounts = result.instants
    .filter((e) => e.slotIndex === slotIndexOf(ctx) && e.effect.kind === 'ammoRefill')
    .map((e) => e.amount)
    .slice(0, count);
  if (amounts.length < count) throw new Error(`弾丸チャージが ${amounts.length} 回しか無い`);
  return amounts;
}

/**
 * 持ち主ごとの一覧編（plan/design-holder-effects.md 段 D の 5）: 効果の窓の指標が読む、区間に足す値の小片（状態だけの stat を除く。
 * 段 D の 4 までの窓と同じ並び・同じ区切り。指標の名前の「窓」は観測値のファイルが参照しているので変えない）
 */
function buffPiecesOf(result: SimResult): ValuePiece[] {
  return valuePiecesOf(result.history).filter((p) => !isStateStat(p.effect.stat));
}

/**
 * 5-2 の撮影計画（V-0177）: その枠が受ける timed の効果の窓の終わり（モデルのフレーム。戦闘時間で切った窓は戦闘の終わり）。
 * skill（'skill1' | 'skill2' | 'burst'）と stat で絞る
 */
function buffWindowEnds(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  return buffPiecesOf(result)
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
      buffPiecesOf(result)
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
 * ベロータのバースト編（V-0510）: 枠の、受けた効果（skill と stat で絞る）の窓の中（inside: true）か外（inside: false）の、連続した
 * 2 発の間の平均（両方の発が同じ側のものだけ）。minGap より短い間と maxGap より長い間（リロード・的のジャンプ・フルバーストの入りの
 * 止まりを挟む間）は除く。録画とモデルで発の時刻をそろえずに、チャージ速度▲などの射撃の速さの▲の効きを比べる
 */
function buffWindowShotIntervalMean(result: SimResult, ctx: MetricContext): number {
  const slotIndex = slotIndexOf(ctx);
  const windows = buffPiecesOf(result).filter(
    (w) => w.slotIndex === slotIndex && w.effect.source.skill === ctx.args.skill && w.effect.stat === ctx.args.stat,
  );
  if (windows.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} に ${String(ctx.args.stat)} の窓が無い`);
  const inside = (f: number) => windows.some((w) => w.start <= f && f < w.end);
  const want = ctx.args.inside === true;
  const minGap = ctx.args.minGap === undefined ? 0 : Number(ctx.args.minGap);
  const maxGap = ctx.args.maxGap === undefined ? Infinity : Number(ctx.args.maxGap);
  const frames = slotOf(result.shots, ctx).frames;
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    const d = b - a;
    if (d < minGap || d > maxGap) continue;
    if (inside(a) === want && inside(b) === want) gaps.push(d);
  }
  if (gaps.length === 0) throw new Error('間が無い');
  return gaps.reduce((s, d) => s + d, 0) / gaps.length;
}

/**
 * バーストの効果の遅れ（backlog 2-4 の P3。V-0392）: n 回目（0 始まり）のフルバーストの窓の中か、窓を開いた III の本当の発動から窓の
 * 始まりまで（FULL_BURST_AFTER_ACTIVATION_FRAMES）に始まった、その枠が受ける timed の効果（skill と stat で絞る）の窓の終わりから、
 * フルバーストの窓の終わりを引いたモデルのフレーム数（効果が先に切れれば負）。窓の終わりの前後の発の値（効果だけ・フルバースト補正
 * だけの発の数）と比べる。2 段目の段 14 の PR 1（V-0549）: before を書くと、窓の始まりの before フレーム前から始まった効果も見る
 * （バースト 3 段階突入時の効果は II → III の替わり目から。00.00 の 29f 前）
 */
function buffWindowEndFromFullBurstEnd(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const slotIndex = slotIndexOf(ctx);
  const before = ctx.args.before === undefined ? FULL_BURST_AFTER_ACTIVATION_FRAMES : Number(ctx.args.before);
  const ends = buffPiecesOf(result)
    .filter(
      (w) =>
        w.slotIndex === slotIndex &&
        w.effect.source.skill === ctx.args.skill &&
        w.effect.stat === ctx.args.stat &&
        window.start - before <= w.start &&
        w.start < window.end,
    )
    .map((w) => w.end);
  if (ends.length === 0) throw new Error(`${String(ctx.args.n)} 回目のフルバーストの近くに始まった窓が無い`);
  return Math.max(...ends) - window.end;
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
  const frame = frameArgOf(result, ctx);
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

/**
 * 2 段目の段 11 の PR 3（V-0530）: n 回目（0 始まり）にゲージが満タンになった（BURST バーが消えた）フレームから、その後の枠の最初の
 * 使用武器の変更の発（変更後の武器の発）までの動画のフレーム数。n はカンマ区切りの並び（"0,1,3"）も書け、そのときは回ごとの列。
 * 単騎の I で満タンの直後に使うバーストの、変更後の武器の最初の発の待ち（firstShotDelayFrames）を、HUD の最初の増分で比べる
 */
function gaugeFullToWeaponChangeShot(result: SimResult, ctx: MetricContext): number | number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const changed = slotOf(result.shots, ctx).weaponChangeShotFrames ?? [];
  const at = (n: number): number => {
    const full = schedule.gaugeFullFrames[n];
    if (full === undefined) throw new Error(`${n} 回目の満タンが無い`);
    const shot = changed.find((f) => f >= full);
    if (shot === undefined) throw new Error(`${n} 回目の満タンの後に変更後の武器の発が無い`);
    return videoFrameOf(schedule, shot) - videoFrameOf(schedule, full);
  };
  const n = ctx.args.n;
  if (typeof n === 'string') return n.split(',').map((x) => at(Number(x.trim())));
  return at(Number(n));
}

/**
 * V-0359（リターの S1 の CT▼）: n 回目（0 始まり）のフルバーストの入りのフレームに、枠の残りのバーストスキル CT が縮んだフレーム数
 * （その枠が受けた即時効果の CT▼ の、実際に縮んだ量の和。CT が明けていた枠は 0。burst/controller.ts の reduceCooldown）。
 * n はカンマ区切りの並び（"0,2,3"）も書け、そのときは回ごとの列。録画では、右のバースト欄の CT の残り秒の切り替わりから読んだ
 * 縮んだ長さ（ゲーム内の秒 ÷ 0.017）と比べる
 */
function cooldownCutFrames(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number | number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const cutAt = (n: number): number => {
    const window = schedule.fullBurstWindows[n];
    if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
    return schedule.cooldownReductions
      .filter((r) => r.slotIndex === slotIndex && r.frame === window.start)
      .reduce((sum, r) => sum + r.applied, 0);
  };
  const n = ctx.args.n;
  if (typeof n === 'string') return n.split(',').map((x) => cutAt(Number(x.trim())));
  return cutAt(Number(n));
}

function burstActivationSlots(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  if (schedule.activations.length < n) throw new Error(`発動が ${schedule.activations.length} 回しかない`);
  return schedule.activations.slice(0, n).map((a) => a.slotIndex + 1);
}

/**
 * エレグ編（V-0504）: 最初の n 回の発動の段の表示（I・II は六角形の替わり目、III はタイマーの 00.00。activationVideoFrameOf）の、
 * 戦闘開始からの録画の動画のフレーム（それより前の発動の止まり・フルバーストの入りの止まりを含む）
 */
function burstActivationVideoFrames(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  if (schedule.activations.length < n) throw new Error(`発動が ${schedule.activations.length} 回しかない`);
  return schedule.activations.slice(0, n).map((a) => activationVideoFrameOf(schedule, a));
}

/** 結果の頭の skip 個（省略は 0）を飛ばし、count 個に切る（count が無ければ残り全部。足りなければ誤り） */
function firstCount(values: number[], ctx: MetricContext, what: string): number[] {
  const skip = ctx.args.skip === undefined ? 0 : Number(ctx.args.skip);
  const count = ctx.args.count === undefined ? values.length - skip : Number(ctx.args.count);
  if (values.length < skip + count) throw new Error(`${what}が ${values.length} 回しか無い`);
  return values.slice(skip, skip + count);
}

/** 2 段目の段 3: 枠 slotIndex のフレーム frame の、状態 state のスタックの段の最大（付いていなければ 0） */
function stateStacksAt(result: SimResult, slotIndex: number, state: string, frame: number): number {
  let level = 0;
  for (const it of itemsOf(result.history, { holder: slotIndex, state: state as NamedStateId })) {
    if (it.start <= frame && frame < it.end) level = Math.max(level, it.stack ?? 1);
  }
  return level;
}

/**
 * 2 段目の段 10（plan/design-skill-stage10.md 3.2 節。V-0503）: 枠のバーストの発動ごとに、その発動の効果の発火のフレームの前の、枠の
 * カウンタ counter の値（その発動での増減の前）。count を書くと最初の count 回。録画では、発動の直前の画面のカウンタの表示（火力ゲージ）と
 * 比べる
 */
function counterAtBursts(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const counter = String(ctx.args.counter);
  const records = result.history.counters.filter((c) => c.slotIndex === slotIndex && c.counter === counter);
  const values = result.schedule.activations
    .filter((a) => a.slotIndex === slotIndex)
    .map((a) => {
      const at = effectFrameOf(a);
      return records.filter((c) => c.frame < at).at(-1)?.value ?? 0;
    });
  return firstCount(values, ctx, 'バーストの発動');
}

/**
 * 2 段目の段 10（V-0503）: 枠のバーストの発動ごとに、その発動の効果の発火のフレームに、枠に状態 state が付いた（付いた記録がある）なら 1、
 * 無ければ 0。count を書くと最初の count 回。録画では、その回のフルバーストの 1 ヒットに状態の中身が乗ったか（超火力）と比べる
 */
function stateAppliedAtBursts(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const applied = new Set(
    result.history.applications.filter((a) => a.slotIndex === slotIndex && a.state === state).map((a) => a.frame),
  );
  const values = result.schedule.activations
    .filter((a) => a.slotIndex === slotIndex)
    .map((a) => (applied.has(effectFrameOf(a)) ? 1 : 0));
  return firstCount(values, ctx, 'バーストの発動');
}

/**
 * 2 段目の段 10（V-0503）: フルバーストの窓ごとに、窓の終わりのフレームの、枠の状態 state のスタックの段の最大（付いていなければ 0）。
 * count を書くと最初の count 回。録画では、フルバーストの終わりの直後の一時停止画面の適用中の効果のスタック数（超火力チャージ）と比べる
 */
function stateStacksAtFullBurstEnds(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const values = result.schedule.fullBurstWindows.map((w) => stateStacksAt(result, slotIndex, state, w.end));
  return firstCount(values, ctx, 'フルバースト');
}

/**
 * 2 段目の段 3（ソーダ：トゥインクルバニーのバースト。V-0437）: 枠のバーストの発動ごとに、その発動から次の発動まで（最後は戦闘の
 * 終わりまで）に始まった、枠が自分に付けた timed の効果（skill と stat で絞る。状態だけの stat も入れる）の窓があれば 1、無ければ 0。
 * count を書くと最初の count 回。録画では、発動の直後の一時停止画面の適用中の効果と比べる。条件（スタック数など）で付いたかを、
 * 発動の時刻に依らずに比べる
 */
function burstBuffApplied(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const acts = activationFramesOfSlot(result.schedule, slotIndex);
  const starts = valuePiecesOf(result.history)
    .filter(
      (p) =>
        p.slotIndex === slotIndex &&
        p.sourceSlotIndex === slotIndex &&
        p.effect.source.skill === ctx.args.skill &&
        p.effect.stat === ctx.args.stat,
    )
    .map((p) => p.start);
  const applied = acts.map((a, k) => (starts.some((f) => a <= f && f < (acts[k + 1] ?? Infinity)) ? 1 : 0));
  return firstCount(applied, ctx, 'バーストの発動');
}

/**
 * 2 段目の段 7（デルタの防御力▲。V-0452）: n 回目（0 始まり）のフルバーストで、枠が受ける timed の効果（skill と stat で絞る。出どころの枠は
 * 問わない）の窓が、そのフルバーストの窓の中（か、窓を開いた III の本当の発動から窓の始まりまで）に始まっていれば 1、無ければ 0。
 * 録画では、フルバースト開始の直後の一時停止画面の適用中の効果の有無と比べる。対象が最終防御力の比べで決まる効果（targetDefense）が
 * どの枠に付いたかを、フルバーストの時刻に依らずに比べる
 */
function fullBurstBuffApplied(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const slotIndex = slotIndexOf(ctx);
  const applied = buffPiecesOf(result).some(
    (p) =>
      p.slotIndex === slotIndex &&
      p.effect.source.skill === ctx.args.skill &&
      p.effect.stat === ctx.args.stat &&
      window.start - FULL_BURST_AFTER_ACTIVATION_FRAMES <= p.start &&
      p.start < window.end,
  );
  return applied ? 1 : 0;
}

/**
 * 2 段目の段 3（同）: 枠の状態 state のスタック量の減少（stackChange の decrease）ごとに、減少のフレームから次のフレームへの
 * スタックの段の最大の差（負。付いている段より多く減らせば、付いている段の数だけ）。count を書くと最初の count 回。録画では、発動の
 * 直前（フルバーストの外の 1 ヒットの会心の比）と直後（一時停止画面）のスタック数の差と比べる
 */
function stateStackDrops(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const frames = [
    ...new Set(
      result.history.tracks
        .filter((t) => t.holder === slotIndex && t.origin.kind === 'state' && t.origin.state === state)
        .flatMap((t) => t.decreases.map((d) => d.frame)),
    ),
  ].sort((a, b) => a - b);
  const drops = frames.map(
    (d) => stateStacksAt(result, slotIndex, state, d + 1) - stateStacksAt(result, slotIndex, state, d),
  );
  return firstCount(drops, ctx, 'スタック量の減少');
}

/**
 * 2 段目の段 3（同）: フルバーストの窓ごとに、窓の中の状態 state のスタックの段の最大の増え方（窓の終わり − 始まり）から、窓の中の
 * 枠の発の数を every で割った商を引いたもの。「フルバースト中の通常攻撃 every 回ごとに 1 スタック（フルバーストごとに数え直す）」なら
 * 0。窓の長さや発の数に依らずに、数え方だけを比べる（録画では、窓の中の発を数え、前後のスタック数と比べる）。count を書くと最初の count 回
 */
function fullBurstStackGainResidues(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const every = Number(ctx.args.every);
  const shots = slotOf(result.shots, ctx).frames;
  const residues = result.schedule.fullBurstWindows.map((w) => {
    const gained = stateStacksAt(result, slotIndex, state, w.end) - stateStacksAt(result, slotIndex, state, w.start);
    return gained - Math.floor(shots.filter((f) => w.start <= f && f < w.end).length / every);
  });
  return firstCount(residues, ctx, 'フルバースト');
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
  const frame = frameArgOf(result, ctx);
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
  teamTotalDamage: { args: [], sim: (r) => r.totalDamage },
  slotTotalDamage: {
    args: ['slot'],
    sim: (r, c) => slotOf(r.slots, c).totalDamage,
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
  },
  /**
   * アニス：スター編（V-0122）: 録画の動画のフレームで数えた、フルバーストの入りどうしの間隔（最初の n 個）。入りの止まり
   * （C-0069）を足した動画のフレームの差なので、録画の戦闘開始のずれに依らない
   */
  fullBurstStartIntervals: {
    args: ['n'],
    sim: (r, c) => fullBurstStartIntervals(r, c),
  },
  /** アニス：スター編（V-0121）: バーストを撃った枠（1 始まり）の並び（最初の n 回。チェーンが切れた単独の発動も入る） */
  burstActivationSlots: {
    args: ['n'],
    sim: (r, c) => burstActivationSlots(r, c),
  },
  burstActivationVideoFrames: {
    args: ['n'],
    sim: (r, c) => burstActivationVideoFrames(r, c),
  },
  fullBurstToNextActivation: {
    args: ['n'],
    sim: (r, c) => fullBurstToNextActivation(r, c),
  },
  fullBurstToGaugeFull: {
    args: ['n'],
    sim: (r, c) => fullBurstToGaugeFull(r, c),
  },
  gaugeFullToActivation: {
    args: ['n'],
    sim: (r, c) => gaugeFullToActivation(r, c),
  },
  gaugeFullToWeaponChangeShot: { args: ['slot', 'n'], sim: gaugeFullToWeaponChangeShot },
  // 2 段目の段 11 の PR 3（V-0530）: 枠のバーストの発動の回数（時刻表。burstCount は倍率ダメージのバーストの回数）
  burstActivationCount: {
    args: ['slot'],
    sim: (r, c) => {
      if (r.schedule === null) throw new Error('バーストの時刻表が無い');
      return activationFramesOfSlot(r.schedule, slotIndexOf(c)).length;
    },
  },
  /** V-0359: n 回目のフルバーストの入りに、枠の残りのバーストスキル CT が縮んだフレーム数（n はカンマ区切りの並びも書ける） */
  cooldownCutFrames: {
    args: ['slot', 'n'],
    sim: (r, c) => cooldownCutFrames(r, c),
  },
  fullBurstStarts: {
    args: [],
    sim: (r) => r.schedule?.fullBurstWindows.map((w) => w.start) ?? [],
  },
  // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 4 節）: 枠の 1 発目から n 回目（0 始まり）のフルバーストの入りまでのフレーム数。
  // 録画では、即着弾の枠（SR）の 1 発目の増分から、III のタイマーの 00.00 までの動画のフレーム（間に入りの止まりが無い 1 回目に使う）。
  // 戦闘開始のフレームを読まずに済む
  fullBurstStartFromFirstShot: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const start = r.schedule?.fullBurstWindows[Number(c.args.n)]?.start;
      if (start === undefined) throw new Error(`${String(c.args.n)} 回目のフルバーストが無い`);
      const first = slotOf(r.shots, c).frames[0];
      if (first === undefined) throw new Error(`枠 ${String(c.args.slot)} の発が無い`);
      return start - first;
    },
  },
  /**
   * ゲーム内の fromSec 秒から toSec 秒までの、録画の動画のフレーム数。フルバーストの入りの止まり（C-0069）を足す。
   * 3 分モードの残り時間が 02:59 から 00:00 になるまでは fromSec 0・toSec 179
   */
  videoFramesBetween: {
    args: ['fromSec', 'toSec'],
    sim: (r, c) => videoFramesBetween(r.schedule, c),
  },
  gaugeFullFrame: {
    args: ['n'],
    sim: (r, c) => gaugeFull(r.schedule?.gaugeFullFrames, c),
  },
  // 録画 0045・0046・0082 の「n 回目に BURST バーが消えた発の番号」（V-0085）。モデルは全発が当たるので、外れた発のある録画では
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
  },
  // ニヒリスター編: skill（'skill1' | 'skill2' | 'burst'）を書けば、そのスロットの倍率ダメージだけを数える（任意）
  skillHitCount: {
    args: ['slot'],
    sim: (r, c) =>
      c.args.skill === undefined
        ? slotOf(r.slots, c).skillHits.frames.length
        : r.skillHits.filter((h) => h.slotIndex === slotIndexOf(c) && h.effect.source.skill === c.args.skill).length,
  },
  shotCount: { args: ['slot'], sim: (r, c) => shotFramesIn(r, c).length },
  healHitCounts: { args: ['slot'], sim: healHitCounts },
  // 雪子編（V-0501）: 枠が出した n 回目（0 始まり）の回復の、録画の動画のフレーム（戦闘開始から。フルバーストの入りの止まりを足す）。
  // 録画では、回復の数字が画面に出たフレームと比べる（戦闘開始時の回復の数字は開始の 2f 後に出る。`0476-12`）
  healVideoFrame: { args: ['slot', 'n'], sim: healVideoFrame },
  // 雪子編（V-0501）: 枠が出した回復のフレームの数（同じフレームの回復は 1 つ）。録画では、回復の数字が出たフレームの数と比べる
  // （同じフレームに 2 つの回復が重なっても数字の出始めは 1 つ）
  healFrameCount: { args: ['slot'], sim: (r, c) => healFramesOf(r, c).length },
  maxAmmoAt: { args: ['slot', 'frame'], sim: maxAmmoAt },
  // 2 段目の段 4（V-0435）: n 発目の最大装弾数と、弾丸チャージの発数
  maxAmmoAtShot: { args: ['slot', 'shot'], sim: maxAmmoAtShot },
  ammoRefillAmounts: { args: ['slot', 'count'], sim: ammoRefillAmounts },
  reloadFramesAt: { args: ['slot', 'frame'], sim: reloadFramesAt },
  reloadToNextShotAt: { args: ['slot', 'frame'], sim: reloadToNextShotAt },
  buffWindowEnds: { args: ['slot', 'skill', 'stat'], sim: buffWindowEnds },
  buffWindowStarts: { args: ['slot', 'skill', 'stat'], sim: buffWindowStarts },
  buffWindowShotIntervalMean: {
    args: ['slot', 'skill', 'stat', 'inside'],
    sim: buffWindowShotIntervalMean,
  },
  buffWindowEndFromFullBurstEnd: { args: ['slot', 'skill', 'stat', 'n'], sim: buffWindowEndFromFullBurstEnd },
  chanceActiveRatio: { args: ['slot', 'skill'], sim: chanceActiveRatio },
  chanceExpiries: { args: ['slot', 'skill'], sim: chanceExpiries },
  critRateAt: { args: ['slot', 'frame'], sim: critRateAt },
  // ルドミラ：ウィンターオーナー編（plan/design-ludmilla-wo.md 3 節）: 戦闘の始めから count 本のマガジンの発数（リロードからリロードまで。
  // 最後の弾丸の発を含む）。弾丸チャージでマガジンが延びるかを見る
  magazineShots: { args: ['slot', 'count'], sim: magazineShots },
  steadyPauseShots: { args: ['slot'], sim: steadyPauseShots },
  lastShotGapMedians: { args: ['slot', 'every'], sim: lastShotGapMedians },
  fullBurstMagazineShots: { args: ['slot'], sim: fullBurstMagazineShots },
  cycleWindowResidues: { args: ['slot', 'every'], sim: cycleWindowResidues },
  shotIntervals: {
    args: ['slot'],
    sim: (r, c) => {
      const frames = shotFramesIn(r, c);
      return frames.slice(1).map((f, i) => f - frames[i]!);
    },
  },
  // 2 段目の段 9 の PR 2（V-0458）: 枠の [from, to) の発の、発と発の間の平均（(最後の発 − 最初の発) ÷ (発の数 − 1)）。HUD の増分のフレームの
  // 1f の揺れが、両端の発にしか残らない（マガジンの中の 27・28f の並びは、揺れで隣どうしが 29・26f になることがある）
  shotIntervalMean: {
    args: ['slot'],
    sim: (r, c) => {
      const frames = shotFramesIn(r, c);
      if (frames.length < 2) throw new Error(`枠 ${String(c.args.slot)} の発が 2 つ未満`);
      return (frames[frames.length - 1]! - frames[0]!) / (frames.length - 1);
    },
  },
  // シンデレラ S1 編（V-0463）: 枠の frame 以降の最初の発の、発射から着弾（発のゲージを足すフレーム）までのフレーム数（的の表の
  // flightFrames と着地点の時間割りで決まる）。録画では、照準の横の残弾が減ったフレームから総ダメージの増分までを読む
  shotFlightAt: {
    args: ['slot', 'frame'],
    sim: (r, c) => {
      const frame = Number(c.args.frame);
      const g = r.shotGauges.find((x) => x.slotIndex === slotIndexOf(c) && x.shotFrame >= frame);
      if (g === undefined) throw new Error(`枠 ${String(c.args.slot)} のフレーム ${frame} 以降の発が無い`);
      return g.frame - g.shotFrame;
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
  // 2 段目の段 13 の PR 1（V-0546）: 持続ダメージの、付けた時の 1 スタックのヒット（kind apply）か、スタックの tick（kind tick）の、録画の
  // 動画のフレーム（戦闘開始から）の頭の count 個
  dotHitVideoFrames: { args: ['slot', 'kind', 'count'], sim: dotHitVideoFrames },
  dotStackTickDamage: { args: ['slot', 'frame', 'stacks', 'crit'], sim: dotStackTickDamage },
  skillHitDamage: { args: ['slot', 'n', 'crit'], sim: skillHitDamage },
  skillHitVideoFrame: {
    args: ['slot', 'skill', 'n'],
    sim: (r, c) => skillHitVideoFrames(r, c)[Number(c.args.n)] ?? NaN,
  },
  // 2 段目の段 13 の PR 1（V-0546）: skillHitVideoFrame の頭の count 個の列（キャプチャーチェーンの 10 回の攻撃）
  skillHitVideoFrameList: {
    args: ['slot', 'skill', 'count'],
    sim: (r, c) => eventFrames(r, withArgs(c, { event: 'skillHit' })),
  },
  skillHitMeanInterval: { args: ['slot', 'skill'], sim: skillHitMeanInterval },
  skillHitShotIndices: { args: ['slot', 'skill', 'count'], sim: skillHitShotIndices },
  skillHitShotDelay: { args: ['slot', 'skill'], sim: skillHitShotDelay },
  skillHitBurstOrdinals: { args: ['slot', 'skill'], sim: skillHitBurstOrdinals },
  // 2 段目の段 11 の PR 5（V-0532）: 倍率ダメージの、同じ回のバーストのヒットからの動画のフレーム数
  skillHitFromBurstHit: { args: ['slot', 'skill', 'count'], sim: skillHitFromBurstHit },
  // 2 段目の段 12 の PR 2（V-0537）: 効果の倍率ダメージの、n 回目のフルバーストの 00.00 からの動画のフレーム数
  skillHitFramesFromFullBurst: {
    args: ['slot', 'skill', 'fullBurst', 'count'],
    sim: skillHitFramesFromFullBurst,
  },
  // 簡素化・第 7 回の案 2: 出来事の動画のフレームの、基準からの差の列（eventFrames の注記）。上の skillHit…・dot…・healVideoFrame の
  // 時刻の指標はこれの包み
  eventFrames: { args: ['slot', 'event'], sim: eventFrames },
  skillHitsDamage: { args: ['slot', 'n', 'count', 'crit'], sim: skillHitsDamage },
  burstHitDelays: { args: ['slot', 'count'], sim: burstHitDelays },
  gaugeFullToBurstHit: { args: ['slot', 'n'], sim: gaugeFullToBurstHit },
  burstHitOffsets: { args: ['slot', 'n'], sim: burstHitOffsets },
  burstEffectFirstShot: { args: ['slot', 'n'], sim: burstEffectFirstShot },
  burstEffectDelay: { args: ['slot', 'n'], sim: burstEffectDelay },
  fullBurstCrossingShotGauge: { args: ['slot'], sim: fullBurstCrossingShotGauge },
  // 2 段目の段 3（ソーダ：トゥインクルバニーのバースト。V-0437）: スタック数の条件で付いたか・スタック量の減少・フルバースト中の数え方
  burstBuffApplied: { args: ['slot', 'skill', 'stat'], sim: burstBuffApplied },
  // 2 段目の段 7（V-0452）: フルバーストで、枠に効果（対象が最終防御力の比べで決まる発射体爆発ダメージ▲ など）が付いたか
  fullBurstBuffApplied: { args: ['slot', 'skill', 'stat', 'n'], sim: fullBurstBuffApplied },
  stateStackDrops: { args: ['slot', 'state'], sim: stateStackDrops },
  // 2 段目の段 10（V-0503）: カウンタの値・状態が付いた回・フルバーストの終わりのスタック数
  counterAtBursts: { args: ['slot', 'counter'], sim: counterAtBursts },
  stateAppliedAtBursts: { args: ['slot', 'state'], sim: stateAppliedAtBursts },
  stateStacksAtFullBurstEnds: { args: ['slot', 'state'], sim: stateStacksAtFullBurstEnds },
  fullBurstStackGainResidues: { args: ['slot', 'state', 'every'], sim: fullBurstStackGainResidues },
  shotGauge: { args: ['slot', 'n'], sim: shotGauge },
  // フラワー編（V-0483）: 枠の n 回目（1 始まり）の周期のゲージ（burstGaugeHit）の量（バーの最大に対する %）
  timerGauge: {
    args: ['slot', 'n'],
    sim: (r, c) => {
      const n = Number(c.args.n);
      const g = r.timerGauges.filter((x) => x.slotIndex === slotIndexOf(c))[n - 1];
      if (g === undefined) throw new Error(`枠 ${String(c.args.slot)} の ${n} 回目の周期のゲージが無い`);
      return Math.round((g.energy / BURST_GAUGE_MAX) * 10_000) / 100;
    },
  },
  // 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節）: 右のバースト欄の表示の時刻
  ctEndToFullBurstStart: {
    args: ['slot', 'n'],
    sim: (r, c) => ctEndToFullBurstStart(r, c),
  },
  // 2 段目の段 12（V-0543）: 枠の n 回目の発動の印から、その発動の CT の明けまでの動画のフレーム
  activationToCtEnd: {
    args: ['slot', 'n'],
    sim: (r, c) => activationToCtEnd(r, c),
  },
  chainStepIntervals: {
    args: ['n'],
    sim: (r, c) => chainStepIntervals(r, c),
  },
};

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節。C-0512）: 枠の n 回目（0 始まり。カンマ区切りの並びも書ける）の
 * 発動の、その枠の CT の明け（前の発動 + CT − 前の発動の CT を維持の CT▼ で縮めた分 − その間に即時の CT▼ で縮んだ分）から
 * 発動の印（III はタイマーの 00.00。hexagonFrameOf）までの動画のフレーム数の列。モデルでその回が CT の明けで撃っていなければ
 * （ゲージや前の段が律速）比べられない
 */
function ctEndToFullBurstStart(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const character = ctx.input.slots[slotIndex]?.character;
  if (character === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  const cooldown = gameSecondsToFrames(character.burstSkill.cooldownSeconds);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex);
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const k = Number(s);
      const activation = mine[k];
      const previous = mine[k - 1];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      if (previous === undefined) throw new Error(`${s} 回目はモデルで CT が律速でない（前の発動が無い）`);
      const cut = schedule.cooldownReductions
        .filter((r) => r.slotIndex === slotIndex && r.frame >= previous.frame && r.frame < activation.frame)
        .reduce((sum, r) => sum + r.applied, 0);
      const ctEnd = previous.frame + cooldown - (previous.cooldownShortenedFrames ?? 0) - cut;
      if (ctEnd !== activation.frame)
        throw new Error(`${s} 回目はモデルで CT が律速でない（CT の明け ${ctEnd}・発動 ${activation.frame}）`);
      return activationVideoFrameOf(schedule, activation) - videoFrameOf(schedule, ctEnd);
    });
}

/**
 * 2 段目の段 12（V-0543）: 枠の n 回目（0 始まり。カンマ区切りの並びも書ける）の発動の印（I・II は六角形の替わり目、III は 00.00。
 * activationVideoFrameOf）から、その発動の CT の明け（発動 + CT − 維持の CT▼ で縮めた分 − 次の発動までに即時の CT▼ で縮んだ分）までの
 * 動画のフレーム数の列。録画では、次の回の右のバースト欄の顔の CT の秒の表示が消えたフレームから、この回の替わり目を引いた値
 */
function activationToCtEnd(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const character = ctx.input.slots[slotIndex]?.character;
  if (character === undefined) throw new Error(`枠 ${String(ctx.args.slot)} が無い`);
  const cooldown = gameSecondsToFrames(character.burstSkill.cooldownSeconds);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex);
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const k = Number(s);
      const activation = mine[k];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      const until = mine[k + 1]?.frame ?? Infinity;
      const cut = schedule.cooldownReductions
        .filter((r) => r.slotIndex === slotIndex && r.frame >= activation.frame && r.frame < until)
        .reduce((sum, r) => sum + r.applied, 0);
      const ctEnd = activation.frame + cooldown - (activation.cooldownShortenedFrames ?? 0) - cut;
      return videoFrameOf(schedule, ctEnd) - activationVideoFrameOf(schedule, activation);
    });
}

/**
 * 比べる設定の拡張（plan/design-compare-setup-extension.md 5 節。C-0515）: n 回目（0 始まり）のフルバーストを開いたチェーンの、
 * 隣り合う本当の発動どうしの動画のフレーム数（I → II・II → III。I・II の発動の止まりを含む）
 */
function chainStepIntervals(result: { schedule: BurstSchedule | null }, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const n = Number(ctx.args.n);
  const entries = schedule.activations.flatMap((a, i) => (a.startsFullBurst ? [i] : []));
  const last = entries[n];
  const window = schedule.fullBurstWindows[n];
  if (last === undefined || window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const chain = schedule.activations.slice(last - window.burstUsers.length + 1, last + 1);
  const frames = chain.map((a) => videoFrameOf(schedule, a.frame));
  return frames.slice(1).map((f, i) => f - frames[i]!);
}

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
  // 2 段目の段 13 の PR 2（V-0547）: hitMatches の省略できる引数 skill で、そのスロットの持続ダメージだけを数える（プリング・チェーン）。
  // 簡素化・第 7 回の案 1: 省略できる引数 frame（と fullBurst。frameArgOf）で、そのフレーム以降の tick だけを数える（skillHitDamage と同じ）
  const from = ctx.args.frame === undefined ? null : frameArgOf(result, ctx);
  const ticks = result.skillHits.filter(
    (h) =>
      h.slotIndex === slotIndexOf(ctx) &&
      h.effect.dot !== undefined &&
      hitMatches(h, ctx) &&
      (from === null || h.frame >= from),
  );
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
  // 簡素化・第 7 回の案 1: 省略できる引数 skill（hitMatches）で、そのスロットの持続ダメージだけを見る
  const tick = result.skillHits.find(
    (h) => h.slotIndex === slotIndexOf(ctx) && h.effect.dot !== undefined && hitMatches(h, ctx) && h.frame >= frame,
  );
  if (tick === undefined) throw new Error(`フレーム ${frame} 以降に持続ダメージの tick が無い`);
  if (tick.stacks === undefined) throw new Error('スタックしない持続ダメージの tick');
  return (oneHitValue(tick.hit, ctx.args.crit === true) / tick.stacks) * Number(ctx.args.stacks);
}

/**
 * 受けるダメージ編（イサベル）: 倍率ダメージ（damage。持続ダメージを除く）の n 回目（0 始まり。枠の発動を通した順）の 1 発動の値。
 * dotHitDamage と同じく、会心の期待値を外して、会心したか（crit）で組み直す。
 * 2 段目の段 12 の PR 2（V-0537）: 省略できる引数で数える発動を絞る（hitMatches）。frame（と fullBurst。frameArgOf）= そのフレーム以降の
 * 発動だけを数える。core・distance が true なら、コアに当たった・距離ボーナスの付いたヒットの値（core・distance の効果のヒットだけ。core はコア命中ダメージ（coreHit）にも。V-0538）
 */
function skillHitDamage(result: SimResult, ctx: MetricContext): number {
  const from = ctx.args.frame === undefined ? null : frameArgOf(result, ctx);
  const hits = result.skillHits.filter(
    (h) =>
      h.slotIndex === slotIndexOf(ctx) &&
      h.effect.dot === undefined &&
      hitMatches(h, ctx) &&
      (from === null || h.frame >= from),
  );
  const hit = hits[Number(ctx.args.n)];
  if (hit === undefined) throw new Error(`${String(ctx.args.n)} 回目の倍率ダメージが無い`);
  if (ctx.args.core === true && hit.effect.core !== true && hit.effect.coreHit !== true)
    throw new Error('コアに当たらない効果のヒットに core: true');
  if (ctx.args.distance === true && hit.effect.distance !== true)
    throw new Error('距離ボーナスの付かない効果のヒットに distance: true');
  return oneHitValue(hit.hit, ctx.args.crit === true, ctx.args.core === true, ctx.args.distance === true);
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

/** ctx の引数を args で上書きした ctx（undefined の欄は消す）。指標を eventFrames の包みにするときに使う */
function withArgs(ctx: MetricContext, args: Record<string, string | number | boolean | undefined>): MetricContext {
  const merged: CompareSpec['args'] = { ...ctx.args };
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  return { ...ctx, args: merged };
}

/** eventFrames の出来事（モデルのフレームと、録画の動画のフレーム） */
type EventPoint = { frame: number; video: number };

/** eventFrames の event: 枠の出来事の列（時刻の順） */
function eventPointsOf(result: SimResult, ctx: MetricContext): EventPoint[] {
  const slotIndex = slotIndexOf(ctx);
  const schedule = result.schedule;
  const at = (frame: number): EventPoint => ({ frame, video: videoFrameOf(schedule, frame) });
  const mine = () => (schedule?.activations ?? []).filter((a) => a.slotIndex === slotIndex);
  const hits = (keep: (h: SimResult['skillHits'][number]) => boolean) =>
    result.skillHits.filter((h) => h.slotIndex === slotIndex && keep(h) && hitMatches(h, ctx)).map((h) => at(h.frame));
  switch (ctx.args.event) {
    case 'skillHit':
      return hits((h) => h.effect.dot === undefined);
    case 'dot':
      return hits((h) => h.effect.dot !== undefined);
    case 'dotApply':
      return hits((h) => dotKindMatches(h, 'apply'));
    case 'dotTick':
      return hits((h) => dotKindMatches(h, 'tick'));
    case 'burstHit':
      return mine().flatMap((a) => hitFramesOf(a).map(at));
    case 'activation':
      return mine().map((a) => ({ frame: a.frame, video: activationVideoFrameOf(schedule!, a) }));
    case 'heal':
      return healFramesOf(result, ctx).map(at);
    default:
      throw new Error(
        `event は skillHit・dot・dotApply・dotTick・burstHit・activation・heal（${String(ctx.args.event)}）`,
      );
  }
}

/**
 * 簡素化・第 7 回の案 2（plan/design-workflow-simplification-7.md 2 節）: 枠の出来事（event）の録画の動画のフレームを、基準（anchor）からの
 * 差の列にする（フルバーストの入りの止まりを含む）。新しい「時刻の列」の比べは、指標を足さずにこれの引数で書く。
 * - anchor: start（戦闘の始まり。省略時）・fullBurst:<n>（n 回目のフルバーストの窓の始まり。III のタイマーの 00.00）・activation:<n>
 *   （枠の n 回目の発動。起点は activationVideoFrameOf）・prevBurstHit（出来事ごとに、その前の最後の自分のバーストの 1 ヒット目）・prevShot
 *   （出来事ごとに、その前の最後の自分の発。同じフレームの発を含む）
 * - within: window（フルバーストの窓の中）・afterWindow（窓の終わりから次の窓の始まりまで）・untilNext（基準から次の同じ基準まで）。
 *   省略すると基準から終わりまで（start は全部）
 * - skill・projectile・trigger は倍率ダメージと持続ダメージを hitMatches で絞る。skip の数だけ頭を飛ばし、count 個を返す（足りなければ誤り）
 */
function eventFrames(result: SimResult, ctx: MetricContext): number[] {
  const points = eventPointsOf(result, ctx);
  const anchor = String(ctx.args.anchor ?? 'start');
  const within = ctx.args.within;
  const schedule = result.schedule;
  let offsets: number[];
  if (anchor === 'start' || anchor === 'prevBurstHit' || anchor === 'prevShot') {
    if (within !== undefined) throw new Error(`anchor ${anchor} に within は使えない`);
    if (anchor === 'start') offsets = points.map((p) => p.video);
    else if (anchor === 'prevShot') {
      const shots = slotOf(result.shots, ctx).frames;
      offsets = points.map((p) => {
        const shot = shots.filter((f) => f <= p.frame).at(-1);
        if (shot === undefined) throw new Error(`フレーム ${p.frame} の出来事の前に発が無い`);
        return p.video - videoFrameOf(schedule, shot);
      });
    } else {
      if (schedule === null) throw new Error('バーストの時刻表が無い');
      const burstHits = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx)).map((a) => hitFrameOf(a));
      offsets = points.map((p) => {
        const burst = burstHits.filter((f) => f <= p.frame).at(-1);
        if (burst === undefined) throw new Error(`フレーム ${p.frame} の出来事の前にバーストのヒットが無い`);
        return p.video - videoFrameOf(schedule, burst);
      });
    }
  } else {
    const span = spanOf(result, ctx, anchor, within);
    offsets = points.filter((p) => span.from <= p.frame && p.frame < span.to).map((p) => p.video - span.base);
  }
  return firstCount(offsets, ctx, `出来事（${String(ctx.args.event)}）`);
}

/** eventFrames の基準（fullBurst:<n>・activation:<n>）の、動画のフレームと、数える範囲（モデルのフレーム） */
function spanOf(
  result: SimResult,
  ctx: MetricContext,
  anchor: string,
  within: CompareSpec['args'][string] | undefined,
): { base: number; from: number; to: number } {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const m = /^(fullBurst|activation):(\d+)$/.exec(anchor);
  if (m === null) throw new Error(`anchor は start・fullBurst:<n>・activation:<n>・prevBurstHit・prevShot（${anchor}）`);
  const n = Number(m[2]);
  if (m[1] === 'fullBurst') {
    const window = schedule.fullBurstWindows[n];
    if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
    const next = schedule.fullBurstWindows[n + 1]?.start ?? Number.POSITIVE_INFINITY;
    const base = videoFrameOf(schedule, window.start);
    if (within === 'window') return { base, from: window.start, to: window.end };
    if (within === 'afterWindow') return { base, from: window.end, to: next };
    if (within === 'untilNext') return { base, from: window.start, to: next };
    if (within === undefined) return { base, from: window.start, to: Number.POSITIVE_INFINITY };
    throw new Error(`within は window・afterWindow・untilNext（${String(within)}）`);
  }
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const activation = mine[n];
  if (activation === undefined) throw new Error(`${n} 回目の発動が無い`);
  const base = activationVideoFrameOf(schedule, activation);
  if (within === 'untilNext')
    return { base, from: activation.frame, to: mine[n + 1]?.frame ?? Number.POSITIVE_INFINITY };
  if (within === undefined) return { base, from: activation.frame, to: Number.POSITIVE_INFINITY };
  throw new Error(`activation の within は untilNext だけ（${String(within)}）`);
}

/**
 * V-0268: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の発動の、録画の動画のフレーム（戦闘開始から。フルバーストの入りの
 * 止まりを足す）の列
 */
function skillHitVideoFrames(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: 'skillHit', count: undefined }));
}

/**
 * 2 段目の段 12 の PR 2（V-0537）: 倍率ダメージの発動を、省略できる引数で絞る。skill = スロット、projectile = 発射体の付着（stick）か
 * 爆発（explosion）のヒット、trigger = きっかけがフルバーストの始まり（fullBurstStart）か射撃の回数（shotCount）。効果の番号では
 * 絞らない（編成の条件と最小構成の検査が効果を外すと、番号がずれる）
 */
function hitMatches(h: SimResult['skillHits'][number], ctx: MetricContext): boolean {
  if (ctx.args.skill !== undefined && h.effect.source.skill !== ctx.args.skill) return false;
  if (ctx.args.projectile === 'stick' && h.effect.projectileStick !== true) return false;
  if (ctx.args.projectile === 'explosion' && h.effect.projectileExplosion !== true) return false;
  if (ctx.args.trigger === 'fullBurstStart' && h.effect.trigger !== 'fullBurstStart') return false;
  if (ctx.args.trigger === 'shotCount' && !isResolvedShotCount(h.effect.trigger)) return false;
  return true;
}

/**
 * 2 段目の段 12 の PR 2（V-0537）: 枠の倍率ダメージ（hitMatches の絞り。skill は要る）のうち、fullBurst 回目（0 始まり）の
 * フルバーストの窓の中のものの、窓の始まり（III のタイマーの 00.00）からの動画のフレーム数（入りの止まりを挟む）の列。省略できる引数
 * skip の数だけ先頭を飛ばし、count 個を返す（録画では、入りの止まりの後の最初の増分に合わさるヒットは時刻が読めないので飛ばす）
 */
function skillHitFramesFromFullBurst(result: SimResult, ctx: MetricContext): number[] {
  // 2 段目の段 13 の PR 2（V-0547）: after が true なら、窓の後（次のフルバーストの窓の始まりまで）のヒット。kind が apply・tick なら、
  // 倍率ダメージの代わりに持続ダメージの付けた時のヒット・tick（フルバーストの終わりのキャプチャーチェーンの攻撃とチェーンバインド）
  const event = ctx.args.kind === undefined ? 'skillHit' : dotEventOf(ctx);
  const picked = eventFrames(
    result,
    withArgs(ctx, {
      event,
      anchor: `fullBurst:${String(ctx.args.fullBurst)}`,
      within: ctx.args.after === true ? 'afterWindow' : 'window',
    }),
  );
  // 2 段目の段 13 の PR 3（V-0548）: relative が true なら、返す最初のヒットからのフレーム数（S2 のスタック量▲の間隔。数え始めの位相に依らない）
  return ctx.args.relative === true ? picked.map((f) => f - picked[0]!) : picked;
}

/**
 * ペレットの命中編（plan/design-pellet-hit.md 4 節。V-0374）: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の最初の count 回が、
 * それぞれ枠の何発目（1 始まり。同じフレームの発を含む）の射撃で出たか。録画では、ヒットの直前の発の番号（撃った順）と比べる
 */
function skillHitShotIndices(result: SimResult, ctx: MetricContext): number[] {
  const shots = slotOf(result.shots, ctx).frames;
  const hits = result.skillHits.filter(
    (h) => h.slotIndex === slotIndexOf(ctx) && h.effect.source.skill === ctx.args.skill && h.effect.dot === undefined,
  );
  const count = Number(ctx.args.count);
  if (hits.length < count) throw new Error(`発動が ${hits.length} 回しかない`);
  return hits.slice(0, count).map((h) => shots.filter((f) => f <= h.frame).length);
}

/**
 * 回数トリガーの遅れ編の第 2 段（V-0505・V-0506）: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）のヒットが、その枠の直前の
 * 発（ヒットと同じフレームの発を含む）の何フレーム後に出たかの最頻値（同じ数なら小さいほう）。録画では、きっかけの発の HUD の増分から
 * ヒットの増分までのフレーム数の最頻値と比べる
 */
function skillHitShotDelay(result: SimResult, ctx: MetricContext): number {
  const shots = slotOf(result.shots, ctx).frames;
  const counts = new Map<number, number>();
  for (const h of result.skillHits) {
    if (h.slotIndex !== slotIndexOf(ctx) || h.effect.source.skill !== ctx.args.skill || h.effect.dot !== undefined) {
      continue;
    }
    const shot = shots.filter((f) => f <= h.frame).at(-1);
    if (shot === undefined) continue;
    counts.set(h.frame - shot, (counts.get(h.frame - shot) ?? 0) + 1);
  }
  if (counts.size === 0) throw new Error('発動が無い');
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/**
 * 2 段目の段 11 の PR 5（V-0532）: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の最初の count 回の、その前の最後の自分の
 * バーストのヒット（分かれたヒットは 1 ヒット目）からの動画のフレーム数（フルバーストの入りの止まりを含む）。録画では、バーストのヒットの
 * HUD の増分から倍率ダメージの増分までのフレーム数と比べる（ラプラス：アルティメットヒーローのバーストの追加ダメージ）
 */
function skillHitFromBurstHit(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: 'skillHit', anchor: 'prevBurstHit' }));
}

/**
 * V-0432: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）が出た、枠の何回目（1 始まり）のバーストか（昇順・重ねない）。
 * 発動から次の自分の発動の前までに出たヒットを、その回に数える。1 回のバーストで何ヒット出るかは問わない
 */
function skillHitBurstOrdinals(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex).map((a) => a.frame);
  const hits = result.skillHits.filter(
    (h) => h.slotIndex === slotIndex && h.effect.source.skill === ctx.args.skill && h.effect.dot === undefined,
  );
  const ordinals = new Set<number>();
  for (const h of hits) {
    const n = mine.filter((f) => f <= h.frame).length;
    if (n > 0) ordinals.add(n);
  }
  return [...ordinals].sort((a, b) => a - b);
}

/** V-0268: skillHitVideoFrames の 1 回目から最後までの動画のフレーム数 ÷ (回数 − 1)（発動の間隔の平均） */
function skillHitMeanInterval(result: SimResult, ctx: MetricContext): number {
  const frames = skillHitVideoFrames(result, ctx);
  if (frames.length < 2) throw new Error('発動が 2 回に満たない');
  return (frames.at(-1)! - frames[0]!) / (frames.length - 1);
}

/**
 * バーストの着弾編（plan/design-burst-landing.md）: 枠のバーストの、発動からヒット（バーストの倍率ダメージ。分かれたヒットは 1 ヒット目）までの
 * 動画のフレーム数（発動の順に最初の count 回）。フルバーストの入りの止まりは videoFrameOf で足す。起点は六角形の替わり目
 * （本当の発動の 5f 後。I・II の発動自身の止まりを含める。activationVideoFrameOf）
 */
function burstHitDelays(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const count = Number(ctx.args.count);
  if (mine.length < count) throw new Error(`発動が ${mine.length} 回しかない`);
  return mine.slice(0, count).map((a) => videoFrameOf(schedule, hitFrameOf(a)) - activationVideoFrameOf(schedule, a));
}

/**
 * backlog 2-30: 枠の n 回目（0 始まり）のバーストの発動の前の最後の満タン（BURST バーが消えた発）から、その発動のヒット（分かれたヒットは
 * 1 ヒット目）までの動画のフレーム数の列。n はカンマ区切りの並び（"0,2,3"）も書ける。burstHitDelays と違い、起点に六角形の替わり目を
 * 使わないので、遅れの定数を足す起点（本当の発動か替わり目か）の差が出る。ゲージが律速のチェーン（満タンから I まで 23f。C-0285）で比べる
 */
function gaugeFullToBurstHit(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  return String(ctx.args.n)
    .split(',')
    .map((s) => {
      const activation = mine[Number(s)];
      if (activation === undefined) throw new Error(`${s} 回目の発動が無い`);
      const full = schedule.gaugeFullFrames.filter((f) => f <= activation.frame).at(-1);
      if (full === undefined) throw new Error(`${s} 回目の発動の前に満タンが無い`);
      return videoFrameOf(schedule, hitFrameOf(activation)) - videoFrameOf(schedule, full);
    });
}

/**
 * バーストの効果の遅れ（backlog 2-4）: 枠の n 回目（0 始まり）のバーストの発動の印（I・II は六角形の替わり目。hexagonFrameOf。
 * V-0382・V-0390）から、効果の発火（effectFrameOf）以後の枠の最初の発までのモデルのフレーム数（ゲーム内の時間。フルバーストの
 * 入りの止まりを含まない）。効果の乗った最初の発の時刻を、動画のフレームの差（止まりの後の発は 22f を引く）と比べる。fromShot が
 * true なら起点を発動の後の最初の発にする（発の間隔とリロードの位置によらず、効果の遅れが無ければ 0）。band（的の距離帯）があれば、n は
 * 効果の発火のフレームの着地点がその帯の発動だけを数える（炸裂弾の時刻編。plan/design-eunhwa-tu-burst-shot-timing.md 7 節。モデルと録画で
 * バーストの回と的のジャンプの位相がそろわないので、帯で決まる値を帯どうしで比べる）
 */
function burstEffectFirstShot(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const band = ctx.args.band;
  const spans = band === undefined ? [] : landingFrameSpans(ctx.input.enemy, result.frames);
  const bandAt = (frame: number) => spans.find((s) => s.start <= frame && frame < s.end)?.band ?? null;
  const mine = schedule.activations.filter(
    (a) => a.slotIndex === slotIndexOf(ctx) && (band === undefined || bandAt(effectFrameOf(a)) === band),
  );
  const activation = mine[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  const frames = slotOf(result.shots, ctx).frames;
  const firstFrom = (frame: number) => {
    const shot = frames.find((f) => f >= frame);
    if (shot === undefined) throw new Error(`フレーム ${frame} の後に発が無い`);
    return shot;
  };
  const origin = ctx.args.fromShot === true ? firstFrom(activation.frame) : hexagonFrameOf(activation);
  return firstFrom(effectFrameOf(activation)) - origin;
}

/**
 * バーストの効果の遅れ（backlog 2-4。V-0368）: 枠の n 回目（0 始まり）のバーストの発動の印（I・II は六角形の替わり目。
 * hexagonFrameOf。V-0382）から、バースト使用時の効果の発火（effectFrameOf）までのモデルのフレーム数（遅れの無い効果は負）。効果の乗った発が自分の発でないとき（味方の発の値で▲の有無を読むとき）に、
 * 録画の「▲の無い最後の発 〜 ▲の乗った最初の発」の幅（観測値の spread）と比べる
 */
function burstEffectDelay(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const activation = mine[Number(ctx.args.n)];
  if (activation === undefined) throw new Error(`${String(ctx.args.n)} 回目の発動が無い`);
  return effectFrameOf(activation) - hexagonFrameOf(activation);
}

/** 2 段目の段 13 の PR 1・2: 引数 kind（持続ダメージの付けた時のヒット apply か tick）と、ヒットがそれか */
function dotKindOf(ctx: MetricContext): 'apply' | 'tick' {
  const kind = ctx.args.kind;
  if (kind !== 'apply' && kind !== 'tick') throw new Error(`kind は apply か tick（${String(kind)}）`);
  return kind;
}

/** 引数 kind に当たる eventFrames の event */
const dotEventOf = (ctx: MetricContext) => (dotKindOf(ctx) === 'apply' ? 'dotApply' : 'dotTick');

function dotKindMatches(h: SimResult['skillHits'][number], kind: 'apply' | 'tick'): boolean {
  return h.effect.dot !== undefined && (h.onApply === true) === (kind === 'apply');
}

/** 2 段目の段 13 の PR 1（V-0546）: dotHitVideoFrames。付けた時のヒットは onApply の印（frame/plan.ts の planSkillHits） */
function dotHitVideoFrames(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: dotEventOf(ctx) }));
}

/**
 * 持続ダメージ▲編（plan/design-sustained-damage-up.md 5.1 節）: 枠の n 回目（0 始まり）のバーストの発動から、その発動の後に出た
 * バーストのスロットの持続ダメージの tick（次の発動の前まで）までの動画のフレーム数の列（フルバーストの入りの止まりを含む。起点は activationVideoFrameOf）
 */
function dotTickOffsets(result: SimResult, ctx: MetricContext): number[] {
  const n = String(ctx.args.n);
  const frames = eventFrames(
    result,
    withArgs(ctx, { event: 'dot', skill: 'burst', anchor: `activation:${n}`, within: 'untilNext' }),
  );
  if (frames.length === 0) throw new Error(`${n} 回目の発動の後に持続ダメージの tick が無い`);
  return frames;
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
      if (condition !== 'auto') errors.push(`${at}: midFarLanding は condition が auto のときだけ`);
    }
    const near = c.setup.nearLanding;
    if (near !== undefined) {
      if (!Array.isArray(near) || near.length === 0 || !near.every((n) => NEAR_LANDINGS.includes(n))) {
        errors.push(`${at}: nearLanding は A・B の並び（1 回目・2 回目の順）`);
      }
      if (condition !== 'auto') errors.push(`${at}: nearLanding は condition が auto のときだけ`);
    }
    const far = c.setup.farLanding;
    if (far !== undefined) {
      if (!Array.isArray(far) || far.length === 0 || !far.every((n) => FAR_LANDINGS.includes(n))) {
        errors.push(`${at}: farLanding は A・B の並び（1 回目・2 回目の順）`);
      }
      if (condition !== 'auto') errors.push(`${at}: farLanding は condition が auto のときだけ`);
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
    for (const key of ['noBurstSlots', 'noFireSlots'] as const)
      for (const s of c.setup[key] ?? [])
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
    const tol = 'rel' in c.tolerance ? c.tolerance.rel : c.tolerance.abs;
    if (!(tol >= 0)) errors.push(`${at}: 許容幅は 0 以上`);
  }
  return errors;
}

/** 手で撃ったチェーンの始まりの並び（昇順の 0 以上の整数）。形が違えば undefined */
export function manualBurstsOf(value: number | number[] | undefined): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ok = value.every((f, i) => Number.isInteger(f) && f >= 0 && (i === 0 || f > value[i - 1]!));
  return ok ? value : undefined;
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

/** 2 段目の段 6: 定義に発動者の最終最大HP を読む効果（scaling casterFinalMaxHp。状態の中身も）があるか。宝物版の定義も見る */
function readsCasterMaxHp(definition: SkillDefinition | null): boolean {
  if (definition === null) return false;
  const entries = [...Object.values(definition.skills), ...Object.values(definition.treasureSkills ?? {})];
  return entries.some((entry) =>
    entry.effects.some(
      (e) =>
        ('scaling' in e && e.scaling === 'casterFinalMaxHp') ||
        (e.kind === 'state' && statContentsOf(e.contents).some((c) => c.scaling === 'casterFinalMaxHp')),
    ),
  );
}

/** 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 対象を最終防御力の比べで決める効果（targetDefense）があるか */
function comparesDefence(definition: SkillDefinition | null): boolean {
  if (definition === null) return false;
  const entries = [...Object.values(definition.skills), ...Object.values(definition.treasureSkills ?? {})];
  return entries.some((entry) => entry.effects.some((e) => 'targetDefense' in e && e.targetDefense !== undefined));
}

/** CompareSetup.dropEffects の 1 件 */
export type DroppedEffect = { rid: number; skill: SkillSlot; index: number; treasure?: boolean };

/** 定義の効果を落とした写しを返す（CompareSetup.dropEffects）。番号は落とす前の定義の番号 */
export function withoutEffects(
  definition: SkillDefinition | null,
  drops: readonly DroppedEffect[],
): SkillDefinition | null {
  if (definition === null || drops.length === 0) return definition;
  const out: SkillDefinition = { ...definition, skills: { ...definition.skills } };
  if (definition.treasureSkills !== undefined) out.treasureSkills = { ...definition.treasureSkills };
  for (const d of drops) {
    const root: SkillRoot = d.treasure === true ? 'treasureSkills' : 'skills';
    // 番号は落とす前の定義で引く（同じスロットから 2 件以上落とすとき、落とした後の写しの番号はずれる）
    const original = definition[root]?.[d.skill]?.effects[d.index];
    if (original === undefined) {
      throw new Error(
        `dropEffects: rid ${d.rid} の ${d.treasure === true ? '宝物版の ' : ''}${d.skill} に ${d.index} 番目の効果が無い`,
      );
    }
    // 元の定義にあるスロットは写しにもある
    const entry = out[root]![d.skill]!;
    out[root]![d.skill] = { ...entry, effects: entry.effects.filter((e) => e !== original) };
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
    // 2 段目の段 7（plan/design-skill-stage7.md 1.1 節）: 台帳の育成には防御力が無いので、最終防御力で対象を決める効果（味方全員の
    // 防御力を読む）のある編成は、スペック固定 OFF の録画では比べない（黙って育成値だけの防御力にしない）
    const readers = recording.team.filter((m) => comparesDefence(data.skills.get(m.rid) ?? null)).map((m) => m.rid);
    if (readers.length > 0)
      throw new Error(
        `rid ${readers.join('・')}: スペック固定 OFF の録画で最終防御力で対象を決める効果のある編成は未対応（台帳に防御力が無い）`,
      );
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
  const slots: TeamSlotInput[] = recording.team.map((member, index) => {
    const base = data.characters.get(member.rid);
    if (base === undefined) throw new Error(`rid ${member.rid} のデータが無い`);
    const delayOverrides = (setup.burstDelays ?? []).filter((d) => d.rid === member.rid);
    if (delayOverrides.length > 1) throw new Error(`burstDelays: rid ${member.rid} が 2 つある`);
    const character =
      delayOverrides.length === 0 ? base : { ...base, burstDelayOverride: burstDelayOverrideOf(delayOverrides[0]!) };
    const definition = withoutHealsIf(
      withoutEffects(
        data.skills.get(member.rid) ?? null,
        (setup.dropEffects ?? []).filter((d) => d.rid === member.rid),
      ),
      setup.dropHeals?.includes(member.rid) === true,
    );
    const adds = (setup.addEffects ?? []).filter((a) => a.rid === member.rid);
    if (adds.length > 0 && definition === null) throw new Error(`addEffects: rid ${member.rid} の定義が無い`);
    if (fixedSpec && member.cube !== undefined)
      throw new Error('キューブを付けた枠は未対応（スペック固定では乗らない）');
    const treasurePhase = (setup.treasure === false ? 0 : (member.treasurePhase ?? 0)) as TreasurePhase;
    const build = fixedSpec ? undefined : member.build!;
    // 2 段目の段 6（plan/design-skill-stage6.md 1.1 節）: 台帳の育成には最大HP が無いので、最終最大HP を読む効果のある枠は
    // スペック固定 OFF の録画では比べない（黙って育成値だけの HP にしない）
    if (build !== undefined && readsCasterMaxHp(definition))
      throw new Error(
        `rid ${member.rid}: スペック固定 OFF の録画で最終最大HP を読む効果のある枠は未対応（台帳に最大HP が無い）`,
      );
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
      condition: setup.noFireSlots?.includes(index + 1) === true ? { ...condition, hitRate: 0 } : condition,
      ...(auto ? { conditionMode: 'auto' as const } : {}),
      attackOverride: build === undefined ? computeFixedSpecAttack(character).attack : build.attack,
      ...(build === undefined
        ? { hpOverride: computeFixedSpecHp(character), defenceOverride: computeFixedSpecDefence(character) }
        : {}),
      ...(buildEffects === undefined ? {} : { buildEffects }),
      skills: {
        definition: definition === null ? null : withAddedEffects(definition, adds),
        levels: { ...MAX_SKILL_LEVELS, ...(build?.skillLevels ?? {}) },
        treasurePhase,
      },
    };
  });
  const controlled = recording.team.findIndex((m) => m.controlled === true);
  let manualBursts: number[] | undefined;
  if (setup.manualBursts !== undefined) {
    if (setup.burst === false) throw new Error('manualBursts は burst が false のときには書かない');
    manualBursts = manualBurstsOf(data.observationValues?.get(setup.manualBursts));
    if (manualBursts === undefined)
      throw new Error(`manualBursts の観測値 ${setup.manualBursts} が無いか、昇順のフレームの並びでない`);
  }
  const obstacleBreaks = (setup.obstacles ?? []).map((ob) => {
    const count = data.observationValues?.get(ob.count);
    if (typeof count !== 'number') throw new Error(`obstacles の観測値 ${ob.count} が無いか、個数でない`);
    return { slotIndex: ob.slot - 1, shot: ob.shot, count };
  });
  const pelletHits = (setup.pelletHits ?? []).map((ph) => {
    const counts = data.observationValues?.get(ph.counts);
    if (!Array.isArray(counts)) throw new Error(`pelletHits の観測値 ${ph.counts} が無いか、配列でない`);
    return { slotIndex: ph.slot - 1, counts };
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
              landingFixed(setup.midFarLanding, setup.nearLanding, setup.farLanding),
              windows,
            ),
          }),
    },
    durationSeconds,
    burst: setup.burst ?? true,
    burstModel: 'dynamic',
    controlledSlot: controlled < 0 ? null : controlled,
    ...(obstacleBreaks.length === 0 ? {} : { obstacleBreaks }),
    ...(pelletHits.length === 0 ? {} : { pelletHits }),
    ...(setup.sustainedHitRateUp === false ? { sustainedHitRateUp: false } : {}),
    ...(setup.sustainedDamagePlacement === undefined
      ? {}
      : { sustainedDamagePlacement: setup.sustainedDamagePlacement }),
    ...(setup.attackRounding === undefined ? {} : { attackRounding: setup.attackRounding }),
    ...(manualBursts === undefined ? {} : { manualBursts }),
    ...(setup.noBurstSlots === undefined ? {} : { noBurstSlots: setup.noBurstSlots.map((s) => s - 1) }),
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
  const cache = new Map<string, { input: TeamInput; sim?: SimResult }>();
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
      run.sim ??= runSimulation(run.input);
      const predicted = metric.sim(run.sim, ctx);
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

/** 引数と、手入力でない条件（Stage 18-C の自動の条件・中遠・近・遠の固定）。手入力の観測値は今までと同じ表示 */
function fmtArgs(args: CompareSpec['args'], setup?: CompareSetup): string {
  const entries: [string, unknown][] = Object.entries(args);
  if (setup?.condition === 'auto') entries.push(['condition', 'auto']);
  if (setup?.midFarLanding !== undefined) entries.push(['midFar', setup.midFarLanding]);
  if (setup?.nearLanding !== undefined) entries.push(['near', setup.nearLanding.join('・')]);
  if (setup?.farLanding !== undefined) entries.push(['far', setup.farLanding.join('・')]);
  if (setup?.manualBursts !== undefined) entries.push(['manualBursts', setup.manualBursts]);
  if (setup?.noBurstSlots !== undefined) entries.push(['noBurstSlots', setup.noBurstSlots.join('・')]);
  if (setup?.noFireSlots !== undefined) entries.push(['noFireSlots', setup.noFireSlots.join('・')]);
  for (const d of setup?.burstDelays ?? []) {
    const r = d.row;
    const row =
      r === null
        ? '行なし'
        : `hit ${r.hitFrames}・effect ${r.effectFrames}${r.origin === 'activation' ? '（本当の発動から）' : ''}`;
    entries.push([`burstDelays[${d.rid}${d.treasure === true ? '・宝物' : ''}]`, row]);
  }
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

const RESIDUAL_HEADER = [
  '| 観測値 | 読んだもの | 比べる値 | モデル | 実測 | 予測 | 差 | 許容 | 判定 | 結論 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
];

/** 比べた観測値の表（見出しつき）。残差の一覧と records:residual が共有する */
export function renderResidualRows(
  residuals: readonly Residual[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const claimText = (id: string) => (claimsOf.get(id) ?? []).join('・') || '—';
  const lines = [...RESIDUAL_HEADER];
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
  return lines;
}

/** モデルと比べない観測値の表（見出しつき） */
export function renderOtherRows(
  observations: readonly Observation[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const claimText = (id: string) => (claimsOf.get(id) ?? []).join('・') || '—';
  const lines = ['| 観測値 | 使い道 | 読んだもの | 値 | 結論 |', '| --- | --- | --- | --- | --- |'];
  for (const o of observations) {
    lines.push(`| ${[o.id, o.use, cell(o.description), cell(fmtObserved(o)), claimText(o.id)].join(' | ')} |`);
  }
  return lines;
}

/**
 * 残差の一覧の本文（生成する部分）。件数（判定ごと・話題ごと）と、見る行（許容外・比べられない・失効）だけを載せる。
 * 許容内の行とモデルと比べない観測値は npm run records:residual で引く（plan/design-workflow-simplification-3.md 2 節）。
 * topicOf は検証記録 ID → 話題（観測値の source で引く。無ければ「—」）
 */
export function renderResiduals(
  residuals: readonly Residual[],
  observations: readonly Observation[],
  claimsOf: ReadonlyMap<string, readonly string[]> = new Map(),
  topicOf: ReadonlyMap<string, string> = new Map(),
): string {
  const count = (rs: readonly Residual[], s: ResidualStatus) => rs.filter((r) => r.status === s).length;
  const invalid = count(residuals, 'invalid') > 0 ? `・失効 ${count(residuals, 'invalid')}` : '';
  const others = observations.filter((o) => o.use !== 'compare');
  const lines = [
    `比べた観測値 ${residuals.length} 件: 許容内 ${count(residuals, 'ok')}・許容外 ${count(residuals, 'outside')}・比べられない ${count(residuals, 'error')}${invalid}。モデルと比べない観測値 ${others.length} 件。`,
    '',
    '| 話題 | 許容内 | 許容外 | 比べられない | 失効 |',
    '| --- | --- | --- | --- | --- |',
  ];
  const byTopic = new Map<string, Residual[]>();
  for (const r of residuals) {
    const t = topicOf.get(r.observation.source) ?? 'ほか（verification.md など）';
    byTopic.set(t, [...(byTopic.get(t) ?? []), r]);
  }
  const order = (t: string) => {
    const i = (CLAIM_TOPICS as readonly string[]).indexOf(t);
    return i < 0 ? CLAIM_TOPICS.length : i;
  };
  for (const [t, rs] of [...byTopic].sort(([a], [b]) => order(a) - order(b))) {
    lines.push(
      `| ${[t, count(rs, 'ok'), count(rs, 'outside'), count(rs, 'error'), count(rs, 'invalid')].join(' | ')} |`,
    );
  }
  const attention = residuals.filter((r) => r.status !== 'ok');
  lines.push('', `### 見る行（許容外・比べられない・失効。${attention.length} 件）`, '');
  lines.push(...renderResidualRows(attention, claimsOf));
  return lines.join('\n');
}
