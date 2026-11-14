// 持続バフのタイムライン（純関数）。1 パス目の件の一覧（skills/holders.ts）の履歴から、区間とグループを作る。
// ここに置くもの: 区間の組み立て、件を作る関数、トリガーの発火の列、常時の効果の分配、同じバフ状態の区間のまとめ。
// 履歴から区間を作る入口は skills/holders/history.ts の buffTimelineOf。
//
// 流れ: トリガーの発火フレーム → 件 [start, end)（同じ効果の再発火は和集合 = 上書き延長）
//       → 境界を集めて区間に割る → 区間ごとに枠の BuffTotals を作る → 同じバフ状態の区間をグループにまとめる。
// sim の 2 パス目は区間ごとに 1 トリガーの値を出す。timed 効果が 1 つもなければ、グループは「通常区間 / フルバースト区間」の 2 つ。
// 状態だけの stat（命中率）は区間の timedEffects に入れない。着地点の計画があるときだけ、区間の buffs.hitRate に足し、
// 自動の枠の鍵に入れる（C-0170。コア命中率の N）。
import { effectFrameOf, isInFullBurst, type BurstSchedule } from '../burst/schedule.ts';
import type { BuildEffect } from '../buildEffects.ts';
import { lowerBound, type ShotLog } from '../frame/shots.ts';
import type { CharacterData } from '../types.ts';
import { framesToGameSeconds, gameSecondsToFirstFrame } from '../time.ts';
import { ZERO_BUFFS, addRatioBuff, applyResolvedEffect, fixedAttackBaseOf, type BuffTotals } from './buffs.ts';
import {
  isResolvedShotCount,
  isResolvedTimer,
  isStateContent,
  resolvePassives,
  type AppliedEffect,
  type AppliedTimedEffect,
  type ResolvedEffect,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
  type SkillLevels,
  type ItemEffect,
} from './resolve.ts';
import type { RankSlot } from './ranking.ts';
import type { TimerTrigger } from './types.ts';
import type { ResolvedPeriodShorten } from './burstDamage.ts';
import { refreshAll, stackItems, type StackItem } from './stacks.ts';
import { isEffectTarget } from './targets.ts';
import {
  replayEvents,
  trackTriggerFires,
  type FrameEvents,
  type HealRecord,
  type ShotCountEveryAt,
  type TriggerFire,
} from './triggers.ts';
import type { NamedStateId } from './states.ts';
import { SKILL_SLOTS, isHitStateStat, isMaxHpStat, isStateStat, type BuffStat, type SkillDefinition } from './types.ts';

/** 枠 1 つ分の入力。TeamSlotInput ではなく必要な情報だけを受けて循環 import を避ける（planFixedCycle と同じ流儀） */
export type TimelineSlot = {
  character: CharacterData;
  /** null = 定義ファイルなし。自分の効果は出ないが、味方の allies 効果は受ける */
  definition: SkillDefinition | null;
  levels: SkillLevels;
  /** 発動者基準の固定加算に使うバフ前攻撃力（damage.ts の baseAttackOf と同じ値） */
  casterBaseAttack: number;
  /**
   * 発動者のバフ前の最大HP（damage.ts の baseMaxHpOf。plan/design-skill-stage6.md 1.2・1.3・2.4 節）。casterFinalMaxHp の
   * 固定加算は、これに最大HP▲ の件を足した最終最大HP を、区間の頭・順位のフレームで読む。省略して casterFinalMaxHp の効果を配ると RangeError
   */
  casterMaxHp?: number;
  /**
   * 枠のバフ前の防御力（damage.ts の baseDefenceOf。plan/design-skill-stage7.md 1.2 節）。最終防御力（これに防御力▲ の
   * 件を足した値）は、対象の絞り込み「自分より最終防御力が低い味方」が発火のフレームで比べる。省略して比べると RangeError
   */
  baseDefence?: number;
  /**
   * 枠の HP の割合の想定（TeamSlotInput.hpRatio。省略 1。plan/design-mast.md 8 節）。HP の割合の窓のきっかけ（{ selfHpAtMost }）が、
   * 最大HP▲・最大HP のみ▲ の件で割合を下げて読む（skills/holders/views.ts の selfHpRatioAt）
   */
  hpRatio?: number;
  /** 育成入力の効果層（OL・キューブ・コレクション）。自分だけに効く常時バフ。省略は無し */
  buildEffects?: readonly BuildEffect[];
  /** 命中率（射撃場 = 1 の相対値。省略 1）。1 パス目のゲージと normalHit の回数に使う */
  hitRate?: number;
  /** 手入力のコア命中率（省略 0）。coreHit の回数に使う（plan/design-ludmilla-wo.md 2.2 節） */
  coreHitRate?: number;
} | null;

/**
 * 条件「自分が 〈stat〉 増加状態なら」を満たさずに発火しなかった記録（不発）。即時効果の使った段階の違う
 * 発火と、戦闘中の発火の回数の上限の後の発火も
 */
