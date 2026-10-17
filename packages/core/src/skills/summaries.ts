// 持ち主ごとの一覧編（plan/design-holder-effects.md 段 D の 6）: 画面に出す、枠ごとの持続の効果と循環の間隔の変更のまとめ（純関数）。
// 段 D の 5 までは、画面が窓（TeamSlotResult の windows・stateWindows・cycleWindows）と記録（conditionSkips）からまとめていた。
// まとめ方は同じで、入力を履歴（値の小片・件・判定の記録）にした。
import { isStateContent, type ItemEffect } from './resolve.ts';
import { itemsOf, valuePiecesOf, type HolderHistory } from './holders.ts';
import type { ConditionSkip } from './timeline.ts';
import type { NamedStateId } from './states.ts';
import { SKILL_SLOTS, isStateStat, staticStatesOf, type SkillSlot } from './types.ts';

/** この枠が受けた持続の効果のまとめ（効果ごと。画面の「10 秒 × 9 回」） */
export type SlotEffectSummary = {
  /** 代表の効果（最初に付いた値の小片の効果。値は確率のきっかけの期待値・強化の値に直したもの） */
  effect: ItemEffect;
  sourceSlotIndex: number;
  /** 付いた回数（値の小片の数。スタックする効果は段 1 の数） */
  count: number;
  /** この枠が出した効果のうち、条件を満たさずに発火しなかった回数（状態の中身は、その状態を付けなかった回数） */
  skips: number;
  /** 状態だけの stat（命中率）。区間に足さない（表示だけ） */
  stateOnly: boolean;
};

/** この枠の循環の間隔の変更のまとめ（効果ごと） */
export type SlotCycleSummary = {
  source: { skill: SkillSlot };
  effectIndex: number;
  targetSkill: SkillSlot;
  every: number;
  /** 最初の件 [start, end)（維持の長さの表示に使う） */
  start: number;
  end: number;
  count: number;
};

/**
 * 2 段目の段 1（plan/design-skill-stage1.md 1.4 節）: この枠に付いた名前の付いた状態のまとめ（状態 × 出どころごと。中身の無い状態も入る。
 * 表示用）
 */
export type SlotStateSummary = {
  state: NamedStateId;
  sourceSlotIndex: number;
  /** 付いた回数（付き直しも 1 回ずつ。静的な状態は 1） */
  count: number;
  /** 静的な状態（戦闘の始めから終わりまで付いている） */
  isStatic: boolean;
  /** 付与に解除不可の印がある */
  undispellable: boolean;
};

/** まとめる値の小片の形（skills/holders.ts の ValuePiece） */
export type SummaryPiece = { slotIndex: number; sourceSlotIndex: number; effect: ItemEffect; stack?: number };

/** まとめる循環の件の形 */
export type SummaryCycle = {
  slotIndex: number;
  source: { skill: SkillSlot };
  effectIndex: number;
  targetSkill: SkillSlot;
  every: number;
  start: number;
  end: number;
};

const subIndexOf = (e: ItemEffect): number | '' => (isStateContent(e) ? e.subIndex : '');

/**
 * 効果ごとのまとめ。pieces は区間に足す小片のあとに状態だけの stat の小片を並べたもの（まとめの並びは、最初に出た順）。
 * スタックする効果は段 1 の小片だけを数える。skips は編成の判定の記録（この枠が出したものだけを数える）
 */
