// Stage 11 アリス編: 「最終攻撃力が最も高い味方 N 機」（対象 topAttack）の順位（plan/design-stage11.md 18 節）。
// 発火のフレームの各枠の最終攻撃力（ダメージの式の攻撃力と同じ）を出し、高い順に並べる。
//   - 常時パッシブと、発火のフレーム f で効いている攻撃力の窓（start ≤ f < end）を数える。同じフレームに始まった窓も入れる
//     （モデルでは III の発動とフルバーストの開始が同じフレームなので、入れないとアリス自身のバーストが順位に入らない）。
//   - 順位で対象が決まる効果（topAttack）の窓は数えない（呼び出し側が渡さない）。攻撃力を配る topAttack で循環しないため。
//   - 同値は枠の若い順（仮定。未検証）。
// planBuffTimeline（バッチ）と 1 パス目のループ（sim/firstPass.ts）が同じ関数を使う。
import type { WeaponType } from '../types.ts';
import { applyAttackBuffs, applyResolvedEffect, type BuffTotals } from './buffs.ts';
import type { ResolvedEffect } from './resolve.ts';
import type { TargetedEffect } from './targets.ts';

/** 同じフレームに始まった攻撃力の窓を順位に入れるか（26 節 3。録画 43 で確かめる） */
export const RANK_INCLUDES_SAME_FRAME = true;

/** 順位の材料にする 1 つの窓（攻撃力の timed 効果が 1 枠に効いている区間） */
export type AttackWindow = {
  slotIndex: number;
  sourceSlotIndex: number;
  effect: Pick<ResolvedEffect, 'stat' | 'scaling' | 'value'>;
  start: number;
  end: number;
};

/** 順位を出すのに要る枠の情報（空枠は null） */
export type RankSlot = {
  /** バフ前攻撃力（team.ts の baseAttackOf。発動者基準の固定加算にも使う） */
  casterBaseAttack: number;
  weaponType: WeaponType;
  /** 常時パッシブの合計 */
  passive: BuffTotals;
} | null;

/** 窓 w がフレーム frame の順位に入るか */
function countsAt(w: Pick<AttackWindow, 'start' | 'end'>, frame: number): boolean {
  const started = RANK_INCLUDES_SAME_FRAME ? w.start <= frame : w.start < frame;
  return started && frame < w.end;
}

/**
 * 枠ごとの最終攻撃力（空枠は null）。base × (1 + Σ攻撃力%) + Σ発動者基準の固定加算。整数に丸めない
 * （順位は丸めで変わらない。同値のときだけ差が出うる）。windows の攻撃力以外の stat は無視する
 */
export function finalAttacksAt(
  slots: readonly RankSlot[],
  windows: readonly AttackWindow[],
  frame: number,
): (number | null)[] {
  return slots.map((slot, index) => {
    if (slot === null) return null;
    let buffs: BuffTotals = slot.passive;
    for (const w of windows) {
      if (w.slotIndex !== index || w.effect.stat !== 'attack' || !countsAt(w, frame)) continue;
      buffs = applyResolvedEffect(buffs, w.effect, slots[w.sourceSlotIndex]?.casterBaseAttack ?? 0).totals;
    }
    return applyAttackBuffs(slot.casterBaseAttack, buffs);
  });
}

/** 最終攻撃力の高い順の枠。同値は枠の若い順。空枠は含めない */
export function rankByFinalAttack(finalAttacks: readonly (number | null)[]): number[] {
  const indices: number[] = [];
  finalAttacks.forEach((v, i) => {
    if (v !== null) indices.push(i);
  });
  return indices.sort((a, b) => finalAttacks[b]! - finalAttacks[a]! || a - b);
}

/** 効果の対象になりうる枠（targetWeapon で絞る）を順位の順に。FireContext.attackRank に入れる */
export function attackRankFor(
  effect: Pick<TargetedEffect, 'targetWeapon'>,
  slots: readonly RankSlot[],
  finalAttacks: readonly (number | null)[],
): number[] {
  return rankByFinalAttack(finalAttacks).filter(
    (i) => effect.targetWeapon === undefined || slots[i]?.weaponType === effect.targetWeapon,
  );
}

/** 順位の上位に同値があったか（N 位と N+1 位が同じ攻撃力なら、枠の順の仮定で対象が決まった） */
export function tiedAtCutoff(
  rank: readonly number[],
  finalAttacks: readonly (number | null)[],
  count: number,
): boolean {
  if (rank.length <= count) return false;
  return finalAttacks[rank[count - 1]!] === finalAttacks[rank[count]!];
}

/** 発火 1 回ぶんの順位の記録（UI・CLI・テスト用） */
export type RankingRecord = {
  /** 順位を出したフレーム（トリガーが起きたフレーム。射撃の回数起点なら窓はこの次のフレームから） */
  frame: number;
  sourceSlotIndex: number;
  effect: { source: ResolvedEffect['source']; effectIndex: number };
  /** 枠ごとの最終攻撃力（空枠は null） */
  finalAttacks: (number | null)[];
  /** 対象になった枠（順位の順） */
  targets: number[];
  /** N 位と N+1 位が同値で、枠の若い順の仮定で決まったか */
  tied: boolean;
};
