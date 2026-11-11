// ソリン編（plan/design-soline.md）: ソリン（71）を含む編成で、S1 の攻撃速度▲（通常攻撃 40 発ごとに 3 秒）、S2 の HP が最大の時の
// クリティカル確率▲・クリティカルダメージ▲、バーストの 3 等分の 3 ヒット（C-1113）と、ヒットごとの追加ダメージ（C-1114）が意図どおりに
// 出るか。追加ダメージの「HP が最大の場合」（倍率ダメージの条件 selfHp。2.1 節）は、バーストを使ったフレームの HP の割合で見るので、
// 最大HP のみ▲ を配るエード（II）と組むと、どの回も出ない。射撃場の 3 分モード（条件は自動）で見る
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf, parseEnemyPresets } from '../enemies.ts';
import type { EnemyInput } from '../damage.ts';
import { burstDelaysOf } from '../burst/landing.ts';
import { hitFramesOf, isInFullBurst } from '../burst/schedule.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf, selfHpRatioOf } from '../skills/holders.ts';
import { resolveCondition } from '../skills/resolve.ts';
import { parseSkillDefinition, selfHpHolds } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { describeEveryShotInOneGroup, fixedSlot, readJson, windowsFrom } from './teamHelpers.ts';

const SOLINE = 71;
const IDOLL_FLOWER = 304;
const DELTA = 20;
const ADE = 310;

const master = parseEnemyPresets(readJson<Record<string, unknown>>('../../data/enemies.json'));
const profile = master.targetProfiles.find((p) => p.id === 'range-bigarms')!;
const rangeEnemy: EnemyInput = {
  defence: 100,
  element: 'Fire',
  hasCore: true,
  events: enemyEventsOf(master, ['range-3min-jump'], 180),
  target: profile,
  landings: enemyLandingsOf(master, ['range-3min-jump'], 180, profile),
};

const autoSlot = (id: number): TeamSlotInput => ({ ...fixedSlot(id), conditionMode: 'auto' });
const team = (ids: number[], controlledSlot: number): TeamInput => ({
  slots: ids.map(autoSlot),
  enemy: rangeEnemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot,
});

const TEAMS: Record<string, TeamInput> = {
  'ソリン単騎（録画 1013・1014 の編成）': team([SOLINE], 0),
  'I-DOLL・フラワー + デルタ + ソリン（録画 1103・1104 の編成）': team([IDOLL_FLOWER, DELTA, SOLINE], 2),
  'I-DOLL・フラワー + エード + ソリン（最大HP のみ▲ の味方）': team([IDOLL_FLOWER, ADE, SOLINE], 2),
};

describe('ソリン（71）の定義', () => {
  const def = parseSkillDefinition(readJson<unknown>('../../data/skills/71.json'));

  it('writes the additional damage per Burst hit with the at-least form of selfHp, and splits the Burst into three hits', () => {
    expect(def.skills.burst.effects[1]).toMatchObject({
      kind: 'damage',
      trigger: 'burstUse',
      damageType: 'additional',
      perBurstHit: true,
      condition: { selfHp: { atLeast: 100 } },
    });
    const character = readJson<CharacterData>('../../data/characters/71.json');
    expect(burstDelaysOf(character)).toEqual({ hitFrames: 17, effectFrames: 0, hitOffsets: [0, 20, 51] });
  });

  it('resolves atLeastRef to the value of the slot level, and judges the resolved at-least form', () => {
    const character = readJson<CharacterData>('../../data/characters/71.json');
    // 説明文の値を指す形（ブリッドなど）は、発火のフレームで見るためにスロットの Lv の値（% 表記）へ解く。S2 の値 1 を借りて確かめる
    const resolved = resolveCondition({ selfHp: { atLeastRef: 1 } }, character.skills.skill2, 10);
    expect(resolved).toEqual({ selfHp: { atLeast: 21.62 } });
    expect(selfHpHolds(resolved.selfHp!, 0.2162)).toBe(true);
    expect(selfHpHolds(resolved.selfHp!, 0.2161)).toBe(false);
    expect(() => selfHpHolds({ atLeastRef: 1 }, 1)).toThrow(/not resolved/);
  });

  it('rejects the at-most form of selfHp on a damage', () => {
    const raw = readJson<{ skills: { burst: { effects: Record<string, unknown>[] } } }>('../../data/skills/71.json');
    const copy = structuredClone(raw);
    copy.skills.burst.effects[1] = { ...copy.skills.burst.effects[1], condition: { selfHp: { atMost: 50 } } };
    expect(() => parseSkillDefinition(copy)).toThrow(/at-least form of selfHp/);
  });
});

describe.each(Object.entries(TEAMS))('編成: %s', (_name, input) => {
  const s = input.slots.findIndex((x) => x?.character.resourceId === SOLINE);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const shots = plan.shots[s]!.frames;

  it('gives Attack Speed up from the frame after every 40th normal shot for 3 s, refreshed by the next', () => {
    const windows = itemsOf(plan.history, { sourceSlotIndex: s, holder: s, kind: 'timed', skill: 'skill1' });
    // 40 発ごとの発の次のフレームから 3 秒。付き直しは付き直したフレームから 3 秒で、続いた窓は 1 つの件になる
    const starts = shots.filter((_, i) => (i + 1) % 40 === 0).map((f) => f + 1);
    const expected: ReturnType<typeof windowsFrom> = [];
    for (const w of windowsFrom(starts, 3, plan.frames)) {
      const last = expected.at(-1);
      if (last !== undefined && w.start <= last.end) last.end = w.end;
      else expected.push(w);
    }
    expect(expected.length).toBeGreaterThan(5);
    expect(windows.map(({ start, end }) => ({ start, end }))).toEqual(expected);
  });

  it('gives the S2 Critical Rate and Critical Damage up all the time (HP stays at max without damage taken)', () => {
    const passive = plan.history.passive[s]!.passiveEffects.filter((e) => e.source.skill === 'skill2');
    expect(passive.map((e) => [e.stat, e.appliedAmount])).toEqual([
      ['critRate', expect.closeTo(0.2162, 6)],
      ['critDamage', expect.closeTo(0.6227, 6)],
    ]);
  });

  const bursts = plan.schedule?.activations.filter((a) => a.slotIndex === s) ?? [];
  const additional = plan.skillHits.filter((h) => h.slotIndex === s && h.effect.source.skill === 'burst');
  if (input.slots.length === 1) {
    it('never uses Burst III alone', () => {
      expect(bursts).toEqual([]);
      expect(additional).toEqual([]);
    });
  } else if (input.slots.some((x) => x?.character.resourceId === ADE)) {
    it('does not deal the additional damage while the Max HP Only up of Ade lowers the HP ratio at the Burst use', () => {
      expect(bursts.length).toBeGreaterThan(3);
      for (const b of bursts) expect(selfHpRatioOf(plan.history, s, b.frame)).toBeLessThan(1);
      expect(additional).toEqual([]);
    });
  } else {
    it('deals the additional damage (924%) on each of the three Burst hits, with the Full Burst bonus', () => {
      expect(bursts.length).toBeGreaterThan(3);
      expect(additional.map((h) => h.frame)).toEqual(bursts.flatMap(hitFramesOf));
      for (const h of additional) {
        expect(isInFullBurst(plan.schedule!, h.frame)).toBe(true);
        expect(h.hit.boost.fullBurst).toBe(0.5);
        expect(h.hit.multiplier).toBeCloseTo(9.24, 6);
      }
    });
  }
});

describeEveryShotInOneGroup(TEAMS);
