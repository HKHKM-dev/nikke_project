// 効果を持ち主ごとの一覧で持つ（plan/design-holder-effects.md）。
// 1 パス目のループ（frame/firstPass.ts）が、スキルによる効果を、効果を受ける枠（持ち主）ごとの件の列で持つ。
// 件の列は、出どころ × 効果 × 持ち主ごとの窓の始まりの列（昇順）で、件（窓）は次の規則で作る（2.3 節）: 和集合の上書き延長
// （終わりのフレームちょうどの付き直しも続き）、スタックの段（skills/stacks.ts）、N 発間維持、フルバーストの終わり、撃ち切り、
// 吸収回復の付き直し（終わりのフレームちょうどに付けば新しく付いた）。件は、始まりの列とループで分かった出来事（射撃・使用武器の
// 変更の終わり・フルバーストの窓）から作り直すので、同じフレームの中で始まりが前後して登録されても（射撃の回数のきっかけは次の
// フレームから）、和集合とスタックと同じ件になる。ループの中の判定（射手・当たり・条件・順位）は件を読み、段（1・1.5・2・
// 2.5 段目）の見え方は件の列の段の印で表す（2.5 節）。強化（2.5 段目）の受け付けと値は、参照する件の一生が要るので、ループの後に
// 履歴を閉じる時に決める（amplify。ループの中で強化の件を読む所は無い）。ループの後は、履歴の値の小片から区間を作る（buffTimelineOf。
// 2.9 節）。値の小片の並びは時刻の順（論点 5）。件を作るのはここだけで、読む側は履歴を直接読む。
// ここには件の一覧を作る createHolderLists（層の作り手を順に呼び、問い合わせを組む）を置く。層の作り手は holders/records.ts・
// fires.ts・sources.ts・read.ts・views.ts・conditions.ts・fire.ts・register.ts（plan/design-split-first-pass.md 3.3 節・9.2 節）、型は
// holders/types.ts、件を作る純粋な関数は holders/items.ts、ループの後に履歴を読む関数は holders/history.ts に置く（外から使う名前は、
// ここから同じ名前で再公開する）。
import { type TimelineSlot } from './timeline.ts';
import { type HolderLists, type HolderListsOptions } from './holders/types.ts';
import { lastAtOrBefore } from './holders/items.ts';
import { createHistory } from './holders/history.ts';
import type { HolderBase, LateReaders } from './holders/records.ts';
import { createRecords } from './holders/records.ts';
import { createFires } from './holders/fires.ts';
import { createSources } from './holders/sources.ts';
import { createRead } from './holders/read.ts';
import { createViews } from './holders/views.ts';
import { createConditions } from './holders/conditions.ts';
import { createFire } from './holders/fire.ts';
import { createRegister } from './holders/register.ts';

