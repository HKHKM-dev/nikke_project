// フローラ編（plan/design-adjacent-allies.md）: フローラ（411）を含む編成で、両隣の味方への付与（心の平和・持続回復）、
// S1 のスタック量▲（電撃コードの味方の全部のスタック可能バフ）、宝物版のバースト 2 段階突入の最大HP のみ▲ → 両隣の HP の割合 →
// S2 のバリア → バリア適用時の攻撃力▲、最大HP のみ▲ の終わり → HP が最大になった時の防御力無視ダメージ▲、が意図どおりに出るか（V-0776）
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import type { TreasurePhase } from '../skills/treasure.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { describeEveryShotInOneGroup, fixedSlot, fixedTeam, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

const FLORA = 411;
const EXIA = 210;
const BESTI_TU = 94;

/**
 * 撮影の編成（エクシア（宝物版）・フローラ（真ん中）・ベスティー：タクティカル・アップ（操作））。noBurstSlots はバーストを使わない枠
 * （全部ならバーストなし）
 */
function rangeTeam(floraPhase: TreasurePhase, noBurstSlots?: readonly number[]): TeamInput {
  const exia: TeamSlotInput = fixedSlot(EXIA);
  exia.skills!.treasurePhase = 3;
  const flora: TeamSlotInput = fixedSlot(FLORA);
  flora.skills!.treasurePhase = floraPhase;
  return {
    slots: [exia, flora, fixedSlot(BESTI_TU)],
    enemy: SHOOTING_RANGE_ENEMY,
    durationSeconds: 180,
    burst: noBurstSlots === undefined || noBurstSlots.length < 3,
    controlledSlot: 2,
    ...(noBurstSlots === undefined || noBurstSlots.length === 3 ? {} : { noBurstSlots }),
  };
}

const E = 0;
const F = 1;
const B = 2;

describe('撮影の編成・宝物版（エクシアのバーストだけ使う）', () => {
  const plan = planTeamRun(rangeTeam(3, [F, B]));
  const peace = itemsOf(plan.history, { kind: 'state', state: 'heartOfPeace' });
  const maxHpOnly = itemsOf(plan.history, { sourceSlotIndex: F, kind: 'timed', stat: 'maxHpOnly' });
  const barrier = itemsOf(plan.history, { sourceSlotIndex: F, kind: 'state', state: 'barrier' });
  const attack = itemsOf(plan.history, { sourceSlotIndex: F, kind: 'timed', skill: 'skill2', stat: 'attack' });
  const trueDamage = itemsOf(plan.history, { sourceSlotIndex: F, kind: 'timed', skill: 'skill2', stat: 'trueDamage' });
  const exiaUses = plan.schedule!.activations.filter((a) => a.slotIndex === E);

  it('gives Peace of Mind to Flora and both adjacent allies for the whole battle', () => {
    expect([...new Set(peace.map((w) => w.holder))].sort()).toEqual([E, F, B]);
    for (const w of peace) expect(w.start).toBe(0);
  });

  it('raises max HP only of the Peace of Mind allies for 2 s on each Burst Stage 2 entry', () => {
    expect(exiaUses.length).toBeGreaterThan(0);
    expect([...new Set(maxHpOnly.map((w) => w.holder))].sort()).toEqual([E, F, B]);
    const onExia = maxHpOnly.filter((w) => w.holder === E);
    expect(onExia.length).toBe(exiaUses.length);
    for (const w of onExia) expect(w.end - w.start).toBe(gameSecondsToFrames(2));
  });

  it('puts a barrier on all allies when an adjacent ally drops to 90% or below', () => {
    const onBesti = barrier.filter((w) => w.holder === B);
    expect(onBesti.length).toBe(exiaUses.length);
    // 最大HP のみ▲ の始まりの次のフレームに割合が下がる
    onBesti.forEach((w, k) => {
      const up = maxHpOnly.filter((m) => m.holder === E)[k]!;
      expect(w.start).toBeGreaterThan(up.start);
      expect(w.start - up.start).toBeLessThanOrEqual(2);
    });
  });

  it('raises attack of the Peace of Mind allies when the barrier lands on Flora', () => {
    expect([...new Set(attack.map((w) => w.holder))].sort()).toEqual([E, F, B]);
    const onBesti = attack.filter((w) => w.holder === B);
    const barrierOnFlora = barrier.filter((w) => w.holder === F);
    expect(onBesti.map((w) => w.start)).toEqual(barrierOnFlora.map((w) => w.start));
  });

  it('raises True Damage of all allies when the max HP increase ends (HP back to max)', () => {
    // 戦闘開始時の持続回復の件（0 から）のほかは、最大HP のみ▲ の終わりから
    const onBesti = trueDamage.filter((w) => w.holder === B && w.start > 0);
    const ends = maxHpOnly.filter((m) => m.holder === E).map((m) => m.end);
    expect(onBesti.length).toBe(ends.length);
    onBesti.forEach((w, k) => {
      expect(w.start - ends[k]!).toBeGreaterThanOrEqual(0);
      expect(w.start - ends[k]!).toBeLessThanOrEqual(2);
    });
    // 戦闘の終わりで切れた最後の件のほかは 10 秒
    for (const w of onBesti.slice(0, -1)) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
  });
});

