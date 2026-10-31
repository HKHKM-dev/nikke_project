// Stage 5: バーストスロットの倍率ダメージ（burstDamage）を Lv の数値に解決し、1 発動あたりの期待ダメージを出す。
// 式（2026-09-22 の射撃場実測で確認。plan/design-stage5.md 1 節、plan/verification.md Stage 5 節）:
//   burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100 × (1 + 会心期待値 [+ 0.5]) × (1 + Σ attackDamage) × 属性有利
// 武器倍率・チャージ倍率・コア・距離は掛けない。
// Stage 8: トリガー付きの倍率ダメージ（damage。「10 回攻撃した時 X% のダメージ」など）も同じ式で計算する（computeSkillHit）。
// 分配ダメージには (1 + Σ distributedDamage) を別の乗数で掛ける（録画 0021 のクイーン（真）の 1.9001 倍。plan/design-stage8.md 2.4 節）。
// ただし受けるダメージ▲とは 1 つの和 (1 + Σ distributedDamage + Σ damageTaken) で掛かる（エレグの S1。C-0767）。
// 持続ダメージ▲編: 持続ダメージ（dot）の tick には Σ sustainedDamage を SUSTAINED_DAMAGE_PLACEMENT の置き場所で掛ける。
import type { EnemyInput, TriggerDamage } from '../damage.ts';
import {
  defenceAfterDown,
  DISTANCE_BONUS,
  distributedHitMultiplier,
  explosionHitMultiplier,
  FULL_BURST_BOOST,
  skillElementMultiplier,
  stickHitMultiplier,
  trueDamageBucketMultiplier,
} from '../damage.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData, LocalizedText } from '../types.ts';
import { applyCritBuffs, type BuffTotals } from './buffs.ts';
import type { NamedStateId } from './states.ts';
import type { CounterId } from './counters.ts';
import {
  isShotCountTrigger,
  isTimerTrigger,
  SKILL_SLOTS,
  splitsPerCount,
  type DamageEffect,
  type DotFirstTick,
  type EffectCondition,
  type SkillDamageType,
  type SkillDefinition,
  type SkillSlot,
  type TimerTrigger,
} from './types.ts';
import {
  durationSecondsOf,
  isResolvedShotCount,
  isResolvedTimer,
  resolveCondition,
  resolveTrigger,
  skillValue,
  type ResolvedShotCountTrigger,
  type ResolvedTrigger,
  type SkillLevels,
} from './resolve.ts';

/**
 * バースト発動時の即時ダメージにフルバースト補正 +0.5 を乗せるか。
 * **2026-09-22 の射撃場実測で「乗せない」と確定**（plan/verification.md Stage 5 節、録画 0018・0019）:
 * ラピのバースト 657.72% が 208,131 × 3 = 624,393 =（素の攻撃力 − 防御）× 6.5772、
 * ノワールのバースト 351.64% が 480,611 =（バフ後 136,777 − 100）× 3.5164 で、どちらも +0.5 が乗っていない。
 * コア・距離も乗らないことを同時に確認した。
 */
export const BURST_SKILL_FULL_BURST_BONUS = false;

// Stage 8 の SKILL_HIT_FULL_BURST_BONUS（倍率ダメージにフルバースト補正を乗せる）は、Stage 11 モダニアで 1 トリガーの式
// （damage.ts の射撃ごとの倍率ダメージ）も使うので damage.ts に移した（循環 import を避けるため）。ここからも export する
export { SKILL_HIT_FULL_BURST_BONUS } from '../damage.ts';

/**
 * 持続ダメージ▲編（plan/design-sustained-damage-up.md 3.3 節）: 持続ダメージ▲（sustainedDamage）の式の中の置き場所。
 * separate = 別枠の乗数 (1 + Σ)（H1）、attackDamage = 攻撃ダメージ▲と同じ群 (1 + Σ攻撃ダメージ + Σ持続ダメージ)（H2）、
 * boost = 倍率グループに足す (1 + 会心 + フルバースト補正 + Σ)（H3）
 */
export type SustainedDamagePlacement = 'separate' | 'attackDamage' | 'boost';
export const SUSTAINED_DAMAGE_PLACEMENTS = [
  'separate',
  'attackDamage',
  'boost',
] as const satisfies readonly SustainedDamagePlacement[];

/**
 * いまのモデルの置き場所。マナの録画（V-0185）の tick が H2 と合った（C-0299。H1 の C-0279 は棄却）。
 * 検証の予測は TeamInput.sustainedDamagePlacement で切り替える
 */
export const SUSTAINED_DAMAGE_PLACEMENT: SustainedDamagePlacement = 'attackDamage';

/** 解決済みの倍率ダメージ 1 件。burstDamage（burst スロット）と damage（Stage 8）で共通 */
export type ResolvedSkillDamage = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  damageType: SkillDamageType;
  /** X/100。3.5164 など */
  multiplier: number;
  /** アニス：スター編: 発射体の爆発のヒット（自動攻撃の projectileExplosion）。発射体爆発ダメージ▲を掛ける（V-0124） */
  projectileExplosion?: true;
  /** 持続ダメージ▲編: 持続ダメージ（dot。autoAttack は除く）の tick。持続ダメージ▲（sustainedDamage）を掛ける */
  sustained?: true;
  /**
   * コアの経路編: コアに当たりうるヒット（自動攻撃の core）。plan/design-anis-star-core-path.md 3.1 節。2 段目の段 12 の PR 2: damage の
   * core（粘着榴弾の付着）も
   */
  core?: true;
  /** 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.4 節）: コア命中ダメージ（core と組み、コアに当たる割合を 1 にする） */
  coreHit?: true;
  /** 同 5.5 節: 「N 回順番に攻撃」のヒット。順番攻撃ダメージ▲（sequentialAttackDamage）を掛ける */
  sequential?: true;
  /** 2 段目の段 12 の PR 2: 撃った枠の通常攻撃と同じ距離ボーナスを倍率グループに足すヒット（damage の distance。粘着榴弾の付着と爆発） */
  distance?: true;
  /** 2 段目の段 12 の PR 2: 発射体の付着のヒット（damage の projectileStick）。発射体付着ダメージ▲を掛ける */
  projectileStick?: true;
  assumes?: LocalizedText;
};

export type ResolvedBurstDamage = ResolvedSkillDamage;

