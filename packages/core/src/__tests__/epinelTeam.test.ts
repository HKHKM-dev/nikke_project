// エピネル編（plan/design-epinel.md）: エピネル（241）を含む編成で、S2 の最後の弾丸の後の会心率▲・会心ダメージ▲（5 秒）と、
// バーストの 1 ヒットが意図どおりに出るか。S1 と、バーストのフルスタックの時の追加ダメージは前提の外（V-0806）
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { burstHitsOfSlot } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFirstFrame } from '../time.ts';
import { rawDefinition } from './data.ts';
import { characterOf, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const EPINEL = 241;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();

/** 撮影の編成（ココア + ソルジャーF.A. + エピネル（操作））。エピネルは 3 枠目 */
function rangeTeam(): TeamInput {
  const slots = [311, 301, EPINEL].map((id): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' }));
  return fixedTeam(slots, 2, { enemy: rangeEnemy });
}

describe('エピネルの定義', () => {
  const def = parseSkillDefinition(rawDefinition(EPINEL));

  it('defines S2 and the Burst Skill damage, and leaves S1 and the full-stack additional damage out of scope', () => {
    expect(def.skills.skill1.support).toBe('noEffect');
    expect(def.skills.skill1.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind === 'timed' && e.stat)).toEqual(['critRate', 'critDamage']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});

const CASES: Record<string, { input: TeamInput; slot: number }> = {
  撮影の編成: { input: rangeTeam(), slot: 2 },
  '実戦寄り（リター + クラウン + エピネル + アリス + ユニ）': {
    input: fixedTeam([82, 330, EPINEL, 191, 160], 2),
    slot: 2,
  },
};
/** S2 の維持（5 秒） */
const S2_DURATION = gameSecondsToFirstFrame(5);

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, slot }) => {
  const plan = planTeamRun(input);
  const ends = plan.shots[slot]!.lastShotFrames!;
  const s2 = (stat: 'critRate' | 'critDamage') =>
    itemsOf(plan.history, { sourceSlotIndex: slot, holder: slot, kind: 'timed', skill: 'skill2', stat });

  it('applies the S2 buffs from the frame after each last bullet', () => {
    expect(ends.length).toBeGreaterThan(20);
    for (const stat of ['critRate', 'critDamage'] as const) {
      const windows = s2(stat);
      expect(windows.map((w) => w.start)).toEqual(ends.map((f) => f + 1));
    }
  });

  it('ends each S2 window before the next last bullet (5 s is shorter than a magazine and its reload)', () => {
    const windows = s2('critDamage');
    windows.forEach((w, k) => {
      // 最後の弾丸の次のフレームから付き、最後の弾丸から 5 秒に達するフレームで切れる
      if (w.end < plan.frames) expect(w.end).toBe(ends[k]! + S2_DURATION);
      const next = ends[k + 1];
      if (next !== undefined) expect(w.end).toBeLessThanOrEqual(next);
    });
    // 1 マガジン目には付かない
    const shots = plan.shots[slot]!.frames;
    expect(windows[0]!.start).toBeGreaterThan(shots[0]!);
  });

  it('deals one Burst Skill hit per activation and no additional damage', () => {
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === slot);
    expect(activations.length).toBeGreaterThan(0);
    // 敵全体（単体の的）に 1 ヒット。倍率ダメージ（追加ダメージ）は出ない
    const landed = burstHitsOfSlot(plan.schedule!, slot, plan.frames);
    expect(landed.map((h) => h.share)).toEqual(landed.map(() => 1));
    // 遅れの表の行: III のタイマーの 00.00 から 39f（C-1361）
    expect(burstDelaysOf(characterOf(EPINEL)).hitFrames).toBe(39);
    expect(new Set(landed.map((h) => h.activationFrame)).size).toBe(landed.length);
    expect(plan.skillHits.filter((h) => h.slotIndex === slot)).toEqual([]);
  });
});
