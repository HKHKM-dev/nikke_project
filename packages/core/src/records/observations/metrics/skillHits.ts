// 指標: スキルのヒット・持続ダメージ・回復・出来事の時刻と数（plan/design-stage19.md 2.3.1 節）
import {
  activationVideoFrameOf,
  hexagonFrameOf,
  hitFrameOf,
  hitFramesOf,
  videoFrameOf,
} from '../../../burst/schedule.ts';
import { unionRanges } from '../../../frame/events.ts';
import type { SimResult } from '../../../sim/engine.ts';
import { hpRatioStepIndexOf, itemsOf } from '../../../skills/holders.ts';
import { isResolvedShotCount } from '../../../skills/resolve.ts';
import type { NamedStateId } from '../../../skills/states.ts';
import type { CompareSpec } from '../types.ts';
import { firstCount, type Metric, type MetricContext, slotIndexOf, slotOf, withArgs } from './context.ts';

export const skillHitsMetrics: Readonly<Record<string, Metric>> = {
  // skill（'skill1' | 'skill2' | 'burst'）を書けば、そのスロットの倍率ダメージだけを数える（任意）
  skillHitCount: {
    args: ['slot'],
    sim: (r, c) =>
      c.args.skill === undefined
        ? slotOf(r.slots, c).skillHits.frames.length
        : r.skillHits.filter((h) => h.slotIndex === slotIndexOf(c) && h.effect.source.skill === c.args.skill).length,
  },
  healHitCounts: { args: ['slot'], sim: healHitCounts },
  // 枠が出した n 回目（0 始まり）の回復の、録画の動画のフレーム（戦闘開始から（V-0501）。フルバーストの入りの止まりを足す）。
  // 録画では、回復の数字が画面に出たフレームと比べる（戦闘開始時の回復の数字は開始の 2f 後に出る。`0476-12`）
  healVideoFrame: { args: ['slot', 'n'], sim: healVideoFrame },
  // 枠が出した回復のフレームの数（同じフレームの回復は 1 つ）（V-0501）。録画では、回復の数字が出たフレームの数と比べる
  // （同じフレームに 2 つの回復が重なっても数字の出始めは 1 つ）
  healFrameCount: { args: ['slot'], sim: (r, c) => healFramesOf(r, c).length },
  // 枠 windowSlot の HP の割合が下がった窓（最大HP のみ▲ の間など）ごとに、枠が出した回復のうち窓の中で最初に当たったものの対象の枠
  // （1 始まり）の並び。回復の来ない窓は飛ばし、skip・count で切る（V-0752）。録画では、窓の中で最初に HP のバーが伸びた枠。窓は
  // 時刻で録画と対応させない（モデルと録画で窓の数・時刻がずれる）ので、どの窓でも同じ枠になる問いに使う
  windowFirstHealTargets: {
    args: ['slot', 'windowSlot'],
    sim: (r, c) => firstCount(windowFirstHeals(r, c), c, '回復の来た窓'),
    occurrences: (r, c) => windowFirstHeals(r, c).length,
  },
  dotTickOffsets: { args: ['slot', 'n'], sim: dotTickOffsets },
  // 持続ダメージの、付けた時の 1 スタックのヒット（kind apply）か、スタックの tick（kind tick）の、録画の
  // 動画のフレーム（戦闘開始から）の頭の count 個（V-0546）
  dotHitVideoFrames: { args: ['slot', 'kind', 'count'], sim: dotHitVideoFrames },
  skillHitVideoFrame: {
    args: ['slot', 'skill', 'n'],
    sim: (r, c) => skillHitVideoFrames(r, c)[Number(c.args.n)] ?? NaN,
  },
  // skillHitVideoFrame の頭の count 個の列（キャプチャーチェーンの 10 回の攻撃）（V-0546）
  skillHitVideoFrameList: {
    args: ['slot', 'skill', 'count'],
    sim: (r, c) => eventFrames(r, withArgs(c, { event: 'skillHit' })),
  },
  skillHitMeanInterval: { args: ['slot', 'skill'], sim: skillHitMeanInterval },
  skillHitShotIndices: { args: ['slot', 'skill', 'count'], sim: skillHitShotIndices },
  // V-0616: 倍率ダメージの回の間の通常攻撃の命中の期待値の和（回数トリガーを命中で数えるか撃った数で数えるか）
  skillHitNormalHits: { args: ['slot', 'skill'], sim: skillHitNormalHits },
  skillHitShotDelay: { args: ['slot', 'skill'], sim: skillHitShotDelay },
  skillHitBurstOrdinals: { args: ['slot', 'skill'], sim: skillHitBurstOrdinals },
  // 倍率ダメージの、同じ回のバーストのヒットからの動画のフレーム数（V-0532）
  skillHitFromBurstHit: { args: ['slot', 'skill', 'count'], sim: skillHitFromBurstHit },
  // 効果の倍率ダメージの、n 回目のフルバーストの 00.00 からの動画のフレーム数（V-0537）
  skillHitFramesFromFullBurst: {
    args: ['slot', 'skill', 'fullBurst', 'count'],
    sim: skillHitFramesFromFullBurst,
  },
  // 簡素化・第 7 回の案 2: 出来事の動画のフレームの、基準からの差の列（eventFrames の注記）。上の skillHit…・dot…・healVideoFrame の
  // 時刻の指標はこれの包み
  eventFrames: { args: ['slot', 'event'], sim: eventFrames },
  // eventFrames と同じ出来事・基準・範囲の、出来事の数（B モードの間の現在の HP▼ の回数など）（V-0729）
  eventCount: { args: ['slot', 'event'], sim: (r, c) => eventFrames(r, c).length },
  // V-0622: 出来事ごとの、戦闘の始めからの枠の発の数か命中の期待値の和（回数のきっかけを通して数えるか、撃った数か命中か）
  eventTallies: { args: ['slot', 'event', 'tally'], sim: eventTallies },
};

