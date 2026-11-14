// 件の一覧（../holders.ts の createHolderLists）が件を作る純粋な関数: 発火の始まりの列とループで分かった出来事から、件の列の件を
// 作り直す（buildTrackItems）。状態・持続バフ・while・吸収回復・発数の維持の件の作り方と、状態の付与の組・段の印の決め方。
import type { FullBurstWindow } from '../../burst/schedule.ts';
import { dotActiveSpans } from '../../frame/dot.ts';
import { lowerBound, type ShotLog } from '../../frame/shots.ts';
import { chancePieces, chanceStackPieces, chanceValueOf } from '../chance.ts';
import {
  isResolvedApplied,
  isResolvedShotCount,
  isResolvedTimer,
  resolveStackChanges,
  resolveAllStackableChanges,
  resolveStateContents,
  resolveStateGrants,
  type ResolvedStackChange,
  type ResolvedStateGrant,
  type ResolvedTimedEffect,
  type ResolvedTrigger,
} from '../resolve.ts';
import { stackItems, STACK_REFRESH, type MaxStacksAt, type StackDecrease } from '../stacks.ts';
import type { NamedStateId } from '../states.ts';
import { dependsOnDefense, dependsOnRank } from '../targets.ts';
import type { ShotCountEveryAt, TriggerTracker } from '../triggers.ts';
import { conditionReadsItems, type EdgeShift, type EffectCondition } from '../types.ts';
import {
  effectItems,
  holderHitStarts,
  shotCountItems,
  shotCountStackItems,
  unionItems,
  untilNextEndItems,
  weaponStartTrim,
  type TimelineSlot,
} from '../timeline.ts';
import { ENEMY, type HeldItem, type HeldOrigin, type HeldStage, type HeldTrack, type StateGroup } from './types.ts';

/**
 * 窓の始まり。射撃の回数のきっかけは次のフレームから。timed の delayFrames があれば、きっかけの delayFrames 後から（ナガ S2 は 6。
 * C-0593・C-0653。plan/design-shot-count-trigger-frame.md 6 節）。時間の周期のきっかけの付与の delayFrames は、周期の発火の
 * delayFrames 後から（C-0736。plan/design-new-chars-1029.md 10.2 節の e）
 */
export function startOfFire(trigger: ResolvedTrigger, frame: number, delayFrames?: number): number {
  if (isResolvedTimer(trigger)) return frame + (delayFrames ?? 0);
  if (!isResolvedShotCount(trigger)) return frame;
  return frame + (delayFrames ?? 1);
}

/**
 * 状態の付与の件の始まり（startOfFire）。徹甲炸裂弾の▲の付く時刻（plan/design-explosive-round-lead.md 3 節）: leadFrames のある付与は、
 * きっかけの発のフレームの leadFrames 前から（戦闘の始まりより前にはしない）
 */
export function grantStartOf(grant: ResolvedStateGrant, frame: number): number {
  if (grant.leadFrames !== undefined) return Math.max(0, frame - grant.leadFrames);
  return startOfFire(grant.trigger, frame, grant.delayFrames);
}

/** 戦闘開始時の窓（ループの前に登録する）か */
export function atBattleStart(t: ResolvedTrigger): boolean {
  return t === 'battleStart' || (isResolvedTimer(t) && 'atStart' in t && t.atStart === true);
}

/** 窓を [start, end) の件にする */
function itemsOfPairs(pairs: readonly (readonly [number, number])[]): HeldItem[] {
  return pairs.map(([start, end]) => ({ start, end }));
}

/** 吸収回復の窓（V-0024）: 付き直しは終わりを延ばし、終わりのフレームちょうどに付けば新しい件 */
/**
 * 件ごとに始まりと終わりを動かす（戦闘の範囲に切り詰め、長さ 0 以下は消す。plan/design-minimal-edge.md 3.3 節）。
 * 1 パス目は前から進むので、始まりを早めた分は、きっかけより前のフレームの 1 パス目の読みには効かない（バフの区間の表には効く）
 */
