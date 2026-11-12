// スキル定義の読み込みの検査のうち、常時の効果（passive）と持続の効果（timed）の読み込み。timed の欄の規則は状態の付与（state.ts）と共有する。型は ../types.ts
import type { WeaponType } from '../../types.ts';
import { COUNTER_IDS } from '../counters.ts';
import {
  type Amplifies,
  BUFF_SCALINGS,
  BUFF_STATS,
  BUFF_TARGETS,
  type BuffScaling,
  type BuffStat,
  type BuffTarget,
  type GrantDurationUntil,
  DURATION_UNTILS,
  EXCLUDE_SELF,
  type ExcludeSelf,
  isAppliedTrigger,
  isAllyDecrease,
  isEnemyHeldStat,
  isChanceTrigger,
  isFiringStat,
  isFixedAttackScaling,
  isFlagStat,
  isHitStateStat,
  isMaxHpStat,
  isPassiveFlagStat,
  isPelletStat,
  STATIC_PASSIVE_FLAG_STATS,
  isSelfHpAtMostTrigger,
  isSelfHpAtMost,
  isStateStat,
  isTimerTrigger,
  SKILL_SLOTS,
  TARGET_DEFENSES,
  type PassiveEffect,
  type TargetDefense,
  type TimedEffect,
} from '../types.ts';
import {
  fail,
  isRecord,
  type Json,
  objectUntil,
  oneOf,
  parseAssumes,
  parseDuration,
  parseNamedStateId,
  parsePositiveInt,
  parseRef,
  parseTrue,
} from './common.ts';
import {
  CONDITION_KEYS_OF,
  parseCondition,
  parseWhileCondition,
  validateBurstStep,
  validateUsedBurst,
} from './condition.ts';
import {
  LOWEST_HP_RATIO_HEAL_ONLY,
  parsePersonaTargetFields,
  parseTargetClass,
  parseTargetCount,
  parseTargetElement,
  parseTargetSquad,
  parseTargetWeapon,
  validateBurstUsersTarget,
  validateDamageTaken,
} from './target.ts';
import {
  parseAppliedTrigger,
  parseChargeTrigger,
  parseCounterFullTrigger,
  parseCoverHealedTrigger,
  parseEndedTrigger,
  parseSelfHpAtMostTrigger,
  parseShotCountDelay,
  parseStateEndUntil,
  parseTrigger,
} from './trigger.ts';

/**
 * casterAttack は attack だけ、flat（Stage 10）は maxAmmo（発数）と chargeSpeed（対象の語彙編。「チャージ時間 X 秒▼」の秒）と
 * burstCooldown（段 11 の PR 3。「バーストスキルクールタイム X 秒▼」の秒。burstCooldown は flat だけ）
 */
function validateScaling(scaling: BuffScaling | undefined, stat: BuffStat, path: string): void {
  if (isFixedAttackScaling(scaling) && stat !== 'attack') {
    fail(`${path}.scaling`, `${String(scaling)} is only allowed with stat "attack", got "${stat}"`);
  }
  if (scaling === 'casterDefence' && stat !== 'enemyDefenseDown') {
    fail(`${path}.scaling`, `casterDefence is only allowed with stat "enemyDefenseDown", got "${stat}"`);
  }
  if (scaling === 'casterMaxHp' && !isMaxHpStat(stat)) {
    fail(`${path}.scaling`, `casterMaxHp is only allowed with stat "maxHp" or "maxHpOnly", got "${stat}"`);
  }
  if (scaling === 'casterChargeTime' && stat !== 'chargeSpeed') {
    fail(`${path}.scaling`, `casterChargeTime is only allowed with stat "chargeSpeed", got "${stat}"`);
  }
  if (scaling === 'flat' && !FLAT_STATS.includes(stat)) {
    const names = FLAT_STATS.map((s) => `"${s}"`);
    fail(
      `${path}.scaling`,
      `flat is only allowed with stat ${names.slice(0, -1).join(', ')} or ${names.at(-1)}, got "${stat}"`,
    );
  }
  const unit = FLAT_ONLY_UNITS[stat];
  if (unit !== undefined && scaling !== 'flat') {
    fail(`${path}.scaling`, `${stat} needs scaling "flat" (the value is ${unit})`);
  }
}

/** scaling 'flat'（値を 100 で割らない）を書ける stat */
const FLAT_STATS: readonly BuffStat[] = ['maxAmmo', 'chargeSpeed', 'burstCooldown', 'pelletCount'];

/** flat にしか書けない stat と、その値の単位。ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.2 節）でペレット数▲を足した */
const FLAT_ONLY_UNITS: Partial<Record<BuffStat, string>> = {
  burstCooldown: 'seconds',
  pelletCount: 'a number of pellets',
};

/** 対象の語彙編: chargeSpeed の flat は「チャージ時間 X 秒▼」で、正の値が縮める秒数。▼（decrease）は書かない（burstCooldown も同じ） */
function validateFlatChargeTime(
  stat: BuffStat,
  scaling: BuffScaling | undefined,
  v: Record<string, Json>,
  path: string,
) {
  if ((stat === 'chargeSpeed' || stat === 'burstCooldown') && scaling === 'flat' && v.decrease !== undefined) {
    fail(`${path}.decrease`, `${stat} with scaling "flat" is already a reduction in seconds (do not write decrease)`);
  }
}

/** 名前の付いた状態の語彙編: timed の name（ペルソナ編）は状態の付与に置き換えた */
const NAME_REPLACED = 'name was replaced by a state grant (kind "state". plan/design-named-state.md)';

/** 2 段目の段 9 の PR 2: 攻撃速度▲を書ける武器種（レートを蓄積して撃ち、立ち上げの無い武器） */
export const ATTACK_SPEED_WEAPONS = ['AR', 'SMG', 'SG'] as const satisfies readonly WeaponType[];