/** 枠が出した回復のフレーム（同じフレームの対象ごとの記録・ほかの効果の回復は 1 つにまとめる）の昇順（V-0501） */
function healFramesOf(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const frames = result.history.heals.filter((h) => h.sourceSlotIndex === slotIndex).map((h) => h.frame);
  return [...new Set(frames)].sort((a, b) => a - b);
}

/**
 * 枠 windowSlot の HP の割合が下がった窓ごとの、枠が出した最初の回復の対象の枠（1 始まり）。窓は HP の割合の段（history.hpRatios）の、
 * 割合の下がった段から次に上がる段の前まで（割合が 1 に戻らない間の窓も分ける）。回復は当たったフレームの段で窓に入れる。窓の最初の回復の
 * フレームに対象が 2 機以上あれば誤り（V-0752）
 */
function windowFirstHeals(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const steps = result.history.hpRatios[Number(ctx.args.windowSlot) - 1];
  if (steps === undefined) throw new Error(`枠 ${String(ctx.args.windowSlot)} が無い`);
  // 段ごとの窓の番号（割合の下がった段の番号。同じ割合の段は前の段の番号、上がった段と先頭の段は -1）
  const windowOf: number[] = [];
  steps.ratios.forEach((ratio, k) => {
    const prev = steps.ratios[k - 1] ?? Infinity;
    windowOf.push(ratio < prev && k > 0 ? k : ratio === prev ? windowOf[k - 1]! : -1);
  });
  const heals = result.history.heals.filter((h) => h.sourceSlotIndex === slotIndex).sort((a, b) => a.frame - b.frame);
  // 回復はフレームの順なので、同じ窓の回復は続けて来る
  const targets: number[] = [];
  let last = -1;
  heals.forEach((h, i) => {
    const window = windowOf[hpRatioStepIndexOf(steps, h.frame)] ?? -1;
    if (window < 0 || window === last) return;
    if (heals[i + 1]?.frame === h.frame)
      throw new Error(`枠 ${String(ctx.args.slot)} の f${h.frame} の回復は対象が 2 機以上`);
    last = window;
    targets.push(h.slotIndex + 1);
  });
  return targets;
}

/** 枠が出した n 回目（0 始まり）の回復のフレームを、動画のフレームにする（V-0501） */
function healVideoFrame(result: SimResult, ctx: MetricContext): number {
  const frame = eventFrames(result, withArgs(ctx, { event: 'heal' }))[Number(ctx.args.n)];
  if (frame === undefined) throw new Error(`枠 ${String(ctx.args.slot)} の ${String(ctx.args.n)} 回目の回復が無い`);
  return frame;
}

/**
 * その枠が出した回復（heal）ごとに、前の回復（初回は戦闘の始め）からその回復までに撃った通常攻撃の
 * 当たる数の期待値（発ごとの区間の弾丸命中率の和）（V-0178）。録画の総ダメージの増分から数えたヒット数と比べる
 */
