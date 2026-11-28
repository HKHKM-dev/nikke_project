// スキル定義の読み込みの検査のうち、持続ダメージ（dot）の読み込み。型は ../types.ts
import { COUNTER_IDS } from '../counters.ts';
import {
  type AppliedTrigger,
  DOT_FIRST_TICKS,
  type DotEffect,
  type DotFirstTick,
  type EffectTrigger,
  isAppliedTrigger,
  isChanceTrigger,
  isCounterFullTrigger,
  isShotCountTrigger,
  isTimerTrigger,
  type StateEndUntil,
} from '../types.ts';
import {
  assertPositiveFinite,
  fail,
  isRecord,
  type Json,
  oneOf,
  parseAssumes,
  parseDuration,
  parseNamedStateId,
  parsePositiveInt,
  parseRef,
  rejectUnknownKeys,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition } from './condition.ts';
import {
  parseAppliedTrigger,
  parseCounterFullTrigger,
  parseShotCountDelay,
  parseStateEndUntil,
  parseTrigger,
} from './trigger.ts';

/** dot の durationUntil: "battleEnd"（持続）か { stateEnd }（〈状態〉解除まで）。書かなければ undefined */
function parseDotDurationUntil(v: Record<string, Json>, path: string): DotEffect['durationUntil'] {
  const u = v.durationUntil;
  if (u === undefined) return undefined;
  if (v.durationRef !== undefined || v.durationSeconds !== undefined)
    fail(path, 'durationUntil cannot be combined with another duration');
  if (u === 'battleEnd') return u;
  const key = `${path}.durationUntil`;
  return parseStateEndUntil(u, key, 'expected "battleEnd" or { stateEnd }');
}

/**
 * { applied } の dot は、同じ状態の durationUntil: { stateEnd } と組む（片方だけは
 * 書けない。plan/design-skill-stage19.md 2.1 節。論点 4）。付くフレームは 2 パス目の付いた記録（frame/plan.ts の
 * appliedFrames）で決まり、出来事の列では追わないので、1 パス目と件の一覧で
 * 付くフレームを追うもの（ゲージ・敵の状態）と、スタック・数・遅れ・条件とは組まない（使い手がいない）
 */
function validateAppliedDot(
  v: Record<string, Json>,
  applied: AppliedTrigger | undefined,
  stateEnd: StateEndUntil | undefined,
  path: string,
): void {
  if (applied === undefined && stateEnd === undefined) return;
  if (applied?.applied !== stateEnd?.stateEnd)
    fail(
      path,
      `a dot on { applied } lasts until the same state ends (durationUntil { stateEnd }), got ${JSON.stringify(v.trigger)} and ${JSON.stringify(v.durationUntil)}`,
    );
  for (const key of [
    'state',
    'maxStacksRef',
    'gaugeOnApply',
    'gaugeOnApplyDelayFrames',
    'tickDelayFrames',
    'gaugeOnTick',
    'perCount',
    'delayFrames',
    'stacksFrom',
    'condition',
  ])
    if (v[key] !== undefined) fail(`${path}.${key}`, `a dot on { applied } cannot have ${key}`);
}

/**
 * 確率のきっかけの dot（plan/design-chance-dot-damage.md 3.1 節）は、付いた記録の無い 1 つの持続ダメージとして、起点ごとの tick に
 * 出る確率の重みを持たせる（frame/dot.ts の chanceDotTicks）。名前の付いた状態・スタック・付け直しの形の違う刻み・数・遅れ・ゲージ・条件とは
 * 組まない（使い手がいない。ゲージの期待値はバーストの時刻表を動かす。同 3.3 節）。restartOnReapply の dot（同 9 節）も同じ専用の道を通るので、
 * 同じ欄を書けない（ほかの欄より先に見る）
 */
function validatePlainDot(v: Record<string, Json>, trigger: EffectTrigger, path: string): void {
  if (isChanceTrigger(trigger)) rejectPlainOnlyKeys(v, path, 'a dot on a chance trigger');
  else if (v.restartOnReapply !== undefined) rejectPlainOnlyKeys(v, path, 'a dot with restartOnReapply');
}

