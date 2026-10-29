// スキル関連の表示用ラベル（React 非依存）
import {
  ELEMENT_LABEL,
  INDIRECT_PATH_NAMES,
  SKILL_SLOTS,
  counterMax,
  counterName,
  framesToGameSeconds,
  isCounterFullTrigger,
  isCounterWhileEffect,
  isEndedTrigger,
  isStateContent,
  isTimedItem,
  isWhileEffect,
  namedStateName,
  staticStatesOf,
} from '@nikke/core';
import type {
  BasicBurstStep,
  AppliedEffect,
  BuildEffect,
  BuildEffectSource,
  CounterChangeEffect,
  GearPart,
  NikkeClass,
  AppliedTimedEffect,
  ResolvedInstantEffect,
  BuffStat,
  BuffTrigger,
  EffectCondition,
  NamedStateId,
  RemoveStateEffect,
  SelfCounterCondition,
  SelfStateCondition,
  StackChangeEffect,
  ResolvedTrigger,
  SkillDamageType,
  SkillDefinition,
  SkillSlot,
  SkillNote,
  SkillNoteKind,
  SkillSupport,
  StateGrantEffect,
} from '@nikke/core';
import { formatNumber, formatPercent } from './format.ts';

/** クラスの表示名（2 段目の段 9: 「〈クラス〉型の味方」の絞り込みにも使う） */
export const CLASS_LABEL: Record<NikkeClass, string> = { Attacker: '火力型', Defender: '防御型', Supporter: '支援型' };

export const SKILL_SLOT_LABEL: Record<SkillSlot, string> = {
  skill1: 'スキル 1',
  skill2: 'スキル 2',
  burst: 'バースト',
};

export const BUFF_STAT_LABEL: Record<BuffStat, string> = {
  attack: '攻撃力',
  critRate: 'クリティカル確率',
  critDamage: 'クリティカルダメージ',
  attackDamage: '攻撃ダメージ',
  chargeDamage: 'チャージダメージ',
  chargeDamageMultiplier: 'チャージダメージ倍率',
  distributedDamage: '分配ダメージ',
  sequentialAttackDamage: '順番攻撃ダメージ',
  spinUpSpeed: 'マシンガン立ち上げ速度',
  damageTaken: '敵の受けるダメージ',
  enemyDefenseDown: '敵の防御力',
  projectileExplosionDamage: '発射体爆発ダメージ',
  projectileStickDamage: '発射体付着ダメージ',
  elementAdvantage: '有利コードのダメージ適用',
  sustainedDamage: '持続ダメージ',
  burstGaugeSpeed: 'バーストゲージのチャージ速度',
  burstCooldown: 'バーストスキルのクールタイム',
  maxAmmo: '最大装弾数',
  reloadSpeed: 'リロード速度',
  chargeSpeed: 'チャージ速度',
  attackSpeed: '攻撃速度',
  hitRate: '命中率',
  infiniteAmmo: '装弾数無限',
  elementDamage: '有利コードの攻撃ダメージ',
  coreDamage: 'コアダメージ',
  normalAttackDamage: '通常攻撃ダメージ倍率',
  normalCritRate: '通常攻撃のクリティカル確率',
  fixedChargeTime: 'チャージ時間の固定',
  trueDamage: '防御力無視ダメージ',
  trueDamageConversion: '通常攻撃が防御力無視ダメージに変化',
  maxHp: '最大HP',
  maxHpOnly: '最大HP のみ',
  defense: '防御力',
};

/** 名前の付いた状態の語彙編: 状態の画面の名前（目録の name。説明文の状態名） */
export function stateLabel(id: NamedStateId): string {
  return namedStateName(id).ja;
}

const BURST_STEP_ROMAN: Record<BasicBurstStep, string> = { Step1: 'I', Step2: 'II', Step3: 'III' };

export const BUFF_TRIGGER_LABEL: Record<BuffTrigger, string> = {
  battleStart: '戦闘開始時',
  burstUse: 'バースト使用時',
  fullBurstStart: 'フルバースト発動時',
  fullBurstEnd: 'フルバースト終了時',
  burstStage1Enter: 'バースト 1 段階突入時',
  burstStage2Enter: 'バースト 2 段階突入時',
  burstStage3Enter: 'バースト 3 段階突入時',
  healed: '回復を受けた時',
  burstHit: 'バーストのヒット時',
};

