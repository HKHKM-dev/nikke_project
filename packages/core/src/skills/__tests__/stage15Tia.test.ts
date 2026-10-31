// 2 段目の段 15 の PR 2（plan/design-skill-stage15.md 2.2・3.2 節）: ティア（451）。きっかけ { coverHealed }（「遮蔽物の HP を回復した時」）を、
// 読み込みで同じ定義の遮蔽物 HP 回復（coverHeal）のきっかけに置き換える。T4 の▼は、発動の後に付いたもの（同じ発動から付いたものも）も
// 走っている CT を縮める（V-0566）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../../damage.ts';
import { computeFixedSpecAttack, computeFixedSpecHp, FIXED_SPEC_ENEMY_DEFENCE } from '../../fixedSpec.ts';
import { runSimulation } from '../../sim/engine.ts';
import type { TeamInput, TeamSlotInput } from '../../team.ts';
import type { CharacterData } from '../../types.ts';
import { MAX_SKILL_LEVELS, resolveTimed } from '../resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const TIA = 451;
const character = readJson<CharacterData>(`../../../data/characters/${TIA}.json`);
const rawDefinition = readJson<Record<string, unknown>>(`../../../data/skills/${TIA}.json`);
const definition = parseSkillDefinition(rawDefinition);

const none = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const cooldown = { kind: 'timed', target: 'self', stat: 'burstCooldown', scaling: 'flat', ref: 1, durationRef: 3 };
const coverHeal = { kind: 'coverHeal', trigger: 'burstUse', target: 'self', ref: 5 };
const def = (skill1: unknown[], skill2: unknown[]) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-31',
  skills: { skill1: { effects: skill1 }, skill2: skill2.length > 0 ? { effects: skill2 } : none, burst: none },
});

describe('{ coverHealed }（遮蔽物の HP を回復した時）', () => {
  it('takes the trigger of the coverHeal effect in the same definition and marks the effect', () => {
    const parsed = parseSkillDefinition(def([{ ...cooldown, trigger: { coverHealed: true } }], [coverHeal]));
    expect(parsed.skills.skill1.effects[0]).toMatchObject({ trigger: 'burstUse', viaCoverHealed: true });
    expect(parsed.skills.skill2.effects[0]).toMatchObject({ kind: 'coverHeal', trigger: 'burstUse', target: 'self' });
  });

  it('keeps the mark through resolution for the label', () => {
    const resolved = resolveTimed(definition, character, MAX_SKILL_LEVELS).filter((e) => e.source.skill === 'skill1');
    expect(resolved.map((e) => e.viaCoverHealed)).toEqual([true, true]);
  });

  it('needs exactly one coverHeal and is only allowed in timed', () => {
    expect(() => parseSkillDefinition(def([{ ...cooldown, trigger: { coverHealed: true } }], []))).toThrow(
      /exactly one coverHeal/,
    );
    expect(() =>
      parseSkillDefinition(
        def([{ kind: 'damage', trigger: { coverHealed: true }, damageType: 'skill', ref: 1 }], [coverHeal]),
      ),
    ).toThrow(/only allowed in timed/);
    expect(() =>
      parseSkillDefinition(def([{ ...cooldown, trigger: 'burstUse', __coverHealed: true }], [coverHeal])),
    ).toThrow(/unknown field/);
    expect(() =>
      parseSkillDefinition(def([{ ...cooldown, trigger: 'burstUse' }], [{ ...coverHeal, target: 'allies' }])),
    ).toThrow(/only "self"/);
  });
});

describe('ティア（V-0566）', () => {
  const run = (d: SkillDefinition) => {
    const fixed = computeFixedSpecAttack(character);
    const slot: TeamSlotInput = {
      character,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      hpOverride: computeFixedSpecHp(character),
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true, hitRate: 1 },
      skills: { definition: d, levels: MAX_SKILL_LEVELS, treasurePhase: 0 },
    };
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
    const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
    return runSimulation(input);
  };

  it('shortens the cooldown of the activation that applied the S1 decrease (5 bursts alone, 4 without it)', () => {
    // C-0775: 単騎の発動の間隔はゲージで決まる（CT 40 − 13 = 27 秒）。▼が無ければ CT 40 秒が律速
    const withS1 = run(definition);
    const skills = definition.skills;
    const withoutS1 = run({
      ...definition,
      skills: { ...skills, skill1: { ...skills.skill1, effects: skills.skill1.effects.slice(1) } },
    });
    expect(withS1.schedule!.activations).toHaveLength(5);
    expect(withoutS1.schedule!.activations).toHaveLength(4);
    const shortened = withS1.schedule!.activations.map((a) => a.cooldownShortenedFrames ?? 0);
    expect(shortened.slice(0, 4).every((f) => f > 0)).toBe(true);
  });
});
