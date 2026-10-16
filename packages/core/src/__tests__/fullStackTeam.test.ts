// 2 段目の段 3 の PR 2（plan/design-skill-stage3.md 1.3・2.2 節）: フルスタックの消費のきっかけ（{ fullStack }）と、それで書き直した
// クラウン（330）の S2（リラックス 20 スタックで外れて回復。C-0271）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const CROWN = 330;
const crown = readJson<CharacterData>(`../../data/characters/${CROWN}.json`);
const crownDefinition = () => parseSkillDefinition(readJson<unknown>(`../../data/skills/${CROWN}.json`));

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-16',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
const relax = {
  kind: 'state',
  state: 'camouflage',
  trigger: { count: 'normalShot', every: 3 },
  target: 'self',
  maxStacks: 4,
  durationUntil: 'battleEnd',
};
const heal = { kind: 'heal', trigger: { fullStack: 'camouflage' }, target: 'self', ref: 1 };

describe('フルスタックの消費のきっかけの読み込み', () => {
  it('reads a heal on the full stack of a shot-count stacking state on self', () => {
    expect(parse([relax, heal]).skills.skill1.effects[1]).toEqual(heal);
  });

  it('rejects it outside heal, without a stacking grant, and with a grant not on a shot count', () => {
    const timed = { kind: 'timed', trigger: { fullStack: 'camouflage' }, target: 'self', stat: 'attack', ref: 1 };
    expect(() => parse([relax, { ...timed, durationSeconds: 1 }])).toThrow(/only allowed in heal/);
    expect(() => parse([heal])).toThrow(/needs grants of the same state on self with maxStacks/);
    const { maxStacks: _, ...single } = relax;
    expect(() => parse([single, heal])).toThrow(/needs grants of the same state on self with maxStacks/);
    expect(() => parse([relax, { ...relax, trigger: 'burstUse' }, heal])).toThrow(/shot count triggers/);
  });
});

describe('クラウン（330）の S2（C-0271）', () => {
  const run = () => {
    const fixed = computeFixedSpecAttack(crown);
    const slot: TeamSlotInput = {
      character: crown,
      growth: fixed.growth,
      attackOverride: fixed.attack,
      condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
      skills: { definition: crownDefinition(), levels: MAX_SKILL_LEVELS },
    };
    const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };
    const input: TeamInput = { slots: [slot], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
    return planTeamRun(applyCompositionToTeam(input));
  };

  it('heals on the frame after every 860th shot (43 shots × 20 stacks of Relax)', () => {
    const plan = run();
    const shots = plan.shots[0]!.frames;
    const expected = shots.filter((_, k) => (k + 1) % 860 === 0).map((f) => f + 1);
    expect(expected.length).toBeGreaterThan(1);
    expect(plan.history.heals.map((h) => h.frame)).toEqual(expected.filter((f) => f < plan.history.frames));
  });

  it('removes all 20 stacks of Relax at the heal (cut on the next frame) and starts again from 1', () => {
    const plan = run();
    const heals = plan.history.heals.map((h) => h.frame);
    const items = itemsOf(plan.history, { holder: 0, state: 'relax' });
    for (const heal of heals) {
      // フルスタックになった段 20 は回復のフレームに始まり、どの段も次のフレームで切れる
      const chain = items.filter((i) => i.start <= heal && heal < i.end);
      expect(chain.map((i) => i.stack).sort((a, b) => a! - b!)).toEqual(Array.from({ length: 20 }, (_, k) => k + 1));
      expect(chain.every((i) => i.end === heal + 1)).toBe(true);
      expect(chain.find((i) => i.stack === 20)!.start).toBe(heal);
      // 次の段 1 は回復より後に始まる
      const next = items.find((i) => i.stack === 1 && i.start > heal);
      if (next !== undefined) expect(items.filter((i) => i.start > heal && i.start < next.start)).toEqual([]);
    }
  });
});
