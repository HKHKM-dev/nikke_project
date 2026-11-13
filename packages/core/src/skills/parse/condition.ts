// スキル定義の読み込みの検査のうち、条件（condition・while・withCharacter・burstStepMix・squad）の読み込み。型は ../types.ts
import { COUNTER_IDS, counterMax } from '../counters.ts';
import {
  BASIC_BURST_STEPS,
  BUFF_STATS,
  BURST_USERS_TRIGGERS,
  burstUsersEventOf,
  type BurstStepMixCondition,
  type ConditionKey,
  type CounterChangeEffect,
  type EffectCondition,
  isFlagStat,
  type SelfCounterCondition,
  type SelfHpCondition,
  type SelfStateCondition,
  type SquadCondition,
  type WhileCondition,
  type WithCharacterCondition,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  oneOf,
  parseNamedStateId,
  parsePositiveInt,
  parseRef,
  rejectUnknownKeys,
} from './common.ts';

/**
 * 状態の間だけ効く常時の効果の条件 { selfState }（plan/design-skill-stage9.md 1.3 節）。selfState は条件と同じ形で
 * 読み、present: false は書けない（「〜でない時のみ」の使い手がいない）
 */
export function parseWhileCondition(v: Json, path: string): WhileCondition {
  if (!isRecord(v)) fail(path, 'expected { selfState } or { selfCounter }');
  rejectUnknownKeys(v, ['selfState', 'selfCounter'], path, 'unknown field (allowed: selfState, selfCounter)');
  if (Object.keys(v).length !== 1) fail(path, 'expected exactly one of selfState and selfCounter');
  if (v.selfCounter !== undefined) {
    const c = parseSelfCounterCondition(v.selfCounter, `${path}.selfCounter`);
    if (c.atLeast === undefined || c.atLeast < 1)
      fail(`${path}.selfCounter`, 'while needs { counter, atLeast } with atLeast of at least 1');
    return { selfCounter: { counter: c.counter, atLeast: c.atLeast } };
  }
  const selfState = parseSelfStateCondition(v.selfState, `${path}.selfState`);
  if (!selfState.present) fail(`${path}.selfState.present`, 'while needs the state (present: false is not supported)');
  if (selfState.stacksBelow !== undefined) fail(`${path}.selfState.stacksBelow`, 'stacksBelow is not allowed in while');
  return { selfState };
}

/** 効果の種類ごとに受ける条件の鍵（plan/design-named-state.md 10 節の論点 8） */
export const CONDITION_KEYS_OF = {
  // selfCounter（カウンタの値。付与の条件にも使う）。enemyState（plan/design-elegg-s3.md 3.2 節）
  // burstStep（使った段階。plan/design-red-hood.md 2.1 節）
  // inEffectiveRange（適正射程距離内なら。plan/design-agent-bunny.md 2.2 節）
  // selfHp（以下の形だけ。parse/timed.ts。plan/design-scarlet.md 2.2 節）
  timed: [
    'selfBuffed',
    'inFullBurst',
    'enemyState',
    'selfState',
    'usedBurst',
    'selfCounter',
    'burstStep',
    'inEffectiveRange',
    'selfHp',
  ],
  // damage にも selfCounter（ラプラス：アルティメットヒーローのバーストの追加ダメージ）
  // selfHp（以上の形だけ。parse/damage.ts。発火のフレームの HP の割合で見る。plan/design-soline.md 2.1 節）
  damage: ['inFullBurst', 'enemyState', 'selfState', 'selfCounter', 'selfHp'],
  // 持続ダメージは付くフレームの自分の状態だけ（ジルの硫酸弾。plan/design-skill-stage17.md 2.2 節）
  dot: ['selfState'],
  // 解除は、段 1.5 の判定に入る鍵と usedBurst（plan/design-skill-stage1.md 1.2 節）
  removeState: ['selfBuffed', 'inFullBurst', 'selfState', 'usedBurst'],
  // 常時の効果は、自分の HP の割合の条件だけ（編成の段で決まる。plan/design-skill-stage6.md 1.4 節）
  passive: ['selfHp'],
  // カウンタの増減は、自分の状態・カウンタの値・フルバーストの中か外か（plan/design-skill-stage10.md 2.3 節）
  // usedBurst（ミハラ：ボンディングチェーンのフルバースト終了時のキャプチャーチェーンのチャージ）
  counterChange: ['selfState', 'selfCounter', 'inFullBurst', 'usedBurst'],
  // クールタイム▼は自分の状態と使った段階（burstStep）だけ（plan/design-skill-stage12.md 2.6 節）
  cooldownReduction: ['selfState', 'burstStep'],
  // 使用武器の変更は使った段階と、自分の状態のスタック数（plan/design-maxwell-om.md 2.2 節。parse/weapon.ts がスタック数の形に限る）
  weaponChange: ['burstStep', 'selfState'],
  // フルバーストタイムの延長は自分の状態だけ（plan/design-skill-stage21.md 2.1 節）。{ applied } の効果・状態の維持の延長・
  // 回復も（plan/design-mint-prika.md 2.3・2.5・2.7 節）
  selfStateOnly: ['selfState'],
} as const satisfies Record<string, readonly ConditionKey[]>;