/**
 * 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.2 節）: 攻撃速度▲は、AR・SMG・SG を所持する味方にだけ書ける（targetWeapon が要る）。
 * チャージ武器（チャージの秒）・MG（立ち上げのレート）への効き方と「▼」は、使い手がいないので書けない。
 * シュガー編（plan/design-sugar.md 2.1 節）: 自分（target self）には targetWeapon なしで書ける。自分の武器が AR・SMG・SG であることは、
 * 定義とキャラのデータを突き合わせるテスト（skills/__tests__/definitions.test.ts）が見る
 */
function validateAttackSpeed(stat: BuffStat, target: BuffTarget, v: Record<string, Json>, path: string): void {
  if (stat !== 'attackSpeed') return;
  if (v.decrease !== undefined) fail(`${path}.decrease`, 'attackSpeed cannot decrease (no user)');
  if (target === 'self') return;
  if (!(ATTACK_SPEED_WEAPONS as readonly Json[]).includes(v.targetWeapon ?? null)) {
    fail(
      `${path}.targetWeapon`,
      `attackSpeed needs targetWeapon ${ATTACK_SPEED_WEAPONS.join(', ')} (charge weapons and MG are not supported) or target "self"`,
    );
  }
}

/** Stage 11 モダニア: decrease（「▼」）は true だけ・scaling が ratio / flat のときだけ */
function parseDecrease(v: Record<string, Json>, scaling: BuffScaling | undefined, path: string): boolean {
  if (v.decrease === undefined) return false;
  parseTrue(v.decrease, `${path}.decrease`);
  if (scaling !== undefined && scaling !== 'ratio' && scaling !== 'flat') {
    fail(`${path}.decrease`, `only allowed with scaling "ratio" or "flat", got "${scaling}"`);
  }
  return true;
}

/** メイド編（plan/design-maids.md 2.1 節）: timed の perCount を書けるきっかけ（出来事のきっかけ） */
const PER_COUNT_TIMED_TRIGGERS: readonly string[] = [
  'burstUse',
  'burstStage1Enter',
  'burstStage2Enter',
  'burstStage3Enter',
  'fullBurstStart',
  'fullBurstEnd',
];

export function parseTimedEffect(v: Record<string, Json>, path: string): TimedEffect {
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  if (stat === 'chargeSpeedOverflow') fail(`${path}.stat`, `${stat} is only allowed in passive`);
  // 防御力無視ダメージ編: 周期のトリガー（ソルジャーE.G. 編で、1 パス目で窓を追う stat にも）。ソルジャーE.G. 編: 確率のきっかけ
  // 鍵の順は今までの timed と同じ（kind・trigger・target・stat の後に残りの欄）。最小構成の感度の鍵が定義の JSON から作られるので
  const { trigger, target, ...rest } = parseTimedFields(v, path, stat, true);
  // 課題 2-64（plan/design-debuff-removal-timed.md 2.1 節）: 味方の▼はデバフ解除で外れる（件の列を閉じる）。確率のきっかけと perCount の
  // 件は閉じるフレームを読まないので、味方の▼には書けない
  if (isAllyDecrease({ stat, ...rest }) && (isChanceTrigger(trigger) || rest.perCount !== undefined)) {
    fail(path, 'an ally decrease (removed by debuff removal) cannot have a chance trigger or perCount');
  }
  return { kind: 'timed', trigger, target, stat, ...rest } as TimedEffect;
}

/** timed の、値（stat）を除いた欄。名前の付いた状態の語彙編: 付与（StateGrantEffect）はこの欄を timed と同じ規則で持つ */
type TimedFields = Omit<TimedEffect, 'kind' | 'stat'>;
/**
 * 付与（stat が undefined）の欄。2 段目の段 19 の PR 1: 維持に { counterEmpty } も書ける（StateGrantEffect）。A2 の B モード編: { selfHpAtMostRef } も
 */
export type GrantTimedFields = Omit<TimedFields, 'durationUntil'> & {
  durationUntil?: GrantDurationUntil;
};

/**
 * timed の欄を検証する。名前の付いた状態の語彙編（plan/design-named-state.md 3.2 節）: stat が undefined なら付与の欄だけを見る
 * （値の欄 ref・scaling・decrease・amplifies と stat ごとの規則を除く）。付与の stat ごとの規則は、付与の欄と中身の項目を合わせた
 * timed として中身ごとに通す（validateStateGrants）
 */
