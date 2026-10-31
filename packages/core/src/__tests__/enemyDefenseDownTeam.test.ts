// 2 段目の段 2（plan/design-skill-stage2.md）: 敵の防御力▼（enemyDefenseDown）。定義の検証、式（防御力 × (1 − Σ) を引く。Σ は 0〜1）、
// 通常攻撃と倍率ダメージで同じ防御力を引くこと、敵の件として味方全員に写ること、ルドミラ（190）の S1（最後の弾丸の次のフレームから 10 秒）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTriggerDamage, defenceAfterDown, type EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { ZERO_BUFFS } from '../skills/buffs.ts';
import { computeSkillHit } from '../skills/burstDamage.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { ENEMY, itemsOf, valuePiecesOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData } from '../types.ts';
import { makeCharacter } from './fixtures.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const LUDMILLA = 190;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function slotOf(id: number): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (DEFINED.has(id)) {
    slot.skills = {
      definition: parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`)),
      levels: MAX_SKILL_LEVELS,
    };
  }
  return slot;
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effect: Record<string, unknown>) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-16',
    skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  });
const down = {
  kind: 'timed',
  trigger: { count: 'lastShot' },
  target: 'allies',
  stat: 'enemyDefenseDown',
  ref: 1,
  durationSeconds: 10,
};

describe('敵の防御力▼の読み込み', () => {
  it('reads a timed defense down on all allies and rejects narrowed targets (an enemy debuff)', () => {
    expect(parse(down).skills.skill1.effects[0]).toMatchObject({ stat: 'enemyDefenseDown', target: 'allies' });
    expect(() => parse({ ...down, target: 'self' })).toThrow(/enemyDefenseDown must target "allies"/);
    expect(() => parse({ ...down, targetWeapon: 'AR' })).toThrow(/enemyDefenseDown cannot narrow its target/);
    const { durationSeconds: _, ...shots } = down;
    expect(() => parse({ ...shots, durationShots: 3 })).toThrow(/enemyDefenseDown is held by the enemy/);
  });
});

describe('敵の防御力▼の式（plan/design-skill-stage2.md 1 節。C-0556）', () => {
  const enemy: EnemyInput = { defence: 100, element: null, hasCore: true };

  it('multiplies the defence by (1 − Σ) and keeps Σ within 0 to 1', () => {
    expect(defenceAfterDown(enemy, ZERO_BUFFS)).toBe(100);
    expect(defenceAfterDown({ ...enemy, defenceRounding: 'none' }, { ...ZERO_BUFFS, enemyDefenseDown: 0.084 })).toBeCloseTo(91.6, 12);
    expect(defenceAfterDown(enemy, { ...ZERO_BUFFS, enemyDefenseDown: 1.5 })).toBe(0);
    expect(defenceAfterDown(enemy, { ...ZERO_BUFFS, enemyDefenseDown: -0.2 })).toBe(100);
  });

  it('rounds the lowered defence half up by default, and by the hypothesis when given (C-0790)', () => {
    const down = (x: number) => ({ ...ZERO_BUFFS, enemyDefenseDown: x });
    expect(defenceAfterDown(enemy, down(0.3564))).toBe(64);
    expect(defenceAfterDown(enemy, down(0.084))).toBe(92);
    expect(defenceAfterDown({ ...enemy, defenceRounding: 'ceil' }, down(0.3564))).toBe(65);
    expect(defenceAfterDown({ ...enemy, defenceRounding: 'none' }, down(0.3564))).toBeCloseTo(64.36, 12);
    // 100 × (1 − 0.3) は浮動小数で 70.00000000000001 になるが、切り上げても 70
    expect(defenceAfterDown({ ...enemy, defenceRounding: 'ceil' }, down(0.3))).toBe(70);
    // ▼が無ければ丸めの仮説でも元の防御力
    expect(defenceAfterDown({ ...enemy, defence: 100.5, defenceRounding: 'ceil' }, ZERO_BUFFS)).toBe(100.5);
  });

  it('subtracts the lowered defence in normal attacks and skill hits alike', () => {
    const c = makeCharacter();
    const trigger = (enemyDefenseDown: number) =>
      computeTriggerDamage({
        character: c,
        growth: { level: 1, grade: 0, core: 0 },
        enemy,
        attackOverride: 10_000,
        buffs: { ...ZERO_BUFFS, enemyDefenseDown },
        condition: { coreHitRate: 0, distanceBonus: false, fullCharge: true },
      });
    expect(trigger(0).baseHit).toBe(9_900);
    expect(trigger(0.084).baseHit).toBe(9_908);
    const effect = {
      source: { resourceId: 1, skill: 'burst' as const, name: { ja: '-', en: '-' } },
      effectIndex: 0,
      trigger: 'burstUse' as const,
      damageType: 'skill' as const,
      multiplier: 1,
    };
    const hit = (enemyDefenseDown: number) =>
      computeSkillHit([effect], c, enemy, trigger(enemyDefenseDown), { ...ZERO_BUFFS, enemyDefenseDown }, false);
    expect(hit(0).baseHit).toBe(9_900);
    expect(hit(0.084).baseHit).toBe(9_908);
  });
});

describe('ルドミラ（190）の S1（C-0556）', () => {
  const run = (slots: TeamSlotInput[]) => {
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
    const input: TeamInput = { slots, enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
    return planTeamRun(applyCompositionToTeam(input));
  };

  it('holds the defense down on the enemy from the frame after each last bullet, for 10 seconds', () => {
    const plan = run([slotOf(LUDMILLA)]);
    const lastShots = plan.shots[0]!.lastShotFrames!;
    expect(lastShots.length).toBeGreaterThan(2);
    const items = itemsOf(plan.history, { holder: ENEMY, stat: 'enemyDefenseDown' });
    // マガジンの 1 周（5 秒 + リロード）は 10 秒より短いので、最初の最後の弾丸の次のフレームから切れずに続く
    expect(items).toHaveLength(1);
    expect(items[0]!.start).toBe(lastShots[0]! + 1);
    expect(items[0]!.end).toBe(Math.min(lastShots.at(-1)! + 1 + gameSecondsToFrames(10), plan.history.frames));
  });

  it('maps the enemy debuff onto every ally (the enemy takes all hits)', () => {
    const plan = run([slotOf(LUDMILLA), slotOf(20)]);
    const pieces = valuePiecesOf(plan.history).filter((p) => p.effect.stat === 'enemyDefenseDown');
    expect(new Set(pieces.map((p) => p.slotIndex))).toEqual(new Set([0, 1]));
    expect(pieces.every((p) => p.sourceSlotIndex === 0)).toBe(true);
  });
});
