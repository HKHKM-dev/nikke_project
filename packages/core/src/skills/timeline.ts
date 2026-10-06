// Stage 6: 持続バフのタイムライン（純関数）。sim と calc が同じ区間分割を使う。
// 時刻表（burst/schedule.ts の BurstSchedule）は戦闘前に決まるので、バフの付与・失効のフレームも静的に決まる。
// Stage 7 で固定サイクル専用の形から BurstSchedule に一般化した（固定・動的どちらの時刻表でも同じ作り方）。
//
// 流れ: トリガーの発火フレーム → バフ窓 [start, end)（同一効果の再発火は和集合 = 上書き延長）
//       → 境界を集めて区間に割る → 区間ごとに枠の BuffTotals を作る → 同じバフ状態の区間をグループにまとめる。
//
// calc はグループごとに computeDamage を 1 回呼び、sim はフレームループで区間をまたぐたびに 1 トリガーの値を差し替える。
// timed 効果が 1 つもなければグループは「通常区間 / フルバースト区間」の 2 つに退化し、Stage 5 とまったく同じ計算になる。
// Stage 8: 射撃の回数（frame/shots.ts の射撃の列から）・発動の回数・バースト N 段階突入時のトリガーを足した。
// 射撃の回数で付くバフの窓は発火フレームの次のフレームから始める（トリガーになった射撃自身には乗らない）。
// Stage 10: トリガーの判定を skills/triggers.ts の TriggerTracker に移し、1 パス目のフレームループと同じコードを通す。
// Stage 11: 対象「直前にバーストスキルを使用した味方」（burstUsers）は発火ごとに対象が変わるので、対象の枠ごとに窓を和集合にする。
// 回復（heal）を 1 段目に planHeals（skills/heals.ts）で集め、「回復効果が適用された時」（healed）の出来事として流し直す。
// Stage 11 アリス編: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）の効果は 2 段目に回し、1 段目の攻撃力の窓で順位を付けて
// 対象を決める（skills/ranking.ts。plan/design-stage11.md 19.2 節）。
// Stage 11 モダニア（plan/design-stage11-modernia.md 3 節）: 効果のあるスタックは段ごとの窓にほどく（skills/stacks.ts）。
// 状態だけの stat（命中率）の窓は windows（timedEffects）に入れず stateWindows に置く。着地点の計画があるときだけ、区間の
// buffs.hitRate に足し、自動の枠の鍵に入れる（C-0170。コア命中率の N）。条件「自分が 〈stat〉 増加状態なら」の効果は 1.5 段目で、
// 1 段目の窓と stateWindows を見て発火を間引く。使用武器の変更の窓は、射手が持ち替えるフレーム（発火の次のフレーム）から始める
// （weaponStartTrim）。
import { isInFullBurst, type BurstSchedule } from '../burst/schedule.ts';
import type { BuildEffect } from '../buildEffects.ts';
import { resolveCycleEvery, type CycleWindow } from './cycles.ts';
import type { ShotLog } from '../frame/shots.ts';
import type { CharacterData } from '../types.ts';
import { framesToGameSeconds, gameSecondsToFrame } from '../time.ts';
import { ZERO_BUFFS, addRatioBuff, applyResolvedEffect, statTotal, type BuffTotals } from './buffs.ts';
import { chanceOpportunities, chancePieces, chanceValueOf } from './chance.ts';
import {
  isResolvedChance,
  isResolvedShotCount,
  isResolvedTimer,
  resolvePassives,
  resolveTimed,
  type AppliedEffect,
  type AppliedTimedEffect,
  type ResolvedEffect,
  type ResolvedShotCountTrigger,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type SkillLevels,
} from './resolve.ts';
import { hasHealEffects, planHeals } from './heals.ts';
import { attackRankFor, finalAttacksAt, tiedAtCutoff, type RankSlot, type RankingRecord } from './ranking.ts';
import { stackWindows } from './stacks.ts';
import { dependsOnContext, dependsOnRank, isEffectTarget } from './targets.ts';
import { replayEvents, trackTriggerFires, type FrameEvents, type HealRecord, type TriggerFire } from './triggers.ts';
import { isStateStat, selfBuffedStatOf, type BuffStat, type EffectName, type SkillDefinition } from './types.ts';

/** 枠 1 つ分の入力。TeamSlotInput ではなく必要な情報だけを受けて循環 import を避ける（planFixedCycle と同じ流儀） */
export type TimelineSlot = {
  character: CharacterData;
  /** null = 定義ファイルなし。自分の効果は出ないが、味方の allies 効果は受ける */
  definition: SkillDefinition | null;
  levels: SkillLevels;
  /** 発動者基準の固定加算に使うバフ前攻撃力（damage.ts の baseAttackOf と同じ値） */
  casterBaseAttack: number;
  /** Stage 13: 育成入力の効果層（OL・キューブ・コレクション）。自分だけに効く常時バフ。省略は無し */
  buildEffects?: readonly BuildEffect[];
  /** Stage 15: 命中率（射撃場 = 1 の相対値。省略 1）。1 パス目のゲージと normalHit の回数に使う */
  hitRate?: number;
  /** ルドミラ：ウィンターオーナー編: 手入力のコア命中率（省略 0）。coreHit の回数に使う（plan/design-ludmilla-wo.md 2.2 節） */
  coreHitRate?: number;
} | null;

/** 1 つの効果が 1 人に効いているフレーム区間 */
export type BuffWindow = {
  /** 効果を受ける枠 */
  slotIndex: number;
  /** 効果を出した枠 */
  sourceSlotIndex: number;
  effect: ResolvedTimedEffect;
  start: number;
  /** 戦闘時間で切る */
  end: number;
  /** Stage 11 モダニア: 効果のあるスタックの段（1 始まり）。スタックしない効果はキーごと無い */
  stack?: number;
};

/** Stage 11 モダニア: 条件「自分が 〈stat〉 増加状態なら」を満たさずに発火しなかった記録 */
export type ConditionSkip = {
  /** トリガーが起きたフレーム */
  frame: number;
  sourceSlotIndex: number;
  effect: { source: ResolvedEffect['source']; effectIndex: number };
};

