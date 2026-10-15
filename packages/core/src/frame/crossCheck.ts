// 持ち主ごとの一覧編（plan/design-holder-effects.md 論点 6、3 節の段 A・B）: 新旧の比べ。
// 旧の実装（frame/legacyFirstPass.ts の 1 パス目と skills/timeline.ts の planBuffTimeline）も回し、1 パス目の結果・BuffTimeline・
// 倍率ダメージの発動を、時刻の順に揃えて比べる。値は足し算の順で生じる差（相対 1e-12）だけを許し、食い違えば例外にする。
// スイッチは、テストの準備（crossCheck.setup.ts）と記録の道具（records-check.ts・records-minimal.ts）からだけ入れる（画面の計算には
// 入れない）。段 B で旧の実装ごと消す。
import type { BurstSchedule } from '../burst/schedule.ts';
import { isStateContent, type WindowEffect } from '../skills/resolve.ts';
import {
  planBuffTimeline,
  type BuffTimeline,
  type BuffWindow,
  type TimelineLandings,
  type TimelineSlot,
} from '../skills/timeline.ts';
import type { FirstPassOptions, FirstPassResult } from './firstPass.ts';
import { runFirstPassLegacy } from './legacyFirstPass.ts';
import type { ShotLog } from './shots.ts';

let enabled = false;

/** 新旧の比べを入れる（テストの準備と記録の道具からだけ呼ぶ） */
export function enableLegacyCrossCheck(): void {
  enabled = true;
}

export function legacyCrossCheckEnabled(): boolean {
  return enabled;
}

/** 足し算の順で生じる差の許容（相対。0 の近くは絶対） */
const TOLERANCE = 1e-12;

function sameNumber(a: number, b: number): boolean {
  if (Object.is(a, b) || a === b) return true;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

/** 最初の食い違い（path と値）。無ければ null。undefined のキーと無いキーは同じとみなす */
export function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (typeof a === 'number' && typeof b === 'number') return sameNumber(a, b) ? null : `${path}: ${a} ≠ ${b}`;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: 配列とそれ以外`;
    if (a.length !== b.length) return `${path}.length: ${a.length} ≠ ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDifference(a[i], b[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map)) return `${path}: Map とそれ以外`;
    return firstDifference([...a.entries()], [...b.entries()], path);
  }
  if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object') {
    const ra = a as Record<string, unknown>;
    const rb = b as Record<string, unknown>;
    for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (ra[key] === undefined && rb[key] === undefined) continue;
      const d = firstDifference(ra[key], rb[key], `${path}.${key}`);
      if (d !== null) return d;
    }
    return null;
  }
  return Object.is(a, b) ? null : `${path}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`;
}

type Key = readonly (number | string)[];

function compareKeys(a: Key, b: Key): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity;
    const y = b[i] ?? -Infinity;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}

function sortedBy<T>(xs: readonly T[], key: (x: T) => Key): T[] {
  return xs
    .map((x) => ({ x, k: key(x) }))
    .sort((a, b) => compareKeys(a.k, b.k))
    .map(({ x }) => x);
}

function effectKey(e: WindowEffect): Key {
  return [e.source.resourceId, e.source.skill, e.effectIndex, isStateContent(e) ? e.subIndex : -1, e.stat, e.value];
}

type WindowLike = Pick<BuffWindow, 'slotIndex' | 'sourceSlotIndex' | 'start' | 'end' | 'stack'> & {
  effect: WindowEffect;
};

function windowKey(w: WindowLike): Key {
  return [w.start, w.end, w.slotIndex, w.sourceSlotIndex, w.stack ?? 0, ...effectKey(w.effect)];
}

/** 区間の中の効果の並び（作った順と時刻の順）と、攻撃力▲の内訳の並びを揃える */
function canonicalSegments(segments: BuffTimeline['segments']): unknown {
  return segments.map((segment) => ({
    ...segment,
    slots: segment.slots.map((slot) =>
      slot === null
        ? null
        : {
            ...slot,
            buffs: {
              ...slot.buffs,
              attackParts: sortedBy(slot.buffs.attackParts, (p) => [p.source, p.ratio, p.flat, p.self ? 1 : 0]),
            },
            timedEffects: sortedBy(slot.timedEffects, (e) => [e.sourceSlotIndex, ...effectKey(e), e.appliedAmount]),
          },
    ),
  }));
}