export {
  ENEMY,
  isEnemyEffect,
  type HeldStage,
  type HeldOrigin,
  type HeldItem,
  type HeldTrack,
  type AmplifierSource,
  type AmplifiedPiece,
  type HolderHistory,
  type HpRatioSteps,
  selfHpRatioOf,
  hpRatioStepIndexOf,
  type RemoveDebuffGuess,
  type RemoveDebuffGuessRecord,
  pickRemoveDebuff,
  type CounterRecord,
  counterEffectiveFrom,
  counterFullFrames,
  type HolderListsOptions,
  type LeadShots,
  type HolderLists,
} from './holders/types.ts';
export { startOfFire, shiftEdges, stacksHold, whileItems } from './holders/items.ts';
export {
  type HeldItemView,
  type HeldItemFilter,
  itemsOf,
  activeItemsAt,
  type ValuePiece,
  valuePiecesOf,
  buffTimelineOf,
} from './holders/history.ts';
export function createHolderLists(slots: readonly TimelineSlot[], options: HolderListsOptions): HolderLists {
  // 層の作り手を、文の順のとおりに呼ぶ（plan/design-split-first-pass.md 3.3 節・9.2 節）。前の層が後の層を読む所は late を通す
  const late = {} as LateReaders;
  const base: HolderBase = { slots, options };
  const upToRecords = { ...base, ...createRecords(base) };
  const upToFires = { ...upToRecords, ...createFires({ ...upToRecords, late }) };
  const upToSources = { ...upToFires, ...createSources({ ...upToFires, late }) };
  const upToRead = { ...upToSources, ...createRead(upToSources) };
  const upToViews = { ...upToRead, ...createViews(upToRead) };
  const upToConditions = { ...upToViews, ...createConditions(upToViews) };
  const upToFire = { ...upToConditions, ...createFire(upToConditions) };
  const layers = { ...upToFire, ...createRegister(upToFire) };
  Object.assign(late, {
    activeAt: layers.activeAt,
    endedAt: layers.endedAt,
    readItems: layers.readItems,
    selfHpAtMostAt: layers.selfHpAtMostAt,
    selfHpRatioAt: layers.selfHpRatioAt,
    stateWindowFires: layers.stateWindowFires,
  } satisfies LateReaders);
  const {
    activeAt,
    amplifiers,
    applyHeal,
    consumeFullStacks,
    cooldownSum,
    cooldownViews,
    counterFullAt,
    counterKey,
    counterSources,
    critViews,
    cycleSources,
    damageBuffsAt,
    endedAt,
    enemyStateAt,
    enemyStateSources,
    extendSources,
    firingBuffsAt,
    gaugeViews,
    hasFiring,
    hasPellets,
    hitRateAt,
    hitViews,
    holdsAt,
    leadShots,
    lowerCurrentHp,
    minEffectiveRangeAt,
    openWeaponChange,
    ownStateActive,
    ownUnchainedApplied,
    pelletCountViews,
    rankContext,
    readItems,
    readOwnApplied,
    registerBattleStart,
    registerFrame,
    removeDebuffSources,
    removeSources,
    selfStackCountAt,
    shotCountEveryOf,
    sinceFires,
    singlePelletViews,
    skipEffect,
    stackSources,
    stateGroups,
    stateTracks,
    sumAt,
    timedSources,
    whileTracks,
  } = layers;
  return {
    hasSources:
      timedSources.length > 0 ||
      stateGroups.length > 0 ||
      cycleSources.length > 0 ||
      amplifiers.length > 0 ||
      enemyStateSources.length > 0 ||
      removeSources.length > 0 ||
      extendSources.length > 0 ||
      removeDebuffSources.length > 0 ||
      stackSources.length > 0 ||
      whileTracks.length > 0 ||
      counterSources.length > 0,
    registerBattleStart,
    registerFrame,
    firingBuffsAt,
    hasFiringTracks: (holder) => hasFiring[holder] === true,
    hitRateAt,
    hasHitTracks: hitViews.some((views) => views.length > 0),
    critUpAt: (holder, frame) => sumAt(critViews[holder], frame),
    pelletsAt: (holder, frame) => ({
      pelletCount: sumAt(pelletCountViews[holder], frame),
      singlePellet: sumAt(singlePelletViews[holder], frame),
    }),
    hasPelletTracks: (holder) => hasPellets[holder] === true,
    minEffectiveRangeAt,
    rankContext,
    applyHeal,
    openWeaponChange,
    cycleEveryAt(slotIndex, targetSkill, frame) {
      return cycleSources
        .filter((c) => c.slotIndex === slotIndex && c.effect.target === 'cycle' && c.effect.targetSkill === targetSkill)
        .flatMap((c) => activeAt(c.track, frame).map(() => c.effect.every));
    },
    shotCountEveryOf,
    gaugeSpeedAt: (holder, frame) => sumAt(gaugeViews[holder], frame),
    hasGaugeSpeedTracks: (holder) => (gaugeViews[holder] ?? []).length > 0,
    damageBuffsAt,
    burstCooldownAt: (holder, frame) => cooldownSum(holder, (it) => it.start <= frame && frame < it.end),
    burstCooldownStartedAt: (holder, frame) => cooldownSum(holder, (it) => it.start === frame),
    hasBurstCooldownTracks: (holder) => (cooldownViews[holder] ?? []).length > 0,
    // holdsAt の selfState と違い、段によらず frame より前に付いた件だけを見る（frame/plan.ts の selfStateHolds と同じ規則にする）。
    // 段は 1 始まりなので、付いていればスタック数は 1 以上
    selfStateAt: (holder, state, frame) => selfStackCountAt(holder, state, frame) > 0,
    stateStartedAt: (holder, state, frame) => {
      for (const t of stateTracks[holder]?.get(state) ?? [])
        for (const it of readItems(t)) if (it.start === frame) return true;
      return false;
    },
    stateHeldAt: ownStateActive,
    appliedAt: (slotIndex, state, frame) =>
      lastAtOrBefore(readOwnApplied(ownUnchainedApplied, slotIndex, state), frame) === frame,
    sinceFires,
    endedAt,
    selfStackCountAt,
    enemyStateAt,
    counterFullFiresAt: (holder, counter, frame) => counterFullAt.get(counterKey(holder, counter)) === frame,
    instantConditionHolds(effect, sourceSlotIndex, frame) {
      if (holdsAt(effect.condition, sourceSlotIndex, frame)) return true;
      skipEffect(sourceSlotIndex, effect, frame);
      return false;
    },
    skipInstant: (effect, sourceSlotIndex, frame) => skipEffect(sourceSlotIndex, effect, frame),
    lowerCurrentHp,
    consumeFullStacks,
    leadShots,
    history: createHistory(layers),
  };
}