/** Stage 8: 「通常攻撃 10 回ごと」「バースト使用 2 回目以降」。文字列のトリガーは BUFF_TRIGGER_LABEL */
export function formatTrigger(trigger: ResolvedTrigger): string {
  if (typeof trigger === 'string') return BUFF_TRIGGER_LABEL[trigger];
  // ニヒリスター編: 時間の周期のトリガー（CT ごとに発動するアクティブ型のスキル）
  if ('everySeconds' in trigger) return `戦闘開始から ${formatNumber(trigger.everySeconds)} 秒ごと`;
  // ペルソナ編: 「追撃が適用された時」
  if ('applied' in trigger) return `${stateLabel(trigger.applied)}が適用された時`;
  // 2 段目の段 3: 「リラックスのフルスタックで解除した時」
  if ('fullStack' in trigger) return `${stateLabel(trigger.fullStack)}のフルスタックで解除した時`;
  // 2 段目の段 11: 「使用武器の変更が終了した時」
  if ('weaponChangeEnd' in trigger) return '使用武器の変更が終了した時';
  if ('every' in trigger) {
    const what = {
      normalShot: '通常攻撃',
      normalHit: '通常攻撃の命中',
      coreHit: 'コアの命中',
      fullChargeShot: 'フルチャージ攻撃',
      lastShot: '最後の弾丸',
      weaponChangeShot: '使用武器の変更の攻撃',
      pelletHit: 'ペレットの命中',
      critHit: 'クリティカルの命中',
    }[trigger.count];
    // Stage 11: 数えるだけのスタック（クラウン S2）は「通常攻撃 43 回 × 20 スタックごと」
    if (trigger.stacks !== undefined) {
      return `${what} ${formatNumber(trigger.every / trigger.stacks)} 回 × ${trigger.stacks} スタックごと`;
    }
    // ソルジャーE.G. 編: 確率のきっかけ（期待値。plan/design-soldier-eg.md 3.1 節）
    if (trigger.chance !== undefined) return `${what}ごとに ${formatNumber(trigger.chance * 100)}% の確率`;
    const base = trigger.every === 1 ? `${what}ごと` : `${what} ${trigger.every} 回ごと`;
    // クルミ S2 編: フルバースト中だけ数える回数トリガー（plan/design-kurumi-s2.md 2.1 節）
    if (trigger.during === 'fullBurst') {
      return `フルバースト中の${base}（${trigger.reset === 'fullBurstStart' ? 'フルバーストごとに数え直す' : '持ち越す'}）`;
    }
    // ソーダ：トゥインクルバニー S1 の数え方（V-0443）: 戦闘中ずっと数え、発火だけフルバースト中
    if (trigger.firesDuring === 'fullBurst') return `${base}（フルバーストの外も数え、付くのはフルバースト中だけ）`;
    // 2 段目の段 11（V-0530）: 戦闘中ずっと数え、発火だけ使用武器の変更の発
    if (trigger.firesDuring === 'weaponChange') return `${base}（変更の外も数え、出るのは使用武器の変更の発だけ）`;
    return base;
  }
  const what = trigger.count === 'burstUse' ? 'バースト使用' : 'フルバースト';
  return trigger.atLeast === 1 ? `${what}時` : `${what} ${trigger.atLeast} 回目以降`;
}

/**
 * クルミ S2 編: damage の発火の条件。「（フルバースト中・対象がハッキング状態なら）」。無ければ空文字。
 * 名前の付いた状態の語彙編: timed と同じ条件の型（鍵はどれも満たすとき）
 */
export function formatDamageCondition(condition: EffectCondition | undefined): string {
  if (condition === undefined) return '';
  const parts: string[] = [];
  if (condition.selfBuffed !== undefined) parts.push(`自分が${BUFF_STAT_LABEL[condition.selfBuffed]}増加状態`);
  if (condition.inFullBurst === true) parts.push('フルバースト中');
  if (condition.enemyState !== undefined) parts.push(`対象が${stateLabel(condition.enemyState)}状態`);
  // 2 段目の段 1: 自分の状態の条件。段 3: スタック数の条件
  if (condition.selfState !== undefined) parts.push(selfStateText(condition.selfState, '', 'でない'));
  return `（${parts.join('・')}なら）`;
}

