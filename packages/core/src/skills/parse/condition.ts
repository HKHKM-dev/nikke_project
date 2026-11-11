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
import { fail, isRecord, type Json, oneOf, parseNamedStateId, parsePositiveInt, parseRef } from './common.ts';

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: 状態の間だけ効く常時の効果の条件 { selfState }。selfState は条件と同じ形で
 * 読み、present: false は書けない（「〜でない時のみ」の使い手がいない）
 */
export function parseWhileCondition(v: Json, path: string): WhileCondition {
  if (!isRecord(v)) fail(path, 'expected { selfState } or { selfCounter }');
  const keys = Object.keys(v);
  for (const key of keys)
    if (key !== 'selfState' && key !== 'selfCounter')
      fail(`${path}.${key}`, 'unknown field (allowed: selfState, selfCounter)');
  if (keys.length !== 1) fail(path, 'expected exactly one of selfState and selfCounter');
  if (v.selfCounter !== undefined) {
    const c = parseSelfCounterCondition(v.selfCounter, `${path}.selfCounter`);
    if (c.atLeast === undefined || c.atLeast < 1)
      fail(`${path}.selfCounter`, 'while needs { counter, atLeast } with atLeast of at least 1');
    return { selfCounter: { counter: c.counter, atLeast: c.atLeast } };
  }
  const selfState = parseSelfStateCondition(v.selfState, `${path}.selfState`);
  if (!selfState.present) fail(`${path}.selfState.present`, 'while needs the state (present: false is not supported)');
  return { selfState };
}

/** 名前の付いた状態の語彙編（plan/design-named-state.md 10 節の論点 8）: 効果の種類ごとに受ける条件の鍵 */
export const CONDITION_KEYS_OF = {
  // 2 段目の段 10: selfCounter（カウンタの値。付与の条件にも使う）。エレグの段 3（plan/design-elegg-s3.md 3.2 節）: enemyState
  // レッドフード編（plan/design-red-hood.md 2.1 節）: burstStep（使った段階）
  // エード：エージェントバニー編（plan/design-agent-bunny.md 2.2 節）: inEffectiveRange（適正射程距離内なら）
  // 紅蓮編（plan/design-scarlet.md 2.2 節）: selfHp（以下の形だけ。parse/timed.ts）
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
  // 2 段目の段 11 の PR 5: damage にも selfCounter（ラプラス：アルティメットヒーローのバーストの追加ダメージ）
  // ソリン編（plan/design-soline.md 2.1 節）: selfHp（以上の形だけ。parse/damage.ts。発火のフレームの HP の割合で見る）
  damage: ['inFullBurst', 'enemyState', 'selfState', 'selfCounter', 'selfHp'],
  // 2 段目の段 17 の PR 4（plan/design-skill-stage17.md 2.2 節）: 持続ダメージは付くフレームの自分の状態だけ（ジルの硫酸弾）
  dot: ['selfState'],
  // 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 解除は、段 1.5 の判定に入る鍵と usedBurst
  removeState: ['selfBuffed', 'inFullBurst', 'selfState', 'usedBurst'],
  // 2 段目の段 6（plan/design-skill-stage6.md 1.4 節）: 常時の効果は、自分の HP の割合の条件だけ（編成の段で決まる）
  passive: ['selfHp'],
  // 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの増減は、自分の状態とカウンタの値。段 12 の PR 2: フルバーストの中か外か
  // 2 段目の段 13 の PR 2: usedBurst（ミハラ：ボンディングチェーンのフルバースト終了時のキャプチャーチェーンのチャージ）
  counterChange: ['selfState', 'selfCounter', 'inFullBurst', 'usedBurst'],
  // 2 段目の段 12 の PR 4（plan/design-skill-stage12.md 2.6 節）: クールタイム▼は自分の状態だけ
  // レッドフード編: と使った段階（burstStep）
  cooldownReduction: ['selfState', 'burstStep'],
  // レッドフード編: 使用武器の変更は使った段階だけ
  weaponChange: ['burstStep'],
  // 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: フルバーストタイムの延長は自分の状態だけ。ミント・プリカ編（plan/design-mint-prika.md
  // 2.3・2.5・2.7 節）: { applied } の効果・状態の維持の延長・回復も
  selfStateOnly: ['selfState'],
} as const satisfies Record<string, readonly ConditionKey[]>;

/** レッドフード編（plan/design-red-hood.md 2.1 節）: burstStep はバースト使用時（burstUse）のきっかけにだけ書ける */
export function validateBurstStep(condition: EffectCondition, trigger: unknown, path: string): void {
  if (condition.burstStep === undefined) return;
  if (trigger !== 'burstUse') {
    fail(`${path}.burstStep`, `burstStep is only allowed with trigger burstUse, got ${JSON.stringify(trigger)}`);
  }
}

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.5 節）: usedBurst はフルバーストの開始・終了のきっかけにだけ書ける。ディーゼル：ウィンタースイーツ編
 * （plan/design-diesel-ws.md 2.2 節）: その出来事の回数のきっかけ（{ count: 'fullBurstStart' | 'fullBurstEnd' }）にも
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
  /** 2 段目の段 12 の PR 2: inFullBurst に false（フルバーストタイムの外なら）を書けるか（counterChange と、段 14 の PR 3 から removeState） */
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
    // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 受けるダメージ▲は敵が持つ（自分の増加状態ではない）
    if (selfBuffed === 'damageTaken') fail(`${path}.selfBuffed`, 'damageTaken is held by the enemy, not by the caster');
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