function healHitCounts(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const slot = slotOf(result.slots, ctx);
  const frames = slotOf(result.shots, ctx).frames;
  const heals = result.history.heals.filter((h) => h.sourceSlotIndex === slotIndex).map((h) => h.frame);
  const starts = [...new Set(heals)].sort((a, b) => a - b);
  let from = 0;
  return starts.map((to) => {
    let hits = 0;
    for (const f of frames) {
      if (f < from || f >= to) continue;
      const segment = slot.segments.find((s) => s.start <= f && f < s.end);
      if (!segment) throw new Error(`フレーム ${f} の区間が無い`);
      hits += segment.trigger.hitRate;
    }
    from = to;
    return Math.round(hits * 100) / 100;
  });
}

/** eventFrames の出来事（モデルのフレームと、録画の動画のフレーム） */
type EventPoint = { frame: number; video: number; opened?: number };

/** eventFrames の event: 枠の出来事の列（時刻の順） */
function eventPointsOf(result: SimResult, ctx: MetricContext): EventPoint[] {
  const slotIndex = slotIndexOf(ctx);
  const schedule = result.schedule;
  const at = (frame: number): EventPoint => ({ frame, video: videoFrameOf(schedule, frame) });
  const mine = () => (schedule?.activations ?? []).filter((a) => a.slotIndex === slotIndex);
  const hits = (keep: (h: SimResult['skillHits'][number]) => boolean) =>
    result.skillHits
      .filter((h) => h.slotIndex === slotIndex && keep(h) && hitMatches(h, ctx))
      .map((h) => (h.accumulate === undefined ? at(h.frame) : { ...at(h.frame), opened: h.accumulate.opened }));
  switch (ctx.args.event) {
    case 'skillHit':
      return hits((h) => h.effect.dot === undefined);
    case 'dot':
      return hits((h) => h.effect.dot !== undefined);
    case 'dotApply':
      return hits((h) => dotKindMatches(h, 'apply'));
    case 'dotTick':
      return hits((h) => dotKindMatches(h, 'tick'));
    case 'burstHit':
      return mine().flatMap((a) => hitFramesOf(a).map(at));
    case 'activation':
      return mine().map((a) => ({ frame: a.frame, video: activationVideoFrameOf(schedule!, a) }));
    case 'heal':
      return healFramesOf(result, ctx).map(at);
    // 状態（引数 state）が外れたフレーム
    case 'stateEnd':
      return stateEndFramesOf(result, slotIndex, String(ctx.args.state)).map(at);
    // 枠の自分への現在の HP▼ のフレーム（録画では、枠の HP のバーが下がったフレーム）（V-0729）
    case 'currentHpDown':
      return result.instants
        .filter((x) => x.slotIndex === slotIndex && x.effect.kind === 'currentHpDown')
        .map((x) => at(x.frame));
    // V-0742: 枠の通常攻撃の発（録画では、照準の左か枠アイコンの上の残弾が減ったフレーム）
    case 'shot':
      return slotOf(result.shots, ctx).frames.map(at);
    default:
      throw new Error(
        `event は skillHit・dot・dotApply・dotTick・burstHit・activation・heal・stateEnd・currentHpDown・shot（${String(ctx.args.event)}）`,
      );
  }
}

/**
 * 簡素化・第 7 回の案 2（plan/design-workflow-simplification-7.md 2 節）: 枠の出来事（event）の録画の動画のフレームを、基準（anchor）からの
 * 差の列にする（フルバーストの入りの止まりを含む）。新しい「時刻の列」の比べは、指標を足さずにこれの引数で書く。
 * - anchor: start（戦闘の始まり。省略時）・fullBurst:<n>（n 回目のフルバーストの窓の始まり。III のタイマーの 00.00）・activation:<n>
 *   （枠の n 回目の発動。起点は activationVideoFrameOf）・prevBurstHit（出来事ごとに、その前の最後の自分のバーストの 1 ヒット目）・prevShot
 *   （出来事ごとに、その前の最後の自分の発。同じフレームの発を含む）・accumulateOpened（蓄積して爆発するダメージの爆発ごとに、その窓を
 *   開けた（付けた）フレーム。plan/design-accumulate-explosion.md 3.2 節）
 * - within: window（フルバーストの窓の中）・afterWindow（窓の終わりから次の窓の始まりまで）・untilNext（基準から次の同じ基準まで）。
 *   省略すると基準から終わりまで（start は全部）
 * - skill・projectile・trigger は倍率ダメージと持続ダメージを hitMatches で絞る。skip の数だけ頭を飛ばし、count 個を返す（足りなければ誤り）
 */