/**
 * 2 段目の段 1・段 3: 自分の状態の条件の文。「自分がカモフラージュ状態」「自分がゴールデンチップ 20 スタック以上」「自分が〈名前〉の
 * フルスタック状態」に、付いていれば positive、付いていなければ negative を続ける。stacksRef（解く前の定義）は stacksOf で値にする
 */
export function selfStateText(
  self: SelfStateCondition,
  positive: string,
  negative: string,
  stacksOf?: (ref: number) => number,
): string {
  const name = stateLabel(self.state);
  const stacks = self.stacks ?? (self.stacksRef !== undefined ? stacksOf?.(self.stacksRef) : undefined);
  if (stacks === 'full') return `自分が${name}のフルスタック状態${positive}`;
  if (stacks !== undefined) return `自分が${name} ${formatNumber(stacks)} スタック以上${positive}`;
  if (self.stacksRef !== undefined) return `自分が${name}の説明文の値（${self.stacksRef}）スタック以上${positive}`;
  return `自分が${name}状態${self.present ? positive : negative}`;
}

/** 「バースト使用時 →」 */
export function formatTimedTrigger(trigger: ResolvedTrigger): string {
  return `${formatTrigger(trigger)} →`;
}

/**
 * 件を持つ効果のきっかけ。「バースト使用時 →」。名前の付いた状態の語彙編: 状態の中身は「カモフラージュの間 →」（きっかけは付与のもの）。
 * 2 段目の段 9 の PR 2: while の効果は「（発動者の）応急改造 フルスタックの間 →」
 */
export function formatItemTrigger(effect: AppliedTimedEffect): string {
  if (isWhileEffect(effect)) {
    const stacks = effect.whileStacks;
    const level =
      stacks === undefined ? '' : stacks === 'full' ? ' フルスタック' : ` ${formatNumber(stacks)} スタック以上`;
    return `発動者の${stateLabel(effect.whileState)}${level}の間 →`;
  }
  // 2 段目の段 11 の PR 2: カウンタの while の効果は「オーバーエネルギーの段階 2 以上の間 →」
  if (isCounterWhileEffect(effect))
    return `${counterName(effect.whileCounter.counter).ja} ${formatNumber(effect.whileCounter.atLeast)} 以上の間 →`;
  return isStateContent(effect) ? `${stateLabel(effect.whileState)}の間 →` : formatTimedTrigger(effect.trigger);
}

/** 件を持つ効果の維持。「・10 秒」「・持続」。状態の中身は状態の件の間なので空文字 */
export function formatItemDuration(effect: AppliedTimedEffect): string {
  if (!isTimedItem(effect)) return '';
  if (effect.durationShots !== undefined) return `・${effect.durationShots} 発`;
  if (effect.durationUntil === 'ammoSpent') return '・撃ち切りまで';
  if (effect.durationUntil === 'battleEnd') return '・持続';
  // シンデレラ S1 編（plan/design-cinderella-s1-charge.md 1.1 節）: 最大弾数リロード完了時に解除
  if (effect.durationUntil === 'reloadEnd') return '・リロード完了まで';
  return `・${formatNumber(framesToGameSeconds(effect.durationFrames), 0)} 秒`;
}

/**
 * 名前の付いた状態の語彙編（plan/design-named-state-impl.md 1.7 節）: 定義の付与。「ペルソナ状態（戦闘の始めから終わりまで）。
 * 中身: 有利コードの攻撃ダメージ」「追撃を付与。中身: 攻撃力」。2 段目の段 1（plan/design-skill-stage1.md 1.4 節）: 戦闘の始めから
 * 終わりまでと書くのは静的な状態（状態ごとの決め方。staticStatesOf）だけ。中身の無い付与は、同じ定義のその状態の中身を出す
 */
