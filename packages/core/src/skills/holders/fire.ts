// 件の一覧の層 7: 発火（plan/design-split-first-pass.md 3.3 節）。持続バフ・状態の付与・解除・延長・デバフ解除・スタック量の発火を
// 件の列に入れ、{ applied } の出どころに付いた記録を配る。条件で落とした記録と順位の記録もここで足す。
import { type ChanceOpportunity } from '../chance.ts';
import { isResolvedApplied, type ResolvedEffect, type ResolvedShotCountTrigger } from '../resolve.ts';
import { tiedAtCutoff } from '../ranking.ts';
import { namedStateGroup, namedStateIsDebuff, statesMatching, type NamedStateId } from '../states.ts';
import { isEffectTarget, type FireContext } from '../targets.ts';
import { shotCountWeight, type ShotEvent } from '../triggers.ts';
import { isAllyDecrease, type EffectCondition } from '../types.ts';
import { type AppliedRecord } from '../timeline.ts';
import {
  ENEMY,
  type ExtendSource,
  type GrantSource,
  type HeldStage,
  type HeldTrack,
  type RemoveDebuffSource,
  type RemoveSource,
  type StackSource,
  type TimedSource,
  pickRemoveDebuff,
} from './types.ts';
import { closeTakesEffect, insertSorted } from './items.ts';
import type { HolderBase, Records } from './records.ts';
import type { Fires } from './fires.ts';
import type { Sources } from './sources.ts';
import type { Read } from './read.ts';
import type { Views } from './views.ts';
import type { Conditions } from './conditions.ts';

