// プロダクト12（303）を含む編成で、S1 の攻撃力▲（撃った通常攻撃 200 発ごとに 5 秒。C-1523）、S2 のクールタイムごとの
// 倍率ダメージ（印 cooldown: true の周期・発動の 32f 後のヒット・発動の時の値。C-1524・C-1525）、バーストのヒットの遅れ（C-1526）が
// 意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { characterOf, fixedSlot, fixedTeam, rawDefinition, rangeEnemyWithEvents, windowsFrom } from './teamHelpers.ts';

const PRODUCT12 = 303;
const COCOA = 311;
const SOLDIER_FA = 301;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  プロダクト12単騎: team([PRODUCT12], 0),
  'ココア + ソルジャーF.A. + プロダクト12（V-0855 の撮影 C の編成）': team([COCOA, SOLDIER_FA, PRODUCT12], 2),
};

describe('プロダクト12（303）の定義', () => {
  const def = parseSkillDefinition(rawDefinition(PRODUCT12));

  it('writes S1 on shots fired, S2 as a cooldown timer valued at activation, and the Burst delay', () => {
    expect(def.skills.skill1.effects[0]).toMatchObject({
      kind: 'timed',
      trigger: { count: 'normalShot', everyRef: 3 },
      target: 'self',
      stat: 'attack',
    });
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'damage',
      trigger: { everySeconds: 10, cooldown: true },
      damageType: 'skill',
      delayFrames: 32,
      valueBeforeFire: true,
    });
    // バーストは 1 ヒットで、III のタイマーの 00.00 から 7f（C-1526）
    expect(burstDelaysOf(characterOf(PRODUCT12))).toEqual({ hitFrames: 7, effectFrames: 0 });
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === PRODUCT12);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const shots = plan.shots[s]!.frames;

  it('gives Attack up from the frame after every 200th shot for 5 s, refreshed by the next within the window', () => {
    const windows = itemsOf(plan.history, { sourceSlotIndex: s, holder: s, kind: 'timed', skill: 'skill1' });
    const starts = shots.filter((_, i) => (i + 1) % 200 === 0).map((f) => f + 1);
    const expected: ReturnType<typeof windowsFrom> = [];
    for (const w of windowsFrom(starts, 5, plan.frames)) {
      const last = expected.at(-1);
      if (last !== undefined && w.start <= last.end) last.end = w.end;
      else expected.push(w);
    }
    // 200 発の間はリロードを挟むと 5 秒より長くなるので、窓は何回も切れる
    expect(expected.length).toBeGreaterThan(5);
    expect(windows.map(({ start, end }) => ({ start, end }))).toEqual(expected);
  });

  it('deals the S2 damage (109.09%) 32 f after every 10 s cooldown from the start of combat', () => {
    const s2 = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'skill2');
    // 10 秒（ceil で 589f）ごとの発動の 32f 後（C-1524）。180 秒で 17 回
    expect(s2).toHaveLength(17);
    expect(s2[0]!.frame).toBe(589 + 32);
    for (const h of s2) expect(h.hit.multiplier).toBeCloseTo(1.0909, 6);
    const gaps = s2.slice(1).map((h, i) => h.frame - s2[i]!.frame);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(589);
  });

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  if (input.slots.length === 1) {
    it('never uses Burst III alone', () => {
      expect(bursts).toEqual([]);
    });
  } else {
    it('uses Burst III in the chain', () => {
      expect(bursts.length).toBeGreaterThan(2);
    });
  }
});