export function shiftEdges(items: readonly HeldItem[], shift: EdgeShift, frames: number): HeldItem[] {
  return items.flatMap((it) => {
    const start = Math.max(0, it.start + shift.start);
    const end = Math.min(frames, it.end + shift.end);
    return start < end ? [{ ...it, start, end }] : [];
  });
}

function healWindowItems(starts: readonly number[], durationFrames: number | undefined, frames: number): HeldItem[] {
  if (durationFrames === undefined) return [];
  const items: HeldItem[] = [];
  for (const s of starts) {
    if (s >= frames) continue;
    const end = Math.min(s + durationFrames, frames);
    const last = items[items.length - 1];
    if (last !== undefined && s < last.end) {
      last.end = Math.max(last.end, end);
      continue;
    }
    items.push({ start: s, end });
  }
  return items;
}

/**
 * 状態の件。decreases はスタックする状態だけ。
 * maxStacksAt は、最大スタック数▲の中身で上がる上限（無ければ付与の上限。plan/design-skill-stage14.md 2.7 節）
 */
function stateItems(
  grant: ResolvedStateGrant,
  starts: readonly number[],
  log: ShotLog | null | undefined,
  fullBurstEnds: readonly number[],
  frames: number,
  untilEnds: readonly number[],
  decreases: readonly StackDecrease[] = [],
  maxStacksAt?: MaxStacksAt,
  startDurations?: ReadonlyMap<number, number>,
): HeldItem[] {
  const shotFrames = log?.frames ?? [];
  // 持ち主の最大装弾数のリロード完了まで（timed の reloadEnd と同じ）と、ほかの状態の終わりまで
  // （件の列の untilEnds。register が見る状態の件の外れたフレームを足す。plan/design-grave.md 2.2・2.5 節）。どちらもスタックしない
  if (grant.durationUntil === 'reloadEnd')
    return itemsOfPairs(untilNextEndItems(starts, log?.reloadEnds ?? [], frames));
  // 見る状態の最後の発で付いた件（始まりが見る状態の終わりと同じフレーム）は、付いた時に見る状態が無いので付けない
  if (grant.untilStateEnd !== undefined) {
    const ended = new Set(untilEnds);
    const live = starts.filter((start) => !ended.has(start));
    return itemsOfPairs(untilNextEndItems(live, untilEnds, frames));
  }
  if (grant.durationShots !== undefined) {
    return itemsOfPairs(shotCountItems(starts, shotFrames, grant.durationShots, frames));
  }
  if (grant.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndItems(starts, fullBurstEnds, frames));
  }
  if (grant.maxStacks !== undefined) {
    return stackItems(
      starts,
      grant.durationFrames,
      frames,
      maxStacksAt ?? grant.maxStacks,
      grant.stackRefresh ?? STACK_REFRESH,
      decreases,
    ).map((w) => ({
      start: w.start,
      end: w.end,
      stack: w.stack,
    }));
  }
  return itemsOfPairs(unionItems(starts, grant.durationFrames, frames, startDurations));
}

/**
 * 始まりの列 starts の件の列を、解除で発火のフレーム c に閉じると外れるか（plan/design-skill-stage1.md 1.2 節）。同じフレームに
 * 始まりがあれば閉じない（付与が勝つ。closedStateItems・デバフ解除の候補）
 */
export function closeTakesEffect(starts: readonly number[], c: number): boolean {
  return !starts.includes(c);
}

/**
 * 解除で閉じる状態の件（plan/design-skill-stage1.md 1.2 節）。閉じる発火のフレーム c のうち、同じフレームに始まりの
 * 無いもの（付与が勝つ）で始まりの列を区切り、区切りごとに今と同じ規則で件を作って、c より前の区切りの件を c + 1 で切る。
 * 区切りの後の件は c + 1 以降に始まる。スタックしない件は、切った件と後の区切りの件がちょうど続けば 1 つにする（和集合の上書き延長と
 * 同じ見え方）。スタックする件は段ごとに切り、後の区切りは段 1 から数え直す。
 * スタック量の減少（decreases）は、そのフレームを含む区切り（前の区切りのフレームより後で、区切りのフレーム以前）に渡す
 */
