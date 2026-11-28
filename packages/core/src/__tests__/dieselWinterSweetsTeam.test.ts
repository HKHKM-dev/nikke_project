// ディーゼル：ウィンタースイーツ編（plan/design-diesel-ws.md）: 出来事の回数のきっかけの atMost（「初めて〈出来事〉が発動した時」）・
// 条件 usedBurst: false（「直前に自分がバーストを使用していなければ」）の読み込みと、ディーゼル：ウィンタースイーツ（75）を含む編成で、
// イントロ・クライマックスの付き方、S1・S2 の持続ダメージ▲、3 つの持続ダメージ、受けるダメージ▲、騒音公害（命中率▼。C-1558・C-1559）が
// 意図どおりに出るか
import { describe, expect, it } from 'vitest';
import { enemyEventsOf, enemyLandingsOf } from '../enemies.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/parse/definition.ts';
import type { TeamInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import { stateItemsOf } from './historyHelpers.ts';
import { ENEMY_PRESETS, fixedTeam, RANGE_BIGARMS, rawDefinition, SHOOTING_RANGE_ENEMY } from './teamHelpers.ts';

type RawEffect = Record<string, unknown>;
type Raw = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: RawEffect[] }> };

const DIESEL = 75;
const RAW = rawDefinition<Raw>(DIESEL);

const patched = (slot: keyof Raw['skills'], index: number, patch: RawEffect) => {
  const copy = structuredClone(RAW);
  copy.skills[slot].effects[index] = { ...copy.skills[slot].effects[index], ...patch };
  return () => parseSkillDefinition(copy);
};

describe('atMost と usedBurst: false の読み込み', () => {
  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(RAW)).not.toThrow();
  });

  it('takes atMost at least atLeast on an event count trigger', () => {
    const first = { count: 'fullBurstStart', atLeast: 1, atMost: 1 };
    expect(patched('skill1', 0, { trigger: { ...first, atMost: 3 } })).not.toThrow();
    expect(patched('skill1', 0, { trigger: { ...first, atLeast: 2 } })).toThrow(/atMost: expected at least atLeast/);
    expect(patched('skill1', 0, { trigger: { ...first, atMost: 0 } })).toThrow(/atMost/);
  });

  it('takes usedBurst as a boolean, with full burst start / end as a string or an event count trigger', () => {
    expect(patched('skill1', 0, { condition: { usedBurst: 'yes' } })).toThrow(/expected a boolean/);
    expect(patched('skill1', 0, { trigger: { count: 'fullBurstEnd', atLeast: 1, atMost: 1 } })).not.toThrow();
    expect(patched('skill1', 0, { trigger: 'fullBurstStart' })).not.toThrow();
    expect(patched('skill1', 0, { trigger: { count: 'burstUse', atLeast: 1 } })).toThrow(/usedBurst is only allowed/);
  });
});

const enemy = { ...SHOOTING_RANGE_ENEMY, element: 'Fire' as const };
const LITER = 82;
const DELTA = 20;
const SUN = 308;
const UNI = 160;