/** 枠ごとのバフ合計と、そこに効いた効果（発生順） */
export type SlotBuffState = {
  buffs: BuffTotals;
  /** 常時パッシブ（Stage 4）の分 */
  passiveEffects: AppliedEffect[];
  /** Stage 13: 育成入力の効果層（OL・キューブ・コレクション）の分。常時 */
  buildEffects: readonly BuildEffect[];
  /** この区間で効いている持続バフの分 */
  timedEffects: AppliedTimedEffect[];
};

export type TimelineSegment = {
  start: number;
  end: number;
  /** framesToGameSeconds(end − start) */
  seconds: number;
  fullBurst: boolean;
  /** 枠ごとの状態。空枠は null */
  slots: (SlotBuffState | null)[];
  /**
   * Stage 18-C: 区間の着地点（着地点か配分の id、null = 未測定）。着地点の計画を渡したときだけ持つ
   * （条件が自動の枠が無ければキーごと無い）
   */
  landing?: string | null;
  /**
   * 枠ごとの「同じバフ状態」をまとめるための鍵（fullBurst + その枠の BuffTotals）。空枠は null。
   * 枠ごとに持つのが要点で、ある枠のバフが変わっても他の枠の区間はまとまったままになる。
   * グループ化にしか使わない（計算には丸める前の buffs を使う）。
   */
  slotKeys: (string | null)[];
};

export type BuffTimeline = {
  frames: number;
  /** [0, frames) を隙間・重なりなく覆う */
  segments: TimelineSegment[];
  /** 発生順。UI とテスト用 */
  windows: BuffWindow[];
  /** 常時パッシブだけの状態（Stage 4 互換の表示用）。空枠は null */
  passive: (SlotBuffState | null)[];
  /** Stage 11: 回復の記録（skills/heals.ts の planHeals）。heal 効果が無ければ空 */
  heals: HealRecord[];
  /** Stage 11 アリス編: topAttack の効果の発火ごとの順位（効果ごと・発生順）。topAttack の効果が無ければ空 */
  rankings: RankingRecord[];
  /** Stage 11 モダニア: 状態だけの stat（命中率）の窓。区間には入れない（条件の判定と表示用） */
  stateWindows: BuffWindow[];
  /** Stage 11 モダニア: 条件を満たさずに発火しなかった記録（発生順） */
  conditionSkips: ConditionSkip[];
  /**
   * Stage 11 紅蓮BS: 循環の間隔の変更（cycleEvery）の窓（発生順）。区間には入れない（ダメージの式も射手も読まない）。
   * frame/plan.ts の planSkillHits が、射撃がこの窓に入るかで循環の段を決める（plan/design-stage11-scarlet-bs.md 3.2 節）
   */
  cycleWindows: CycleWindow[];
  /**
   * ペルソナ編（plan/design-persona.md 3.3 節）: 名前の付いた効果（timed の name）が枠に付いた記録（フレーム・出どころの枠・受けた枠の順）。
   * 付き直し（窓が続いている間の再発火）も 1 回ずつ記録する。トリガー { applied: 名前 } の発火に使う（frame/plan.ts）
   */
  applications: AppliedRecord[];
};

/** ペルソナ編: 名前の付いた効果が枠に付いた記録 */
export type AppliedRecord = { frame: number; name: EffectName; sourceSlotIndex: number; slotIndex: number };

/** ペルソナ編: 枠 slotIndex に名前 name の効果が付いたフレーム（昇順。同じフレームに 2 つの出どころから付いても 1 回） */
export function appliedFrames(
  timeline: Pick<BuffTimeline, 'applications'>,
  name: EffectName,
  slotIndex: number,
): number[] {
  const frames = timeline.applications.filter((a) => a.name === name && a.slotIndex === slotIndex).map((a) => a.frame);
  return [...new Set(frames)].sort((a, b) => a - b);
}

/** 1 枠ぶんの「同じバフ状態の区間」をまとめたもの。calc はこの単位で computeDamage を呼ぶ */
export type TimelineGroup = {
  key: string;
  fullBurst: boolean;
  /** その枠の状態（グループ内のどの区間でも同じ） */
  state: SlotBuffState;
  /** この状態でいた合計秒数 */
  seconds: number;
  /** 含まれる区間（出現順） */
  segments: TimelineSegment[];
  /** Stage 18-C: 着地点（条件が自動の枠は鍵に入るのでグループ内で同じ。それ以外は最初の区間の値） */
  landing?: string | null;
};

/** 空枠・未計算のときに使う「バフなし」の状態 */
export const EMPTY_BUFF_STATE: Readonly<SlotBuffState> = Object.freeze({
  buffs: ZERO_BUFFS,
  passiveEffects: [],
  buildEffects: [],
  timedEffects: [],
});

/** key に使う BuffTotals のフィールド（並び順を固定する） */
const BUFF_FIELDS = [
  'attackRatio',
  'attackFlat',
  'critRate',
  'critDamage',
  'attackDamage',
  'chargeDamage',
  // ヘルム編: チャージダメージ倍率
  'chargeDamageMultiplier',
  'distributedDamage',
  // 受けるダメージ編: 敵の受けるダメージ▲
  'damageTaken',
  // アニス：スター S2・バースト編: 発射体爆発ダメージ▲とチャージ時間の固定
  'projectileExplosionDamage',
  // 持続ダメージ▲編
  'sustainedDamage',
  'burstGaugeSpeed',
  'maxAmmoRatio',
  'maxAmmoFlat',
  'reloadSpeed',
  'chargeSpeed',
  'chargeTimeFlat',
  'fixedChargeTime',
  // Stage 11 モダニア: 装弾数無限は射撃が変わるので鍵に入れる。命中率（hitRate）は条件が自動の枠だけ keyOf で足す
  'infiniteAmmo',
  // Stage 13: 効果層（常時）では区間を割らないが、スキルの timed にも書けるので鍵に入れる
  'elementDamage',
  'coreDamage',
  'normalAttackDamage',
  // ヘルム編: 通常攻撃のクリティカル確率
  'normalCritRate',
] as const satisfies readonly (keyof BuffTotals)[];

