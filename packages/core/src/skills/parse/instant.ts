// スキル定義の読み込みの検査のうち、即時効果（instant の種類）と、遮蔽物 HP 回復（coverHeal）の読み込み。型は ../types.ts
import {
  type AmmoRefillEffect,
  BUFF_TARGETS,
  type CooldownReductionEffect,
  type CoverHealEffect,
  type FullBurstExtendEffect,
  type HealEffect,
  type InstantEffect,
  type InstantKind,
  isWeaponChangeEndTrigger,
} from '../types.ts';
import { fail, type Json, oneOf, parseDuration, parseLocalizedText, parsePositiveInt, parseRef } from './common.ts';
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
import { parseShotCountDelay, parseSinceTimerTrigger, parseTimerDelayFrames, parseTrigger } from './trigger.ts';

/** 2 段目の段 15 の PR 2: 遮蔽物 HP 回復。段 17 の PR 1: 対象は自分か味方全体 */
export function parseCoverHealEffect(v: Record<string, Json>, path: string): CoverHealEffect {
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'targetCount',
        'targetCountRef',
        'ref',
        'delayFrames',
        'assumes',
        'claims',
      ].includes(key)
    )
      fail(`${path}.${key}`, 'unknown field');
  }
  if (v.target !== 'self' && v.target !== 'allies' && v.target !== 'lowestCoverHp')
    fail(`${path}.target`, `expected "self", "allies" or "lowestCoverHp", got ${JSON.stringify(v.target)}`);
  // 段 17 の PR 2: CT ごとのアクティブ（リターの S2・ココアの S1）は時間の周期のきっかけ
  const trigger = parseTrigger(v.trigger, `${path}.trigger`, true);
  const effect: CoverHealEffect = {
    kind: 'coverHeal',
    trigger,
    target: v.target,
    ref: parseRef(v.ref, `${path}.ref`),
    ...parseTargetCount(v, v.target, path),
  };
  const delayFrames = parseTimerDelayFrames(v.delayFrames, trigger, `${path}.delayFrames`);
  if (delayFrames !== undefined) effect.delayFrames = delayFrames;
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}