/** 周期の短縮の解決した形（skills/types.ts の PeriodShorten） */
export type ResolvedPeriodShorten = { seconds: number } & (
  { state: NamedStateId; window?: never } | { window: { trigger: 'burstUse'; durationFrames: number }; state?: never }
);

/** Stage 8: トリガー付きの倍率ダメージ。いつ出るかが付いた形 */
export type ResolvedDamageEffect = ResolvedSkillDamage & {
  /** 2 段目の段 13 の PR 1: { counterFull } は 1 パス目のカウンタの記録から発火する（skills/holders.ts の counterFullFrames） */
  trigger: ResolvedTrigger;
  /** 同じスロットの何番目の効果か（表示・識別用） */
  effectIndex: number;
  /**
   * Stage 11 紅蓮BS: 段の循環（cycle）の 1 段なら、何段目（0 始まり）と段の数。trigger は循環の射撃の回数トリガー
   * （窓の外の間隔）で、実際の発動は skills/cycles.ts の cycleFires が決める。damage 効果ではキーごと無い
   */
  cycle?: { step: number; steps: number };
  /** クルミ S2 編: damage の発火の条件（plan/design-kurumi-s2.md 2.2・2.3 節）。frame/plan.ts の planSkillHits が絞る */
  condition?: EffectCondition;
  /** 遅れて出る倍率ダメージ編: きっかけからの遅れ（フレーム）。frame/plan.ts の planSkillHits がそのフレームのバフで出す */
  delayFrames?: number;
  /** ミハラのバースト編: バーストの倍率ダメージの分かれたヒットのそれぞれに出す（frame/plan.ts の planSkillHits） */
  perBurstHit?: true;
  /** 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2 節）: 1 回の発動のヒット数と、ヒットの間（フレーム） */
  hits?: number;
  hitIntervalFrames?: number;
  /**
   * エレグの S1（C-0766）: 等分したヒットの、delayFrames 後からの遅れ（multiplier は 1 ヒットの値 = 定義の値 ÷ ヒットの数）と、値を決める
   * 発火からのフレーム数（frame/plan.ts の planSkillHits。N 回（hits）は 0 = 発火のフレーム。無ければヒットのフレームの値）
   */
  hitOffsets?: number[];
  valueDelayFrames?: number;
  /**
   * 同 5.3 節: 前の発動のフレームに自分が state なら、次の発動までを seconds 秒縮める（frame/plan.ts の shortenedTimerFrames）。
   * 2 段目の段 15 の PR 3: window なら、自分のバースト使用のフレームから durationFrames の間（縮めた次の発動のフレームだけで見る）
   */
  periodShorten?: ResolvedPeriodShorten;
  /** V-0545: 周期の発火のどのヒットも射手の 1 ヒットぶんのゲージを溜める（frame/firstPass.ts が予約する） */
  gaugePerHit?: true;
  /** 2 段目の段 10: 倍率に掛ける、発火のフレームの自分のその状態のスタック数か、段 11 の PR 5: カウンタの値（frame/plan.ts の planSkillHits） */
  perCount?: { state: NamedStateId } | { counter: CounterId };
  /** 2 段目の段 12 の PR 2: perCount の数だけ、倍率を掛けずに 1 つずつこの間隔（秒）で出す（frame/plan.ts の planSkillHits） */
  perCountIntervalSeconds?: number;
  /**
   * 2 段目の段 13 の PR 1: perCount の数だけ、delayFrames 後からこのフレーム数ごとに出す（damage）か付ける（dot）（frame/plan.ts の
   * planSkillHits）
   */
  perCountIntervalFrames?: number;
  /**
   * ニヒリスター編: 持続ダメージ（dot）の 1 tick なら、間隔と維持の秒。trigger は付く時で、tick のフレームは
   * frame/plan.ts の dotTickFrames が決める。damage 効果ではキーごと無い
   */
  dot?: {
    intervalSeconds: number;
    durationSeconds: number;
    firstTick: DotFirstTick;
    /** 名前の付いた状態の語彙編: 付いている間を敵の状態（目録の id）とする持続ダメージ（plan/design-named-state.md 5.4 節） */
    state?: NamedStateId;
    /** レイヴン編: 最大スタック数。スタックしない持続ダメージは 1（plan/design-raven-s1.md 8 節の 1） */
    maxStacks: number;
    /** レイヴン編: 付けたとき・tick ごとに射手の 1 ヒットぶんのゲージを溜める（C-0181。frame/firstPass.ts） */
    gaugeOnApply?: true;
    /** 回数トリガーの遅れ編の第 2 段: 付けたときのゲージを発火の何フレーム後に足すか（レイヴンは 6。frame/firstPass.ts） */
    gaugeOnApplyDelayFrames?: number;
    /** tick の刻みを発火の何フレーム後から数えるか（skills/types.ts の DotEffect.tickDelayFrames） */
    tickDelayFrames?: number;
    gaugeOnTick?: true;
    /** アニス：スター S2・バースト編: 周期の自動攻撃（autoAttack）を dot の形にしたもの。表示のラベルだけが変わる */
    autoAttack?: true;
    /** 2 段目の段 13 の PR 1: firstTick halfAfterLatest の tick の間隔（ゲーム内のティック。実測）と、付けた時の 1 スタックのヒット */
    tickIntervalFrames?: number;
    hitOnApply?: true;
    /** 同: { counterFull } の perCount の最初の付与の、発火からの遅れ（フレーム） */
    applyDelayFrames?: number;
    /** 2 段目の段 13 の PR 2: tick のスタックの数を写す、敵に付いた別の dot の state（プリング・チェーン） */
    stacksFrom?: NamedStateId;
  };
};

