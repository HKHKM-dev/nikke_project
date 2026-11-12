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
import { ZERO_HIT_RATE, applyResolvedEffect, fixedAttackBaseOf, type BuffTotals } from './buffs.ts';
import { createSpanMemo } from './spanMemo.ts';
import { statesMatching } from './states.ts';
import { type FrameEvents, type FullStackEvent } from './triggers.ts';
import { type TimelineSlot } from './timeline.ts';
import { type HolderLists, type HolderListsOptions, leadShotKey } from './holders/types.ts';
import { insertSorted, lastAtOrBefore, scaledEffect, valueOf } from './holders/items.ts';
import { amplify } from './holders/history.ts';
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
    applications,
    conditionSkips,
    consumeTrack,
    consuming,
    cooldownSum,
    cooldownViews,
    counterRecords,
    counterSources,
    critViews,
    cycleSources,
    damageViews,
    damageViewsOf,
    endedAt,
    enemyStateAt,
    enemyStateSources,
    extendSources,
    firingViews,
    frames,
    gaugeViews,
    hasPellets,
    healKey,
    heals,
    healTracks,
    hitViews,
    holdsAt,
    hpDowns,
    hpRatioStepsOf,
    leads,
    logs,
    minEffectiveRangeAt,
    ownStateActive,
    ownUnchainedApplied,
    passive,
    pelletCountViews,
    rankContext,
    rankings,
    readItems,
    readOwnApplied,
    register,
    removeDebuffGuesses,
    removeDebuffSources,
    removeSources,
    shotCountEveryOf,
    sinceFires,
    singlePelletViews,
    skipEffect,
    stackSources,
    stateGroups,
    stateTracks,
    staticStates,
    sumAt,
    timedSources,
    tracks,
    whileTracks,
  } = layers;
  const emptyEvents = (frame: number): FrameEvents => ({
    frame,
    shots: slots.map(() => null),
    activations: [],
    burstEffects: [],
    fullBurstStart: false,
    fullBurstEnd: false,
    gaugeFull: false,
    fullBurstStartUsers: [],
    fullBurstEndUsers: [],
    healed: slots.map(() => false),
  });

  const hasFiring = slots.map((_, i) => (firingViews[i] ?? []).length > 0);
  /**
   * 射手の実効値（持ち主ごと）。毎フレーム × 枠で読まれるので、効いている件の組が変わらない間（件の境目まで）は前の値を使い回す
   * （plan/design-first-pass-perf.md 3.2 節）
   */
  const firingBuffs = firingViews.map((views) =>
    createSpanMemo(
      views.length,
      (i) => readItems(views[i]!.track),
      (frame, base: BuffTotals): BuffTotals | null => {
        let buffs = base;
        let changed = false;
        for (const v of views) {
          // 和集合の窓は重ならないので効いているのは多くて 1 つ。スタックする効果は効いている段の数だけ足す。件の scale（perCount の
          // スタック数）は 2 パス目（piecesOfTrack）と同じく値に掛ける
          for (const it of activeAt(v.track, frame)) {
            const effect = scaledEffect(v.effect, it);
            buffs = applyResolvedEffect(
              buffs,
              effect,
              fixedAttackBaseOf(effect, v.track.casterBaseAttack, slots),
              v.track.casterMaxHp,
            ).totals;
            changed = true;
          }
        }
        return changed ? buffs : null;
      },
    ),
  );

  // 毎フレーム読むので、消費する状態の持ち主の件の列は前もって引く（件の列はここまでに作り終わる。plan/design-first-pass-perf.md 3.1 節）
  const consumingTracks = consuming.map(({ holder, state }) => ({
    holder,
    state,
    own: tracks.filter((t) => t.holder === holder && t.origin.kind === 'state' && t.origin.state === state),
  }));

  const selfStackCountAt: HolderLists['selfStackCountAt'] = (holder, state, frame) => {
    let level = 0;
    for (const s of statesMatching(state)) {
      if (staticStates[holder]?.has(s) === true) level = Math.max(level, 1);
      for (const t of stateTracks[holder]?.get(s) ?? [])
        for (const it of activeAt(t, frame)) if (it.start < frame) level = Math.max(level, it.stack ?? 1);
    }
    return level;
  };

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
    registerBattleStart() {
      if (frames <= 0) return;
      register(emptyEvents(0), true);
    },
    registerFrame(ev) {
      register(ev, false);
      // テスト用: ループの中で読まれない件の列も、毎フレーム読んで確かめる（いまは読まない列を、後の定義が読んでも落とし漏れが分かる）
      if (options.verifyItems === true) for (const track of tracks) readItems(track);
    },
    firingBuffsAt(holder, frame, base) {
      return hasFiring[holder] ? firingBuffs[holder]!(frame, base) : null;
    },
    hasFiringTracks: (holder) => hasFiring[holder] === true,
    // 件の scale（perCount のスタック数・確率）は 2 パス目と同じく値に掛ける
    hitRateAt: (holder, frame) => {
      let n = 0;
      let up = 0;
      for (const v of hitViews[holder] ?? []) {
        for (const it of activeAt(v.track, frame)) {
          const value = valueOf(v.effect, it);
          n += value;
          if (v.effect.value > 0) up += value;
        }
      }
      return n === 0 && up === 0 ? ZERO_HIT_RATE : { n, up };
    },
    hasHitTracks: hitViews.some((views) => views.length > 0),
    critUpAt: (holder, frame) => sumAt(critViews[holder], frame),
    pelletsAt: (holder, frame) => ({
      pelletCount: sumAt(pelletCountViews[holder], frame),
      singlePellet: sumAt(singlePelletViews[holder], frame),
    }),
    hasPelletTracks: (holder) => hasPellets[holder] === true,
    minEffectiveRangeAt,
    rankContext,
    applyHeal(effect, sourceSlotIndex, holder, frame) {
      const track = healTracks.get(healKey(sourceSlotIndex, effect))?.[holder] ?? null;
      if (track === null)
        throw new Error(`no heal track for ${effect.source.skill}[${effect.effectIndex}] on ${holder}`);
      const opens = effect.durationFrames === undefined || activeAt(track, frame).length === 0;
      if (frame < frames) insertSorted(track.starts, frame);
      if (opens) heals.push({ frame, sourceSlotIndex, slotIndex: holder });
      return opens;
    },
    openWeaponChange(holder, weaponId, end) {
      for (const track of tracks) {
        const o = track.origin;
        if (track.holder !== holder || o.kind !== 'timed') continue;
        if (o.effect.durationUntil !== 'ammoSpent' || o.effect.weapon?.id !== weaponId) continue;
        const last = readItems(track).at(-1);
        if (last === undefined || last.start >= end || last.end < end) continue;
        return true;
      }
      return false;
    },
    cycleEveryAt(slotIndex, targetSkill, frame) {
      return cycleSources
        .filter((c) => c.slotIndex === slotIndex && c.effect.target === 'cycle' && c.effect.targetSkill === targetSkill)
        .flatMap((c) => activeAt(c.track, frame).map(() => c.effect.every));
    },
    shotCountEveryOf,
    gaugeSpeedAt: (holder, frame) => sumAt(gaugeViews[holder], frame),
    hasGaugeSpeedTracks: (holder) => (gaugeViews[holder] ?? []).length > 0,
    damageBuffsAt(holder, frame, base) {
      let buffs = base;
      for (const v of (damageViews[holder] ??= damageViewsOf(holder))) {
        for (const it of activeAt(v.track, frame)) {
          const effect = scaledEffect(v.effect, it);
          buffs = applyResolvedEffect(
            buffs,
            effect,
            fixedAttackBaseOf(effect, v.track.casterBaseAttack, slots),
            v.track.casterMaxHp,
            // 発動者基準の防御力▼（casterDefence）は付けた枠の基礎防御力を読む（2 パス目の skills/timeline.ts と同じ）
            slots[v.track.sourceSlotIndex]?.baseDefence,
          ).totals;
        }
      }
      return buffs;
    },
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
    instantConditionHolds(effect, sourceSlotIndex, frame) {
      if (holdsAt(effect.condition, sourceSlotIndex, frame)) return true;
      skipEffect(sourceSlotIndex, effect, frame);
      return false;
    },
    skipInstant: (effect, sourceSlotIndex, frame) => skipEffect(sourceSlotIndex, effect, frame),
    lowerCurrentHp(slotIndex, frame, ratio) {
      const downs = hpDowns[slotIndex];
      if (downs === undefined) throw new RangeError(`lowerCurrentHp: no slot ${slotIndex}`);
      const n = downs.frames.length;
      if (n > 0 && downs.frames[n - 1]! > frame) throw new RangeError('lowerCurrentHp must be called in frame order');
      downs.frames.push(frame);
      downs.products.push((n > 0 ? downs.products[n - 1]! : 1) * (1 - ratio));
    },
    consumeFullStacks(frame) {
      const out: FullStackEvent[] = [];
      for (const { holder, state, own } of consumingTracks) {
        const full = own.some((t) => {
          const max = t.origin.kind === 'state' ? t.origin.grant.maxStacks : undefined;
          return max !== undefined && readItems(t).some((it) => it.stack === max && it.start === frame);
        });
        if (!full) continue;
        for (const t of own) consumeTrack(t, frame);
        out.push({ slotIndex: holder, state });
      }
      return out;
    },
    leadShots() {
      return Object.fromEntries(
        [...leads].filter(([, l]) => l.fired.length > 0).map(([g, l]) => [leadShotKey(g), l.fired]),
      );
    },
    history() {
      for (const track of tracks) readItems(track);
      const amplified = amplify(tracks, amplifiers, slots, frames);
      return {
        frames,
        slots,
        passive,
        tracks,
        amplified: amplified.pieces,
        applications,
        conditionSkips: [...conditionSkips, ...amplified.skips]
          .map((x, i) => ({ x, i }))
          .sort((a, b) => a.x.frame - b.x.frame || a.i - b.i)
          .map(({ x }) => x),
        rankings,
        removeDebuffGuesses,
        heals,
        fullBurstWindows: [...options.fullBurstWindows()],
        logs,
        counters: counterRecords,
        hpRatios: slots.map((_, i) => hpRatioStepsOf(i)),
      };
    },
  };
}