export function formatStateGrant(effect: StateGrantEffect, definition: SkillDefinition | null): string {
  const name = stateLabel(effect.state);
  const isStatic = staticStatesOf(definition).includes(effect.state);
  const head = isStatic
    ? `${name}状態（戦闘の始めから終わりまで）`
    : `${name}を付与${formatConditionSuffix(effect.condition)}`;
  const contents = effect.contents ?? stateContentsOf(definition, effect.state);
  // 2 段目の段 4（plan/design-skill-stage4.md 1.2 節）: 維持 0 秒の付与は、名前の付いた即時効果の付いた記録だけ
  const contentText =
    effect.durationSeconds === 0
      ? '即時（維持なし。付いた記録だけを作り、「〜が適用された時」の効果がきっかけにする）'
      : contents === undefined
        ? '中身なし（ほかの効果が、対象の絞り込み・条件・きっかけでこの状態を見る）'
        : `中身${effect.contents === undefined ? '（同じ状態のほかの付与）' : ''}: ${contents.map((c) => BUFF_STAT_LABEL[c.stat]).join('・')}`;
  // 2 段目の段 10: スタックの数をカウンタの値か、自分の状態のスタック数（PR 3。付いた時の数で固定）から取る付与
  const from = effect.stacksFrom;
  const stacksFrom =
    from === undefined
      ? ''
      : 'counter' in from
        ? `。スタック数は${counterName(from.counter).ja}の値`
        : `。スタック数は付いた時の自分の${namedStateName(from.state).ja}のスタック数（コピー）`;
  return `${head}。${contentText}${stacksFrom}${effect.undispellable ? '。解除不可' : ''}`;
}

/** 2 段目の段 1（plan/design-skill-stage1.md 1.2 節）: 定義の解除。「マターシグマを解除（自分がマターシグマ状態なら）」 */
export function formatRemoveState(effect: RemoveStateEffect): string {
  return `${stateLabel(effect.state)}を解除${formatConditionSuffix(effect.condition)}`;
}

/**
 * 2 段目の段 3（plan/design-skill-stage3.md 1.1・1.5 節）: 定義のスタック量の増減。「ゴールデンチップのスタック量 +50」
 * 「ゴールデンチップのスタック量 −17（効果の後に、上の段から）」。amount は解いた値（amountRef は Lv の説明文の値）
 */
export function formatStackChange(
  effect: StackChangeEffect,
  amount: number,
  stacksOf?: (ref: number) => number,
): string {
  const change = effect.decrease ? `−${formatNumber(amount)}（次のフレームに上の段から）` : `+${formatNumber(amount)}`;
  return `${stateLabel(effect.state)}のスタック量 ${change}${formatConditionSuffix(effect.condition, stacksOf)}`;
}

/** 定義のその状態の中身（同じ状態の付与のどれかが持つもの。無ければ undefined） */
function stateContentsOf(definition: SkillDefinition | null, state: NamedStateId): StateGrantEffect['contents'] {
  for (const slot of SKILL_SLOTS) {
    for (const e of definition?.skills[slot].effects ?? []) {
      if (e.kind === 'state' && e.state === state && e.contents !== undefined) return e.contents;
    }
  }
  return undefined;
}

/** 付与・解除の条件（「自分が〈状態〉なら」「直前に自分がバーストを使用していれば」など）。無ければ空文字 */
/**
 * 付与・解除・スタック量・カウンタの増減と、即時効果（2 段目の段 12 の PR 4。plan/design-skill-stage12.md 2.6 節）の発火の条件を括弧に
 * 包んだ文。「（自分が熱血状態なら）」。無ければ空文字
 */
export function formatConditionSuffix(
  condition: EffectCondition | undefined,
  stacksOf?: (ref: number) => number,
): string {
  const conditions = formatGrantCondition(condition, stacksOf);
  return conditions === '' ? '' : `（${conditions}）`;
}

function formatGrantCondition(condition: EffectCondition | undefined, stacksOf?: (ref: number) => number): string {
  if (condition === undefined) return '';
  const parts: string[] = [];
  if (condition.selfBuffed !== undefined) parts.push(`自分が${BUFF_STAT_LABEL[condition.selfBuffed]}増加状態なら`);
  if (condition.inFullBurst === true) parts.push('フルバーストタイムなら');
  // 2 段目の段 12 の PR 2: カウンタの増減の「フルバーストタイムでなければ」（粘着榴弾の付着している数）
  if (condition.inFullBurst === false) parts.push('フルバーストタイムでなければ');
  if (condition.selfState !== undefined) parts.push(selfStateText(condition.selfState, 'なら', 'でなければ', stacksOf));
  if (condition.usedBurst === true) parts.push('直前に自分がバーストを使用していれば');
  if (condition.selfCounter !== undefined) parts.push(selfCounterText(condition.selfCounter));
  return parts.join('・');
}