/** burst スロットの burstDamage 効果を Lv の数値に解決する。unsupported・効果なしなら空 */
export function resolveBurstDamage(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedBurstDamage[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const entry = def.skills.burst;
  if (entry.effects.length === 0) return [];
  const skill = character.skills.burst;
  const resolved: ResolvedBurstDamage[] = [];
  for (const effect of entry.effects) {
    if (effect.kind !== 'burstDamage') continue;
    // 2 段目の段 10（plan/design-skill-stage10.md 2.2 節）: 「N 回順番に攻撃」は、1 回の発動の倍率を回数倍にする（遅れの表の分かれた
    // ヒットで等分すると、各ヒットが説明文の値になる。回数と分かれたヒットの数（burstDelaysOf の hitOffsets）がそろうかは、
    // 定義のテスト（skills/__tests__/definitions.test.ts）が確かめる）
    const hits = effect.hitsRef === undefined ? 1 : skillValue(skill, effect.hitsRef, levels.burst);
    const r: ResolvedBurstDamage = {
      source: { resourceId: character.resourceId, skill: 'burst', name: skill.name },
      damageType: effect.damageType,
      multiplier: (skillValue(skill, effect.ref, levels.burst) / 100) * hits,
    };
    if (effect.assumes) r.assumes = effect.assumes;
    resolved.push(r);
  }
  return resolved;
}

/** Stage 8: 定義の各 damage 効果を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
/**
 * 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2 節）: 発火のフレーム fire の倍率ダメージのヒットのフレーム。delayFrames の後に
 * N ヒット（hits。無ければ 1）を hitIntervalFrames おきに出し、戦闘の終わりを越えるヒットは出さない。2 パス目（frame/plan.ts）のヒットと、
 * 1 パス目（frame/firstPass.ts）のヒットごとのゲージ（gaugePerHit。V-0545）が同じ列を使う
 */
export function damageHitFramesOf(
  effect: Pick<ResolvedDamageEffect, 'delayFrames' | 'hits' | 'hitIntervalFrames' | 'hitOffsets'>,
  fire: number,
  frames: number,
): number[] {
  // エレグの S1（C-0766）: 等分したヒットは、delayFrames の後の遅れの並び（N ヒットは間隔の倍数の並び）
  const offsets =
    effect.hitOffsets ?? Array.from({ length: effect.hits ?? 1 }, (_, k) => k * (effect.hitIntervalFrames ?? 0));
  const out: number[] = [];
  for (const offset of offsets) {
    const at = fire + (effect.delayFrames ?? 0) + offset;
    if (at >= frames) break;
    out.push(at);
  }
  return out;
}

/**
 * 2 段目の段 12・13: perCount の数だけのヒット（付与）の、発火 frame からのフレーム。k 個目（0 始まり）は、秒の間隔なら
 * delay + floor(k × 間隔 ÷ 0.017) 後（端数を持ち越す。粘着榴弾の起爆。C-0726）、フレーム数の間隔なら delay + k × 間隔の後（キャプチャーチェーン。
 * C-0745）。戦闘の終わり（end）より前だけ。2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 秒の間隔にも delay を足す
 * （オートファイアの順番の攻撃は、フルチャージの発の 44f 後から 0.2 秒ごと。V-0552）。2 パス目（frame/plan.ts）のヒットと、1 パス目
 * （frame/firstPass.ts）のヒットごとのゲージ（gaugePerHit）が同じ列を使う
 */
export function perCountFrames(
  frame: number,
  count: number,
  step: { seconds?: number; frames?: number; delay?: number },
  end: number,
): number[] {
  const out: number[] = [];
  for (let k = 0; k < count; k++) {
    const offset =
      (step.delay ?? 0) + (step.seconds !== undefined ? gameSecondsToFrames(k * step.seconds) : k * step.frames!);
    if (frame + offset < end) out.push(frame + offset);
  }
  return out;
}

/**
 * 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 発火のフレーム fire の倍率ダメージのヒットのフレーム。perCount の数だけ
 * 1 つずつ出すなら（splitsPerCount。count は発火のフレームの数）perCountFrames、そうでなければ damageHitFramesOf。2 パス目
 * （frame/plan.ts）のヒットと、1 パス目（frame/firstPass.ts）のヒットごとのゲージ（gaugePerHit）が同じ列を使う
 */
export function effectHitFrames(
  effect: Pick<
    ResolvedDamageEffect,
    'delayFrames' | 'hits' | 'hitIntervalFrames' | 'hitOffsets' | 'perCountIntervalSeconds' | 'perCountIntervalFrames'
  >,
  fire: number,
  count: number | undefined,
  end: number,
): number[] {
  if (!splitsPerCount(effect) || count === undefined) return damageHitFramesOf(effect, fire, end);
  const step = {
    seconds: effect.perCountIntervalSeconds,
    frames: effect.perCountIntervalFrames,
    delay: effect.delayFrames,
  };
  return perCountFrames(fire, count, step, end);
}

/**
 * Stage 11 モダニア: 射撃ごとの倍率ダメージ（every = 1）を 1 トリガーの値に畳み込むか（resolvePerShotDamage）。条件つきは畳み込まない
 * （射撃ごとの発動として 1 件ずつ出す）。2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 遅れて出るヒット（delayFrames）・
 * perCount の数だけのヒット（オートファイア）も、発のヒットと別のヒットなので畳み込まず、発ごとに 1 件ずつ出す
 */
function foldsIntoShot(effect: DamageEffect, trigger: ResolvedTrigger): boolean {
  return (
    isPerShotTrigger(trigger) &&
    effect.condition === undefined &&
    effect.delayFrames === undefined &&
    effect.perCount === undefined
  );
}

export function resolveDamageEffects(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedDamageEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedDamageEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind !== 'damage') return;
      const trigger = resolveTrigger(effect.trigger, skill, levels[slot]);
      // 射撃ごとの倍率ダメージは発動を作らず、1 トリガーの値に畳み込む（resolvePerShotDamage）。
      // クルミ S2 編: 条件つきは畳み込まない（1 パス目の後に絞るので）。2 段目の段 10（plan/design-skill-stage10.md 3.2 節）: 条件つきは、
      // 射撃ごとの発動として 1 件ずつ出す（ネオン：ビジョン・アイの S1 の超火力状態の追加効果。条件 selfState を射撃のフレームで見る）
      // 回数トリガーの遅れ編の第 2 段: 畳み込む効果は射撃と同じフレームに乗る。遅れて出るヒットは畳み込まない（foldsIntoShot）
      // 2026-10-29 のキャラの編: 畳み込む効果はコアの補正を持てない（resolvePerShotDamage が読まない）
      if (foldsIntoShot(effect, trigger) && effect.coreHit === true) {
        throw new RangeError(`skill ${skill.id}: a per-shot damage (every 1) cannot be a core hit damage`);
      }
      if (foldsIntoShot(effect, trigger)) return;
      // 条件つきの射撃ごとも、SG ではペレットごとか 1 回の射撃ごとかが決まっていない（resolvePerShotDamage と同じく拒否する）
      if (isPerShotTrigger(trigger) && character.weaponType === 'SG') {
        throw new RangeError(
          `skill ${skill.id}: damage on every shot is not supported for SG (per pellet or per trigger)`,
        );
      }
      const r: ResolvedDamageEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        damageType: effect.damageType,
        multiplier: skillValue(skill, effect.ref, levels[slot]) / 100,
        trigger,
        effectIndex,
      };
      if (effect.condition) r.condition = resolveCondition(effect.condition, skill, levels[slot]);
      if (effect.delayFrames !== undefined) r.delayFrames = effect.delayFrames;
      if (effect.perBurstHit === true) r.perBurstHit = true;
      if (effect.perCount !== undefined) r.perCount = effect.perCount;
      // 2026-10-29 のキャラの編（plan/design-new-chars-1029.md 5.2・5.4 節）
      if (effect.hitsRef !== undefined) {
        const hits = skillValue(skill, effect.hitsRef, levels[slot]);
        if (!Number.isInteger(hits) || hits < 1)
          throw new RangeError(`skill ${skill.id}: hits must be a positive integer`);
        r.hits = hits;
        r.hitIntervalFrames = effect.hitIntervalFrames ?? 0;
        r.sequential = true;
        // 同 10.2 節の d: N ヒットとも発火のフレームの値（C-0735）
        r.valueDelayFrames = 0;
      }
      // エレグの S1（C-0766）: 定義の値をヒットの数で等分する
      if (effect.hitOffsetFrames !== undefined) {
        r.hitOffsets = effect.hitOffsetFrames;
        r.multiplier /= effect.hitOffsetFrames.length;
        if (effect.valueDelayFrames !== undefined) r.valueDelayFrames = effect.valueDelayFrames;
      }
      if (effect.periodShorten !== undefined && isResolvedTimer(trigger)) {
        const { slot: from, ref, state, window } = effect.periodShorten;
        const seconds = skillValue(character.skills[from], ref, levels[from]);
        if (!(seconds > 0 && seconds < trigger.everySeconds)) {
          throw new RangeError(
            `skill ${skill.id}: the shortened period must stay positive (${trigger.everySeconds} − ${seconds})`,
          );
        }
        r.periodShorten =
          window === undefined
            ? { state, seconds }
            : {
                window: {
                  trigger: window.trigger,
                  durationFrames: gameSecondsToFrames(durationSecondsOf(window, character.skills[from], levels[from])),
                },
                seconds,
              };
      }
      if (effect.gaugePerHit === true) r.gaugePerHit = true;
      if (effect.coreHit === true) {
        r.core = true;
        r.coreHit = true;
      }
      if (effect.perCountIntervalSeconds !== undefined) r.perCountIntervalSeconds = effect.perCountIntervalSeconds;
      if (effect.perCountIntervalFrames !== undefined) r.perCountIntervalFrames = effect.perCountIntervalFrames;
      // 2 段目の段 14 の PR 2（plan/design-skill-stage14.md 2.5 節）: 「順番に攻撃」の perCount の数だけのヒット（オートファイアの効果 2）も
      // 順番の攻撃で、順番攻撃ダメージ▲を掛ける
      if (effect.sequentialAttack === true) r.sequential = true;
      // 2 段目の段 12 の PR 2: 1 ヒットの印（コア・距離ボーナス・発射体の爆発・付着）
      if (effect.core === true) r.core = true;
      if (effect.distance === true) r.distance = true;
      if (effect.projectileExplosion === true) r.projectileExplosion = true;
      if (effect.projectileStick === true) r.projectileStick = true;
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
  }
  return resolved;
}