export function parseTimedFields(
  v: Record<string, Json>,
  path: string,
  stat: BuffStat,
  allowChance: boolean,
): TimedFields;
export function parseTimedFields(
  v: Record<string, Json>,
  path: string,
  stat: undefined,
  allowChance: boolean,
): GrantTimedFields;
export function parseTimedFields(
  v: Record<string, Json>,
  path: string,
  stat: BuffStat | undefined,
  allowChance: boolean,
): GrantTimedFields {
  // 2 段目の段 3（plan/design-skill-stage3.md 1.2 節）: 回数のきっかけの数える窓（during）も、damage と同じ意味で書ける。
  // 2 段目の段 4（plan/design-skill-stage4.md 1.1 節）: 「〈名前〉が適用される時」（{ applied }）も書ける
  // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.1・2.6 節）: 「チャージ中の時、N 秒ごとに」（{ chargeTick }）と
  // 「フルチャージした時」（{ chargeFull }）も書ける
  // 2 段目の段 17 の PR 1（plan/design-skill-stage17.md 2.1 節）: 「遮蔽物の HP を回復した時」（{ coverHealed }）は timed だけ
  // 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節）: 「〈カウンタ〉が 100% になった時」（{ counterFull }）は状態の付与だけ
  // （validateCounterGrant）
  const trigger =
    parseAppliedTrigger(v.trigger, `${path}.trigger`) ??
    parseChargeTrigger(v.trigger, `${path}.trigger`) ??
    (stat === undefined
      ? // グレイブ編（plan/design-grave.md 2.1 節）: 「〈状態〉が終了した時」（{ ended }）も状態の付与だけ
        (parseCounterFullTrigger(v.trigger, `${path}.trigger`) ?? parseEndedTrigger(v.trigger, `${path}.trigger`))
      : (parseCoverHealedTrigger(v.trigger, `${path}.trigger`) ??
        parseSelfHpAtMostTrigger(v.trigger, `${path}.trigger`))) ??
    // グレイブ編（同 2.4 節）: 自分の状態の間だけ数える窓（during: { state }）は状態の付与だけ
    parseTrigger(v.trigger, `${path}.trigger`, {
      timer: 'withStart',
      during: stat === undefined ? 'withState' : true,
      chance: allowChance,
      reloadEnd: true,
    });
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'lowestHpRatio') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
  // 同: { applied } の効果は順位の対象・強化を書けない（使い手がいない。論点 6）。ミント・プリカ編（plan/design-mint-prika.md 2.3 節）:
  // 条件は自分の状態（selfState）だけ書ける（呼ぶ側の parseCondition が CONDITION_KEYS_OF.selfStateOnly で見る）
  if (isAppliedTrigger(trigger)) {
    if (target === 'topAttack') fail(`${path}.target`, 'an effect on an applied trigger cannot target "topAttack"');
    if (v.amplifies !== undefined) fail(`${path}.amplifies`, 'an effect on an applied trigger cannot amplify');
  }
  validateBurstUsersTarget(target, trigger, path);
  // ミント・プリカ編（plan/design-mint-prika.md 2.4 節）: 「〈状態〉のスキル発動者」は { applied } のきっかけの効果だけ（絞り込みは書けない）
  if (target === 'appliedCaster' && !isAppliedTrigger(trigger))
    fail(`${path}.target`, 'appliedCaster is only allowed with an applied trigger ({ applied })');
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const targetSquad = parseTargetSquad(v, target, path);
  const count = parseTargetCount(v, target, path);
  let excludeSelf: ExcludeSelf | undefined;
  if (v.excludeSelf !== undefined) {
    excludeSelf = oneOf(EXCLUDE_SELF, v.excludeSelf, `${path}.excludeSelf`);
    // ペルソナ編: 「自分を除く…味方全体」は allies の always
    const allowed = target === 'topAttack' || (target === 'allies' && excludeSelf === 'always');
    if (!allowed) {
      fail(
        `${path}.excludeSelf`,
        `only allowed with target "topAttack" (or "always" with "allies"), got "${excludeSelf}" with "${target}"`,
      );
    }
  }
  const persona = parsePersonaTargetFields(v, target, path);
  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 「自分より最終防御力が低い味方」は allies だけ（自分を除く・状態・段階・部隊の
  // 絞り込みとは組み合わせない。使い手がいない）
  let targetDefense: TargetDefense | undefined;
  if (v.targetDefense !== undefined) {
    targetDefense = oneOf(TARGET_DEFENSES, v.targetDefense, `${path}.targetDefense`);
    if (target !== 'allies') fail(`${path}.targetDefense`, `only allowed with target "allies", got "${target}"`);
    for (const key of ['excludeSelf', 'targetState', 'targetBurstStep', 'targetSquad'] as const) {
      if (v[key] !== undefined) fail(`${path}.targetDefense`, `cannot be combined with ${key}`);
    }
  }
  if (stat === 'trueDamageConversion' && target !== 'self') {
    fail(`${path}.target`, 'trueDamageConversion is only allowed with target "self"');
  }
  // ドロシー：セレンディピティ編: ペレットの数の stat は自分にだけ（1 パス目が持ち主の発の数え方とゲージに読む）
  if (stat !== undefined && isPelletStat(stat) && target !== 'self') {
    fail(`${path}.target`, `${stat} is only allowed with target "self"`);
  }
  let scaling: BuffScaling | undefined;
  if (stat !== undefined) {
    scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
    validateScaling(scaling, stat, path);
    validateFlatChargeTime(stat, scaling, v, path);
    validateDamageTaken(stat, target, v, path);
    validateAttackSpeed(stat, target, v, path);
  }
  const effect: GrantTimedFields = { trigger, target };
  if (stat !== undefined) {
    // 環境コントロール強化編: 値は参照する効果から取る
    if (v.amplifies !== undefined) {
      effect.amplifies = parseAmplifies(v, stat, target, `${path}.amplifies`);
    }
    // Stage 11 モダニア: フラグの stat（装弾数無限）は値を持たないので ref も scaling も書かない
    else if (isFlagStat(stat)) {
      if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value (do not write ref)`);
      if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value (do not write scaling)`);
    } else {
      effect.ref = parseRef(v.ref, `${path}.ref`);
    }
  }
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  if (targetSquad !== undefined) effect.targetSquad = targetSquad;
  if (excludeSelf !== undefined) effect.excludeSelf = excludeSelf;
  Object.assign(effect, persona);
  if (targetDefense !== undefined) effect.targetDefense = targetDefense;
  if (v.name !== undefined) fail(`${path}.name`, NAME_REPLACED);
  Object.assign(effect, count);
  if (stat !== undefined) {
    if (scaling !== undefined) effect.scaling = scaling;
    if (parseDecrease(v, scaling, path)) {
      if (isFlagStat(stat)) fail(`${path}.decrease`, `${stat} has no value`);
      effect.decrease = true;
    }
  }
  Object.assign(effect, parseTimedDuration(v, stat, target, path));
  // マスト編（plan/design-mast.md 8 節）: HP の割合の窓は、きっかけと維持を組で書く。エード編（plan/design-ade.md 2.1 節）: きっかけは
  // 秒の維持（durationRef・durationSeconds）とも組める（下がったフレームに発火して N 秒。維持の終わりが発火の時に決まるので、攻撃力にも書ける）
  const hpTrigger = isSelfHpAtMostTrigger(trigger);
  const untilHpAbove = effect.durationUntil === 'selfHpAbove';
  const inSeconds = effect.durationRef !== undefined || effect.durationSeconds !== undefined;
  if (untilHpAbove && !hpTrigger)
    fail(path, 'durationUntil "selfHpAbove" goes only with the trigger { selfHpAtMostRef }');
  if (hpTrigger && !untilHpAbove && !inSeconds)
    fail(path, 'the trigger { selfHpAtMostRef } goes with durationUntil "selfHpAbove" or a duration in seconds');
  // 最大HP▲・最大HP のみ▲ は HP の割合そのものを動かす（自分の発火で割合が動き直す）ので、このきっかけには書かない
  if (hpTrigger && stat !== undefined && isMaxHpStat(stat))
    fail(
      `${path}.stat`,
      `the trigger { selfHpAtMostRef } cannot carry "${stat}" (it moves the HP ratio the trigger reads)`,
    );
  // Stage 11 モダニア: 効果のあるスタック
  if (v.maxStacks !== undefined && v.maxStacksRef !== undefined)
    fail(path, 'at most one of maxStacks and maxStacksRef');
  if (v.maxStacks !== undefined) effect.maxStacks = parsePositiveInt(v.maxStacks, `${path}.maxStacks`);
  if (v.maxStacksRef !== undefined) effect.maxStacksRef = parseRef(v.maxStacksRef, `${path}.maxStacksRef`);
  if (stat !== undefined && isFlagStat(stat) && (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)) {
    fail(path, `${stat} cannot stack`);
  }
  const byShots = effect.durationShots !== undefined || effect.durationShotsRef !== undefined;
  // ツバイ編（plan/design-zwei.md 2.3 節）: 発数の維持のスタックは、付き直すたびに 1 段増え、持ち主の N 発目で全部切れる（timed だけ。
  // 状態の付与は parse/state.ts が弾く）
  // 2 段目の段 14 の PR 3（plan/design-skill-stage14.md 2.7 節）: 条件は自分の状態（selfState）だけ組める（発火のフレームで判定し、窓は
  // 発数で切る。「フルアクティブ状態の場合のみ、フルチャージした時」の 1 発間の▲）
  if (byShots && isRecord(v.condition) && Object.keys(v.condition).some((key) => key !== 'selfState'))
    fail(`${path}.condition`, 'a duration in shots can only have the condition selfState');
  if (
    (effect.durationUntil === 'fullBurstEnd' || effect.durationUntil === 'reloadEnd') &&
    (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined)
  ) {
    fail(path, 'a duration until an event cannot stack');
  }
  // Stage 11 モダニア: 「自分が 〈stat〉 増加状態なら」。防御力無視ダメージ編: 「フルバーストタイムなら」。
  // 名前の付いた状態の語彙編: 鍵はどれも満たすときだけ（AND。plan/design-named-state.md 10 節の論点 8）
  if (v.condition !== undefined) {
    const condition = parseCondition(
      v.condition,
      `${path}.condition`,
      isAppliedTrigger(trigger) ? CONDITION_KEYS_OF.selfStateOnly : CONDITION_KEYS_OF.timed,
    );
    if (condition.inFullBurst === true && stat !== undefined && isFirstPassTrackedStat(stat)) {
      fail(
        `${path}.condition`,
        `inFullBurst is not supported for "${stat}" (its window is tracked inside the first pass)`,
      );
    }
    // 条件付きの効果が状態を作ると連鎖するので、同じ stat と状態だけの stat は出せない（plan/design-stage11-modernia.md 2.4 節）
    if (
      condition.selfBuffed !== undefined &&
      stat !== undefined &&
      (stat === condition.selfBuffed || isStateStat(stat))
    ) {
      fail(`${path}.stat`, `a conditional effect cannot give "${stat}" (it would feed its own condition)`);
    }
    if (target === 'topAttack') fail(`${path}.target`, 'a conditional effect cannot target "topAttack"');
    // 紅蓮編（plan/design-scarlet.md 2.2 節）: timed の selfHp は「以下」の形だけ（発火のフレームの HP の割合で見る。件の一覧の
    // fireContextHolds）。使い手のいない形は書けない: 状態の付与（中身の stat を見ない）、最終防御力の比べの対象（段 2 は fireContextHolds を
    // 通らない）、1 パス目で窓を追う stat（1 パス目の窓の登録が件の一覧の判定と別に回る）、HP の割合を動かす stat（自分の条件を自分で満たす）
    if (condition.selfHp !== undefined) {
      const at = `${path}.condition.selfHp`;
      if (!isSelfHpAtMost(condition.selfHp))
        fail(at, 'timed only takes { atMostRef } or { atMost } (judged at the firing frame)');
      if (stat === undefined) fail(at, 'selfHp is only supported on a timed effect with a stat, not on a grant');
      if (isFirstPassTrackedStat(stat) || isMaxHpStat(stat))
        fail(at, `selfHp is not supported for "${stat}" (tracked in the first pass, or it moves the HP ratio)`);
      if (v.targetDefense !== undefined) fail(at, 'selfHp cannot be combined with targetDefense');
    }
    validateUsedBurst(condition, trigger, `${path}.condition`);
    validateBurstStep(condition, trigger, `${path}.condition`);
    effect.condition = condition;
  }
  // 回数トリガーの遅れ編: 確率のきっかけの検査より先に見る。2026-10-29 のキャラの編（plan/design-new-chars-1029.md 10.2 節の e）:
  // 付与（stat が undefined）は時間の周期のきっかけのときだけ書け、周期の発火の delayFrames 後のフレームに付ける（マリアン：クイーンの
  // 槍の命中で付く弱点露出。V-0538）
  if (v.delayFrames !== undefined) {
    if (stat === undefined) {
      if (!isTimerTrigger(trigger)) fail(`${path}.delayFrames`, 'delayFrames in a state grant needs a timer trigger');
      effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
    } else if (isTimerTrigger(trigger)) {
      // V-0602: 時間の周期のきっかけの timed も、周期の発火の delayFrames 後から（エーテルの S2 の防御力▼は、S2 のヒットから。
      // C-0453・C-0832）。窓は 2 パス目の件（skills/holders.ts の startOfFire）で作るので、1 パス目で窓を追う stat には書けない
      if (isFirstPassTrackedStat(stat)) {
        fail(
          `${path}.delayFrames`,
          `delayFrames on a timer trigger is not supported for "${stat}" (its window is tracked inside the first pass)`,
        );
      }
      effect.delayFrames = parsePositiveInt(v.delayFrames, `${path}.delayFrames`);
    } else effect.delayFrames = parseShotCountDelay(v.delayFrames, trigger, `${path}.delayFrames`);
  }
  // メイド編（plan/design-maids.md 2.1 節）: 値 × 自分の状態のスタック数。出来事のきっかけだけ
  if (v.perCount !== undefined) {
    const at = `${path}.perCount`;
    if (stat === undefined) fail(at, 'perCount in a state grant is not supported (use stacksFrom)');
    const per = v.perCount;
    if (!isRecord(per) || Object.keys(per).length !== 1 || per.state === undefined) fail(at, 'expected { state }');
    if (typeof trigger !== 'string' || !PER_COUNT_TIMED_TRIGGERS.includes(trigger))
      fail(at, `perCount needs one of the triggers ${PER_COUNT_TIMED_TRIGGERS.join(', ')}`);
    for (const key of [
      'maxStacks',
      'maxStacksRef',
      'amplifies',
      'durationShots',
      'durationShotsRef',
      'durationUntil',
    ] as const) {
      if (v[key] !== undefined) fail(at, `perCount cannot be combined with ${key}`);
    }
    effect.perCount = { state: parseNamedStateId(per.state, `${at}.state`, 'ally') };
  }
  // キラーワイフ編（plan/design-killer-wife.md 2.2 節）: 「〈状態〉の対象に命中させた味方に」
  if (v.holderHit !== undefined) {
    const at = `${path}.holderHit`;
    const hit = v.holderHit;
    if (stat === undefined) fail(at, 'holderHit in a state grant is not supported');
    if (!isRecord(hit) || Object.keys(hit).length !== 1 || hit.withinRef === undefined)
      fail(at, 'expected { withinRef }');
    if (target !== 'self' && target !== 'allies')
      fail(at, `only allowed with target "self" or "allies", got "${target}"`);
    if (effect.durationRef === undefined && effect.durationSeconds === undefined)
      fail(at, 'holderHit needs a duration in seconds (durationRef or durationSeconds)');
    if (isChanceTrigger(trigger)) fail(at, 'holderHit cannot be combined with a chance trigger');
    for (const key of ['maxStacks', 'maxStacksRef', 'condition', 'amplifies', 'delayFrames', 'perCount'] as const) {
      if (v[key] !== undefined) fail(at, `holderHit cannot be combined with ${key}`);
    }
    effect.holderHit = { withinRef: parseRef(hit.withinRef, `${at}.withinRef`) };
  }
  if (stat !== undefined) {
    // 値のある timed の維持は DurationUntil だけ（{ counterEmpty } は付与だけ。parseTimedDuration）
    const timed = { kind: 'timed', ...(effect as TimedFields), stat } as const;
    validateFixedChargeTime(timed, path);
    validateChanceTimed(timed, path);
  }
  parseAssumes(v, effect, path);
  return effect;
}