/** burstStep はバースト使用時（burstUse）のきっかけにだけ書ける（plan/design-red-hood.md 2.1 節） */
export function validateBurstStep(condition: EffectCondition, trigger: unknown, path: string): void {
  if (condition.burstStep === undefined) return;
  if (trigger !== 'burstUse') {
    fail(`${path}.burstStep`, `burstStep is only allowed with trigger burstUse, got ${JSON.stringify(trigger)}`);
  }
}

/**
 * usedBurst はフルバーストの開始・終了のきっかけにだけ書ける（plan/design-skill-stage1.md 1.5 節）。その出来事の回数のきっかけ
 * （{ count: 'fullBurstStart' | 'fullBurstEnd' }。plan/design-diesel-ws.md 2.2 節）にも
 */
export function validateUsedBurst(
  condition: EffectCondition,
  trigger: CounterChangeEffect['trigger'],
  path: string,
): void {
  if (condition.usedBurst === undefined) return;
  if (burstUsersEventOf(trigger) !== undefined) return;
  fail(
    `${path}.usedBurst`,
    `usedBurst is only allowed with trigger ${BURST_USERS_TRIGGERS.join(' or ')} (or { count } of them), got ${JSON.stringify(trigger)}`,
  );
}

/**
 * 発火の条件（timed・付与・damage で 1 つの型）。キーは allowed のうち 1 つ以上で、どれも満たすときだけ発火する（AND）。
 * 効果の種類ごとの規則（1 パス目で窓を追う stat には inFullBurst を書けない など）は呼ぶ側で見る
 */
