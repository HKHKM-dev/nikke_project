// 指標: バフの区間・状態のスタック・確率（plan/design-stage19.md 2.3.1 節）
import {
  activationFramesOfSlot,
  effectFrameOf,
  FULL_BURST_AFTER_ACTIVATION_FRAMES,
  videoFrameOf,
} from '../../../burst/schedule.ts';
import type { SimResult } from '../../../sim/engine.ts';
import { type ChanceOpportunity, chanceScaleAt } from '../../../skills/chance.ts';
import { itemsOf, type ValuePiece, valuePiecesOf } from '../../../skills/holders.ts';
import { isResolvedChance, resolveTimed } from '../../../skills/resolve.ts';
import type { NamedStateId } from '../../../skills/states.ts';
import { isStateStat } from '../../../skills/types.ts';
import {
  firstCount,
  type Metric,
  type MetricContext,
  nthActivationOf,
  slotIndexOf,
  slotOf,
  withArgs,
} from './context.ts';
import { shotFramesIn } from './firing.ts';
import { spanOf } from './skillHits.ts';

export const buffsMetrics: Readonly<Record<string, Metric>> = {
  buffWindowEnds: { args: ['slot', 'skill', 'stat'], sim: buffWindowEnds },
  buffWindowStarts: { args: ['slot', 'skill', 'stat'], sim: buffWindowStarts },
  buffFireStarts: { args: ['slot', 'skill', 'stat'], sim: buffFireStarts },
  buffWindowStartIntervalMean: { args: ['slot', 'skill', 'stat', 'count'], sim: buffWindowStartIntervalMean },
  buffWindowShotIntervalMean: {
    args: ['slot', 'skill', 'stat', 'inside'],
    sim: buffWindowShotIntervalMean,
  },
  buffWindowEndFromFullBurstEnd: { args: ['slot', 'skill', 'stat', 'n'], sim: buffWindowEndFromFullBurstEnd },
  buffEdgeFromShot: { args: ['slot', 'skill', 'stat', 'from', 'shot', 'edge'], sim: buffEdgeFromShot },
  buffEdgeFromActivation: { args: ['slot', 'skill', 'stat', 'from', 'n', 'edge'], sim: buffEdgeFromActivation },
  chanceActiveRatio: { args: ['slot', 'skill'], sim: chanceActiveRatio },
  chanceExpiries: { args: ['slot', 'skill'], sim: chanceExpiries },
  // スタック数の条件で付いたか・スタック量の減少・フルバースト中の数え方（ソーダ：トゥインクルバニーのバースト。V-0437）
  burstBuffApplied: { args: ['slot', 'skill', 'stat'], sim: burstBuffApplied },
  // フルバーストで、枠に効果（対象が最終防御力の比べで決まる発射体爆発ダメージ▲ など）が付いたか（V-0452）
  fullBurstBuffApplied: { args: ['slot', 'skill', 'stat', 'n'], sim: fullBurstBuffApplied },
  stateStackDrops: { args: ['slot', 'state'], sim: stateStackDrops },
  // カウンタの値・状態が付いた回・フルバーストの終わりのスタック数（V-0503）
  counterAtBursts: { args: ['slot', 'counter'], sim: counterAtBursts },
  stateAppliedAtBursts: { args: ['slot', 'state'], sim: stateAppliedAtBursts },
  stateStacksAtFullBurstEnds: { args: ['slot', 'state'], sim: stateStacksAtFullBurstEnds },
  fullBurstStackGainResidues: { args: ['slot', 'state', 'every'], sim: fullBurstStackGainResidues },
};

/**
 * 効果の窓の指標が読む、区間に足す値の小片（状態だけの stat を除く。指標の名前の「窓」は観測値のファイルが参照しているので
 * 変えない。plan/design-holder-effects.md 2.10 節）
 */
function buffPiecesOf(result: SimResult): ValuePiece[] {
  return valuePiecesOf(result.history).filter((p) => !isStateStat(p.effect.stat));
}

