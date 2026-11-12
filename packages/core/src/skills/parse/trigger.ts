// スキル定義の読み込みの検査のうち、きっかけ（trigger）の読み込み。型は ../types.ts
import { COUNTER_IDS } from '../counters.ts';
import { SUMMON_IDS } from '../summons.ts';
import {
  type AppliedTrigger,
  BUFF_TRIGGERS,
  CHANCE_COUNT_KINDS,
  type ChargeFullTrigger,
  type ChargeTickTrigger,
  type CounterFullTrigger,
  type CoverHealedTrigger,
  type EffectTrigger,
  type EndedTrigger,
  type StateEndUntil,
  EVENT_COUNT_KINDS,
  type EventCountKind,
  type EventCountTrigger,
  FIRING_WINDOWS,
  isChanceTrigger,
  isShotCountTrigger,
  isTimerTrigger,
  type SelfHpAtMostTrigger,
  SHOT_COUNT_KINDS,
  SHOT_COUNT_RESETS,
  SHOT_COUNT_WINDOWS,
  type ShotCountKind,
  type ShotCountTrigger,
  type SummonAttackTrigger,
  type TimerTrigger,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  objectUntil,
  oneOf,
  parseNamedStateId,
  parsePositiveInt,
  parseRef,
  parseTrue,
  rejectUnknownKeys,
} from './common.ts';

/**
 * 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: timed・heal の delayFrames。射撃の回数のきっかけ
 * （確率のきっかけを除く）だけに書ける
 */
export function parseShotCountDelay(v: Json, trigger: EffectTrigger, path: string): number {
  if (!isShotCountTrigger(trigger) || isChanceTrigger(trigger)) {
    fail(path, 'delayFrames needs a shot count trigger ({ count }) without a chance');
  }
  return parsePositiveInt(v, path);
}

/** 時間の周期のきっかけの発動から効果までのフレーム（delayFrames。coverHeal・removeDebuff）。書かなければ undefined */
export function parseTimerDelayFrames(v: Json, trigger: EffectTrigger, path: string): number | undefined {
  if (v === undefined) return undefined;
  if (!isTimerTrigger(trigger)) fail(path, 'delayFrames needs a timer trigger ({ everySeconds })');
  return parsePositiveInt(v, path);
}

/** parseTrigger に、効果の種類ごとに書けるきっかけを伝える（省いた形は書けない） */
export type TriggerOptions = {
  /** 時間の周期（{ everySeconds }。damage・dot・autoAttack・burstGaugeHit・timed・heal など）。'withStart' なら atStart も */
  timer?: boolean | 'withStart';
  /**
   * 回数のきっかけの数える窓（during）と発火の窓（firesDuring）。グレイブ編（plan/design-grave.md 2.4 節）: 'withState' なら自分の状態の窓
   * （during: { state }）も書ける（状態の付与だけ）
   */
  during?: boolean | 'withState';
  /** 確率のきっかけ（chance・chanceRef） */
  chance?: boolean;
  /** フルスタックの消費（{ fullStack }） */
  fullStack?: boolean;
  /** 使用武器の変更の終わり（{ weaponChangeEnd }） */
  weaponChangeEnd?: boolean;
  /** リロードの込め終わり（{ reloadEnd }） */
  reloadEnd?: boolean;
};

/**
 * 文字列なら BuffTrigger、オブジェクトなら回数・周期などのトリガー。書ける形は options で決まる。damage の { applied } や、timed の
 * { chargeTick } のように、効果の種類だけが読む形は、呼ぶ側が先に読む（ここでは書けない所として落とす）
 */
