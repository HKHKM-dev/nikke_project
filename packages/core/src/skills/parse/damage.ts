// スキル定義の読み込みの検査のうち、倍率ダメージ（burstDamage・damage）の読み込み。型は ../types.ts
import { COUNTER_IDS } from '../counters.ts';
import {
  BURST_DAMAGE_TYPES,
  type BurstDamageEffect,
  DAMAGE_EFFECT_TYPES,
  type DamageEffect,
  type EffectTrigger,
  isAppliedTrigger,
  isCounterFullTrigger,
  isSelfHpAtMost,
  isShotCountTrigger,
  isSummonAttackTrigger,
  isTimerTrigger,
  type PeriodShorten,
  SKILL_SLOTS,
  splitsPerCount,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  oneOf,
  parseAssumes,
  parseGaugeHits,
  parseNamedStateId,
  parseNonNegativeInt,
  parsePositiveInt,
  parseRef,
  parseTrue,
  rejectUnknownKeys,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition } from './condition.ts';
import { parseDamageTrigger, parseShotCountDelay } from './trigger.ts';

export function parseBurstDamageEffect(v: Record<string, Json>, path: string): BurstDamageEffect {
  const damageType = oneOf(BURST_DAMAGE_TYPES, v.damageType, `${path}.damageType`);
  const effect: BurstDamageEffect = { kind: 'burstDamage', ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (v.hitsRef !== undefined) effect.hitsRef = parseRef(v.hitsRef, `${path}.hitsRef`);
  parseAssumes(v, effect, path);
  return effect;
}

/** gaugePerHit の数（射手の何ヒットぶんか。2 以上の整数） */
const isGaugeScale = (x: Json): x is number => Number.isInteger(x) && (x as number) >= 2;

/**
 * 倍率ダメージ。召喚の攻撃と蓄積して爆発するダメージは、ほかの欄と組まない形で先に読む。残りは欄のまとまりごとの関数を決まった順に呼ぶ
 * （後の検査が先に足した欄を読む。順を変えると、2 つ以上の誤りのある定義で最初に出る文と、出力の欄の順が変わる。
 * plan/design-split-long-functions.md 3.1 節）
 */
export function parseDamageEffect(v: Record<string, Json>, path: string): DamageEffect {
  const trigger = parseDamageTrigger(v.trigger, `${path}.trigger`);
  // 射撃ごと（every = 1）の倍率ダメージも書ける。1 トリガーの値に畳み込む（skills/burstDamage.ts の resolvePerShotDamage）
  const damageType = oneOf(DAMAGE_EFFECT_TYPES, v.damageType, `${path}.damageType`);
  const effect: DamageEffect = { kind: 'damage', trigger, ref: parseRef(v.ref, `${path}.ref`), damageType };
  if (damageType === 'fixedShare') return parseFixedShareDamage(v, effect, path);
  if (isSummonAttackTrigger(trigger)) return parseSummonDamage(v, effect, path);
  if (v.accumulate !== undefined) return parseAccumulateDamage(v, effect, path);
  parseGaugeHitsAndCondition(v, effect, path);
  parseDamageDelay(v, effect, path);
  parseHitShape(v, effect, path);
  parseValueTiming(v, effect, path);
  // 同 5.3 節: 「〈状態〉再発動周期 N 秒▼」
  if (v.periodShorten !== undefined)
    effect.periodShorten = parsePeriodShorten(v.periodShorten, trigger, `${path}.periodShorten`);
  parseDamageGaugePerHit(v, effect, path);
  // 同 5.4 節: 「コア命中ダメージ」
  if (v.coreHit !== undefined) effect.coreHit = parseTrue(v.coreHit, `${path}.coreHit`);
  parsePerCountSplit(v, effect, path);
  validateGaugePerHitSplit(effect, path);
  parseHitMarks(v, effect, path);
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * 与えたダメージ量の X% の固定ダメージ（plan/design-emilia.md 2.2 節）。フルチャージの発の毎回だけで、1 トリガーの値に畳み込むので
 * ほかの欄（条件・遅れ・ゲージ・数のヒット）とは組まない
 */
function parseFixedShareDamage(v: Record<string, Json>, effect: DamageEffect, path: string): DamageEffect {
  rejectUnknownKeys(
    v,
    ['kind', 'trigger', 'ref', 'damageType', 'assumes', 'claims', 'reads'],
    path,
    'not allowed with the damageType "fixedShare"',
  );
  const { trigger } = effect;
  if (!isShotCountTrigger(trigger) || trigger.count !== 'fullChargeShot' || Object.keys(trigger).length !== 1) {
    fail(`${path}.trigger`, 'fixedShare needs the trigger { count: "fullChargeShot" }');
  }
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * 召喚の攻撃は 1 パス目が発火を決めるので、ほかの欄（条件・遅れ・
 * 数のヒット）とは組まない（plan/design-ein-near-feather.md 1.2 節）。ゲージは gaugePerHit（true か、射手の何ヒットぶんかの数）だけ
 */
function parseSummonDamage(v: Record<string, Json>, effect: DamageEffect, path: string): DamageEffect {
  rejectUnknownKeys(
    v,
    ['kind', 'trigger', 'ref', 'damageType', 'gaugePerHit', 'assumes', 'claims', 'reads'],
    path,
    'not allowed with a summon trigger ({ summon })',
  );
  if (v.gaugePerHit !== undefined) {
    if (v.gaugePerHit !== true && !isGaugeScale(v.gaugePerHit))
      fail(`${path}.gaugePerHit`, `expected true or an integer of 2 or more, got ${JSON.stringify(v.gaugePerHit)}`);
    effect.gaugePerHit = v.gaugePerHit as true | number;
  }
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * 蓄積して爆発するダメージ（plan/design-accumulate-explosion.md 2.1 節）: 使い手の形（バースト使用時・窓の終わりの爆発か、フルチャージの
 * 発ごと・最大量か切れる時の爆発）だけを許し、ほかの欄とは組まない
 */
function parseAccumulateDamage(v: Record<string, Json>, effect: DamageEffect, path: string): DamageEffect {
  const { trigger } = effect;
  rejectUnknownKeys(
    v,
    ['kind', 'trigger', 'ref', 'damageType', 'accumulate', 'assumes', 'claims', 'reads'],
    path,
    'not allowed with accumulate',
  );
  if (effect.damageType !== 'distributed') fail(`${path}.accumulate`, 'accumulate needs the damageType "distributed"');
  const a = v.accumulate;
  const at = `${path}.accumulate`;
  if (!isRecord(a)) fail(at, 'expected an object');
  const source = oneOf(['team', 'self'] as const, a.source, `${at}.source`);
  const allowed =
    source === 'team'
      ? ['source', 'release', 'durationRef', 'releaseDelayFrames']
      : ['source', 'release', 'durationRef', 'ratioRef', 'applyDelayFrames', 'capDelayFrames'];
  rejectUnknownKeys(a, allowed, at);
  const durationRef = parseRef(a.durationRef, `${at}.durationRef`);
  if (source === 'team') {
    if (trigger !== 'burstUse') fail(at, 'accumulate (team) needs the trigger "burstUse"');
    effect.accumulate = {
      source,
      release: oneOf(['windowEnd'] as const, a.release, `${at}.release`),
      durationRef,
      releaseDelayFrames: parseNonNegativeInt(a.releaseDelayFrames, `${at}.releaseDelayFrames`),
    };
  } else {
    // 1 パス目が、フルチャージの発ごとに付けるか（付いている間は付けない）を決める
    const everyShot =
      isShotCountTrigger(trigger) && trigger.count === 'fullChargeShot' && Object.keys(trigger).length === 1;
    if (!everyShot) fail(at, 'accumulate (self) needs the trigger { "count": "fullChargeShot" }');
    effect.accumulate = {
      source,
      release: oneOf(['capOrExpire'] as const, a.release, `${at}.release`),
      durationRef,
      ratioRef: parseRef(a.ratioRef, `${at}.ratioRef`),
      applyDelayFrames: parseNonNegativeInt(a.applyDelayFrames, `${at}.applyDelayFrames`),
      capDelayFrames: parsePositiveInt(a.capDelayFrames, `${at}.capDelayFrames`),
    };
  }
  parseAssumes(v, effect, path);
  return effect;
}

/** ゲージのヒット（gaugeHits）と発火の条件（condition） */
function parseGaugeHitsAndCondition(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  const { trigger } = effect;
  if (v.gaugeHits !== undefined) {
    // ゲージは 1 パス目で射撃を数えて予約するので、射撃の回数トリガーのときだけ
    if (!isShotCountTrigger(trigger)) fail(`${path}.gaugeHits`, 'gaugeHits needs a shot count trigger');
    if (trigger.stacksRef !== undefined) fail(`${path}.gaugeHits`, 'gaugeHits cannot be used with stacksRef');
    effect.gaugeHits = parseGaugeHits(v.gaugeHits, `${path}.gaugeHits`, 0);
  }
  // 発火の条件。timed と同じ型（鍵は inFullBurst・enemyState）
  if (v.condition !== undefined)
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.damage);
  // selfHp は「以上」の形だけ（「HP が最大の場合」。使い手のいない「以下」は書けない。plan/design-soline.md 2.1 節）
  if (effect.condition?.selfHp !== undefined && isSelfHpAtMost(effect.condition.selfHp))
    fail(`${path}.condition.selfHp`, 'a damage takes only the at-least form of selfHp (atLeast or atLeastRef)');
  // ゲージは 1 パス目で溜めるので、1 パス目の後に決まる窓・条件とは組み合わせない（plan/design-kurumi-s2.md 2.4 節）
  if (effect.gaugeHits !== undefined && (effect.condition !== undefined || hasCountingWindow(trigger))) {
    fail(`${path}.gaugeHits`, 'gaugeHits cannot be used with a condition or a counting window (during)');
  }
}

/**
 * 発動からヒットまでの遅れ（delayFrames）。書けるきっかけは、バースト使用時（plan/design-delayed-skill-hit.md 3.1 節）と、
 * 「〈効果名〉が適用された時」（クイーン（真）S1 の追撃。plan/design-persona.md 9.3 節）と、
 * 周期のスキルの発動（時間の周期のトリガー。C-0453。plan/design-timer-ceil.md 2 節の論点 4）と、
 * 射撃の回数のきっかけ（確率を除く。plan/design-shot-count-trigger-frame.md 6.6 節）と、カウンタが上限に届いた時（{ counterFull }）
 */
function parseDamageDelay(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  if (v.delayFrames === undefined) return;
  const { trigger } = effect;
  if (isShotCountTrigger(trigger)) {
    effect.delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
    // ゲージのヒットのフレームは測っていない（ゲージは 1 パス目で射撃から数える）
    if (effect.gaugeHits !== undefined) fail(`${path}.delayFrames`, 'delayFrames cannot be used with gaugeHits');
    return;
  }
  if (
    trigger !== 'burstUse' &&
    !isAppliedTrigger(trigger) &&
    !isTimerTrigger(trigger) &&
    !isCounterFullTrigger(trigger)
  ) {
    fail(
      `${path}.delayFrames`,
      'delayFrames needs the trigger "burstUse", { applied }, { everySeconds }, { counterFull } or a shot count trigger',
    );
  }
  effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
}

/** ヒットの形: バーストのヒットに合わせる・値 × 数・N 回順番に攻撃とその間隔・等分した不等間隔のヒットと値を決めるフレーム */
function parseHitShape(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  const { trigger } = effect;
  if (v.perBurstHit !== undefined) {
    // バーストの倍率ダメージのヒットに合わせる（plan/design-mihara-burst-hits.md 3.2 節）
    parseTrue(v.perBurstHit, `${path}.perBurstHit`);
    if (trigger !== 'burstUse') fail(`${path}.perBurstHit`, 'perBurstHit needs the trigger "burstUse"');
    if (effect.delayFrames !== undefined) fail(`${path}.perBurstHit`, 'perBurstHit cannot be used with delayFrames');
    effect.perBurstHit = true;
  }
  if (v.perCount !== undefined) effect.perCount = parseDamagePerCount(v.perCount, trigger, `${path}.perCount`);
  // 「N 回順番に攻撃」（plan/design-new-chars-1029.md 5.2 節）
  if (v.hitsRef !== undefined) {
    if (isShotCountTrigger(trigger)) fail(`${path}.hitsRef`, 'hitsRef cannot be used with a shot count trigger');
    if (effect.perBurstHit === true) fail(`${path}.hitsRef`, 'hitsRef cannot be used with perBurstHit');
    effect.hitsRef = parseRef(v.hitsRef, `${path}.hitsRef`);
  }
  if (v.hitIntervalFrames !== undefined) {
    if (effect.hitsRef === undefined) fail(`${path}.hitIntervalFrames`, 'hitIntervalFrames needs hitsRef');
    const n = v.hitIntervalFrames;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
      fail(`${path}.hitIntervalFrames`, `expected an integer >= 0, got ${JSON.stringify(n)}`);
    }
    effect.hitIntervalFrames = n;
  }
  // エレグの S1（C-0766）: 等分した不等間隔のヒットと、値を決めるフレーム
  if (v.hitOffsetFrames !== undefined) {
    const at = `${path}.hitOffsetFrames`;
    // 昇順の 0 以上の整数はゲージのヒットと同じ検査。等分するヒットなので、2 つ以上・0 から・同じ遅れの重なりなしを足す
    const offsets = parseGaugeHits(v.hitOffsetFrames, at, 0);
    if (offsets.length < 2 || offsets[0] !== 0 || offsets.some((o, i) => i > 0 && o === offsets[i - 1]))
      fail(at, `expected strictly increasing integers starting at 0 (2 or more), got ${JSON.stringify(offsets)}`);
    if (
      effect.hitsRef !== undefined ||
      effect.perBurstHit !== undefined ||
      effect.perCount !== undefined ||
      effect.gaugeHits !== undefined
    )
      fail(at, 'hitOffsetFrames cannot be used with hitsRef, perBurstHit, perCount or gaugeHits');
    effect.hitOffsetFrames = offsets;
  }
  if (v.valueDelayFrames !== undefined) {
    const at = `${path}.valueDelayFrames`;
    if (effect.hitOffsetFrames === undefined) fail(at, 'valueDelayFrames needs hitOffsetFrames');
    const n = parsePositiveInt(v.valueDelayFrames, at);
    if (n > (effect.delayFrames ?? 0)) fail(at, 'valueDelayFrames must not exceed delayFrames');
    effect.valueDelayFrames = n;
  }
}

/**
 * 値 × 数（perCount）。値 × 状態のスタック数（シンデレラ。plan/design-skill-stage10.md 2.1 節）か、値 × カウンタの値
 * （ラプラス：アルティメットヒーロー。plan/design-skill-stage11.md 2.5 節）。きっかけは使い手のいるものだけ: バースト使用時、
 * フルバーストの始まり（ラピ：レッドフードの粘着榴弾の起爆。plan/design-skill-stage12.md 2.2 節）、カウンタが上限に届いた時
 * （ミハラ：ボンディングチェーンのチェーンの数だけの攻撃。plan/design-skill-stage13.md 2.2 節）、フルチャージして攻撃した時
 * （オートファイアの装填数分の順番の攻撃。plan/design-skill-stage14.md 2.5 節）
 */
function parseDamagePerCount(per: Json, trigger: EffectTrigger, at: string): NonNullable<DamageEffect['perCount']> {
  if (!isRecord(per)) fail(at, 'expected an object');
  const fullChargeShot = isShotCountTrigger(trigger) && trigger.count === 'fullChargeShot';
  if (trigger !== 'burstUse' && trigger !== 'fullBurstStart' && !isCounterFullTrigger(trigger) && !fullChargeShot)
    fail(at, 'perCount needs the trigger "burstUse", "fullBurstStart", { counterFull } or { count: "fullChargeShot" }');
  rejectUnknownKeys(per, ['state', 'counter'], at);
  if ((per.state === undefined) === (per.counter === undefined)) fail(at, 'expected exactly one of state and counter');
  return per.state !== undefined
    ? { state: parseNamedStateId(per.state, `${at}.state`, 'ally') }
    : { counter: oneOf(COUNTER_IDS, per.counter, `${at}.counter`) };
}

/** 値を決める時: 発火ごとの値（perTrigger）と、発火の前の値（valueBeforeFire） */
function parseValueTiming(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  if (v.perTrigger !== undefined) {
    const at = `${path}.perTrigger`;
    if (v.perTrigger !== true) fail(at, 'expected true');
    if (!isShotCountTrigger(effect.trigger)) fail(at, 'perTrigger needs a shot count trigger');
    if (effect.condition === undefined)
      fail(at, 'perTrigger needs a condition (a per-shot damage without one is folded into the shot)');
    effect.perTrigger = true;
  }
  if (v.valueBeforeFire !== undefined) {
    const at = `${path}.valueBeforeFire`;
    if (v.valueBeforeFire !== true) fail(at, 'expected true');
    if ((effect.delayFrames ?? 0) === 0) fail(at, 'valueBeforeFire needs delayFrames');
    if (effect.valueDelayFrames !== undefined) fail(at, 'valueBeforeFire cannot be used with valueDelayFrames');
    effect.valueBeforeFire = true;
  }
}

/** 「〈状態〉再発動周期 N 秒▼」（periodShorten）。状態の間か、名前の無い窓（きっかけから N 秒）の間だけ周期を縮める */
function parsePeriodShorten(p: Json, trigger: EffectTrigger, at: string): PeriodShorten {
  if (!isTimerTrigger(trigger)) fail(at, 'periodShorten needs a timer trigger ({ everySeconds })');
  if (!isRecord(p)) fail(at, 'expected an object');
  rejectUnknownKeys(p, ['state', 'window', 'slot', 'ref'], at);
  if ((p.state === undefined) === (p.window === undefined)) fail(at, 'expected exactly one of state and window');
  const slot = oneOf(SKILL_SLOTS, p.slot, `${at}.slot`);
  const ref = parseRef(p.ref, `${at}.ref`);
  if (p.state !== undefined) {
    return { state: parseNamedStateId(p.state, `${at}.state`, 'ally'), slot, ref };
  }
  // 名前の無い窓（きっかけから N 秒）。きっかけはいまはバースト使用時だけ
  const w = p.window;
  const windowAt = `${at}.window`;
  if (!isRecord(w)) fail(windowAt, 'expected an object');
  rejectUnknownKeys(w, ['trigger', 'durationRef', 'elapsed'], windowAt);
  if (w.trigger !== 'burstUse') fail(`${windowAt}.trigger`, `expected "burstUse", got ${JSON.stringify(w.trigger)}`);
  // 経過で縮める窓（ドロシーの発現）。端数を持ち越す周期とは組まない
  if (w.elapsed !== undefined) parseTrue(w.elapsed, `${windowAt}.elapsed`);
  if (w.elapsed === true && trigger.carry === true)
    fail(`${windowAt}.elapsed`, 'elapsed cannot be used with a carry timer');
  return {
    window: {
      trigger: 'burstUse',
      durationRef: parseRef(w.durationRef, `${windowAt}.durationRef`),
      ...(w.elapsed === true ? { elapsed: true as const } : {}),
    },
    slot,
    ref,
  };
}

/**
 * ヒットごとのゲージ（gaugePerHit）。周期の倍率ダメージ（V-0545。plan/design-new-chars-1029.md 11.2 節の b）と、
 * 射撃の回数のきっかけ（数える窓なし。plan/design-skill-stage14.md 2.5 節）と、カウンタが上限に届いた時（{ counterFull }。
 * plan/design-mihara-bc-gauge.md 2 節）の倍率ダメージに書ける
 */
function parseDamageGaugePerHit(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  if (v.gaugePerHit === undefined) return;
  const { trigger } = effect;
  // 射撃の回数のきっかけなら、射手の何ヒットぶんかの数（2 以上の整数）も
  // （居合は 1 回で射手の 2 ヒットぶん。V-0675。plan/design-new-chars-1029.md 12.2 節の b）
  const scaled = isShotCountTrigger(trigger) && isGaugeScale(v.gaugePerHit);
  if (v.gaugePerHit !== true && !scaled)
    fail(
      `${path}.gaugePerHit`,
      `expected true (or an integer of 2 or more with a shot count trigger), got ${JSON.stringify(v.gaugePerHit)}`,
    );
  if (
    !isTimerTrigger(trigger) &&
    !isCounterFullTrigger(trigger) &&
    !(isShotCountTrigger(trigger) && !hasCountingWindow(trigger))
  )
    fail(
      `${path}.gaugePerHit`,
      'gaugePerHit needs a timer trigger ({ everySeconds }), { counterFull } or a shot count trigger without a counting window',
    );
  if (effect.gaugeHits !== undefined) fail(`${path}.gaugePerHit`, 'gaugePerHit cannot be used with gaugeHits');
  // 1 パス目は名前の無い窓の短縮を追わない（使い手のエイダの S2 はゲージを溜めるかを確かめていない）
  if (effect.periodShorten?.window !== undefined)
    fail(`${path}.gaugePerHit`, 'gaugePerHit cannot be used with a periodShorten window');
  // 1 パス目は発火のフレームより後のゲージだけを予約できる。条件は 1 パス目の後に絞るので組み合わせない
  if (effect.delayFrames === undefined) fail(`${path}.gaugePerHit`, 'gaugePerHit needs delayFrames');
  // エレグの S1（C-0773）: 射撃の回数のきっかけなら、条件 enemyState だけは 1 パス目が発火のフレームで見る（skills/holders/views.ts の enemyStateAt）
  const enemyOnly =
    isShotCountTrigger(trigger) &&
    effect.condition !== undefined &&
    Object.keys(effect.condition).every((k) => k === 'enemyState');
  if (effect.condition !== undefined && !enemyOnly)
    fail(
      `${path}.gaugePerHit`,
      'gaugePerHit cannot be used with a condition (except enemyState with a shot count trigger)',
    );
  effect.gaugePerHit = scaled ? (v.gaugePerHit as number) : true;
}

/**
 * perCount の数のヒットを分けて出す: 間隔（perCountIntervalSeconds・perCountIntervalFrames）と「順番に攻撃」（sequentialAttack）。
 * perCount の { state } と delayFrames も（オートファイアの順番の攻撃。plan/design-skill-stage14.md 2.5 節）
 */
function parsePerCountSplit(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  if (v.perCountIntervalSeconds !== undefined) {
    const key = 'perCountIntervalSeconds';
    if (effect.perCount === undefined) fail(`${path}.${key}`, `${key} needs perCount`);
    if (effect.perBurstHit !== undefined) fail(`${path}.${key}`, `${key} cannot be used with perBurstHit`);
    const seconds = v.perCountIntervalSeconds;
    if (typeof seconds !== 'number' || !(seconds > 0))
      fail(`${path}.${key}`, `expected a positive number, got ${JSON.stringify(seconds)}`);
    effect.perCountIntervalSeconds = seconds;
  }
  if (v.perCountIntervalFrames !== undefined) {
    const key = 'perCountIntervalFrames';
    if (effect.perCount === undefined || !('counter' in effect.perCount))
      fail(`${path}.${key}`, `${key} needs perCount { counter }`);
    if (effect.perCountIntervalSeconds !== undefined || effect.perBurstHit !== undefined)
      fail(`${path}.${key}`, `${key} cannot be used with perCountIntervalSeconds or perBurstHit`);
    effect.perCountIntervalFrames = parsePositiveInt(v.perCountIntervalFrames, `${path}.${key}`);
  }
  // 「順番に攻撃」の perCount の数だけのヒット
  if (v.sequentialAttack !== undefined) {
    parseTrue(v.sequentialAttack, `${path}.sequentialAttack`);
    if (!splitsPerCount(effect))
      fail(`${path}.sequentialAttack`, 'sequentialAttack needs perCountIntervalSeconds or perCountIntervalFrames');
    effect.sequentialAttack = true;
  }
}

/**
 * 射撃の回数のきっかけのヒットごとのゲージは、1 パス目が数えられるヒット
 * （1 つずつ出すなら perCount の { state }）だけ（plan/design-skill-stage14.md 2.5 節）。{ counterFull } のきっかけは、perCount の
 * { counter } を perCountIntervalFrames で 1 つずつ出すヒットだけ（plan/design-mihara-bc-gauge.md 2 節）。perCount の分け方
 * （parsePerCountSplit）を読んだ後に見る
 */
function validateGaugePerHitSplit(effect: DamageEffect, path: string): void {
  if (effect.gaugePerHit !== undefined && isCounterFullTrigger(effect.trigger)) {
    if (effect.perCount === undefined || !('counter' in effect.perCount) || effect.perCountIntervalFrames === undefined)
      fail(
        `${path}.gaugePerHit`,
        'gaugePerHit with { counterFull } needs perCount { counter } and perCountIntervalFrames',
      );
    // 1 パス目は、ヒットの数を上限に届いたカウンタの上限で出す（frame/firstPass/counterGauges.ts）ので、数えるカウンタは同じもの
    if (effect.perCount.counter !== effect.trigger.counterFull)
      fail(`${path}.gaugePerHit`, 'gaugePerHit with { counterFull } needs perCount { counter } of the same counter');
    return;
  }
  if (effect.gaugePerHit === undefined || !isShotCountTrigger(effect.trigger) || effect.perCount === undefined) return;
  if (!('state' in effect.perCount) || !splitsPerCount(effect))
    fail(
      `${path}.gaugePerHit`,
      'gaugePerHit with perCount needs perCount { state } split by perCountIntervalSeconds or perCountIntervalFrames',
    );
}

/** 1 ヒットの印（コア・距離ボーナス・発射体の爆発・付着。plan/design-skill-stage12.md 2.2・2.3 節） */
function parseHitMarks(v: Record<string, Json>, effect: DamageEffect, path: string): void {
  for (const key of ['core', 'distance', 'projectileExplosion', 'projectileStick'] as const) {
    if (v[key] === undefined) continue;
    effect[key] = parseTrue(v[key], `${path}.${key}`);
  }
  if (effect.projectileExplosion === true && effect.projectileStick === true)
    fail(path, 'projectileExplosion and projectileStick cannot be used together');
}

/** 回数トリガーに数える窓（during）か、発火の窓（firesDuring。V-0443）があるか */
function hasCountingWindow(trigger: EffectTrigger): boolean {
  return (
    typeof trigger === 'object' &&
    'count' in trigger &&
    (('during' in trigger && trigger.during !== undefined) ||
      ('firesDuring' in trigger && trigger.firesDuring !== undefined))
  );
}