describe('撮影の編成・宝物版（バーストを使わない）', () => {
  const plan = planTeamRun(rangeTeam(3, [E, F, B]));
  const ownStacks = itemsOf(plan.history, { holder: E, kind: 'state', state: 'collectHackingCode' });
  const allyAttack = itemsOf(plan.history, { sourceSlotIndex: E, holder: E, kind: 'timed', stat: 'attack' });
  const without = (() => {
    const input = rangeTeam(3, [E, F, B]);
    input.slots[F]!.skills!.definition = {
      ...input.slots[F]!.skills!.definition!,
      treasureSkills: undefined,
      skills: {
        ...input.slots[F]!.skills!.definition!.skills,
        skill1: { ...input.slots[F]!.skills!.definition!.skills.skill1, effects: [] },
      },
    };
    input.slots[F]!.skills!.treasurePhase = 0;
    const p = planTeamRun(input);
    return itemsOf(p.history, { sourceSlotIndex: E, holder: E, kind: 'timed', stat: 'attack' });
  })();

  it('fires no barrier without a Burst Stage 2 entry', () => {
    expect(itemsOf(plan.history, { sourceSlotIndex: F, kind: 'state', state: 'barrier' })).toEqual([]);
  });

  it('raises True Damage of all allies for 10 s from the start of battle (the heal over time at full HP)', () => {
    const td = itemsOf(plan.history, { sourceSlotIndex: F, holder: B, kind: 'timed', stat: 'trueDamage' });
    expect(td.map((w) => [w.start, w.end])).toEqual([[0, gameSecondsToFrames(10)]]);
  });

  it('adds stacks to the stackable buffs of Electric Code allies (state and timed)', () => {
    expect(Math.max(...ownStacks.map((w) => w.stack ?? 1))).toBe(5);
    const top = (items: { stack?: number }[]) => Math.max(...items.map((w) => w.stack ?? 1));
    // エクシアの宝物版 S2 の timed（最後の弾丸ごと・15 秒）は、自分の発だけより早く段が上がる
    const firstFull = (items: { start: number; stack?: number }[]) =>
      items.find((w) => w.stack === 5)?.start ?? Infinity;
    expect(top(allyAttack)).toBe(5);
    expect(firstFull(allyAttack)).toBeLessThan(firstFull(without));
  });
});

describeEveryShotInOneGroup({
  '撮影の編成・宝物版': rangeTeam(3),
  '撮影の編成・基礎版': rangeTeam(0),
  '実戦寄り（リター + フローラ + 紅蓮 + アリス + クラウン）': fixedTeam([82, FLORA, 222, 191, 330], 2),
});
