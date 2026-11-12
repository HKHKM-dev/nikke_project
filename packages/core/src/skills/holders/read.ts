// 件の一覧の層 4: 件の読み（plan/design-split-first-pass.md 3.3 節）。件の列の件を、読む入力が伸びたときだけ作り直して返す（readItems）。
// 最大スタック数▲で上がる上限、while の件、カウンタの while の件もここで作る。
import { type ShotLog } from '../../frame/shots.ts';
import {
  resolveMaxStacksUps,
  type ResolvedWhileEffect,
  type ResolvedCounterWhileEffect,
  isCounterWhileEffect,
  isHpWhileEffect,
} from '../resolve.ts';
import type { MaxStacksAt } from '../stacks.ts';
import { statesMatching } from '../states.ts';
import { ENEMY, type HeldItem, type HeldTrack, counterEffectiveFrom } from './types.ts';
import { ALL_READS, type TrackReads, buildTrackItems, setLength, whileItems } from './items.ts';
import type { HolderBase, Records } from './records.ts';
import type { Fires } from './fires.ts';
import type { Sources } from './sources.ts';

/** 件の列の件を読む（読む入力が伸びたときだけ作り直す） */
export function createRead({
  counterRecords,
  frames,
  hpWhileStates,
  itemsSeen,
  logs,
  options,
  slots,
  stateTracks,
  tracks,
}: HolderBase & Records & Fires & Sources) {
  // ---- 状態の中身の最大スタック数▲（plan/design-skill-stage14.md 2.7 節。論点 5） ----
  // 上限が上がる件の列（持ち主のその状態の、スタックする件の列）→ 上げる状態の件の列（同じ持ち主に、中身を持つ定義の枠が付けたもの）と量
  const capRaisers = new Map<HeldTrack, { base: number; raisers: { track: HeldTrack; amount: number }[] }>();
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    for (const up of resolveMaxStacksUps(slot.definition, slot.character, slot.levels)) {
      for (const raiser of tracks) {
        const r = raiser.origin;
        if (r.kind !== 'state' || raiser.sourceSlotIndex !== sourceSlotIndex || r.state !== up.whileState) continue;
        for (const target of tracks) {
          const t = target.origin;
          if (target.holder !== raiser.holder || t.kind !== 'state' || t.state !== up.state) continue;
          if (t.grant.maxStacks === undefined) continue;
          const entry = capRaisers.get(target) ?? { base: t.grant.maxStacks, raisers: [] };
          entry.raisers.push({ track: raiser, amount: up.amount });
          capRaisers.set(target, entry);
        }
      }
    }
  });
  /**
   * 件の列の、始まりのフレームごとの上限（上げる状態の件がそのフレームに付いていれば量を足す。上げる状態のスタック数によらず 1 回）。
   * 上げる件の列が無ければ undefined（付与の上限のまま）。上げる件の列の件は、件を作る直前に 1 回だけ読む（その入力が変われば updateLengths
   * が作り直させる）
   */
  const maxStacksAtOf = (track: HeldTrack): MaxStacksAt | undefined => {
    const entry = capRaisers.get(track);
    if (entry === undefined) return undefined;
    const raisers = entry.raisers.map((r) => ({ items: readItems(r.track), amount: r.amount }));
    return (frame) => {
      let cap = entry.base;
      for (const r of raisers) if (r.items.some((it) => it.start <= frame && frame < it.end)) cap += r.amount;
      return cap;
    };
  };
  // ---- 件を作る ----
  /**
   * 件の列の、件を作る関数が読む入力（reads）の長さを lengths に書き、前に書いた長さと違えば true（読まない入力は 0）。
   * 毎フレーム読まれるので、配列を作らずに比べる（plan/design-first-pass-perf.md 3.1 節）
   */
  const updateLengths = (
    track: HeldTrack,
    log: ShotLog | null | undefined,
    reads: TrackReads,
    lengths: number[],
  ): boolean => {
    let changed = setLength(lengths, 0, track.starts.length);
    changed = setLength(lengths, 1, track.opportunities?.length ?? 0) || changed;
    changed = setLength(lengths, 2, reads.shots ? (log?.frames.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 3, reads.weaponChangeEnds ? (log?.weaponChangeEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 4, reads.reloadEnds ? (log?.reloadEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 5, reads.fullBurstWindows ? options.fullBurstWindows().length : 0) || changed;
    changed = setLength(lengths, 6, track.closes.length) || changed;
    changed = setLength(lengths, 7, track.consumes.length) || changed;
    changed = setLength(lengths, 8, track.decreases.length) || changed;
    changed = setLength(lengths, 10, reads.untilEnds ? (track.untilEnds?.length ?? 0) : 0) || changed;
    changed = setLength(lengths, 11, track.extensions?.length ?? 0) || changed;
    // 上限を上げる状態の件の列の入力（始まり・閉じる・消費・減少。その件の列は持続の付与で、ほかの入力を読まない）
    const raisers = capRaisers.get(track)?.raisers;
    if (raisers === undefined) return changed;
    let raised = 0;
    for (const r of raisers)
      raised += r.track.starts.length + r.track.closes.length + r.track.consumes.length + r.track.decreases.length;
    return setLength(lengths, 9, raised) || changed;
  };
  /** 件の列の件（件を作る関数が読む入力が変わったときだけ作り直す） */
  const readItems = (track: HeldTrack): HeldItem[] => {
    // while の件は、出どころの枠の状態の件から作る（入力の長さでなく、元の件が作り直されたかで見る）
    if (track.origin.kind === 'while') {
      const effect = track.origin.effect;
      // 出どころ × 閾値の区間の件（updateHpAtLeast）をそのまま使う（plan/design-hp-ratio-readers.md 2.1 節）
      if (isHpWhileEffect(effect)) return (track.items = hpWhileStates.get(track)!.items);
      return isCounterWhileEffect(effect) ? readCounterWhileItems(track, effect) : readWhileItems(track, effect);
    }
    const log = track.holder === ENEMY ? null : logs[track.holder];
    const { reads, lengths, verified } = itemsSeen.get(track)!;
    if (updateLengths(track, log, reads, lengths)) {
      track.items = buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track));
    } else if (options.verifyItems === true) {
      // 作り直さずに返す件が、いまの入力から作り直した件と同じか（入力のどれも変わっていなければ確かめ直さない）
      if (
        updateLengths(track, log, ALL_READS, verified) &&
        JSON.stringify(track.items) !==
          JSON.stringify(buildTrackItems(track, log, options.fullBurstWindows(), frames, maxStacksAtOf(track)))
      )
        throw new Error(`stale items: track ${tracks.indexOf(track)}`);
    }
    return track.items;
  };
  const activeAt = (track: HeldTrack, frame: number): HeldItem[] =>
    readItems(track).filter((it) => it.start <= frame && frame < it.end);
  /**
   * while の件の列が見る、出どころの枠のその状態（家族の根なら家族のどれか）の
   * 段 1 の件の列（出どころは問わない。条件の selfState が見るものと同じ。plan/design-skill-stage9.md 1.3 節）。
   * 段 1.5（条件つきの付与）の状態の件の列も見る（V-0702。
   * クエンシー：エスケープクイーンの S1 の「ルート探索 2 段階フルスタック状態の時のみ」。2 段階の付与は 1 段階のフルスタックの条件つき）。件の列は
   * 条件の selfState と同じ stateTracks から引く。段 1.5 の件も付いたフレームから効かせる（while は stat を出すだけで状態を付けないので連鎖しない）
   */
  const whileOwn = new Map<HeldTrack, HeldTrack[]>();
  /** while の件を作った時の、元の状態の件（件の列ごとの items。作り直すと別の配列になる） */
  const whileSeen = new Map<HeldTrack, readonly HeldItem[][]>();
  const readWhileItems = (track: HeldTrack, effect: ResolvedWhileEffect): HeldItem[] => {
    let own = whileOwn.get(track);
    if (own === undefined) {
      const family = statesMatching(effect.whileState);
      own = family.flatMap((s) => stateTracks[track.sourceSlotIndex]?.get(s) ?? []);
      whileOwn.set(track, own);
    }
    const deps = own.map((t) => readItems(t));
    const seen = whileSeen.get(track);
    if (seen !== undefined && seen.length === deps.length && seen.every((d, i) => d === deps[i])) return track.items;
    whileSeen.set(track, deps);
    track.items = whileItems(
      own.map((t, i) => ({ origin: t.origin, items: deps[i]!, chance: t.opportunities !== null })),
      effect.whileStacks,
    );
    return track.items;
  };
  /**
   * カウンタの while の件（plan/design-skill-stage11.md 2.4 節）。出どころの枠のそのカウンタが atLeast 以上の間。
   * 記録の値はそのフレームのすべての判定の後に足したものなので、効くのは次のフレームから（戦闘開始時の増減はフレーム 0 から）。
   * カウンタの記録が増えた時だけ作り直す
   */
  const counterWhileSeen = new Map<HeldTrack, number>();
  const readCounterWhileItems = (track: HeldTrack, effect: ResolvedCounterWhileEffect): HeldItem[] => {
    if (counterWhileSeen.get(track) === counterRecords.length) return track.items;
    counterWhileSeen.set(track, counterRecords.length);
    const { counter, atLeast } = effect.whileCounter;
    const items: HeldItem[] = [];
    let open: number | null = null;
    for (const r of counterRecords) {
      if (r.slotIndex !== track.sourceSlotIndex || r.counter !== counter) continue;
      const from = counterEffectiveFrom(r);
      if (r.value >= atLeast) open ??= from;
      else if (open !== null) {
        if (open < from) items.push({ start: open, end: Math.min(from, frames) });
        open = null;
      }
    }
    if (open !== null && open < frames) items.push({ start: open, end: frames });
    track.items = items;
    return track.items;
  };
  return { activeAt, readItems };
}
export type Read = ReturnType<typeof createRead>;