const TEAMS: Record<string, { input: TeamInput; diesel: number; climax: boolean }> = {
  '撮影 A（リター・デルタ・ディーゼル：ウィンタースイーツ）': {
    input: fixedTeam([LITER, DELTA, DIESEL], 2, { enemy }),
    diesel: 2,
    climax: false,
  },
  '撮影 B（リター・I-DOLL・サン・ディーゼル：ウィンタースイーツ・ユニ）': {
    input: fixedTeam([LITER, SUN, DIESEL, UNI], 2, { enemy }),
    diesel: 2,
    climax: true,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, diesel, climax }) => {
  const plan = planTeamRun(input);
  const windows = plan.schedule!.fullBurstWindows;
  const used = windows.map((w) => w.burstUsers.includes(diesel));

  it('applies exactly one of Intro and Highlight at the first Full Burst, by whether she fired her Burst', () => {
    expect(used[0]).toBe(!climax);
    const intro = itemsOf(plan.history, { holder: diesel, state: 'intro' });
    const highlight = itemsOf(plan.history, { holder: diesel, state: 'highlight' });
    const [given, other] = climax ? [highlight, intro] : [intro, highlight];
    expect(other).toEqual([]);
    expect(given.map((i) => i.start)).toEqual([windows[0]!.start]);
    // 撮影 B では、その後ディーゼルが撃った回があっても、イントロは付かない（初めてのフルバーストだけで決まる）
    if (climax) expect(used.some((u) => u)).toBe(true);
  });

  it('gives the S1 sustained damage up of the state at every Full Burst, including the first', () => {
    const filter = { holder: diesel, kind: 'timed', skill: 'skill1', stat: 'sustainedDamage' } as const;
    const ups = itemsOf(plan.history, filter);
    expect(ups.map((i) => i.start)).toEqual(windows.map((w) => w.start));
    // 効いたのはイントロとクライマックスのどちらか一方の▲（skill1 の effects[2] と [3]）
    expect(itemsOf(plan.history, { ...filter, effectIndex: climax ? 3 : 2 })).toEqual(ups);
  });

  it('stacks the S2 full-charge sustained damage up to 2', () => {
    const stacks = itemsOf(plan.history, { holder: diesel, kind: 'timed', skill: 'skill2', stat: 'sustainedDamage' });
    expect(stacks.length).toBeGreaterThan(0);
    expect(Math.max(...stacks.map((i) => i.stack ?? 1))).toBe(2);
  });

  it('ticks the S2 damage over time 9 times at every Full Burst, and the two Burst ones only when she fired', () => {
    const ticks = (skill: string) =>
      plan.skillHits.filter((h) => h.slotIndex === diesel && h.effect.source.skill === skill);
    const inside = (frames: number[], start: number) =>
      frames.filter((f) => start < f && f <= start + gameSecondsToFrames(10)).length;
    const s2 = ticks('skill2').map((h) => h.frame);
    const burst = ticks('burst').map((h) => h.frame);
    // 戦闘の終わりにかかる最後の回は数えない
    windows.slice(0, -1).forEach((w, k) => {
      expect(inside(s2, w.start)).toBe(9);
      expect(inside(burst, w.start)).toBe(used[k] ? 18 : 0);
    });
    expect(ticks('burst').every((h) => h.effect.sustained === true)).toBe(true);
  });

  it('gives Damage Taken up only after her own Burst', () => {
    const items = itemsOf(plan.history, { sourceSlotIndex: diesel, stat: 'damageTaken' });
    const starts = new Set(items.map((i) => i.start));
    expect(starts.size).toBe(used.filter((u) => u).length);
  });

  it('puts Noise Pollution (1 s) on every ally but herself at her own Burst, only in Highlight', () => {
    const noise = stateItemsOf(plan).filter((i) => i.state === 'noisePollution');
    if (!climax) {
      expect(noise).toEqual([]);
      return;
    }
    const allies = input.slots.flatMap((s, i) => (s === null || i === diesel ? [] : [i]));
    const bursts = new Set(itemsOf(plan.history, { sourceSlotIndex: diesel, stat: 'damageTaken' }).map((i) => i.start));
    expect(bursts.size).toBeGreaterThan(0);
    expect(noise.length).toBe(bursts.size * allies.length);
    for (const i of noise) {
      expect(allies).toContain(i.slotIndex);
      expect(bursts.has(i.start)).toBe(true);
      // 戦闘の終わりにかかる回は、そこで切れる
      if (i.start < Math.max(...bursts)) expect(i.end - i.start).toBe(gameSecondsToFrames(1));
      else expect(i.end - i.start).toBeLessThanOrEqual(gameSecondsToFrames(1));
    }
  });
});

// plan/design-maids.md 8.6 節（C-1559）: 条件が自動の枠で射撃場の的なら、騒音公害の区間（N = −100%）の SMG・AR のコア命中率は
// 的の表の値の 1/4。RL（ユニ）と、騒音公害の外の区間は変わらない
describe('騒音公害の命中率▼（的の▼の表）', () => {
  const base = TEAMS['撮影 B（リター・I-DOLL・サン・ディーゼル：ウィンタースイーツ・ユニ）']!.input;
  const input: TeamInput = {
    ...base,
    slots: base.slots.map((s) => (s === null ? null : { ...s, conditionMode: 'auto' as const })),
    enemy: {
      ...base.enemy,
      events: enemyEventsOf(ENEMY_PRESETS, ['range-3min-jump'], 180),
      target: RANGE_BIGARMS,
      landings: enemyLandingsOf(ENEMY_PRESETS, ['range-3min-jump'], 180, RANGE_BIGARMS),
    },
  };
  const result = runSimulation(input);
  const { hitRateDown: _, ...noTable } = RANGE_BIGARMS;
  const off = runSimulation({ ...input, enemy: { ...input.enemy, target: noTable } });
  const coreOf = (r: typeof result, slotIndex: number, frame: number) => {
    const slot = r.slots[slotIndex]!;
    const s = slot.segments.find((x) => x.start <= frame && frame < x.end)!;
    return s.trigger.boost.core / (slot.character.shot.coreDamageRate - 1 + s.buffs.coreDamage);
  };
  const noise = stateItemsOf(result).filter((i) => i.state === 'noisePollution' && i.slotIndex === 0);

  it('quarters the SMG and AR core hit rate inside the window, and leaves the RL and the frames outside as they are', () => {
    expect(noise.length).toBeGreaterThan(0);
    for (const { start, end } of noise) {
      const mid = Math.floor((start + end) / 2);
      for (const slot of [0, 1]) {
        expect(coreOf(result, slot, mid)).toBeCloseTo(coreOf(off, slot, mid) / 4, 9);
        expect(coreOf(result, slot, end + 1)).toBeCloseTo(coreOf(off, slot, end + 1), 9);
      }
      expect(coreOf(result, 3, mid)).toBeCloseTo(coreOf(off, 3, mid), 9);
    }
  });

  it('does not change the bullet hit rate (not measured)', () => {
    for (const { start, end } of noise) {
      const mid = Math.floor((start + end) / 2);
      for (const slot of [0, 1]) {
        const at = (r: typeof result) =>
          r.slots[slot]!.segments.find((x) => x.start <= mid && mid < x.end)!.trigger.hitRate;
        expect(at(result)).toBe(at(off));
      }
    }
  });
});
