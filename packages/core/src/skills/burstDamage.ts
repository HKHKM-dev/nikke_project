// Stage 5: バーストスロットの倍率ダメージ（burstDamage）を Lv の数値に解決し、1 発動あたりの期待ダメージを出す。
// 式（2026-09-22 の射撃場実測で確認。plan/design-stage5.md 1 節、plan/verification.md Stage 5 節）:
//   burstHit = max(1, 攻撃力(バフ後) − 防御力) × X/100 × (1 + 会心期待値 [+ 0.5]) × (1 + Σ attackDamage) × 属性有利
// 武器倍率・チャージ倍率・コア・距離は掛けない。
// Stage 8: トリガー付きの倍率ダメージ（damage。「10 回攻撃した時 X% のダメージ」など）も同じ式で計算する（computeSkillHit）。
// 分配ダメージには (1 + Σ distributedDamage) を別の乗数で掛ける（録画 21 のクイーン（真）の 1.9001 倍。plan/design-stage8.md 2.4 節）。
// 持続ダメージ▲編: 持続ダメージ（dot）の tick には Σ sustainedDamage を SUSTAINED_DAMAGE_PLACEMENT の置き場所で掛ける。
import type { EnemyInput, TriggerDamage } from '../damage.ts';
import { explosionHitMultiplier, FULL_BURST_BOOST, skillElementMultiplier } from '../damage.ts';
import type { CharacterData, LocalizedText } from '../types.ts';
import { applyCritBuffs, type BuffTotals } from './buffs.ts';
import {
  SKILL_SLOTS,
  type DamageCondition,
  type DotFirstTick,
  type SkillDamageType,
  type SkillDefinition,
  type SkillSlot,
} from './types.ts';
import {
  isResolvedShotCount,
  resolveTrigger,
  skillValue,
  type ResolvedShotCountTrigger,
  type ResolvedTrigger,
  type SkillLevels,
} from './resolve.ts';

/**
 * バースト発動時の即時ダメージにフルバースト補正 +0.5 を乗せるか。
 * **2026-09-22 の射撃場実測で「乗せない」と確定**（plan/verification.md Stage 5 節、録画 18・19）:
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
  /** コアの経路編: コアに当たりうるヒット（自動攻撃の core）。plan/design-anis-star-core-path.md 3.1 節 */
  core?: true;
  assumes?: LocalizedText;
};

export type ResolvedBurstDamage = ResolvedSkillDamage;

/** Stage 8: トリガー付きの倍率ダメージ。いつ出るかが付いた形 */
export type ResolvedDamageEffect = ResolvedSkillDamage & {
  trigger: ResolvedTrigger;
  /** 同じスロットの何番目の効果か（表示・識別用） */
  effectIndex: number;
  /**
   * Stage 11 紅蓮BS: 段の循環（cycle）の 1 段なら、何段目（0 始まり）と段の数。trigger は循環の射撃の回数トリガー
   * （窓の外の間隔）で、実際の発動は skills/cycles.ts の cycleFires が決める。damage 効果ではキーごと無い
   */
  cycle?: { step: number; steps: number };
  /** クルミ S2 編: damage の発火の条件（plan/design-kurumi-s2.md 2.2・2.3 節）。frame/plan.ts の planSkillHits が絞る */
  condition?: DamageCondition;
  /** 遅れて出る倍率ダメージ編: きっかけからの遅れ（フレーム）。frame/plan.ts の planSkillHits がそのフレームのバフで出す */
  delayFrames?: number;
  /**
   * ニヒリスター編: 持続ダメージ（dot）の 1 tick なら、間隔と維持の秒。trigger は付く時で、tick のフレームは
   * frame/plan.ts の dotTickFrames が決める。damage 効果ではキーごと無い
   */
  dot?: {
    intervalSeconds: number;
    durationSeconds: number;
    firstTick: DotFirstTick;
    status?: string;
    /** レイヴン編: 最大スタック数。スタックしない持続ダメージは 1（plan/design-raven-s1.md 8 節の 1） */
    maxStacks: number;
    /** レイヴン編: 付けたとき・tick ごとに射手の 1 ヒットぶんのゲージを溜める（C-0181。frame/firstPass.ts） */
    gaugeOnApply?: true;
    gaugeOnTick?: true;
    /** アニス：スター S2・バースト編: 周期の自動攻撃（autoAttack）を dot の形にしたもの。表示のラベルだけが変わる */
    autoAttack?: true;
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
    const r: ResolvedBurstDamage = {
      source: { resourceId: character.resourceId, skill: 'burst', name: skill.name },
      damageType: effect.damageType,
      multiplier: skillValue(skill, effect.ref, levels.burst) / 100,
    };
    if (effect.assumes) r.assumes = effect.assumes;
    resolved.push(r);
  }
  return resolved;
}

/** Stage 8: 定義の各 damage 効果を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
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
      // クルミ S2 編: 条件つきは畳み込まない（1 パス目の後に絞るので）。使うキャラが無いので拒否する
      if (isPerShotTrigger(trigger)) {
        if (effect.condition !== undefined) {
          throw new RangeError(`skill ${skill.id}: a per-shot damage (every 1) cannot have a condition`);
        }
        return;
      }
      const r: ResolvedDamageEffect = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        damageType: effect.damageType,
        multiplier: skillValue(skill, effect.ref, levels[slot]) / 100,
        trigger,
        effectIndex,
      };
      if (effect.condition) r.condition = { ...effect.condition };
      if (effect.delayFrames !== undefined) r.delayFrames = effect.delayFrames;
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
 * フラワー編: 周期でゲージだけを溜める効果（burstGaugeHit）の、周期の秒の列（効果ごとに 1 つ）。unsupported なら空。
 * 1 回の量は射手の targetBurstEnergyPerShot（frame/firstPass.ts。plan/design-flower-s2-gauge.md 2 節）
 */