export function parseInstantEffect(v: Record<string, Json>, path: string, kind: InstantKind): InstantEffect {
  // 維持時間は heal だけ（plan/design-heal-window.md 1.1 節）。回数トリガーの遅れ編: delayFrames も heal だけ
  const durationKeys = kind === 'heal' ? ['durationRef', 'durationSeconds', 'delayFrames'] : [];
  // 編成の条件は cooldownReduction と heal（回復の語彙編。plan/design-heal-vocabulary.md 2.1 節）。heal は withCharacter も（F5。3.3 節）
  const compositionKeys =
    kind === 'cooldownReduction'
      ? ['burstStepMix', 'squad']
      : kind === 'heal'
        ? ['burstStepMix', 'squad', 'withCharacter', 'targetBurstStep']
        : [];
  // 種類ごとの欄: 弾丸チャージの発数（scaling）。2 段目の段 12: cooldownReduction の直書きの秒数（seconds。PR 3）と発火の条件
  // （condition。PR 4。plan/design-skill-stage12.md 2.6 節）
  // 2 段目の段 21: fullBurstExtend の発火の条件（condition）
  const kindKeys =
    kind === 'ammoRefill'
      ? ['scaling']
      : kind === 'cooldownReduction'
        ? // レッドフード編（plan/design-red-hood.md 2.3 節）: 戦闘中の発火の回数の上限（maxFires）
          ['seconds', 'condition', 'maxFires']
        : kind === 'fullBurstExtend'
          ? ['condition']
          : [];
  for (const key of Object.keys(v)) {
    if (
      ![
        'kind',
        'trigger',
        'target',
        'targetWeapon',
        'targetElement',
        'targetClass',
        'targetCount',
        'targetCountRef',
        'ref',
        ...durationKeys,
        ...compositionKeys,
        ...kindKeys,
        'assumes',
        'claims',
      ].includes(key)
    ) {
      fail(`${path}.${key}`, 'unknown field');
    }
  }
  const hasDuration = v.durationRef !== undefined || v.durationSeconds !== undefined;
  // F5（plan/design-heal-vocabulary.md 3.3 節）: heal は時間の周期のトリガー（atStart も）を書ける（エマ：TU の S1 の持続回復）
  // A2 の B モード編（plan/design-hp-down-interval.md 2.1 節）: 現在の HP▼ は、状態の付いた時から数える周期（「1 秒間隔」）も書ける
  const trigger =
    (kind === 'currentHpDown' ? parseSinceTimerTrigger(v.trigger, `${path}.trigger`, true) : undefined) ??
    parseTrigger(
      v.trigger,
      `${path}.trigger`,
      kind === 'heal' ? 'withStart' : false,
      false,
      false,
      kind === 'heal',
      kind === 'ammoDecrease',
    );
  // 2 段目の段 11（plan/design-skill-stage11.md 2.2 節）: 残弾数減少は、使用武器の変更の終わりのきっかけで自分にだけ。2 段目の段 17 の
  // PR 4（plan/design-skill-stage17.md 2.2 節）: バースト使用時も（ジルのバースト。100% で残弾 0 になり、リロードを始める）
  if (kind === 'ammoDecrease' && !isWeaponChangeEndTrigger(trigger) && trigger !== 'burstUse')
    fail(`${path}.trigger`, 'ammoDecrease needs the trigger { weaponChangeEnd: true } or "burstUse"');
  // 紅蓮編（plan/design-scarlet.md 2.1 節）: 現在の HP▼ も残弾数減少と同じく自分にだけ
  if (kind === 'ammoDecrease' || kind === 'currentHpDown') {
    if (v.target !== 'self') fail(`${path}.target`, `${kind} must target "self"`);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, `${kind} cannot narrow its target`);
    }
  }
  // 回復で回復を起こすと連鎖が閉じないので、heal のトリガーに healed は書けない（plan/design-stage11.md 3.3 節）
  if (kind === 'heal' && trigger === 'healed') fail(`${path}.trigger`, 'heal cannot be triggered by "healed"');
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  validateBurstUsersTarget(target, trigger, path);
  // 対象の語彙編: 基本チャージ時間の順位は timed だけ（plan/design-target-vocab.md 2.2 節）
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  // 2 段目の段 8（plan/design-skill-stage8.md 1.1 節）: HP の割合の低い順は heal だけ。武器・コードの絞り込みとは組み合わせない
  if (target === 'lowestHpRatio') {
    if (kind !== 'heal') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass']) {
      if (v[key] !== undefined)
        fail(`${path}.${key}`, 'lowestHpRatio cannot be combined with a weapon, element or class filter');
    }
  }
  // ヘルム編: ゲージは編成で 1 本なので、対象は味方全体だけ（絞り込みも書けない）。2 段目の段 21: フルバーストの窓も編成で 1 つ
  if (kind === 'burstGauge' || kind === 'fullBurstExtend') {
    const what = kind === 'burstGauge' ? 'the team shares one gauge' : 'the team shares one Full Burst window';
    if (target !== 'allies') fail(`${path}.target`, `${kind} must target "allies" (${what})`);
    for (const key of ['targetWeapon', 'targetElement', 'targetClass', 'targetCount', 'targetCountRef']) {
      if (v[key] !== undefined) fail(`${path}.${key}`, `${kind} cannot narrow its target`);
    }
  }
  // 2 段目の段 21（plan/design-skill-stage21.md 2.1 節）: 延長は窓の外のバースト 3 段階突入時か、バースト使用時だけ
  if (kind === 'fullBurstExtend' && trigger !== 'burstStage3Enter' && trigger !== 'burstUse')
    fail(`${path}.trigger`, 'fullBurstExtend needs the trigger "burstStage3Enter" or "burstUse"');
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const count = parseTargetCount(v, target, path);
  // burstGauge は上で対象を allies に限り、絞り込みの欄も弾いてある
  // 2 段目の段 12: cooldownReduction は直書きの秒数（seconds）も書ける（ref とちょうど片方）
  const seconds = v.seconds;
  if (seconds !== undefined) {
    if (v.ref !== undefined) fail(path, 'exactly one of ref and seconds is required');
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
      fail(`${path}.seconds`, `expected a positive finite number, got ${JSON.stringify(seconds)}`);
    }
  }
  const effect = (
    seconds !== undefined
      ? { kind, trigger, target, seconds }
      : { kind, trigger, target, ref: parseRef(v.ref, `${path}.ref`) }
  ) as InstantEffect;
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  // 2 段目の段 15 の PR 3: heal の「基本バースト段階が N の」（欄の一覧で heal だけに限ってある）
  const step = parseTargetBurstStep(v, target, path);
  if (step !== undefined) (effect as HealEffect).targetBurstStep = step;
  // 2 段目の段 8: heal も N 機の対象（lowestHpRatio）の N を持つ
  Object.assign(effect, count);
  if (hasDuration) Object.assign(effect, parseDuration(v, path));
  if (v.scaling !== undefined) {
    if (v.scaling !== 'flat') fail(`${path}.scaling`, `ammoRefill only takes "flat", got ${JSON.stringify(v.scaling)}`);
    (effect as AmmoRefillEffect).scaling = 'flat';
  }
  // 回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: heal だけ（欄の一覧で弾いてある）
  if (v.delayFrames !== undefined) {
    (effect as HealEffect).delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
  }
  // 2 段目の段 12 の PR 4: 欄の一覧で cooldownReduction（段 21: と fullBurstExtend）だけに限ってある
  if (v.condition !== undefined) {
    const condition = parseCondition(
      v.condition,
      `${path}.condition`,
      kind === 'fullBurstExtend' ? CONDITION_KEYS_OF.fullBurstExtend : CONDITION_KEYS_OF.cooldownReduction,
    );
    validateBurstStep(condition, trigger, `${path}.condition`);
    (effect as CooldownReductionEffect | FullBurstExtendEffect).condition = condition;
  }
  // レッドフード編: 欄の一覧で cooldownReduction だけに限ってある
  if (v.maxFires !== undefined)
    (effect as CooldownReductionEffect).maxFires = parsePositiveInt(v.maxFires, `${path}.maxFires`);
  if (v.assumes !== undefined) effect.assumes = parseLocalizedText(v.assumes, `${path}.assumes`);
  return effect;
}