/**
 * 枠（引数 slot）が受ける効果の小片のうち、引数 skill（スロット）と stat の効果のもの。省略できる引数 effect（スロットの
 * effects の添字）があれば、その効果（状態の付与なら、その付与の中身）だけ（同じスロット・stat の過熱I と過熱II を分ける。V-0735）
 */
function buffPiecesFor(result: SimResult, ctx: MetricContext): ValuePiece[] {
  const slotIndex = slotIndexOf(ctx);
  const effect = ctx.args.effect === undefined ? undefined : Number(ctx.args.effect);
  return buffPiecesOf(result).filter(
    (w) =>
      w.slotIndex === slotIndex &&
      w.effect.source.skill === ctx.args.skill &&
      w.effect.stat === ctx.args.stat &&
      (effect === undefined || w.effect.effectIndex === effect),
  );
}

/**
 * 5-2 の撮影計画（V-0177）: その枠が受ける timed の効果の窓の終わり（モデルのフレーム。戦闘時間で切った窓は戦闘の終わり）。
 * skill（'skill1' | 'skill2' | 'burst'）と stat で絞る。count を書くと、昇順で重複なしの最初の count 個（戦闘開始時の窓と
 * フルバースト終了時の窓のように同じスロット・stat の窓が続くとき、録画で読めた最初の切れ目にそろえる。V-0678）
 */
function buffWindowEnds(result: SimResult, ctx: MetricContext): number[] {
  const ends = buffPiecesFor(result, ctx).map((w) => w.end);
  if (ctx.args.count === undefined) return ends;
  return [...new Set(ends)].sort((a, b) => a - b).slice(0, Number(ctx.args.count));
}

/**
 * その枠が受ける timed の効果の窓の始まり（モデルのフレーム。昇順・重複なし。V-0240）。skill と stat で絞る。
 * count を書くと最初の count 個（録画で読めた回数にそろえる）。video が true なら動画のフレーム（フルバーストの入りの止まりを
 * videoFrameOf で足す。戦闘開始からの数）
 */
function buffWindowStarts(result: SimResult, ctx: MetricContext): number[] {
  const starts = [...new Set(buffPiecesFor(result, ctx).map((w) => w.start))]
    .sort((a, b) => a - b)
    .map((f) => (ctx.args.video === true ? videoFrameOf(result.schedule, f) : f));
  return ctx.args.count === undefined ? starts : starts.slice(0, Number(ctx.args.count));
}

/**
 * その枠が受ける timed の効果の、発火ごとの件の始まり（モデルのフレーム。昇順。skill と stat で絞る。plan/design-centi.md）。
 * buffWindowStarts（値の小片の始まり）と違い、スタックが上限のまま付き直した発火も入る（CT ごとのアクティブの発動を全部数える）。
 * count・video は buffWindowStarts と同じ
 */
function buffFireStarts(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const starts = result.history.tracks
    .filter(
      (t) =>
        t.holder === slotIndex &&
        t.origin.kind === 'timed' &&
        t.origin.effect.source.skill === ctx.args.skill &&
        t.origin.effect.stat === ctx.args.stat,
    )
    .flatMap((t) => t.starts);
  const sorted = [...new Set(starts)]
    .sort((a, b) => a - b)
    .map((f) => (ctx.args.video === true ? videoFrameOf(result.schedule, f) : f));
  return ctx.args.count === undefined ? sorted : sorted.slice(0, Number(ctx.args.count));
}

/**
 * その枠が受ける timed の効果の窓の始まり（モデルのフレーム。skill と stat で絞る。V-0599）の、最初の count 個の
 * 隣どうしの間隔の平均（(count 個目 − 1 個目) ÷ (count − 1)）。CT ごとのアクティブの周期を、録画で読めた回数の窓の始まりと比べる
 */
function buffWindowStartIntervalMean(result: SimResult, ctx: MetricContext): number {
  const count = Number(ctx.args.count);
  if (!Number.isInteger(count) || count < 2) throw new Error(`count は 2 以上の整数（${String(ctx.args.count)}）`);
  const starts = firstCount(
    buffWindowStarts(result, withArgs(ctx, { video: false, count: undefined })),
    ctx,
    '窓の始まり',
  );
  return (starts.at(-1)! - starts[0]!) / (count - 1);
}