/**
 * 確率で決まる件（期待値の小片）に書ける stat か。値を足し合わせて意味のあるもの（射撃に効かない・状態でない・フラグでない・当たりの
 * stat でない）だけ。確率の timed と、確率の状態を読む while・stacksFrom の中身（skills/parse/crossChecks.ts の validateChanceStates）で使う
 */
export function validateChanceStat(stat: BuffStat, path: string): void {
  if (isFiringStat(stat) || isStateStat(stat) || isFlagStat(stat) || isHitStateStat(stat) || isPelletStat(stat)) {
    fail(path, `a chance trigger is not supported for "${stat}" (it needs a value that adds up linearly)`);
  }
  // T4 の▼は、件の始まりごとに走っている CT を縮める（frame/firstPass.ts の burstCooldownStartedAt）。期待値の窓は機会の始まりと終わりで
  // 小片に割る（skills/chance.ts）ので、小片の始まりのたびに縮め直してしまう
  if (stat === 'burstCooldown') {
    fail(
      path,
      'a chance trigger is not supported for "burstCooldown" (each piece of the expected window would shorten the running cooldown again)',
    );
  }
}

/**
 * ソルジャーE.G. 編（plan/design-soldier-eg.md 3.1 節）: 確率のきっかけの timed は、窓を期待値の小片にするので、値を足し合わせて
 * 意味のある stat（射撃に効かない・状態でない・フラグでない）だけに書け、スタック・条件・発数や出来事の維持・amplifies・名前・
 * 順位の対象とは組み合わせない（意味が決まっていない。使うキャラが出たら足す）
 */
