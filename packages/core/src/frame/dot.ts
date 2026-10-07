// 持続ダメージ（dot）のまとまりと tick の規則（ニヒリスター編・クルミ編・レイヴン編）。frame/plan.ts の planSkillHits（ダメージ）と
// frame/firstPass.ts（ゲージの予約）の両方が使うので、循環 import を避けて 1 つのモジュールに置く（plan/design-raven-s1.md 8 節の 2）。
// frame/plan.ts から同じ名前で再エクスポートする
import type { ResolvedDamageEffect } from '../skills/burstDamage.ts';
import type { DotFirstTick } from '../skills/types.ts';
import { gameSecondsToFirstFrame, gameSecondsToFrame } from '../time.ts';

/**
 * クルミ編: dot を status ごとにまとめる（status の無い効果はそれぞれ 1 つ）。同じ status の効果は、間隔・維持・firstTick・
 * 倍率が同じでなければならない（1 つの持続ダメージとして tick を出すため。C-0136）。V-0113: tick のゲージ（gaugeOnTick）も
 * 持続ダメージ 1 つの性質なので同じであること（付けたときのゲージ gaugeOnApply は効果のトリガーごと）
 */
export function groupDotsByStatus(effects: readonly ResolvedDamageEffect[]): ResolvedDamageEffect[][] {
  const groups: ResolvedDamageEffect[][] = [];
  const byStatus = new Map<string, ResolvedDamageEffect[]>();
  for (const effect of effects) {
    const status = effect.dot?.status;
    if (status === undefined) {
      groups.push([effect]);
      continue;
    }
    const group = byStatus.get(status);
    if (group === undefined) {
      const created = [effect];
      byStatus.set(status, created);
      groups.push(created);
      continue;
    }
    const a = group[0]!;
    if (
      a.dot!.intervalSeconds !== effect.dot!.intervalSeconds ||
      a.dot!.durationSeconds !== effect.dot!.durationSeconds ||
      a.dot!.firstTick !== effect.dot!.firstTick ||
      a.dot!.maxStacks !== effect.dot!.maxStacks ||
      a.dot!.gaugeOnTick !== effect.dot!.gaugeOnTick ||
      a.multiplier !== effect.multiplier
    ) {
      throw new RangeError(
        `dot status "${status}": effects differ in interval, duration, firstTick, max stacks, tick gauge or multiplier`,
      );
    }
    group.push(effect);
  }
  return groups;
}

/**
 * ニヒリスター編: 持続ダメージの 2 回目以降の tick の遅れ（秒）。1 回目の tick は付いた瞬間に出て、k 回目（k ≥ 1）は
 * k × 間隔 + この値の後に出る（C-0101）。ニヒリスターの火傷（1 秒間隔・10 秒）で 0・1.5・2.5 … 9.5 秒の 10 回
 * （録画 081 の 9 回のバーストで ±2f。1 秒間隔でない持続ダメージでも同じ 0.5 秒かは未確認）
 */
export const DOT_LATER_TICK_DELAY_SECONDS = 0.5;

/**
 * ニヒリスター編: 持続ダメージの tick のフレーム（plan/design-nihilister.md 2.1 節・経過）。発火 f ごとに、f と
 * f + ceil((k × 間隔 + DOT_LATER_TICK_DELAY_SECONDS) ÷ 0.017) − 1（k = 1 … floor(維持 ÷ 間隔) − 1）の計 floor(維持 ÷ 間隔) 回。
 * 起点（1 回目の tick の 1f 前）からの時刻に達した最初のフレームで、端数を積み重ねない（C-0454。録画 081 の 0・88・147・205・264・323・382・441・499・558）。戦闘の終わり（frames）以降も出さない。
 * V-0051: 維持の途中（前の発火から維持秒のうち）の再発火は、tick の刻みを変えずに終わりだけを延ばす（C-0129。クルミの
 * ハッキングの録画 057〜062）。刻みは最初の発火のまま続き、最後の発火が単独なら出したはずの最後の tick の時刻まで出る。
 * 再発火が無ければ（ニヒリスターの火傷）、発火ごとの 10 回のまま
 */
export function dotTickFrames(
  fires: readonly number[],
  intervalSeconds: number,
  durationSeconds: number,
  frames: number,
  firstTick: DotFirstTick = 'atApplication',
): number[] {
  return dotTicks(fires, intervalSeconds, durationSeconds, frames, firstTick).map((t) => t.frame);
}

/** レイヴン編: 持続ダメージの 1 tick（フレームと、その時点のスタックの数） */
export type DotTick = { frame: number; stacks: number };

/**
 * レイヴン編（plan/design-raven-s1.md 4 節・8 節の 1）: 持続ダメージの tick のフレームと、その時点のスタックの数。
 * フレームの規則は dotTickTracker（dotTickFrames と同じ）。スタックの数は、いまのまとまり（維持の途中の再発火として
 * まとめた発火の列）のうち tick のフレームまでの発火の数（同じフレームの発火も数える）で、maxStacks で止める。
 * 既定の 1 なら、スタックしない持続ダメージ（どの tick も 1）。fires は昇順
 */