function eventFrames(result: SimResult, ctx: MetricContext): number[] {
  const points = eventPointsOf(result, ctx);
  const anchor = String(ctx.args.anchor ?? 'start');
  const within = ctx.args.within;
  const schedule = result.schedule;
  let offsets: number[];
  if (anchor === 'accumulateOpened') {
    if (within !== undefined) throw new Error(`anchor ${anchor} に within は使えない`);
    offsets = points.map((p) => {
      if (p.opened === undefined) throw new Error(`フレーム ${p.frame} の出来事は蓄積の爆発でない`);
      return p.video - videoFrameOf(schedule, p.opened);
    });
  } else if (anchor === 'start' || anchor === 'prevBurstHit' || anchor === 'prevShot') {
    if (within !== undefined) throw new Error(`anchor ${anchor} に within は使えない`);
    if (anchor === 'start') offsets = points.map((p) => p.video);
    else {
      // 出来事ごとに、その前の最後の基準のフレーム（自分の発か、自分のバーストの 1 ヒット目）からの差
      let bases: readonly number[];
      let label: string;
      if (anchor === 'prevShot') {
        bases = slotOf(result.shots, ctx).frames;
        label = '発';
      } else {
        if (schedule === null) throw new Error('バーストの時刻表が無い');
        bases = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx)).map((a) => hitFrameOf(a));
        label = 'バーストのヒット';
      }
      offsets = points.map((p) => {
        const base = bases.filter((f) => f <= p.frame).at(-1);
        if (base === undefined) throw new Error(`フレーム ${p.frame} の出来事の前に${label}が無い`);
        return p.video - videoFrameOf(schedule, base);
      });
    }
  } else {
    // 基準の発動を別の枠（from）から取る（その枠の発動から、この枠の出来事まで）
    const span = spanOf(result, withArgs(ctx, { slot: ctx.args.from ?? ctx.args.slot }), anchor, within);
    offsets = pointsIn(points, span).map((p) => p.video - span.base);
  }
  return firstCount(offsets, ctx, `出来事（${String(ctx.args.event)}）`).map((v) => phaseOf(v, ctx));
}

/** spanOf の範囲 [from, to) に入る出来事 */
function pointsIn(points: EventPoint[], span: { from: number; to: number }): EventPoint[] {
  return points.filter((p) => span.from <= p.frame && p.frame < span.to);
}

/**
 * V-0622: 出来事（eventFrames の event・skill・anchor・within で絞る。anchor は start・fullBurst:<n>・activation:<n>）ごとに、戦闘の始めから
 * その出来事まで（同じフレームの発を含む）の枠の発の数（tally: shots）か、通常攻撃の命中の期待値の和（tally: hits。発ごとの弾丸命中率）。
 * modulo を書くと、その数で割った余りを (-modulo/2, modulo/2] に寄せた値（回数のきっかけの、通しの数の位相）。skip・count で絞る。録画では、
 * 照準の左の残弾の減りで数えた発と、HUD の増分で拾った外れから数える
 */
function eventTallies(result: SimResult, ctx: MetricContext): number[] {
  const tally = ctx.args.tally;
  if (tally !== 'shots' && tally !== 'hits') throw new Error(`tally は shots・hits（${String(tally)}）`);
  const anchor = String(ctx.args.anchor ?? 'start');
  let points = eventPointsOf(result, ctx);
  if (anchor === 'start') {
    if (ctx.args.within !== undefined) throw new Error('anchor start に within は使えない');
  } else points = pointsIn(points, spanOf(result, ctx, anchor, ctx.args.within));
  const log = slotOf(result.shots, ctx);
  const weight = (k: number) => (tally === 'shots' ? 1 : (log.hits?.[k] ?? 1));
  return firstCount(points, ctx, `出来事（${String(ctx.args.event)}）`).map((p) =>
    phaseOf(
      log.frames.reduce((s, f, k) => (f <= p.frame ? s + weight(k) : s), 0),
      ctx,
    ),
  );
}