/** key の桁数。最下位ビットのずれで同一状態が別グループに割れないよう固定桁で文字列化する */
export const KEY_DIGITS = 6;

function keyOf(fullBurst: boolean, state: SlotBuffState, landing?: string | null): string {
  const parts: string[] = [fullBurst ? 'FB' : '--'];
  for (const field of BUFF_FIELDS) parts.push(state.buffs[field].toFixed(KEY_DIGITS));
  // Stage 11 モダニア: 使用武器の変更は武器ごとに別の状態
  if (state.buffs.weapon !== null) parts.push(`W:${state.buffs.weapon.id}`);
  // 効いている効果の出どころも鍵に入れる。合計が同じでも別の効果なら別の状態として扱い、UI のラベルが混ざらないようにする
  // （例: クイーン（真）の battleStart と fullBurstEnd はどちらも攻撃力 +50.28%）
  for (const e of state.timedEffects) parts.push(`${e.sourceSlotIndex}.${e.source.skill}.${e.effectIndex}`);
  // Stage 18-C: 条件が自動の枠だけ、着地点も鍵に入れる（手入力の枠のグループは今と同じ）。
  // 持続の命中率▲（C-0170）もコア命中率を変えるので、自動の枠だけ命中率の合計を鍵に入れる
  if (landing !== undefined) parts.push(`L:${landing ?? '?'}`, `N:${state.buffs.hitRate.toFixed(KEY_DIGITS)}`);
  return parts.join('|');
}

/**
 * 同じ射撃の列・時刻表で何度も呼ばれる（効果ごと）ので、直前の出来事の列を使い回す。
 * Stage 11: 回復の記録（heals）も鍵に入れる（回復の無い列と有る列は別物）。どれも参照の一致で見る
 */
let replayCache: {
  schedule: BurstSchedule | null;
  shots: readonly (ShotLog | null)[];
  frames: number;
  heals: readonly HealRecord[];
  events: FrameEvents[];
} | null = null;

const NO_HEALS: readonly HealRecord[] = Object.freeze([]);

function eventsOf(
  schedule: BurstSchedule | null,
  shots: readonly (ShotLog | null)[],
  frames: number,
  heals: readonly HealRecord[] = NO_HEALS,
): FrameEvents[] {
  const c = replayCache;
  if (c !== null && c.schedule === schedule && c.shots === shots && c.frames === frames && c.heals === heals) {
    return c.events;
  }
  const events = replayEvents(schedule, shots, frames, heals);
  replayCache = { schedule, shots, frames, heals, events };
  return events;
}

/**
 * トリガーが起きたフレーム列（昇順）。schedule が null（バーストなし）なら battleStart と射撃の回数だけ発火する。
 * burstUse はその枠が実際に撃った発動のフレーム（動的サイクルでは段階ごとに別フレーム、同じ段階の 2 体は交互になりうる）。
 * 射撃の回数（Stage 8）は shots[slotIndex] の every・2 × every…番目の射撃のフレーム。バフ窓の開始は buffStartFrames が 1 つ後ろにずらす。
 * Stage 10: 判定は skills/triggers.ts の TriggerTracker（1 パス目のフレームループと共通）に出来事の列を流し直して行う。
 */
export function triggerFrames(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): number[] {
  return triggerFires(trigger, schedule, slotIndex, frames, shots, heals).map((f) => f.frame);
}

/** Stage 11: triggerFrames の文脈つき版（対象 burstUsers の判定に使う）。heals は healed の出来事（planHeals の結果） */
export function triggerFires(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): TriggerFire[] {
  // ニヒリスター編: 時間の周期のトリガーは、出来事の列を使わずに戦闘開始から k × N 秒のフレームを並べる
  // 防御力無視ダメージ編: atStart なら戦闘開始時（フレーム 0）にも発火する
  if (isResolvedTimer(trigger)) {
    const timer = timerFrames(trigger.everySeconds, frames);
    const all = 'atStart' in trigger && trigger.atStart === true && frames > 0 ? [0, ...timer] : timer;
    return all.map((frame) => ({ frame, context: null }));
  }
  return trackTriggerFires(trigger, slotIndex, schedule, eventsOf(schedule, shots, frames, heals));
}

/**
 * ニヒリスター編: 時間の周期のトリガーの発火フレーム。戦闘開始から k × N 秒（k = 1, 2, …）の時刻を四捨五入したフレームで、
 * 戦闘の終わり（frames）より前だけ（plan/design-nihilister.md 8.1 節。C-0091）
 */
export function timerFrames(everySeconds: number, frames: number): number[] {
  const fires: number[] = [];
  // V-0086: 戦闘の最後のフレーム（180 秒の戦闘では 179.996 秒）より後の時刻（180 秒ちょうどの発火など）は、戦闘の終わりで起きない
  const lastFrameSeconds = framesToGameSeconds(frames - 1) + 1e-9;
  for (let k = 1; ; k++) {
    const seconds = k * everySeconds;
    const frame = gameSecondsToFrame(seconds);
    if (frame >= frames || seconds > lastFrameSeconds) return fires;
    fires.push(frame);
  }
}

/** バフ窓が始まるフレーム。射撃の回数トリガーだけ、トリガーになった射撃の次のフレームから（その射撃自身には乗らない） */
export function buffStartFrames(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): number[] {
  return buffStartFires(trigger, schedule, slotIndex, frames, shots, heals).map((f) => f.frame);
}

/** Stage 11: buffStartFrames の文脈つき版 */
export function buffStartFires(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
): TriggerFire[] {
  const fired = triggerFires(trigger, schedule, slotIndex, frames, shots, heals);
  if (!isResolvedShotCount(trigger)) return fired;
  return fired.map((f) => ({ frame: f.frame + 1, context: f.context })).filter((f) => f.frame < frames);
}

