// 指標: 射撃の刻み・マガジン・リロード・狙えない窓（plan/design-stage19.md 2.3.1 節）
import { activationFramesOfSlot, type BurstSchedule, isInFullBurst, videoFrameOf } from '../../../burst/schedule.ts';
import { rateAfterShots, reloadCompleteToFirstShotFrames } from '../../../cadence.ts';
import { effectiveMaxAmmo, firingParams } from '../../../frame/firing.ts';
import { lowerBound, partialShotsInRanges } from '../../../frame/shots.ts';
import type { SimResult, SimSlotSegment } from '../../../sim/engine.ts';
import { itemsOf } from '../../../skills/holders.ts';
import type { FrameRange } from '../../../skills/timeline.ts';
import { DEFAULT_WEAPON_MODEL, MAX_RPM } from '../../../weapons.ts';
import { atShotFrame, eachOrOne, median, type Metric, type MetricContext, slotIndexOf, slotOf } from './context.ts';

export const firingMetrics: Readonly<Record<string, Metric>> = {
  gaugeFullToWeaponChangeShot: { args: ['slot', 'n'], sim: gaugeFullToWeaponChangeShot },
  fullBurstToWeaponChangeShot: { args: ['slot', 'n'], sim: fullBurstToWeaponChangeShot },
  fullBurstEndToNextShot: { args: ['slot', 'n'], sim: fullBurstEndToNextShot },
  shotCount: { args: ['slot'], sim: (r, c) => shotFramesIn(r, c).length },
  maxAmmoAt: { args: ['slot', 'frame'], sim: maxAmmoAt },
  // n 発目の最大装弾数と、弾丸チャージの発数（V-0435）
  maxAmmoAtShot: { args: ['slot', 'shot'], sim: maxAmmoAtShot },
  ammoRefillAmounts: { args: ['slot', 'count'], sim: ammoRefillAmounts },
  reloadFramesAt: { args: ['slot', 'frame'], sim: reloadFramesAt },
  reloadToNextShotAt: { args: ['slot', 'frame'], sim: reloadToNextShotAt },
  hideReloadToWindowEnd: { args: ['slot', 'window'], sim: hideReloadToWindowEnd },
  lastShotToWindowEnd: { args: ['slot', 'window'], sim: lastShotToWindowEnd },
  windowEndToFirstShot: { args: ['slot', 'window'], sim: windowEndToFirstShot },
  partialChargeProgress: { args: ['slot', 'window'], sim: partialChargeProgressIn },
  // 戦闘の始めから count 本のマガジンの発数（リロードからリロードまで。
  // 最後の弾丸の発を含む。plan/design-ludmilla-wo.md 3 節）。弾丸チャージでマガジンが延びるかを見る
  magazineShots: { args: ['slot', 'count'], sim: magazineShots },
  steadyPauseShots: { args: ['slot'], sim: steadyPauseShots },
  lastShotGapMedians: { args: ['slot', 'every'], sim: lastShotGapMedians },
  fullBurstMagazineShots: { args: ['slot'], sim: fullBurstMagazineShots },
  fullBurstShotsBeforeAmmoRestore: { args: ['slot', 'n'], sim: fullBurstShotsBeforeAmmoRestore },
  cycleWindowResidues: { args: ['slot', 'every'], sim: cycleWindowResidues },
  // 省略できる引数 video が true なら、録画の動画のフレームの間隔（フルバーストの入りの止まり・発動の止まりを
  // 含む。videoFrameOf。V-0569）。HUD の増分どうしの間隔と比べる（入りの止まりを挟む発の間隔）
  shotIntervals: {
    args: ['slot'],
    sim: (r, c) => {
      const raw = shotFramesIn(r, c);
      const frames = c.args.video === true ? raw.map((f) => videoFrameOf(r.schedule, f)) : raw;
      return frames.slice(1).map((f, i) => f - frames[i]!);
    },
  },
  // 枠の [from, to) の発の、発と発の間の平均（(最後の発 − 最初の発) ÷ (発の数 − 1)。V-0458）。HUD の増分のフレームの
  // 1f の揺れが、両端の発にしか残らない（マガジンの中の 27・28f の並びは、揺れで隣どうしが 29・26f になることがある）
  shotIntervalMean: {
    args: ['slot'],
    sim: (r, c) => {
      const frames = shotFramesIn(r, c);
      if (frames.length < 2) throw new Error(`枠 ${String(c.args.slot)} の発が 2 つ未満`);
      return (frames[frames.length - 1]! - frames[0]!) / (frames.length - 1);
    },
  },
  // 枠の frame 以降の最初の発の、発射から着弾（発のゲージを足すフレーム）までのフレーム数（的の表の
  // flightFrames と着地点の時間割りで決まる。V-0463）。録画では、照準の横の残弾が減ったフレームから総ダメージの増分までを読む
  shotFlightAt: {
    args: ['slot', 'frame'],
    sim: (r, c) => {
      const frame = Number(c.args.frame);
      const g = r.shotGauges.find((x) => x.slotIndex === slotIndexOf(c) && x.shotFrame >= frame);
      if (g === undefined) throw new Error(`枠 ${String(c.args.slot)} のフレーム ${frame} 以降の発が無い`);
      return g.frame - g.shotFrame;
    },
  },
  // n 回目（0 始まり）のフルバーストの窓の中の、枠の発と発の間の中央値から、窓の前の同じ長さの中央値を
  // 引いたもの（動画のフレーム）。チャージ時間▼が窓の間だけ効くかを見る（plan/design-target-vocab.md 4.2 節）
  fullBurstShotIntervalDiff: { args: ['slot', 'n'], sim: fullBurstShotIntervalDiff },
};

