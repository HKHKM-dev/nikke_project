// スキル定義の読み込みの検査のうち、持続ダメージ（dot）の読み込み。型は ../types.ts
import { COUNTER_IDS } from '../counters.ts';
import {
  type AppliedTrigger,
  DOT_FIRST_TICKS,
  type DotEffect,
  type DotFirstTick,
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

/** dot に書ける欄 */
const DOT_KEYS: readonly string[] = [
  'kind',
  'trigger',
  'ref',
  'intervalSeconds',
  'durationRef',
  'durationSeconds',
  'firstTick',
  'state',
  'maxStacksRef',
  'gaugeOnApply',
  'gaugeOnApplyDelayFrames',
  'tickDelayFrames',
  'gaugeOnTick',
  'durationUntil',
  'tickIntervalFrames',
  'hitOnApply',
  'perCount',
  'perCountIntervalFrames',
  'delayFrames',
  'stacksFrom',
  'copyEachTick',
  'sustained',
  'condition',
  'assumes',
  'claims',
];

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
    trigger: counterFull ?? applied ?? parseTrigger(v.trigger, `${path}.trigger`, { timer: true }),
    ref: parseRef(v.ref, `${path}.ref`),
    intervalSeconds: interval,
    ...(durationUntil !== undefined ? { durationUntil } : parseDuration(v, path)),
  };
  validateAppliedDot(v, applied, stateEnd, path);
  parseDotCondition(v, effect, path);
  parseDotIntervalAndFirstTick(v, effect, path);
  // 状態異常の名前。目録の id（持ち主が敵の状態）
  if (v.state !== undefined) effect.state = parseNamedStateId(v.state, `${path}.state`, 'enemy');
  parseDotTickShape(v, effect, path);
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
    if (!counterFull) fail(`${path}.delayFrames`, 'delayFrames needs the trigger { counterFull }');
    effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
  }
}

/** 敵の状態のスタック数から取るスタック（stacksFrom）と、tick ごとに写し直す印（plan/design-mast.md 2.3 節）・持続ダメージでない印 */
function parseDotStacks(v: Record<string, Json>, effect: DotEffect, path: string): void {
  if (v.stacksFrom !== undefined) {
    const from = v.stacksFrom;
    if (!isRecord(from) || from.enemyState === undefined || Object.keys(from).length !== 1)
      fail(`${path}.stacksFrom`, 'expected { enemyState }');
    if (effect.maxStacksRef !== undefined || effect.perCount !== undefined)
      fail(`${path}.stacksFrom`, 'stacksFrom cannot be used with maxStacksRef or perCount');
    effect.stacksFrom = { enemyState: parseNamedStateId(from.enemyState, `${path}.stacksFrom.enemyState`, 'enemy') };
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
 * 周期のきっかけ（ゲージを溜めない。plan/design-rosanna-co.md 2 節）
 */
function parseDotGauge(v: Record<string, Json>, effect: DotEffect, path: string): void {
  for (const key of ['gaugeOnApply', 'gaugeOnTick'] as const) {
    if (v[key] === undefined) continue;
    if (v[key] !== true) fail(`${path}.${key}`, 'expected true');
    // V-0113: tick のゲージは、バースト使用時に付くハッキング（クルミ）にも要る。付けたときの分は射撃の回数トリガーだけ
    if (key === 'gaugeOnTick' && effect.trigger === 'burstUse') {
      effect[key] = true;
      continue;
    }
    if (!isShotCountTrigger(effect.trigger)) {
      fail(
        `${path}.${key}`,
        key === 'gaugeOnTick' ? 'needs a shot count trigger or burstUse' : 'needs a shot count trigger',
      );
    }
    effect[key] = true;
  }
  if (v.gaugeOnApplyDelayFrames !== undefined) {
    if (effect.gaugeOnApply !== true) fail(`${path}.gaugeOnApplyDelayFrames`, 'needs gaugeOnApply');
    effect.gaugeOnApplyDelayFrames = parseShotCountDelay(
      v.gaugeOnApplyDelayFrames,
      effect.trigger,
      `${path}.gaugeOnApplyDelayFrames`,
    );
  }
  if (v.tickDelayFrames !== undefined) {
    if (effect.state !== undefined) fail(`${path}.tickDelayFrames`, 'cannot be combined with state');
    effect.tickDelayFrames = isTimerTrigger(effect.trigger)
      ? parsePositiveInt(v.tickDelayFrames, `${path}.tickDelayFrames`)
      : parseShotCountDelay(v.tickDelayFrames, effect.trigger, `${path}.tickDelayFrames`);
  }
  if (effect.gaugeOnTick === true && effect.firstTick !== 'afterInterval') {
    fail(`${path}.gaugeOnTick`, 'needs firstTick afterInterval');
  }
}
