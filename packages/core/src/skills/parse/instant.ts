// スキル定義の読み込みの検査のうち、即時効果（instant の種類）と、遮蔽物 HP 回復（coverHeal）の読み込み。型は ../types.ts
import {
  type AmmoRefillEffect,
  BUFF_TARGETS,
  type BuffTarget,
  type CooldownReductionEffect,
  type CoverHealEffect,
  type EffectTrigger,
  type FullBurstExtendEffect,
  type HealEffect,
  type InstantEffect,
  type InstantKind,
  isAppliedTrigger,
  isEndedTrigger,
  isShotCountTrigger,
  isWeaponChangeEndTrigger,
  type SkillCooldownReductionEffect,
} from '../types.ts';
import {
  assertPositiveFinite,
  fail,
  type Json,
  oneOf,
  parseAssumes,
  parseDuration,
  parsePositiveInt,
  parseRef,
  rejectUnknownKeys,
} from './common.ts';
import { CONDITION_KEYS_OF, parseCondition, validateBurstStep } from './condition.ts';
import {
  LOWEST_HP_RATIO_HEAL_ONLY,
  parseTargetBurstStep,
  parseTargetClass,
  parseTargetCount,
  parseTargetElement,
  parseTargetWeapon,
  validateBurstUsersTarget,
} from './target.ts';
import {
  parseEndedTrigger,
  parseAppliedTrigger,
  parseShotCountDelay,
  parseSinceTimerTrigger,
  parseTimerDelayFrames,
  parseTrigger,
} from './trigger.ts';

/** 遮蔽物 HP 回復。対象は自分・味方全体・lowestCoverHp */
export function parseCoverHealEffect(v: Record<string, Json>, path: string): CoverHealEffect {
  rejectUnknownKeys(
    v,
    ['kind', 'trigger', 'target', 'targetCount', 'targetCountRef', 'ref', 'delayFrames', 'assumes', 'claims'],
    path,
  );
  if (v.target !== 'self' && v.target !== 'allies' && v.target !== 'lowestCoverHp')
    fail(`${path}.target`, `expected "self", "allies" or "lowestCoverHp", got ${JSON.stringify(v.target)}`);
  // CT ごとのアクティブ（リターの S2・ココアの S1）は時間の周期のきっかけ
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, { timer: true });
  const effect: CoverHealEffect = {
    kind: 'coverHeal',
    trigger,
    target: v.target,
    ref: parseRef(v.ref, `${path}.ref`),
    ...parseTargetCount(v, v.target, path),
  };
  const delayFrames = parseTimerDelayFrames(v.delayFrames, trigger, `${path}.delayFrames`);
  if (delayFrames !== undefined) effect.delayFrames = delayFrames;
  parseAssumes(v, effect, path);
  return effect;
}

/** 即時効果のどの種類にも書ける欄 */
const INSTANT_COMMON_KEYS = [
  'kind',
  'trigger',
  'target',
  'targetWeapon',
  'targetElement',
  'targetClass',
  'targetCount',
  'targetCountRef',
  'ref',
  'assumes',
  'claims',
];

/** 即時効果の種類ごとに足して書ける欄 */
const INSTANT_KIND_KEYS: Record<InstantKind, readonly string[]> = {
  // 編成の条件（burstStepMix・squad）、直書きの秒数（seconds）、発火の条件（condition。plan/design-skill-stage12.md 2.6 節）、
  // 戦闘中の発火の回数の上限（maxFires。plan/design-red-hood.md 2.3 節）、CT▲（increase）
  cooldownReduction: ['burstStepMix', 'squad', 'seconds', 'condition', 'maxFires', 'increase'],
  // 弾丸チャージの発数（scaling）
  ammoRefill: ['scaling'],
  // 維持時間（plan/design-heal-window.md 1.1 節）、回数トリガーの遅れ（delayFrames）、編成の条件（plan/design-heal-vocabulary.md
  // 2.1 節）と withCharacter（F5。同 3.3 節）、基本バースト段階の対象（targetBurstStep）、発火の条件（plan/design-mint-prika.md 2.7 節）
  heal: [
    'durationRef',
    'durationSeconds',
    'delayFrames',
    'burstStepMix',
    'squad',
    'withCharacter',
    'targetBurstStep',
    'condition',
  ],
  burstGauge: [],
  ammoDecrease: [],
  // 発火の条件
  fullBurstExtend: ['condition'],
  currentHpDown: [],
};

/** 即時効果の種類ごとに書ける欄（どの種類にも書ける欄と、種類ごとの欄） */
const INSTANT_KEYS_OF = {} as Record<InstantKind, readonly string[]>;
for (const kind of Object.keys(INSTANT_KIND_KEYS) as InstantKind[])
  INSTANT_KEYS_OF[kind] = [...INSTANT_COMMON_KEYS, ...INSTANT_KIND_KEYS[kind]];