function validateChanceTimed(effect: TimedEffect, path: string): void {
  if (!isChanceTrigger(effect.trigger)) return;
  validateChanceStat(effect.stat, `${path}.stat`);
  if (effect.target === 'topAttack') fail(`${path}.target`, 'a chance trigger cannot target "topAttack"');
  const forbidden: [unknown, string][] = [
    [effect.maxStacks ?? effect.maxStacksRef, 'maxStacks'],
    [effect.condition, 'condition'],
    [effect.durationShots ?? effect.durationShotsRef, 'durationShots'],
    [effect.durationUntil, 'durationUntil'],
    [effect.amplifies, 'amplifies'],
  ];
  for (const [value, key] of forbidden) {
    if (value !== undefined) fail(`${path}.${key}`, `a chance trigger cannot be combined with ${key}`);
  }
}

/**
 * 環境コントロール強化編: amplifies の形と、組み合わせられない欄（plan/design-true-damage-element.md 3.5 節）。
 * 窓は参照する効果の件から作る（skills/holders.ts の amplify）。1 パス目で窓を追う stat には書けない（isFirstPassTrackedStat の制限）
 */
function parseAmplifies(v: Record<string, Json>, stat: BuffStat, target: BuffTarget, path: string): Amplifies {
  const a = v.amplifies;
  if (!isRecord(a) || Object.keys(a).some((k) => k !== 'skill' && k !== 'percent')) {
    fail(path, 'expected { skill, percent }');
  }
  const skill = oneOf(SKILL_SLOTS, a.skill, `${path}.skill`);
  const percent = a.percent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent <= 0) {
    fail(`${path}.percent`, `expected a positive number, got ${JSON.stringify(percent)}`);
  }
  if (isFirstPassTrackedStat(stat) || isFlagStat(stat)) {
    fail(path, `amplifies is not supported for "${stat}" (its window is tracked inside the first pass)`);
  }
  if (target === 'topAttack') fail(path, 'amplifies cannot target "topAttack"');
  for (const key of [
    'ref',
    'scaling',
    'decrease',
    'maxStacks',
    'maxStacksRef',
    'condition',
    'durationShots',
    'durationShotsRef',
    'durationUntil',
    // 2 段目の段 7: 最終防御力の比べの対象は発火の瞬間に決める（topAttack と同じく、強化の窓の作り方の外）
    'targetDefense',
  ]) {
    if (v[key] !== undefined) fail(path, `amplifies cannot be combined with ${key}`);
  }
  return { skill, percent };
}

