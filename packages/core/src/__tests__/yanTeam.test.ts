// ヤン編（V-0836）: ヤン（201）を含む編成で、S1 のフルバースト開始時の味方全体へのチャージダメージ▲（10 秒）と、S2 のフルチャージの
// 発の後の味方全体への攻撃力▲・会心率▲（5 秒）と、バーストの 1 ヒットが意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { burstDelaysOf } from '../burst/landing.ts';
import { burstHitsOfSlot } from '../burst/schedule.ts';
import type { EnemyInput } from '../damage.ts';
import { planTeamRun } from '../frame/plan.ts';
import { fullChargeFrameSet } from '../frame/shots.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { rawDefinition } from './data.ts';
import { characterOf, fixedSlot, fixedTeam, rangeEnemyWithEvents } from './teamHelpers.ts';

const YAN = 201;
const SOLDIER_FA = 301;
const RAVEN = 851;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents();
const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });

describe('ヤンの定義', () => {
  const def = parseSkillDefinition(rawDefinition(YAN));

  it('defines S1, S2 and the Burst Skill damage, and leaves the forced movement out of scope', () => {
    expect(def.skills.skill1.support).toBe('supported');
    expect(def.skills.skill1.effects.map((e) => e.kind === 'timed' && e.stat)).toEqual(['chargeDamage']);
    expect(def.skills.skill2.support).toBe('supported');
    expect(def.skills.skill2.effects.map((e) => e.kind === 'timed' && e.stat)).toEqual(['attack', 'critRate']);
    expect(def.skills.burst.support).toBe('supported');
    expect(def.skills.burst.effects.map((e) => e.kind)).toEqual(['burstDamage']);
    expect(def.skills.burst.notes?.map((n) => n.kind)).toEqual(['outOfScope']);
  });
});

/** 編成とヤンの枠 */
const CASES: Record<string, { input: TeamInput; yan: number }> = {
  '撮影の編成（ソルジャーF.A. + レイヴン + ヤン（操作）。V-0836）': {
    input: fixedTeam([SOLDIER_FA, RAVEN, YAN].map(autoSlot), 2, { enemy: rangeEnemy }),
    yan: 2,
  },
  '実戦寄り（ヤン + クラウン + アリス + マクスウェル + リター）': {
    input: fixedTeam([YAN, 330, 191, 102, 82], 2),
    yan: 0,
  },
};

describe.each(Object.entries(CASES))('編成: %s', (_name, { input, yan }) => {
  const plan = planTeamRun(input);
  const isFull = fullChargeFrameSet(plan.shots[yan]!);
  const fullChargeShots = plan.shots[yan]!.frames.filter(isFull);
  const fullBursts = plan.schedule!.fullBurstWindows;
  const fullChargeNext = new Set(fullChargeShots.map((f) => f + 1));

  it('gives Charge Damage up to every ally at every Full Burst start, for 10 s', () => {
    expect(fullBursts.length).toBeGreaterThan(2);
    for (const holder of input.slots.keys()) {
      const items = itemsOf(plan.history, {
        sourceSlotIndex: yan,
        holder,
        kind: 'timed',
        skill: 'skill1',
        stat: 'chargeDamage',
      });
      expect(items.map((w) => w.start)).toEqual(fullBursts.map((w) => w.start));
      for (const w of items) if (w.end < plan.frames) expect(w.end - w.start).toBe(gameSecondsToFrames(10));
    }
  });

  it('gives ATK and Crit Rate up to every ally from the frame after each Full Charge shot', () => {
    expect(fullChargeShots.length).toBeGreaterThan(20);
    for (const stat of ['attack', 'critRate'] as const) {
      for (const holder of input.slots.keys()) {
        const items = itemsOf(plan.history, { sourceSlotIndex: yan, holder, kind: 'timed', skill: 'skill2', stat });
        // 付け直しは 1 つの窓にまとまる。窓はどれもフルチャージの発の次のフレームに始まり、窓の中の最後の発から 5 秒で切れる
        for (const w of items) {
          expect(fullChargeNext.has(w.start)).toBe(true);
          const last = Math.max(...fullChargeShots.filter((f) => w.start <= f + 1 && f + 1 < w.end));
          if (w.end < plan.frames) expect(w.end).toBe(last + 1 + gameSecondsToFrames(5));
        }
        for (const f of fullChargeShots) expect(items.some((w) => w.start <= f + 1 && f + 1 < w.end)).toBe(true);
      }
    }
    // 戦闘の最初のフルチャージの発には乗らない
    const own = itemsOf(plan.history, {
      sourceSlotIndex: yan,
      holder: yan,
      kind: 'timed',
      skill: 'skill2',
      stat: 'attack',
    });
    expect(own[0]!.start).toBeGreaterThan(fullChargeShots[0]!);
  });

  it('deals one Burst Skill hit per own activation', () => {
    const activations = plan.schedule!.activations.filter((a) => a.slotIndex === yan);
    expect(activations.length).toBeGreaterThan(0);
    const landed = burstHitsOfSlot(plan.schedule!, yan, plan.frames);
    // 戦闘の終わりの間際の発動は、ヒットが戦闘の外に出ることがある
    expect(landed.length).toBeGreaterThanOrEqual(activations.length - 1);
    expect(landed.length).toBeLessThanOrEqual(activations.length);
    // 遅れの表の行: I の六角形の替わり目から 1f（C-1457）
    expect(burstDelaysOf(characterOf(YAN)).hitFrames).toBe(1);
    expect(landed.map((h) => h.share)).toEqual(landed.map(() => 1));
    expect(plan.skillHits.filter((h) => h.slotIndex === yan)).toEqual([]);
  });
});