/** 即時効果。欄のまとまりごとの関数を決まった順に呼ぶ（plan/design-split-long-functions.md 3.1 節） */
export function parseInstantEffect(v: Record<string, Json>, path: string, kind: InstantKind): InstantEffect {
  rejectUnknownKeys(v, INSTANT_KEYS_OF[kind], path);
  // CT▼▲は「〈状態〉が適用された時」（{ applied }）も書ける（対象は自分・条件は selfState だけ。plan/design-mint-prika.md 2.6 節）
  const applied = kind === 'cooldownReduction' ? parseAppliedTrigger(v.trigger, `${path}.trigger`) : undefined;
  if (applied !== undefined && v.target !== 'self')
    fail(`${path}.target`, 'a cooldown change on an applied trigger must target "self"');
  const trigger = applied ?? parseInstantTrigger(v, kind, path);
  const target = parseInstantTarget(v, kind, trigger, path);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const count = parseTargetCount(v, target, path);
  // burstGauge・fullBurstExtend は parseInstantTarget が対象を allies に限り、絞り込みの欄も弾いてある
  // cooldownReduction は直書きの秒数（seconds）も書ける（ref とちょうど片方）
  const seconds = v.seconds;
  if (seconds !== undefined) {
    if (v.ref !== undefined) fail(path, 'exactly one of ref and seconds is required');
    assertPositiveFinite(seconds, `${path}.seconds`);
  }
  const effect = (
    seconds !== undefined
      ? { kind, trigger, target, seconds }
      : { kind, trigger, target, ref: parseRef(v.ref, `${path}.ref`) }
  ) as InstantEffect;
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  // heal の「基本バースト段階が N の」（欄の一覧で heal だけに限ってある）
  const step = parseTargetBurstStep(v, target, path);
  if (step !== undefined) (effect as HealEffect).targetBurstStep = step;
  // heal も N 機の対象（lowestHpRatio）の N を持つ
  Object.assign(effect, count);
  parseInstantKindFields(v, effect, path);
  parseAssumes(v, effect, path);
  return effect;
}

/** 即時効果のきっかけ（{ applied } のほか）。種類ごとに書けるきっかけが違う */
function parseInstantTrigger(v: Record<string, Json>, kind: InstantKind, path: string): EffectTrigger {
  // F5（plan/design-heal-vocabulary.md 3.3 節）: heal は時間の周期のトリガー（atStart も）を書ける（エマ：TU の S1 の持続回復）
  // 現在の HP▼ は、状態の付いた時から数える周期（「1 秒間隔」）も書ける（plan/design-hp-down-interval.md 2.1 節）
  // 残弾数減少は「〈状態〉が終了した時」（{ ended }）も（plan/design-grave.md 2.1 節）
  const trigger =
    (kind === 'currentHpDown' ? parseSinceTimerTrigger(v.trigger, `${path}.trigger`, true) : undefined) ??
    (kind === 'ammoDecrease' ? parseEndedTrigger(v.trigger, `${path}.trigger`) : undefined) ??
    parseTrigger(v.trigger, `${path}.trigger`, {
      timer: kind === 'heal' ? 'withStart' : false,
      // 弾丸チャージも（plan/design-diesel.md 2.1 節）
      fullStack: kind === 'heal' || kind === 'ammoRefill',
      weaponChangeEnd: kind === 'ammoDecrease',
    });
  // 残弾数減少は自分にだけ。きっかけは使用武器の変更の終わり（plan/design-skill-stage11.md 2.2 節）と、
  // バースト使用時（ジルのバースト。100% で残弾 0 になり、リロードを始める。plan/design-skill-stage17.md 2.2 節）
  if (
    kind === 'ammoDecrease' &&
    !isWeaponChangeEndTrigger(trigger) &&
    !isEndedTrigger(trigger) &&
    trigger !== 'burstUse'
  )
    fail(`${path}.trigger`, 'ammoDecrease needs the trigger { weaponChangeEnd: true }, { ended } or "burstUse"');
  // 回復で回復を起こすと連鎖が閉じないので、heal のトリガーに healed は書けない（plan/design-stage11.md 3.3 節）
  if (kind === 'heal' && trigger === 'healed') fail(`${path}.trigger`, 'heal cannot be triggered by "healed"');
  return trigger;
}

