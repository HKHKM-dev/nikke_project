// ディーゼル：ウィンタースイーツ編（plan/design-diesel-ws.md）: 出来事の回数のきっかけの atMost（「初めて〈出来事〉が発動した時」）・
// 条件 usedBurst: false（「直前に自分がバーストを使用していなければ」）の読み込みと、ディーゼル：ウィンタースイーツ（75）を含む編成で、
// イントロ・クライマックスの付き方、S1・S2 の持続ダメージ▲、3 つの持続ダメージ、受けるダメージ▲が意図どおりに出るか
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecDefence, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { runTeam } from './runTeam.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

type RawEffect = Record<string, unknown>;
type Raw = { skills: Record<'skill1' | 'skill2' | 'burst', { effects: RawEffect[] }> };

const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const DIESEL = 75;
const RAW = readJson<Raw>(`../../data/skills/${DIESEL}.json`);

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 0.5, distanceBonus: true, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

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

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
const LITER = 82;
const DELTA = 20;
const SUN = 308;
const UNI = 160;

const TEAMS: Record<string, { input: TeamInput; diesel: number; climax: boolean }> = {
  '撮影 A（リター・デルタ・ディーゼル：ウィンタースイーツ）': {
    input: {
      slots: [fixedSlot(LITER), fixedSlot(DELTA), fixedSlot(DIESEL)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    diesel: 2,
    climax: false,
  },
  '撮影 B（リター・I-DOLL・サン・ディーゼル：ウィンタースイーツ・ユニ）': {
    input: {
      slots: [fixedSlot(LITER), fixedSlot(SUN), fixedSlot(DIESEL), fixedSlot(UNI)],
      enemy,
      durationSeconds: 180,
      burst: true,
      controlledSlot: 2,
    },
    diesel: 2,
    climax: true,
  },
};

describe.each(Object.entries(TEAMS))('編成: %s', (_name, { input, diesel, climax }) => {
  const plan = planTeamRun(input);
  const result = runTeam(input);
  const windows = plan.schedule!.fullBurstWindows;
  const used = windows.map((w) => w.burstUsers.includes(diesel));
  const tracksOf = (stat: string) =>
    plan.history.tracks.filter(
      (t) => t.sourceSlotIndex === diesel && t.origin.kind === 'timed' && t.origin.effect.stat === stat,
    );

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
    const ups = tracksOf('sustainedDamage').filter((t) => t.origin.kind === 'timed' && t.origin.effect.trigger === 'fullBurstStart');
    const starts = ups.flatMap((t) => t.items.map((i) => i.start));
    expect(starts).toEqual(windows.map((w) => w.start));
    const origin = ups.find((t) => t.items.length > 0)!.origin;
    expect(origin.kind === 'timed' ? origin.effect.value : NaN).toBeCloseTo(climax ? 2.3503 : 0.6019, 6);
  });

  it('stacks the S2 full-charge sustained damage up to 2', () => {
    const stacks = itemsOf(plan.history, { holder: diesel, kind: 'timed', skill: 'skill2', stat: 'sustainedDamage' });
    expect(stacks.length).toBeGreaterThan(0);
    expect(Math.max(...stacks.map((i) => i.stack ?? 1))).toBe(2);
  });

  it('ticks the S2 damage over time 9 times at every Full Burst, and the two Burst ones only when she fired', () => {
    const ticks = (skill: string) => plan.skillHits.filter((h) => h.slotIndex === diesel && h.effect.source.skill === skill);
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

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    input.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = result.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