/**
 * Stage 11 モダニア: 使用武器の変更の窓の頭を何フレーム削るか。バースト系の発火（f）で付く窓 [f, f + d) を、射手が持ち替えるフレーム
 * （f + 1。frame/firstPass.ts の射手が見る窓の規則）から始める。発火のフレームの射撃は基礎の武器で撃たれるので、その 1 発を
 * 変更後の武器のダメージで数えないため。終わりは変えない（同じ発動の装弾数無限と同じフレームに切れる）。
 * 射撃の回数トリガー（窓がもともと f + 1 から）と戦闘開始時（ループの前に登録）は削らない
 */
export function weaponStartTrim(effect: Pick<ResolvedTimedEffect, 'stat' | 'trigger'>): number {
  return effect.stat === 'weapon' && effect.trigger !== 'battleStart' && !isResolvedShotCount(effect.trigger) ? 1 : 0;
}

/** Stage 11 モダニア: 効果 1 つの窓（スタックする効果は段ごと、しない効果は和集合。使用武器の変更は頭を削る） */
export function effectWindows(
  starts: readonly number[],
  effect: Pick<ResolvedTimedEffect, 'durationFrames' | 'maxStacks' | 'stat' | 'trigger'>,
  frames: number,
): { start: number; end: number; stack?: number }[] {
  if (effect.maxStacks !== undefined) return stackWindows(starts, effect.durationFrames, frames, effect.maxStacks);
  const trim = weaponStartTrim(effect);
  return unionWindows(starts, effect.durationFrames, frames)
    .map(([start, end]) => ({ start: start + trim, end }))
    .filter((w) => w.start < w.end);
}

/**
 * Stage 11 モダニア: 枠 slotIndex がフレーム frame で stat の増加状態か（常時パッシブの合計 > 0、または値が正の窓が効いている）。
 * 同じフレームに始まった窓も入れる（アリス編の順位と同じ）
 */
export function selfBuffedAt(
  passive: readonly (SlotBuffState | null)[],
  windows: readonly {
    slotIndex: number;
    effect: Pick<ResolvedTimedEffect, 'stat' | 'value'>;
    start: number;
    end: number;
  }[],
  slotIndex: number,
  stat: BuffStat,
  frame: number,
): boolean {
  const base = passive[slotIndex];
  if (base && statTotal(base.buffs, stat) > 0) return true;
  return windows.some(
    (w) =>
      w.slotIndex === slotIndex && w.effect.stat === stat && w.effect.value > 0 && w.start <= frame && frame < w.end,
  );
}

/**
 * ヘルム編: 「N 発間維持」の窓。始まり s から、s 以降の N 発目の射撃のフレーム + 1 まで（N 発目にも効く）。
 * N 発を撃つ前に戦闘が終われば frames まで。維持中にまた付いたら、そこから数え直す（和集合。秒の維持の上書き延長に合わせる）
 */
export function shotCountWindows(
  starts: readonly number[],
  shotFrames: readonly number[],
  shots: number,
  frames: number,
): [number, number][] {
  const merged: [number, number][] = [];
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (s >= frames) continue;
    const first = shotFrames.findIndex((f) => f >= s);
    const nth = first < 0 ? undefined : shotFrames[first + shots - 1];
    const end = nth === undefined ? frames : Math.min(nth + 1, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && s <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([s, end]);
  }
  return merged;
}

/**
 * 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9 節）: 撃ち切りで終わる使用武器の変更の窓。始まり s から、
 * s より後の最初の終わり（1 パス目の ShotLog.weaponChangeEnds）まで（無ければ frames まで）。維持中にまた付いたら和集合
 * （1 パス目は開いている窓に重ねて付いても撃ち切りまで変えない）
 */
export function untilWeaponChangeEndWindows(
  starts: readonly number[],
  ends: readonly number[],
  frames: number,
): [number, number][] {
  const merged: [number, number][] = [];
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (s >= frames) continue;
    const end = Math.min(ends.find((e) => e > s) ?? frames, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && s <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([s, end]);
  }
  return merged;
}

/**
 * 防御力無視ダメージ編: 「解除条件：フルバーストタイムが終了した時」の窓。始まり s から、s より後に終わる最初のフルバーストの終わりまで
 * （無ければ frames まで）。維持中にまた付いたら和集合（plan/design-true-damage-element.md 3.2 節）
 */
export function untilFullBurstEndWindows(
  starts: readonly number[],
  schedule: BurstSchedule | null,
  frames: number,
): [number, number][] {
  const ends = (schedule?.fullBurstWindows ?? []).map((w) => w.end);
  const merged: [number, number][] = [];
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (s >= frames) continue;
    const end = Math.min(ends.find((e) => e > s) ?? frames, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && s <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([s, end]);
  }
  return merged;
}

/** 防御力無視ダメージ編: フレーム frame がフルバーストタイムの中か（条件 inFullBurst） */
export function inFullBurstAt(schedule: BurstSchedule | null, frame: number): boolean {
  return (schedule?.fullBurstWindows ?? []).some((w) => w.start <= frame && frame < w.end);
}

/** 同一効果の窓を和集合にする（上書き延長。重ねない）。frames が上限 */
function unionWindows(fireFrames: readonly number[], durationFrames: number, frames: number): [number, number][] {
  if (durationFrames <= 0) return [];
  const merged: [number, number][] = [];
  for (const f of [...fireFrames].sort((a, b) => a - b)) {
    if (f >= frames) continue;
    const end = Math.min(f + durationFrames, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && f <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([f, end]);
  }
  return merged;
}

type PassiveSource = { slotIndex: number; casterBaseAttack: number; effect: ResolvedEffect };

const NO_BUILD_EFFECTS: readonly BuildEffect[] = Object.freeze([]);

/**
 * 常時パッシブだけの状態（Stage 4 の resolveTeamBuffs と同じ結果になる）。空枠は null。
 * Stage 13: 育成入力の効果層（TimelineSlot.buildEffects）はスキルの passive の後に、その枠自身へ比率で足す
 */
export function resolvePassiveStates(slots: readonly TimelineSlot[]): (SlotBuffState | null)[] {
  const sources: PassiveSource[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolvePassives(slot.definition, slot.character, slot.levels)) {
      sources.push({ slotIndex, casterBaseAttack: slot.casterBaseAttack, effect });
    }
  });
  return slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const passiveEffects: AppliedEffect[] = [];
    for (const { slotIndex, casterBaseAttack, effect } of sources) {
      if (!isEffectTarget(effect, slotIndex, index, slot.character)) continue;
      const applied = applyResolvedEffect(buffs, effect, casterBaseAttack);
      buffs = applied.totals;
      passiveEffects.push({ ...effect, sourceSlotIndex: slotIndex, appliedAmount: applied.appliedAmount });
    }
    const buildEffects = slot.buildEffects ?? NO_BUILD_EFFECTS;
    for (const e of buildEffects) {
      const { kind, part, line, skillId } = e.source;
      buffs = addRatioBuff(buffs, e.stat, e.value, `build:${kind}:${part ?? ''}:${line ?? skillId ?? ''}`);
    }
    return { buffs, passiveEffects, buildEffects, timedEffects: [] };
  });
}

