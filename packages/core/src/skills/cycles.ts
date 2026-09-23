// Stage 11 紅蓮BS: 段の循環（cycle。「攻撃回数別の効果」「各段階の効果のみ適用」）と、その間隔の変更（cycleEvery。
// 「スキル 1 のフルチャージ攻撃回数の条件が 1 回 / 2 回 / 3 回に変更」）を Lv の数値に解決し、射撃の列から各段の発動を決める
// （plan/design-stage11-scarlet-bs.md 2・3 節）。
//
// 規則（録画 46・47 で確認。同 0.3 節）:
//   n = 戦闘開始からの通算の射撃回数（trigger の count の列）、step = 段のポインタ
//   各射撃で n += 1。間隔の変更の窓 [start, end) に入る射撃は窓の every、入らない射撃は cycle の every を使い、
//   n がその倍数なら steps[step] を発動して step を 1 つ進める（最後の次は最初）。
// 窓の中の毎回の段はカウンタを戻さないので、窓の後の最初の段は「通算の every の倍数」の射撃に戻る
// （録画 47 の FB 明けの段が 1 発目の回と 2 発目の回に分かれたのはこのため）。
import { durationToFrames } from '../burst/fixedCycle.ts';
import type { ShotLog } from '../sim/shots.ts';
import type { CharacterData, LocalizedText, SkillRaw } from '../types.ts';
import type { ResolvedDamageEffect } from './burstDamage.ts';
import {
  resolveTrigger,
  skillValue,
  type ResolvedShotCountTrigger,
  type ResolvedTrigger,
  type SkillLevels,
} from './resolve.ts';
import { SKILL_SLOTS, type CycleEffect, type SkillDefinition, type SkillSlot } from './types.ts';

/** 解決済みの循環。steps は段ごとの倍率ダメージ（ResolvedDamageEffect.cycle に段の番号が入る） */
export type ResolvedCycle = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  /** 同じスロットの何番目の効果か */
  effectIndex: number;
  trigger: ResolvedShotCountTrigger;
  steps: ResolvedDamageEffect[];
};

/** 解決済みの間隔の変更 */
export type ResolvedCycleEvery = {
  source: { resourceId: number; skill: SkillSlot; name: LocalizedText };
  effectIndex: number;
  /** 対象の cycle を持つ自分のスロット */
  targetSkill: SkillSlot;
  /** 窓の中の段の間隔 */
  every: number;
  trigger: ResolvedTrigger;
  /** durationToFrames(維持秒数)。0 なら効果なし */
  durationFrames: number;
  assumes?: LocalizedText;
};

/** 間隔の変更が 1 体に効いているフレーム区間（BuffTimeline.cycleWindows。区間には入らない） */
export type CycleWindow = {
  slotIndex: number;
  source: ResolvedCycleEvery['source'];
  effectIndex: number;
  targetSkill: SkillSlot;
  every: number;
  start: number;
  /** 戦闘時間で切る */
  end: number;
};

function assertOwnDefinition(def: SkillDefinition, character: CharacterData): void {
  if (def.resourceId !== character.resourceId) {
    throw new RangeError(`skill definition is for ${def.resourceId}, character is ${character.resourceId}`);
  }
}

function resolveCycleEffect(
  effect: CycleEffect,
  character: CharacterData,
  slot: SkillSlot,
  skill: SkillRaw,
  level: number,
  effectIndex: number,
): ResolvedCycle {
  const trigger = resolveTrigger(effect.trigger, skill, level);
  if (typeof trigger !== 'object' || !('every' in trigger)) {
    throw new RangeError(`skill ${skill.id}: a cycle needs a shot count trigger`);
  }
  const source = { resourceId: character.resourceId, skill: slot, name: skill.name };
  const steps = effect.steps.map((step, i): ResolvedDamageEffect => {
    const r: ResolvedDamageEffect = {
      source,
      damageType: step.damageType,
      multiplier: skillValue(skill, step.ref, level) / 100,
      trigger,
      effectIndex,
      cycle: { step: i, steps: effect.steps.length },
    };
    const assumes = step.assumes ?? effect.assumes;
    if (assumes) r.assumes = assumes;
    return r;
  });
  return { source, effectIndex, trigger, steps };
}