/**
 * 確率のきっかけの dot と restartOnReapply の dot が通る専用の道（frame/plan.ts の dotGroups の確率・付け直しの分岐と、
 * frame/dot.ts の chanceDotTicks）が読む欄。dot に欄を足すときは、専用の道が読むならここに、読まないなら PLAIN_DOT_REJECTED_KEYS に
 * 足す（DOT_KEYS は 2 つを合わせたもの。どちらにも無い欄は書けない）
 */
const PLAIN_DOT_KEYS = [
  'kind',
  'trigger',
  'ref',
  'intervalSeconds',
  'durationRef',
  'durationSeconds',
  'firstTick',
  'restartOnReapply',
  'sustained',
  'assumes',
  'claims',
] as const;

/**
 * 確率のきっかけの dot と restartOnReapply の dot が書けない欄（付いている間・スタック・刻みの形・数・遅れ・ゲージ・条件を追う欄）。
 * 専用の道はこれらを読まない（plan/design-chance-dot-damage.md 3.1・9 節）
 */
export const PLAIN_DOT_REJECTED_KEYS = [
  'state',
  'maxStacksRef',
  'durationUntil',
  'gaugeOnApply',
  'gaugeOnApplyDelayFrames',
  'tickDelayFrames',
  'gaugeOnTick',
  'perCount',
  'perCountIntervalFrames',
  'delayFrames',
  'stacksFrom',
  'copyEachTick',
  'condition',
  'tickIntervalFrames',
  'hitOnApply',
] as const;

function rejectPlainOnlyKeys(v: Record<string, Json>, path: string, what: string): void {
  for (const key of PLAIN_DOT_REJECTED_KEYS)
    if (v[key] !== undefined) fail(`${path}.${key}`, `${what} cannot have ${key}`);
}

/** dot に書ける欄（専用の道が読む欄と、専用の道の dot には書けない欄） */
export const DOT_KEYS: readonly string[] = [...PLAIN_DOT_KEYS, ...PLAIN_DOT_REJECTED_KEYS];

/**
 * 持続ダメージ。間隔は正の有限数。維持時間との比較（間隔 ≤ 維持）は、durationRef なら Lv で決まるので解決時に見る
 * （skills/burstDamage.ts の resolveDotEffects）。欄のまとまりごとの関数を決まった順に呼ぶ（plan/design-split-long-functions.md 3.1 節）
 */
export function parseDotEffect(v: Record<string, Json>, path: string): DotEffect {
  rejectUnknownKeys(v, DOT_KEYS, path);
  const interval = v.intervalSeconds;
  assertPositiveFinite(interval, `${path}.intervalSeconds`);
  const counterFull = parseCounterFullTrigger(v.trigger, `${path}.trigger`);
  // 「〈状態〉が適用された時」の「〈状態〉解除まで」（plan/design-skill-stage19.md 2.1 節。論点 4）
  const applied = parseAppliedTrigger(v.trigger, `${path}.trigger`);
  // 「持続」は durationUntil: battleEnd
  const durationUntil = parseDotDurationUntil(v, path);
  const stateEnd = typeof durationUntil === 'object' ? durationUntil : undefined;
  const effect: DotEffect = {
    kind: 'dot',
    trigger: counterFull ?? applied ?? parseTrigger(v.trigger, `${path}.trigger`, { timer: true, chance: true }),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...(durationUntil !== undefined ? { durationUntil } : parseDuration(v, path)),
  };
  validateAppliedDot(v, applied, stateEnd, path);
  validatePlainDot(v, effect.trigger, path);
  parseDotCondition(v, effect, path);
  parseDotIntervalAndFirstTick(v, effect, path);
  // 状態異常の名前。目録の id（持ち主が敵の状態）
  if (v.state !== undefined) effect.state = parseNamedStateId(v.state, `${path}.state`, 'enemy');
  parseDotTickShape(v, effect, path);
  parseDotRestart(v, effect, path);
  parseDotCounter(v, effect, path);
  parseDotStacks(v, effect, path);
  parseDotGauge(v, effect, path);
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * 付くフレームの条件（自分の状態だけ）。絞るのは frame/plan.ts の付くフレーム（damage と同じ判定）だけなので、
 * 付くフレームをほかで追うもの（ゲージを溜める dot は 1 パス目、敵の状態を付ける dot は件の一覧、{ counterFull } はカウンタの経路）とは組まない
 */
function parseDotCondition(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (v.condition === undefined) return;
  effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.dot);
  for (const key of ['gaugeOnApply', 'gaugeOnTick', 'gaugeOnApplyDelayFrames'])
    if (v[key] !== undefined) fail(`${path}.${key}`, 'a dot with a condition cannot charge the gauge');
  if (v.state !== undefined) fail(`${path}.state`, 'a dot with a condition cannot apply a state');
  if (isCounterFullTrigger(effect.trigger))
    fail(`${path}.trigger`, 'a dot with a condition cannot use { counterFull }');
}