/**
 * 持続バフの区間分割。
 * 境界は {0, frames} ∪ 全バフ窓の端 ∪ フルバースト区間の端 ∪ バースト発動フレーム。
 * shots（Stage 8）は射撃の回数トリガーに使う射撃の列。省略すると射撃の回数トリガーは発火しない。
 * Stage 18-C: landings（着地点の区間と、条件が自動の枠）を渡すと、着地点の境目も境界に足し、自動の枠の鍵に着地点を入れる。
 * sustainedHitRateUp が false なら、持続の命中率▲（C-0170）を区間の buffs.hitRate に足さない（TeamInput.sustainedHitRateUp）。
 */
export function planBuffTimeline(
  slots: readonly TimelineSlot[],
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  landings: TimelineLandings | null = null,
  sustainedHitRateUp = true,
): BuffTimeline {
  if (!Number.isInteger(frames) || frames < 0) {
    throw new RangeError(`frames must be a non-negative integer, got ${frames}`);
  }
  const passive = resolvePassiveStates(slots);
  // Stage 11: 回復の記録（1 段目）。heal 効果が無ければ空のまま（出来事の列は今までと同じ）
  const heals = hasHealEffects(slots) ? planHeals(slots, schedule, shots, frames) : [];
  const healsKey: readonly HealRecord[] = heals.length === 0 ? NO_HEALS : heals;

  // 1〜2. 発火フレーム → 窓（同一効果は和集合、スタックする効果は段ごと）→ 対象の枠に配る
  const windows: BuffWindow[] = [];
  /** Stage 11 モダニア: 状態だけの stat（命中率）の窓。区間には入れない */
  const stateWindows: BuffWindow[] = [];
  /** 2 段目に回す効果（対象が攻撃力の順位で決まる） */
  const ranked: { sourceSlotIndex: number; effect: ResolvedTimedEffect }[] = [];
  /** ペルソナ編: 名前の付いた効果が付いた記録（1 段目の効果だけ。名前は条件・順位の対象と組めない） */
  const applications: AppliedRecord[] = [];
  /** 1.5 段目に回す効果（Stage 11 モダニア: 条件「自分が 〈stat〉 増加状態なら」） */
  const conditional: { sourceSlotIndex: number; effect: ResolvedTimedEffect }[] = [];
  /** 2.5 段目に回す効果（環境コントロール強化編: 参照する効果の窓に重なる間だけ、その値を増やす） */
  const amplifying: { sourceSlotIndex: number; effect: ResolvedTimedEffect }[] = [];
  /** 窓の始まりの列 fires から効果の窓を作り、対象の枠に配る */
  const distribute = (
    out: BuffWindow[],
    effect: ResolvedTimedEffect,
    sourceSlotIndex: number,
    fires: readonly TriggerFire[],
  ): void => {
    // ヘルム編: 「N 発間維持」は対象の枠ごとに、その枠の射撃を数えて窓の終わりを決める
    if (effect.durationShots !== undefined) {
      const n = effect.durationShots;
      slots.forEach((target, slotIndex) => {
        if (target === null) return;
        const mine = fires
          .filter((f) => isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, f.context))
          .map((f) => f.frame);
        for (const [start, end] of shotCountWindows(mine, shots[slotIndex]?.frames ?? [], n, frames)) {
          out.push(windowOf(slotIndex, sourceSlotIndex, effect, { start, end }));
        }
      });
      return;
    }
    // 使用武器変更の武器のパラメータ編（plan/design-true-damage-element.md 9 節の論点 8）: 撃ち切りで終わる使用武器の変更は、
    // 持ち替えるフレーム（weaponStartTrim）から、1 パス目が基礎の武器に戻したフレームまで
    if (effect.durationUntil === 'ammoSpent') {
      const trim = weaponStartTrim(effect);
      slots.forEach((target, slotIndex) => {
        if (target === null) return;
        const mine = fires
          .filter((f) => isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, f.context))
          .map((f) => f.frame);
        // 和集合は発火のフレームで取り、頭は後で削る（effectWindows・1 パス目の register と同じ順）
        for (const [start, end] of untilWeaponChangeEndWindows(
          mine,
          shots[slotIndex]?.weaponChangeEnds ?? [],
          frames,
        )) {
          if (start + trim < end) out.push(windowOf(slotIndex, sourceSlotIndex, effect, { start: start + trim, end }));
        }
      });
      return;
    }
    // 防御力無視ダメージ編: 「解除条件：フルバーストタイムが終了した時」は時刻表のフルバーストの終わりで窓を閉じる
    if (effect.durationUntil === 'fullBurstEnd') {
      slots.forEach((target, slotIndex) => {
        if (target === null) return;
        const mine = fires
          .filter((f) => isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, f.context))
          .map((f) => f.frame);
        for (const [start, end] of untilFullBurstEndWindows(mine, schedule, frames)) {
          out.push(windowOf(slotIndex, sourceSlotIndex, effect, { start, end }));
        }
      });
      return;
    }
    if (!dependsOnContext(effect)) {
      const merged = effectWindows(
        fires.map((f) => f.frame),
        effect,
        frames,
      );
      if (merged.length === 0) return;
      slots.forEach((target, slotIndex) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character)) {
          return;
        }
        for (const w of merged) out.push(windowOf(slotIndex, sourceSlotIndex, effect, w));
      });
      return;
    }
    // Stage 11: 対象が発火ごとに変わる効果（burstUsers）は、対象の枠ごとに「その枠が対象だった発火」だけで和集合にする
    // （上書き延長はその枠が受けた発火どうしでだけ起きる。plan/design-stage11.md 3.2 節）
    slots.forEach((target, slotIndex) => {
      if (target === null) return;
      const mine = fires
        .filter((f) => isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, f.context))
        .map((f) => f.frame);
      for (const w of effectWindows(mine, effect, frames)) out.push(windowOf(slotIndex, sourceSlotIndex, effect, w));
    });
  };
  /** ソルジャーE.G. 編: 確率のきっかけの効果の小片の窓を、対象の枠ごとに作る（対象は発火の文脈によらない。types.ts の validateChanceTimed） */
  const chanceWindows = (
    effect: ResolvedTimedEffect,
    sourceSlotIndex: number,
    events: readonly FrameEvents[],
  ): BuffWindow[] => {
    const trigger = effect.trigger as ResolvedShotCountTrigger & { chance: number };
    const pieces = chancePieces(
      chanceOpportunities(trigger, sourceSlotIndex, events, frames),
      effect.durationFrames,
      frames,
    );
    const out: BuffWindow[] = [];
    slots.forEach((target, slotIndex) => {
      if (target === null || !isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character)) return;
      for (const { start, end, scale } of pieces) {
        const value = chanceValueOf(effect.value, scale);
        out.push(windowOf(slotIndex, sourceSlotIndex, { ...effect, value }, { start, end }));
      }
    });
    return out;
  };
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolveTimed(slot.definition, slot.character, slot.levels)) {
      if (effect.amplifies !== undefined) {
        amplifying.push({ sourceSlotIndex, effect });
        continue;
      }
      if (dependsOnRank(effect)) {
        ranked.push({ sourceSlotIndex, effect });
        continue;
      }
      if (effect.condition !== undefined) {
        conditional.push({ sourceSlotIndex, effect });
        continue;
      }
      // ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 確率のきっかけは、期待値の小片の窓（値 × 付いている確率）にする
      if (isResolvedChance(effect.trigger)) {
        windows.push(...chanceWindows(effect, sourceSlotIndex, eventsOf(schedule, shots, frames, healsKey)));
        continue;
      }
      const fires = buffStartFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey);
      distribute(isStateStat(effect.stat) ? stateWindows : windows, effect, sourceSlotIndex, fires);
      const name = effect.name;
      if (name === undefined) continue;
      for (const fire of fires) {
        slots.forEach((target, slotIndex) => {
          if (target === null) return;
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, fire.context)) return;
          applications.push({ frame: fire.frame, name, sourceSlotIndex, slotIndex });
        });
      }
    }
  });
  applications.sort((a, b) => a.frame - b.frame || a.sourceSlotIndex - b.sourceSlotIndex || a.slotIndex - b.slotIndex);

  // 1.5 段目（Stage 11 モダニア）: 条件付きの効果。発火の瞬間の状態は 1 段目の窓と状態の窓で見る（条件付きの効果どうしは連鎖させない）
  const conditionSkips: ConditionSkip[] = [];
  if (conditional.length > 0) {
    const stateSources = [...windows, ...stateWindows];
    for (const { sourceSlotIndex, effect } of conditional) {
      const accepted: TriggerFire[] = [];
      for (const fire of triggerFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey)) {
        const selfBuffed = selfBuffedStatOf(effect.condition);
        const ok =
          selfBuffed === undefined
            ? inFullBurstAt(schedule, fire.frame)
            : selfBuffedAt(passive, stateSources, sourceSlotIndex, selfBuffed, fire.frame);
        if (!ok) {
          conditionSkips.push({
            frame: fire.frame,
            sourceSlotIndex,
            effect: { source: effect.source, effectIndex: effect.effectIndex },
          });
          continue;
        }
        // 窓は射撃の回数起点なら次のフレームから（buffStartFires と同じ規則）
        const start = isResolvedShotCount(effect.trigger) ? fire.frame + 1 : fire.frame;
        if (start < frames) accepted.push({ frame: start, context: fire.context });
      }
      distribute(windows, effect, sourceSlotIndex, accepted);
    }
  }

  // 2 段目（Stage 11 アリス編）: 1 段目の攻撃力の窓で発火ごとに順位を付け、対象の枠ごとに和集合にする
  const rankings: RankingRecord[] = [];
  if (ranked.length > 0) {
    const rankSlots = rankSlotsOf(slots, passive);
    const attackWindows = windows.filter((w) => w.effect.stat === 'attack');
    const rankedWindows: BuffWindow[] = [];
    for (const { sourceSlotIndex, effect } of ranked) {
      const perTarget: number[][] = slots.map(() => []);
      // 順位はトリガーが起きたフレームで出し、窓は射撃の回数起点なら次のフレームから（1 パス目と同じ）
      for (const fire of triggerFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey)) {
        const start = isResolvedShotCount(effect.trigger) ? fire.frame + 1 : fire.frame;
        if (start >= frames) continue;
        const finalAttacks = finalAttacksAt(rankSlots, attackWindows, fire.frame);
        const attackRank = attackRankFor(effect, rankSlots, finalAttacks, sourceSlotIndex);
        const context = { ...fire.context, attackRank };
        const targets: number[] = [];
        slots.forEach((target, slotIndex) => {
          if (target === null) return;
          if (!isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character, context)) return;
          perTarget[slotIndex]!.push(start);
          targets.push(slotIndex);
        });
        rankings.push({
          frame: fire.frame,
          sourceSlotIndex,
          effect: { source: effect.source, effectIndex: effect.effectIndex },
          finalAttacks,
          targets: attackRank.filter((i) => targets.includes(i)),
          // 対象の語彙編: unlessShort で末尾に足した自分は、同値の比べに入れない（順位ではなく足りない分の補い）
          tied: tiedAtCutoff(
            effect.excludeSelf === 'unlessShort' ? attackRank.slice(0, -1) : attackRank,
            finalAttacks,
            effect.targetCount ?? 1,
          ),
        });
      }
      perTarget.forEach((starts, slotIndex) => {
        // 順位の発数編（plan/design-ranked-shot-duration.md 2 節）: 「N 発間維持」は発火のフレームの順位で決まった枠の射撃で切る
        if (effect.durationShots !== undefined) {
          for (const [start, end] of shotCountWindows(
            starts,
            shots[slotIndex]?.frames ?? [],
            effect.durationShots,
            frames,
          )) {
            rankedWindows.push(windowOf(slotIndex, sourceSlotIndex, effect, { start, end }));
          }
          return;
        }
        for (const w of effectWindows(starts, effect, frames)) {
          rankedWindows.push(windowOf(slotIndex, sourceSlotIndex, effect, w));
        }
      });
    }
    windows.push(...rankedWindows);
  }

  // 2.5 段目（環境コントロール強化編。plan/design-true-damage-element.md 3.5 節、V-0230 の論点 1 (a)）: 発火の瞬間に自分に
  // 同じ枠の参照するスロットの同じ stat の窓（1〜2 段目のもの）が効いていれば、発動から維持の秒数のあいだ、対象の枠ごとに
  // 参照する窓が効いている所は「その値 × 割合」を足し、切れた所は「発動の瞬間の参照の値 × (1 + 割合)」を足す（切り取らない）
  for (const { sourceSlotIndex, effect } of amplifying) {
    const { skill } = effect.amplifies!;
    const referenced = windows.filter(
      (w) =>
        w.sourceSlotIndex === sourceSlotIndex &&
        w.effect.source.skill === skill &&
        w.effect.stat === effect.stat &&
        w.effect.amplifies === undefined,
    );
    const activeAt = (slotIndex: number, frame: number) =>
      referenced.filter((w) => w.slotIndex === slotIndex && w.start <= frame && frame < w.end);
    const accepted: number[] = [];
    for (const { frame } of buffStartFires(effect.trigger, schedule, sourceSlotIndex, frames, shots, healsKey)) {
      if (activeAt(sourceSlotIndex, frame).length === 0) {
        conditionSkips.push({
          frame,
          sourceSlotIndex,
          effect: { source: effect.source, effectIndex: effect.effectIndex },
        });
        continue;
      }
      accepted.push(frame);
    }
    const amplified: BuffWindow[] = [];
    // 同じ効果の再発火は上書き延長（和集合）。発動の瞬間の参照の値は、和集合の窓の始まり（その窓を開けた発火）のもの
    for (const [s, e] of unionWindows(accepted, effect.durationFrames, frames)) {
      slots.forEach((target, slotIndex) => {
        if (target === null || !isEffectTarget(effect, sourceSlotIndex, slotIndex, target.character)) return;
        const atStart = activeAt(slotIndex, s);
        if (atStart.length === 0) return;
        const startValue = atStart.reduce((sum, w) => sum + w.effect.value, 0);
        // 参照する窓が効いている所
        const covered: [number, number][] = [];
        for (const w of referenced) {
          if (w.slotIndex !== slotIndex) continue;
          const start = Math.max(s, w.start);
          const end = Math.min(e, w.end);
          if (start >= end) continue;
          covered.push([start, end]);
          amplified.push(
            windowOf(slotIndex, sourceSlotIndex, { ...effect, value: effect.value * w.effect.value }, { start, end }),
          );
        }
        // 切れた所（参照する窓が効いていない所）は、発動の瞬間の値の (1 + 割合) 倍を足す
        let cursor = s;
        for (const [start, end] of covered.sort((a, b) => a[0] - b[0])) {
          if (cursor < start) {
            amplified.push(
              windowOf(
                slotIndex,
                sourceSlotIndex,
                { ...effect, value: (1 + effect.value) * startValue },
                { start: cursor, end: start },
              ),
            );
          }
          cursor = Math.max(cursor, end);
        }
        if (cursor < e) {
          amplified.push(
            windowOf(
              slotIndex,
              sourceSlotIndex,
              { ...effect, value: (1 + effect.value) * startValue },
              { start: cursor, end: e },
            ),
          );
        }
      });
    }
    windows.push(...amplified);
  }

  // 3. 境界
  const bounds = new Set<number>([0, frames]);
  for (const w of windows) {
    bounds.add(w.start);
    bounds.add(w.end);
  }
  if (schedule !== null) {
    for (const w of schedule.fullBurstWindows) {
      bounds.add(w.start);
      bounds.add(w.end);
    }
    for (const a of schedule.activations) bounds.add(a.frame);
  }
  for (const s of landings?.spans ?? []) {
    bounds.add(s.start);
    bounds.add(s.end);
  }
  // 持続の命中率▲（C-0170）: 条件が自動の枠では、コア命中率の N に区間ごとの命中率を使う。着地点の計画があるときだけ、
  // 状態の窓（命中率）の端も境界に足し、区間の状態の buffs.hitRate に持続の▲を足す（plan/design-sustained-hit-rate-core.md）
  const timedHitRateUp = landings !== null && sustainedHitRateUp;
  if (timedHitRateUp) {
    for (const w of stateWindows) {
      bounds.add(w.start);
      bounds.add(w.end);
    }
  }
  let landingIndex = 0;
  const sorted = [...bounds].filter((b) => b >= 0 && b <= frames).sort((a, b) => a - b);

  // 4〜5. 区間ごとに状態を組む
  const segments: TimelineSegment[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (start >= end) continue;
    // 境界にフルバースト区間の端が入っているので、区間の先頭で判定すれば区間全体で同じ値になる
    const fullBurst = schedule !== null && isInFullBurst(schedule, start);
    // Stage 18-C: 着地点の境目も境界に入っているので、区間の先頭の着地点が区間全体の着地点
    const spans = landings?.spans ?? [];
    while (landingIndex + 1 < spans.length && spans[landingIndex]!.end <= start) landingIndex += 1;
    const landing = landings === null ? undefined : (spans[landingIndex]?.landing ?? null);
    const slotStates = passive.map((base) =>
      base === null
        ? null
        : {
            buffs: { ...base.buffs },
            passiveEffects: base.passiveEffects,
            buildEffects: base.buildEffects,
            timedEffects: [] as AppliedTimedEffect[],
          },
    );
    // 窓の発生順に足して浮動小数の加算順を決定的にする
    for (const w of windows) {
      if (w.start > start || w.end <= start) continue;
      const state = slotStates[w.slotIndex];
      if (!state) continue;
      const applied = applyResolvedEffect(state.buffs, w.effect, slots[w.sourceSlotIndex]?.casterBaseAttack ?? 0);
      state.buffs = applied.totals;
      state.timedEffects.push({
        ...w.effect,
        sourceSlotIndex: w.sourceSlotIndex,
        appliedAmount: applied.appliedAmount,
      });
    }
    // 状態の窓は timedEffects には入れない（表示は stateWindows のまま）。buffs.hitRate だけを足す
    if (timedHitRateUp) {
      for (const w of stateWindows) {
        if (w.start > start || w.end <= start) continue;
        const state = slotStates[w.slotIndex];
        if (!state) continue;
        state.buffs = applyResolvedEffect(
          state.buffs,
          w.effect,
          slots[w.sourceSlotIndex]?.casterBaseAttack ?? 0,
        ).totals;
      }
    }
    const segment: TimelineSegment = {
      start,
      end,
      seconds: framesToGameSeconds(end - start),
      fullBurst,
      slots: slotStates,
      slotKeys: slotStates.map((state, i) =>
        state === null ? null : keyOf(fullBurst, state, landings?.autoSlots[i] ? landing : undefined),
      ),
    };
    if (landing !== undefined) segment.landing = landing;
    segments.push(segment);
  }

  return {
    frames,
    segments,
    windows,
    passive,
    heals,
    rankings,
    stateWindows,
    conditionSkips,
    cycleWindows: planCycleWindows(slots, schedule, frames, shots, healsKey),
    applications,
  };
}