/** 引数 modulo があれば、値をその数で割った余りを (-modulo/2, modulo/2] に寄せた値（位相）にする。無ければそのまま */
function phaseOf(value: number, ctx: MetricContext): number {
  if (ctx.args.modulo === undefined) return value;
  const modulo = Number(ctx.args.modulo);
  const r = ((value % modulo) + modulo) % modulo;
  return r > modulo / 2 ? r - modulo : r;
}

/**
 * 枠 slotIndex の状態 state が外れたフレーム（効いていたのが、そのフレームから効いて
 * いない。続く件をつないだ塊の終わり。昇順。plan/design-debuff-removal.md 7.3 節）。戦闘の終わりで切れた塊は入れない
 */
function stateEndFramesOf(result: SimResult, slotIndex: number, state: string): number[] {
  const items = itemsOf(result.history, { holder: slotIndex, state: state as NamedStateId });
  return unionRanges(items)
    .map((r) => r.end)
    .filter((f) => f < result.frames);
}

/** eventFrames の基準（fullBurst:<n>・activation:<n>）の、動画のフレームと、数える範囲（モデルのフレーム） */
export function spanOf(
  result: SimResult,
  ctx: MetricContext,
  anchor: string,
  within: CompareSpec['args'][string] | undefined,
): { base: number; origin: number; from: number; to: number } {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const m = /^(fullBurst|activation):(\d+)$/.exec(anchor);
  if (m === null)
    throw new Error(`anchor は start・fullBurst:<n>・activation:<n>・prevBurstHit・prevShot（${anchor}）`);
  const n = Number(m[2]);
  // origin は起点のモデルのフレーム（フルバーストは窓の始まり、発動は hexagonFrameOf）、base はその動画のフレーム
  const span = (origin: number, from: number, to: number) => ({
    base: videoFrameOf(schedule, origin),
    origin,
    from,
    to,
  });
  if (m[1] === 'fullBurst') {
    const window = schedule.fullBurstWindows[n];
    if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
    const next = schedule.fullBurstWindows[n + 1]?.start ?? Number.POSITIVE_INFINITY;
    if (within === 'window') return span(window.start, window.start, window.end);
    if (within === 'afterWindow') return span(window.start, window.end, next);
    if (within === 'untilNext') return span(window.start, window.start, next);
    if (within === undefined) return span(window.start, window.start, Number.POSITIVE_INFINITY);
    throw new Error(`within は window・afterWindow・untilNext（${String(within)}）`);
  }
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndexOf(ctx));
  const activation = mine[n];
  if (activation === undefined) throw new Error(`${n} 回目の発動が無い`);
  const origin = hexagonFrameOf(activation);
  if (within === 'untilNext') return span(origin, activation.frame, mine[n + 1]?.frame ?? Number.POSITIVE_INFINITY);
  if (within === undefined) return span(origin, activation.frame, Number.POSITIVE_INFINITY);
  throw new Error(`activation の within は untilNext だけ（${String(within)}）`);
}

/**
 * V-0268: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の発動の、録画の動画のフレーム（戦闘開始から。フルバーストの入りの
 * 止まりを足す）の列
 */
function skillHitVideoFrames(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: 'skillHit', count: undefined }));
}

/**
 * 倍率ダメージの発動を、省略できる引数で絞る（V-0537）。skill = スロット、projectile = 発射体の付着（stick）か
 * 爆発（explosion）のヒット、trigger = きっかけがフルバーストの始まり（fullBurstStart）か射撃の回数（shotCount）。効果の番号では
 * 絞らない（編成の条件と最小構成の検査が効果を外すと、番号がずれる）。percent = 1 ヒットの
 * 倍率（%。説明文の値）。同じスロットの 2 つの持続ダメージ（バーストの 18.43% と 181.2%）を分ける（V-0703）
 */