/** 間隔と秒の維持の比べと、最初の刻み（firstTick） */
function parseDotIntervalAndFirstTick(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (effect.durationSeconds !== undefined && effect.durationSeconds < effect.intervalSeconds) {
    fail(`${path}.intervalSeconds`, `must not exceed the duration (${effect.durationSeconds} s)`);
  }
  if (v.firstTick !== undefined) {
    if (typeof v.firstTick !== 'string' || !(DOT_FIRST_TICKS as readonly string[]).includes(v.firstTick)) {
      fail(`${path}.firstTick`, `expected one of ${DOT_FIRST_TICKS.join(', ')}, got ${JSON.stringify(v.firstTick)}`);
    }
    effect.firstTick = v.firstTick as DotFirstTick;
  }
}

/**
 * 刻みの形: スタックの上限（maxStacksRef）と、チェーンバインドの形
 * （plan/design-skill-stage13.md 2.3 節。付けるたびに刻みを付け直す持続。halfAfterLatest・刻みのフレーム・付けた時のヒット）
 */
function parseDotTickShape(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (v.maxStacksRef !== undefined) {
    effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
    if (effect.firstTick !== 'afterInterval' && effect.firstTick !== 'halfAfterLatest')
      fail(`${path}.maxStacksRef`, 'needs firstTick afterInterval or halfAfterLatest');
  }
  const latest = effect.firstTick === 'halfAfterLatest';
  if (latest !== (effect.durationUntil === 'battleEnd'))
    fail(`${path}.firstTick`, 'halfAfterLatest goes with durationUntil "battleEnd"');
  if (v.tickIntervalFrames !== undefined) {
    const n = v.tickIntervalFrames;
    if (!latest) fail(`${path}.tickIntervalFrames`, 'needs firstTick halfAfterLatest');
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0)
      fail(`${path}.tickIntervalFrames`, `expected a positive number, got ${JSON.stringify(n)}`);
    effect.tickIntervalFrames = n;
  }
  if (v.hitOnApply !== undefined) {
    if (v.hitOnApply !== true) fail(`${path}.hitOnApply`, 'expected true');
    if (!latest) fail(`${path}.hitOnApply`, 'needs firstTick halfAfterLatest');
    effect.hitOnApply = true;
  }
}

/**
 * 付け直しのたびに刻みを数え直す形（restartOnReapply。plan/design-chance-dot-damage.md 9 節）。刻みは付けた時からの atApplication か
 * afterInterval で、付いている間・スタック・ゲージを追う欄とは組まない（使い手がいない。validatePlainDot）
 */
function parseDotRestart(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (v.restartOnReapply === undefined) return;
  if (v.restartOnReapply !== true) fail(`${path}.restartOnReapply`, 'expected true');
  if (isCounterFullTrigger(effect.trigger) || isAppliedTrigger(effect.trigger))
    fail(`${path}.trigger`, 'a dot with restartOnReapply cannot use { counterFull } or { applied }');
  effect.restartOnReapply = true;
}