export function parseTrigger(v: Json, path: string, options: TriggerOptions = {}): EffectTrigger {
  if (typeof v === 'string') return oneOf(BUFF_TRIGGERS, v, path);
  if (!isRecord(v)) fail(path, 'expected a trigger name or a count trigger object');
  // ペルソナ編: 効果名のトリガーは damage と、2 段目の段 4 から timed・付与だけ（parseAppliedTrigger で先に読む）
  if (v.applied !== undefined) {
    fail(path, 'an applied trigger ({ applied }) is only allowed in damage, timed and state grants');
  }
  // グレイブ編（plan/design-grave.md 2.1 節）: 状態の終わりのきっかけは counterChange・ammoDecrease・状態の付与だけ（parseEndedTrigger で先に読む）
  if (v.ended !== undefined) {
    fail(path, 'an ended trigger ({ ended }) is only allowed in counterChange, ammoDecrease and state grants');
  }
  // 2 段目の段 3: フルスタックの消費のきっかけは heal だけ（plan/design-skill-stage3.md 1.3 節）。段 11 から weaponChange も
  // （plan/design-skill-stage11.md 2.1 節）
  if (v.fullStack !== undefined) {
    if (!options.fullStack) fail(path, 'a full-stack trigger ({ fullStack }) is only allowed in heal and weaponChange');
    rejectUnknownKeys(v, ['fullStack'], path);
    return { fullStack: parseNamedStateId(v.fullStack, `${path}.fullStack`, 'ally') };
  }
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 溜めのきっかけは timed・付与だけ（parseChargeTrigger で先に読む）
  if (v.chargeTick !== undefined || v.chargeFull !== undefined) {
    fail(path, 'a charge trigger ({ chargeTick } / { chargeFull }) is only allowed in timed and state grants');
  }
  // 2 段目の段 11（plan/design-skill-stage11.md 2.2.1 節）: 使用武器の変更の終わりのきっかけは ammoDecrease だけ
  if (v.weaponChangeEnd !== undefined) {
    if (!options.weaponChangeEnd)
      fail(path, 'a weapon change end trigger ({ weaponChangeEnd }) is only allowed in ammoDecrease');
    return parseTrueOnlyTrigger(v, 'weaponChangeEnd', path);
  }
  // 2 段目の段 17 の PR 1: 遮蔽物 HP 回復を受けた時のきっかけは timed だけ（parseCoverHealedTrigger で先に読む）
  if (v.coverHealed !== undefined) fail(path, 'a { coverHealed } trigger is only allowed in timed');
  // 2 段目の段 16 の PR 2（plan/design-skill-stage16.md 2.2 節）: リロードの込め終わりのきっかけは removeState だけ
  if (v.reloadEnd !== undefined) {
    if (!options.reloadEnd)
      fail(path, 'a reload end trigger ({ reloadEnd }) is only allowed in removeState, timed and state grants');
    return parseTrueOnlyTrigger(v, 'reloadEnd', path);
  }
  if (v.everySeconds !== undefined) return parseTimerTrigger(v, path, options.timer ?? false);
  if ((SHOT_COUNT_KINDS as readonly string[]).includes(v.count as string))
    return parseShotCountTrigger(v, path, options);
  if ((EVENT_COUNT_KINDS as readonly string[]).includes(v.count as string)) return parseEventCountTrigger(v, path);
  fail(
    `${path}.count`,
    `expected one of ${[...SHOT_COUNT_KINDS, ...EVENT_COUNT_KINDS].join(', ')}, got ${JSON.stringify(v.count)}`,
  );
}

/** { weaponChangeEnd: true }・{ reloadEnd: true }: 欄はその 1 つで、値は true だけ */
function parseTrueOnlyTrigger<K extends 'weaponChangeEnd' | 'reloadEnd'>(
  v: Record<string, Json>,
  key: K,
  path: string,
): Record<K, true> {
  rejectUnknownKeys(v, [key], path);
  parseTrue(v[key], `${path}.${key}`);
  return { [key]: true } as Record<K, true>;
}

