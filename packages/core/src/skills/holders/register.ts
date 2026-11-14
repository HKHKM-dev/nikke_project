// 件の一覧の層 8: 1 フレームの登録（plan/design-split-first-pass.md 3.3 節・9.2 節）。段ごとの出どころの列と前の回の発を作り、
// フレームの出来事から、前の処理 → 段 1 → 敵の状態 → 段 1.5 → 段 2 → デバフ解除 → 強化 → カウンタの順に登録する（plan/design-holder-effects.md 2.4 節）。
// 戦闘開始時とフレームごとの登録（registerBattleStart・registerFrame）と、leadFrames のある付与が発火した発のフレーム（leadShots）を返す。
import { isResolvedApplied, isResolvedChance, type ResolvedTrigger } from '../resolve.ts';
import { attackRankFor } from '../ranking.ts';
import { counterMax, type CounterId } from '../counters.ts';
import { dependsOnDefense } from '../targets.ts';
import { fireContextOf, type FrameEvents } from '../triggers.ts';
import { isEndedTrigger } from '../types.ts';
import { type GrantSource, type HeldStage, type HolderLists, type TimedSource, leadShotKey } from './types.ts';
import { atBattleStart, grantStartOf, insertSorted, lastAtOrBefore, startOfFire } from './items.ts';
import type { HolderBase, Records } from './records.ts';
import type { Fires } from './fires.ts';
import type { Sources } from './sources.ts';
import type { Read } from './read.ts';
import type { Views } from './views.ts';
import type { Conditions } from './conditions.ts';
import type { Fire } from './fire.ts';