/** { counterFull } のきっかけの dot: カウンタの値だけのヒット（perCount・perCountIntervalFrames）と遅れ（delayFrames） */
function parseDotCounter(v: Record<string, Json>, effect: DotEffect, path: string): void {
  const counterFull = isCounterFullTrigger(effect.trigger);
  if (v.perCount !== undefined) {
    const per = v.perCount;
    if (!counterFull) fail(`${path}.perCount`, 'perCount needs the trigger { counterFull }');
    if (!isRecord(per) || per.counter === undefined || Object.keys(per).length !== 1)
      fail(`${path}.perCount`, 'expected { counter }');
    effect.perCount = { counter: oneOf(COUNTER_IDS, per.counter, `${path}.perCount.counter`) };
    if (v.perCountIntervalFrames === undefined) fail(`${path}.perCount`, 'perCount needs perCountIntervalFrames');
    effect.perCountIntervalFrames = parsePositiveInt(v.perCountIntervalFrames, `${path}.perCountIntervalFrames`);
  } else if (v.perCountIntervalFrames !== undefined) fail(`${path}.perCountIntervalFrames`, 'needs perCount');
  if (counterFull && effect.perCount === undefined) fail(`${path}.trigger`, '{ counterFull } needs perCount');
  if (v.delayFrames !== undefined) {
    // バースト使用時の付く時刻の遅れ（plan/design-guillotine-ws.md 8.2 節）。付けた時・tick のゲージは発火のフレームで数えるので組まない
    // 名前の付いた状態の dot は、スタック量▲・消去が発火のフレームで数えるので組まない
    const burstUse =
      effect.trigger === 'burstUse' &&
      v.gaugeOnApply === undefined &&
      v.gaugeOnTick === undefined &&
      v.state === undefined;
    if (!counterFull && !burstUse)
      fail(
        `${path}.delayFrames`,
        'delayFrames needs the trigger { counterFull }, or "burstUse" without gauge and state',
      );
    effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
  }
}

/**
 * 敵の状態のスタック数か自分のカウンタの値から取るスタック（stacksFrom。plan/design-mast.md 2.3 節・plan/design-guillotine-ws.md 2.4 節）と、
 * tick ごとに写し直す印・持続ダメージでない印
 */
function parseDotStacks(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (v.stacksFrom !== undefined) {
    const from = v.stacksFrom;
    if (
      !isRecord(from) ||
      Object.keys(from).length !== 1 ||
      (from.enemyState === undefined && from.counter === undefined)
    )
      fail(`${path}.stacksFrom`, 'expected { enemyState } or { counter }');
    if (effect.maxStacksRef !== undefined || effect.perCount !== undefined)
      fail(`${path}.stacksFrom`, 'stacksFrom cannot be used with maxStacksRef or perCount');
    effect.stacksFrom =
      from.counter !== undefined
        ? { counter: oneOf(COUNTER_IDS, from.counter, `${path}.stacksFrom.counter`) }
        : { enemyState: parseNamedStateId(from.enemyState, `${path}.stacksFrom.enemyState`, 'enemy') };
  }
  if (v.copyEachTick !== undefined) {
    if (v.copyEachTick !== true) fail(`${path}.copyEachTick`, 'expected true');
    if (effect.stacksFrom === undefined) fail(`${path}.copyEachTick`, 'copyEachTick needs stacksFrom');
    effect.copyEachTick = true;
  }
  if (v.sustained !== undefined) {
    if (v.sustained !== false) fail(`${path}.sustained`, 'expected false (omit it for sustained damage)');
    effect.sustained = false;
  }
}

/**
 * ゲージ: 付けた時（gaugeOnApply とその遅れ）と刻みごと（gaugeOnTick）。刻みの遅れ（tickDelayFrames）は射撃の回数のきっかけか、
 * 周期のきっかけ（plan/design-rosanna-co.md 2 節）。周期のきっかけのゲージは、クールタイムの印・since・状態の名前の無い dot だけで、
 * 刻みは atApplication か afterInterval（1 パス目が発火のフレームで予約する。同 7 節）。カウンタが上限に届いた時（{ counterFull }）の
 * dot は、付けた時と、firstTick halfAfterLatest の刻みごと（遅れは組まない。plan/design-mihara-bc-gauge.md 2 節）
 */