/**
 * Stage 11 紅蓮BS: 循環の間隔の変更の窓。対象は常に自分で、同じ効果の再発火は上書き延長（和集合）。
 * 窓の始まりは持続バフと同じ（射撃の回数トリガーは書けないので、発火のフレームから）
 */
function planCycleWindows(
  slots: readonly TimelineSlot[],
  schedule: BurstSchedule | null,
  frames: number,
  shots: readonly (ShotLog | null)[],
  heals: readonly HealRecord[],
): CycleWindow[] {
  const out: CycleWindow[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const e of resolveCycleEvery(slot.definition, slot.character, slot.levels)) {
      const starts = buffStartFrames(e.trigger, schedule, slotIndex, frames, shots, heals);
      for (const [start, end] of unionWindows(starts, e.durationFrames, frames)) {
        out.push({
          slotIndex,
          source: e.source,
          effectIndex: e.effectIndex,
          targetSkill: e.targetSkill,
          every: e.every,
          start,
          end,
        });
      }
    }
  });
  return out.sort((a, b) => a.start - b.start || a.slotIndex - b.slotIndex);
}

function windowOf(
  slotIndex: number,
  sourceSlotIndex: number,
  effect: ResolvedTimedEffect,
  w: { start: number; end: number; stack?: number },
): BuffWindow {
  const window: BuffWindow = { slotIndex, sourceSlotIndex, effect, start: w.start, end: w.end };
  if (w.stack !== undefined) window.stack = w.stack;
  return window;
}