/** 時間の周期のきっかけ { everySeconds }（印 atStart・carry・cooldown） */
function parseTimerTrigger(v: Record<string, Json>, path: string, allowTimer: boolean | 'withStart'): TimerTrigger {
  if (!allowTimer)
    fail(
      path,
      'a timer trigger ({ everySeconds }) is only allowed in damage, dot, autoAttack, burstGaugeHit, timed, heal and counterChange',
    );
  // 魔術師のカード編（plan/design-arcana-magician.md 2.2 節）: クールタイムの印（cooldown）。書ける効果の種類と組み合わせは
  // parse/crossChecks.ts の validateCooldownTimers が見る
  const flags =
    allowTimer === 'withStart' ? (['atStart', 'carry', 'cooldown'] as const) : (['carry', 'cooldown'] as const);
  rejectUnknownKeys(v, ['everySeconds', ...flags], path);
  const seconds = v.everySeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    fail(`${path}.everySeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
  }
  const timer: TimerTrigger = { everySeconds: seconds };
  for (const flag of flags) {
    if (v[flag] === undefined) continue;
    timer[flag] = parseTrue(v[flag], `${path}.${flag}`);
  }
  return timer;
}

/** 射撃の回数のきっかけ { count }（毎 N 回・スタック・数える窓・発火の窓・確率） */
function parseShotCountTrigger(v: Record<string, Json>, path: string, options: TriggerOptions): ShotCountTrigger {
  rejectUnknownKeys(
    v,
    [
      'count',
      'every',
      'everyRef',
      'stacksRef',
      'during',
      'reset',
      'firesDuring',
      'firesOutside',
      'chance',
      'chanceRef',
    ],
    path,
  );
  if (v.every !== undefined && v.everyRef !== undefined) fail(path, 'at most one of every and everyRef');
  // ペレットの命中編（plan/design-pellet-hit.md 2 節）: 1 発で複数のペレットを数えるので、毎回（1）は書けない
  if (v.count === 'pelletHit' && v.every === undefined && v.everyRef === undefined) {
    fail(path, 'pelletHit needs every or everyRef');
  }
  const trigger: ShotCountTrigger = { count: v.count as ShotCountKind };
  if (v.every !== undefined) trigger.every = parsePositiveInt(v.every, `${path}.every`);
  if (v.everyRef !== undefined) trigger.everyRef = parseRef(v.everyRef, `${path}.everyRef`);
  if (v.stacksRef !== undefined) trigger.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
  parseCountingWindow(v, trigger, path, options.during ?? false);
  parseFiringWindow(v, trigger, path, options.during ?? false);
  // ソルジャーE.G. 編: 確率のきっかけ（plan/design-soldier-eg.md 3.1 節）
  if (v.chance !== undefined || v.chanceRef !== undefined) parseChance(v, trigger, path, options.chance ?? false);
  return trigger;
}

/** クルミ S2 編: フルバースト中だけ数える回数トリガー（plan/design-kurumi-s2.md 2.1 節）。数える窓 during と、数え直す reset */
function parseCountingWindow(
  v: Record<string, Json>,
  trigger: ShotCountTrigger,
  path: string,
  allowDuring: boolean | 'withState',
): void {
  if (v.during === undefined && v.reset === undefined) return;
  if (!allowDuring) fail(`${path}.during`, 'a counting window (during) is only allowed in damage, timed and state');
  if (v.during === undefined) fail(`${path}.reset`, 'reset needs during');
  if (isRecord(v.during)) {
    // グレイブ編（plan/design-grave.md 2.4 節）: 自分の状態の間だけ数え、状態が付くたびに数え直す（reset は書かない）
    if (allowDuring !== 'withState')
      fail(`${path}.during`, 'a counting window of a state (during: { state }) is only allowed in state grants');
    rejectUnknownKeys(v.during, ['state'], `${path}.during`);
    trigger.during = { state: parseNamedStateId(v.during.state, `${path}.during.state`, 'ally') };
    if (v.reset !== undefined)
      fail(`${path}.reset`, 'a counting window of a state starts over when the state is applied (write no reset)');
  } else {
    trigger.during = oneOf(SHOT_COUNT_WINDOWS, v.during, `${path}.during`);
    if (v.reset === undefined) fail(`${path}.reset`, 'during needs reset (fullBurstStart or never)');
    trigger.reset = oneOf(SHOT_COUNT_RESETS, v.reset, `${path}.reset`);
  }
  if (trigger.stacksRef !== undefined) fail(`${path}.during`, 'during cannot be used with stacksRef');
  if (trigger.count === 'lastShot') fail(`${path}.during`, 'during cannot be used with lastShot');
  if (trigger.count === 'weaponChangeShot') fail(`${path}.during`, 'during cannot be used with weaponChangeShot');
}

/**
 * ソーダ：トゥインクルバニー S1 の数え方（V-0443）: 戦闘中ずっと数え、発火だけフルバーストの窓の中に限る（firesDuring）。
 * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.7 節）: 使用武器の変更の外でだけ発火する（firesOutside）
 */
function parseFiringWindow(
  v: Record<string, Json>,
  trigger: ShotCountTrigger,
  path: string,
  allowDuring: boolean | 'withState',
): void {
  if (v.firesDuring !== undefined) {
    if (!allowDuring) {
      fail(`${path}.firesDuring`, 'a firing window (firesDuring) is only allowed in damage, timed and state');
    }
    if (v.during !== undefined) fail(`${path}.firesDuring`, 'firesDuring cannot be used with during');
    trigger.firesDuring = oneOf(FIRING_WINDOWS, v.firesDuring, `${path}.firesDuring`);
    if (trigger.stacksRef !== undefined) fail(`${path}.firesDuring`, 'firesDuring cannot be used with stacksRef');
    if (trigger.count === 'lastShot') fail(`${path}.firesDuring`, 'firesDuring cannot be used with lastShot');
    if (trigger.count === 'weaponChangeShot') {
      fail(`${path}.firesDuring`, 'firesDuring cannot be used with weaponChangeShot');
    }
  }
  if (v.firesOutside !== undefined) {
    if (v.firesOutside !== 'weaponChange') {
      fail(`${path}.firesOutside`, `expected "weaponChange", got ${JSON.stringify(v.firesOutside)}`);
    }
    for (const key of ['during', 'firesDuring', 'stacksRef', 'chance', 'chanceRef'] as const) {
      if (v[key] !== undefined) fail(`${path}.firesOutside`, `firesOutside cannot be used with ${key}`);
    }
    if (trigger.count === 'weaponChangeShot') {
      fail(`${path}.firesOutside`, 'firesOutside cannot be used with weaponChangeShot');
    }
    trigger.firesOutside = 'weaponChange';
  }
}

/** ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 確率のきっかけ（chance か chanceRef のちょうど片方） */
function parseChance(v: Record<string, Json>, trigger: ShotCountTrigger, path: string, allowChance: boolean): void {
  if (!allowChance) fail(`${path}.chance`, 'a chance trigger (chance / chanceRef) is only allowed in timed');
  if (v.chance !== undefined && v.chanceRef !== undefined) fail(path, 'at most one of chance and chanceRef');
  if (!(CHANCE_COUNT_KINDS as readonly string[]).includes(trigger.count)) {
    fail(`${path}.count`, `a chance trigger needs count ${CHANCE_COUNT_KINDS.join(' or ')}, got "${trigger.count}"`);
  }
  for (const key of ['every', 'everyRef', 'stacksRef', 'during', 'firesDuring'] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `a chance trigger cannot be combined with ${key}`);
  }
  if (v.chance !== undefined) {
    const chance = v.chance;
    if (typeof chance !== 'number' || !Number.isFinite(chance) || chance <= 0 || chance > 100) {
      fail(`${path}.chance`, `expected a percentage in (0, 100], got ${JSON.stringify(chance)}`);
    }
    trigger.chance = chance;
  } else {
    trigger.chanceRef = parseRef(v.chanceRef, `${path}.chanceRef`);
  }
}

/** 出来事の回数のきっかけ { count, atLeast }（何回目まで atMost・数え直す resetAfterSeconds） */
function parseEventCountTrigger(v: Record<string, Json>, path: string): EventCountTrigger {
  rejectUnknownKeys(v, ['count', 'atLeast', 'atMost', 'resetAfterSeconds'], path);
  const trigger: EventCountTrigger = {
    count: v.count as EventCountKind,
    atLeast: parsePositiveInt(v.atLeast, `${path}.atLeast`),
  };
  // ディーゼル：ウィンタースイーツ編（plan/design-diesel-ws.md 2.1 節）: 何回目まで（atLeast 以上）
  if (v.atMost !== undefined) {
    const atMost = parsePositiveInt(v.atMost, `${path}.atMost`);
    if (atMost < trigger.atLeast)
      fail(`${path}.atMost`, `expected at least atLeast (${trigger.atLeast}), got ${atMost}`);
    trigger.atMost = atMost;
  }
  if (v.resetAfterSeconds !== undefined) {
    const at = `${path}.resetAfterSeconds`;
    if (trigger.count !== 'burstUse') fail(at, 'resetAfterSeconds needs count burstUse');
    if (typeof v.resetAfterSeconds !== 'number' || !(v.resetAfterSeconds > 0)) fail(at, 'expected a positive number');
    trigger.resetAfterSeconds = v.resetAfterSeconds;
  }
  return trigger;
}

/**
 * 2 段目の段 10・グレイブ編（plan/design-grave.md 2.1 節）: 「〈状態〉が終了した時」{ ended: 状態 }。それ以外の形なら undefined。
 * counterChange・ammoDecrease・状態の付与が読む
 */
export function parseEndedTrigger(v: Json, path: string): EndedTrigger | undefined {
  if (!isRecord(v) || v.ended === undefined) return undefined;
  rejectUnknownKeys(v, ['ended'], path);
  return { ended: parseNamedStateId(v.ended, `${path}.ended`, 'ally') };
}

/**
 * 2 段目の段 19 の PR 1・グレイブ編: 維持の { stateEnd: 状態 }（〈状態〉解除まで）。dot と状態の付与が読む。key は durationUntil の位置、
 * expected は形の違うときの文言
 */
export function parseStateEndUntil(v: Json, key: string, expected: string): StateEndUntil {
  return { stateEnd: parseNamedStateId(objectUntil(v, 'stateEnd', key, expected), `${key}.stateEnd`, 'ally') };
}

/**
 * 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: { applied } を damage のほかで読む。{ applied } でなければ undefined
 * （ほかのトリガーは呼ぶ側の parseTrigger が読む）
 */
export function parseAppliedTrigger(v: Json, path: string): AppliedTrigger | undefined {
  if (!isRecord(v) || v.applied === undefined) return undefined;
  rejectUnknownKeys(v, ['applied'], path);
  return { applied: parseNamedStateId(v.applied, `${path}.applied`, 'ally') };
}

/**
 * 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節。論点 2）: 状態の付いた時から数える周期 { everySeconds, since: { applied } }。
 * since の無い形なら undefined（呼ぶ側の parseTrigger が読む）。counterChange と、A2 の B モード編（plan/design-hp-down-interval.md 2.1 節）から
 * currentHpDown が読む。allowStart なら atStart（付いたフレームにも発火する。currentHpDown だけ）も書ける
 */
export function parseSinceTimerTrigger(v: Json, path: string, allowStart = false): TimerTrigger | undefined {
  if (!isRecord(v) || v.since === undefined) return undefined;
  const { since, ...rest } = v;
  const timer = parseTrigger(rest, path, { timer: allowStart ? 'withStart' : true });
  if (!isTimerTrigger(timer)) fail(`${path}.since`, 'since needs a timer trigger ({ everySeconds })');
  const from = parseAppliedTrigger(since, `${path}.since`);
  if (from === undefined) fail(`${path}.since`, 'expected { applied }');
  return { ...timer, since: from };
}

/** マスト編（plan/design-mast.md 8 節）: { selfHpAtMostRef: N }。それ以外の形なら undefined（timed だけが読む） */
export function parseSelfHpAtMostTrigger(v: Json, path: string): SelfHpAtMostTrigger | undefined {
  if (!isRecord(v) || v.selfHpAtMostRef === undefined) return undefined;
  rejectUnknownKeys(v, ['selfHpAtMostRef'], path);
  return { selfHpAtMostRef: parseRef(v.selfHpAtMostRef, `${path}.selfHpAtMostRef`) };
}

/** 2 段目の段 17 の PR 1: { coverHealed: true }。ほかのきっかけなら undefined（状態の付与では読まず、parseTrigger が落とす） */
export function parseCoverHealedTrigger(v: Json, path: string): CoverHealedTrigger | undefined {
  if (!isRecord(v) || v.coverHealed === undefined) return undefined;
  rejectUnknownKeys(v, ['coverHealed'], path);
  parseTrue(v.coverHealed, `${path}.coverHealed`);
  return { coverHealed: true };
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: { chargeTick: { everySeconds } } か { chargeFull: true }。それ以外の形なら
 * undefined（timed と状態の付与の parseTimedFields だけが読む）
 */
export function parseChargeTrigger(v: Json, path: string): ChargeTickTrigger | ChargeFullTrigger | undefined {
  if (!isRecord(v)) return undefined;
  if (v.chargeFull !== undefined) {
    rejectUnknownKeys(v, ['chargeFull'], path);
    parseTrue(v.chargeFull, `${path}.chargeFull`);
    return { chargeFull: true };
  }
  if (v.chargeTick === undefined) return undefined;
  rejectUnknownKeys(v, ['chargeTick'], path);
  const tick = v.chargeTick;
  if (!isRecord(tick)) fail(`${path}.chargeTick`, 'expected { everySeconds }');
  rejectUnknownKeys(tick, ['everySeconds'], `${path}.chargeTick`);
  const seconds = tick.everySeconds;
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    fail(`${path}.chargeTick.everySeconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
  }
  return { chargeTick: { everySeconds: seconds } };
}

