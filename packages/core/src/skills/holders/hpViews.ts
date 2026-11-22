// 件の一覧の層 5（見る側。views.ts の createViews が作る）のうち、HP の系: 最大 HP▲・現在の HP▼・回復・HP の割合。
import { lowerBound } from '../../frame/shots.ts';
import type { ItemEffect } from '../resolve.ts';
import { isMaxHpStat, isSelfHpAtMost, selfHpHolds, type SelfHpCondition } from '../types.ts';
import type { HeldTrack, HolderLists, HpRatioSteps } from './types.ts';
import { valueOf } from './items.ts';
import type { HolderBase, Records } from './records.ts';
import type { Read } from './read.ts';
import type { View } from './views.ts';

/** HP の割合の閾値の比べで許す浮動小数の誤差（selfHpAtMostAt。「HP が最大」の判定も同じ幅を使う。skills/holders/fires.ts） */
export const HP_RATIO_EPS = 1e-9;

/** 最大 HP▲・現在の HP▼・回復・HP の割合を読む。viewsOf は見る側の索引（createViews の viewsOf） */
export function createHpViews({
  frames,
  passive,
  readItems,
  recordHeal,
  slots,
  viewsOf,
}: HolderBase & Records & Read & { viewsOf: (test: (track: HeldTrack, effect: ItemEffect) => boolean) => View[][] }) {
  // 枠のそのフレームの最終最大HP（常時 + 効いている最大HP▲ の件。plan/design-skill-stage6.md 2.4 節）。
  // 発動者の最終最大HP 基準の攻撃力▲（casterFinalMaxHp）の順位の値が読む
  const maxHpViews = viewsOf((_, e) => isMaxHpStat(e.stat));
  /**
   * 枠のフレーム frame の最大HP▲ の和（常時 + 効いている件。up）と、そのうちの最大HP のみ▲ の和（only）。startsBefore なら frame より前に
   * 始まった件だけ（同じフレームに付いた件は次のフレームから。マスト編の HP の割合）
   */
  const maxHpUpAt = (slotIndex: number, frame: number, startsBefore: boolean): { up: number; only: number } => {
    let up = passive[slotIndex]?.buffs.maxHpRatio ?? 0;
    let only = passiveMaxHpOnly[slotIndex] ?? 0;
    for (const v of maxHpViews[slotIndex] ?? []) {
      for (const it of readItems(v.track)) {
        if (!(startsBefore ? it.start < frame : it.start <= frame) || frame >= it.end) continue;
        const x = valueOf(v.effect, it);
        up += x;
        if (v.effect.stat === 'maxHpOnly') only += x;
      }
    }
    return { up, only };
  };
  const finalMaxHpAt = (slotIndex: number, frame: number, startsBefore = false): number | undefined => {
    const base = slots[slotIndex]?.casterMaxHp;
    if (base === undefined) return undefined;
    return base * (1 + maxHpUpAt(slotIndex, frame, startsBefore).up);
  };
  /**
   * 枠のフレーム frame の HP の割合（plan/design-mast.md 8 節。plan/design-skill-stage6.md 2.4 節の式）。枠の想定の割合 ×
   * (1 + Σ 最大HP▲ − Σ 最大HP のみ▲) ÷ (1 + Σ 最大HP▲)（Σ 最大HP▲ は最大HP のみ▲ も含む）。常時の分と、frame より前に始まって frame に
   * 効いている件（同じフレームに付いた件は次のフレームから。論点 8）
   */
  const passiveMaxHpOnly = passive.map(
    (state) =>
      state?.passiveEffects.filter((e) => e.stat === 'maxHpOnly').reduce((sum, e) => sum + e.appliedAmount, 0) ?? 0,
  );
  // 最大HP のみ▲ を持ちうる枠（常時か件の列）だけ、最大HP の件で割合が動く。ほかの枠は件を見ない（毎フレームの走査を省く）
  const maxHpOnlyMoves = slots.map(
    (_, i) => (passiveMaxHpOnly[i] ?? 0) > 0 || (maxHpViews[i] ?? []).some((v) => v.effect.stat === 'maxHpOnly'),
  );
  // 枠ごとの現在の HP▼ の発火のフレーム（昇順）と、その発火までの 1 − ratio の積（plan/design-scarlet.md 2.1 節）
  const hpDowns = slots.map(() => ({ frames: [] as number[], products: [] as number[] }));
  const lowerCurrentHp: HolderLists['lowerCurrentHp'] = (slotIndex, frame, ratio) => {
    const downs = hpDowns[slotIndex];
    if (downs === undefined) throw new RangeError(`lowerCurrentHp: no slot ${slotIndex}`);
    const n = downs.frames.length;
    if (n > 0 && downs.frames[n - 1]! > frame) throw new RangeError('lowerCurrentHp must be called in frame order');
    downs.frames.push(frame);
    downs.products.push((n > 0 ? downs.products[n - 1]! : 1) * (1 - ratio));
  };
  /** 枠の frame より前の現在の HP▼ の積（無ければ 1） */
  const hpDownProductBefore = (slotIndex: number, frame: number): number => {
    const downs = hpDowns[slotIndex]!;
    const i = lowerBound(downs.frames, frame);
    return i === 0 ? 1 : downs.products[i - 1]!;
  };
  /**
   * 枠ごとの、量で追う回復（heal の scaling 'casterFinalMaxHp'）の記録（付くフレームの昇順）と、回復で足した HP の余り E の記録
   * （plan/design-hp-heal-restore.md 2.1 節。値はその枠のバフ前の最大HP を 1 とする）。E は回復を受けた枠だけ、フレームの昇順に進める
   * （upTo まで進めた。next は次に足す回復の位置）。E が 0 より大きくなるのは、最大HP のみ▲ か現在の HP▼ で下がった枠だけ
   */
  type HpRestore = { frame: number; fireFrame: number; sourceSlotIndex: number; value: number };
  const restores = slots.map(() => ({
    list: [] as HpRestore[],
    upTo: -1,
    next: 0,
    values: null as Float64Array | null,
  }));
  /**
   * 枠 holder に、フレーム fireFrame に発火した量で追う回復（発動者 sourceSlotIndex・割合 value）がフレーム frame（戦闘の中）に付く。
   * E には frame の次のフレームから効く
   */
  const restoreHp = (
    sourceSlotIndex: number,
    holder: number,
    frame: number,
    fireFrame: number,
    value: number,
  ): void => {
    const memo = restores[holder];
    if (memo === undefined) throw new RangeError(`restoreHp: no slot ${holder}`);
    if (frame <= memo.upTo - 1)
      throw new RangeError(`restoreHp: frame ${frame} is before the advanced frame of slot ${holder}`);
    const i = memo.list.findLastIndex((r) => r.frame <= frame) + 1;
    memo.list.splice(i, 0, { frame, fireFrame, sourceSlotIndex, value });
  };
  // 与える HP 回復量▲ の件（plan/design-heal-amount-up.md 2.1 節）
  const healDealtViews = viewsOf((_, e) => e.stat === 'healDealt');
  /** 枠のフレーム frame より前に付いて frame に効いている与える HP 回復量▲ の和（常時 + 件） */
  const healDealtBefore = (slotIndex: number, frame: number): number => {
    let up = passive[slotIndex]?.buffs.healDealt ?? 0;
    for (const v of healDealtViews[slotIndex] ?? [])
      for (const it of readItems(v.track)) if (it.start < frame && frame < it.end) up += valueOf(v.effect, it);
    return up;
  };
  /**
   * 回復量（対象 holder のバフ前の最大HP を 1 とする値）。発動者の最終最大HP と与える HP 回復量▲ は、発火のフレームより前に付いた件で
   * 求める
   */
  const restoreAmountOf = (r: HpRestore, holder: number): number => {
    const caster = finalMaxHpAt(r.sourceSlotIndex, r.fireFrame, true);
    const own = slots[holder]?.casterMaxHp;
    if (caster === undefined || own === undefined)
      throw new RangeError(
        `slot ${holder}: a heal by casterFinalMaxHp needs the base max HP of the caster and the target`,
      );
    return (caster * r.value * (1 + healDealtBefore(r.sourceSlotIndex, r.fireFrame))) / own;
  };
  /**
   * 回復を除いた現在の HP と最大HP と上限（想定の割合 × 最大HP）。どれも枠のバフ前の最大HP を 1 とする（plan/design-skill-stage6.md
   * 2.4 節の式）。product は frame より前の現在の HP▼ の積
   */
  const hpBaseAt = (slotIndex: number, frame: number, product = hpDownProductBefore(slotIndex, frame)) => {
    const r0 = slots[slotIndex]?.hpRatio ?? 1;
    const { up, only } = maxHpUpAt(slotIndex, frame, true);
    return { current: r0 * product * (1 + up - only), max: 1 + up, cap: r0 * (1 + up) };
  };
  /**
   * 枠のフレーム frame の余り E。f − 1 から f へ: f − 1 の現在の HP▼ を E にも掛け、f − 1 に付いた回復の量を足し、現在の HP が上限
   * （想定の割合 × 最大HP。plan/design-hp-heal-restore.md 2.4 節）を超えないように削る。frame より前に付いた回復・件・現在の HP▼ だけを
   * 読むので、1 パス目ではフレーム f の登録の始めに f まで進めてよい
   */
  const surplusAt = (slotIndex: number, frame: number): number => {
    const memo = restores[slotIndex]!;
    const { list } = memo;
    if (list.length === 0 || frame <= list[0]!.frame) return 0;
    memo.values ??= new Float64Array(Math.max(frames, 1) + 1);
    const values = memo.values;
    if (frame <= memo.upTo) return values[frame]!;
    let g = memo.upTo < 0 ? list[0]!.frame + 1 : memo.upTo + 1;
    let e = memo.upTo < 0 ? 0 : values[memo.upTo]!;
    let before = hpDownProductBefore(slotIndex, g - 1);
    for (; g <= frame; g++) {
      const heals = memo.next < list.length && list[memo.next]!.frame === g - 1;
      // E が 0 で回復も付かないフレームは 0 のまま（配列は 0 で始まる）
      if (e === 0 && !heals) {
        before = hpDownProductBefore(slotIndex, g);
        continue;
      }
      const product = hpDownProductBefore(slotIndex, g);
      e *= product / before;
      before = product;
      const base = hpBaseAt(slotIndex, g, product);
      const room = base.cap - base.current;
      for (; memo.next < list.length && list[memo.next]!.frame === g - 1; memo.next++)
        if (room > HP_RATIO_EPS) e += restoreAmountOf(list[memo.next]!, slotIndex);
      e = Math.max(0, Math.min(e, room));
      values[g] = e;
    }
    memo.upTo = frame;
    return e;
  };
  /** 回復の記録（skills/holders/read.ts）と、量で追う回復の HP（restoreHp） */
  const applyHeal: HolderLists['applyHeal'] = (effect, sourceSlotIndex, holder, frame, fireFrame) => {
    const opens = recordHeal(effect, sourceSlotIndex, holder, frame);
    if (effect.scaling === 'casterFinalMaxHp') restoreHp(sourceSlotIndex, holder, frame, fireFrame, effect.value);
    return opens;
  };
  const selfHpRatioAt = (slotIndex: number, frame: number): number => {
    const e = surplusAt(slotIndex, frame);
    if (e === 0 && !maxHpOnlyMoves[slotIndex])
      return (slots[slotIndex]?.hpRatio ?? 1) * hpDownProductBefore(slotIndex, frame);
    const { current, max, cap } = hpBaseAt(slotIndex, frame);
    // 上限まで戻った枠は想定の割合（余りを上限で削った値から割り戻すと、浮動小数の誤差で想定の割合からずれる）
    return current + e >= cap ? (slots[slotIndex]?.hpRatio ?? 1) : (current + e) / max;
  };
  /**
   * 履歴に置く、枠の HP の割合の段（selfHpRatioAt を毎フレーム取り、値の変わったフレームだけを残す）。最大HP のみ▲ も現在の
   * HP▼ も無い枠は割合が動かない（回復も戻さない）ので 1 段。ループの後に呼ぶ
   */
  const hpRatioStepsOf = (slotIndex: number): HpRatioSteps => {
    if (!maxHpOnlyMoves[slotIndex] && hpDowns[slotIndex]!.frames.length === 0)
      return { frames: [0], ratios: [selfHpRatioAt(slotIndex, 0)] };
    const steps = { frames: [] as number[], ratios: [] as number[] };
    for (let f = 0; f < Math.max(frames, 1); f++) {
      const ratio = selfHpRatioAt(slotIndex, f);
      if (steps.ratios.at(-1) === ratio) continue;
      steps.frames.push(f);
      steps.ratios.push(ratio);
    }
    return steps;
  };
  /** 1 パス目の発火の文脈の selfHp（以下の形だけ。以上の形が来たら定義の読み込みの漏れなので投げる） */
  const selfHpAtMostHolds = (hp: SelfHpCondition, ratio: number): boolean => {
    if (!isSelfHpAtMost(hp))
      throw new RangeError(`selfHp ${JSON.stringify(hp)}: the at-least form is not read in the first pass`);
    return selfHpHolds(hp, ratio);
  };
  /** 枠の HP の割合がフレーム frame に閾値 threshold（割合）以下か（きっかけ { selfHpAtMost } と維持 { selfHpAtMostRef } が読む） */
  const selfHpAtMostAt = (slotIndex: number, frame: number, threshold: number): boolean =>
    selfHpRatioAt(slotIndex, frame) <= threshold + HP_RATIO_EPS;
  // 枠のそのフレームの最終防御力（常時 + 効いている防御力▲ の件）と、
  return { applyHeal, finalMaxHpAt, hpRatioStepsOf, lowerCurrentHp, selfHpAtMostAt, selfHpAtMostHolds, selfHpRatioAt };
}