export function hitMatches(h: SimResult['skillHits'][number], ctx: MetricContext): boolean {
  if (ctx.args.skill !== undefined && h.effect.source.skill !== ctx.args.skill) return false;
  if (ctx.args.percent !== undefined) {
    const percent = Number(ctx.args.percent);
    if (!Number.isFinite(percent)) throw new Error(`percent は数: ${String(ctx.args.percent)}`);
    if (Math.abs(h.effect.multiplier * 100 - percent) > 1e-6) return false;
  }
  if (ctx.args.projectile === 'stick' && h.effect.projectileStick !== true) return false;
  if (ctx.args.projectile === 'explosion' && h.effect.projectileExplosion !== true) return false;
  if (ctx.args.trigger === 'fullBurstStart' && h.effect.trigger !== 'fullBurstStart') return false;
  if (ctx.args.trigger === 'shotCount' && !isResolvedShotCount(h.effect.trigger)) return false;
  // 蓄積爆破（plan/design-accumulate-explosion.md 3.2 節）: 最大量に届いた爆発（cap）か、切れた時の爆発（expire）
  if (ctx.args.release === 'cap' && h.accumulate?.capped !== true) return false;
  if (ctx.args.release === 'expire' && (h.accumulate === undefined || h.accumulate.capped === true)) return false;
  return true;
}

/**
 * 枠の倍率ダメージ（hitMatches の絞り（V-0537）。skill は要る）のうち、fullBurst 回目（0 始まり）の
 * フルバーストの窓の中のものの、窓の始まり（III のタイマーの 00.00）からの動画のフレーム数（入りの止まりを挟む）の列。省略できる引数
 * skip の数だけ先頭を飛ばし、count 個を返す（録画では、入りの止まりの後の最初の増分に合わさるヒットは時刻が読めないので飛ばす）
 */
function skillHitFramesFromFullBurst(result: SimResult, ctx: MetricContext): number[] {
  // after が true なら、窓の後（次のフルバーストの窓の始まりまで）のヒット（V-0547）。kind が apply・tick なら、
  // 倍率ダメージの代わりに持続ダメージの付けた時のヒット・tick（フルバーストの終わりのキャプチャーチェーンの攻撃とチェーンバインド）
  const event = ctx.args.kind === undefined ? 'skillHit' : dotEventOf(ctx);
  const picked = eventFrames(
    result,
    withArgs(ctx, {
      event,
      anchor: `fullBurst:${String(ctx.args.fullBurst)}`,
      within: ctx.args.after === true ? 'afterWindow' : 'window',
    }),
  );
  // relative が true なら、返す最初のヒットからのフレーム数（S2 のスタック量▲の間隔（V-0548）。数え始めの位相に依らない）
  return ctx.args.relative === true ? picked.map((f) => f - picked[0]!) : picked;
}

/** 枠のスロット skill（ctx.args.skill）の倍率ダメージのヒット（持続ダメージを除く。時刻の順） */
export function slotSkillHits(result: SimResult, ctx: MetricContext): SimResult['skillHits'] {
  const slotIndex = slotIndexOf(ctx);
  return result.skillHits.filter(
    (h) => h.slotIndex === slotIndex && h.effect.source.skill === ctx.args.skill && h.effect.dot === undefined,
  );
}

/**
 * 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の最初の count 回が、
 * それぞれ枠の何発目（1 始まり。同じフレームの発を含む）の射撃で出たか（plan/design-pellet-hit.md 4 節。V-0374）。
 * 録画では、ヒットの直前の発の番号（撃った順）と比べる。skip（V-0616）の数だけ頭の回を飛ばす
 */
function skillHitShotIndices(result: SimResult, ctx: MetricContext): number[] {
  const shots = slotOf(result.shots, ctx).frames;
  return firstCount(slotSkillHits(result, ctx), ctx, '発動').map((h) => shots.filter((f) => f <= h.frame).length);
}

/**
 * V-0616: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の回ごとに、前の回の後からその回まで（その回と同じフレームの発を含む）の
 * 枠の通常攻撃の命中の期待値の和（発ごとの弾丸命中率。1 回目は戦闘の始めから）。skip・count で回を絞る。録画では、その間の HUD の増分
 * （1 増分 1 ヒット。読めない間の無い回だけ）の数と比べる。命中で数える回数トリガーなら、外れの多い区間でも N の前後になる
 */
function skillHitNormalHits(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const frames = slotSkillHits(result, ctx).map((h) => h.frame);
  const sums = frames.map((frame, i) => {
    const from = i === 0 ? Number.NEGATIVE_INFINITY : frames[i - 1]!;
    return log.frames.reduce((sum, f, k) => (from < f && f <= frame ? sum + (log.hits?.[k] ?? 1) : sum), 0);
  });
  return firstCount(sums, ctx, '発動');
}

/**
 * 枠のスロット skill の倍率ダメージ（持続ダメージを除く）のヒットが、その枠の直前の
 * 発（ヒットと同じフレームの発を含む）の何フレーム後に出たかの最頻値（同じ数なら小さいほう）（V-0505・V-0506）。録画では、きっかけの発の HUD の増分から
 * ヒットの増分までのフレーム数の最頻値と比べる
 */
