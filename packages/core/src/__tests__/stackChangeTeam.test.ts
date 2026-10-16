// 2 段目の段 3 の PR 1（plan/design-skill-stage3.md 1.1・1.2・2.1 節）: スタック量の増加（stackChange）と、回数のきっかけの数える窓
// （during）の付与・timed。定義は data/skills のもの（ソーダ：トゥインクルバニー・クイーン（真））と、それを書き換えたもの
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf, valuePiecesOf } from '../skills/holders.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const SODA = 314;
const QUEEN = 870;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };
const rawDefinition = (id: number) => readJson<RawDefinition>(`../../data/skills/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

function slotOf(id: number, definition?: unknown): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const raw = definition ?? (DEFINED.has(id) ? rawDefinition(id) : undefined);
  if (raw !== undefined) slot.skills = { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS };
  return slot;
}

function run(slots: TeamSlotInput[], burst: boolean, controlledSlot: number) {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Wind', hasCore: true };
  const input: TeamInput = { slots, enemy, durationSeconds: 180, burst, controlledSlot };
  return planTeamRun(applyCompositionToTeam(input));
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const parse = (effects: Record<string, unknown>[]) =>
  parseSkillDefinition({
    formatVersion: 1,
    resourceId: 1,
    checkedAt: '2026-10-16',
    skills: { skill1: { effects }, skill2: empty, burst: empty },
  });
const chips = {
  kind: 'state',
  state: 'camouflage',
  trigger: { count: 'normalShot', every: 3 },
  target: 'self',
  maxStacks: 5,
  durationUntil: 'battleEnd',
};
const add = { kind: 'stackChange', state: 'camouflage', trigger: 'battleStart', target: 'self', amount: 3 };

describe('スタック量の増加の読み込み', () => {
  it('reads an increase of a stacking state on self', () => {
    expect(parse([chips, add]).skills.skill1.effects[1]).toEqual(add);
    expect(parse([chips, { ...add, amount: undefined, amountRef: 1 }]).skills.skill1.effects[1]).toMatchObject({
      amountRef: 1,
    });
  });

  it('rejects a missing or doubled amount, other targets, and a state without a stacking grant on self', () => {
    expect(() => parse([chips, { ...add, amount: undefined }])).toThrow(/exactly one of amount and amountRef/);
    expect(() => parse([chips, { ...add, amountRef: 1 }])).toThrow(/exactly one of amount and amountRef/);
    expect(() => parse([chips, { ...add, target: 'allies' }])).toThrow(/expected "self"/);
    expect(() => parse([add])).toThrow(/needs a grant of the same state on self with maxStacks/);
    const { maxStacks: _, ...single } = chips;
    expect(() => parse([single, add])).toThrow(/needs a grant of the same state on self with maxStacks/);
  });

  it('opens the full-burst counting window to grants and timed effects (with a reset)', () => {
    const during = { count: 'normalShot', every: 3, during: 'fullBurst', reset: 'fullBurstStart' };
    expect(parse([{ ...chips, trigger: during }]).skills.skill1.effects[0]).toMatchObject({ trigger: during });
    const timed = { kind: 'timed', trigger: during, target: 'self', stat: 'attack', ref: 1, durationSeconds: 2 };
    expect(parse([timed]).skills.skill1.effects[0]).toMatchObject({ trigger: during });
    const { reset: _, ...noReset } = during;
    expect(() => parse([{ ...chips, trigger: noReset }])).toThrow(/during needs reset/);
  });
});

describe('ソーダ：トゥインクルバニーのゴールデンチップ（C-0128）', () => {
  it('stacks 50 Golden Chips at the start of battle and keeps them to the end (66% critical damage)', () => {
    const plan = run([slotOf(SODA)], false, 0);
    const items = itemsOf(plan.history, { holder: 0, state: 'goldenChip' });
    expect(items).toHaveLength(50);
    expect(items.every((i) => i.start === 0 && i.end === plan.history.frames)).toBe(true);
    expect(items.map((i) => i.stack)).toEqual(Array.from({ length: 50 }, (_, k) => k + 1));
    const crit = valuePiecesOf(plan.history).filter((p) => p.effect.stat === 'critDamage' && p.slotIndex === 0);
    expect(crit.reduce((sum, p) => sum + p.effect.value, 0)).toBeCloseTo(0.66, 12);
    // 付いた記録は、戦闘開始時の増加の 1 件（単騎ではフルバーストが無いので、付与は発火しない）
    expect(plan.history.applications.filter((a) => a.state === 'goldenChip').map((a) => a.frame)).toEqual([0]);
  });

  it('stops at the max stacks of the grant', () => {
    const raw = structuredClone(rawDefinition(SODA));
    raw.skills.skill1!.effects[0] = { ...raw.skills.skill1!.effects[0]!, amountRef: undefined, amount: 60 };
    const plan = run([slotOf(SODA, raw)], false, 0);
    expect(itemsOf(plan.history, { holder: 0, state: 'goldenChip' })).toHaveLength(50);
  });
});

describe('フルバースト中だけ数える付与（クイーン（真）の定義を書き換え）', () => {
  it('fires a grant with during: fullBurst only on shots inside the Full Burst windows', () => {
    const q = 2;
    const raw = structuredClone(rawDefinition(QUEEN));
    raw.skills.skill1!.effects.push({
      kind: 'state',
      state: 'camouflage',
      trigger: { count: 'normalShot', every: 1, during: 'fullBurst', reset: 'fullBurstStart' },
      target: 'self',
      maxStacks: 3,
      durationSeconds: 1,
    });
    const plan = run([slotOf(822), slotOf(20), slotOf(QUEEN, raw)], true, q);
    const windows = plan.schedule!.fullBurstWindows;
    const starts = plan.history.applications.filter((a) => a.state === 'camouflage').map((a) => a.frame);
    expect(starts.length).toBeGreaterThan(0);
    // 射撃の回数のきっかけは次のフレームから。発のフレーム（start − 1）がどれかのフルバーストの窓の中
    expect(starts.every((s) => windows.some((w) => w.start <= s - 1 && s - 1 < w.end))).toBe(true);
    const inside = plan.shots[q]!.frames.filter((f) => windows.some((w) => w.start <= f && f < w.end));
    expect(starts).toHaveLength(inside.length);
  });
});