function closedStateItems(
  starts: readonly number[],
  closes: readonly number[],
  build: (starts: readonly number[], decreases: readonly StackDecrease[]) => HeldItem[],
  consumes: readonly number[] = [],
  decreases: readonly StackDecrease[] = [],
): HeldItem[] {
  // フルスタックの消費は、同じフレームに始まった件も切る（区切りの前に入れる）。解除の区切りには同じフレームの始まりが無い
  const effective = [...new Set([...closes.filter((c) => closeTakesEffect(starts, c)), ...consumes])].sort(
    (a, b) => a - b,
  );
  if (effective.length === 0) return build(starts, decreases);
  const out: HeldItem[] = [];
  let lower = -Infinity;
  for (const c of [...effective, Infinity]) {
    const segment = starts.filter((s) => s > lower && s <= c);
    const cuts = decreases.filter((d) => d.frame > lower && d.frame <= c);
    lower = c;
    for (const item of build(segment, cuts)) {
      const cut: HeldItem = { ...item, end: Math.min(item.end, c + 1) };
      if (cut.start < cut.end) pushMerged(out, cut);
    }
  }
  return out;
}

/** 件を時刻の順の列 out の後ろに足す。スタックしない件は、前の件と重なるか接すれば 1 つにする（和集合の上書き延長と同じ見え方） */
function pushMerged(out: HeldItem[], item: HeldItem): void {
  const last = out[out.length - 1];
  if (last !== undefined && last.stack === undefined && item.stack === undefined && item.start <= last.end) {
    last.end = Math.max(last.end, item.end);
    return;
  }
  out.push(item);
}

/**
 * スタック数の条件を満たすか（plan/design-skill-stage3.md 1.4 節）。tracks は、持ち主のその状態の件の列ごとの出どころと、
 * そのフレームに効いている件。N はスタックの段の最大が N 以上、'full' はどれかの件の列の段の最大がその付与の上限に届いている。
 * below は段の最大が below 未満（状態が無ければ 0 段。plan/design-maxwell-om.md 2.2 節）。静的な状態（isStatic）は 1 段
 */
export function stacksHold(
  { stacks, stacksBelow: below }: { stacks?: 'full' | number; stacksBelow?: number },
  isStatic: boolean,
  tracks: readonly { origin: HeldOrigin; items: readonly HeldItem[] }[],
): boolean {
  if (stacks === 'full') {
    return tracks.some(({ origin, items }) => {
      const max = origin.kind === 'state' ? origin.grant.maxStacks : undefined;
      return max !== undefined && items.some((it) => it.stack === max);
    });
  }
  let level = isStatic ? 1 : 0;
  for (const { items } of tracks) for (const it of items) level = Math.max(level, it.stack ?? 1);
  return level >= (stacks ?? 0) && (below === undefined || level < below);
}

/**
 * 件の効いている値。件の scale（perCount の発火のフレームのスタック数・確率のきっかけの付いている確率）を掛けて丸める。値を読む所は
 * 1 パス目も 2 パス目もこれ（か scaledEffect）を通し、件の数で値を数えない
 */
export function valueOf(effect: { value: number }, item: HeldItem): number {
  return item.scale === undefined ? effect.value : chanceValueOf(effect.value, item.scale);
}

/** 件の scale を値に掛けた効果（scale が無ければそのまま） */
export function scaledEffect<E extends { value: number }>(effect: E, item: HeldItem): E {
  return item.scale === undefined ? effect : { ...effect, value: chanceValueOf(effect.value, item.scale) };
}

/**
 * stacksFrom で確率の状態のスタック数を写した件の、段 k の scale を「元のスタック数が
 * k 以上の確率」にする（plan/design-tove-base.md 2.1 節）。件の始まりより前でいちばん新しい写しの確率を使う（写しの維持が重ならない間は、その件を付けた写し）
 */