export function parseCondition(
  c: Json,
  path: string,
  allowed: readonly ConditionKey[],
  /** inFullBurst に false（フルバーストタイムの外なら）を書けるか（counterChange と removeState） */
  outsideFullBurst = false,
): EffectCondition {
  if (!isRecord(c)) fail(path, `expected an object with ${allowed.join(' / ')}`);
  for (const key of Object.keys(c)) {
    if (!(allowed as readonly string[]).includes(key))
      fail(`${path}.${key}`, `unknown field (allowed: ${allowed.join(', ')})`);
  }
  const condition: EffectCondition = {};
  if (c.selfBuffed !== undefined) {
    const selfBuffed = oneOf(BUFF_STATS, c.selfBuffed, `${path}.selfBuffed`);
    if (isFlagStat(selfBuffed)) fail(`${path}.selfBuffed`, `${selfBuffed} is not a buff state`);
    // 受けるダメージ▲は敵が持つ（自分の増加状態ではない。plan/design-holder-effects.md 2.8 節）
    if (selfBuffed === 'damageTaken') fail(`${path}.selfBuffed`, 'damageTaken is held by the enemy, not by the caster');
    // 射撃の姿勢の長さの倍率は既定が 1 の掛け合わせで、「和 > 0 で増加状態」と読めない（plan/design-a2-bmode-stance.md 3.1 節）
    if (selfBuffed === 'fireStanceScale')
      fail(`${path}.selfBuffed`, 'fireStanceScale is a multiplier, not a buff state');
    condition.selfBuffed = selfBuffed;
  }
  if (c.inFullBurst !== undefined) {
    if (c.inFullBurst !== true && !(outsideFullBurst && c.inFullBurst === false))
      fail(`${path}.inFullBurst`, outsideFullBurst ? 'expected a boolean' : 'expected true');
    condition.inFullBurst = c.inFullBurst;
  }
  if (c.enemyState !== undefined) condition.enemyState = parseNamedStateId(c.enemyState, `${path}.enemyState`, 'enemy');
  if (c.selfState !== undefined) condition.selfState = parseSelfStateCondition(c.selfState, `${path}.selfState`);
  if (c.usedBurst !== undefined) {
    if (typeof c.usedBurst !== 'boolean') fail(`${path}.usedBurst`, 'expected a boolean');
    condition.usedBurst = c.usedBurst;
  }
  if (c.selfHp !== undefined) condition.selfHp = parseSelfHpCondition(c.selfHp, `${path}.selfHp`);
  if (c.selfCounter !== undefined)
    condition.selfCounter = parseSelfCounterCondition(c.selfCounter, `${path}.selfCounter`);
  if (c.burstStep !== undefined) condition.burstStep = oneOf(BASIC_BURST_STEPS, c.burstStep, `${path}.burstStep`);
  if (c.inEffectiveRange !== undefined) {
    if (c.inEffectiveRange !== true) fail(`${path}.inEffectiveRange`, 'expected true');
    condition.inEffectiveRange = true;
  }
  if (Object.keys(condition).length === 0) fail(path, `expected at least one of ${allowed.join(', ')}`);
  return condition;
}

/** 自分のカウンタの値の条件。{ counter, atLeast } か { counter, below }（ちょうど片方。0 と上限の間の整数） */
function parseSelfCounterCondition(v: Json, path: string): SelfCounterCondition {
  if (!isRecord(v)) fail(path, 'expected { counter, atLeast } or { counter, below }');
  rejectUnknownKeys(v, ['counter', 'atLeast', 'below'], path);
  const counter = oneOf(COUNTER_IDS, v.counter, `${path}.counter`);
  if ((v.atLeast === undefined) === (v.below === undefined)) fail(path, 'expected exactly one of atLeast and below');
  const key = v.atLeast !== undefined ? 'atLeast' : 'below';
  const n = parsePositiveInt(v[key], `${path}.${key}`);
  if (n > counterMax(counter))
    fail(`${path}.${key}`, `expected at most the max of ${counter} (${counterMax(counter)}), got ${n}`);
  return { counter, [key]: n };
}

/** 自分の HP の割合の条件。{ atLeastRef }（「自分の HP が X% 以上なら」）と { atLeast }（即値の %） */
// atMostRef・atMost（以下）も（plan/design-scarlet.md 2.2 節）。どちらの向きを書けるかは効果の種類ごとに呼ぶ側で見る
function parseSelfHpCondition(v: Json, path: string): SelfHpCondition {
  const keys = ['atLeastRef', 'atLeast', 'atMostRef', 'atMost'] as const;
  if (!isRecord(v)) fail(path, 'expected { atLeastRef }, { atLeast }, { atMostRef } or { atMost }');
  rejectUnknownKeys(v, keys, path);
  const present = keys.filter((key) => v[key] !== undefined);
  if (present.length !== 1) fail(path, `write exactly one of ${keys.join(', ')}`);
  const key = present[0]!;
  if (key === 'atLeast' || key === 'atMost') {
    const x = v[key];
    if (typeof x !== 'number' || !(x > 0 && x <= 100)) fail(`${path}.${key}`, 'expected a percent in (0, 100]');
    return key === 'atLeast' ? { atLeast: x } : { atMost: x };
  }
  const ref = parseRef(v[key], `${path}.${key}`);
  return key === 'atLeastRef' ? { atLeastRef: ref } : { atMostRef: ref };
}