/** 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: カウンタの値の条件。「火力ゲージが 100 以上なら」「火力ゲージが 100 未満なら」 */
function selfCounterText(c: SelfCounterCondition): string {
  const name = counterName(c.counter).ja;
  return c.atLeast !== undefined
    ? `${name}が ${formatNumber(c.atLeast)} 以上なら`
    : `${name}が ${formatNumber(c.below!)} 未満なら`;
}

/**
 * 2 段目の段 10（plan/design-skill-stage10.md 2.3 節）: 定義のカウンタの増減。「火力ゲージ +2（自分が火力チャージ状態なら）」
 * 「火力ゲージ −100」「オーバーエネルギーが最大になった時に オーバーエネルギー −100」。amount は解いた値（amountRef は Lv の説明文の値）。
 * 増減はそのフレームのすべての判定の後に足す
 */
export function formatCounterChange(effect: CounterChangeEffect, amount: number): string {
  const trigger = isEndedTrigger(effect.trigger)
    ? `${stateLabel(effect.trigger.ended)}が終了した時に `
    : isCounterFullTrigger(effect.trigger)
      ? `${counterName(effect.trigger.counterFull).ja}が最大になった時に `
      : '';
  const change = `${effect.decrease ? '−' : '+'}${formatNumber(amount)}`;
  return `${trigger}${counterName(effect.counter).ja} ${change}（上限 ${formatNumber(counterMax(effect.counter))}）${formatConditionSuffix(effect.condition)}`;
}

/** バーストスロットの倍率ダメージ（burstDamage）の種別 */
export const BURST_DAMAGE_TYPE_LABEL: Record<SkillDamageType, string> = {
  skill: 'バーストスキルダメージ',
  distributed: '分配ダメージ',
  additional: '追加ダメージ',
};

/** Stage 8: トリガー付きの倍率ダメージ（damage）の種別 */
export const SKILL_DAMAGE_TYPE_LABEL: Record<SkillDamageType, string> = {
  skill: 'ダメージ',
  distributed: '分配ダメージ',
  additional: '追加ダメージ',
};

export type SupportBadge = { label: string; className: string };

export const SUPPORT_BADGE: Record<SkillSupport | 'undefined' | 'loading' | 'error', SupportBadge> = {
  supported: { label: '対応', className: 'supported' },
  partial: { label: '一部対応', className: 'partial' },
  unsupported: { label: '未対応', className: 'unsupported' },
  noEffect: { label: '対象外', className: 'no-effect' },
  undefined: { label: '未定義', className: 'undefined' },
  loading: { label: '読み込み中', className: 'loading' },
  error: { label: '読み込み失敗', className: 'unsupported' },
};

/** スキル定義の notes の種類の印（plan/design-skill-note-kinds.md 2.1 節）。className は .note に付ける */
export const NOTE_KIND_BADGE: Record<SkillNoteKind, SupportBadge> = {
  unimplemented: { label: '未対応', className: 'unsupported' },
  outOfScope: { label: '前提の外', className: 'out-of-scope' },
  noDamage: { label: '計算に無関係', className: 'no-damage' },
  modeling: { label: '補足', className: 'modeling' },
  // 分類の設計書の論点 7（plan/design-indirect-notes.md 5 節）: 経路を読む効果のある編成でだけ効く
  indirect: { label: '間接', className: 'indirect' },
};

/** 分類の設計書の論点 7: notes の印（間接は経路を添える。「間接（防御力）」） */
export function noteBadgeLabel(note: Pick<SkillNote, 'kind' | 'path'>): string {
  const label = NOTE_KIND_BADGE[note.kind].label;
  return note.path === undefined ? label : `${label}（${INDIRECT_PATH_NAMES[note.path].ja}）`;
}

/**
 * 「攻撃力 +42.2%」「攻撃力 +3,105（発動者基準 14.1%）」「最大装弾数 +5 発」「チャージ時間 −0.175 秒（発動者基準のチャージ速度）」。
 * Stage 11 モダニア: 「最大装弾数 −5.04%」（▼）、「装弾数無限」、「使用武器の変更（1 発 2.24%・4200 rpm）」
 */