export function slotEffectSummaries(
  pieces: readonly SummaryPiece[],
  skips: readonly ConditionSkip[],
  slotIndex: number,
): SlotEffectSummary[] {
  const byKey = new Map<string, SlotEffectSummary>();
  for (const w of pieces) {
    if (w.slotIndex !== slotIndex) continue;
    const key = `${w.sourceSlotIndex}:${w.effect.source.skill}:${w.effect.effectIndex}:${subIndexOf(w.effect)}`;
    const found = byKey.get(key);
    if (found) {
      if ((w.stack ?? 1) === 1) found.count += 1;
      continue;
    }
    byKey.set(key, {
      effect: w.effect,
      sourceSlotIndex: w.sourceSlotIndex,
      count: 1,
      skips: 0,
      stateOnly: isStateStat(w.effect.stat),
    });
  }
  const own = skips.filter((x) => x.sourceSlotIndex === slotIndex);
  for (const summary of byKey.values()) {
    const effect = summary.effect;
    summary.skips = own.filter((x) =>
      isStateContent(effect)
        ? x.state === effect.whileState && x.sourceSlotIndex === summary.sourceSlotIndex
        : x.state === undefined &&
          x.effect.source.skill === effect.source.skill &&
          x.effect.effectIndex === effect.effectIndex,
    ).length;
  }
  return [...byKey.values()];
}

/** 循環の間隔の変更の、効果ごとのまとめ（並びは最初に出た順） */
export function slotCycleSummaries(cycles: readonly SummaryCycle[], slotIndex: number): SlotCycleSummary[] {
  const byKey = new Map<string, SlotCycleSummary>();
  for (const w of cycles) {
    if (w.slotIndex !== slotIndex) continue;
    const key = `${w.source.skill}:${w.effectIndex}`;
    const found = byKey.get(key);
    if (found) found.count += 1;
    else {
      byKey.set(key, {
        source: { skill: w.source.skill },
        effectIndex: w.effectIndex,
        targetSkill: w.targetSkill,
        every: w.every,
        start: w.start,
        end: w.end,
        count: 1,
      });
    }
  }
  return [...byKey.values()];
}

/** 履歴から、枠のまとめを作る（区間に足す小片 → 状態だけの stat の小片の順に数える） */
export function effectSummariesOf(history: HolderHistory, slotIndex: number): SlotEffectSummary[] {
  const pieces = valuePiecesOf(history);
  return slotEffectSummaries(
    [...pieces.filter((p) => !isStateStat(p.effect.stat)), ...pieces.filter((p) => isStateStat(p.effect.stat))],
    history.conditionSkips,
    slotIndex,
  );
}

/** 履歴から、枠の循環の間隔の変更のまとめを作る（間隔の変更の件。時刻の順） */
export function cycleSummariesOf(history: HolderHistory, slotIndex: number): SlotCycleSummary[] {
  return slotCycleSummaries(
    itemsOf(history, { holder: slotIndex, kind: 'cycleEvery' }).flatMap((i) =>
      i.origin.kind === 'cycleEvery'
        ? [
            {
              slotIndex: i.holder,
              source: { skill: i.origin.effect.source.skill },
              effectIndex: i.origin.effect.effectIndex,
              targetSkill: i.origin.effect.targetSkill,
              every: i.origin.effect.every,
              start: i.start,
              end: i.end,
            },
          ]
        : [],
    ),
    slotIndex,
  );
}

/** 履歴から、枠に付いた状態のまとめを作る（付いた記録。並びは最初に付いた順） */
export function stateSummariesOf(
  history: Pick<HolderHistory, 'applications' | 'slots'>,
  slotIndex: number,
): SlotStateSummary[] {
  const byKey = new Map<string, SlotStateSummary>();
  for (const a of history.applications) {
    if (a.slotIndex !== slotIndex) continue;
    const key = `${a.sourceSlotIndex}:${a.state}`;
    const found = byKey.get(key);
    if (found) {
      found.count += 1;
      continue;
    }
    const definition = history.slots[a.sourceSlotIndex]?.definition ?? null;
    const grants = SKILL_SLOTS.flatMap((s) => definition?.skills[s].effects ?? []).filter(
      (e) => e.kind === 'state' && e.state === a.state,
    );
    byKey.set(key, {
      state: a.state,
      sourceSlotIndex: a.sourceSlotIndex,
      count: 1,
      isStatic: a.sourceSlotIndex === slotIndex && staticStatesOf(definition).includes(a.state),
      undispellable: grants.some((e) => e.kind === 'state' && e.undispellable === true),
    });
  }
  return [...byKey.values()];
}