/** ヘルム編（V-0034）: バーストゲージを溜める倍率ダメージ（damage の gaugeHits）。射撃の回数トリガーだけ */
export type ResolvedDamageGauge = { trigger: ResolvedShotCountTrigger; gaugeHits: number[] };

/** ヘルム編: damage の gaugeHits を Lv の数値に解決する（射撃ごとに畳み込む効果も含む）。unsupported なら空 */
export function resolveDamageGauges(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedDamageGauge[] {
  const out: ResolvedDamageGauge[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    for (const effect of entry.effects) {
      if (effect.kind !== 'damage' || effect.gaugeHits === undefined) continue;
      const trigger = resolveTrigger(effect.trigger, character.skills[slot], levels[slot]);
      if (!isResolvedShotCount(trigger)) throw new RangeError('gaugeHits needs a shot count trigger');
      out.push({ trigger, gaugeHits: effect.gaugeHits });
    }
  }
  return out;
}

/**
 * フラワー編: 周期でゲージだけを溜める効果（burstGaugeHit）の、周期の秒と発火からの遅れ（delayFrames。無ければ 0）の列（効果ごとに 1 つ）。
 * unsupported なら空。1 回の量は射手の targetBurstEnergyPerShot（frame/firstPass.ts。plan/design-flower-s2-gauge.md 2 節）
 */
export function resolveTimerGauges(def: SkillDefinition): (TimerTrigger & { delayFrames: number })[] {
  const out: (TimerTrigger & { delayFrames: number })[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    for (const effect of entry.effects) {
      if (effect.kind === 'burstGaugeHit' && isTimerTrigger(effect.trigger)) {
        out.push({ ...effect.trigger, delayFrames: effect.delayFrames ?? 0 });
      }
    }
  }
  return out;
}

/**
 * モラン編（plan/design-moran.md 3 節）: 射撃の回数のトリガーでゲージだけを溜める効果（burstGaugeHit）の、Lv の数値に解決した
 * トリガーの列（効果ごとに 1 つ）。unsupported なら空。1 回の量は射手の targetBurstEnergyPerShot で、発火した射撃のフレームに足す
 * （frame/firstPass.ts）。回数トリガーの遅れ編（plan/design-shot-count-trigger-frame.md 6 節）: delayFrames があれば、発火した射撃の
 * フレームの delayFrames 後に足す（モラン S2 は 6。C-0480）
 */
export function resolveShotGauges(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): (ResolvedShotCountTrigger & { delayFrames?: number })[] {
  const out: (ResolvedShotCountTrigger & { delayFrames?: number })[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    for (const effect of entry.effects) {
      if (effect.kind !== 'burstGaugeHit' || !isShotCountTrigger(effect.trigger)) continue;
      const trigger = resolveTrigger(effect.trigger, character.skills[slot], levels[slot]);
      if (!isResolvedShotCount(trigger)) throw new RangeError('burstGaugeHit needs a timer or shot count trigger');
      out.push(effect.delayFrames === undefined ? trigger : { ...trigger, delayFrames: effect.delayFrames });
    }
  }
  return out;
}

/**
 * V-0534（ラピ：レッドフード S2 の粘着榴弾）: 射撃の止まり（shotPause）の、Lv の数値に解決したトリガーと止めるフレーム数（効果ごとに 1 つ）。
 * unsupported なら空。発火した射撃の次のフレームから止める（frame/firstPass.ts）
 */
export function resolveShotPauses(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): (ResolvedShotCountTrigger & { frames: number; framesOnLastShot: number; skill: SkillSlot })[] {
  const out: (ResolvedShotCountTrigger & { frames: number; framesOnLastShot: number; skill: SkillSlot })[] = [];
  for (const slot of SKILL_SLOTS) {
    for (const effect of def.skills[slot].effects) {
      if (effect.kind !== 'shotPause') continue;
      const trigger = resolveTrigger(effect.trigger, character.skills[slot], levels[slot]);
      if (!isResolvedShotCount(trigger)) throw new RangeError('shotPause needs a shot count trigger');
      out.push({
        ...trigger,
        frames: effect.frames,
        framesOnLastShot: effect.framesOnLastShot ?? effect.frames,
        skill: slot,
      });
    }
  }
  return out;
}

/**
 * アニス：スター S1 の味方のゲージ編（plan/design-anis-star-ally-gauge.md 2 節）: 定義の allyGaugeAdd の割合（説明文の % を 100 で割った値）。
 * 無ければ null（parseSkillDefinition が 1 つまでに限っている）
 */
export function resolveAllyGaugeAdd(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): number | null {
  for (const slot of SKILL_SLOTS) {
    for (const effect of def.skills[slot].effects) {
      if (effect.kind !== 'allyGaugeAdd') continue;
      const raw = skillValue(character.skills[slot], effect.ref, levels[slot]);
      if (raw < 0) throw new RangeError(`skill ${character.skills[slot].id}: allyGaugeAdd must be >= 0, got ${raw}`);
      return raw / 100;
    }
  }
  return null;
}

/**
 * ニヒリスター編: 定義の各 dot 効果を Lv の数値に解決する（1 tick の倍率・間隔・維持秒）。support が 'unsupported' のスキルは空。
 * 間隔が維持時間より長いと 1 tick も出ないので拒否する（durationRef は Lv で決まるのでここで見る）
 */
export function resolveDotEffects(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedDamageEffect[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedDamageEffect[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      // アニス：スター S2・バースト編: 周期の自動攻撃も、刻みと 1 ヒットの式は dot と同じ（plan/design-anis-star-s2-burst.md 2.2 節）
      if (effect.kind !== 'dot' && effect.kind !== 'autoAttack') return;
      const auto = effect.kind === 'autoAttack';
      const gaugeOnTick = auto ? effect.gaugePerHit === true : effect.gaugeOnTick === true;
      // 2 段目の段 13 の PR 1: 「持続」（durationUntil: battleEnd）は終わりが無い
      const durationSeconds =
        !auto && effect.durationUntil === 'battleEnd'
          ? Number.POSITIVE_INFINITY
          : (effect.durationSeconds ?? skillValue(skill, effect.durationRef!, levels[slot]));
      if (durationSeconds < effect.intervalSeconds) {
        throw new RangeError(
          `skill ${skill.id}: dot interval ${effect.intervalSeconds} s exceeds the duration ${durationSeconds} s`,
        );
      }
      const maxStacksRef = auto ? undefined : effect.maxStacksRef;
      const maxStacks = maxStacksRef === undefined ? 1 : skillValue(skill, maxStacksRef, levels[slot]);
      if (!Number.isInteger(maxStacks) || maxStacks < 1) {
        throw new RangeError(`skill ${skill.id}: dot max stacks must be a positive integer, got ${maxStacks}`);
      }
      // レイヴン編（plan/design-raven-s1.md 8 節の 2）: tick のゲージは 1 パス目で発火のたびに後の tick を予約するので、
      // 付け直しで延びた tick が付け直しより後に出る形（afterInterval で、維持が間隔の整数倍）だけを許す
      if (gaugeOnTick) {
        const ratio = durationSeconds / effect.intervalSeconds;
        if (Math.abs(ratio - Math.round(ratio)) > 1e-9) {
          throw new RangeError(
            `skill ${skill.id}: gaugeOnTick needs a duration (${durationSeconds} s) that is a multiple of the interval`,
          );
        }
      }
      const r: ResolvedDamageEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        damageType: 'skill',
        multiplier: skillValue(skill, effect.ref, levels[slot]) / 100,
        trigger: resolveTrigger(effect.trigger, skill, levels[slot]),
        effectIndex,
        dot: {
          intervalSeconds: effect.intervalSeconds,
          durationSeconds,
          firstTick: effect.firstTick ?? (auto ? 'afterInterval' : 'atApplication'),
          ...(!auto && effect.state !== undefined ? { state: effect.state } : {}),
          maxStacks,
          ...(!auto && effect.gaugeOnApply === true ? { gaugeOnApply: true as const } : {}),
          ...(!auto && effect.gaugeOnApplyDelayFrames !== undefined
            ? { gaugeOnApplyDelayFrames: effect.gaugeOnApplyDelayFrames }
            : {}),
          ...(!auto && effect.tickDelayFrames !== undefined ? { tickDelayFrames: effect.tickDelayFrames } : {}),
          ...(gaugeOnTick ? { gaugeOnTick: true as const } : {}),
          ...(auto ? { autoAttack: true as const } : {}),
          ...(!auto && effect.tickIntervalFrames !== undefined
            ? { tickIntervalFrames: effect.tickIntervalFrames }
            : {}),
          ...(!auto && effect.hitOnApply === true ? { hitOnApply: true as const } : {}),
          ...(!auto && effect.delayFrames !== undefined ? { applyDelayFrames: effect.delayFrames } : {}),
          ...(!auto && effect.stacksFrom !== undefined ? { stacksFrom: effect.stacksFrom.enemyState } : {}),
        },
      };
      if (!auto && effect.perCount !== undefined) {
        r.perCount = effect.perCount;
        r.perCountIntervalFrames = effect.perCountIntervalFrames!;
      }
      if (auto && effect.projectileExplosion === true) r.projectileExplosion = true;
      // 持続ダメージ▲編: 持続ダメージ▲は「持続ダメージ」にだけ掛ける。自動攻撃は持続ダメージではない（plan/design-sustained-damage-up.md 3.2 節）
      if (!auto) r.sustained = true;
      if (auto && effect.core === true) r.core = true;
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
  }
  return resolved;
}

/**
 * Stage 11 モダニア: 射撃ごとに発火するトリガーか（射撃の回数トリガーの every = 1。最後の弾丸は除く）。
 * 「通常攻撃が命中した時」の倍率ダメージは射撃と 1 対 1 で、同じ区間では毎回同じ値なので、1 トリガーの値に畳み込む
 */
export function isPerShotTrigger(trigger: ResolvedTrigger): boolean {
  return (
    typeof trigger === 'object' &&
    'every' in trigger &&
    trigger.every === 1 &&
    trigger.count !== 'lastShot' &&
    trigger.during === undefined &&
    trigger.firesDuring === undefined
  );
}

/**
 * Stage 11 モダニア: 射撃ごとの倍率ダメージ（damage の every = 1）を Lv の数値に解決する。damage.ts の computeTriggerDamage が
 * 1 トリガーの値（perShot）に足す。SG は「命中した時」がペレットごとかトリガーごとか分からないので拒否する
 */
export function resolvePerShotDamage(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedSkillDamage[] {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
  const resolved: ResolvedSkillDamage[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    const skill = character.skills[slot];
    for (const effect of entry.effects) {
      if (effect.kind !== 'damage') continue;
      // 2 段目の段 10: 条件つきは畳み込まない（resolveDamageEffects が射撃ごとの発動として出す）。段 14 の PR 2: 遅れて出るヒット・
      // perCount の数だけのヒットも
      if (!foldsIntoShot(effect, resolveTrigger(effect.trigger, skill, levels[slot]))) continue;
      if (character.weaponType === 'SG') {
        throw new RangeError(
          `skill ${skill.id}: damage on every shot is not supported for SG (per pellet or per trigger)`,
        );
      }
      // 2 段目の段 15 の PR 3: 射撃ごとに畳み込む値（damage.ts）は防御力を引いた式だけを持つ。防御力無視は使い手が出た時に足す
      if (effect.damageType === 'true')
        throw new RangeError(`skill ${skill.id}: a per-shot damage (every 1) cannot be true damage`);
      const r: ResolvedSkillDamage = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        damageType: effect.damageType,
        multiplier: skillValue(skill, effect.ref, levels[slot]) / 100,
      };
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    }
  }
  return resolved;
}

export type BurstHitInput = {
  /** バフ後の攻撃力 */
  attack: number;
  enemy: EnemyInput;
  /** バフ後の会心 */
  crit: CharacterData['crit'];
  attackDamageMultiplier: number;
  elementMultiplier: number;
  effects: readonly ResolvedSkillDamage[];
  /** 省略時は BURST_SKILL_FULL_BURST_BONUS */
  fullBurstBonus?: boolean;
  /** Stage 8: 1 + Σ distributedDamage。distributed の効果にだけ、受けるダメージ▲と 1 つの和で掛ける（C-0767）。省略 1 */
  distributedDamageMultiplier?: number;
  /** 2026-10-29 のキャラの編: Σ sequentialAttackDamage。sequential の効果にだけ、攻撃ダメージ▲と同じ和に足す（V-0545）。省略 0 */
  sequentialAttackDamage?: number;
  /**
   * 2 段目の段 15 の PR 3（plan/design-skill-stage15.md 2.3 節）: Σ trueDamage（防御力無視ダメージ▲）。damageType true の効果にだけ、攻撃ダメージ▲と
   * 同じ和に足す（damage.ts の TRUE_DAMAGE_BUCKET。C-0525）。省略 0
   */
  trueDamage?: number;
  /** 受けるダメージ編: 1 + Σ damageTaken（敵の受けるダメージ▲。別枠。C-0138）。省略 1 */
  damageTakenMultiplier?: number;
  /** アニス：スター編: 発射体爆発ダメージ▲の乗数（damage.ts の explosionHitMultiplier）。projectileExplosion の効果にだけ掛ける。省略 1 */
  projectileExplosionMultiplier?: number;
  /** 2 段目の段 12 の PR 2: 発射体付着ダメージ▲の乗数（damage.ts の stickHitMultiplier）。projectileStick の効果にだけ掛ける。省略 1 */
  projectileStickMultiplier?: number;
  /**
   * 2 段目の段 12 の PR 2: distance の効果の距離ボーナス。rate は距離ボーナスの付く割合（撃った枠の通常攻撃と同じ着地点の条件）、bonus は
   * 付いたときに倍率グループに足す値（DISTANCE_BONUS。距離ボーナスの範囲の無い武器は 0）。省略はなし
   */
  distance?: { rate: number; bonus: number };
  /** 持続ダメージ▲編: Σ sustainedDamage。sustained の効果にだけ、sustainedDamagePlacement の置き場所で掛ける。省略 0 */
  sustainedDamage?: number;
  /** 持続ダメージ▲編: 省略は SUSTAINED_DAMAGE_PLACEMENT */
  sustainedDamagePlacement?: SustainedDamagePlacement;
  /**
   * コアの経路編（plan/design-anis-star-core-path.md 3.1 節）: core の効果のコア。rate はコアに当たる割合（敵にコアが無ければ 0）、
   * damage は当たったときに boost に足す値（コア倍率 − 1）。省略はコアなし
   */
  core?: { rate: number; damage: number };
};

export type BurstHitResult = {
  /** max(1, 攻撃力 − 防御力) */
  baseHit: number;
  /** 効果の倍率の合計（X/100 の和） */
  multiplier: number;
  /**
   * 1 + 会心期待値 + フルバースト補正（乗せる設定のときだけ 0.5）+ コアの期待値。距離は入らない。
   * critDamage はバフ後の会心ダメージ倍率（会心した 1 ヒットを組み直すのに使う）。
   * core はコアの経路編: コアの期待値（割合 × coreDamage）、coreDamage はコアに当たったときに足す値（コア倍率 − 1）。どちらも core の
   * 効果があるときだけで、無ければ 0（core の効果と無い効果を 1 回の結果に混ぜる定義は無い）。
   * sustained は持続ダメージ▲編: 置き場所が boost のとき sustained の効果の倍率グループに足した Σ sustainedDamage（ほかは 0。
   * total には入れない。持続ダメージの tick は効果 1 つずつ計算するので、1 回の結果に sustained の効果とほかの効果は混ざらない）。
   * distance は 2 段目の段 12 の PR 2: 距離ボーナスの期待値（割合 × distanceBonus）、distanceBonus は付いたときに足す値。どちらも
   * distance の効果があるときだけで、無ければ 0（core と同じく、distance の効果と無い効果を 1 回の結果に混ぜる定義は無い）
   */
  boost: {
    crit: number;
    critDamage: number;
    fullBurst: number;
    core: number;
    coreDamage: number;
    distance: number;
    distanceBonus: number;
    total: number;
    sustained: number;
  };
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** 1 + Σ distributedDamage（distributed の効果にだけ掛かる） */
  distributedDamageMultiplier: number;
  /** 2026-10-29 のキャラの編: 順番攻撃ダメージ▲の乗数（sequential の効果にだけ掛かる。攻撃ダメージ▲の和に足した比。V-0545） */
  sequentialAttackDamageMultiplier: number;
  /** 受けるダメージ編: 1 + Σ damageTaken（すべての効果に掛かる） */
  damageTakenMultiplier: number;
  /** 持続ダメージ▲編: sustained の効果に掛けた乗数（置き場所によらず、▲なしに対する比）。sustained の効果が無ければ 1 */
  sustainedDamageMultiplier: number;
  /** 効果ごとの 1 発動あたり期待ダメージ */
  perEffect: { effect: ResolvedSkillDamage; expected: number }[];
  /** 1 発動あたりの合計 */
  perActivation: number;
};

export type SkillHitResult = BurstHitResult;

export function computeBurstHit(input: BurstHitInput): BurstHitResult {
  const fullBurstBonus = input.fullBurstBonus ?? BURST_SKILL_FULL_BURST_BONUS;
  const distributed = input.distributedDamageMultiplier ?? 1;
  const damageTaken = input.damageTakenMultiplier ?? 1;
  const explosion = input.projectileExplosionMultiplier ?? 1;
  const stick = input.projectileStickMultiplier ?? 1;
  const baseHit = Math.max(1, input.attack - input.enemy.defence);
  const boostCrit = input.crit.rate * (input.crit.damage - 1);
  const boostFullBurst = fullBurstBonus ? FULL_BURST_BOOST : 0;
  const boostBase = 1 + boostCrit + boostFullBurst;
  const anyCore = input.core !== undefined && input.effects.some((e) => e.core === true);
  const coreDamage = anyCore ? input.core!.damage : 0;
  const boostCore = anyCore ? input.core!.rate * input.core!.damage : 0;
  // 2 段目の段 12 の PR 2: 距離ボーナスはコアと同じ倍率グループの加算（distance の効果だけ）
  const anyDistance = input.distance !== undefined && input.effects.some((e) => e.distance === true);
  const distanceBonus = anyDistance ? input.distance!.bonus : 0;
  const boostDistance = anyDistance ? input.distance!.rate * input.distance!.bonus : 0;
  const boostTotal = boostBase + boostCore + boostDistance;
  const groupOf = (effect: ResolvedSkillDamage): number =>
    boostBase + (effect.core === true ? boostCore : 0) + (effect.distance === true ? boostDistance : 0);
  const common = baseHit * input.attackDamageMultiplier * damageTaken * input.elementMultiplier;
  // 2 段目の段 15 の PR 3: 防御力無視ダメージ（damageType true）は防御力を引かず（max(1, 攻撃力)）、防御力無視ダメージ▲を攻撃ダメージ▲と
  // 同じ和に足す（使用武器の変更の防御力無視の発と同じ。damage.ts の trueDamageMultiplier）
  const trueFactor =
    (Math.max(1, input.attack) / baseHit) *
    trueDamageBucketMultiplier(input.attackDamageMultiplier, input.trueDamage ?? 0);
  // 持続ダメージ▲は持続ダメージ（自動攻撃を除く）にだけ掛かり、コアは自動攻撃にだけ掛かるので、持続ダメージ▲の倍率グループはコアなし
  const placement = input.sustainedDamagePlacement ?? SUSTAINED_DAMAGE_PLACEMENT;
  const sustained = sustainedMultiplier(input.sustainedDamage ?? 0, placement, boostBase, input.attackDamageMultiplier);
  const hasSustained = input.effects.some((e) => e.sustained === true);
  // V-0545: 順番攻撃ダメージ▲は攻撃ダメージ▲と同じ和に足す（▲なしに対する比。持続ダメージ▲の attackDamage の置き場所と同じ形）
  const sequential =
    (input.attackDamageMultiplier + (input.sequentialAttackDamage ?? 0)) / input.attackDamageMultiplier;
  // 分配ダメージ▲は受けるダメージ▲と 1 つの和（common に掛けた受けるダメージ▲に対する比。damage.ts の distributedHitMultiplier。C-0767）
  const distributedFactor = distributedHitMultiplier(distributed, damageTaken);
  const perEffect = input.effects.map((effect) => ({
    effect,
    expected:
      common *
      groupOf(effect) *
      effect.multiplier *
      (effect.damageType === 'distributed' ? distributedFactor : 1) *
      (effect.damageType === 'true' ? trueFactor : 1) *
      (effect.sequential === true ? sequential : 1) *
      (effect.projectileExplosion === true ? explosion : 1) *
      (effect.projectileStick === true ? stick : 1) *
      (effect.sustained === true ? sustained : 1),
  }));
  let multiplier = 0;
  let perActivation = 0;
  for (const p of perEffect) {
    multiplier += p.effect.multiplier;
    perActivation += p.expected;
  }
  return {
    baseHit,
    multiplier,
    boost: {
      crit: boostCrit,
      critDamage: input.crit.damage,
      fullBurst: boostFullBurst,
      core: boostCore,
      coreDamage,
      distance: boostDistance,
      distanceBonus,
      total: boostTotal,
      sustained: hasSustained && placement === 'boost' ? (input.sustainedDamage ?? 0) : 0,
    },
    attackDamageMultiplier: input.attackDamageMultiplier,
    elementMultiplier: input.elementMultiplier,
    distributedDamageMultiplier: distributed,
    sequentialAttackDamageMultiplier: sequential,
    damageTakenMultiplier: damageTaken,
    sustainedDamageMultiplier: hasSustained ? sustained : 1,
    perEffect,
    perActivation,
  };
}

/**
 * 持続ダメージ▲編: 持続ダメージの tick に掛ける、▲なしに対する比。置き場所ごとに
 * separate = 1 + up、attackDamage = (攻撃ダメージの乗数 + up) / 攻撃ダメージの乗数、boost = (倍率グループ + up) / 倍率グループ
 */
export function sustainedMultiplier(
  up: number,
  placement: SustainedDamagePlacement,
  boostTotal: number,
  attackDamageMultiplier: number,
): number {
  if (up === 0) return 1;
  if (placement === 'separate') return 1 + up;
  if (placement === 'attackDamage') return (attackDamageMultiplier + up) / attackDamageMultiplier;
  return (boostTotal + up) / boostTotal;
}

/**
 * 1 回の結果を、会心の期待値を外して会心したか（crit）で組み直した 1 ヒットの値（観測値と比べる指標が使う）。
 * 持続ダメージ▲が倍率グループにある（boost.sustained > 0）ときは、それも倍率グループに入れて組み直す。
 * core はコアの経路編: コアに当たったヒットの値（plan/design-anis-star-core-path.md 3.1 節）。
 * distance は 2 段目の段 12 の PR 2: 距離ボーナスの付いたヒットの値（distance の効果。コアと同じく期待値を外して組み直す）
 */
export function oneHitValue(hit: BurstHitResult, crit: boolean, core = false, distance = false): number {
  const critTerm = crit ? hit.boost.critDamage - 1 : 0;
  // コアの経路編: total はコアの期待値を含むので、割ってから、コアに当たったとき（core）だけ coreDamage を足して組み直す
  const coreTerm = core ? hit.boost.coreDamage : 0;
  const distanceTerm = distance ? hit.boost.distanceBonus : 0;
  const expectedGroup = hit.boost.total + hit.boost.sustained;
  return (
    (hit.perActivation / expectedGroup) *
    (1 + critTerm + hit.boost.fullBurst + hit.boost.sustained + coreTerm + distanceTerm)
  );
}

/**
 * 分かれたヒット編（plan/design-burst-split-hits.md 4.2 節）: 1 回の発動の、当たったヒットを足し合わせる。各ヒットは倍率の
 * share ぶん。撃つ側のバフは発動で共通なので、ヒットごとに違うのは受けるダメージ（damageTakenMultiplier）だけで、合わせた値は
 * share で重みをつけた平均にする。1 ヒット（share 1）ならそのまま返す
 */
export function combineBurstHitParts(parts: readonly { hit: BurstHitResult; share: number }[]): BurstHitResult {
  const first = parts[0];
  if (first === undefined) throw new RangeError('no burst hit parts');
  if (parts.length === 1 && first.share === 1) return first.hit;
  const sum = (value: (hit: BurstHitResult) => number): number =>
    parts.reduce((total, p) => total + value(p.hit) * p.share, 0);
  const weight = parts.reduce((total, p) => total + p.share, 0);
  return {
    ...first.hit,
    damageTakenMultiplier: sum((hit) => hit.damageTakenMultiplier) / weight,
    perEffect: first.hit.perEffect.map((e, i) => ({
      effect: e.effect,
      expected: sum((hit) => hit.perEffect[i]!.expected),
    })),
    perActivation: sum((hit) => hit.perActivation),
  };
}

/**
 * 倍率ダメージ 1 回ぶん（effects をまとめて）。攻撃力・会心・攻撃ダメージ・分配ダメージは通常攻撃と同じバフ後の値を使う。
 * burstDamage（slotBurstHit）と damage（Stage 8）で共通。
 */
export function computeSkillHit(
  effects: readonly ResolvedSkillDamage[],
  character: CharacterData,
  enemy: EnemyInput,
  trigger: Pick<TriggerDamage, 'attack' | 'attackDamageMultiplier'>,
  buffs: BuffTotals,
  fullBurstBonus: boolean,
  sustainedDamagePlacement: SustainedDamagePlacement = SUSTAINED_DAMAGE_PLACEMENT,
  coreHitRate = 0,
  /** 2 段目の段 12 の PR 2: distance の効果の距離ボーナスの付く割合（撃った枠の通常攻撃と同じ。省略 0） */
  distanceRate = 0,
): SkillHitResult {
  return computeBurstHit({
    attack: trigger.attack,
    // 2 段目の段 2: 敵の防御力▼は、ヒットの時点の敵の側のバフ（buffs）で防御力を下げる
    enemy: { ...enemy, defence: defenceAfterDown(enemy, buffs) },
    crit: applyCritBuffs(character.crit, buffs),
    attackDamageMultiplier: trigger.attackDamageMultiplier,
    elementMultiplier: skillElementMultiplier(character, enemy, buffs),
    effects,
    fullBurstBonus,
    distributedDamageMultiplier: 1 + buffs.distributedDamage,
    sequentialAttackDamage: buffs.sequentialAttackDamage,
    trueDamage: buffs.trueDamage,
    damageTakenMultiplier: 1 + buffs.damageTaken,
    projectileExplosionMultiplier: explosionHitMultiplier(buffs),
    projectileStickMultiplier: stickHitMultiplier(buffs),
    sustainedDamage: buffs.sustainedDamage,
    sustainedDamagePlacement,
    distance: { rate: distanceRate, bonus: character.bonusRange === null ? 0 : DISTANCE_BONUS },
    // コアの経路編（plan/design-anis-star-core-path.md 3.1 節・11.3 節）: コアダメージ▲（buffs.coreDamage）は、通常攻撃と同じく
    // コアの項に足す（論点 4。アニス：スターのシューティングスター。C-0594）
    core: { rate: enemy.hasCore ? coreHitRate : 0, damage: character.shot.coreDamageRate - 1 + buffs.coreDamage },
  });
}

/**
 * 枠のバーストヒット。定義がない・unsupported・倍率ダメージなしなら null。
 * 攻撃力・会心・攻撃ダメージは通常攻撃と同じバフ後の値（trigger / buffs）を使う。
 */
export function slotBurstHit(
  definition: SkillDefinition | null | undefined,
  levels: SkillLevels,
  character: CharacterData,
  enemy: EnemyInput,
  trigger: Pick<TriggerDamage, 'attack' | 'attackDamageMultiplier'>,
  buffs: BuffTotals,
): BurstHitResult | null {
  if (!definition) return null;
  const effects = resolveBurstDamage(definition, character, levels);
  if (effects.length === 0) return null;
  return computeSkillHit(effects, character, enemy, trigger, buffs, BURST_SKILL_FULL_BURST_BONUS);
}
