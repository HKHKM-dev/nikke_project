// ビスケット（381）の S1（フルバーストタイムの終わりに火力型の味方へ通常攻撃のクリティカル確率▲と持続回復）とバースト（支援型の味方へ
// 攻撃力▲と吸収回復）を、撮影（V-0775）と同じ編成で見る。対象のクラスの絞り込みは targetClass（plan/design-skill-stage9.md 1.1 節）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import {
  computeFixedSpecAttack,
  computeFixedSpecDefence,
  computeFixedSpecHp,
  FIXED_SPEC_ENEMY_DEFENCE,
} from '../fixedSpec.ts';
import { countShotsInRanges } from '../frame/shots.ts';
import { planTeamRun } from '../frame/plan.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { battleSecondsToFrames, gameSecondsToFrames } from '../time.ts';
import { piecesOf } from './historyHelpers.ts';
import { runTeam } from './runTeam.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const FLOWER = 304;
const BISCUIT = 381;
const SOLDIER_EG = 300;
const COCOA = 311;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definitionOf = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));

function fixedSlot(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(c),
    defenceOverride: computeFixedSpecDefence(c),
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
    skills: { definition: definitionOf(id), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };

// フラワー（防御型・I）・ビスケット（支援型・II）・ソルジャーE.G.（火力型・III）・ココア（支援型・I）
const TEAM: TeamInput = {
  slots: [FLOWER, BISCUIT, SOLDIER_EG, COCOA].map(fixedSlot),
  enemy,
  durationSeconds: 180,
  burst: true,
  controlledSlot: 2,
};
const BISCUIT_SLOT = 1;
const BATTLE_END = battleSecondsToFrames(TEAM.durationSeconds);
const TEN_SECONDS = gameSecondsToFrames(10);

/** 同じ枠の続いた（接する）小片を 1 つの窓にまとめた [枠, 始まり, 終わり] の列 */
function windowsOf(pieces: { slotIndex: number; start: number; end: number }[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const p of [...pieces].sort((a, b) => a.slotIndex - b.slotIndex || a.start - b.start)) {
    const last = out.at(-1);
    if (last !== undefined && last[0] === p.slotIndex && p.start <= last[2]) last[2] = Math.max(last[2], p.end);
    else out.push([p.slotIndex, p.start, p.end]);
  }
  return out;
}

describe('ビスケット（防御型・支援型・火力型・支援型の編成）', () => {
  const plan = planTeamRun(TEAM);
  const fullBursts = plan.schedule!.fullBurstWindows;
  const fromBiscuit = (stat: string) =>
    piecesOf(plan).filter((p) => p.sourceSlotIndex === BISCUIT_SLOT && p.effect.stat === stat);

  it('gives the normal attack crit rate up of S1 to the Attacker ally only, for 10 s from each Full Burst end', () => {
    const ups = fromBiscuit('normalCritRate');
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([2]));
    expect(ups[0]!.effect.value).toBeCloseTo(0.0577, 12);
    const ended = fullBursts.filter((w) => w.end < BATTLE_END);
    expect(ended.length).toBeGreaterThan(1);
    expect(windowsOf(ups)).toEqual(ended.map((w) => [2, w.end, Math.min(w.end + TEN_SECONDS, BATTLE_END)]));
  });

  it('gives the attack up of the burst to the Supporter allies (herself included) only, for 10 s', () => {
    const ups = fromBiscuit('attack');
    expect(new Set(ups.map((p) => p.slotIndex))).toEqual(new Set([1, 3]));
    expect(ups[0]!.effect.value).toBeCloseTo(0.4308, 12);
    const windows = windowsOf(ups);
    expect(windows.every(([, start, end]) => end - start === TEN_SECONDS || end === BATTLE_END)).toBe(true);
    expect(windows.filter(([slot]) => slot === 1)).toHaveLength(fullBursts.length);
  });

  it('heals the Attacker ally at each Full Burst end and the Supporter allies at each burst', () => {
    const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === BISCUIT_SLOT);
    const attackerHeals = heals.filter((h) => h.slotIndex === 2).map((h) => h.frame);
    const ends = new Set(fullBursts.map((w) => w.end));
    expect(attackerHeals.length).toBeGreaterThan(1);
    expect(attackerHeals.every((f) => ends.has(f) || ends.has(f - 1))).toBe(true);
    const burstStarts = new Set(windowsOf(fromBiscuit('attack')).map(([, start]) => start));
    const supporterHeals = heals.filter((h) => h.slotIndex !== 2);
    expect(new Set(supporterHeals.map((h) => h.slotIndex))).toEqual(new Set([1, 3]));
    expect(supporterHeals.every((h) => burstStarts.has(h.frame) || burstStarts.has(h.frame - 1))).toBe(true);
  });

  it('partitions every shot into exactly one group (start ≤ shot < end)', () => {
    const calc = runTeam(TEAM);
    TEAM.slots.forEach((_, i) => {
      const frames = plan.shots[i]!.frames;
      const total = calc.slots[i]!.segments.reduce((sum, g) => sum + countShotsInRanges(frames, g.ranges), 0);
      expect(total).toBe(frames.length);
    });
  });
});