function scaleLevels(items: readonly HeldItem[], levelScales: ReadonlyMap<number, number[]>): HeldItem[] {
  const keys = [...levelScales.keys()].sort((a, b) => a - b);
  const out: HeldItem[] = [];
  for (const it of items) {
    const key = keys[lowerBound(keys, it.start + 1) - 1];
    const scale = key === undefined ? undefined : levelScales.get(key)![(it.stack ?? 1) - 1];
    if (scale !== undefined && scale > 0) out.push({ ...it, scale });
  }
  return out;
}

/**
 * while の件（plan/design-skill-stage9.md 1.3 節）。効果を出した枠のその状態の件（段 1）のうち、スタックの条件を満たす
 * 段の件（'full' は付与の上限の段、N は N 段以上、条件が無ければ全部）の和で、重なる件と接した件は 1 つにする（和集合の上書き延長と同じ
 * 見え方）。スタックの条件の見方は stacksHold と同じ
 */
export function whileItems(
  own: readonly { origin: HeldOrigin; items: readonly HeldItem[]; chance?: boolean }[],
  stacks: 'full' | number | undefined,
): HeldItem[] {
  // 確率の状態の件の列（chance）は段ごとの期待値の小片なので、条件の段（条件が無ければ
  // 段 1）の小片をそのまま出す（scale はその条件が成り立つ確率。plan/design-tove-base.md 2.1 節）。
  // 確率の状態の付与はその状態の 1 つだけ（skills/parse/crossChecks.ts）
  const chance = own.find((o) => o.chance === true);
  if (chance !== undefined) {
    const max = chance.origin.kind === 'state' ? chance.origin.grant.maxStacks : undefined;
    const level = stacks === undefined ? 1 : stacks === 'full' ? max : stacks;
    return chance.items.filter((it) => it.stack === level);
  }
  const spans: [number, number][] = [];
  for (const { origin, items } of own) {
    const max = origin.kind === 'state' ? origin.grant.maxStacks : undefined;
    for (const it of items) {
      if (it.start >= it.end) continue;
      const holds =
        stacks === undefined || (stacks === 'full' ? max !== undefined && it.stack === max : (it.stack ?? 1) >= stacks);
      if (holds) spans.push([it.start, it.end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: HeldItem[] = [];
  for (const [start, end] of spans) {
    const last = out[out.length - 1];
    if (last !== undefined && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out;
}

/**
 * perCount の timed の件（plan/design-maids.md 2.1 節）。発火ごとに [s, s + 維持) を作り、次の発火で切る（上書き。値は次の
 * 発火のスタック数に替わる）。scale は発火のフレームのスタック数
 */
function perCountItems(
  starts: readonly number[],
  scales: ReadonlyMap<number, number>,
  durationFrames: number,
  frames: number,
): HeldItem[] {
  const out: HeldItem[] = [];
  starts.forEach((start, i) => {
    const next = starts[i + 1];
    const end = Math.min(start + durationFrames, next ?? frames, frames);
    const scale = scales.get(start);
    if (start < end && scale !== undefined && scale > 0) out.push({ start, end, scale });
  });
  return out;
}

/** timed の件。確率のきっかけと強化は呼ぶ側 */
function timedItems(
  effect: ResolvedTimedEffect,
  starts: readonly number[],
  log: ShotLog | null | undefined,
  fullBurstEnds: readonly number[],
  frames: number,
  untilEnds: readonly number[] = [],
): HeldItem[] {
  // HP の割合が閾値を上回るフレームまで（plan/design-mast.md 8 節）
  if (effect.durationUntil === 'selfHpAbove') return itemsOfPairs(untilNextEndItems(starts, untilEnds, frames));
  if (effect.durationShots !== undefined) {
    const shotFrames = log?.frames ?? [];
    // スタックする N 発間維持（plan/design-zwei.md 2.3 節）
    return effect.maxStacks !== undefined
      ? shotCountStackItems(starts, shotFrames, effect.durationShots, frames, effect.maxStacks)
      : itemsOfPairs(shotCountItems(starts, shotFrames, effect.durationShots, frames));
  }
  if (effect.durationUntil === 'ammoSpent') {
    // 和集合は発火のフレームで取り、頭は後で削る
    const trim = weaponStartTrim(effect);
    return untilNextEndItems(starts, log?.weaponChangeEnds ?? [], frames)
      .filter(([start, end]) => start + trim < end)
      .map(([start, end]) => ({ start: start + trim, end }));
  }
  if (effect.durationUntil === 'fullBurstEnd') {
    return itemsOfPairs(untilNextEndItems(starts, fullBurstEnds, frames));
  }
  // 持ち主のリロードの込め終わりまで（plan/design-cinderella-s1-charge.md 1.1 節）。まだ込め終わっていない件は
  // 戦闘の終わりまで開き、1 パス目が込め終わりを書いたら閉じる（読み直しが reloadEnds の長さを見る。trackReadsOf）
  if (effect.durationUntil === 'reloadEnd') {
    return itemsOfPairs(untilNextEndItems(starts, log?.reloadEnds ?? [], frames));
  }
  // 「命中させた味方に」は、持ち主の射撃の記録から始まりを決める（plan/design-killer-wife.md 2.2 節）
  const from =
    effect.holderHitWithinFrames !== undefined
      ? holderHitStarts(starts, log?.frames ?? [], effect.holderHitWithinFrames)
      : starts;
  return effectItems(from, effect, frames).map((w) => {
    const item: HeldItem = { start: w.start, end: w.end };
    if (w.stack !== undefined) item.stack = w.stack;
    return item;
  });
}

/**
 * 件の列の件を作る関数（buildTrackItems）が、始まり・確率の機会・
 * 閉じるフレーム・消費のフレーム・減少のほかに読む入力（plan/design-first-pass-perf.md 3.1 節）。
 * 分かれ道は timedItems・stateItems と同じ。読まない入力の変化では作り直さない
 */
export type TrackReads = {
  shots: boolean;
  weaponChangeEnds: boolean;
  reloadEnds: boolean;
  fullBurstWindows: boolean;
  untilEnds: boolean;
};

export function trackReadsOf(origin: HeldOrigin): TrackReads {
  const reads = { shots: false, weaponChangeEnds: false, reloadEnds: false, fullBurstWindows: false, untilEnds: false };
  if (origin.kind !== 'timed' && origin.kind !== 'state') return reads;
  const item = origin.kind === 'timed' ? origin.effect : origin.grant;
  const { durationShots, durationUntil } = item;
  if (durationShots !== undefined || ('holderHitWithinFrames' in item && item.holderHitWithinFrames !== undefined)) {
    reads.shots = true;
    return reads;
  }
  // ほかの状態の終わりまで続く状態の件（durationUntil は battleEnd に解いてある）は、件の列の untilEnds を読む
  if (origin.kind === 'state' && origin.grant.untilStateEnd !== undefined) {
    reads.untilEnds = true;
    return reads;
  }
  // 尽くす（durationUntil が足されたら型検査で落ちる）。状態の件は fullBurstEnd・reloadEnd のほかを読まない（stateItems）
  switch (durationUntil) {
    case 'ammoSpent':
      reads.weaponChangeEnds = true;
      break;
    case 'reloadEnd':
      reads.reloadEnds = true;
      break;
    case 'fullBurstEnd':
      reads.fullBurstWindows = true;
      break;
    // HP の割合の窓の終わり（件の列の untilEnds）
    case 'selfHpAbove':
      reads.untilEnds = true;
      break;
    case 'battleEnd':
    case undefined:
      break;
    default: {
      const never: never = durationUntil;
      throw new Error(`unknown durationUntil: ${String(never)}`);
    }
  }
  return reads;
}

/** テスト用（verifyItems）: 件を作る関数が読まない入力も見る */
export const ALL_READS: TrackReads = {
  shots: true,
  weaponChangeEnds: true,
  reloadEnds: true,
  fullBurstWindows: true,
  untilEnds: true,
};

/** lengths[i] を n にし、前と違えば true */
export function setLength(lengths: number[], i: number, n: number): boolean {
  if (lengths[i] === n) return false;
  lengths[i] = n;
  return true;
}

/**
 * 件の列（while のほか）の件を、いまの入力から作る。log は持ち主の射撃の記録（敵の件の列は null）。
 * 件は入力（追記・挿入だけで伸びる）と frames だけで決まるので、ループの後の件は、最後の入力から作り直した件と同じになる
 */
export function buildTrackItems(
  track: HeldTrack,
  log: ShotLog | null | undefined,
  fullBurstWindows: readonly FullBurstWindow[],
  frames: number,
  /** 状態の件の列の、最大スタック数▲で上がる上限（無ければ付与の上限） */
  maxStacksAt?: MaxStacksAt,
): HeldItem[] {
  const o = track.origin;
  switch (o.kind) {
    case 'passive':
      return track.starts.length > 0 ? [{ start: 0, end: frames }] : [];
    case 'timed': {
      const ends = fullBurstWindows.map((w) => w.end);
      const items =
        o.effect.perCount !== undefined
          ? perCountItems(track.starts, track.startScales ?? new Map(), o.effect.durationFrames, frames)
          : track.opportunities !== null
            ? chancePieces(track.opportunities, o.effect.durationFrames, frames).map((p) => ({
                start: p.start,
                end: p.end,
                scale: p.scale,
              }))
            : // デバフ解除で閉じた味方の▼は、状態と同じ規則で切る（plan/design-debuff-removal-timed.md 2.4 節）
              closedStateItems(track.starts, track.closes, (starts) =>
                timedItems(o.effect, starts, log, ends, frames, track.untilEnds),
              );
      return o.effect.edgeShift !== undefined ? shiftEdges(items, o.effect.edgeShift, frames) : items;
    }
    case 'state': {
      // 確率のきっかけの付与は、スタック数の分布の期待値の小片（段 k の scale は
      // スタック数が k 以上の確率。plan/design-tove-base.md 2.2 節）
      if (track.opportunities !== null) {
        return chanceStackPieces(track.opportunities, o.grant.durationFrames, frames, o.grant.maxStacks ?? 1);
      }
      const ends = fullBurstWindows.map((w) => w.end);
      const items = closedStateItems(
        track.starts,
        track.closes,
        (starts, decreases) =>
          extendItems(
            starts,
            track.extensions,
            (ss) =>
              stateItems(
                o.grant,
                ss,
                log,
                ends,
                frames,
                track.untilEnds ?? [],
                decreases,
                maxStacksAt,
                track.startDurations,
              ),
            frames,
          ),
        track.consumes,
        track.decreases,
      );
      return track.levelScales === undefined ? items : scaleLevels(items, track.levelScales);
    }
    case 'cycleEvery':
      return itemsOfPairs(unionItems(track.starts, o.effect.durationFrames, frames));
    case 'healWindow':
      return healWindowItems(track.starts, o.effect.durationFrames, frames);
    case 'enemyState': {
      // 付いている間は、最初の発火から最後の tick まで（frame/dot.ts の dotActiveSpans。クルミ S2 編の区間と同じ）。
      // 消去（cancelState）は、解除と同じく c + 1 で切り、後の付与から付き直す
      const { intervalSeconds, durationSeconds, firstTick } = o.effects[0]!.dot!;
      return closedStateItems(track.starts, track.closes, (starts) =>
        itemsOfPairs(
          dotActiveSpans(starts, intervalSeconds, durationSeconds, firstTick).map((sp) => [sp.start, sp.end]),
        ),
      );
    }
    case 'while':
      throw new Error('while items are built from the state items (readWhileItems)');
  }
}

/**
 * 状態の維持の延長を件に当てる（plan/design-mint-prika.md 2.5 節）。延長は発火のフレームの順に、そのフレームまでに始まった件
 * （前の延長も入れる）のうち、そのフレームに付いていて後まで続く件の終わり e から延ばす秒の区間 [e, e + 延長) を足す区間として持ち、最後に
 * 全部の始まりの件と和集合でまとめる。後から付き直した件は延ばさず、付き直しはいまの上書き延長のまま（終わりは max(e + 延長, 付き直しの終わり)）。
 * スタックする件は延ばさない（使い手がいない）。build は始まりの列から件を作る（stateItems）
 */
function extendItems(
  starts: readonly number[],
  extensions: readonly { frame: number; frames: number }[] | undefined,
  build: (starts: readonly number[]) => HeldItem[],
  frames: number,
): HeldItem[] {
  if (extensions === undefined || extensions.length === 0) return build(starts);
  const union = (items: readonly HeldItem[]): HeldItem[] => {
    const out: HeldItem[] = [];
    for (const it of [...items].sort((a, b) => a.start - b.start)) pushMerged(out, { ...it });
    return out;
  };
  const extras: HeldItem[] = [];
  for (const { frame, frames: by } of [...extensions].sort((a, b) => a.frame - b.frame)) {
    const before = union([...build(starts.filter((x) => x <= frame)), ...extras]);
    const on = before.find((it) => it.stack === undefined && it.start <= frame && frame < it.end);
    if (on !== undefined && on.end < frames) extras.push({ start: on.end, end: Math.min(frames, on.end + by) });
  }
  return union([...build(starts), ...extras]);
}

/** 昇順の列 xs に x を入れる（同じ値は後ろ） */
export function insertSorted(xs: number[], x: number): void {
  let i = xs.length;
  while (i > 0 && xs[i - 1]! > x) i--;
  xs.splice(i, 0, x);
}

/** 昇順の列 xs の、x 以下の最後の値（無ければ undefined。末尾から探す） */
export function lastAtOrBefore(xs: readonly number[], x: number): number | undefined {
  let i = xs.length - 1;
  while (i >= 0 && xs[i]! > x) i--;
  return xs[i];
}

/** 段の印の並び（同じフレームの件の並び。段 → 出どころの枠 → 定義の順） */
export const STAGE_RANK: Record<HeldStage, number> = { 1: 0, 1.5: 1, 2: 2, 2.5: 3 };

/** 出どころ × 状態ごとに、時間で変わる状態の付与をまとめる（静的な付与は常時パッシブ） */
export function stateGroupsOf(
  slots: readonly TimelineSlot[],
  firesOf: (
    trigger: ResolvedTrigger,
    slotIndex: number,
    everyAt?: ShotCountEveryAt,
    condition?: EffectCondition,
  ) => TriggerTracker,
  appliedStageOf: (state: NamedStateId) => HeldStage,
): StateGroup[] {
  const groups: StateGroup[] = [];
  slots.forEach((slot, sourceSlotIndex) => {
    if (slot === null || slot.definition === null) return;
    const contents = resolveStateContents(slot.definition, slot.character, slot.levels);
    for (const grant of resolveStateGrants(slot.definition, slot.character, slot.levels)) {
      if (grant.isStatic) continue;
      let group = groups.find((g) => g.sourceSlotIndex === sourceSlotIndex && g.state === grant.state);
      if (group === undefined) {
        group = {
          sourceSlotIndex,
          state: grant.state,
          grants: [],
          contents: contents.filter((c) => c.whileState === grant.state),
          stage: 1,
          tracks: slots.map(() => null),
          enemy: null,
        };
        groups.push(group);
      }
      // { applied } の付与は、見る状態を付ける付与の段（plan/design-skill-stage4.md 1.1 節）
      const stage: HeldStage = isResolvedApplied(grant.trigger)
        ? appliedStageOf(grant.trigger.applied)
        : stageOfGrant(grant);
      group.grants.push({
        grant,
        stage,
        fires: firesOf(grant.trigger, sourceSlotIndex, undefined, grant.condition),
        group,
      });
      if (STAGE_RANK[stage] > STAGE_RANK[group.stage]) group.stage = stage;
    }
  });
  return groups;
}

/** 状態の付与の段（{ applied } のほか）。件を見ない条件（usedBurst だけ）は段を上げない（plan/design-skill-stage1.md 1.5 節） */
function stageOfGrant(grant: ResolvedStateGrant): HeldStage {
  if (dependsOnRank(grant)) return 2;
  // 自分の状態のスタック数を数で読む付与も、件を見るので段 1.5
  return conditionReadsItems(grant.condition) || (grant.stacksFrom !== undefined && 'state' in grant.stacksFrom)
    ? 1.5
    : 1;
}

/**
 * 味方の全部のスタック可能バフへのスタック量▲（plan/design-adjacent-allies.md 2.5 節）が足す先の件の列か: 味方が持つ、上限のある
 * 状態の付与（敵に付く状態・スタック量増減効果無効を除く）か、上限のある timed（確率のきっかけを除く）
 */
export function isStackableBuffTrack(track: HeldTrack): boolean {
  if (track.holder === ENEMY || track.opportunities !== null) return false;
  if (track.origin.kind === 'state') {
    const g = track.origin.grant;
    return g.maxStacks !== undefined && g.enemy !== true && g.stackImmutable !== true;
  }
  return track.origin.kind === 'timed' && track.origin.effect.maxStacks !== undefined;
}

/** スタック量の増加の段（件を見る条件つきは段 1.5） */
export function stageOfStackChange(effect: ResolvedStackChange): HeldStage {
  // 付いている時だけ足す増加は、その状態の件を読む（plan/design-diesel.md 8.1 節）
  return effect.existingOnly === true || conditionReadsItems(effect.condition) ? 1.5 : 1;
}

/**
 * { applied } の効果の段（plan/design-skill-stage4.md 1.1 節）。状態ごとに、その状態を付ける付与とスタック量の増加
 * （編成のどの枠でも。{ applied } のもの・静的な付与を除く）の段のいちばん後。無ければ（静的な状態だけ・付ける効果が無い）段 1
 */
export function appliedStagesOf(slots: readonly TimelineSlot[]): (state: NamedStateId) => HeldStage {
  // { applied } の効果を持つ編成でだけ解く（初めて引かれた時）
  let stages: Map<NamedStateId, HeldStage> | null = null;
  const build = (): Map<NamedStateId, HeldStage> => {
    const out = new Map<NamedStateId, HeldStage>();
    const bump = (state: NamedStateId, stage: HeldStage): void => {
      const now = out.get(state);
      if (now === undefined || STAGE_RANK[stage] > STAGE_RANK[now]) out.set(state, stage);
    };
    let allStackable = false;
    for (const slot of slots) {
      if (slot === null || slot.definition === null) continue;
      for (const grant of resolveStateGrants(slot.definition, slot.character, slot.levels)) {
        if (!grant.isStatic && !isResolvedApplied(grant.trigger)) bump(grant.state, stageOfGrant(grant));
      }
      for (const effect of resolveStackChanges(slot.definition, slot.character, slot.levels)) {
        bump(effect.state, stageOfStackChange(effect));
      }
      // 味方の全部のスタック可能バフへの▲（段 1.5）は、編成のどの上限のある状態にも足しうる（plan/design-adjacent-allies.md 2.5 節）
      if (resolveAllStackableChanges(slot.definition, slot.character, slot.levels).length > 0) allStackable = true;
    }
    if (allStackable) {
      for (const slot of slots) {
        if (slot === null || slot.definition === null) continue;
        for (const grant of resolveStateGrants(slot.definition, slot.character, slot.levels)) {
          if (!grant.isStatic && grant.maxStacks !== undefined && grant.stackImmutable !== true) bump(grant.state, 1.5);
        }
      }
    }
    return out;
  };
  return (state) => (stages ??= build()).get(state) ?? 1;
}

/** timed の効果の段（強化の受け付けと値は、履歴を閉じる時に決める） */
export function stageOfTimed(effect: ResolvedTimedEffect): HeldStage {
  if (effect.amplifies !== undefined) return 2.5;
  // 最終防御力の比べの対象も、順位と同じく段 1・1.5 の件（防御力▲）が出そろってから決める
  if (dependsOnRank(effect) || dependsOnDefense(effect)) return 2;
  // 件を見ない条件（usedBurst だけ）は段を上げない（plan/design-skill-stage1.md 1.5 節）。スタック数を読む perCount も段 1.5
  if (conditionReadsItems(effect.condition) || effect.perCount !== undefined) return 1.5;
  return 1;
}