/** 即時効果の対象。種類ごとに書ける対象と絞り込みが違う */
function parseInstantTarget(
  v: Record<string, Json>,
  kind: InstantKind,
  trigger: EffectTrigger,
  path: string,
): BuffTarget {
  // 現在の HP▼ も残弾数減少と同じく自分にだけ（plan/design-scarlet.md 2.1 節）
  if (kind === 'ammoDecrease' || kind === 'currentHpDown') {
    if (v.target !== 'self') fail(`${path}.target`, `${kind} must target "self"`);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, `${kind} cannot narrow its target`);
    }
  }
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'appliedCaster') fail(`${path}.target`, 'appliedCaster is only allowed in timed and state grants');
  validateBurstUsersTarget(target, trigger, path);
  // 基本チャージ時間の順位は timed だけ（plan/design-target-vocab.md 2.2 節）
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  // HP の割合の低い順は heal だけ（plan/design-skill-stage8.md 1.1 節）。武器・コードの絞り込みとは組み合わせない
  if (target === 'lowestHpRatio') {
    if (kind !== 'heal') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass']) {
      if (v[key] !== undefined)
        fail(`${path}.${key}`, 'lowestHpRatio cannot be combined with a weapon, element or class filter');
    }
  }
  // ゲージは編成で 1 本なので、対象は味方全体だけ（絞り込みも書けない）。フルバーストの窓も編成で 1 つ
  if (kind === 'burstGauge' || kind === 'fullBurstExtend') {
    const what = kind === 'burstGauge' ? 'the team shares one gauge' : 'the team shares one Full Burst window';
    if (target !== 'allies') fail(`${path}.target`, `${kind} must target "allies" (${what})`);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, `${kind} cannot narrow its target`);
    }
  }
  // 延長は窓の外のバースト 3 段階突入時か、バースト使用時だけ（対象の検査の後に見る。plan/design-skill-stage21.md 2.1 節）
  if (kind === 'fullBurstExtend' && trigger !== 'burstStage3Enter' && trigger !== 'burstUse')
    fail(`${path}.trigger`, 'fullBurstExtend needs the trigger "burstStage3Enter" or "burstUse"');
  return target;
}

/** 種類ごとの欄（書ける種類は INSTANT_KIND_KEYS で限ってある）: 維持・弾丸チャージの発数・遅れ・発火の条件・CT▲・発火の回数の上限 */
function parseInstantKindFields(v: Record<string, Json>, effect: InstantEffect, path: string): void {
  if (v.durationRef !== undefined || v.durationSeconds !== undefined) Object.assign(effect, parseDuration(v, path));
  if (v.scaling !== undefined) {
    if (v.scaling !== 'flat') fail(`${path}.scaling`, `ammoRefill only takes "flat", got ${JSON.stringify(v.scaling)}`);
    (effect as AmmoRefillEffect).scaling = 'flat';
  }
  // heal だけ（plan/design-shot-count-trigger-frame.md 6 節）
  if (v.delayFrames !== undefined) {
    (effect as HealEffect).delayFrames = parseShotCountDelay(v.delayFrames, effect.trigger, `${path}.delayFrames`);
  }
  // cooldownReduction・fullBurstExtend・heal だけ
  if (v.condition !== undefined) {
    const condition = parseCondition(
      v.condition,
      `${path}.condition`,
      // CT▼▲（{ applied } のほか）は使った段階も。ほか（フルバーストタイムの延長・回復・{ applied } の CT▼▲）は自分の状態だけ
      effect.kind === 'cooldownReduction' && !isAppliedTrigger(effect.trigger)
        ? CONDITION_KEYS_OF.cooldownReduction
        : CONDITION_KEYS_OF.selfStateOnly,
    );
    validateBurstStep(condition, effect.trigger, `${path}.condition`);
    (effect as CooldownReductionEffect | FullBurstExtendEffect | HealEffect).condition = condition;
  }
  // cooldownReduction だけ
  if (v.increase !== undefined) {
    if (v.increase !== true) fail(`${path}.increase`, 'must be true');
    (effect as CooldownReductionEffect).increase = true;
  }
  // cooldownReduction だけ
  if (v.maxFires !== undefined)
    (effect as CooldownReductionEffect).maxFires = parsePositiveInt(v.maxFires, `${path}.maxFires`);
}

/**
 * 「スキル N のクールタイム X%▼」（維持なし。plan/design-centi.md 2.1 節）。対象は自分だけ。きっかけは射撃の回数の毎 N 回だけ
 * （1 パス目が射撃を数えて当てる。数える窓・発火の窓・確率は使い手が出たら開く）。相手のスロットの印のある周期は
 * parse/crossChecks.ts の validateCooldownTimers が見る
 */
export function parseSkillCooldownReductionEffect(v: Record<string, Json>, path: string): SkillCooldownReductionEffect {
  rejectUnknownKeys(v, ['kind', 'trigger', 'target', 'slot', 'percentRef', 'assumes', 'claims'], path);
  const trigger = parseTrigger(v.trigger, `${path}.trigger`);
  if (!isShotCountTrigger(trigger))
    fail(`${path}.trigger`, 'skillCooldownReduction needs a shot count trigger ({ count })');
  const extra = Object.keys(trigger).find((k) => k !== 'count' && k !== 'every' && k !== 'everyRef');
  if (extra !== undefined)
    fail(`${path}.trigger.${extra}`, 'skillCooldownReduction only takes count, every and everyRef');
  if (v.target !== 'self') fail(`${path}.target`, 'skillCooldownReduction must target "self"');
  const effect: SkillCooldownReductionEffect = {
    kind: 'skillCooldownReduction',
    trigger,
    target: 'self',
    slot: oneOf(['skill1', 'skill2'] as const, v.slot, `${path}.slot`),
    percentRef: parseRef(v.percentRef, `${path}.percentRef`),
  };
  parseAssumes(v, effect, path);
  return effect;
}
