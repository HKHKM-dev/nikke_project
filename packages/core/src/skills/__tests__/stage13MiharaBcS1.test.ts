// 2 段目の段 13 の PR 1（plan/design-skill-stage13.md 2.1〜2.3 節）: ミハラ：ボンディングチェーン（162）の S1 の戦闘開始時の分
// （キャプチャーチェーンの攻撃と、付けるたびに刻みを付け直すチェーンバインド。録画 0119・0490・0492。V-0546、C-0411・C-0745）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { latestDotTicks } from '../../frame/dot.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { oneHitValue } from '../burstDamage.ts';
import { MAX_SKILL_LEVELS, skillValue } from '../resolve.ts';
import { parseSkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const MIHARA_BC = 162;
const mihara = readJson<CharacterData>(`../../../data/characters/${MIHARA_BC}.json`);
const raw = readJson<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(
  `../../../data/skills/${MIHARA_BC}.json`,
);
const s1 = (ref: number) => skillValue(mihara.skills.skill1, ref, MAX_SKILL_LEVELS.skill1);

describe('語彙の検証', () => {
  const withEffect = (index: number, patch: Record<string, unknown>) => {
    const copy = structuredClone(raw);
    copy.skills.skill1.effects[index] = { ...copy.skills.skill1.effects[index], ...patch };
    return () => parseSkillDefinition(copy);
  };
  const attack = raw.skills.skill1.effects.findIndex((e) => e.kind === 'damage');
  const chains = raw.skills.skill1.effects.findIndex((e) => e.kind === 'dot');

  it('accepts the definition', () => {
    expect(() => parseSkillDefinition(raw)).not.toThrow();
  });

  it('allows { counterFull } with perCount on damage, and perCountIntervalFrames only with perCount { counter }', () => {
    expect(withEffect(attack, { perCount: undefined, perCountIntervalFrames: undefined })).not.toThrow();
    expect(withEffect(attack, { perCount: undefined })).toThrow(/perCountIntervalFrames needs perCount/);
    expect(withEffect(attack, { perCountIntervalSeconds: 0.25 })).toThrow(
      /cannot be used with delayFrames or perBurstHit/,
    );
    expect(withEffect(attack, { trigger: { counterFull: 'nope' } })).toThrow(/counterFull/);
  });

  it('keeps the chain bind form together (halfAfterLatest ⇔ durationUntil battleEnd, perCount needs { counterFull })', () => {
    expect(withEffect(chains, { durationUntil: undefined, durationSeconds: 10 })).toThrow(
      /halfAfterLatest goes with durationUntil/,
    );
    expect(withEffect(chains, { durationSeconds: 10 })).toThrow(/cannot be combined with another duration/);
    expect(withEffect(chains, { firstTick: 'afterInterval' })).toThrow(/halfAfterLatest goes with durationUntil/);
    expect(withEffect(chains, { trigger: 'battleStart' })).toThrow(/perCount needs the trigger \{ counterFull \}/);
    expect(withEffect(chains, { perCount: undefined })).toThrow(/needs perCount/);
    expect(withEffect(chains, { perCountIntervalFrames: undefined })).toThrow(/needs perCountIntervalFrames/);
    expect(withEffect(chains, { tickIntervalFrames: 0 })).toThrow(/expected a positive number/);
  });
});

describe('latestDotTicks', () => {
  it('restarts the ticks at each application and counts the stacks', () => {
    // 0・15 に付けると、0 の刻み（0.5 間隔後 = 30）は次の付与より後なので出ず、15 から 30・89・148… と出る
    const ticks = latestDotTicks([0, 15], 200, 20, 59.25);
    expect(ticks).toEqual([
      { frame: 15 + 30, stacks: 2 },
      { frame: 15 + 89, stacks: 2 },
      { frame: 15 + 148, stacks: 2 },
    ]);
  });

  it('caps the stacks', () => {
    expect(latestDotTicks([0, 1, 2], 40, 2, 59.25)).toEqual([{ frame: 32, stacks: 2 }]);
  });
});

describe('戦闘開始時の攻撃とチェーンバインド（単騎・バーストなし）', () => {
  const fixed = computeFixedSpecAttack(mihara);
  const slot: TeamSlotInput = {
    character: mihara,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    hpOverride: computeFixedSpecHp(mihara),
    condition: { coreHitRate: 1, distanceBonus: false, hitRate: 0 },
    skills: { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS },
  };
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const result = runSimulation({ slots: [slot], enemy, durationSeconds: 30, burst: false });
  const hits = result.skillHits.filter((h) => h.slotIndex === 0);
  const attacks = hits.filter((h) => h.effect.dot === undefined);
  const applies = hits.filter((h) => h.effect.dot !== undefined && h.stacks === undefined);
  const ticks = hits.filter((h) => h.effect.dot !== undefined && h.stacks !== undefined);

  it('attacks 10 times, 15 frames apart, from 5 frames after the battle start', () => {
    expect(attacks.map((h) => h.frame)).toEqual(Array.from({ length: 10 }, (_, k) => 5 + 15 * k));
    expect(oneHitValue(attacks[0]!.hit, false)).toBeCloseTo(
      (fixed.attack - FIXED_SPEC_ENEMY_DEFENCE) * (s1(2) / 100),
      6,
    );
  });

  it('applies one stack 2 frames before each attack, with a one-stack hit', () => {
    expect(applies.map((h) => h.frame)).toEqual(attacks.map((h) => h.frame - 2));
    expect(oneHitValue(applies[0]!.hit, false)).toBeCloseTo(
      (fixed.attack - FIXED_SPEC_ENEMY_DEFENCE) * (s1(3) / 100),
      6,
    );
  });

  it('ticks with 10 stacks from 0.5 interval after the last application, 59.25 game ticks apart', () => {
    const last = applies.at(-1)!.frame;
    expect(ticks.slice(0, 5).map((h) => h.frame)).toEqual([30, 89, 148, 207, 267].map((d) => last + d));
    expect(ticks.every((h) => h.stacks === 10)).toBe(true);
    expect(oneHitValue(ticks[0]!.hit, false)).toBeCloseTo(10 * oneHitValue(applies[0]!.hit, false), 6);
  });
});