function parseDotGauge(v: Record<string, Json>, effect: DotEffect, path: string): void {
  const counterFull = isCounterFullTrigger(effect.trigger);
  const timer = isTimerTrigger(effect.trigger);
  for (const key of ['gaugeOnApply', 'gaugeOnTick'] as const) {
    if (v[key] === undefined) continue;
    if (v[key] !== true) fail(`${path}.${key}`, 'expected true');
    if (counterFull) {
      effect[key] = true;
      continue;
    }
    // V-0113: tick のゲージは、バースト使用時に付くハッキング（クルミ）にも要る。付けたときの分は射撃の回数トリガーだけ
    if (key === 'gaugeOnTick' && effect.trigger === 'burstUse') {
      effect[key] = true;
      continue;
    }
    if (timer) {
      validateTimerDotGauge(effect, `${path}.${key}`);
      effect[key] = true;
      continue;
    }
    if (!isShotCountTrigger(effect.trigger)) {
      fail(
        `${path}.${key}`,
        key === 'gaugeOnTick'
          ? 'needs a shot count trigger, a timer or burstUse'
          : 'needs a shot count trigger or a timer',
      );
    }
    effect[key] = true;
  }
  if (counterFull) {
    validateCounterFullDotGauge(v, effect, path);
    return;
  }
  if (v.gaugeOnApplyDelayFrames !== undefined) {
    if (effect.gaugeOnApply !== true) fail(`${path}.gaugeOnApplyDelayFrames`, 'needs gaugeOnApply');
    effect.gaugeOnApplyDelayFrames = timer
      ? parsePositiveInt(v.gaugeOnApplyDelayFrames, `${path}.gaugeOnApplyDelayFrames`)
      : parseShotCountDelay(v.gaugeOnApplyDelayFrames, effect.trigger, `${path}.gaugeOnApplyDelayFrames`);
  }
  if (v.tickDelayFrames !== undefined) {
    if (effect.state !== undefined) fail(`${path}.tickDelayFrames`, 'cannot be combined with state');
    effect.tickDelayFrames = isTimerTrigger(effect.trigger)
      ? parsePositiveInt(v.tickDelayFrames, `${path}.tickDelayFrames`)
      : parseShotCountDelay(v.tickDelayFrames, effect.trigger, `${path}.tickDelayFrames`);
  }
  // 周期のきっかけは、発火のフレームで付け直しを含めて刻みを決めるので atApplication も書ける（plan/design-rosanna-co.md 7 節）
  const firstTick = effect.firstTick ?? 'atApplication';
  if (effect.gaugeOnTick === true && firstTick !== 'afterInterval' && !(timer && firstTick === 'atApplication')) {
    fail(
      `${path}.gaugeOnTick`,
      timer ? 'needs firstTick atApplication or afterInterval' : 'needs firstTick afterInterval',
    );
  }
}

/** 周期のきっかけの dot のゲージの形（parseDotGauge）。1 パス目の frame/firstPass/gaugeEffects.ts が発火のフレームで予約する */
function validateTimerDotGauge(effect: DotEffect, path: string): void {
  const trigger = effect.trigger;
  if (!isTimerTrigger(trigger)) return;
  // 1 パス目は発火を timerFramesOf で前もって出すので、ループの中で追う周期（クールタイムの印・since）は組まない
  // （条件のある dot はゲージを書けない。parseDotCondition）。状態の名前は、同じ状態のほかの dot とのまとまり・解除・スタック量▲を
  // 1 パス目が追わないので組まない
  if (trigger.cooldown === true || trigger.since !== undefined)
    fail(path, 'a dot with gauge on a timer needs a timer without cooldown or since');
  if (effect.state !== undefined) fail(path, 'a dot with gauge on a timer cannot apply a state');
}

/** { counterFull } の dot のゲージの形（parseDotGauge）。1 パス目の frame/firstPass/counterGauges.ts が追う */
function validateCounterFullDotGauge(v: Record<string, Json>, effect: DotEffect, path: string): void {
  // 1 パス目は、付ける数を上限に届いたカウンタの上限で出すので、数えるカウンタは同じもの
  const charges = effect.gaugeOnApply === true || effect.gaugeOnTick === true;
  if (charges && isCounterFullTrigger(effect.trigger) && effect.perCount?.counter !== effect.trigger.counterFull)
    fail(`${path}.perCount`, 'a dot with gauge on { counterFull } needs perCount { counter } of the same counter');
  for (const key of ['gaugeOnApplyDelayFrames', 'tickDelayFrames'] as const)
    if (v[key] !== undefined) fail(`${path}.${key}`, 'cannot be used with { counterFull }');
  if (effect.gaugeOnTick === true && effect.firstTick !== 'halfAfterLatest')
    fail(`${path}.gaugeOnTick`, 'with { counterFull } needs firstTick halfAfterLatest');
}