/** 順位の材料（skills/ranking.ts）。常時パッシブは resolvePassiveStates の結果 */
export function rankSlotsOf(slots: readonly TimelineSlot[], passive: readonly (SlotBuffState | null)[]): RankSlot[] {
  return slots.map((slot, i) =>
    slot === null
      ? null
      : {
          casterBaseAttack: slot.casterBaseAttack,
          weaponType: slot.character.weaponType,
          element: slot.character.element,
          passive: passive[i]?.buffs ?? ZERO_BUFFS,
        },
  );
}

/**
 * 枠 slotIndex について、バフ状態が同じ区間をまとめる（出現順）。calc はこの単位で計算する。
 * 空枠なら空配列。持続バフがなければ「通常区間 / フルバースト区間」の 2 つに退化する。
 */
export function groupTimeline(timeline: BuffTimeline, slotIndex: number): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const byKey = new Map<string, TimelineGroup>();
  for (const segment of timeline.segments) {
    const key = segment.slotKeys[slotIndex];
    const state = segment.slots[slotIndex];
    if (key === null || key === undefined || state === undefined || state === null) continue;
    const found = byKey.get(key);
    if (found !== undefined) {
      found.seconds += segment.seconds;
      found.segments.push(segment);
      continue;
    }
    const group: TimelineGroup = {
      key,
      fullBurst: segment.fullBurst,
      state,
      seconds: segment.seconds,
      segments: [segment],
    };
    if (segment.landing !== undefined) group.landing = segment.landing;
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

export type FrameRange = { start: number; end: number };

/** Stage 18-C: planBuffTimeline に渡す着地点（frame/landing.ts の LandingPlan の一部） */
export type TimelineLandings = {
  spans: readonly { start: number; end: number; landing: string | null }[];
  /** 枠ごと: 条件が自動か（鍵に着地点を入れる枠） */
  autoSlots: readonly boolean[];
};

/** 連続する区間をひとつなぎにする（表示用）。他の枠のバフ切り替えで割れた境界を畳む */
export function mergeAdjacentRanges(ranges: readonly FrameRange[]): FrameRange[] {
  const merged: FrameRange[] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last !== undefined && last.end === r.start) {
      last.end = r.end;
      continue;
    }
    merged.push({ start: r.start, end: r.end });
  }
  return merged;
}

/** フレーム frame を含む区間の添字。範囲外なら -1 */
export function segmentIndexAt(timeline: BuffTimeline, frame: number): number {
  return timeline.segments.findIndex((s) => s.start <= frame && frame < s.end);
}
