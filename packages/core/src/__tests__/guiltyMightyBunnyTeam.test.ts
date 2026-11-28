// ギルティ：マイティバニー（404）の S1（攻撃力▲・バニーモード：スタンス）・S2（スタンスの間のチェーンエンハンス）・バースト（マイティストンプの
// 使用武器の変更と▲）を、撮影（V-0896）と同じ編成で見る。定義の書き方は plan/design-guilty-mighty-bunny.md 3 節
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { fullChargeFrameSet } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import type { HeldItemView } from '../skills/holders/history.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeRuns, fixedEnemy, fixedSlot, fixedTeam } from './teamHelpers.ts';

const GUILTY = 404;
const LUDMILLA = 190;
const DELTA = 20;

const enemy: EnemyInput = fixedEnemy({ element: 'Electronic' });

// 撮影 A（録画 1435・1436 の並び）: ギルティ：マイティバニー単騎（1 枠目・操作）。バースト I がいないのでバーストは起きない
const SOLO: TeamInput = fixedTeam([fixedSlot(GUILTY)], 0, { enemy });
// 撮影 B: ルドミラ（I）・デルタ（II）・ギルティ：マイティバニー（III・操作）
const CHAIN: TeamInput = fixedTeam(
  [LUDMILLA, DELTA, GUILTY].map((id) => fixedSlot(id)),
  2,
  { enemy },
);

const TEN_SECONDS = gameSecondsToFrames(10);

/** 件の効果の値（timed の件だけ） */
const valueOf = (item: HeldItemView): number | undefined =>
  item.origin.kind === 'timed' ? item.origin.effect.value : undefined;

describe.each([
  ['単騎（撮影 A）', SOLO, 0],
  ['チェーン（撮影 B）', CHAIN, 2],
] as const)('%s', (_name, team, g) => {
  const plan = planTeamRun(team);
  const end = plan.history.frames;

  it('holds Bunny Mode: Stance and the S1 ATK up and the Chain Enhance ups from the start to the end of battle', () => {
    for (const [skill, stat, value] of [
      ['skill1', 'attack', 0.201],
      ['skill2', 'attackDamage', 0.2045],
      ['skill2', 'chargeDamage', 0.4],
    ] as const) {
      const items = itemsOf(plan.history, { holder: g, sourceSlotIndex: g, skill, stat });
      expect(items.map((i) => [i.start, i.end])).toEqual([[0, end]]);
      expect(valueOf(items[0]!)).toBeCloseTo(value, 12);
    }
  });

  // 追加ダメージは遅れが無いので、発の 1 トリガーの値に畳み込まれる（区間の perShot）
  it('adds the Chain Enhance additional damage to every Full Charge shot (Mighty Stomp included)', () => {
    const result = runSimulation(team);
    const log = result.shots[g]!;
    const isFull = fullChargeFrameSet(log);
    const segments = result.slots[g]!.segments;
    const segmentAt = (f: number) => segments.find((s) => s.start <= f && f < s.end)!;
    const full = log.frames.filter(isFull);
    expect(full.length).toBeGreaterThan(50);
    for (const f of full) {
      const t = segmentAt(f).trigger;
      expect(t.perShot, `shot ${f}`).toBeGreaterThan(0);
      expect(t.perTrigger, `shot ${f}`).toBeCloseTo(t.normal + t.perShot, 6);
    }
  });
});

describe('マイティストンプ（撮影 B）', () => {
  const plan = planTeamRun(CHAIN);
  const log = plan.shots[2]!;
  const uses = plan.schedule!.activations.filter((a) => a.slotIndex === 2);
  const weapon = itemsOf(plan.history, { holder: 2, kind: 'timed', stat: 'weapon' });
  const stomps = log.weaponChangeShotFrames ?? [];

  it('changes the weapon at each burst of Guilty and fires exactly one Mighty Stomp in each window', () => {
    expect(uses.length).toBeGreaterThan(1);
    expect(weapon).toHaveLength(uses.length);
    expect(stomps).toHaveLength(uses.length);
    weapon.forEach((w, k) => {
      expect(w.start <= stomps[k]! && stomps[k]! < w.end).toBe(true);
      // 撃ち切りで終わり、次のフレームに基礎の SR に戻る
      expect(w.end).toBe(stomps[k]! + 1);
    });
  });

  it('keeps the burst charge damage up from the burst through Mighty Stomp only', () => {
    const ups = itemsOf(plan.history, { holder: 2, sourceSlotIndex: 2, skill: 'burst', stat: 'chargeDamage' });
    expect(ups).toHaveLength(uses.length);
    ups.forEach((u, k) => {
      expect(valueOf(u)).toBeCloseTo(14, 12);
      expect(u.start <= stomps[k]! && stomps[k]! < u.end).toBe(true);
      // マイティストンプの次の基礎の SR の発には乗らない
      const next = log.frames.find((f) => f > stomps[k]!);
      if (next !== undefined) expect(next).toBeGreaterThanOrEqual(u.end);
    });
  });

  it('gives the burst Attack Damage up for 10 s from each burst', () => {
    const ups = itemsOf(plan.history, { holder: 2, sourceSlotIndex: 2, skill: 'burst', stat: 'attackDamage' });
    expect(ups).toHaveLength(uses.length);
    for (const u of ups) {
      expect(valueOf(u)).toBeCloseTo(0.7735, 12);
      expect(u.end - u.start).toBe(TEN_SECONDS);
    }
  });
});

describeRuns({ SOLO, CHAIN });