export function formatAppliedAmount(effect: AppliedEffect): string {
  if (effect.stat === 'weapon') {
    const shot = effect.weapon?.shot;
    const hits = effect.weapon && effect.weapon.hits > 1 ? ` × ${effect.weapon.hits} ヒット` : '';
    // 使用武器変更の武器のパラメータ編: チャージ武器はレートの代わりにチャージ時間・フルチャージ倍率、撃ち切りで終わる変更は装弾数
    const rate = !shot
      ? ''
      : shot.chargeTime > 0
        ? `・チャージ ${formatNumber(shot.chargeTime, 2)} 秒・フルチャージ ${formatPercent(shot.fullChargeDamage, 0)}`
        : `・${formatNumber(shot.rateOfFire)} rpm`;
    const ammo =
      shot && 'durationUntil' in effect && effect.durationUntil === 'ammoSpent'
        ? `・最大装弾数 ${formatNumber(shot.maxAmmo)} 発`
        : '';
    const trueDamage = effect.weapon?.trueDamage ? '・防御力無視ダメージ' : '';
    const explosion = effect.weapon?.projectileExplosion ? '・発射体の爆発' : '';
    return `使用武器の変更（1 発 ${formatPercent(effect.value, 2)}${hits}${rate}${ammo}${trueDamage}${explosion}）`;
  }
  const stat = BUFF_STAT_LABEL[effect.stat];
  if (effect.stat === 'infiniteAmmo') return stat;
  // アニス：スター編: チャージ時間の固定は秒
  if (effect.stat === 'fixedChargeTime') return `チャージ時間 ${formatNumber(effect.appliedAmount, 2)} 秒に固定`;
  // 2 段目の段 2: 敵の防御力▼は下げる割合（値は正）
  if (effect.stat === 'enemyDefenseDown') return `${stat} −${formatPercent(Math.abs(effect.appliedAmount), 2)}`;
  const sign = effect.appliedAmount < 0 ? '−' : '+';
  const amount = Math.abs(effect.appliedAmount);
  if (effect.scaling === 'casterAttack') {
    return `${stat} +${formatNumber(effect.appliedAmount)}（発動者基準 ${formatPercent(effect.value, 2)}）`;
  }
  // 2 段目の段 6: 発動者の最終最大HP 基準の攻撃力▲は、最終最大HP の X% の実数を足す
  if (effect.scaling === 'casterFinalMaxHp') {
    return `${stat} +${formatNumber(effect.appliedAmount)}（発動者の最終最大HP の ${formatPercent(effect.value, 2)}）`;
  }
  // 対象の語彙編: 「チャージ時間 X 秒▼」（chargeSpeed の flat）は秒数でチャージ時間から引く
  if (effect.scaling === 'flat' && effect.stat === 'chargeSpeed')
    return `チャージ時間 −${formatNumber(effect.appliedAmount, 2)} 秒`;
  // 2 段目の段 11 の PR 3: 「バーストスキルクールタイム X 秒▼」（burstCooldown の flat。維持の付いた形）は、その間のバーストの CT から引く秒
  if (effect.scaling === 'flat' && effect.stat === 'burstCooldown')
    return `バーストスキルのクールタイム −${formatNumber(effect.appliedAmount, 2)} 秒`;
  if (effect.scaling === 'flat') return `${stat} ${sign}${formatNumber(amount)} 発`;
  // Stage 11 アリス編: 発動者基準のチャージ速度は秒数でチャージ時間から引く
  if (effect.scaling === 'casterChargeTime')
    return `チャージ時間 −${formatNumber(effect.appliedAmount, 3)} 秒（発動者基準のチャージ速度）`;
  return `${stat} ${sign}${formatPercent(amount, 2)}`;
}

/**
 * Stage 11 モダニア: 持続効果の付き方の補足。「最大 5 スタック」「自分が命中率増加状態なら」。無ければ空文字
 */