/** フレームの出来事から、段の順に件を登録する */
export function createRegister({
  amplifiers,
  applications,
  closeTrack,
  counterConditionHolds,
  counterEmptyTracks,
  counterFullAt,
  counterKey,
  counterRecords,
  counterSources,
  counterValues,
  cycleSources,
  dispatchApplied,
  dotCancelSources,
  endedAt,
  enemyStateSources,
  extendSources,
  finalAttacksAtFrame,
  fireContextHolds,
  fireExtend,
  fireGrant,
  fireRemove,
  fireRemoveDebuff,
  firesOf,
  fireStackChange,
  fireAllStackable,
  allStackSources,
  fireTimed,
  frames,
  holdsAt,
  lowerDefenseAt,
  options,
  ownAppliedOf,
  pendingRemoveDebuffs,
  pushChanceOpportunity,
  rankSlots,
  readItems,
  recordRanking,
  removeDebuffSources,
  removeSources,
  selfHpAtMostAt,
  selfHpUntilTracks,
  skipEffect,
  skipGrant,
  slots,
  stackSources,
  stateEndTracks,
  stateGroups,
  timedSources,
  tracks,
  updateHpAtLeast,
}: HolderBase & Records & Fires & Sources & Read & Views & Conditions & Fire) {
  /** まだ dispatchApplied で読んでいない記録の始まり（静的な状態の記録は、戦闘開始時の呼び出しで読む） */
  let appliedFrom = 0;
  // { applied } の出どころは出来事では発火しない（dispatchApplied）
  const timedAt = (stage: HeldStage): TimedSource[] =>
    timedSources.filter((s) => s.stage === stage && !isResolvedApplied(s.effect.trigger));
  const stage1Timed = timedAt(1);
  const stage15Timed = timedAt(1.5);
  const stage2Timed = timedAt(2);
  const grantsAt = (stage: HeldStage): GrantSource[] =>
    stateGroups.flatMap((group) =>
      group.grants.filter((g) => g.stage === stage && !isResolvedApplied(g.grant.trigger)),
    );
  const stage1Grants = grantsAt(1);
  // 1 パス目も件の始まりから見る（plan/design-explosive-round-lead.md 5.2 節）: leadFrames のある付与（段 1 だけ。skills/parse/state.ts が条件・
  // stacksFrom・順位の対象を止める）の、前の回の発（known）と、件の始まりのフレーム → その件の数（early）と、この回の発（fired）
  if (stateGroups.some((group) => group.grants.some((g) => g.grant.leadFrames !== undefined && g.stage !== 1)))
    throw new Error('a grant with leadFrames must be in stage 1');
  // HP の割合で解除される付与の「発火のフレームにすでに閾値以下なら付かない」は段 1 の付与だけが見る（skills/parse/state.ts が
  // 条件を止める）。前の回の発から始める付与（leadFrames）とは組まない
  if (
    stateGroups.some((group) =>
      group.grants.some(
        (g) => g.grant.untilSelfHpAtMost !== undefined && (g.stage !== 1 || g.grant.leadFrames !== undefined),
      ),
    )
  )
    throw new Error('a grant lasting until the HP drops must be in stage 1 without leadFrames');
  const leads = new Map(
    stage1Grants.flatMap((g) => {
      if (g.grant.leadFrames === undefined) return [];
      const known = options.leadShots?.[leadShotKey(g)] ?? [];
      const early = new Map<number, number[]>();
      for (const shot of known) {
        const at = grantStartOf(g.grant, shot);
        const shots = early.get(at);
        if (shots === undefined) early.set(at, [shot]);
        else shots.push(shot);
      }
      return [[g, { known: new Set(known), early, fired: [] as number[] }] as const];
    }),
  );
  const stage15Grants = grantsAt(1.5);
  const stage2Grants = grantsAt(2);
  const stage1Removes = removeSources.filter((r) => r.stage === 1);
  const stage15Removes = removeSources.filter((r) => r.stage === 1.5);
  const stage1Stacks = stackSources.filter((x) => x.stage === 1);
  const stage15Stacks = stackSources.filter((x) => x.stage === 1.5);
  const ampFires = new Map(amplifiers.map((amp) => [amp, firesOf(amp.effect.trigger, amp.sourceSlotIndex)]));
  /** 1 フレームの登録の手順が共有する値 */
  type FrameStep = {
    ev: FrameEvents;
    battleStartOnly: boolean;
    take: (trigger: ResolvedTrigger) => boolean;
    from: number;
  };
  /** このフレームのカウンタの増減を、すべての判定の後に足す（0 と上限の間で切る） */
  const registerCounters = ({ ev, battleStartOnly }: FrameStep): void => {
    if (counterSources.length === 0) return;
    const f = ev.frame;
    const deltas = new Map<string, { slotIndex: number; counter: CounterId; delta: number }>();
    for (const src of counterSources) {
      const t = src.effect.trigger;
      let fired: boolean;
      if (isEndedTrigger(t)) fired = !battleStartOnly && endedAt(src.sourceSlotIndex, t.ended, f);
      // 自分にその状態が付いたフレーム（このフレームのすべての付与の後。戦闘開始時の付与はフレーム 0 の
      // 出来事で読む）
      else if (isResolvedApplied(t))
        fired = !battleStartOnly && lastAtOrBefore(ownAppliedOf(src.sourceSlotIndex, t.applied), f) === f;
      else if (battleStartOnly) fired = atBattleStart(t);
      else fired = t !== 'battleStart' && src.fires!(ev);
      if (!fired) continue;
      const condition = src.effect.condition;
      if (
        !fireContextHolds(condition, t, ev, src.sourceSlotIndex) ||
        (condition !== undefined && !counterConditionHolds(condition, src.sourceSlotIndex, f))
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      const key = counterKey(src.sourceSlotIndex, src.effect.counter);
      const d = deltas.get(key) ?? { slotIndex: src.sourceSlotIndex, counter: src.effect.counter, delta: 0 };
      d.delta += src.effect.decrease === true ? -src.effect.amount : src.effect.amount;
      deltas.set(key, d);
    }
    for (const [key, { slotIndex, counter, delta }] of deltas) {
      const before = counterValues.get(key) ?? 0;
      const after = Math.max(0, Math.min(counterMax(counter), before + delta));
      if (after === before) continue;
      counterValues.set(key, after);
      counterRecords.push(
        battleStartOnly
          ? { frame: 0, slotIndex, counter, value: after, battleStart: true }
          : { frame: f, slotIndex, counter, value: after },
      );
      if (after === counterMax(counter)) counterFullAt.set(key, (battleStartOnly ? 0 : f) + 1);
      // 0 に届いたら、そのカウンタで続く自分の状態の件の列を次のフレームで閉じる（解除不可でも）
      if (after === 0)
        for (const track of counterEmptyTracks.get(key) ?? []) closeTrack(track, battleStartOnly ? 0 : f);
    }
  };
  /** 見る状態の件が外れたフレームを窓の終わりに足し、HP の割合で解除される件を閉じる（段 1 の付与より前） */
  const registerEnds = ({ ev, battleStartOnly }: FrameStep): void => {
    const f = ev.frame;
    // 見る状態の持ち主の件が f に外れたら、f を窓の終わりに足す（f には付いていない。plan/design-grave.md 2.5 節）
    if (!battleStartOnly)
      for (const { track, state } of stateEndTracks) {
        const ends = track.untilEnds!;
        if (ends.at(-1) !== f && endedAt(track.holder, state, f)) ends.push(f);
      }
    // HP の割合で解除される件（plan/design-hp-down-interval.md 2.2 節）: f より前に付いた件が f に効いていて、持ち主の HP の割合が閾値以下と読めたら、
    // f + 1 で閉じる（f には付いている。HP の割合は f より前の現在の HP▼ から。付いた時にすでに以下なら付かない（段 1 の付与））
    if (!battleStartOnly)
      for (const { track, threshold } of selfHpUntilTracks)
        if (readItems(track).some((it) => it.start < f && f < it.end) && selfHpAtMostAt(track.holder, f, threshold))
          closeTrack(track, f);
  };

  /** 段 1 の付与と効果・解除・スタック量の増減と、その { applied } */
  const registerStage1 = ({ ev, battleStartOnly, take, from }: FrameStep): void => {
    const f = ev.frame;
    // 段 1: 条件なし・順位の対象でない付与と効果（確率のきっかけは機会を貯める）
    for (const g of stage1Grants) {
      const lead = leads.size > 0 ? leads.get(g) : undefined;
      // 前の回の発の件は、その始まりのフレームに登録する（同じフレームの段 1.5 の enemyState が見る）
      if (lead !== undefined && !battleStartOnly) {
        const shots = lead.early.get(f);
        if (shots !== undefined) for (const shot of shots) fireGrant(g, f, null, shot);
      }
      // 確率のきっかけの付与は、timed の確率と同じく機会を貯める（付いた記録は作らない）
      if (isResolvedChance(g.grant.trigger)) {
        if (!battleStartOnly) {
          const track = g.group.tracks.find((t) => t !== null);
          pushChanceOpportunity(track?.opportunities, g.grant.trigger, ev.shots[g.group.sourceSlotIndex], f);
        }
        continue;
      }
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (!fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex)) {
        skipGrant(g, f);
        continue;
      }
      // HP の割合で解除される状態は、発火のフレームにすでに閾値以下なら付かない（不発に数える。V-0729）
      const hpUntil = g.grant.untilSelfHpAtMost;
      if (hpUntil !== undefined && !battleStartOnly && selfHpAtMostAt(g.group.sourceSlotIndex, f, hpUntil)) {
        skipGrant(g, f);
        continue;
      }
      if (lead !== undefined) {
        lead.fired.push(f);
        if (lead.known.has(f)) continue;
      }
      fireGrant(
        g,
        battleStartOnly ? 0 : grantStartOf(g.grant, f),
        fireContextOf(g.grant.trigger, ev),
        lead !== undefined ? f : undefined,
      );
    }
    for (const src of stage1Timed) {
      if (src.chance) {
        const trigger = src.effect.trigger;
        if (!battleStartOnly && isResolvedChance(trigger)) {
          const track = src.enemy ?? src.tracks.find((t) => t !== null);
          pushChanceOpportunity(track?.opportunities, trigger, ev.shots[src.sourceSlotIndex], f);
        }
        continue;
      }
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (!fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex)) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    // 解除（閉じるのは発火の次のフレームなので、段の中の順は同じフレームの判定に効かない。plan/design-skill-stage1.md 1.2 節）
    for (const r of stage1Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (!fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex)) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // スタック量の増減（増加は状態の件の列の始まりを足すだけなので、段 1 の付与と同じ見え方。減少は次のフレームで切るので、
    // 段の中の順は同じフレームの判定に効かない）
    for (const x of stage1Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 段 1 の { applied }（段 1 の付与・スタック量の増加で付いた記録から）
    dispatchApplied(1, from);
  };

  /** 敵の状態・消去・循環の間隔の変更（段 1 の { applied } の後。ループの中の判定は読まない） */
  const registerEnemyStates = ({ ev, battleStartOnly, take }: FrameStep): void => {
    const f = ev.frame;
    // 敵の状態（持続ダメージの発火のフレーム。ループの中の判定は読まない）
    for (const e of enemyStateSources) {
      for (const { effect, fires } of e.effects) {
        if (!take(effect.trigger) || !(battleStartOnly || fires(ev))) continue;
        const at = battleStartOnly ? 0 : f + (effect.dot!.applyDelayFrames ?? 0);
        if (at < frames) insertSorted(e.track.starts, at);
      }
    }
    // 消去（f の判定には付いている。dotActiveSpans が f + 1 で切る）
    if (!battleStartOnly) for (const c of dotCancelSources) if (c.fires(ev)) insertSorted(c.track.closes, f);
    if (!battleStartOnly) {
      // 循環の間隔の変更はループの中でしか読まないので、戦闘開始時もフレーム 0 の出来事で登録する
      for (const c of cycleSources) {
        if (!c.fires(ev)) continue;
        const start = startOfFire(c.effect.trigger, f);
        if (start < frames) insertSorted(c.track.starts, start);
      }
    }
  };
  /** 段 1.5 の付与と効果・解除・延長・スタック量の増減と、その { applied } */
  const registerStage15 = ({ ev, battleStartOnly, take, from }: FrameStep): void => {
    const f = ev.frame;
    // 段 1.5: 条件つきの付与と効果（と、状態のスタック数を数で読む付与）。判定は段 1 の件だけを見る（条件つきどうしは
    // 連鎖させない）
    for (const g of stage15Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      if (
        !fireContextHolds(g.grant.condition, g.grant.trigger, ev, g.group.sourceSlotIndex) ||
        !holdsAt(g.grant.condition, g.group.sourceSlotIndex, f)
      ) {
        skipGrant(g, f);
        continue;
      }
      fireGrant(g, battleStartOnly ? 0 : grantStartOf(g.grant, f), fireContextOf(g.grant.trigger, ev));
    }
    for (const src of stage15Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      if (
        !fireContextHolds(src.effect.condition, src.effect.trigger, ev, src.sourceSlotIndex) ||
        !holdsAt(src.effect.condition, src.sourceSlotIndex, f)
      ) {
        skipEffect(src.sourceSlotIndex, src.effect, f);
        continue;
      }
      fireTimed(
        src,
        battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames),
        fireContextOf(src.effect.trigger, ev),
      );
    }
    for (const r of stage15Removes) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      if (
        !fireContextHolds(r.effect.condition, r.effect.trigger, ev, r.sourceSlotIndex) ||
        !holdsAt(r.effect.condition, r.sourceSlotIndex, f)
      ) {
        skipEffect(r.sourceSlotIndex, r.effect, f);
        continue;
      }
      fireRemove(r, battleStartOnly ? 0 : startOfFire(r.effect.trigger, f));
    }
    // 状態の維持の延長（{ applied } のほか。段 1.5 までに付いた件を延ばす。plan/design-mint-prika.md 2.5 節）
    for (const x of extendSources) {
      if (isResolvedApplied(x.effect.trigger)) continue;
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (!holdsAt(x.effect.condition, x.sourceSlotIndex, f)) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireExtend(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    for (const x of stage15Stacks) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (
        !fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex) ||
        !holdsAt(x.effect.condition, x.sourceSlotIndex, f) ||
        // 付いている時だけ足す（足す段の始まりのフレームにその状態の件が無ければ不発。フルスタックで外した件は除かれ、同じ発の
        // 付与の件は入る。plan/design-diesel.md 8.1 節）
        (x.effect.existingOnly === true &&
          !holdsAt(
            { selfState: { state: x.effect.state, present: true } },
            x.sourceSlotIndex,
            battleStartOnly ? 0 : startOfFire(x.effect.trigger, f),
          ))
      ) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireStackChange(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    // 味方の全部のスタック可能バフへのスタック量▲（足す先の件を読むので段 1.5。plan/design-adjacent-allies.md 2.5 節）
    for (const x of allStackSources) {
      if (!take(x.effect.trigger) || !(battleStartOnly || x.fires(ev))) continue;
      if (
        !fireContextHolds(x.effect.condition, x.effect.trigger, ev, x.sourceSlotIndex) ||
        !holdsAt(x.effect.condition, x.sourceSlotIndex, f)
      ) {
        skipEffect(x.sourceSlotIndex, x.effect, f);
        continue;
      }
      fireAllStackable(x, battleStartOnly ? 0 : startOfFire(x.effect.trigger, f));
    }
    dispatchApplied(1.5, from);
  };

  /** 段 2（順位・最終防御力の比べの対象）の付与と効果と、その { applied } */
  const registerStage2 = ({ ev, battleStartOnly, take, from }: FrameStep): void => {
    const f = ev.frame;
    // 段 2: 順位の対象。発火のフレームの順位（段 1・1.5 の攻撃力の件。同じフレームに付いたものも入れる）
    for (const g of stage2Grants) {
      if (!take(g.grant.trigger) || !(battleStartOnly || g.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(g.grant.trigger, f, g.grant.delayFrames);
      if (start >= frames) continue;
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(g.grant, rankSlots, finalAttacks, g.group.sourceSlotIndex);
      const targets = fireGrant(g, start, { ...fireContextOf(g.grant.trigger, ev), attackRank });
      recordRanking(f, g.group.sourceSlotIndex, g.grant, attackRank, finalAttacks, targets);
    }
    for (const src of stage2Timed) {
      if (!take(src.effect.trigger) || !(battleStartOnly || src.fires(ev))) continue;
      const start = battleStartOnly ? 0 : startOfFire(src.effect.trigger, f, src.effect.delayFrames);
      if (start >= frames) continue;
      // 最終防御力の比べの対象（発火のフレームの最終防御力。段 1・1.5 の防御力▲ の件。同じフレームに付いたものも入れる）
      if (dependsOnDefense(src.effect)) {
        fireTimed(src, start, {
          ...fireContextOf(src.effect.trigger, ev),
          lowerDefense: lowerDefenseAt(src.sourceSlotIndex, f),
        });
        continue;
      }
      const finalAttacks = finalAttacksAtFrame(f);
      const attackRank = attackRankFor(src.effect, rankSlots, finalAttacks, src.sourceSlotIndex);
      const targets = fireTimed(src, start, { ...fireContextOf(src.effect.trigger, ev), attackRank });
      recordRanking(f, src.sourceSlotIndex, src.effect, attackRank, finalAttacks, targets);
    }
    dispatchApplied(2, from);
  };

  /** デバフ解除（予約した解除を先に） */
  const registerRemoveDebuffs = ({ ev, battleStartOnly, take }: FrameStep): void => {
    const f = ev.frame;
    // デバフ解除（解除と同じく、閉じるのは効くフレームの次のフレームなので、同じフレームの判定には効かない）。遅れのある解除は
    // 効くフレームに予約し、そのフレームで対象を選ぶ（予約した解除を先に）。対象は、このフレームのすべての段の付与の後に選ぶ
    const due = battleStartOnly || pendingRemoveDebuffs.size === 0 ? undefined : pendingRemoveDebuffs.get(f);
    if (due !== undefined) {
      pendingRemoveDebuffs.delete(f);
      for (const r of due) fireRemoveDebuff(r, f);
    }
    for (const r of removeDebuffSources) {
      if (!take(r.effect.trigger) || !(battleStartOnly || r.fires(ev))) continue;
      const at = battleStartOnly ? 0 : startOfFire(r.effect.trigger, f, r.effect.delayFrames);
      if (at === f) fireRemoveDebuff(r, at);
      else if (at < frames) {
        const list = pendingRemoveDebuffs.get(at);
        if (list === undefined) pendingRemoveDebuffs.set(at, [r]);
        else list.push(r);
      }
    }
  };

  /** 強化の発火の窓の始まりを貯める */
  const registerAmplifiers = ({ ev, battleStartOnly, take }: FrameStep): void => {
    const f = ev.frame;
    // 2.5 段目: 強化は発火の窓の始まりだけを貯める（受け付けと値は、履歴を閉じる時に amplify で決める）
    for (const amp of amplifiers) {
      if (!take(amp.effect.trigger)) continue;
      if (!battleStartOnly && !ampFires.get(amp)!(ev)) continue;
      const start = battleStartOnly ? 0 : startOfFire(amp.effect.trigger, f);
      if (start < frames) amp.starts.push(start);
    }
  };

  /** 段 1〜2 と強化の発火（手順 3。battleStartOnly ならループの前の戦闘開始時の分だけ） */
  const register = (ev: FrameEvents, battleStartOnly: boolean): void => {
    const f = ev.frame;
    // このフレームの HP の割合の while の可否（このフレームのどの登録よりも先）
    updateHpAtLeast(f);
    const from = appliedFrom;
    const take = (trigger: ResolvedTrigger): boolean =>
      battleStartOnly ? atBattleStart(trigger) : trigger !== 'battleStart';
    const step: FrameStep = { ev, battleStartOnly, take, from };
    registerEnds(step);
    registerStage1(step);
    registerEnemyStates(step);
    registerStage15(step);
    registerStage2(step);
    appliedFrom = applications.length;
    registerRemoveDebuffs(step);
    registerAmplifiers(step);
    // カウンタの増減は、このフレームのすべての判定の後
    registerCounters(step);
  };
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
  const registerBattleStart: HolderLists['registerBattleStart'] = () => {
    if (frames <= 0) return;
    register(emptyEvents(0), true);
  };
  const registerFrame: HolderLists['registerFrame'] = (ev) => {
    register(ev, false);
    // テスト用: ループの中で読まれない件の列も、毎フレーム読んで確かめる（いまは読まない列を、後の定義が読んでも落とし漏れが分かる）
    if (options.verifyItems === true) for (const track of tracks) readItems(track);
  };
  const leadShots: HolderLists['leadShots'] = () =>
    Object.fromEntries([...leads].filter(([, l]) => l.fired.length > 0).map(([g, l]) => [leadShotKey(g), l.fired]));
  return { leadShots, registerBattleStart, registerFrame };
}
export type Register = ReturnType<typeof createRegister>;