/**
 * ペルソナ編: damage のトリガー。{ applied: 状態 }（名前の付いた状態の語彙編: 目録の id）のほかは parseTrigger と同じ。
 * 2 段目の段 13 の PR 1: { counterFull: カウンタ } も（dot も同じ）
 */
export function parseDamageTrigger(v: Json, path: string): EffectTrigger {
  return (
    parseSummonAttackTrigger(v, path) ??
    parseCounterFullTrigger(v, path) ??
    parseAppliedTrigger(v, path) ??
    parseTrigger(v, path, { timer: true, during: true })
  );
}

/** アインのニアフェザー編: { summon, intervalSeconds, startDelaySeconds }。それ以外の形なら undefined */
function parseSummonAttackTrigger(v: Json, path: string): SummonAttackTrigger | undefined {
  if (!isRecord(v) || v.summon === undefined) return undefined;
  rejectUnknownKeys(v, ['summon', 'intervalSeconds', 'startDelaySeconds'], path);
  const summon = oneOf(SUMMON_IDS, v.summon, `${path}.summon`);
  const table = v.intervalSeconds;
  if (!isRecord(table) || Object.keys(table).length === 0)
    fail(`${path}.intervalSeconds`, 'expected a non-empty object');
  const intervalSeconds: Record<number, number> = {};
  for (const [key, seconds] of Object.entries(table)) {
    const count = parsePositiveInt(Number(key), `${path}.intervalSeconds.${key}`);
    if (typeof seconds !== 'number' || !(seconds > 0))
      fail(`${path}.intervalSeconds.${key}`, `expected a positive number, got ${JSON.stringify(seconds)}`);
    intervalSeconds[count] = seconds;
  }
  const delay = v.startDelaySeconds;
  if (typeof delay !== 'number' || !(delay >= 0))
    fail(`${path}.startDelaySeconds`, `expected a non-negative number, got ${JSON.stringify(delay)}`);
  return { summon, intervalSeconds, startDelaySeconds: delay };
}

/** 2 段目の段 11 の PR 2・段 13 の PR 1: { counterFull: カウンタ }。それ以外の形なら undefined */
export function parseCounterFullTrigger(v: Json, path: string): CounterFullTrigger | undefined {
  if (!isRecord(v) || v.counterFull === undefined) return undefined;
  rejectUnknownKeys(v, ['counterFull'], path);
  return { counterFull: oneOf(COUNTER_IDS, v.counterFull, `${path}.counterFull`) };
}