/**
 * 枠の、受けた効果（skill と stat で絞る）の窓の中（inside: true）か外（inside: false）の、連続した
 * 2 発の間の平均（両方の発が同じ側のものだけ。V-0510）。minGap より短い間と maxGap より長い間（リロード・的のジャンプ・フルバーストの入りの
 * 止まりを挟む間）は除く。録画とモデルで発の時刻をそろえずに、チャージ速度▲などの射撃の速さの▲の効きを比べる
 */
function buffWindowShotIntervalMean(result: SimResult, ctx: MetricContext): number {
  const windows = buffPiecesFor(result, ctx);
  if (windows.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} に ${String(ctx.args.stat)} の窓が無い`);
  const inside = (f: number) => windows.some((w) => w.start <= f && f < w.end);
  const want = ctx.args.inside === true;
  const minGap = ctx.args.minGap === undefined ? 0 : Number(ctx.args.minGap);
  const maxGap = ctx.args.maxGap === undefined ? Infinity : Number(ctx.args.maxGap);
  const frames = slotOf(result.shots, ctx).frames;
  const gaps: number[] = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]!;
    const b = frames[i]!;
    const d = b - a;
    if (d < minGap || d > maxGap) continue;
    if (inside(a) === want && inside(b) === want) gaps.push(d);
  }
  if (gaps.length === 0) throw new Error('間が無い');
  return gaps.reduce((s, d) => s + d, 0) / gaps.length;
}

/**
 * バーストの効果の遅れ（backlog 2-4 の P3。V-0392）: n 回目（0 始まり）のフルバーストの窓の中か、窓を開いた III の本当の発動から窓の
 * 始まりまで（FULL_BURST_AFTER_ACTIVATION_FRAMES）に始まった、その枠が受ける timed の効果（skill と stat で絞る）の窓の終わりから、
 * フルバーストの窓の終わりを引いたモデルのフレーム数（効果が先に切れれば負）。窓の終わりの前後の発の値（効果だけ・フルバースト補正
 * だけの発の数）と比べる。before を書くと（V-0549）、窓の始まりの before フレーム前から始まった効果も見る
 * （バースト 3 段階突入時の効果は II → III の替わり目から。00.00 の 29f 前）
 */
function buffWindowEndFromFullBurstEnd(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const before = ctx.args.before === undefined ? FULL_BURST_AFTER_ACTIVATION_FRAMES : Number(ctx.args.before);
  const ends = buffPiecesFor(result, ctx)
    .filter((w) => window.start - before <= w.start && w.start < window.end)
    .map((w) => w.end);
  if (ends.length === 0) throw new Error(`${String(ctx.args.n)} 回目のフルバーストの近くに始まった窓が無い`);
  return Math.max(...ends) - window.end;
}

/** buffEdgeFromActivation・buffEdgeFromShot の引数 edge（start か end） */
function buffEdgeArg(ctx: MetricContext): 'start' | 'end' {
  const edge = ctx.args.edge;
  if (edge !== 'start' && edge !== 'end') throw new Error(`edge は start か end（${String(edge)}）`);
  return edge;
}

/** 枠 slot が受ける timed の効果（skill と stat で絞る）の小片を始まりの順に並べ、続いた（重なるか接する）小片を 1 つの窓にまとめた列 */
function mergedBuffWindows(result: SimResult, ctx: MetricContext): { start: number; end: number }[] {
  const windows: { start: number; end: number }[] = [];
  for (const w of buffPiecesFor(result, ctx).sort((a, b) => a.start - b.start)) {
    const last = windows.at(-1);
    if (last !== undefined && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else windows.push({ start: w.start, end: w.end });
  }
  return windows;
}

/**
 * フォルクヴァンのバーストの吸収回復の読み直し（V-0555）: 枠 from の n 回目（0 始まり）のバーストの発動の印（activationVideoFrameOf。
 * I・II は六角形の替わり目）から、その発動から次の発動までに始まった、枠 slot が受ける timed の効果（skill と stat で絞る）の窓の
 * 付き始め（edge: start）か切れ目（edge: end）までの動画のフレーム数。続いた小片は 1 つの窓にまとめる。味方の発動のきっかけで
 * 付く窓を、録画の「▲の無い最後の発 〜 ▲の乗った最初の発」の幅（レシピ buff-edge の観測値の spread）と比べる。省略できる引数
 * ticks が true なら、動画のフレームでなくモデルのフレーム（ゲーム内のティック。止まりを足さない）の差。録画の側を timer.ts の
 * runs でティックに直して比べる（止まりの長さの回ごとの揺れ C-0069 を除く）。省略できる引数 held が true なら、発動の後に
 * 始まった窓でなく、その発動のフレームに効いている窓（発動で外れる▼の切れ目。V-0724）。省略できる引数 fromShot が true
 * なら、起点を発動の印でなく、その発動の効果の発火（effectFrameOf）以後の枠 from の最初の発の動画のフレームにする（発動と発の位相によらず、
 * 「効果の乗った最初の発から N 発」で付く窓を比べる。V-0735）。省略できる引数 originStat（と originEffect）があれば、起点を、同じ発動の後に始まった
 * 同じ枠・スロットのその stat（と効果の添字）の窓の付き始めにする（過熱II の付き始めから過熱III の付き始めまで。間に止まりが入らない）
 */
function buffEdgeFromActivation(result: SimResult, ctx: MetricContext): number {
  const edge = buffEdgeArg(ctx);
  // 発動の印（base）と、その発動から次の発動まで（from〜to）は枠 from のもの
  const from = withArgs(ctx, { slot: ctx.args.from });
  const span = spanOf(result, from, `activation:${String(ctx.args.n)}`, 'untilNext');
  const held = ctx.args.held === true;
  const window = mergedBuffWindows(result, ctx).find((w) =>
    held ? w.start <= span.from && span.from < w.end : span.from <= w.start && w.start < span.to,
  );
  if (window === undefined)
    throw new Error(
      `枠 ${String(ctx.args.from)} の ${String(ctx.args.n)} 回目の発動${held ? 'のフレームに効いている' : 'の後に始まった'}窓が無い`,
    );
  const at = edge === 'start' ? window.start : window.end;
  const origin = buffEdgeOriginOf(result, ctx, from, span);
  if (origin === null)
    return ctx.args.ticks === true ? at - span.origin : videoFrameOf(result.schedule, at) - span.base;
  return ctx.args.ticks === true
    ? at - origin
    : videoFrameOf(result.schedule, at) - videoFrameOf(result.schedule, origin);
}

/**
 * buffEdgeFromActivation の起点のモデルのフレーム。fromShot は発動の効果の発火以後の枠 from の最初の発、originStat（と originEffect）は
 * 発動の後に始まった枠 slot のその stat の窓の付き始め（どちらか 1 つまで）。どちらも無ければ null（発動の印）
 */
function buffEdgeOriginOf(
  result: SimResult,
  ctx: MetricContext,
  from: MetricContext,
  span: { from: number; to: number },
): number | null {
  if (ctx.args.fromShot === true && ctx.args.originStat !== undefined)
    throw new Error('fromShot と originStat はどちらか 1 つ');
  if (ctx.args.fromShot === true) {
    const { activation } = nthActivationOf(result, from);
    const effect = effectFrameOf(activation);
    const shot = slotOf(result.shots, from).frames.find((f) => f >= effect);
    if (shot === undefined)
      throw new Error(`枠 ${String(ctx.args.from)} の ${String(ctx.args.n)} 回目の発動の効果の後に発が無い`);
    return shot;
  }
  if (ctx.args.originStat === undefined) return null;
  const window = mergedBuffWindows(
    result,
    withArgs(ctx, { stat: ctx.args.originStat, effect: ctx.args.originEffect }),
  ).find((w) => span.from <= w.start && w.start < span.to);
  if (window === undefined)
    throw new Error(`枠 ${String(ctx.args.from)} の ${String(ctx.args.n)} 回目の発動の後に始まった起点の窓が無い`);
  return window.start;
}

/**
 * 枠 from の shot 発目（1 始まり）の撃ったフレームから、枠 slot が受ける timed の効果（skill と stat で絞る）の
 * 窓の付き始め（edge: start。その発のフレームより後に始まった最初の窓。V-0598）か切れ目（edge: end。その発の次のフレームに効いている窓）までの
 * 動画のフレーム数。続いた小片は 1 つの窓にまとめる。味方の射撃の回数のきっかけ（ナガの 12 発ごとの遮蔽物 HP 回復）で付く窓を、録画の
 * その発から数えた幅（レシピ buff-edge の観測値）と比べる
 */
function buffEdgeFromShot(result: SimResult, ctx: MetricContext): number {
  const edge = buffEdgeArg(ctx);
  const shots = slotOf(result.shots, withArgs(ctx, { slot: ctx.args.from })).frames;
  const n = Number(ctx.args.shot);
  const base = shots[n - 1];
  if (!Number.isInteger(n) || n < 1 || base === undefined)
    throw new Error(`枠 ${String(ctx.args.from)} の ${n} 発目が無い`);
  const windows = mergedBuffWindows(result, ctx);
  const window =
    edge === 'start'
      ? windows.find((w) => w.start > base)
      : windows.find((w) => w.start <= base + 1 && base + 1 < w.end);
  if (window === undefined) throw new Error(`${n} 発目の後に${edge === 'start' ? '始まった' : '効いている'}窓が無い`);
  const at = edge === 'start' ? window.start : window.end;
  return videoFrameOf(result.schedule, at) - videoFrameOf(result.schedule, base);
}

/**
 * 枠の、スロット skill の確率のきっかけの効果の機会（発の次のフレームから、確率 = p × その発の回数の量）と
 * 維持のフレーム（V-0241）。窓の小片（skills/chance.ts）と同じ機会を、射撃の列から作り直す
 */
function chanceSourceOf(
  result: SimResult,
  ctx: MetricContext,
): { opportunities: ChanceOpportunity[]; duration: number } {
  const input = slotOf(ctx.input.slots, ctx);
  if (input.skills === undefined || input.skills.definition === null)
    throw new Error(`枠 ${String(ctx.args.slot)} にスキル定義が無い`);
  const effect = resolveTimed(input.skills.definition, input.character, input.skills.levels).find(
    (e) => e.source.skill === ctx.args.skill && isResolvedChance(e.trigger),
  );
  if (effect === undefined || !isResolvedChance(effect.trigger)) {
    throw new Error(`枠 ${String(ctx.args.slot)} の ${String(ctx.args.skill)} に確率のきっかけの効果が無い`);
  }
  const trigger = effect.trigger;
  const log = slotOf(result.shots, ctx);
  const opportunities = log.frames.flatMap((f, k) => {
    const weight = trigger.count === 'normalHit' ? (log.hits?.[k] ?? 1) : 1;
    return weight > 0 && f + 1 < result.frames ? [{ start: f + 1, q: Math.min(1, trigger.chance * weight) }] : [];
  });
  return { opportunities, duration: effect.durationFrames };
}

/**
 * 枠の発（[from, to)。省略は全部。V-0241）のうち、スロット skill の確率のきっかけの効果が付いている発の割合の
 * 期待値（発のフレームの「付いている確率」の平均）。録画では、1 発の値の格子で▲が付いていると読めた発の割合と比べる
 */
function chanceActiveRatio(result: SimResult, ctx: MetricContext): number {
  const { opportunities, duration } = chanceSourceOf(result, ctx);
  const frames = shotFramesIn(result, ctx);
  if (frames.length === 0) throw new Error('発が無い');
  return frames.reduce((sum, f) => sum + chanceScaleAt(opportunities, duration, f), 0) / frames.length;
}

/**
 * 枠の続けて撃った 2 発（どちらも [from, to)）のうち、前の発で付いていて後の発で切れている組の数の期待値（V-0241）。
 * 付いていない事象は「効いている機会でどれも引かなかった」で、機会は互いに独立なので、
 * P(前で付き・後で切れ) = P(後で切れ) − P(前でも後でも切れ) = Π_{後}(1 − q) − Π_{前 ∪ 後}(1 − q)。
 * 録画では、▲が付いていると読めた発の次の発が付いていないと読めた回数と比べる（上書き延長でなければ、ずっと多くなる）
 */
function chanceExpiries(result: SimResult, ctx: MetricContext): number {
  const { opportunities, duration } = chanceSourceOf(result, ctx);
  const frames = shotFramesIn(result, ctx);
  const activeAt = (f: number) => opportunities.filter((o) => o.start <= f && f < o.start + duration);
  const none = (ops: readonly ChanceOpportunity[]) => ops.reduce((p, o) => p * (1 - o.q), 1);
  let sum = 0;
  for (let k = 1; k < frames.length; k++) {
    const before = activeAt(frames[k - 1]!);
    const after = activeAt(frames[k]!);
    const union = [...new Set([...before, ...after])];
    sum += none(after) - none(union);
  }
  return sum;
}

/** 枠 slotIndex のフレーム frame の、状態 state のスタックの段の最大（付いていなければ 0） */
function stateStacksAt(result: SimResult, slotIndex: number, state: string, frame: number): number {
  let level = 0;
  for (const it of itemsOf(result.history, { holder: slotIndex, state: state as NamedStateId })) {
    if (it.start <= frame && frame < it.end) level = Math.max(level, it.stack ?? 1);
  }
  return level;
}

/**
 * 枠のバーストの発動ごとに、その発動の効果の発火のフレームの前の、枠のカウンタ counter の値（その発動での増減の前。
 * plan/design-skill-stage10.md 3.2 節。V-0503）。count を書くと最初の count 回。録画では、
 * 発動の直前の画面のカウンタの表示（火力ゲージ）と比べる
 */
function counterAtBursts(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const counter = String(ctx.args.counter);
  const records = result.history.counters.filter((c) => c.slotIndex === slotIndex && c.counter === counter);
  const values = result.schedule.activations
    .filter((a) => a.slotIndex === slotIndex)
    .map((a) => {
      const at = effectFrameOf(a);
      return records.filter((c) => c.frame < at).at(-1)?.value ?? 0;
    });
  return firstCount(values, ctx, 'バーストの発動');
}

/**
 * 枠のバーストの発動ごとに、その発動の効果の発火のフレームに、枠に状態 state が付いた（付いた記録がある）なら 1、
 * 無ければ 0（V-0503）。count を書くと最初の count 回。録画では、その回のフルバーストの 1 ヒットに状態の中身が乗ったか（超火力）と比べる
 */
function stateAppliedAtBursts(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const applied = new Set(
    result.history.applications.filter((a) => a.slotIndex === slotIndex && a.state === state).map((a) => a.frame),
  );
  const values = result.schedule.activations
    .filter((a) => a.slotIndex === slotIndex)
    .map((a) => (applied.has(effectFrameOf(a)) ? 1 : 0));
  return firstCount(values, ctx, 'バーストの発動');
}

/**
 * フルバーストの窓ごとに、窓の終わりのフレームの、枠の状態 state のスタックの段の最大（付いていなければ 0。V-0503）。
 * count を書くと最初の count 回。録画では、フルバーストの終わりの直後の一時停止画面の適用中の効果のスタック数（超火力チャージ）と比べる
 */
function stateStacksAtFullBurstEnds(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const values = result.schedule.fullBurstWindows.map((w) => stateStacksAt(result, slotIndex, state, w.end));
  return firstCount(values, ctx, 'フルバースト');
}

/**
 * 枠のバーストの発動ごとに、その発動から次の発動まで（最後は戦闘の終わりまで）に始まった、
 * 枠が自分に付けた timed の効果（skill と stat で絞る。状態だけの stat も入れる。ソーダ：トゥインクルバニーのバースト。
 * V-0437）の窓があれば 1、無ければ 0。
 * count を書くと最初の count 回。録画では、発動の直後の一時停止画面の適用中の効果と比べる。条件（スタック数など）で付いたかを、
 * 発動の時刻に依らずに比べる
 */
function burstBuffApplied(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const acts = activationFramesOfSlot(result.schedule, slotIndex);
  const starts = valuePiecesOf(result.history)
    .filter(
      (p) =>
        p.slotIndex === slotIndex &&
        p.sourceSlotIndex === slotIndex &&
        p.effect.source.skill === ctx.args.skill &&
        p.effect.stat === ctx.args.stat,
    )
    .map((p) => p.start);
  const applied = acts.map((a, k) => (starts.some((f) => a <= f && f < (acts[k + 1] ?? Infinity)) ? 1 : 0));
  return firstCount(applied, ctx, 'バーストの発動');
}

/**
 * n 回目（0 始まり）のフルバーストで、枠が受ける timed の効果（skill と stat で絞る。出どころの枠は
 * 問わない。デルタの防御力▲。V-0452）の窓が、そのフルバーストの窓の中（か、窓を開いた III の本当の発動から窓の始まりまで）に始まっていれば 1、無ければ 0。
 * 録画では、フルバースト開始の直後の一時停止画面の適用中の効果の有無と比べる。対象が最終防御力の比べで決まる効果（targetDefense）が
 * どの枠に付いたかを、フルバーストの時刻に依らずに比べる
 */
function fullBurstBuffApplied(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const slotIndex = slotIndexOf(ctx);
  const applied = buffPiecesOf(result).some(
    (p) =>
      p.slotIndex === slotIndex &&
      p.effect.source.skill === ctx.args.skill &&
      p.effect.stat === ctx.args.stat &&
      window.start - FULL_BURST_AFTER_ACTIVATION_FRAMES <= p.start &&
      p.start < window.end,
  );
  return applied ? 1 : 0;
}

/**
 * 枠の状態 state のスタック量の減少（stackChange の decrease）ごとに、減少のフレームから次のフレームへの
 * スタックの段の最大の差（負。付いている段より多く減らせば、付いている段の数だけ）。count を書くと最初の count 回。録画では、発動の
 * 直前（フルバーストの外の 1 ヒットの会心の比）と直後（一時停止画面）のスタック数の差と比べる
 */
function stateStackDrops(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const frames = [
    ...new Set(
      result.history.tracks
        .filter((t) => t.holder === slotIndex && t.origin.kind === 'state' && t.origin.state === state)
        .flatMap((t) => t.decreases.map((d) => d.frame)),
    ),
  ].sort((a, b) => a - b);
  const drops = frames.map(
    (d) => stateStacksAt(result, slotIndex, state, d + 1) - stateStacksAt(result, slotIndex, state, d),
  );
  return firstCount(drops, ctx, 'スタック量の減少');
}

/**
 * フルバーストの窓ごとに、窓の中の状態 state のスタックの段の最大の増え方（窓の終わり − 始まり）から、窓の中の
 * 枠の発の数を every で割った商を引いたもの。「フルバースト中の通常攻撃 every 回ごとに 1 スタック（フルバーストごとに数え直す）」なら
 * 0。窓の長さや発の数に依らずに、数え方だけを比べる（録画では、窓の中の発を数え、前後のスタック数と比べる）。count を書くと最初の count 回
 */
function fullBurstStackGainResidues(result: SimResult, ctx: MetricContext): number[] {
  if (result.schedule === null) throw new Error('バーストの時刻表が無い');
  const slotIndex = slotIndexOf(ctx);
  const state = String(ctx.args.state);
  const every = Number(ctx.args.every);
  const shots = slotOf(result.shots, ctx).frames;
  const residues = result.schedule.fullBurstWindows.map((w) => {
    const gained = stateStacksAt(result, slotIndex, state, w.end) - stateStacksAt(result, slotIndex, state, w.start);
    return gained - Math.floor(shots.filter((f) => w.start <= f && f < w.end).length / every);
  });
  return firstCount(residues, ctx, 'フルバースト');
}
