// ブリッド編（plan/design-brid.md）: ブリッド（70）を含む編成で、S1 の攻撃力▲（通常攻撃 30 発ごとに 10 秒）、S2 のクールタイムごとの
// 倍率ダメージ（印 cooldown: true の周期。C-1407）、バーストのダメージと、HP が最大の時の追加ダメージ（倍率ダメージの条件 selfHp。
// plan/design-soline.md 2.1 節）が意図どおりに出るか。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { hitFramesOf, isInFullBurst } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import {
  characterOf,
  describeEveryShotInOneGroup,
  fixedSlot,
  fixedTeam,
  rawDefinition,
  rangeEnemyWithEvents,
  windowsFrom,
} from './teamHelpers.ts';

const BRID = 70;
const COCOA = 311;
const SOLDIER_FA = 301;
const rangeEnemy: EnemyInput = rangeEnemyWithEvents({ defence: 100 });

const autoSlot = (id: number): TeamSlotInput => fixedSlot(id, { conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput =>
  fixedTeam(ids.map(autoSlot), controlledSlot, { enemy: rangeEnemy });

const TEAMS: Record<string, TeamInput> = {
  ブリッド単騎: team([BRID], 0),
  'ココア + ソルジャーF.A. + ブリッド（V-0821 の撮影 C の編成）': team([COCOA, SOLDIER_FA, BRID], 2),
};

describe('ブリッド（70）の定義', () => {
  const def = parseSkillDefinition(rawDefinition(BRID));

  it('writes S2 as a cooldown timer and the Burst additional damage per Burst hit with the at-least form of selfHp', () => {
    expect(def.skills.skill2.effects[0]).toMatchObject({
      kind: 'damage',
      trigger: { everySeconds: 10, cooldown: true },
      damageType: 'skill',
      delayFrames: 49,
    });
    // S2 のヒットは、ダメージと同じフレームに射手の 1 ヒットぶんのゲージを溜める（C-1431）
    expect(def.skills.skill2.effects[1]).toMatchObject({
      kind: 'burstGaugeHit',
      trigger: { everySeconds: 10, cooldown: true },
      delayFrames: 49,
    });
    expect(def.skills.burst.effects[1]).toMatchObject({
      kind: 'damage',
      trigger: 'burstUse',
      damageType: 'additional',
      perBurstHit: true,
      condition: { selfHp: { atLeast: 100 } },
    });
    // バーストは 1 ヒットで、III のタイマーの 00.00 から 41f（C-1408）
    expect(burstDelaysOf(characterOf(BRID))).toEqual({ hitFrames: 41, effectFrames: 0 });
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === BRID);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const shots = plan.shots[s]!.frames;

  it('gives Attack up from the frame after every 30th normal shot for 10 s, kept on by the next', () => {
    const windows = itemsOf(plan.history, { sourceSlotIndex: s, holder: s, kind: 'timed', skill: 'skill1' });
    const starts = shots.filter((_, i) => (i + 1) % 30 === 0).map((f) => f + 1);
    const expected: ReturnType<typeof windowsFrom> = [];
    for (const w of windowsFrom(starts, 10, plan.frames)) {
      const last = expected.at(-1);
      if (last !== undefined && w.start <= last.end) last.end = w.end;
      else expected.push(w);
    }
    // 付き直しの間（マガジンの中の 30 発と、リロードを挟んだ 30 発）は 10 秒より短いので、窓は 1 つに続く
    expect(expected).toHaveLength(1);
    expect(windows.map(({ start, end }) => ({ start, end }))).toEqual(expected);
  });

  it('deals the S2 damage (211.2%) 49 f after every 10 s cooldown from the start of combat', () => {
    const s2 = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'skill2');
    // 10 秒（ceil で 589f）ごとの発動の 49f 後（C-1407）。180 秒で 17 回
    expect(s2).toHaveLength(17);
    expect(s2[0]!.frame).toBe(589 + 49);
    for (const h of s2) expect(h.hit.multiplier).toBeCloseTo(2.112, 6);
    const gaps = s2.slice(1).map((h, i) => h.frame - s2[i]!.frame);
    for (const g of gaps) expect(g).toBeGreaterThanOrEqual(589);
  });

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  const additional = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'burst');
  if (input.slots.length === 1) {
    it('never uses Burst III alone', () => {
      expect(bursts).toEqual([]);
      expect(additional).toEqual([]);
    });
  } else {
    it('deals the additional damage (1440%) on the Burst hit at every Burst use, with the Full Burst bonus', () => {
      expect(bursts.length).toBeGreaterThan(2);
      expect(additional.map((h) => h.frame)).toEqual(bursts.flatMap(hitFramesOf));
      for (const h of additional) {
        expect(isInFullBurst(plan.schedule!, h.frame)).toBe(true);
        expect(h.hit.boost.fullBurst).toBe(0.5);
        expect(h.hit.multiplier).toBeCloseTo(14.4, 6);
      }
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