function magazineShots(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const count = Number(ctx.args.count);
  const ends = (log.lastShotFrames ?? []).slice(0, count);
  if (ends.length < count) throw new Error(`マガジンが ${ends.length} 本しか撃ち切られていない`);
  let first = 0;
  return ends.map((end) => {
    const last = log.frames.indexOf(end);
    const shots = last - first + 1;
    first = last + 1;
    return shots;
  });
}

/**
 * V-0534（ラピ：レッドフード S2 の粘着榴弾。C-0717）: 1 フレーム 1 発で撃っている区間の、射撃の止まり（前後の発と発の間が 1f で、そこだけ
 * 2f の所）から次の止まりまでの発の数（間の発と発の間がすべて 1f の組だけ）。スピンアップが 1 フレーム 1 発に届く前の発の 2f は数えない。
 * どの組も同じならその数、違えば違う数の並び（昇順）。録画では、HUD の総ダメージが 1 フレームだけ増えなかったフレームから次のその
 * フレームまでの通常攻撃のヒットを数える
 */
function steadyPauseShots(result: SimResult, ctx: MetricContext): number | number[] {
  const frames = slotOf(result.shots, ctx).frames;
  // 省略できる引数 fullBurst が true なら、両端の止まりがどちらもフルバーストの窓の中の組だけ、false なら
  // どちらも外の組だけを数える（バースト III の回数条件▼の窓はフルバーストの窓とほぼ重なる。V-0537）
  const schedule = result.schedule;
  const inWindow = (f: number): boolean => schedule !== null && isInFullBurst(schedule, f);
  const side = ctx.args.fullBurst === undefined ? null : ctx.args.fullBurst === true;
  const shot = slotOf(ctx.input.slots, ctx).character.shot;
  // 撃ち始め（リロード・的のジャンプの後。前の発との間が 2f より長い発）から何発目で 1 フレーム 1 発に届くか
  let spun = 0;
  while (rateAfterShots(shot, spun) < MAX_RPM) {
    // レートは発ごとに上がるか止まるかだけなので、上がらなくなったら 1 フレーム 1 発には届かない（スピンアップの無い武器など）
    if (rateAfterShots(shot, spun + 1) <= rateAfterShots(shot, spun))
      throw new Error(`枠 ${String(ctx.args.slot)} の武器は 1 フレーム 1 発に届かない`);
    spun += 1;
  }
  const gap = (k: number): number => frames[k]! - frames[k - 1]!;
  const counts = new Set<number>();
  let runStart = 0;
  let last: number | null = null;
  for (let k = 1; k + 1 < frames.length; k++) {
    if (gap(k) > 2) {
      runStart = k;
      last = null;
    }
    if (k - runStart <= spun || gap(k) !== 2 || gap(k - 1) !== 1 || gap(k + 1) !== 1) continue;
    if (last !== null) {
      let steady = true;
      for (let q = last + 1; q < k; q++) if (gap(q) !== 1) steady = false;
      const sideOk = side === null || (inWindow(frames[last]!) === side && inWindow(frames[k]!) === side);
      if (steady && sideOk) counts.add(k - last);
    }
    last = k;
  }
  const values = [...counts].sort((a, b) => a - b);
  if (values.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} に 1 フレーム 1 発の区間の止まりの組が無い`);
  return values.length === 1 ? values[0]! : values;
}

/**
 * V-0534（C-0718）: 枠のマガジンの最後の弾丸から次の発までのフレーム数の中央値を、最後の弾丸が戦闘の始めから数えて every 発の倍数の発
 * だったマガジンと、そうでないマガジンに分けて [倍数, ほか] で返す（的のジャンプに掛かったリロードの外れは中央値で落とす）
 */
function lastShotGapMedians(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const every = Number(ctx.args.every);
  const groups: [number[], number[]] = [[], []];
  for (const end of log.lastShotFrames ?? []) {
    const k = log.frames.indexOf(end);
    const next = log.frames[k + 1];
    if (next === undefined) continue;
    groups[(k + 1) % every === 0 ? 0 : 1].push(next - end);
  }
  return groups.map((g, i) => {
    if (g.length === 0) throw new Error(`枠 ${String(ctx.args.slot)} の${i === 0 ? '倍数の' : 'ほかの'}マガジンが無い`);
    const sorted = [...g].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  });
}

/**
 * V-0356（紅蓮：ブラックシャドウの S2）: フルバーストごとに、開始のフレームから、その後で最初にマガジンを撃ち切った発までの発の数
 * （開始のフレームの発を含む）。最大装弾数▲と弾丸チャージ（▲の後の最大まで足す）が効けば、開始の前の残弾やリロード中かに依らず
 * ▲の後の最大になる。count を書くと最初の count 回（録画で読めた回数にそろえる）。撃ち切る前に戦闘が終わった回は数えない
 */
function fullBurstMagazineShots(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  const ends = log.lastShotFrames ?? [];
  const out: number[] = [];
  for (const w of result.schedule?.fullBurstWindows ?? []) {
    const end = ends.find((f) => f >= w.start);
    if (end === undefined) break;
    out.push(log.frames.filter((f) => f >= w.start && f <= end).length);
  }
  if (ctx.args.count === undefined) return out;
  const count = Number(ctx.args.count);
  if (out.length < count) throw new Error(`撃ち切ったフルバーストが ${out.length} 回しか無い`);
  return out.slice(0, count);
}

/**
 * n 回目（0 始まり）のフルバーストの窓の中で、最終弾でない
 * 最初の発（2 発以上のマガジンの発）の前までに撃った発の数（plan/design-debuff-removal-timed.md 2.8 節。
 * V-0712 の録画 1032・1033）。最大装弾数▼で 1 発のマガジンが何回続いてから、デバフ解除で素のマガジンに
 * 戻るかを見る（窓の最初の発から戻っていれば 0、窓の終わりまで戻らなければ窓の中の発の全部）。最大装弾数の stat でなく込めたマガジンで
 * 数える（込め終わりの後・1 発目の前に外れると、その発はまだ 1 発のマガジン。C-0934）。録画では、窓の中のミサイル（最終弾の 74f 後）の
 * 並びで読む
 */
function fullBurstShotsBeforeAmmoRestore(result: SimResult, ctx: MetricContext): number {
  const n = Number(ctx.args.n);
  const w = result.schedule?.fullBurstWindows[n];
  if (w === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
  const log = slotOf(result.shots, ctx);
  const shots = log.frames.filter((f) => f >= w.start && f < w.end);
  if (shots.length === 0) throw new Error(`${n} 回目のフルバーストの窓に枠 ${String(ctx.args.slot)} の発が無い`);
  const last = new Set(log.lastShotFrames ?? []);
  const restored = shots.findIndex((f) => !last.has(f));
  return restored === -1 ? shots.length : restored;
}

/**
 * V-0356（紅蓮：ブラックシャドウのバースト）: 段の間隔の変更の窓ごとに、窓の前の最後の段の後の段なしの発の数 p・窓の中の発の数 n・
 * 窓の後で最初に段が出たのが何発目か k の和を every（窓の外の段の間隔）で割った余り。通算のカウンタなら 0 になり、射撃の位相に依らない。
 * 窓の前に段が無い窓と、窓の後に段が出る前に戦闘が終わった窓は除く
 */
function cycleWindowResidues(result: SimResult, ctx: MetricContext): number[] {
  const slotIndex = slotIndexOf(ctx);
  const every = Number(ctx.args.every);
  const shots = slotOf(result.shots, ctx).frames;
  // 段を出した射撃のフレーム（段のヒットは射撃の delayFrames 後。C-0651）
  const tiers = new Set(
    result.skillHits
      .filter((h) => h.slotIndex === slotIndex && h.effect.cycle !== undefined)
      .map((h) => h.frame - (h.effect.delayFrames ?? 0)),
  );
  const out: number[] = [];
  // 間隔の変更の件（時刻の順）
  for (const w of itemsOf(result.history, { holder: slotIndex, kind: 'cycleEvery' })) {
    const before = shots.filter((f) => f < w.start);
    let last = before.length - 1;
    while (last >= 0 && !tiers.has(before[last]!)) last -= 1;
    const k = shots.filter((f) => f >= w.end).findIndex((f) => tiers.has(f)) + 1;
    if (last < 0 || k === 0) continue;
    const p = before.length - 1 - last;
    const n = shots.filter((f) => f >= w.start && f < w.end).length;
    out.push((p + n + k) % every);
  }
  return out;
}

/**
 * 枠のリロードの回（1 パス目の射撃の列の、基礎の武器のマガジンの最終弾 → 次のマガジンの 1 発目）のうち、最終弾が引数 frame の区間に
 * ある回の長さ（時刻の順）。録画の読みと同じく、狙えない窓に掛かる回（ハイド中のリロード・明けの構え）と、バーストの止まりに掛かる回（動画の
 * フレームがゲーム内の時計より進む）は除く。使用武器の変更の最後の発は、基礎の武器のマガジンの最終弾でないので除く
 */
function reloadsAt(result: SimResult, ctx: MetricContext): { segment: SimSlotSegment; reloads: number[] } {
  const log = slotOf(result.shots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slotOf(result.slots, ctx).segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  const changed = new Set(log.weaponChangeShotFrames ?? []);
  const reloads: number[] = [];
  // 残弾数減少で残弾が 0 になって始めたリロードも、その前の最後の発から数える（装弾数無限の後の 100% 減少。V-0735）
  const lasts = [...new Set([...(log.lastShotFrames ?? []), ...(log.drainReloadShotFrames ?? [])])].sort(
    (x, y) => x - y,
  );
  for (const last of lasts) {
    if (last < segment.start || last >= segment.end || changed.has(last)) continue;
    const next = log.frames[lowerBound(log.frames, last) + 1];
    if (next === undefined || result.untargetable.some((w) => w.start <= next && last < w.end)) continue;
    const frames = next - last;
    if (videoFrameOf(result.schedule, next) - videoFrameOf(result.schedule, last) === frames) reloads.push(frames);
  }
  return { segment, reloads };
}

/**
 * 全弾リロードの 1 回分は最終弾の蓄積の余りで決まり、マガジンの発数・窓・途中のバフで 1 回ごとに違う（plan/design-reload-rounding.md
 * 案 E）ので、sim の射撃の列の回を読む。引数 n（0 始まり。カンマ区切りで並べられる）があれば reloadsAt の n 回目、無ければ回ごとの値の
 * 中央値（録画の多くは区間の中の回の中央値を読む）。区間に読める回が無ければ、モデルにその回が無いので比べられない（定常のマガジンの
 * 周期で埋めない）
 */
function perReloadAt(result: SimResult, ctx: MetricContext): { segment: SimSlotSegment; frames: number | number[] } {
  const { segment, reloads } = reloadsAt(result, ctx);
  const where = `枠 ${String(ctx.args.slot)} のフレーム ${String(ctx.args.frame)} の区間`;
  if (ctx.args.n === undefined) {
    if (reloads.length === 0) throw new Error(`${where}にリロードが無い`);
    return { segment, frames: median(reloads) };
  }
  const frames = eachOrOne(ctx.args.n, (n) => {
    const reload = reloads[n];
    if (reload === undefined) throw new Error(`${where}に ${n} 回目のリロードが無い`);
    return reload;
  });
  return { segment, frames };
}

/**
 * そのフレームの区間のリロードの回の、最終弾から込め終わり（RELOADING のバーが消える）までの
 * フレーム（全弾リロードは ⌈ずれ + x + c⌉、分割リロードは段の数 + 1 段。perReloadAt）。sim の最終弾 → 次の 1 発目から、込め終わり → 1 発目
 * を引く。録画では、レシピ reload-segments の最終弾 → 完了と比べる
 */
function reloadFramesAt(result: SimResult, ctx: MetricContext): number | number[] {
  const shot = slotOf(ctx.input.slots, ctx).character.shot;
  const { segment, frames } = perReloadAt(result, ctx);
  const tail = reloadCompleteToFirstShotFrames(shot, DEFAULT_WEAPON_MODEL, firingParams(shot, segment.trigger.buffs));
  return typeof frames === 'number' ? frames - tail : frames.map((f) => f - tail);
}

/**
 * V-0264（キューブのリロード速度▲の残差）: そのフレームの区間のリロードの回の、マガジンの最終弾から次のマガジンの 1 発目までのフレーム
 * （perReloadAt）。録画では、レシピ reload-segments の最終弾 → 完了と完了 → 次の増分の和（リロードごと）か、HUD の増分の空きと比べる。
 * バーの長さと違い、武器種ごとの切片（C-0135）を含まない形で比べられる
 */
function reloadToNextShotAt(result: SimResult, ctx: MetricContext): number | number[] {
  return perReloadAt(result, ctx).frames;
}

/**
 * V-0621: window 回目（0 始まり）の狙えない窓の中で始めたハイド中のリロードの、始まり（RELOADING のバーの 0 の点）から窓の終わり（明け）
 * までのフレーム数（C-0842・C-0844）。録画では、reload.ts --mode fit のバーの長さ 0 に遡った点から、バーが消えたフレーム（明けで取り消された
 * 回）まで。窓の中にハイド中のリロードが無ければ比べられない
 */
/** 引数 window 回目の狙えない窓（0 始まり） */
function untargetableWindowOf(
  result: SimResult,
  ctx: MetricContext,
): { index: number; window: { start: number; end: number } } {
  const index = Number(ctx.args.window);
  return { index, window: untargetableWindowAt(result, index) };
}

function untargetableWindowAt(result: SimResult, index: number): { start: number; end: number } {
  const window = result.untargetable[index];
  if (window === undefined) throw new Error(`${index} 回目の狙えない窓が無い`);
  return window;
}

function hideReloadToWindowEnd(result: SimResult, ctx: MetricContext): number {
  const { index, window } = untargetableWindowOf(result, ctx);
  const starts = result.shots[slotIndexOf(ctx)]?.hideReloadStarts ?? [];
  const start = starts.find((s) => s >= window.start - 1 && s < window.end);
  if (start === undefined) throw new Error(`${index} 回目の狙えない窓の中にハイド中のリロードが無い`);
  return window.end - start;
}

/**
 * V-0648（plan/design-hide-reload-detect.md 10 節）: window 回目の狙えない窓の、窓の終わり（明け）から見た、その窓の前の最後の発（窓の
 * 始まりから D の前までの発を含む）までのフレーム。window はカンマ区切りの並び（"0,1,2"）も書け、そのときは窓ごとの列
 */
function lastShotToWindowEnd(result: SimResult, ctx: MetricContext): number | number[] {
  const frames = result.shots[slotIndexOf(ctx)]?.frames ?? [];
  return perWindow(result, ctx, (window, index) => {
    const last = frames.findLast((f) => f < window.end);
    if (last === undefined) throw new Error(`${index} 回目の狙えない窓の前に発が無い`);
    return window.end - last;
  });
}

/**
 * V-0682: window 回目の狙えない窓の終わり（明け）から、その後の最初の発までのフレーム（明けの構え。C-0114・C-0972）。window は
 * lastShotToWindowEnd と同じく並びも書ける
 */
function windowEndToFirstShot(result: SimResult, ctx: MetricContext): number | number[] {
  const frames = result.shots[slotIndexOf(ctx)]?.frames ?? [];
  return perWindow(result, ctx, (window, index) => {
    const first = frames.find((f) => f >= window.end);
    if (first === undefined) throw new Error(`${index} 回目の狙えない窓の後に発が無い`);
    return first - window.end;
  });
}

/** 引数 window（1 つの番号か、カンマ区切りの並び）の窓ごとに at を求める。並びなら窓ごとの列 */
function perWindow(
  result: SimResult,
  ctx: MetricContext,
  at: (window: FrameRange, index: number) => number,
): number | number[] {
  return eachOrOne(ctx.args.window, (index) => at(untargetableWindowAt(result, index), index));
}

/** window 回目の狙えない窓の中の部分チャージの発の、チャージの進み（plan/design-hide-reload-detect.md 9 節） */
function partialChargeProgressIn(result: SimResult, ctx: MetricContext): number {
  const { index, window } = untargetableWindowOf(result, ctx);
  const [progress] = partialShotsInRanges(result.shots[slotIndexOf(ctx)]?.partialShots, [window]);
  if (progress === undefined) throw new Error(`${index} 回目の狙えない窓の中に部分チャージの発が無い`);
  return progress;
}

/**
 * そのフレームの区間の最大装弾数（最大装弾数▲▼を足して丸めた値。C-0017。V-0179）。録画ではリロードを終えた直後の
 * 照準の横の残弾と比べる
 */
function maxAmmoAt(result: SimResult, ctx: MetricContext): number {
  const slot = slotOf(result.slots, ctx);
  const input = slotOf(ctx.input.slots, ctx);
  const frame = Number(ctx.args.frame);
  const segment = slot.segments.find((s) => s.start <= frame && frame < s.end);
  if (!segment) throw new Error(`フレーム ${frame} の区間が無い`);
  return effectiveMaxAmmo(input.character.shot.maxAmmo, segment.trigger.buffs);
}

/**
 * 枠の shot 発目（1 始まり。戦闘の始めから数える。V-0435。トーブの宝物版 S1）を撃ったフレームの最大装弾数（最大装弾数▲の
 * 後の値）。録画では、その発の後の枠アイコンの上の「残弾/最大」の最大を読む（ゲーム内の時刻に依らない）
 */
function maxAmmoAtShot(result: SimResult, ctx: MetricContext): number {
  return maxAmmoAt(result, atShotFrame(result, ctx, Number(ctx.args.shot)));
}

/**
 * 同: 枠に入った弾丸チャージの発数（最初の count 回。最大で止まった回は、足せた分だけ）。録画では照準の左の残弾の増え
 * （`reticle-ammo.ts --mode mags`）を読む
 */
function ammoRefillAmounts(result: SimResult, ctx: MetricContext): number[] {
  const count = Number(ctx.args.count);
  const amounts = result.instants
    .filter((e) => e.slotIndex === slotIndexOf(ctx) && e.effect.kind === 'ammoRefill')
    .map((e) => e.amount)
    .slice(0, count);
  if (amounts.length < count) throw new Error(`弾丸チャージが ${amounts.length} 回しか無い`);
  return amounts;
}

/**
 * 枠の発のうち [from, to) のもの（モデルのフレーム）。burst（0 始まり）を書くと、from・to はその枠の burst 回目のバーストの
 * 発動からの相対になる（モデルが変わって発動が動いても、同じ窓を数える。V-0227）
 */
export function shotFramesIn(result: SimResult, ctx: MetricContext): number[] {
  const log = slotOf(result.shots, ctx);
  let base = 0;
  if (ctx.args.burst !== undefined) {
    const n = Number(ctx.args.burst);
    const frames = result.schedule === null ? [] : activationFramesOfSlot(result.schedule, slotIndexOf(ctx));
    const at = frames[n];
    if (at === undefined) throw new Error(`枠 ${String(ctx.args.slot)} のバーストの発動 ${n} 回目（0 始まり）が無い`);
    base = at;
  }
  const from = base + (ctx.args.from === undefined ? 0 : Number(ctx.args.from));
  const to = ctx.args.to === undefined ? result.frames : base + Number(ctx.args.to);
  return log.frames.filter((f) => f >= from && f < to);
}

/** 発の列（モデルのフレーム）のうち、両端が [from, to) に入る発と発の間（動画のフレーム） */
function videoIntervalsIn(schedule: BurstSchedule, frames: readonly number[], from: number, to: number): number[] {
  const inside = frames.filter((f) => f >= from && f < to).map((f) => videoFrameOf(schedule, f));
  return inside.slice(1).map((f, i) => f - inside[i]!);
}

function fullBurstShotIntervalDiff(result: SimResult, ctx: MetricContext): number {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const window = schedule.fullBurstWindows[Number(ctx.args.n)];
  if (window === undefined) throw new Error(`${String(ctx.args.n)} 回目のフルバーストが無い`);
  const frames = slotOf(result.shots, ctx).frames;
  const length = window.end - window.start;
  const inside = videoIntervalsIn(schedule, frames, window.start, window.end);
  const before = videoIntervalsIn(schedule, frames, window.start - length, window.start);
  return median(inside) - median(before);
}

/**
 * 起点のフレーム（n 回目。0 始まり）から、枠の変更後の武器の最初の発（起点から lead フレーム前より後）までの、録画の動画のフレーム
 * （videoFrameOf）。n はカンマ区切りの並びも書け、そのときは回ごとの列
 */
function toWeaponChangeShot(
  result: SimResult,
  ctx: MetricContext,
  originOf: (schedule: BurstSchedule, n: number) => number,
  lead = 0,
): number | number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const changed = slotOf(result.shots, ctx).weaponChangeShotFrames ?? [];
  const at = (n: number): number => {
    const origin = originOf(schedule, n);
    const shot = changed.find((f) => f >= origin - lead);
    if (shot === undefined) throw new Error(`${n} 回目の起点の後に変更後の武器の発が無い`);
    return videoFrameOf(schedule, shot) - videoFrameOf(schedule, origin);
  };
  return eachOrOne(ctx.args.n, at);
}

/**
 * n 回目（0 始まり）にゲージが満タンになった（BURST バーが消えた）フレームから、その後の枠の最初の
 * 使用武器の変更の発（変更後の武器の発）までの動画のフレーム数（V-0530）。n はカンマ区切りの並び（"0,1,3"）も書け、そのときは回ごとの列。
 * 単騎の I で満タンの直後に使うバーストの、変更後の武器の最初の発の待ち（firstShotDelayFrames）を、HUD の最初の増分で比べる
 */
function gaugeFullToWeaponChangeShot(result: SimResult, ctx: MetricContext): number | number[] {
  return toWeaponChangeShot(result, ctx, (schedule, n) => {
    const full = schedule.gaugeFullFrames[n];
    if (full === undefined) throw new Error(`${n} 回目の満タンが無い`);
    return full;
  });
}

/**
 * n 回目（0 始まり）のフルバーストの窓の始まり（III のタイマーの 00.00）から、
 * 枠の変更後の武器の最初の発（窓の始まりの 60f 前より後）までの、録画の動画のフレーム（入りの止まりを含む。V-0639。plan/design-red-hood.md 7.1 節の論点 13）
 */
function fullBurstToWeaponChangeShot(result: SimResult, ctx: MetricContext): number | number[] {
  return toWeaponChangeShot(
    result,
    ctx,
    (schedule, n) => {
      const window = schedule.fullBurstWindows[n];
      if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
      return window.start;
    },
    60,
  );
}

/**
 * n 回目（0 始まり）のフルバーストの窓の終わりから、その後の枠の最初の発（終わりのフレームより後）までの、録画の動画の
 * フレーム（videoFrameOf。V-0668）。n はカンマ区切りの並びも書け、そのときは回ごとの列。フルバーストの終わりに付く射撃の止まり（気絶）の長さを、
 * HUD の増分の空きで比べる
 */
function fullBurstEndToNextShot(result: SimResult, ctx: MetricContext): number | number[] {
  const schedule = result.schedule;
  if (schedule === null) throw new Error('バーストの時刻表が無い');
  const frames = slotOf(result.shots, ctx).frames;
  const at = (n: number): number => {
    const window = schedule.fullBurstWindows[n];
    if (window === undefined) throw new Error(`${n} 回目のフルバーストが無い`);
    const shot = frames.find((f) => f > window.end);
    if (shot === undefined) throw new Error(`${n} 回目のフルバーストの終わりの後に発が無い`);
    return videoFrameOf(schedule, shot) - videoFrameOf(schedule, window.end);
  };
  return eachOrOne(ctx.args.n, at);
}