/** 発火を件の列に入れ、{ applied } を配る */
export function createFire(deps: HolderBase & Records & Fires & Sources & Read & Views & Conditions) {
  const {
    activeAt,
    applications,
    appliedStageOf,
    chainedApplications,
    chanceLevelsAt,
    closeTrack,
    conditionSkips,
    consumeTrack,
    counterValue,
    extendSources,
    frames,
    holdsAt,
    rankings,
    removeDebuffGuesses,
    slots,
    stackLevelAt,
    stateGroups,
    timedSources,
    tracks,
  } = deps;
  const skipGrant = (g: GrantSource, frame: number): void => {
    conditionSkips.push({
      frame,
      sourceSlotIndex: g.group.sourceSlotIndex,
      effect: { source: g.grant.source, effectIndex: g.grant.effectIndex },
      state: g.group.state,
    });
  };
  const skipEffect = (
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number },
    frame: number,
  ): void => {
    conditionSkips.push({ frame, sourceSlotIndex, effect: { source: e.source, effectIndex: e.effectIndex } });
  };
  /**
   * 確率のきっかけ（timed・付与）の機会を 1 つ貯める。発のフレーム f の次のフレームから、確率 × その発の回数の量（回数の量が 0 の発と、
   * 戦闘の後に始まる機会は除く。plan/design-soldier-eg.md 3.1 節）
   */
  const pushChanceOpportunity = (
    opportunities: ChanceOpportunity[] | null | undefined,
    trigger: ResolvedShotCountTrigger & { chance: number },
    shot: ShotEvent | null | undefined,
    f: number,
  ): void => {
    if (!opportunities || !shot || f + 1 >= frames) return;
    const weight = shotCountWeight(trigger.count, shot);
    if (weight > 0) opportunities.push({ start: f + 1, q: Math.min(1, trigger.chance * weight) });
  };
  // ---- 登録 ----
  /** timed の発火 1 つを、対象の持ち主の件の列に足す。対象になった枠を返す */
  const fireTimed = (src: TimedSource, start: number, context: FireContext): number[] => {
    if (start >= frames) return [];
    // 値 × 発火のフレームの自分のその状態のスタック数（0 なら出さない。plan/design-maids.md 2.1 節）
    const per = src.effect.perCount;
    const scale = per === undefined ? undefined : stackLevelAt(src.sourceSlotIndex, per.state, start);
    if (scale !== undefined && scale <= 0) return [];
    const targets: number[] = [];
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(src.effect, src.sourceSlotIndex, holder, target.character, context)) return;
      // 敵の件の効果は、対象の味方があれば敵の件の列に 1 回だけ足す
      if (src.enemy !== null) {
        if (targets.length === 0) insertSorted(src.enemy.starts, start);
        targets.push(holder);
        return;
      }
      const track = src.tracks[holder];
      if (!track)
        throw new Error(`no track for ${src.effect.source.skill}[${src.effect.effectIndex}] on slot ${holder}`);
      insertSorted(track.starts, start);
      if (scale !== undefined) (track.startScales ??= new Map()).set(start, scale);
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 状態の付与の発火 1 つを、対象の持ち主の状態の件の列と、付いた記録に足す。fire は leadFrames のある付与のきっかけの発のフレーム
   * （件の列の leadFires に足す）
   */
  const fireGrant = (g: GrantSource, start: number, context: FireContext, fire?: number): number[] => {
    if (start >= frames) return [];
    const group = g.group;
    // スタックの数をカウンタの値か、自分の状態のスタック数（発火のフレームの段の最大。条件 selfState と同じ件を見る。
    // plan/design-skill-stage10.md 2.1 節）から取る（0 なら付けない）。付いた後は、数え元が変わっても段は変わらない（V-0523）
    const from = g.grant.stacksFrom;
    // 使用回数のある状態は、1 回の発火で stacksPerFire のスタック（セブンスドワーフ・フルアクティブの 2 回）
    // 確率の状態から写すときは、段ごとの「元のスタック数がその段以上の確率」で
    // 段を付け、件の段の scale にする（値はスタック数の期待値 × 値になる。plan/design-tove-base.md 2.1 節）
    const levels =
      from !== undefined && 'state' in from ? chanceLevelsAt(group.sourceSlotIndex, from.state, start) : undefined;
    const count =
      from === undefined
        ? (g.grant.stacksPerFire ?? 1)
        : 'counter' in from
          ? counterValue(group.sourceSlotIndex, from.counter)
          : levels !== undefined
            ? levels.filter((p) => p > 0).length
            : stackLevelAt(group.sourceSlotIndex, from.state, start);
    if (count <= 0) return [];
    const addStart = (track: HeldTrack): void => {
      let fires: number[] | undefined;
      if (fire !== undefined) {
        const byStart = (track.leadFires ??= new Map());
        fires = byStart.get(start);
        if (fires === undefined) byStart.set(start, (fires = []));
      }
      for (let k = 0; k < count; k++) {
        insertSorted(track.starts, start);
        if (fires !== undefined) insertSorted(fires, fire!);
      }
      if (levels !== undefined) (track.levelScales ??= new Map()).set(start, levels);
    };
    const targets: number[] = [];
    // 敵に付く状態は、対象の味方があれば敵の件の列に 1 回だけ足す（付いた記録は作らない。{ applied } で見る
    // 語彙は味方の状態だけ）
    if (group.enemy !== null) {
      const on = slots.some(
        (target, holder) =>
          target !== null && isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context),
      );
      if (on) addStart(group.enemy);
      return targets;
    }
    slots.forEach((target, holder) => {
      if (target === null) return;
      if (!isEffectTarget(g.grant, group.sourceSlotIndex, holder, target.character, context)) return;
      const track = group.tracks[holder];
      if (!track) throw new Error(`no state track for ${group.state} on slot ${holder}`);
      addStart(track);
      // { applied } のきっかけの付与（文脈に appliedCasters がある）は、同じフレームの切り替えでは後とみなす
      switchGroup(holder, group.state, start, context?.appliedCasters !== undefined);
      const record: AppliedRecord = {
        frame: start,
        state: group.state,
        sourceSlotIndex: group.sourceSlotIndex,
        slotIndex: holder,
      };
      applications.push(record);
      targets.push(holder);
    });
    return targets;
  };
  /**
   * 切り替えの組の状態 state が持ち主 holder にフレーム start に付いたら、組のほかの状態の
   * 件の列（出どころは問わない。解除不可も。plan/design-mint-prika.md 2.2 節）を閉じる。
   * ふだんは解除と同じく start + 1 で切り、同じフレームに始まった件は残す（付与が勝つ）。
   * { applied } のきっかけの付与は、同じフレームの付与より後とみなし、同じフレームに始まった件も切る（消費と同じ）
   */
  const switchGroup = (holder: number, state: NamedStateId, start: number, fromApplied: boolean): void => {
    const switchGroupOf = namedStateGroup(state);
    if (switchGroupOf === undefined) return;
    for (const other of tracks) {
      const o = other.origin;
      if (other.holder !== holder || o.kind !== 'state' || o.state === state) continue;
      if (namedStateGroup(o.state) !== switchGroupOf) continue;
      if (fromApplied) consumeTrack(other, start);
      else closeTrack(other, start);
    }
  };
  /**
   * 解除の発火 1 つ（plan/design-skill-stage1.md 1.2 節）。持ち主（自分）のその状態の件の列（出どころは問わない）に、
   * 閉じるフレームを足す。解除不可の件の列は閉じない
   */
  const fireRemove = (src: RemoveSource, frame: number): void => {
    for (const track of tracks) {
      const o = track.origin;
      if (track.holder !== src.sourceSlotIndex || o.kind !== 'state' || o.state !== src.effect.state) continue;
      // 消去（cancel）は解除不可の件も閉じる（plan/design-mint-prika.md 2.1 節）
      if (o.grant.undispellable === true && src.effect.cancel !== true) continue;
      closeTrack(track, frame);
    }
  };
  /**
   * 延長の発火 1 つ（plan/design-mint-prika.md 2.5 節）。対象の枠のその状態の件の列（出どころは問わない）に、延長を足す
   * （そのフレームに付いていて後まで続く件だけが延びる。extendItems）
   */
  const fireExtend = (src: ExtendSource, frame: number): void => {
    if (frame >= frames) return;
    if (src.targets === undefined) {
      const matching = statesMatching(src.effect.state);
      src.targets = tracks.filter(
        (track) =>
          track.origin.kind === 'state' &&
          matching.includes(track.origin.state) &&
          (src.effect.target === 'self' ? track.holder === src.sourceSlotIndex : track.holder !== ENEMY),
      );
    }
    for (const track of src.targets) (track.extensions ??= []).push({ frame, frames: src.effect.frames });
  };
  /**
   * 持ち主ごとの、デバフ 1 個ごとの件の列。デバフの印の付いた状態（解除不可を除く）は状態ごと、味方の timed の▼は効果ごと
   * （plan/design-debuff-removal-timed.md 2.1・2.2 節）。件の列は組み立ての後に増えないので、初めての発火で作る
   */
  let debuffTracks: HeldTrack[][][] | undefined;
  /**
   * 遅れ（delayFrames）のあるデバフ解除の予約（効くフレーム → 解除）。対象は、ループがそのフレームに来た時に、そのフレームまでに
   * 付いた状態で選ぶ（発火のフレームで先読みすると、遅れの間に付いた状態が件の列にまだ無い）
   */
  const pendingRemoveDebuffs = new Map<number, RemoveDebuffSource[]>();
  /**
   * デバフ解除の効くフレーム at（ループがいるフレーム）に効いている、味方のデバフ（印の付いた状態と、timed の▼）の
   * 件を、対象の味方ごとに count 個まで、スタックごと閉じる（選び方は pickRemoveDebuff）。at のすべての段の付与を登録した後に呼ぶ
   */
  const fireRemoveDebuff = (src: RemoveDebuffSource, at: number): void => {
    debuffTracks ??= slots.map((_, holder) => {
      const byState = new Map<NamedStateId, HeldTrack[]>();
      const allyDecreases: HeldTrack[][] = [];
      for (const track of tracks) {
        const o = track.origin;
        if (track.holder !== holder) continue;
        if (o.kind === 'timed' && isAllyDecrease(o.effect)) {
          allyDecreases.push([track]);
          continue;
        }
        if (o.kind !== 'state' || !namedStateIsDebuff(o.state)) continue;
        if (o.grant.undispellable === true) continue;
        const list = byState.get(o.state);
        if (list === undefined) byState.set(o.state, [track]);
        else list.push(track);
      }
      return [...byState.values(), ...allyDecreases];
    });
    // 持ち主ごとに、at に効いているデバフと、その最も早い始まり。at に別の解除が閉じた件の列はもう外れているので数えない。removable は
    // そのうちこの解除で外れるもの（閉じても付与が勝つ件の列と、閉じるフレームを読まない確率の件の列を除く）。外すのは removable から選び
    // （外れない件で N 機・count 個の枠を使わない）、選び方を確かめていない所の注記は、ゲームが選ぶ元の、付いているデバフ全部で決める
    // （plan/design-debuff-removal.md 2.2 節）
    const heldOf = (removable: boolean) =>
      debuffTracks!.map((debuffs) =>
        debuffs.flatMap((ts) => {
          const starts = ts.flatMap((t) =>
            t.closes.includes(at) || (removable && (!closeTakesEffect(t.starts, at) || t.opportunities !== null))
              ? []
              : activeAt(t, at).map((it) => it.start),
          );
          return starts.length === 0 ? [] : [{ tracks: ts, firstStart: Math.min(...starts) }];
        }),
      );
    const { effect } = src;
    const pick = effect.target === 'debuffedRandom' ? effect.pick : undefined;
    const { chosen } = pickRemoveDebuff(heldOf(true), effect.count, pick);
    const { guesses } = pickRemoveDebuff(heldOf(false), effect.count, pick);
    for (const ts of chosen) for (const track of ts) closeTrack(track, at);
    for (const guess of guesses) {
      removeDebuffGuesses.push({
        frame: at,
        sourceSlotIndex: src.sourceSlotIndex,
        effect: { source: effect.source, effectIndex: effect.effectIndex },
        ...guess,
      });
    }
  };
  /**
   * スタック量の増加の発火 1 つ（plan/design-skill-stage3.md 1.1 節）。状態の件の列に、同じフレームの始まりを N 個入れる
   * （スタックの段は始まりの数で上がり、上限と維持は付与のもの）。付いた記録は 1 件。
   * 減少（同 1.5 節）は、件の列に減少（そのフレームに効いている段の上から N 段を次のフレームで切る）を入れる。付いた記録は作らない
   */
  const fireStackChange = (src: StackSource, start: number): void => {
    if (start >= frames) return;
    if (src.effect.decrease === true) {
      const decreases = src.track.decreases;
      let i = decreases.length;
      while (i > 0 && decreases[i - 1]!.frame > start) i--;
      // 0 になったら件を閉じる減少（使用回数を使い切った時）
      decreases.splice(i, 0, {
        frame: start,
        amount: src.effect.amount,
        ...(src.effect.closesAtZero === true ? { closesAtZero: true as const } : {}),
      });
      return;
    }
    for (let k = 0; k < src.effect.amount; k++) insertSorted(src.track.starts, start);
    const record: AppliedRecord = {
      frame: start,
      state: src.effect.state,
      sourceSlotIndex: src.sourceSlotIndex,
      slotIndex: src.sourceSlotIndex,
    };
    applications.push(record);
  };
  // ---- { applied } の出どころ（timed・付与。見る状態が自分に付いた記録から発火する。plan/design-skill-stage4.md 1.1 節） ----
  type AppliedSource = {
    state: NamedStateId;
    sourceSlotIndex: number;
    stage: HeldStage;
    /** 最後に発火したフレーム。記録のフレームは呼び出しの順に減らないので、前の呼び出しと同じフレームの 2 回目を落とす */
    last: number;
    /** 発火の条件（selfState だけ。plan/design-mint-prika.md 2.3 節） */
    condition: EffectCondition | undefined;
    /** 同: 条件を満たさない発火を記録する（付与は skipGrant で状態も残す） */
    skip: (frame: number) => void;
    /** casters はそのフレームにきっかけの状態の件を付けた枠（対象 appliedCaster。同 2.4 節） */
    fire: (start: number, casters: readonly number[]) => void;
  };
  const appliedSources: AppliedSource[] = [];
  for (const group of stateGroups) {
    for (const g of group.grants) {
      const t = g.grant.trigger;
      if (!isResolvedApplied(t)) continue;
      appliedSources.push({
        state: t.applied,
        sourceSlotIndex: group.sourceSlotIndex,
        stage: g.stage,
        last: -1,
        condition: g.grant.condition,
        skip: (frame) => skipGrant(g, frame),
        fire: (start, casters) => {
          const before = applications.length;
          fireGrant(g, start, { appliedCasters: casters });
          for (let k = before; k < applications.length; k++) chainedApplications.add(applications[k]!);
        },
      });
    }
  }
  for (const src of timedSources) {
    const t = src.effect.trigger;
    if (!isResolvedApplied(t)) continue;
    appliedSources.push({
      state: t.applied,
      sourceSlotIndex: src.sourceSlotIndex,
      stage: src.stage,
      last: -1,
      condition: src.effect.condition,
      skip: (frame) => skipEffect(src.sourceSlotIndex, src.effect, frame),
      fire: (start, casters) => {
        fireTimed(src, start, { appliedCasters: casters });
      },
    });
  }
  // { applied } の状態の維持の延長（plan/design-mint-prika.md 2.5 節）
  for (const src of extendSources) {
    const t = src.effect.trigger;
    if (!isResolvedApplied(t)) continue;
    appliedSources.push({
      state: t.applied,
      sourceSlotIndex: src.sourceSlotIndex,
      stage: appliedStageOf(t.applied),
      last: -1,
      condition: src.effect.condition,
      skip: (frame) => skipEffect(src.sourceSlotIndex, src.effect, frame),
      fire: (start) => fireExtend(src, start),
    });
  }
  /**
   * 段 stage の { applied } の出どころを、この呼び出しで付いた記録（applications の from から。{ applied } の付与の記録を除く）から
   * 発火する。窓は記録のフレームから。同じフレームに 2 つの出どころから付いても 1 回（appliedFrames と同じ）
   */
  const dispatchApplied = (stage: HeldStage, from: number): void => {
    if (from >= applications.length) return;
    for (const a of appliedSources) {
      if (a.stage !== stage) continue;
      const fires = new Map<number, number[]>();
      for (let k = from; k < applications.length; k++) {
        const r = applications[k]!;
        if (r.state !== a.state || r.slotIndex !== a.sourceSlotIndex || chainedApplications.has(r)) continue;
        const casters = fires.get(r.frame) ?? [];
        if (!casters.includes(r.sourceSlotIndex)) casters.push(r.sourceSlotIndex);
        fires.set(r.frame, casters);
      }
      for (const frame of [...fires.keys()].sort((x, y) => x - y)) {
        if (frame <= a.last) continue;
        a.last = frame;
        // 条件（自分の状態）は段 1.5 と同じく前のフレームまでに付いた件を見る（plan/design-mint-prika.md 2.3 節）
        if (!holdsAt(a.condition, a.sourceSlotIndex, frame)) {
          a.skip(frame);
          continue;
        }
        a.fire(frame, fires.get(frame)!);
      }
    }
  };
  const recordRanking = (
    frame: number,
    sourceSlotIndex: number,
    e: { source: ResolvedEffect['source']; effectIndex: number; targetCount?: number; excludeSelf?: string },
    attackRank: readonly number[],
    finalAttacks: (number | null)[],
    targets: readonly number[],
  ): void => {
    rankings.push({
      frame,
      sourceSlotIndex,
      effect: { source: e.source, effectIndex: e.effectIndex },
      finalAttacks,
      targets: attackRank.filter((i) => targets.includes(i)),
      // unlessShort で末尾に足した自分は、同値の比べに入れない（順位ではなく足りない分の補い）
      tied: tiedAtCutoff(
        e.excludeSelf === 'unlessShort' ? attackRank.slice(0, -1) : attackRank,
        finalAttacks,
        e.targetCount ?? 1,
      ),
    });
  };
  return {
    dispatchApplied,
    fireExtend,
    fireGrant,
    fireRemove,
    fireRemoveDebuff,
    fireStackChange,
    fireTimed,
    pendingRemoveDebuffs,
    pushChanceOpportunity,
    recordRanking,
    skipEffect,
    skipGrant,
  };
}
export type Fire = ReturnType<typeof createFire>;