export function dotTicks(
  fires: readonly number[],
  intervalSeconds: number,
  durationSeconds: number,
  frames: number,
  firstTick: DotFirstTick = 'atApplication',
  maxStacks = 1,
): DotTick[] {
  const tracker = dotTickTracker(intervalSeconds, durationSeconds, frames, firstTick);
  const out: DotTick[] = [];
  let groupFires: number[] = [];
  let groupTicks: number[] = [];
  const flush = (): void => {
    let n = 0;
    for (const frame of groupTicks) {
      while (n < groupFires.length && groupFires[n]! <= frame) n += 1;
      out.push({ frame, stacks: Math.min(n, maxStacks) });
    }
  };
  for (const f of fires) {
    const r = tracker.fire(f);
    if (r.newGroup) {
      flush();
      groupFires = [];
      groupTicks = [];
    }
    groupFires.push(f);
    groupTicks.push(...r.ticks);
  }
  flush();
  return out;
}

/**
 * クルミ S2 編（plan/design-kurumi-s2.md 2.3 節）: 持続ダメージが敵に「付いている」区間の列。まとまり（維持の途中の付け直しで
 * つながった発火の列。dotTickTracker と同じ規則）ごとに、最初の発火のフレームから最後の tick のフレームまで（両端を含む）。
 * 最後の tick は戦闘の終わりで切らない（終わりの後の判定は起きないので）。fires は昇順
 */
export function dotActiveSpans(
  fires: readonly number[],
  intervalSeconds: number,
  durationSeconds: number,
  firstTick: DotFirstTick = 'atApplication',
): { start: number; end: number }[] {
  const tracker = dotTickTracker(intervalSeconds, durationSeconds, Number.POSITIVE_INFINITY, firstTick);
  const spans: { start: number; end: number }[] = [];
  for (const f of fires) {
    const r = tracker.fire(f);
    if (r.newGroup) spans.push({ start: f, end: f });
    const span = spans[spans.length - 1]!;
    span.end = Math.max(span.end, f, ...r.ticks);
  }
  return spans;
}

/** レイヴン編: 発火を 1 つずつ受けて、新しく決まった tick のフレームを返す（newGroup は新しいまとまりの最初の発火か） */
export type DotTickTracker = { fire(frame: number): { ticks: number[]; newGroup: boolean } };

/**
 * レイヴン編（plan/design-raven-s1.md 8 節の 2）: 持続ダメージのまとまりの規則を 1 か所に置いた追跡。dotTicks（ループの後）と
 * 1 パス目のゲージの予約（frame/firstPass.ts。ループの中）の両方が使う。発火は昇順に渡す。
 * 新しいまとまりなら起点から終わりまで、維持の途中の再発火（付け直し）なら延びた分だけの tick を返す。返した tick は変わらない
 * （終わりは延びるだけ）。返す tick が発火より前になることがある（atApplication で、最後の tick の位置が維持より短いとき）ので、
 * ループの中で後から予約する使い方は afterInterval で維持が間隔の整数倍のときだけ（skills/burstDamage.ts の resolveDotEffects が見る）
 */
export function dotTickTracker(
  intervalSeconds: number,
  durationSeconds: number,
  frames: number,
  firstTick: DotFirstTick = 'atApplication',
): DotTickTracker {
  const count = Math.floor(durationSeconds / intervalSeconds + 1e-9);
  // クルミ編: afterInterval は付いた 1 間隔後から間隔ごと（k + 1 間隔後。C-0130）。どちらも時刻に達した最初のフレーム（C-0454）
  const offset = (k: number): number =>
    firstTick === 'afterInterval'
      ? gameSecondsToFirstFrame((k + 1) * intervalSeconds)
      : k === 0
        ? 0
        : gameSecondsToFirstFrame(k * intervalSeconds + DOT_LATER_TICK_DELAY_SECONDS) - 1;
  const lastOffset = offset(count - 1);
  const durationFrames = gameSecondsToFrame(durationSeconds);
  let active = false;
  let anchor = 0;
  let last = 0;
  let k = 0;
  return {
    fire(frame) {
      // 維持の途中の再発火は、まとまりの最初の発火を刻みの起点のまま、終わりだけを延ばす（C-0129）
      const newGroup = !active || frame >= last + durationFrames;
      if (newGroup) {
        active = true;
        anchor = frame;
        k = 0;
      }
      last = frame;
      const end = last + lastOffset;
      const ticks: number[] = [];
      for (;;) {
        // 1 回目の後は、k 回目の時刻を起点から数える（間隔の切り上げを積み重ねない）
        const tick = anchor + offset(k);
        if (tick > end || tick >= frames) break;
        ticks.push(tick);
        k += 1;
      }
      return { ticks, newGroup };
    },
  };
}
