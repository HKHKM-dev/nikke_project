// 順位の発数編: 対象「最終攻撃力が最も高い味方 N 機」（topAttack）と「N 発間維持」（durationShots）の組み合わせ。
// 窓は発火のフレームの順位で決まった枠の射撃で切る。会心率は 1 で頭打ち（plan/design-ranked-shot-duration.md 2 節・7 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runFirstPass } from '../../frame/firstPass.ts';
import { gameSecondsToFrames } from '../../time.ts';
import type { CharacterData } from '../../types.ts';
import { applyCritBuffs, capCritRate, ZERO_BUFFS } from '../buffs.ts';
import { MAX_SKILL_LEVELS } from '../resolve.ts';
import { planBuffTimeline, type TimelineSlot } from '../timeline.ts';
import { applyTreasure } from '../treasure.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

/** ミランダの宝物版 S2 の 3 行目（設計書 2 節の形） */
const LINE3 = {
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'topAttack',
  targetCountRef: 7,
  excludeSelf: 'unlessShort',
  stat: 'critRate',
  ref: 8,
  durationShotsRef: 9,
};

const miranda = readJson<CharacterData>('../../../data/characters/32.json');
const delta = readJson<CharacterData>('../../../data/characters/20.json');
const sun = readJson<CharacterData>('../../../data/characters/308.json');

/** 宝物版のミランダ（S2 の 3 行目は C-0334） */
function mirandaWithLine3() {
  return applyTreasure(miranda, parseSkillDefinition(readJson<unknown>('../../../data/skills/32.json')), 3);
}

const FRAMES = gameSecondsToFrames(180);

function team(deltaAttack: number, sunAttack: number): TimelineSlot[] {
  const m = mirandaWithLine3();
  return [
    { character: m.character, definition: m.definition, levels: MAX_SKILL_LEVELS, casterBaseAttack: 3000 },
    { character: delta, definition: null, levels: MAX_SKILL_LEVELS, casterBaseAttack: deltaAttack },
    { character: sun, definition: null, levels: MAX_SKILL_LEVELS, casterBaseAttack: sunAttack },
  ];
}

function line3Windows(slots: TimelineSlot[]) {
  const pass = runFirstPass(slots, { frames: FRAMES, burst: true });
  const timeline = planBuffTimeline(slots, pass.schedule, FRAMES, pass.shots);
  const windows = timeline.windows.filter(
    (w) => w.effect.source.skill === 'skill2' && w.effect.stat === 'critRate' && w.effect.target === 'topAttack',
  );
  return { pass, timeline, windows };
}

describe('parseSkillDefinition（順位の発数編）', () => {
  const definition = (effect: unknown) => ({
    formatVersion: 1,
    resourceId: 32,
    checkedAt: '2026-10-06',
    skills: {
      skill1: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
      skill2: { effects: [effect] },
      burst: { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] },
    },
  });

  it('accepts a duration in shots on topAttack', () => {
    expect(() => parseSkillDefinition(definition(LINE3))).not.toThrow();
  });

  it('still rejects stats tracked in the first pass', () => {
    expect(() => parseSkillDefinition(definition({ ...LINE3, stat: 'attack' }))).toThrow(/first pass/);
  });
});

describe('planBuffTimeline: topAttack × durationShots', () => {
  it('gives the window to the top other ally at each full burst start, until its first shot', () => {
    const { pass, timeline, windows } = line3Windows(team(1000, 2000));
    const fbStarts = pass.schedule!.fullBurstWindows.map((w) => w.start);
    expect(fbStarts.length).toBeGreaterThanOrEqual(3);
    // 自分（3000）を除いた 1 位はサン（枠 3）
    expect(new Set(windows.map((w) => w.slotIndex))).toEqual(new Set([2]));
    const sunShots = pass.shots[2]!.frames;
    for (const w of windows) {
      expect(fbStarts).toContain(w.start);
      const first = sunShots.find((f) => f >= w.start)!;
      expect(w.end).toBe(first + 1);
    }
    expect(windows.map((w) => w.start)).toEqual(fbStarts);
    // 順位の記録は 1 機
    const ranks = timeline.rankings.filter((r) => r.effect.source.skill === 'skill2');
    expect(ranks.every((r) => r.targets.length === 1 && r.targets[0] === 2)).toBe(true);
  });

  it('follows the ranking (Delta when it has the higher attack)', () => {
    const { windows } = line3Windows(team(2000, 1000));
    expect(new Set(windows.map((w) => w.slotIndex))).toEqual(new Set([1]));
  });

  it('puts the crit rate up only on the segment that holds the first shot', () => {
    const slots = team(1000, 2000);
    const { pass, windows } = line3Windows(slots);
    const w = windows[0]!;
    const timeline = planBuffTimeline(slots, pass.schedule, FRAMES, pass.shots);
    const at = (frame: number) =>
      timeline.segments.find((s) => s.start <= frame && frame < s.end)!.slots[2]!.buffs.critRate;
    expect(at(w.end - 1)).toBeCloseTo(0.8542, 12);
    expect(at(w.end)).toBe(0);
  });
});

describe('会心率の頭打ち', () => {
  it('caps the crit rate at 1', () => {
    expect(capCritRate(1.0042)).toBe(1);
    expect(capCritRate(0.451)).toBe(0.451);
    expect(applyCritBuffs({ rate: 0.15, damage: 1.5 }, { ...ZERO_BUFFS, critRate: 0.8542 }).rate).toBe(1);
  });
});
