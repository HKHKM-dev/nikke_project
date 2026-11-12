// 件の一覧（../holders.ts の createHolderLists）の層 1: 記録の入れ物と件の列の作り方（plan/design-split-first-pass.md 3.3 節）。
// 件の列（tracks）・付いた記録・条件で落とした記録・順位・デバフ解除の読み・回復・強化の列と、件の列を作る・閉じる・消費する関数。
// 層の作り手が共通に受けるもの（HolderBase）と、前の層が後の層を発火の時に読む口（LateReaders）もここに置く。
import { type ChanceOpportunity } from '../chance.ts';
import { type ResolvedShotCountTrigger } from '../resolve.ts';
import { type RankingRecord } from '../ranking.ts';
import { type CounterId } from '../counters.ts';
import { type NamedStateId } from '../states.ts';
import { type HealRecord, type TriggerTracker } from '../triggers.ts';
import { resolvePassiveStates, type AppliedRecord, type ConditionSkip, type TimelineSlot } from '../timeline.ts';
import {
  type AmplifierSource,
  type HeldItem,
  type HeldOrigin,
  type HeldStage,
  type HeldTrack,
  type HolderListsOptions,
  type RemoveDebuffGuessRecord,
} from './types.ts';
import { type TrackReads, insertSorted, trackReadsOf } from './items.ts';

/**
 * 前の層が、後の層の関数と値を発火の時に読む口。createHolderLists が後の層を作った後に埋める（埋める前に読むと落ちる）
 */
export type LateReaders = {
  /** 層 6（conditions）: { ended } の発火 */
  endedAt: (holder: number, state: NamedStateId, frame: number) => boolean;
  /** 層 3（sources）: 状態の窓の中の射撃を数えるきっかけ */
  stateWindowFires: (
    trigger: ResolvedShotCountTrigger,
    slotIndex: number,
    state: NamedStateId,
    conditionState: NamedStateId | undefined,
  ) => TriggerTracker;
  /** 層 5（views）: 自分の HP の割合 */
  selfHpRatioAt: (slotIndex: number, frame: number) => number;
  /** 層 5（views）: 自分の HP の割合が閾値以下か */
  selfHpAtMostAt: (slotIndex: number, frame: number, threshold: number) => boolean;
  /** 層 4（read）: 件の列の件 */
  readItems: (track: HeldTrack) => HeldItem[];
  /** 層 4（read）: 件の列のうち、そのフレームに効いている件 */
  activeAt: (track: HeldTrack, frame: number) => HeldItem[];
  /** 層 5（views）: 持ち主ごとの、状態ごとの件の列（段 1・1.5） */
  stateTracks: Map<NamedStateId, HeldTrack[]>[];
};

/** 層の作り手が共通に受けるもの */
export type HolderBase = { slots: readonly TimelineSlot[]; options: HolderListsOptions; late: LateReaders };

/** 記録の入れ物と、件の列を作る・閉じる・消費する関数 */
export function createRecords(deps: HolderBase) {
  const { options, slots } = deps;
  const { frames, logs } = options;
  const passive = resolvePassiveStates(slots);
  const tracks: HeldTrack[] = [];
  const applications: AppliedRecord[] = [];
  const conditionSkips: ConditionSkip[] = [];
  const rankings: RankingRecord[] = [];
  const removeDebuffGuesses: RemoveDebuffGuessRecord[] = [];
  const heals: HealRecord[] = [];
  const amplifiers: AmplifierSource[] = [];
  /**
   * 件の列ごとの、件を作る関数が読む入力（trackReadsOf）と、件を作った時の入力の長さ（始まり・機会・射撃・使用武器の変更の終わり・
   * リロードの込め終わり・フルバーストの窓・閉じるフレーム・消費のフレーム・減少・上限を上げる状態の件の列の入力。読まない入力は 0。
   * updateLengths）
   */
  const itemsSeen = new Map<HeldTrack, { reads: TrackReads; lengths: number[]; verified: number[] }>();
  /**
   * 発動者の最大HP 基準（scaling casterMaxHp）の timed を、持ち主
   * holder の比率（X × 発動者のバフ前の最大HP ÷ 持ち主のバフ前の最大HP）の ratio に直す
   * （plan/design-hp-ratio-readers.md 9 節の論点 8）。HP の割合・最終最大HP・表示は比率をそのまま読む
   */
  const holderScaledOrigin = (origin: HeldOrigin, sourceSlotIndex: number, holder: number): HeldOrigin => {
    if (origin.kind !== 'timed' || origin.effect.scaling !== 'casterMaxHp') return origin;
    const caster = slots[sourceSlotIndex]?.casterMaxHp;
    const own = slots[holder]?.casterMaxHp;
    if (caster === undefined || own === undefined)
      throw new RangeError(`slot ${holder}: casterMaxHp needs the base max HP of the caster and the holder`);
    return { ...origin, effect: { ...origin.effect, scaling: 'ratio', value: (origin.effect.value * caster) / own } };
  };
  const newTrack = (
    holder: number,
    sourceSlotIndex: number,
    origin: HeldOrigin,
    stage: HeldStage,
    opportunities: ChanceOpportunity[] | null = null,
  ): HeldTrack => {
    const track: HeldTrack = {
      holder,
      sourceSlotIndex,
      casterBaseAttack: slots[sourceSlotIndex]?.casterBaseAttack ?? 0,
      casterMaxHp: slots[sourceSlotIndex]?.casterMaxHp,
      origin: holderScaledOrigin(origin, sourceSlotIndex, holder),
      stage,
      starts: [],
      closes: [],
      consumes: [],
      decreases: [],
      opportunities,
      items: [],
    };
    tracks.push(track);
    // verified はテスト用（verifyItems）: 確かめた時の入力の長さ（件を作る関数が読まない入力も含む）
    itemsSeen.set(track, { reads: trackReadsOf(origin), lengths: new Array<number>(12).fill(-1), verified: [] });
    return track;
  };
  const counterKey = (slotIndex: number, counter: CounterId): string => `${slotIndex}:${counter}`;
  /** 件の列を frame で閉じる（同じフレームは 1 つ。戦闘の後は閉じない）。効果解除（fireRemove）とカウンタの 0（registerCounters） */
  const closeTrack = (track: HeldTrack, frame: number): void => {
    if (frame < frames && !track.closes.includes(frame)) insertSorted(track.closes, frame);
  };
  /** 件の列を frame で消費する（同じフレームに始まった件も次のフレームで切る。フルスタックの消費と、{ applied } の付与の切り替え） */
  const consumeTrack = (track: HeldTrack, frame: number): void => {
    if (frame < frames && !track.consumes.includes(frame)) insertSorted(track.consumes, frame);
  };
  /** 枠のカウンタが上限に届いたフレームの次のフレーム（{ counterFull } の発火。届くたびに書き替える） */
  const counterFullAt = new Map<string, number>();
  return {
    amplifiers,
    applications,
    closeTrack,
    conditionSkips,
    consumeTrack,
    counterFullAt,
    counterKey,
    frames,
    heals,
    itemsSeen,
    logs,
    newTrack,
    passive,
    rankings,
    removeDebuffGuesses,
    tracks,
  };
}
export type Records = ReturnType<typeof createRecords>;