/** 2 段目の段 10: 自分のカウンタの値の条件。{ counter, atLeast } か { counter, below }（ちょうど片方。0 と上限の間の整数） */
function parseSelfCounterCondition(v: Json, path: string): SelfCounterCondition {
  if (!isRecord(v)) fail(path, 'expected { counter, atLeast } or { counter, below }');
  for (const key of Object.keys(v))
    if (!['counter', 'atLeast', 'below'].includes(key)) fail(`${path}.${key}`, 'unknown field');
  const counter = oneOf(COUNTER_IDS, v.counter, `${path}.counter`);
  if ((v.atLeast === undefined) === (v.below === undefined)) fail(path, 'expected exactly one of atLeast and below');
  const key = v.atLeast !== undefined ? 'atLeast' : 'below';
  const n = parsePositiveInt(v[key], `${path}.${key}`);
  if (n > counterMax(counter))
    fail(`${path}.${key}`, `expected at most the max of ${counter} (${counterMax(counter)}), got ${n}`);
  return { counter, [key]: n };
}

/** 2 段目の段 6: 自分の HP の割合の条件。{ atLeastRef }（「自分の HP が X% 以上なら」）。段 15: { atLeast }（即値の %） */
// 紅蓮編（plan/design-scarlet.md 2.2 節）: atMostRef・atMost（以下）も。どちらの向きを書けるかは効果の種類ごとに呼ぶ側で見る
function parseSelfHpCondition(v: Json, path: string): SelfHpCondition {
  const keys = ['atLeastRef', 'atLeast', 'atMostRef', 'atMost'] as const;
  if (!isRecord(v)) fail(path, 'expected { atLeastRef }, { atLeast }, { atMostRef } or { atMost }');
  for (const key of Object.keys(v))
    if (!(keys as readonly string[]).includes(key)) fail(`${path}.${key}`, 'unknown field');
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
 * 2 段目の段 1: 自分の状態の条件。"<id>"（付いていれば）か { state, present }。
 * 2 段目の段 3（plan/design-skill-stage3.md 1.4 節）: { state, stacks: "full" | N }・{ state, stacksRef }（N スタック以上。present は省略か true）
 */
function parseSelfStateCondition(v: Json, path: string): SelfStateCondition {
  if (typeof v === 'string') return { state: parseNamedStateId(v, path, 'ally'), present: true };
  if (!isRecord(v)) fail(path, 'expected a state id or { state, present } or { state, stacks }');
  for (const key of Object.keys(v)) {
    if (!['state', 'present', 'stacks', 'stacksRef', 'sameFiring'].includes(key))
      fail(`${path}.${key}`, 'unknown field');
  }
  if (v.sameFiring !== undefined) {
    if (v.sameFiring !== true) fail(`${path}.sameFiring`, 'expected true');
    if (v.stacks === undefined && v.stacksRef === undefined)
      fail(`${path}.sameFiring`, 'needs a stack count (stacks or stacksRef)');
  }
  const state = parseNamedStateId(v.state, `${path}.state`, 'ally');
  if (v.stacks === undefined && v.stacksRef === undefined) {
    if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
    return { state, present: v.present };
  }
  if (v.present !== undefined && v.present !== true) {
    fail(`${path}.present`, 'a stack count condition cannot be negated (present must be true or omitted)');
  }
  if (v.stacks !== undefined && v.stacksRef !== undefined) fail(path, 'expected at most one of stacks and stacksRef');
  const condition: SelfStateCondition = { state, present: true };
  if (v.stacksRef !== undefined) condition.stacksRef = parseRef(v.stacksRef, `${path}.stacksRef`);
  else condition.stacks = v.stacks === 'full' ? 'full' : parsePositiveInt(v.stacks, `${path}.stacks`);
  if (v.sameFiring === true) condition.sameFiring = true;
  return condition;
}

/** 防御力無視ダメージ編: 編成に特定のキャラがいる条件 */
export function parseWithCharacterCondition(v: Json, path: string): WithCharacterCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) if (key !== 'rid' && key !== 'present') fail(`${path}.${key}`, 'unknown field');
  const rid = parsePositiveInt(v.rid, `${path}.rid`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { rid, present: v.present };
}

/** アニス：スター編: バースト段階の構成の条件 */
export function parseBurstStepMixCondition(v: Json, path: string): BurstStepMixCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) {
    if (key !== 'otherBurstStep' && key !== 'present') fail(`${path}.${key}`, 'unknown field');
  }
  const otherBurstStep = oneOf(BASIC_BURST_STEPS, v.otherBurstStep, `${path}.otherBurstStep`);
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { otherBurstStep, present: v.present };
}

/** ラム編: 同じ部隊の味方の条件 */
export function parseSquadCondition(v: Json, path: string): SquadCondition {
  if (!isRecord(v)) fail(path, 'expected an object');
  for (const key of Object.keys(v)) if (key !== 'present') fail(`${path}.${key}`, 'unknown field');
  if (typeof v.present !== 'boolean') fail(`${path}.present`, `expected a boolean, got ${JSON.stringify(v.present)}`);
  return { present: v.present };
}