function skillHitShotDelay(result: SimResult, ctx: MetricContext): number {
  const shots = slotOf(result.shots, ctx).frames;
  const counts = new Map<number, number>();
  for (const h of slotSkillHits(result, ctx)) {
    const shot = shots.filter((f) => f <= h.frame).at(-1);
    if (shot === undefined) continue;
    counts.set(h.frame - shot, (counts.get(h.frame - shot) ?? 0) + 1);
  }
  if (counts.size === 0) throw new Error('発動が無い');
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
}

/**
 * 枠のスロット skill の倍率ダメージ（持続ダメージを除く）の最初の count 回の、その前の最後の自分の
 * バーストのヒット（分かれたヒットは 1 ヒット目）からの動画のフレーム数（フルバーストの入りの止まりを含む）（V-0532）。録画では、バーストのヒットの
 * HUD の増分から倍率ダメージの増分までのフレーム数と比べる（ラプラス：アルティメットヒーローのバーストの追加ダメージ）
 */
function skillHitFromBurstHit(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: 'skillHit', anchor: 'prevBurstHit' }));
}

/**
 * V-0432: 枠のスロット skill の倍率ダメージ（持続ダメージを除く）が出た、枠の何回目（1 始まり）のバーストか（昇順・重ねない）。
 * 発動から次の自分の発動の前までに出たヒットを、その回に数える。1 回のバーストで何ヒット出るかは問わない
 */
function skillHitBurstOrdinals(result: SimResult, ctx: MetricContext): number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const mine = schedule.activations.filter((a) => a.slotIndex === slotIndex).map((a) => a.frame);
  const hits = slotSkillHits(result, ctx);
  const ordinals = new Set<number>();
  for (const h of hits) {
    const n = mine.filter((f) => f <= h.frame).length;
    if (n > 0) ordinals.add(n);
  }
  return [...ordinals].sort((a, b) => a - b);
}

/** V-0268: skillHitVideoFrames の 1 回目から最後までの動画のフレーム数 ÷ (回数 − 1)（発動の間隔の平均） */
function skillHitMeanInterval(result: SimResult, ctx: MetricContext): number {
  const frames = skillHitVideoFrames(result, ctx);
  if (frames.length < 2) throw new Error('発動が 2 回に満たない');
  return (frames.at(-1)! - frames[0]!) / (frames.length - 1);
}

/** 引数 kind（持続ダメージの付けた時のヒット apply か tick）と、ヒットがそれか */
function dotKindOf(ctx: MetricContext): 'apply' | 'tick' {
  const kind = ctx.args.kind;
  if (kind !== 'apply' && kind !== 'tick') throw new Error(`kind は apply か tick（${String(kind)}）`);
  return kind;
}

/** 引数 kind に当たる eventFrames の event */
const dotEventOf = (ctx: MetricContext) => (dotKindOf(ctx) === 'apply' ? 'dotApply' : 'dotTick');

function dotKindMatches(h: SimResult['skillHits'][number], kind: 'apply' | 'tick'): boolean {
  return h.effect.dot !== undefined && (h.onApply === true) === (kind === 'apply');
}

/** dotHitVideoFrames（V-0546）。付けた時のヒットは onApply の印（frame/plan.ts の planSkillHits） */
function dotHitVideoFrames(result: SimResult, ctx: MetricContext): number[] {
  return eventFrames(result, withArgs(ctx, { event: dotEventOf(ctx) }));
}

/**
 * 枠の n 回目（0 始まり）のバーストの発動から、その発動の後に出た
 * バーストのスロットの持続ダメージの tick（次の発動の前まで）までの動画のフレーム数の列（フルバーストの入りの止まりを
 * 含む。起点は activationVideoFrameOf。plan/design-sustained-damage-up.md 5.1 節）
 */
function dotTickOffsets(result: SimResult, ctx: MetricContext): number[] {
  const n = String(ctx.args.n);
  const frames = eventFrames(
    result,
    withArgs(ctx, { event: 'dot', skill: 'burst', anchor: `activation:${n}`, within: 'untilNext' }),
  );
  if (frames.length === 0) throw new Error(`${n} 回目の発動の後に持続ダメージの tick が無い`);
  return frames;
}