export function formatTimedExtras(effect: AppliedTimedEffect): string {
  const parts: string[] = [];
  if ('maxStacks' in effect && effect.maxStacks !== undefined) parts.push(`最大 ${effect.maxStacks} スタック`);
  // 名前の付いた状態の語彙編: 状態の中身の条件・維持は付与のもの（きっかけの欄に「〈名前〉の間」と出す）。段 11 の PR 2: カウンタの while も
  if (!isTimedItem(effect)) return parts.length === 0 ? '' : `（${parts.join('・')}）`;
  const condition = effect.condition;
  if (condition?.selfBuffed !== undefined) parts.push(`自分が${BUFF_STAT_LABEL[condition.selfBuffed]}増加状態なら`);
  if (condition?.inFullBurst === true) parts.push('フルバーストタイムなら');
  // 2 段目の段 1: 自分の状態の条件（静的な状態を見るものは編成の段で決まり、ここには来ない）。段 3: スタック数の条件
  if (condition?.selfState !== undefined) parts.push(selfStateText(condition.selfState, 'なら', 'でなければ'));
  if (condition?.usedBurst === true) parts.push('直前に自分がバーストを使用していれば');
  if (effect.durationUntil === 'fullBurstEnd') parts.push('フルバーストタイムの終了まで');
  if (effect.amplifies !== undefined) {
    parts.push(
      `${SKILL_SLOT_LABEL[effect.amplifies.skill]}の同じ効果の ${formatNumber(effect.amplifies.percent)}% 増し（発動の瞬間に効いていれば）`,
    );
  }
  if (effect.durationUntil === 'battleEnd') parts.push('戦闘の終わりまで');
  return parts.length === 0 ? '' : `（${parts.join('・')}）`;
}

/**
 * Stage 10: 即時効果。「バースト CT −2.34 秒」「弾丸チャージ 39.88%」。Stage 11: 「回復（最大 HP の 5.23%）」。
 * V-0024: 維持時間のある回復（吸収回復）は「回復 2.77%（10 秒間維持）」
 */
export function formatInstant(effect: ResolvedInstantEffect): string {
  switch (effect.kind) {
    case 'cooldownReduction':
      return `バースト CT −${formatNumber(effect.value, 2)} 秒`;
    case 'ammoRefill':
      // ルドミラ：ウィンターオーナー編: 発数の弾丸チャージ（scaling 'flat'）
      return effect.scaling === 'flat'
        ? `弾丸チャージ ${formatNumber(effect.value)} 発`
        : `弾丸チャージ ${formatPercent(effect.value, 2)}`;
    case 'heal':
      return effect.durationFrames === undefined
        ? `回復（最大 HP の ${formatPercent(effect.value, 2)}）`
        : `回復 ${formatPercent(effect.value, 2)}（${formatNumber(framesToGameSeconds(effect.durationFrames), 0)} 秒間維持）`;
    case 'burstGauge':
      return `バーストゲージのチャージ ${formatPercent(effect.value, 2)}`;
    // 2 段目の段 11: 「残弾数 100% 減少」
    case 'ammoDecrease':
      return `残弾数 ${formatPercent(effect.value, 2)} 減少`;
  }
}

/** 2 段目の段 8（plan/design-skill-stage8.md 1.2 節）: 定義に「残りの HP の割合が最も低い味方」を選ぶ回復があるか（宝物版のスロットも見る） */
export function hasLowestHpRatioHeal(definition: SkillDefinition): boolean {
  const entries = [...Object.values(definition.skills), ...Object.values(definition.treasureSkills ?? {})];
  return entries.some((entry) => entry.effects.some((e) => e.kind === 'heal' && e.target === 'lowestHpRatio'));
}

/** 2 段目の段 8（plan/design-skill-stage8.md 1.3 節）: 即時効果の対象の絞り込み。「（残りの HP の割合が最も低い味方 1 機）」。無ければ空文字 */
export function formatInstantTarget(effect: ResolvedInstantEffect): string {
  if (effect.target === 'lowestHpRatio') return `（残りの HP の割合が最も低い味方 ${effect.targetCount ?? 1} 機）`;
  // 2 段目の段 9（plan/design-skill-stage9.md 1.1 節）: 「〈クラス〉型の味方」（エヌ：ミラクルフェアリーの回復）
  return effect.targetClass ? `（${CLASS_LABEL[effect.targetClass]}の味方）` : '';
}