/**
 * アニス：スター S2・バースト編: fixedChargeTime（チャージ時間の固定）は値が秒で、足し合わせると意味が無くなるので、
 * 自分にだけ・倍率の書き方なし・スタックなし・条件なしで書ける（plan/design-anis-star-s2-burst.md 2.3 節）
 */
function validateFixedChargeTime(effect: TimedEffect, path: string): void {
  if (effect.stat !== 'fixedChargeTime') return;
  if (effect.target !== 'self') fail(`${path}.target`, `fixedChargeTime is only allowed with target "self"`);
  if (effect.scaling !== undefined) fail(`${path}.scaling`, 'fixedChargeTime is in seconds (do not write scaling)');
  if (effect.decrease) fail(`${path}.decrease`, 'fixedChargeTime cannot be decreased');
  if (effect.maxStacks !== undefined || effect.maxStacksRef !== undefined) fail(path, 'fixedChargeTime cannot stack');
  if (effect.condition !== undefined) fail(`${path}.condition`, 'fixedChargeTime cannot have a condition');
}

/** durationRef / durationSeconds のちょうど片方 */
/**
 * ヘルム編: timed の維持。秒（durationRef / durationSeconds）か発数（durationShots / durationShotsRef）のちょうど 1 つ。
 * 発数の窓は 1 パス目の射撃の列から後で決めるので、1 パス目のループの中で窓を追う stat には書けない
 */
function parseTimedDuration(
  v: Record<string, Json>,
  stat: BuffStat | undefined,
  target: BuffTarget,
  path: string,
): {
  durationRef?: number;
  durationSeconds?: number;
  durationShots?: number;
  durationShotsRef?: number;
  durationUntil?: GrantDurationUntil;
} {
  const hasShots = v.durationShots !== undefined;
  const hasShotsRef = v.durationShotsRef !== undefined;
  // 防御力無視ダメージ編: 「解除条件：フルバーストタイムが終了した時」
  if (v.durationUntil !== undefined) {
    if (hasShots || hasShotsRef || v.durationRef !== undefined || v.durationSeconds !== undefined) {
      fail(path, 'durationUntil cannot be combined with another duration');
    }
    // 2 段目の段 19 の PR 1（plan/design-skill-stage19.md 2.1 節）: 付与だけ「解除条件：〈カウンタ〉が 0 になった時」（validateCounterGrant）
    if (stat === undefined && isRecord(v.durationUntil)) {
      const key = `${path}.durationUntil`;
      // A2 の B モード編（plan/design-hp-down-interval.md 2.2 節）: 「自分の HP が X% 以下の時、〈状態〉解除」（validateSelfHpGrant）
      const hpUntil = parseSelfHpAtMostTrigger(v.durationUntil, key);
      if (hpUntil !== undefined) return { durationUntil: hpUntil };
      // グレイブ編（plan/design-grave.md 2.5 節）: 「〈状態〉の時に限り…持続」（見る状態の件が外れたフレームで閉じる。validateStateEndGrant）
      if ('stateEnd' in v.durationUntil)
        return { durationUntil: parseStateEndUntil(v.durationUntil, key, 'expected { stateEnd }') };
      return {
        durationUntil: {
          counterEmpty: oneOf(
            COUNTER_IDS,
            objectUntil(v.durationUntil, 'counterEmpty', key, 'expected { counterEmpty }'),
            `${key}.counterEmpty`,
          ),
        },
      };
    }
    const until = oneOf(DURATION_UNTILS, v.durationUntil, `${path}.durationUntil`);
    if (stat !== undefined && (isFlagStat(stat) || (until === 'fullBurstEnd' && isFirstPassTrackedStat(stat)))) {
      fail(
        `${path}.stat`,
        `a duration until an event is not supported for "${stat}" (its window is tracked inside the first pass)`,
      );
    }
    // マスト編: HP の割合の窓は、窓の始まりの順位で対象を決めて窓の終わりまで続く
    if (target === 'topAttack' && until !== 'selfHpAbove')
      fail(`${path}.target`, 'a duration until an event cannot target "topAttack"');
    if (until === 'selfHpAbove' && (stat === undefined || isFirstPassTrackedStat(stat) || isFlagStat(stat)))
      fail(
        `${path}.durationUntil`,
        'a duration until the HP rises is only supported for timed effects of a value not tracked in the first pass',
      );
    // シンデレラ S1 編: リロードの込め終わりは持ち主の射撃の列にある。使い手は自分にだけ付ける（timed の自分）。グレイブ編
    // （plan/design-grave.md 2.2 節）: 自分に付く状態の付与も（スタックしないことは parseTimedFields が見る）
    if (until === 'reloadEnd' && target !== 'self') {
      fail(`${path}.durationUntil`, 'a duration until the reload ends is only supported on "self"');
    }
    return { durationUntil: until };
  }
  if (!hasShots && !hasShotsRef) return parseDuration(v, path);
  if (hasShots && hasShotsRef) fail(path, 'at most one of durationShots and durationShotsRef');
  if (v.durationRef !== undefined || v.durationSeconds !== undefined) {
    fail(path, 'a duration is either in seconds or in shots, not both');
  }
  // 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節。V-0569）: チャージ速度は、1 パス目の件の列が持ち主の発で窓を閉じる
  // （発数の維持の件は射撃の記録が伸びるたびに作り直す。skills/holders.ts の trackReadsOf）ので書ける。溜めの途中で付いても、それまでに
  // 溜めたフレームは残り、伸びたチャージ時間まで溜める（frame/shooter.ts の chargeProgressFrames。エイダの特殊改造）
  // ドロシー：セレンディピティ編（plan/design-dorothy-serendipity.md 2.3 節）: 命中率▲・貫通特化・ペレットの数の固定も、同じ件の列の閉じ方で書ける
  if (
    stat !== undefined &&
    !SHOT_DURATION_TRACKED_STATS.includes(stat) &&
    (stat === 'attack' || isFiringStat(stat) || isStateStat(stat) || isFlagStat(stat) || isPelletStat(stat))
  ) {
    fail(
      `${path}.stat`,
      `a duration in shots is not supported for "${stat}" (its window is tracked inside the first pass)`,
    );
  }
  // 順位の発数編（plan/design-ranked-shot-duration.md 2 節）: topAttack は 2 段目（順位）で、対象の枠の射撃で窓を切る
  if (hasShots) return { durationShots: parsePositiveInt(v.durationShots, `${path}.durationShots`) };
  return { durationShotsRef: parseRef(v.durationShotsRef, `${path}.durationShotsRef`) };
}