/** 定義の各 cycle を Lv の数値に解決する。support が 'unsupported' のスキルは空 */
export function resolveCycles(def: SkillDefinition, character: CharacterData, levels: SkillLevels): ResolvedCycle[] {
  assertOwnDefinition(def, character);
  const resolved: ResolvedCycle[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind !== 'cycle') return;
      resolved.push(resolveCycleEffect(effect, character, slot, skill, levels[slot], effectIndex));
    });
  }
  return resolved;
}

/**
 * 定義の各 cycleEvery を Lv の数値に解決する。support が 'unsupported' のスキルは空。
 * 対象のスロットの cycle が unsupported なら効果が無いので出さない。every が cycle の間隔以上なら RangeError
 */
export function resolveCycleEvery(
  def: SkillDefinition,
  character: CharacterData,
  levels: SkillLevels,
): ResolvedCycleEvery[] {
  const cycles = resolveCycles(def, character, levels);
  const resolved: ResolvedCycleEvery[] = [];
  for (const slot of SKILL_SLOTS) {
    const entry = def.skills[slot];
    if (entry.support === 'unsupported') continue;
    const skill = character.skills[slot];
    entry.effects.forEach((effect, effectIndex) => {
      if (effect.kind !== 'cycleEvery') return;
      const target = cycles.find((c) => c.source.skill === effect.slot);
      if (target === undefined) return;
      if (effect.every >= target.trigger.every) {
        throw new RangeError(
          `skill ${skill.id}: cycleEvery ${effect.every} must be less than the cycle's every (${target.trigger.every})`,
        );
      }
      const seconds =
        effect.durationRef === undefined
          ? (effect.durationSeconds ?? 0)
          : skillValue(skill, effect.durationRef, levels[slot]);
      if (seconds < 0) throw new RangeError(`skill ${skill.id}: duration must be >= 0, got ${seconds}`);
      const r: ResolvedCycleEvery = {
        source: { resourceId: character.resourceId, skill: slot, name: skill.name },
        effectIndex,
        targetSkill: effect.slot,
        every: effect.every,
        trigger: resolveTrigger(effect.trigger, skill, levels[slot]),
        durationFrames: durationToFrames(seconds),
      };
      if (effect.assumes) r.assumes = effect.assumes;
      resolved.push(r);
    });
  }
  return resolved;
}

/** 循環が数える射撃の列（trigger の count。フルチャージはチャージ武器だけ） */
export function cycleShotFrames(log: ShotLog | null | undefined, trigger: ResolvedShotCountTrigger): readonly number[] {
  if (!log) return [];
  if (trigger.count === 'fullChargeShot' && !log.fullCharge) return [];
  if (trigger.count === 'lastShot') return log.lastShotFrames ?? [];
  return log.frames;
}

/** 1 段の発動 */
export type CycleFire = {
  frame: number;
  /** 0 始まりの段 */
  step: number;
  /** 通算の何回目の射撃か（1 始まり） */
  count: number;
  /** 間隔の変更の窓の中の射撃か */
  inWindow: boolean;
};

/**
 * 射撃の列 shotFrames（昇順）から、循環の各段の発動を決める（ファイル冒頭の規則）。
 * windows はこの循環に効く間隔の変更の窓。重なった窓は小さいほうの every を使う
 */
export function cycleFires(
  every: number,
  steps: number,
  shotFrames: readonly number[],
  windows: readonly Pick<CycleWindow, 'every' | 'start' | 'end'>[] = [],
): CycleFire[] {
  if (!Number.isInteger(every) || every < 1) throw new RangeError(`every must be a positive integer, got ${every}`);
  if (!Number.isInteger(steps) || steps < 1) throw new RangeError(`steps must be a positive integer, got ${steps}`);
  const fires: CycleFire[] = [];
  let step = 0;
  shotFrames.forEach((frame, i) => {
    const count = i + 1;
    let e = every;
    let inWindow = false;
    for (const w of windows) {
      if (w.start <= frame && frame < w.end) {
        inWindow = true;
        e = Math.min(e, w.every);
      }
    }
    if (count % e !== 0) return;
    fires.push({ frame, step, count, inWindow });
    step = (step + 1) % steps;
  });
  return fires;
}
