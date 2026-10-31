// ベスティー：タクティカル・アップ（94）を含む編成（2 段目の段 16 の PR 2。plan/design-skill-stage16.md 2.2 節。V-0586）。
// S1: ミサイルガイドはフルチャージの発で（ミサイルガイドでないときに）付き、次の発から 3 発にチャージ速度▲・チャージダメージ▲（C-0804）。
// S2: フルチャージの発ごとの防御力無視ダメージ（C-0805）。バースト: 防御力無視のバーストスキルダメージ（C-0807）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import { planTeamRun } from '../frame/plan.ts';
import type { SlotCondition, TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';
import { slotPieces } from './historyHelpers.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const BESTIE = 94;
const MANUAL: SlotCondition = { coreHitRate: 1, distanceBonus: false, fullCharge: true };
const raw = () =>
  readJson<{ skills: { skill1: { effects: Record<string, unknown>[] } } }>(`../../data/skills/${BESTIE}.json`);

function bestieSlot(): TeamSlotInput {
  const c = readJson<CharacterData>(`../../data/characters/${BESTIE}.json`);
  const fixed = computeFixedSpecAttack(c);
  return {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: MANUAL,
    skills: { definition: parseSkillDefinition(raw()), levels: MAX_SKILL_LEVELS },
  };
}

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

describe('ベスティー：タクティカル・アップの定義', () => {
  const def = parseSkillDefinition(raw());

  it('writes the guide removal on a full reload and the true damage of S2 and the burst', () => {
    expect(def.skills.skill1.effects[1]).toMatchObject({
      kind: 'removeState',
      state: 'missileGuide',
      trigger: { reloadEnd: true },
    });
    expect(def.skills.skill2.effects[0]).toMatchObject({ kind: 'damage', damageType: 'true' });
    expect(def.skills.burst.effects[1]).toMatchObject({ kind: 'burstDamage', damageType: 'true' });
  });

  it('allows a reload end trigger only in removeState', () => {
    const json = raw();
    json.skills.skill1.effects[0]!.trigger = { reloadEnd: true };
    expect(() => parseSkillDefinition(json)).toThrow(/only allowed in removeState/);
  });

  it('allows a grant to look at its own state only as "not in the state"', () => {
    const json = raw();
    json.skills.skill1.effects[0]!.condition = { selfState: { state: 'missileGuide', present: true } };
    expect(() => parseSkillDefinition(json)).toThrow(/cannot look at its own state/);
  });
});

describe('ベスティー：タクティカル・アップ単騎（バーストなし）', () => {
  const input: TeamInput = { slots: [bestieSlot()], enemy, durationSeconds: 180, burst: false, controlledSlot: 0 };
  const plan = planTeamRun(input);
  const frames = plan.shots[0]!.frames;
  const guide = slotPieces(plan, 0).filter(
    (p) => p.effect.source.skill === 'skill1' && p.effect.stat === 'chargeDamage',
  );
  const guided = (f: number) => guide.some((p) => p.start <= f && f < p.end);

  it('guides the 3 shots after each charged shot, so a magazine of 8 is charged-guided×3 twice', () => {
    expect(
      frames
        .slice(0, 16)
        .map((f) => (guided(f) ? 'G' : 'N'))
        .join(''),
    ).toBe('NGGGNGGGNGGGNGGG');
  });

  it('fires the S2 true damage on every full charge shot, guided shots included', () => {
    const s2 = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2');
    expect(s2.map((h) => h.frame)).toEqual(frames);
  });
});