export function resolveTimerGauges(def: SkillDefinition): number[] {
  const out: number[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    for (const effect of entry.effects) if (effect.kind === 'burstGaugeHit') out.push(effect.trigger.everySeconds);
  }
  return out;
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
      const durationSeconds = effect.durationSeconds ?? skillValue(skill, effect.durationRef!, levels[slot]);
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
          ...(!auto && effect.status !== undefined ? { status: effect.status } : {}),
          maxStacks,
          ...(!auto && effect.gaugeOnApply === true ? { gaugeOnApply: true as const } : {}),
          ...(gaugeOnTick ? { gaugeOnTick: true as const } : {}),
          ...(auto ? { autoAttack: true as const } : {}),
        },
      };
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
    trigger.during === undefined
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
      if (!isPerShotTrigger(resolveTrigger(effect.trigger, skill, levels[slot]))) continue;
      if (character.weaponType === 'SG') {
        throw new RangeError(
          `skill ${skill.id}: damage on every shot is not supported for SG (per pellet or per trigger)`,
        );
      }
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
  /** Stage 8: 1 + Σ distributedDamage。distributed の効果にだけ掛ける。省略 1 */
  distributedDamageMultiplier?: number;
  /** 受けるダメージ編: 1 + Σ damageTaken（敵の受けるダメージ▲。別枠。C-0138）。省略 1 */
  damageTakenMultiplier?: number;
  /** アニス：スター編: 発射体爆発ダメージ▲の乗数（damage.ts の explosionHitMultiplier）。projectileExplosion の効果にだけ掛ける。省略 1 */
  projectileExplosionMultiplier?: number;
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
   * total には入れない。持続ダメージの tick は効果 1 つずつ計算するので、1 回の結果に sustained の効果とほかの効果は混ざらない）
   */
  boost: {
    crit: number;
    critDamage: number;
    fullBurst: number;
    core: number;
    coreDamage: number;
    total: number;
    sustained: number;
  };
  attackDamageMultiplier: number;
  elementMultiplier: number;
  /** 1 + Σ distributedDamage（distributed の効果にだけ掛かる） */
  distributedDamageMultiplier: number;
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
  const baseHit = Math.max(1, input.attack - input.enemy.defence);
  const boostCrit = input.crit.rate * (input.crit.damage - 1);
  const boostFullBurst = fullBurstBonus ? FULL_BURST_BOOST : 0;
  const boostBase = 1 + boostCrit + boostFullBurst;
  const anyCore = input.core !== undefined && input.effects.some((e) => e.core === true);
  const coreDamage = anyCore ? input.core!.damage : 0;
  const boostCore = anyCore ? input.core!.rate * input.core!.damage : 0;
  const boostTotal = boostBase + boostCore;
  const common = baseHit * input.attackDamageMultiplier * damageTaken * input.elementMultiplier;
  // 持続ダメージ▲は持続ダメージ（自動攻撃を除く）にだけ掛かり、コアは自動攻撃にだけ掛かるので、持続ダメージ▲の倍率グループはコアなし
  const placement = input.sustainedDamagePlacement ?? SUSTAINED_DAMAGE_PLACEMENT;
  const sustained = sustainedMultiplier(input.sustainedDamage ?? 0, placement, boostBase, input.attackDamageMultiplier);
  const hasSustained = input.effects.some((e) => e.sustained === true);
  const perEffect = input.effects.map((effect) => ({
    effect,
    expected:
      common *
      (effect.core === true ? boostTotal : boostBase) *
      effect.multiplier *
      (effect.damageType === 'distributed' ? distributed : 1) *
      (effect.projectileExplosion === true ? explosion : 1) *
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
      total: boostTotal,
      sustained: hasSustained && placement === 'boost' ? (input.sustainedDamage ?? 0) : 0,
    },
    attackDamageMultiplier: input.attackDamageMultiplier,
    elementMultiplier: input.elementMultiplier,
    distributedDamageMultiplier: distributed,
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
 * core はコアの経路編: コアに当たったヒットの値（plan/design-anis-star-core-path.md 3.1 節）
 */
export function oneHitValue(hit: BurstHitResult, crit: boolean, core = false): number {
  const critTerm = crit ? hit.boost.critDamage - 1 : 0;
  // コアの経路編: total はコアの期待値を含むので、割ってから、コアに当たったとき（core）だけ coreDamage を足して組み直す
  const coreTerm = core ? hit.boost.coreDamage : 0;
  const expectedGroup = hit.boost.total + hit.boost.sustained;
  return (hit.perActivation / expectedGroup) * (1 + critTerm + hit.boost.fullBurst + hit.boost.sustained + coreTerm);
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
): SkillHitResult {
  return computeBurstHit({
    attack: trigger.attack,
    enemy,
    crit: applyCritBuffs(character.crit, buffs),
    attackDamageMultiplier: trigger.attackDamageMultiplier,
    elementMultiplier: skillElementMultiplier(character, enemy, buffs),
    effects,
    fullBurstBonus,
    distributedDamageMultiplier: 1 + buffs.distributedDamage,
    damageTakenMultiplier: 1 + buffs.damageTaken,
    projectileExplosionMultiplier: explosionHitMultiplier(buffs),
    sustainedDamage: buffs.sustainedDamage,
    sustainedDamagePlacement,
    // コアの経路編（plan/design-anis-star-core-path.md 3.1 節）: コアダメージ▲（buffs.coreDamage）は足さない（論点 4。未確認）
    core: { rate: enemy.hasCore ? coreHitRate : 0, damage: character.shot.coreDamageRate - 1 },
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