/**
 * 自分の状態の条件。"<id>"（付いていれば）か { state, present }。
 * { state, stacks: "full" | N }・{ state, stacksRef }（N スタック以上。present は省略か true。plan/design-skill-stage3.md 1.4 節）。
 * stacksBelow（N スタック未満。stacks の数・stacksRef と組める。plan/design-maxwell-om.md 2.2 節）
 */
function parseSelfStateCondition(v: Json, path: string): SelfStateCondition {
  if (typeof v === 'string') return { state: parseNamedStateId(v, path, 'ally'), present: true };
  if (!isRecord(v)) fail(path, 'expected a state id or { state, present } or { state, stacks }');
  rejectUnknownKeys(v, ['state', 'present', 'stacks', 'stacksRef', 'stacksBelow', 'sameFiring'], path);
  if (v.sameFiring !== undefined) {
    if (v.sameFiring !== true) fail(`${path}.sameFiring`, 'expected true');
    if (v.stacks === undefined && v.stacksRef === undefined && v.stacksBelow === undefined)
      fail(`${path}.sameFiring`, 'needs a stack count (stacks, stacksRef or stacksBelow)');
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  if (v.stacks === undefined && v.stacksRef === undefined && v.stacksBelow === undefined) {
    if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
    return { state, present: v.present };
  }
  if (v.present !== undefined && v.present !== true) {
    fail(`${path}.present`, 'a stack count condition cannot be negated (present must be true or omitted)');
  }
  if (v.stacks !== undefined && v.stacksRef !== undefined) fail(path, 'expected at most one of stacks and stacksRef');
  const condition: SelfStateCondition = { state, present: true };
  if (v.stacksRef !== undefined) condition.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
  else if (v.stacks !== undefined)
    condition.stacks = v.stacks === 'full' ? 'full' : parsePositiveInt(v.stacks, `${path}.stacks`);
  if (v.stacksBelow !== undefined) {
    const below = parsePositiveInt(v.stacksBelow, `${path}.stacksBelow`);
    if (condition.stacks === 'full') fail(`${path}.stacksBelow`, 'stacksBelow cannot be combined with stacks: "full"');
    if (typeof condition.stacks === 'number' && below <= condition.stacks)
      fail(`${path}.stacksBelow`, `stacksBelow must be greater than stacks (${condition.stacks}), got ${below}`);
    condition.stacksBelow = below;
  }
  if (v.sameFiring === true) condition.sameFiring = true;
  return condition;
}

/** 編成に特定のキャラがいる条件 */
export function parseWithCharacterCondition(v: Json, path: string): WithCharacterCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  rejectUnknownKeys(v, ['rid', 'present'], path);
  const rid = parsePositiveInt(v.rid, `${path}.rid`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { rid, present: v.present };
}

/** バースト段階の構成の条件 */
export function parseBurstStepMixCondition(v: Json, path: string): BurstStepMixCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  rejectUnknownKeys(v, ['otherBurstStep', 'present'], path);
  const otherBurstStep = oneOf(BASIC_BURST_STEPS, v.otherBurstStep, `${path}.otherBurstStep`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { otherBurstStep, present: v.present };
}

/** 同じ部隊の味方の条件 */
export function parseSquadCondition(v: Json, path: string): SquadCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  rejectUnknownKeys(v, ['present'], path);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { present: v.present };
}