/**
 * 1 パス目で窓を追う stat のうち、発数の維持を書けるもの。どれも 1 パス目の件の列が持ち主の発で窓を閉じる。同じ閉じ方で書ける stat は
 * ほかにもある（ペレット数▲・適正最小射程距離▲など）が、使い手のいるものだけ許す（ドロシー：セレンディピティ編。plan/design-dorothy-serendipity.md 2.3 節）
 */
const SHOT_DURATION_TRACKED_STATS: readonly BuffStat[] = ['chargeSpeed', 'hitRate', 'pierce', 'singlePellet'];

/**
 * 防御力無視ダメージ編: 1 パス目のループで窓を追う stat か（攻撃力・射撃に効く stat・状態の stat）。追わない stat の窓は
 * planBuffTimeline だけが作ったので、durationShots・durationUntil・条件 inFullBurst はそちらにだけ書ける。持ち主ごとの一覧編
 * （plan/design-holder-effects.md 2.7 節）で窓を作るコードは 1 つになった。この制限は、使うキャラの定義を足す時に外す
 */
function isFirstPassTrackedStat(stat: BuffStat): boolean {
  // 2 段目の段 1（plan/design-skill-stage1.md 1.6 節）: 時間で変わるバーストゲージのチャージ速度は、1 パス目がゲージに読む。
  // 2 段目の段 6 の PR 2: 最大HP▲ は、1 パス目の順位（攻撃力）が発動者の最終最大HP として読むので、攻撃力と同じに扱う
  // 2 段目の段 7: 防御力▲ は、1 パス目の発火の対象の絞り込み（最終防御力の比べ）が読むので、攻撃力と同じに扱う
  return (
    stat === 'attack' ||
    isMaxHpStat(stat) ||
    stat === 'defense' ||
    stat === 'burstGaugeSpeed' ||
    stat === 'burstCooldown' ||
    isFiringStat(stat) ||
    isStateStat(stat) ||
    isPelletStat(stat)
  );
}

