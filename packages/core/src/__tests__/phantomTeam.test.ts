// ファントム（580。V-0839）を含む編成で、S1 の予告状（敵の防御力▼。付いていない時の命中で付く）と怪盗の短剣（命中率▲のスタック）、
// 1 発間の攻撃ダメージ▲、宝物版 S1 の 30 回命中の短剣、S2 の短剣のフルスタックの消費（追加ダメージ・予告状の解除・分配ダメージ▲の
// スタック・宝物版の分配ダメージ）と 10 回攻撃の▲、バーストでの分配ダメージ▲の解除が意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput } from '../team.ts';
import { rawDefinition } from './data.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const PHANTOM = 580;
const LITER = 82;
const DELTA = 20;

describe('ファントムの定義', () => {
  const def = parseSkillDefinition(rawDefinition(PHANTOM));

  it('defines every slot of both versions', () => {
    expect(def.skills.skill1.effects.map((e) => e.kind)).toEqual(['state', 'state']);
    expect(def.skills.skill2.effects.map((e) => e.kind)).toEqual([
      'damage',
      'removeState',
      'state',
      'removeState',
      'timed',
      'timed',
    ]);
    expect(def.treasureSkills?.skill1?.effects.map((e) => e.kind)).toEqual(['state', 'state', 'state']);
    expect(def.treasureSkills?.skill2?.effects.map((e) => e.kind)).toEqual([
      'damage',
      'removeState',
      'state',
      'removeState',
      'damage',
      'timed',
      'timed',
    ]);
    // S1 の 1 発間の攻撃ダメージ▲は未対応（V-0839）
    expect(def.skills.skill1.support).toBe('partial');
    expect(def.treasureSkills?.skill1?.support).toBe('partial');
    for (const slot of ['skill2', 'burst'] as const) {
      expect(def.skills[slot].support).toBe('supported');
      expect(def.treasureSkills?.[slot]?.support).toBe('supported');
    }
  });
});

const slotOf = (id: number, treasurePhase: TreasurePhase) =>
  fixedSlot(id, { conditionMode: 'auto', ...(id === PHANTOM ? { treasurePhase } : {}) });
const team = (ids: number[], controlled: number, treasurePhase: TreasurePhase): TeamInput =>
  fixedTeam(
    ids.map((id) => slotOf(id, treasurePhase)),
    controlled,
    { enemy: rangeEnemyWithEvents() },
  );

const TEAMS: Record<string, TeamInput> = {
  '撮影 S の編成（ファントム単騎・宝物 2 段階）': team([PHANTOM], 0, 2),
  '撮影 B の編成（リター + デルタ + ファントム・宝物 2 段階）': team([LITER, DELTA, PHANTOM], 2, 2),
  'ファントム単騎（基礎版）': team([PHANTOM], 0, 0),
  'リター + デルタ + ファントム（宝物 3 段階）': team([LITER, DELTA, PHANTOM], 2, 3),
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === PHANTOM);
  const treasure = (input.slots[s]!.skills!.treasurePhase ?? 0) >= 1;
  const sim = runSimulation(input);
  const items = (filter: Parameters<typeof itemsOf>[1]) => itemsOf(sim.history, { sourceSlotIndex: s, ...filter });
  const card = items({ kind: 'state', state: 'callingCard' });
  const dagger = items({ holder: s, kind: 'state', state: 'thiefsDagger' });
  const vision = items({ holder: s, kind: 'state', state: 'thiefsVision' });
  const consumed = sim.history.fullStacks.filter((x) => x.slotIndex === s && x.state === 'thiefsDagger');
  const s2Hits = sim.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'skill2');
  const bursts = sim.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];

  it('keeps the Calling Card on the enemy without overlapping, with Thief’s Dagger stacking to 3', () => {
    expect(card.length).toBeGreaterThan(0);
    card.slice(1).forEach((w, k) => expect(w.start).toBeGreaterThanOrEqual(card[k]!.end));
    expect(Math.max(...dagger.map((w) => w.stack ?? 1))).toBe(treasure ? 3 : 1);
  });

  it('consumes the full Dagger only in the treasure version, with the S2 hits, Calling Card removal and Distributed Damage stacks', () => {
    if (!treasure) {
      // 基礎版は、予告状と短剣が同じ発で付いて同じフレームに切れるので、短剣が 2 段に届かない（設計書 2.5 節）
      expect(consumed).toEqual([]);
      expect(s2Hits).toEqual([]);
      expect(vision).toEqual([]);
      return;
    }
    expect(consumed.length).toBeGreaterThan(5);
    const frames = consumed.map((x) => x.frame);
    // 追加ダメージは消費のフレーム、分配ダメージ（宝物版）はその 5 フレーム後（V-0839）
    expect(s2Hits.map((h) => h.frame).sort((a, b) => a - b)).toEqual(
      frames.flatMap((f) => [f, f + 5]).filter((f) => f < sim.history.frames),
    );
    for (const f of frames) {
      // 予告状は消費の次のフレームで外れる（同じ発で付いた件も）
      expect(card.some((w) => w.start <= f + 1 && f + 1 < w.end)).toBe(false);
      // 分配ダメージ▲は消費のフレームから付いている
      expect(vision.some((w) => w.start <= f && f < w.end)).toBe(true);
    }
    // 消費ごとに 1 段ずつ上がり、上限は 3（自分のバーストで外れた後はまた 1 段から）
    const stackAt = (f: number) =>
      Math.max(0, ...vision.filter((w) => w.start <= f && f < w.end).map((w) => w.stack ?? 1));
    for (const f of frames) {
      const since = bursts.findLast((b) => b.frame < f)?.frame ?? -1;
      expect(stackAt(f)).toBe(Math.min(3, frames.filter((g) => g > since && g <= f).length));
    }
    expect(Math.max(...vision.map((w) => w.stack ?? 1))).toBe(3);
  });

  it('removes the Distributed Damage stacks on its own Burst', () => {
    for (const b of bursts) expect(vision.some((w) => w.start <= b.frame + 1 && b.frame + 1 < w.end)).toBe(false);
  });

  it('gives ATK and Distributed Damage up every 10 shots', () => {
    const shots = sim.shots[s]!.frames;
    const atk = items({ holder: s, kind: 'timed', skill: 'skill2', stat: 'attack' });
    expect(atk[0]!.start).toBe(shots[9]! + 1);
  });
});

describeEveryShotInOneGroup(TEAMS);
