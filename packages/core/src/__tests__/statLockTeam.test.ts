// 値の固定（plan/design-stat-lock.md）: ほかの効果からのリロード速度▲・チャージ速度▲を受ける編成で、エクシアの宝物版 S1・
// アスカ：WILLE の緊急修復のリロード速度の固定と、リバーレリオ・ラプンツェル：サンクチュアリのチャージ速度▲▼の無効が、味方の▲を
// 足さないか。編成は撮影（設計書 5.2 節）と同じ。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { TeamInput } from '../team.ts';
import { fixedSlot, rawDefinition, readJson } from './teamHelpers.ts';

const EXIA = 210;
const CROWN = 330;
const SOLINE = 71;
const FLOWER = 304;
const ASUKA_WILLE = 835;
const COCOA = 311;
const YUNI = 160;
const RAPUNZEL_S = 473;
const LIBERALIO = 262;
const SOLDIER_FA = 301;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: FIXED_SPEC_ENEMY_DEFENCE,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

type Raw = { skills: Record<string, { effects: Record<string, unknown>[] }>; treasureSkills?: Raw['skills'] };

/** 固定の印を外した定義（値 0 の固定は効果ごと外す）。足し合わせの読みと比べる */
function withoutLock(id: number): unknown {
  const copy = structuredClone(rawDefinition<Raw>(id));
  for (const slots of [copy.skills, copy.treasureSkills ?? {}]) {
    for (const entry of Object.values(slots)) {
      entry.effects = entry.effects.filter((e) => !(e.lock === true && e.ref === undefined));
      for (const e of entry.effects) delete e.lock;
    }
  }
  return copy;
}

function team(ids: number[], controlledSlot: number, unlocked?: number): TeamInput {
  return {
    slots: ids.map((id) => {
      const slot = {
        ...fixedSlot(id, { definition: id === unlocked ? withoutLock(id) : undefined }),
        conditionMode: 'auto' as const,
      };
      if (id === EXIA) slot.skills = { ...slot.skills!, treasurePhase: 3 };
      return slot;
    }),
    enemy: rangeEnemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot,
  };
}

/** 枠 s の、フルバーストの間のマガジンの中の発の間（リロードを挟む間は除く） */
function fullBurstIntervals(input: TeamInput, s: number): number[] {
  const plan = planTeamRun(input);
  const log = plan.shots[s]!;
  const last = new Set(log.lastShotFrames ?? []);
  return (plan.schedule?.fullBurstWindows ?? []).flatMap((w) => {
    const frames = log.frames.filter((f) => w.start <= f && f < w.end);
    return frames.slice(1).flatMap((f, i) => (last.has(frames[i]!) ? [] : [f - frames[i]!]));
  });
}

describe('エクシアの宝物版 S1 のリロード速度の固定（クラウン + ソリン + エクシア）', () => {
  /**
   * フルバーストの始まりから 10 秒の間の最初のマガジンの最終弾から、次の 1 発目まで（窓の後ろのほうの込めは、的のジャンプの狙えない
   * 窓で発の間が変わることがあるので見ない）
   */
  const reloadGaps = (input: TeamInput): number[] => {
    const plan = planTeamRun(input);
    const log = plan.shots[2]!;
    return (plan.schedule?.fullBurstWindows ?? []).flatMap((w) => {
      const f = (log.lastShotFrames ?? []).find((x) => w.start <= x && x < w.start + 600);
      return f === undefined ? [] : [log.frames.find((x) => x > f)! - f];
    });
  };

  it('keeps the reload at 95% (88 f from the last shot) inside Crown’s reload speed up', () => {
    const gaps = reloadGaps(team([CROWN, SOLINE, EXIA], 2));
    expect(gaps.length).toBeGreaterThan(3);
    for (const g of gaps) expect(g).toBe(88);
  });

  it('would shorten the reload if the reload speed ups were added', () => {
    const gaps = reloadGaps(team([CROWN, SOLINE, EXIA], 2, EXIA));
    expect(gaps.length).toBeGreaterThan(3);
    for (const g of gaps) expect(g).toBeLessThan(88);
  });
});

describe('アスカ：WILLE の緊急修復のリロード速度の固定（I-DOLL・フラワー + クラウン + アスカ：WILLE）', () => {
  /** 殲滅態勢の終わり（バーストの使用から 9 秒）に始まる込めの長さ（最後の発から込め終わりまで） */
  const emergencyReloads = (input: TeamInput): number[] => {
    const plan = planTeamRun(input);
    const log = plan.shots[2]!;
    return (plan.schedule?.activations ?? [])
      .filter((a) => a.slotIndex === 2)
      .map((a) => {
        const end = a.frame + 540;
        const before = log.frames.filter((f) => f <= end + 10).at(-1)!;
        return (log.reloadEnds ?? []).find((f) => f > before)! - before;
      });
  };

  it('reloads for 2.33 s × 0.4 (56 f) inside Crown’s reload speed up', () => {
    const reloads = emergencyReloads(team([FLOWER, CROWN, ASUKA_WILLE], 2));
    expect(reloads.length).toBeGreaterThan(2);
    for (const r of reloads) expect(r).toBe(56);
  });

  it('would reload at once if the reload speed ups were added', () => {
    const reloads = emergencyReloads(team([FLOWER, CROWN, ASUKA_WILLE], 2, ASUKA_WILLE));
    expect(reloads.length).toBeGreaterThan(2);
    for (const r of reloads) expect(r).toBeLessThan(10);
  });
});

describe('チャージ速度▲▼の無効（ココア + ユニ + ラプンツェル：サンクチュアリ + リバーレリオ）', () => {
  const ids = [COCOA, YUNI, RAPUNZEL_S, LIBERALIO];

  it('keeps Liberalio’s Full Burst intervals at 89 f under Yuni’s charge speed up', () => {
    const intervals = fullBurstIntervals(team(ids, 3), 3);
    expect(intervals.length).toBeGreaterThan(10);
    for (const d of intervals) expect(d).toBe(89);
    const summed = fullBurstIntervals(team(ids, 3, LIBERALIO), 3);
    expect(summed.length).toBeGreaterThan(10);
    for (const d of summed) expect(d).toBeLessThan(89);
  });

  it('keeps Rapunzel: Sanctuary’s Full Burst intervals at 82 f under Yuni’s charge speed up', () => {
    const intervals = fullBurstIntervals(team(ids, 2), 2);
    expect(intervals.length).toBeGreaterThan(10);
    for (const d of intervals) expect(d).toBe(82);
    const summed = fullBurstIntervals(team(ids, 2, RAPUNZEL_S), 2);
    expect(summed.length).toBeGreaterThan(10);
    for (const d of summed) expect(d).toBeLessThan(82);
  });
});

describe('チャージ速度▲▼の無効は、キューブのチャージ速度▲も止める（論点 2b）', () => {
  it('keeps Liberalio’s intervals at 89 f with a charge speed cube and no other charge speed effect', () => {
    const input = team([COCOA, SOLDIER_FA, LIBERALIO], 2);
    input.slots[2] = {
      ...input.slots[2]!,
      buildEffects: [
        { source: { kind: 'cube', name: { ja: 'ブースト', en: 'Boost' }, level: 1 }, stat: 'chargeSpeed', value: 0.1 },
      ],
    };
    const intervals = fullBurstIntervals(input, 2);
    expect(intervals.length).toBeGreaterThan(10);
    for (const d of intervals) expect(d).toBe(89);
  });
});