export function parsePassiveEffect(v: Record<string, Json>, path: string): PassiveEffect {
  const target = oneOf(BUFF_TARGETS, v.target, `${path}.target`);
  if (target === 'burstUsers') fail(`${path}.target`, 'burstUsers is not allowed in passive (it needs a full burst)');
  // ミント・プリカ編: 「〈状態〉のスキル発動者」は { applied } の発火の文脈が要る
  if (target === 'appliedCaster')
    fail(`${path}.target`, 'appliedCaster is not allowed in passive (it needs an applied trigger)');
  // 常時の効果の対象が戦闘中に入れ替わるのは持続バフの窓の仕組みの外（plan/design-stage11.md 17 節）
  if (target === 'topAttack')
    fail(`${path}.target`, 'topAttack is not allowed in passive (the ranking changes during battle)');
  if (target === 'longestChargeTime') fail(`${path}.target`, 'longestChargeTime is only allowed in timed');
  if (target === 'lowestHpRatio') fail(`${path}.target`, LOWEST_HP_RATIO_HEAL_ONLY);
  const targetWeapon = parseTargetWeapon(v, target, path);
  const targetElement = parseTargetElement(v, target, path);
  const targetClass = parseTargetClass(v, target, path);
  const targetSquad = parseTargetSquad(v, target, path);
  if (v.excludeSelf !== undefined) fail(`${path}.excludeSelf`, 'excludeSelf is only allowed in timed');
  // 2 段目の段 7（plan/design-skill-stage7.md 1.4 節）: 最終防御力の比べは発火の瞬間に決めるので、常時の効果には書けない
  if (v.targetDefense !== undefined) fail(`${path}.targetDefense`, 'targetDefense is only allowed in timed');
  for (const key of ['targetState', 'includeSelf', 'targetBurstStep'] as const) {
    if (v[key] !== undefined) fail(`${path}.${key}`, `${key} is only allowed in timed and state`);
  }
  if (v.name !== undefined) fail(`${path}.name`, NAME_REPLACED);
  const stat = oneOf(BUFF_STATS, v.stat, `${path}.stat`);
  const passiveFlag = isPassiveFlagStat(stat);
  if ((isFlagStat(stat) && !passiveFlag) || stat === 'fixedChargeTime' || isPelletStat(stat))
    fail(`${path}.stat`, `${stat} is only allowed in timed`);
  const scaling = v.scaling === undefined ? undefined : oneOf(BUFF_SCALINGS, v.scaling, `${path}.scaling`);
  validateScaling(scaling, stat, path);
  // HP の割合を時間で読む編: 発動者の最大HP 基準は、対象の枠ごとに件の列で直すので timed だけ（常時の値は対象ごとに持たない。使い手がいない）
  if (scaling === 'casterMaxHp') fail(`${path}.scaling`, 'casterMaxHp is only allowed in timed');
  validateFlatChargeTime(stat, scaling, v, path);
  // 持ち主ごとの一覧編（plan/design-holder-effects.md 2.8 節）: 常時の受けるダメージ▲（観測値の比べる設定が使う）は、いまのまま
  // 味方の各枠の常時の値に足す（敵の常時の件にするのは、敵の効果を外す語彙を足す時）
  validateDamageTaken(stat, target, v, path);
  validateAttackSpeed(stat, target, v, path);
  // 2 段目の段 12 の PR 2（plan/design-skill-stage12.md 2.4 節）: 有利コードのダメージ適用は値を持たないフラグで、自分だけ。
  // レッドフード編（plan/design-red-hood.md 2.4 節）: チャージ速度の超過分の変換も自分だけ（持ち主の発にだけ効く。比率の scaling だけ）
  const overflow = stat === 'chargeSpeedOverflow';
  if ((passiveFlag || overflow) && target !== 'self')
    fail(`${path}.target`, `${stat} is only allowed with target "self"`);
  if (overflow && scaling !== undefined) fail(`${path}.scaling`, `${stat} takes no scaling`);
  if (passiveFlag) {
    if (v.ref !== undefined) fail(`${path}.ref`, `${stat} has no value`);
    if (scaling !== undefined) fail(`${path}.scaling`, `${stat} has no value`);
    // エード：エージェントバニー編（plan/design-agent-bunny.md 1 節）: 静的に読むフラグだけ while を書けない（貫通特化は書ける）
    if (v.while !== undefined && (STATIC_PASSIVE_FLAG_STATS as readonly string[]).includes(stat))
      fail(`${path}.while`, `${stat} cannot have while`);
  }
  const effect: PassiveEffect = { kind: 'passive', target, stat };
  if (!passiveFlag) effect.ref = parseRef(v.ref, `${path}.ref`);
  if (targetWeapon !== undefined) effect.targetWeapon = targetWeapon;
  if (targetElement !== undefined) effect.targetElement = targetElement;
  if (targetClass !== undefined) effect.targetClass = targetClass;
  if (targetSquad !== undefined) effect.targetSquad = targetSquad;
  if (scaling !== undefined) effect.scaling = scaling;
  if (parseDecrease(v, scaling, path)) effect.decrease = true;
  if (v.condition !== undefined) {
    effect.condition = parseCondition(v.condition, `${path}.condition`, CONDITION_KEYS_OF.passive);
    // 紅蓮編: 常時の効果の selfHp は「以上」の形だけ（編成の段で、枠の HP の割合の想定から決める）
    if (effect.condition.selfHp !== undefined && isSelfHpAtMost(effect.condition.selfHp))
      fail(`${path}.condition.selfHp`, 'passive only takes { atLeastRef } or { atLeast }');
  }
  if (v.while !== undefined) {
    // 2 段目の段 9 の PR 2（plan/design-skill-stage9.md 1.3 節）: HP の条件（編成の段で決まる）とは組み合わせない（使い手がいない）。
    // 敵が持つ stat は、敵の件に写すので、自分の状態の件で切れない
    if (v.condition !== undefined) fail(`${path}.while`, 'while cannot be combined with condition');
    if (isEnemyHeldStat(stat)) fail(`${path}.while`, `${stat} is held by the enemy, so it cannot have while`);
    effect.while = parseWhileCondition(v.while, `${path}.while`);
  }
  // HP の割合を時間で読む編（plan/design-hp-ratio-readers.md 2.1 節）: HP の割合が動きうる枠では while と同じ区間の件になるので、while に
  // 書けない stat（敵が持つ stat・静的に読むフラグ）と、1 パス目が射撃の時に読む stat（区間の可否はその後に出す。最大HP の stat は自分の
  // 条件を自分で動かす）は書けない（使い手がいない）
  if (effect.condition?.selfHp !== undefined) {
    const at = `${path}.condition.selfHp`;
    if (isEnemyHeldStat(stat) || (STATIC_PASSIVE_FLAG_STATS as readonly string[]).includes(stat))
      fail(at, `selfHp is not supported for "${stat}" (it cannot be windowed like while)`);
    if (isFirstPassTrackedStat(stat) && stat !== 'attack' && stat !== 'defense')
      fail(at, `selfHp is not supported for "${stat}" (it moves the HP ratio, or the first pass reads it at a shot)`);
  }
  parseAssumes(v, effect, path);
  return effect;
}