/** BuffTimeline を時刻の順に揃えたもの（並び以外は変えない） */
function canonicalTimeline(t: BuffTimeline): unknown {
  return {
    frames: t.frames,
    segments: canonicalSegments(t.segments),
    windows: sortedBy(t.windows, windowKey),
    passive: t.passive,
    heals: sortedBy(t.heals, (h) => [h.frame, h.sourceSlotIndex, h.slotIndex]),
    rankings: sortedBy(t.rankings, (r) => [r.frame, r.sourceSlotIndex, r.effect.source.skill, r.effect.effectIndex]),
    stateWindows: sortedBy(t.stateWindows, windowKey),
    conditionSkips: sortedBy(t.conditionSkips, (s) => [
      s.frame,
      s.sourceSlotIndex,
      s.effect.source.skill,
      s.effect.effectIndex,
      s.state ?? '',
    ]),
    cycleWindows: sortedBy(t.cycleWindows, (w) => [w.start, w.end, w.slotIndex, w.source.skill, w.effectIndex]),
    applications: sortedBy(t.applications, (a) => [a.frame, a.sourceSlotIndex, a.slotIndex, a.state]),
    namedStateWindows: sortedBy(t.namedStateWindows, (w) => [
      w.start,
      w.end,
      w.slotIndex,
      w.sourceSlotIndex,
      w.state,
      w.stack ?? 0,
    ]),
  };
}

/** 新旧に共通の 1 パス目の結果の欄（履歴は新だけ） */
type SharedFirstPass = Omit<FirstPassResult, 'history'>;

/** 1 パス目の結果のうち、旧の実装と同じ意味を持つ欄（状態の窓は、旧が追っていた状態だけを比べる） */
function canonicalFirstPass(r: SharedFirstPass, legacy: SharedFirstPass | null): unknown {
  return {
    frames: r.frames,
    shots: r.shots,
    schedule: r.schedule,
    instants: r.instants,
    cycleGaugeHits: r.cycleGaugeHits,
    dotGauges: r.dotGauges,
    shotGauges: r.shotGauges,
    firingWindows: sortedBy(r.firingWindows, windowKey),
    rankAttackWindows: sortedBy(r.rankAttackWindows, windowKey),
    hitWindows: sortedBy(r.hitWindows, windowKey),
    // 新は時間で変わる状態をすべて出す。旧が追っていた状態（出どころ × 状態）だけを比べる
    namedStateWindows: sortedBy(
      legacy === null
        ? r.namedStateWindows
        : r.namedStateWindows.filter((w) =>
            legacy.namedStateWindows.some((x) => x.sourceSlotIndex === w.sourceSlotIndex && x.state === w.state),
          ),
      (w) => [w.start, w.end, w.slotIndex, w.sourceSlotIndex, w.state, w.stack ?? 0],
    ),
  };
}

export type LegacyCrossCheckInput<Hit> = {
  slots: readonly TimelineSlot[];
  options: FirstPassOptions;
  result: FirstPassResult;
  timeline: BuffTimeline;
  landings: TimelineLandings | null;
  sustainedHitRateUp: boolean;
  /** 倍率ダメージの発動（新の結果と、旧の時刻表から作る関数） */
  skillHits: readonly Hit[];
  skillHitsOf: (timeline: BuffTimeline, schedule: BurstSchedule | null, shots: readonly (ShotLog | null)[]) => Hit[];
};

/** 旧の実装を回して比べる。食い違えば例外 */
export function crossCheckLegacy<Hit>(input: LegacyCrossCheckInput<Hit>): void {
  const { slots, options, result, timeline } = input;
  const legacy = runFirstPassLegacy(slots, options);
  const fail = (what: string, d: string): never => {
    throw new Error(`新旧の比べ（plan/design-holder-effects.md 論点 6）で ${what} が食い違う: ${d}`);
  };
  const first = firstDifference(canonicalFirstPass(legacy, null), canonicalFirstPass(result, legacy), 'firstPass');
  if (first !== null) fail('1 パス目', first);
  const legacyTimeline = planBuffTimeline(
    slots,
    legacy.schedule,
    options.frames,
    legacy.shots,
    input.landings,
    input.sustainedHitRateUp,
  );
  const t = firstDifference(canonicalTimeline(legacyTimeline), canonicalTimeline(timeline), 'timeline');
  if (t !== null) fail('BuffTimeline', t);
  const hits = firstDifference(
    input.skillHitsOf(legacyTimeline, legacy.schedule, legacy.shots),
    input.skillHits,
    'skillHits',
  );
  if (hits !== null) fail('倍率ダメージの発動', hits);
}