export type ConditionSkip = {
  /** トリガーが起きたフレーム */
  frame: number;
  sourceSlotIndex: number;
  effect: { source: ResolvedEffect['source']; effectIndex: number };
  /** 条件つきの付与なら、付けなかった状態（中身の効果の表示で状態ごとに数える） */
  state?: NamedStateId;
};

/** 枠ごとのバフ合計と、そこに効いた効果（発生順） */
export type SlotBuffState = {
  buffs: BuffTotals;
  /** 常時パッシブの分 */
  passiveEffects: AppliedEffect[];
  /** 育成入力の効果層（OL・キューブ・コレクション）の分。常時 */
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
   * 区間の着地点（着地点か配分の id、null = 未測定）。着地点の計画を渡したときだけ持つ
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

/**
 * バフの区間と常時の値（plan/design-holder-effects.md 2.9 節）。効果の件・値の小片・記録は、
 * 1 パス目の履歴（skills/holders/types.ts の HolderHistory）を読む
 */
export type BuffTimeline = {
  frames: number;
  /** [0, frames) を隙間・重なりなく覆う */
  segments: TimelineSegment[];
  /** 常時パッシブだけの状態（resolvePassiveStates）。空枠は null */
  passive: (SlotBuffState | null)[];
};

/**
 * 状態が枠に付いた記録（1 パス目の履歴の applications。plan/design-persona.md 3.3 節）。state は
 * 目録の id。どの段の付与からも作る（静的な付与はフレーム 0）。付き直し（件が続いている間の再発火）も 1 回ずつ記録する。トリガー
 * { applied: 状態 } の発火に使う（frame/plan.ts）
 */
export type AppliedRecord = { frame: number; state: NamedStateId; sourceSlotIndex: number; slotIndex: number };

/** 枠 slotIndex に状態 state が付いたフレーム（昇順。同じフレームに 2 つの出どころから付いても 1 回） */
export function appliedFrames(
  history: { readonly applications: readonly AppliedRecord[] },
  state: NamedStateId,
  slotIndex: number,
): number[] {
  const frames = history.applications.filter((a) => a.state === state && a.slotIndex === slotIndex).map((a) => a.frame);
  return [...new Set(frames)].sort((a, b) => a - b);
}

/** 1 枠ぶんの「同じバフ状態の区間」をまとめたもの（groupTimeline） */
export type TimelineGroup = {
  key: string;
  fullBurst: boolean;
  /** その枠の状態（グループ内のどの区間でも同じ） */
  state: SlotBuffState;
  /** この状態でいた合計秒数 */
  seconds: number;
  /** 含まれる区間（出現順） */
  segments: TimelineSegment[];
  /** 着地点（条件が自動の枠は鍵に入るのでグループ内で同じ。それ以外は最初の区間の値） */
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
  // チャージダメージ倍率
  'chargeDamageMultiplier',
  'distributedDamage',
  // 蓄積して爆発するダメージ: 蓄積爆破の蓄積割合▲（2 パス目が溜める発の値に掛ける）
  'accumulateRatio',
  // 敵の受けるダメージ▲
  'damageTaken',
  // 敵の防御力▼
  'enemyDefenseDown',
  // 発動者基準の敵の防御力▼
  'enemyDefenseDownFlat',
  // 発射体爆発ダメージ▲とチャージ時間の固定
  'projectileExplosionDamage',
  // 発射体付着ダメージ▲と有利コードのダメージ適用
  'projectileStickDamage',
  'elementAdvantage',
  // 持続ダメージ▲
  'sustainedDamage',
  'burstGaugeSpeed',
  'maxAmmoRatio',
  'maxAmmoFlat',
  'reloadSpeed',
  'reloadRatio',
  'chargeSpeed',
  // チャージ速度の超過分の変換（常時だけ。区間の値に入るので鍵に入れる）
  'chargeSpeedOverflow',
  // 攻撃速度▲（射撃が変わるので鍵に入れる）
  'attackSpeed',
  // 立ち上げ速度▲（射撃が変わるので鍵に入れる）
  'spinUpSpeed',
  'chargeTimeFlat',
  'fixedChargeTime',
  'fireStanceScale',
  // 装弾数無限は射撃が変わるので鍵に入れる。命中率（hitRate）は条件が自動の枠だけ keyOf で足す
  'infiniteAmmo',
  // 効果層（常時）では区間を割らないが、スキルの timed にも書けるので鍵に入れる
  'elementDamage',
  'coreDamage',
  'normalAttackDamage',
  // 通常攻撃のクリティカル確率
  'normalCritRate',
  // 貫通特化と貫通ダメージ▲（適正最小射程距離▲ は条件が自動の枠だけ keyOf で足す）
  'pierce',
  'pierceDamage',
  // ペレットの数（与ダメージは変えないが、照合の 1 ペレットの値が区間ごとに読む）
  'pelletCount',
  'singlePellet',
] as const satisfies readonly (keyof BuffTotals)[];

/** key の桁数。最下位ビットのずれで同一状態が別グループに割れないよう固定桁で文字列化する */
export const KEY_DIGITS = 6;

function keyOf(fullBurst: boolean, state: SlotBuffState, landing?: string | null): string {
  const parts: string[] = [fullBurst ? 'FB' : '--'];
  for (const field of BUFF_FIELDS) parts.push(state.buffs[field].toFixed(KEY_DIGITS));
  // 使用武器の変更は武器ごとに別の状態
  if (state.buffs.weapon !== null) parts.push(`W:${state.buffs.weapon.id}`);
  // 効いている効果の出どころも鍵に入れる。合計が同じでも別の効果なら別の状態として扱い、UI のラベルが混ざらないようにする
  // （例: クイーン（真）の battleStart と fullBurstEnd はどちらも攻撃力 +50.28%）。状態の中身は中身の番号まで。
  // 区間の中の効果は時刻の順に並ぶので、鍵では定義の順
  // （出どころの枠 → スロット → 効果 → 中身）に並べ直す（同じ効果の組なら、付いた順によらず同じ状態。plan/design-holder-effects.md 2.6 節）
  const effects = state.timedEffects
    .map((e) => ({ e, sub: isStateContent(e) ? e.subIndex : -1 }))
    .sort(
      (a, b) =>
        a.e.sourceSlotIndex - b.e.sourceSlotIndex ||
        SKILL_SLOTS.indexOf(a.e.source.skill) - SKILL_SLOTS.indexOf(b.e.source.skill) ||
        a.e.effectIndex - b.e.effectIndex ||
        a.sub - b.sub,
    );
  for (const { e } of effects) {
    parts.push(`${e.sourceSlotIndex}.${e.source.skill}.${e.effectIndex}${isStateContent(e) ? `.${e.subIndex}` : ''}`);
  }
  // 条件が自動の枠だけ、着地点も鍵に入れる（手入力の枠のグループは今と同じ）。
  // 持続の命中率▲（C-0170）もコア命中率を変えるので、自動の枠だけ命中率の合計を鍵に入れる。▲があれば▲の側の和も入れる（和が
  // 同じでも▲と同時か▼だけかで▼の表を使うかが変わる。frame/landing.ts の coreHitRateAt）
  if (landing !== undefined) {
    parts.push(`L:${landing ?? '?'}`, `N:${state.buffs.hitRate.toFixed(KEY_DIGITS)}`);
    if (state.buffs.hitRateUp !== 0) parts.push(`U:${state.buffs.hitRateUp.toFixed(KEY_DIGITS)}`);
    // 適正最小射程距離▲ も距離ボーナスを変える（frame/landing.ts の landingPartsWith）
    if (state.buffs.minEffectiveRange !== 0) parts.push(`R:${state.buffs.minEffectiveRange.toFixed(KEY_DIGITS)}`);
  }
  return parts.join('|');
}

/**
 * 同じ射撃の列・時刻表で何度も呼ばれる（効果ごと）ので、直前の出来事の列を使い回す。
 * 回復の記録（heals）も鍵に入れる（回復の無い列と有る列は別物）。どれも参照の一致で見る
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
 * 射撃の回数は shots[slotIndex] の every・2 × every…番目の射撃のフレーム。件の始まりは skills/holders/items.ts の startOfFire が 1 つ後ろにずらす。
 * 判定は skills/triggers.ts の TriggerTracker（1 パス目のフレームループと共通）に出来事の列を流し直して行う。
 */
export function triggerFrames(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
  /** 射撃の回数のきっかけの間隔の変更（skills/triggers.ts の everyAtOf） */
  everyAt?: ShotCountEveryAt,
): number[] {
  return triggerFires(trigger, schedule, slotIndex, frames, shots, heals, everyAt).map((f) => f.frame);
}

/** triggerFrames の文脈つき版（対象 burstUsers の判定に使う）。heals は healed の出来事（1 パス目の履歴の heals） */
export function triggerFires(
  trigger: ResolvedTrigger,
  schedule: BurstSchedule | null,
  slotIndex: number,
  frames: number,
  shots: readonly (ShotLog | null)[] = [],
  heals: readonly HealRecord[] = NO_HEALS,
  everyAt?: ShotCountEveryAt,
): TriggerFire[] {
  // 時間の周期のトリガーは、出来事の列を使わずに戦闘開始から k × N 秒のフレームを並べる
  // atStart なら戦闘開始時（フレーム 0）にも発火する
  if (isResolvedTimer(trigger)) {
    const timer = timerFramesOf(trigger, frames);
    const all = 'atStart' in trigger && trigger.atStart === true && frames > 0 ? [0, ...timer] : timer;
    return all.map((frame) => ({ frame, context: null }));
  }
  return trackTriggerFires(trigger, slotIndex, schedule, eventsOf(schedule, shots, frames, heals), everyAt);
}

/**
 * 時間の周期のトリガーの発火フレーム。戦闘開始から k × ceil(N ÷ 0.017) フレーム（k = 1, 2, …）で、
 * 戦闘の終わり（frames）より前だけ（plan/design-nihilister.md 8.1 節。C-0091）。発動のたびに N 秒に達した最初のフレームを数え直し、
 * 端数を持ち越さない（C-0502。plan/design-timer-ceil.md）。
 * carry なら端数を持ち越し、k 回目を k × N 秒に達した最初の
 * フレーム（ceil(k × N ÷ 0.017)）にする（マリアン：クイーンの S1 の槍。V-0538。plan/design-new-chars-1029.md 10.2 節の a）
 */
export function timerFrames(everySeconds: number, frames: number, carry = false): number[] {
  const fires: number[] = [];
  // V-0086: 戦闘の最後のフレーム（180 秒の戦闘では 179.996 秒）より後の時刻（180 秒ちょうどの発火など）は、戦闘の終わりで起きない
  const lastFrameSeconds = framesToGameSeconds(frames - 1) + 1e-9;
  for (let k = 1; ; k++) {
    const seconds = k * everySeconds;
    const frame = carry ? gameSecondsToFirstFrame(seconds) : k * gameSecondsToFirstFrame(everySeconds);
    if (frame >= frames || seconds > lastFrameSeconds) return fires;
    fires.push(frame);
  }
}

/** 時間の周期のトリガーの発火フレーム（carry を見る timerFrames） */
export function timerFramesOf(trigger: TimerTrigger, frames: number): number[] {
  return timerFrames(trigger.everySeconds, frames, trigger.carry === true);
}

/**
 * 状態の間だけ縮む周期の発火フレーム（plan/design-new-chars-1029.md 5.3 節・10.2 節の f）。前の発動
 * （初めは戦闘開始）のフレームで shortened(frame) なら次の発動までを everySeconds − shortenSeconds 秒にする。ただし縮めた次の発動の
 * フレームでもう shortened でなければ（縮めた周期の間に状態が切れた）、縮めない周期に戻す（V-0538）。どちらも timerFrames と
 * 同じく N 秒に達した最初のフレームを数え直し（carry なら端数を持ち越して秒で足す）、縮めない間は timerFrames と同じ列になる
 */
export function shortenedTimerFrames(
  trigger: TimerTrigger,
  shortenSeconds: number,
  frames: number,
  shortened: (frame: number) => boolean,
  nextOnly = false,
): number[] {
  const fires = shortenedTimer(trigger, shortenSeconds, frames, shortened, nextOnly);
  const out: number[] = [];
  for (let f = 0; f < frames; f++) if (fires(f)) out.push(f);
  return out;
}

/**
 * V-0545（plan/design-new-chars-1029.md 11.2 節の b）: shortenedTimerFrames の規則を、フレームの順に決める形にしたもの。返す関数は
 * 0 から frames − 1 まで順に呼び、そのフレームに発動すれば true。shortened は戦闘開始・発動のフレームと、縮めた次の発動のフレームに
 * だけ、そのフレームで呼ぶ。1 パス目（frame/firstPass.ts）が、そのフレームまでに分かった状態で周期のゲージを追うのに使う。
 * nextOnly なら、前の発動のフレームは見ず、縮めた次の発動のフレームで shortened なら縮める（名前の無い
 * 窓の periodShorten。エイダの閃光手榴弾投擲は、窓が始まると次の発動が前の発動から縮めた周期の所に来る。V-0569）
 */
export function shortenedTimer(
  trigger: TimerTrigger,
  shortenSeconds: number,
  frames: number,
  shortened: (frame: number) => boolean,
  nextOnly = false,
): (frame: number) => boolean {
  const { everySeconds } = trigger;
  const short = everySeconds - shortenSeconds;
  const lastFrameSeconds = framesToGameSeconds(frames - 1) + 1e-9;
  let frame = 0;
  let seconds = 0;
  let shortFrame: number | undefined;
  let longFrame = 0;
  const after = (period: number) =>
    trigger.carry === true ? gameSecondsToFirstFrame(seconds + period) : frame + gameSecondsToFirstFrame(period);
  const plan = () => {
    shortFrame = nextOnly || shortened(frame) ? after(short) : undefined;
    longFrame = after(everySeconds);
  };
  plan();
  return (f) => {
    // 縮めた次の発動のフレームでもう状態でなければ、縮めない周期の発動を待つ。秒が戦闘の終わりを越えた発動は出さず、その後は
    // 予定のフレームがどれも過ぎているので発動しない
    const period = shortFrame === f && shortened(f) ? short : longFrame === f ? everySeconds : undefined;
    if (period === undefined || seconds + period > lastFrameSeconds) return false;
    seconds += period;
    frame = f;
    plan();
    return true;
  };
}

/**
 * 周期のきっかけの倍率ダメージの発火のフレーム（2 パス目。frame/plan.ts。plan/design-skill-stage15.md 2.3 節。V-0569）。
 * 周期の短縮（periodShorten）があれば縮めた周期で並べる。state は自分の状態（selfState）、窓は自分のバースト使用（バーストの効果が付く
 * フレーム。burstUse のきっかけと同じ）から durationFrames の間で、縮めた次の発動のフレームだけで見る
 */
export function timerDamageFrames(
  trigger: TimerTrigger,
  shorten: ResolvedPeriodShorten | undefined,
  frames: number,
  schedule: BurstSchedule | null,
  slotIndex: number,
  selfState: (state: NamedStateId, frame: number) => boolean,
): number[] {
  if (shorten === undefined) return timerFramesOf(trigger, frames);
  const { state, window } = shorten;
  if (window === undefined) return shortenedTimerFrames(trigger, shorten.seconds, frames, (f) => selfState(state, f));
  const starts = (schedule?.activations ?? []).filter((a) => a.slotIndex === slotIndex).map(effectFrameOf);
  if (window.elapsed === true)
    return elapsedShortenedTimerFrames(trigger, shorten.seconds, frames, starts, window.durationFrames);
  const inWindow = (f: number) => starts.some((s) => s <= f && f < s + window.durationFrames);
  return shortenedTimerFrames(trigger, shorten.seconds, frames, inWindow, true);
}

/**
 * クールタイムを縮める窓の周期の発火フレーム（ドロシーの発現。plan/design-skill-stage18.md 2.2 節。V-0612）。
 * 発動のフレーム f（初めは戦闘開始の 0）の次の発動は、f が窓の中なら f + 縮めた周期、外なら f + 縮めない周期。窓が始まったフレーム s では、
 * 次の発動を s + 縮めた周期に早める（もっと早い予定ならそのまま）。周期はどれも gameSecondsToFirstFrame（端数は持ち越さない）。窓の終わりを
 * 越えた発動も、窓の中の発動から縮めた周期で来る（V-0612。窓の 5 回目）
 */
export function elapsedShortenedTimerFrames(
  trigger: TimerTrigger,
  shortenSeconds: number,
  frames: number,
  windowStarts: readonly number[],
  durationFrames: number,
): number[] {
  const short = gameSecondsToFirstFrame(trigger.everySeconds - shortenSeconds);
  const inWindow = (f: number) => windowStarts.some((s) => s <= f && f < s + durationFrames);
  const starts = new Set(windowStarts);
  const tick = cooldownTimer(gameSecondsToFirstFrame(trigger.everySeconds));
  const out: number[] = [];
  for (let f = 1; f < frames; f++) {
    if (tick(f, starts.has(f) ? short : undefined, () => (inWindow(f) ? short : undefined))) out.push(f);
  }
  return out;
}

/**
 * クールタイムを縮める窓の規則（ドロシーの発現の elapsed・魔術師のカードの skillCooldownDown。plan/design-arcana-magician.md 2.1・2.3 節）を、
 * フレームの順に決める形にしたもの。返す関数は 1 から順にフレームごとに呼び、そのフレームに発動すれば true。started はそのフレームに
 * 窓が始まった（縮める状態が付いた）ならその縮めた周期のフレーム数、held はそのフレームが窓の中ならその縮めた周期のフレーム数（発動の
 * フレームでだけ呼ぶ。どちらも無ければ undefined）。次の発動（初めは long）を、窓が始まったフレーム s で s + started に早め（もっと早い
 * 予定ならそのまま）、発動のフレーム f の次は f + held（窓の外なら f + long）。
 * 同じフレームは始まりを先に見る。窓の終わりを越えた発動も、窓の中の発動から縮めた周期で
 * 来る（T4 の「終わっても残りは戻らず」。C-0848・C-1055）。
 * keep はそのフレームに残り（次の発動 − f）に掛ける割合（即時の「スキル N のクールタイム X%▼」の 1 − X / 100。plan/design-centi.md 2.1 節）。
 * そのフレームの発動の後に当てる。残りは端数を持ち、発動は次の発動の時刻に達した最初のフレーム
 */
export function cooldownTimer(
  long: number,
): (f: number, started: number | undefined, held: () => number | undefined, keep?: number) => boolean {
  let next = long;
  return (f, started, held, keep) => {
    if (started !== undefined) next = Math.min(next, f + started);
    const fired = f >= next;
    if (fired) next = f + (held() ?? long);
    if (keep !== undefined) next = f + (next - f) * keep;
    return fired;
  };
}

/**
 * 使用武器の変更の窓の頭を何フレーム削るか。バースト系の発火（f）で付く窓 [f, f + d) を、射手が持ち替えるフレーム
 * （f + 1。frame/firstPass.ts の射手が見る窓の規則）から始める。発火のフレームの射撃は基礎の武器で撃たれるので、その 1 発を
 * 変更後の武器のダメージで数えないため。終わりは変えない（同じ発動の装弾数無限と同じフレームに切れる）。
 * 射撃の回数トリガー（窓がもともと f + 1 から）と戦闘開始時（ループの前に登録）は削らない
 */
export function weaponStartTrim(effect: Pick<ResolvedTimedEffect, 'trigger'> & { stat?: BuffStat | 'weapon' }): number {
  return effect.stat === 'weapon' && effect.trigger !== 'battleStart' && !isResolvedShotCount(effect.trigger) ? 1 : 0;
}

/** 効果 1 つの件（スタックする効果は段ごと、しない効果は和集合。使用武器の変更は頭を削る） */
export function effectItems(
  starts: readonly number[],
  effect: Pick<ResolvedTimedEffect, 'durationFrames' | 'maxStacks' | 'trigger'> & { stat?: BuffStat | 'weapon' },
  frames: number,
): { start: number; end: number; stack?: number }[] {
  if (effect.maxStacks !== undefined) return stackItems(starts, effect.durationFrames, frames, effect.maxStacks);
  const trim = weaponStartTrim(effect);
  return unionItems(starts, effect.durationFrames, frames)
    .map(([start, end]) => ({ start: start + trim, end }))
    .filter((w) => w.start < w.end);
}

/** 始まり s から数えた持ち主の N 発目の射撃のフレーム + 1（N 発目にも効く）。N 発を撃つ前に戦闘が終われば frames */
function nthShotEnd(s: number, shotFrames: readonly number[], shots: number, frames: number): number {
  const nth = shotFrames[lowerBound(shotFrames, s) + shots - 1];
  return nth === undefined ? frames : Math.min(nth + 1, frames);
}

/**
 * 「N 発間維持」の件。始まり s から、s 以降の N 発目の射撃のフレーム + 1 まで（nthShotEnd）。
 * 維持中にまた付いたら、そこから数え直す（和集合。秒の維持の上書き延長に合わせる）
 */
export function shotCountItems(
  starts: readonly number[],
  shotFrames: readonly number[],
  shots: number,
  frames: number,
): [number, number][] {
  const merged: [number, number][] = [];
  for (const s of [...starts].sort((a, b) => a - b)) {
    if (s >= frames) continue;
    const end = nthShotEnd(s, shotFrames, shots, frames);
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
 * スタックする「N 発間維持」の件（plan/design-zwei.md 2.3 節の L1。V-0718）。秒の維持のスタックと同じ規則（refreshAll）で、
 * 件の終わりを持ち主の N 発目 + 1 にする。前の件の終わり（持ち主の N 発目の次のフレーム）以降に付いたものは、段 1 から数え直す
 */
export function shotCountStackItems(
  starts: readonly number[],
  shotFrames: readonly number[],
  shots: number,
  frames: number,
  maxStacks: number,
): StackItem[] {
  const sorted = starts.filter((s) => s < frames).sort((a, b) => a - b);
  return refreshAll(sorted, (s) => nthShotEnd(s, shotFrames, shots, frames), frames, maxStacks, [], true);
}

/**
 * 「命中させた味方に」の件の始まり（plan/design-killer-wife.md 2.2 節）。発火 s ごとに、[s, s + withinFrames) の持ち主の
 * 最初の射撃 f の次のフレーム（f 自身には乗らない）。無ければ付かない。件は秒の維持の件（effectItems）と同じに作るので、その後の
 * 射撃では付き直さない
 */
export function holderHitStarts(
  starts: readonly number[],
  shotFrames: readonly number[],
  withinFrames: number,
): number[] {
  return starts.flatMap((s) => {
    const hit = shotFrames[lowerBound(shotFrames, s)];
    return hit !== undefined && hit < s + withinFrames ? [hit + 1] : [];
  });
}

/**
 * 出来事で終わる件。始まり s から、s より後の最初の終わり（ends。昇順）まで（無ければ frames まで）。維持中にまた付いたら和集合。
 * 撃ち切りで終わる使用武器の変更（ends は 1 パス目の
 * ShotLog.weaponChangeEnds。1 パス目は開いている件に重ねて付いても撃ち切りまで変えない。plan/design-true-damage-element.md 9 節）。
 * 「解除条件：フルバーストタイムが終了した時」（ends はフルバーストの終わり）
 */
export function untilNextEndItems(
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
 * 同一効果の件を和集合にする（上書き延長。重ねない）。frames が上限。durations は始まり → 維持のフレーム数（無い始まりは
 * durationFrames。同じ状態の維持の違う付与。付いている間に短い付与が付いても窓は短くならない。plan/design-rosanna.md 2 節）
 */
export function unionItems(
  fireFrames: readonly number[],
  durationFrames: number,
  frames: number,
  durations?: ReadonlyMap<number, number>,
): [number, number][] {
  const merged: [number, number][] = [];
  for (const f of [...fireFrames].sort((a, b) => a - b)) {
    const d = durations?.get(f) ?? durationFrames;
    if (f >= frames || d <= 0) continue;
    const end = Math.min(f + d, frames);
    const last = merged[merged.length - 1];
    if (last !== undefined && f <= last[1]) {
      if (end > last[1]) last[1] = end;
      continue;
    }
    merged.push([f, end]);
  }
  return merged;
}

type PassiveSource = { slotIndex: number; casterBaseAttack: number; casterMaxHp?: number; effect: ResolvedEffect };

const NO_BUILD_EFFECTS: readonly BuildEffect[] = Object.freeze([]);

/**
 * 常時パッシブだけの状態（team.ts の resolveTeamBuffs と同じ結果になる）。空枠は null。
 * 育成入力の効果層（TimelineSlot.buildEffects）はスキルの passive の後に、その枠自身へ比率で足す
 */
export function resolvePassiveStates(slots: readonly TimelineSlot[]): (SlotBuffState | null)[] {
  const sources: PassiveSource[] = [];
  slots.forEach((slot, slotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const effect of resolvePassives(slot.definition, slot.character, slot.levels)) {
      sources.push({ slotIndex, casterBaseAttack: slot.casterBaseAttack, casterMaxHp: slot.casterMaxHp, effect });
    }
  });
  // 発動者の最終最大HP は、発動者の常時の最大HP▲ を入れた値（plan/design-skill-stage6.md 2.4 節）
  const passiveMaxHp = slots.map((slot, holder) =>
    slot === null
      ? 0
      : sources
          .filter((s) => isMaxHpStat(s.effect.stat) && isEffectTarget(s.effect, s.slotIndex, holder, slot.character))
          .reduce((sum, s) => sum + s.effect.value, 0),
  );
  return slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = { ...ZERO_BUFFS };
    const passiveEffects: AppliedEffect[] = [];
    for (const { slotIndex, casterBaseAttack, casterMaxHp, effect } of sources) {
      if (!isEffectTarget(effect, slotIndex, index, slot.character)) continue;
      const finalMaxHp = casterMaxHp === undefined ? undefined : casterMaxHp * (1 + passiveMaxHp[slotIndex]!);
      const applied = applyResolvedEffect(
        buffs,
        effect,
        fixedAttackBaseOf(effect, casterBaseAttack, slots),
        finalMaxHp,
      );
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

/** 区間の組み立ての入力（持ち主ごとの一覧の履歴から skills/holders/history.ts の buffTimelineOf が渡す） */
export type SegmentInput = {
  slots: readonly TimelineSlot[];
  schedule: BurstSchedule | null;
  frames: number;
  /**
   * 値の小片（skills/holders/history.ts の valuePiecesOf。plan/design-holder-effects.md 2.9 節）。区間の値は、この並びの
   * 順に足す（浮動小数の加算順）。状態だけの stat（命中率）の小片は、着地点の計画があり持続の命中率▲を使う時だけ区間に足す
   */
  pieces: readonly SegmentPiece[];
  passive: readonly (SlotBuffState | null)[];
  landings: TimelineLandings | null;
  sustainedHitRateUp: boolean;
};

/** 区間に足す値の小片の形（skills/holders/history.ts の ValuePiece）。値を足す枠に、出どころの枠の効果が [start, end) で効く */
export type SegmentPiece = {
  slotIndex: number;
  sourceSlotIndex: number;
  effect: ItemEffect;
  start: number;
  end: number;
};

/**
 * 値の小片から区間を組む。境界は {0, frames} ∪ 小片の端 ∪ フルバースト区間の端 ∪ バースト発動フレーム ∪ 着地点の
 * 境目（と、持続の命中率▲を区間に足すときは状態だけの stat の小片の端）。区間ごとに、常時パッシブに、区間の頭で効いている小片を
 * 並びの順に足す（状態だけの stat の小片は、ほかの小片の後に足す）
 */
export function buildSegments(input: SegmentInput): TimelineSegment[] {
  const { slots, schedule, frames, pieces, passive, landings, sustainedHitRateUp } = input;
  const buffPieces = pieces.filter((p) => !isStateStat(p.effect.stat));
  const statePieces = pieces.filter((p) => isStateStat(p.effect.stat));
  // 3. 境界
  const bounds = new Set<number>([0, frames]);
  for (const p of buffPieces) {
    bounds.add(p.start);
    bounds.add(p.end);
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
  // 状態だけの stat（命中率）の小片の端も境界に足し、区間の状態の buffs.hitRate に持続の▲を足す（plan/design-sustained-hit-rate-core.md）。
  // 適正最小射程距離▲ も、着地点の計画があれば同じに足す（命中率の切り替え sustainedHitRateUp には依らない）
  const landingStatePieces =
    landings === null ? [] : statePieces.filter((p) => sustainedHitRateUp || !isHitStateStat(p.effect.stat));
  for (const p of landingStatePieces) {
    bounds.add(p.start);
    bounds.add(p.end);
  }
  let landingIndex = 0;
  const sorted = [...bounds].filter((b) => b >= 0 && b <= frames).sort((a, b) => a - b);

  // 4〜5. 区間ごとに状態を組む。区間の頭で効いている小片は、始まりの順に入れて終わったものを外す走査で引き、足す順は並びの順にする
  // （小片が多い確率の状態で、区間 × 小片の二重の走査にしない。plan/design-tove-base.md 6 節）
  const buffActive = activePieceSweep(buffPieces);
  const stateActive = activePieceSweep(landingStatePieces);
  const segments: TimelineSegment[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const start = sorted[i]!;
    const end = sorted[i + 1]!;
    if (start >= end) continue;
    const activeBuffs = buffActive(start);
    // 境界にフルバースト区間の端が入っているので、区間の先頭で判定すれば区間全体で同じ値になる
    const fullBurst = schedule !== null && isInFullBurst(schedule, start);
    // 着地点の境目も境界に入っているので、区間の先頭の着地点が区間全体の着地点
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
    // 発動者の最終最大HP の読み直し（plan/design-skill-stage6.md 2.4 節）。区間の頭の、枠ごとの最大HP▲ の和
    // （常時 + 区間の頭で効いている小片）。最大HP▲ の小片の端は区間の境目なので、区間の中では同じ値
    const maxHpUp = passive.map((base) => base?.buffs.maxHpRatio ?? 0);
    for (const p of activeBuffs) {
      if (!isMaxHpStat(p.effect.stat)) continue;
      maxHpUp[p.slotIndex] = (maxHpUp[p.slotIndex] ?? 0) + p.effect.value;
    }
    const finalMaxHpOf = (slotIndex: number): number | undefined => {
      const base = slots[slotIndex]?.casterMaxHp;
      return base === undefined ? undefined : base * (1 + (maxHpUp[slotIndex] ?? 0));
    };
    // 値の小片の並びの順に足して浮動小数の加算順を決定的にする（並びは時刻の順。plan/design-holder-effects.md 論点 5）
    for (const p of activeBuffs) {
      const state = slotStates[p.slotIndex];
      if (!state) continue;
      const caster = slots[p.sourceSlotIndex];
      const applied = applyResolvedEffect(
        state.buffs,
        p.effect,
        fixedAttackBaseOf(p.effect, caster?.casterBaseAttack ?? 0, slots),
        finalMaxHpOf(p.sourceSlotIndex),
        caster?.baseDefence,
      );
      state.buffs = applied.totals;
      state.timedEffects.push({
        ...p.effect,
        sourceSlotIndex: p.sourceSlotIndex,
        appliedAmount: applied.appliedAmount,
      });
    }
    // 状態だけの stat の小片は timedEffects には入れない（表示は履歴の値の小片から作る）。buffs.hitRate・minEffectiveRange だけを足す
    for (const p of stateActive(start)) {
      const state = slotStates[p.slotIndex];
      if (!state) continue;
      state.buffs = applyResolvedEffect(
        state.buffs,
        p.effect,
        fixedAttackBaseOf(p.effect, slots[p.sourceSlotIndex]?.casterBaseAttack ?? 0, slots),
        finalMaxHpOf(p.sourceSlotIndex),
        slots[p.sourceSlotIndex]?.baseDefence,
      ).totals;
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
  return segments;
}

/**
 * 小片の列から、昇順に増えていくフレームを渡すと、そのフレームに効いている小片（start ≤ frame < end）を並びの順で返す関数を作る。
 * フレームは前の呼び出し以上であること（buildSegments の区間の頭）
 */
function activePieceSweep(pieces: readonly SegmentPiece[]): (frame: number) => SegmentPiece[] {
  const byStart = pieces.map((_, i) => i).sort((a, b) => pieces[a]!.start - pieces[b]!.start || a - b);
  let next = 0;
  let active: number[] = [];
  return (frame) => {
    let added = false;
    while (next < byStart.length && pieces[byStart[next]!]!.start <= frame) {
      active.push(byStart[next]!);
      next += 1;
      added = true;
    }
    active = active.filter((i) => pieces[i]!.end > frame);
    if (added) active.sort((a, b) => a - b);
    return active.map((i) => pieces[i]!);
  };
}

/** 順位の材料（skills/ranking.ts）。常時パッシブは resolvePassiveStates の結果 */
export function rankSlotsOf(slots: readonly TimelineSlot[], passive: readonly (SlotBuffState | null)[]): RankSlot[] {
  return slots.map((slot, i) =>
    slot === null
      ? null
      : {
          casterBaseAttack: slot.casterBaseAttack,
          casterMaxHp: slot.casterMaxHp,
          weaponType: slot.character.weaponType,
          element: slot.character.element,
          passive: passive[i]?.buffs ?? ZERO_BUFFS,
        },
  );
}

/**
 * 枠 slotIndex について、バフ状態が同じ区間をまとめる（出現順）。画面の形（sim/teamResult.ts）の通常攻撃の内訳はこの単位。
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

/** 区間の組み立てに渡す着地点（frame/landing.ts の LandingPlan の一部） */
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