/** 「枠 2 ノワール スキル 1」。ニケ名がまだ無い（読み込み中）ときは「枠 2（読み込み中）スキル 1」 */
export function formatEffectSource(effect: AppliedEffect, characterName: string | undefined): string {
  const who =
    characterName === undefined
      ? `枠 ${effect.sourceSlotIndex + 1}（読み込み中）`
      : `枠 ${effect.sourceSlotIndex + 1} ${characterName}`;
  // Stage 9: 「〈武器〉を所持する味方」だけに掛かる効果。Stage 11: 「直前にバーストを使った味方」「最終攻撃力が最も高い味方 N 機」
  // アスカ: 「〈コード〉コードの味方」（「灼熱コードの SG の味方」のように武器種と並べる）
  const element = effect.targetElement ? `${ELEMENT_LABEL[effect.targetElement].ja}コードの` : '';
  // 2 段目の段 9: 「〈クラス〉型の味方」
  const nikkeClass = effect.targetClass ? `${CLASS_LABEL[effect.targetClass]}の` : '';
  // 対象の語彙編: 「同じ部隊の味方」「自分を除く」「基本チャージ時間が最も長い味方 N 機」
  const squad = effect.targetSquad === 'same' ? '同じ部隊の' : '';
  // ペルソナ編: 「基本バースト段階 III のペルソナ状態の味方」（状態の名前は目録の name）
  const step = effect.targetBurstStep ? `基本バースト段階 ${BURST_STEP_ROMAN[effect.targetBurstStep]} の` : '';
  // 2026-10-29 のキャラの編: 「自分と〈状態〉の味方」
  const state = effect.targetState
    ? `${effect.includeSelf ? '自分と' : ''}${stateLabel(effect.targetState)}状態の`
    : '';
  const weapon = `${squad}${step}${state}${nikkeClass}${element}${effect.targetWeapon ? `${effect.targetWeapon} の` : ''}`;
  const exclude =
    effect.excludeSelf === 'always'
      ? '自分を除く'
      : effect.excludeSelf === 'unlessShort'
        ? '自分を除く（足りなければ自分も）'
        : '';
  // 2 段目の段 7: 「自分と自分より最終防御力が低い味方」（発火の瞬間の最終防御力で決めた対象）
  const defense = effect.targetDefense === 'lowerThanSelf' ? '自分と自分より最終防御力が低い' : '';
  const only =
    effect.target === 'burstUsers'
      ? `（直前にバーストを使った${weapon}味方）`
      : effect.target === 'topAttack'
        ? `（${exclude}最終攻撃力が最も高い${weapon}味方 ${effect.targetCount ?? 1} 機）`
        : effect.target === 'longestChargeTime'
          ? `（基本チャージ時間が最も長い${weapon}味方 ${effect.targetCount ?? 1} 機）`
          : weapon !== '' || exclude !== '' || defense !== ''
            ? `（${exclude}${defense}${weapon}味方）`
            : '';
  return `${who} ${SKILL_SLOT_LABEL[effect.source.skill]}${only}`;
}

/** Stage 9: 宝物の段階の選択肢のラベル。「1 段階（スキル 1）」「2 段階（+スキル 2）」 */
export function treasurePhaseLabel(unlockOrder: readonly SkillSlot[], phase: number): string {
  if (phase === 0) return 'なし';
  const slot = unlockOrder[phase - 1];
  const what = slot === undefined ? '' : SKILL_SLOT_LABEL[slot];
  return `${phase} 段階（${phase === 1 ? '' : '+'}${what}）`;
}

// ---- Stage 13: 育成入力の効果層（OL・キューブ・コレクション） ----

export const GEAR_PART_LABEL: Record<GearPart, string> = { head: '頭', body: '胴', arm: '腕', leg: '足' };

/** 「攻撃力 +14.63%」 */
export function formatBuildEffect(effect: BuildEffect): string {
  return `${BUFF_STAT_LABEL[effect.stat]} +${formatPercent(effect.value, 2)}`;
}

/** 「OL 頭 1 行目（攻撃力増加 Lv15）」「キューブ（アンチコードHC 段階 6）」「コレクション（…段階 4）」 */
export function formatBuildEffectSource(source: BuildEffectSource): string {
  switch (source.kind) {
    case 'overload':
      return `OL ${source.part ? GEAR_PART_LABEL[source.part] : ''} ${(source.line ?? 0) + 1} 行目（${source.name.ja} Lv${source.level}）`;
    case 'cube':
      return `キューブ（${source.name.ja} 段階 ${source.level}）`;
    case 'collection':
      return `コレクション（${source.name.ja} 段階 ${source.level}）`;
  }
}
