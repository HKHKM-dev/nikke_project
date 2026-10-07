// ペルソナ編（plan/design-persona.md 3 節）: ペルソナ状態（定義の states）・対象の絞り込み（targetState・targetBurstStep・allies の
// excludeSelf）・「〈効果名〉が適用された時」（トリガー { applied }）・戦闘の終わりまで続くスタック（durationUntil: battleEnd）。
// 定義は data/skills のもの（ペルソナの効果は C-0354〜C-0357。V-0233 の撮影待ちの仮説）。
// 編成は V-0233 と同じ: I・II に CT 20 秒のココア・ユニを置き、クイーン（真）（III・操作）+ 雪子（III）。III の候補は枠の若い順
// （burst/controller.ts）なので、I・II の CT が 40 秒だとクイーン（真）が毎回撃ち、雪子は撃たない。CT 20 秒ならクイーン（真）の CT 中に
// 雪子が撃つ（plan/design-persona.md 9.1 節）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { appliedFrames } from '../skills/timeline.ts';
import { parseSkillDefinition, type SkillDefinition, type TimedEffect } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const RAM = 822;
const DELTA = 20;
/** CT 20 秒の I・II（V-0233 の編成） */
const COCOA = 311;
const YUNI = 160;
const QUEEN = 870;
const YUKIKO = 871;
const AIGIS = 872;

const note = (ja: string) => ({ ja, en: ja, kind: 'unimplemented' });

/** data/skills の定義（クイーン（真）・雪子のペルソナの効果は C-0354〜C-0357。仮説） */
const dataDefinition = (id: number): SkillDefinition =>
  parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));
const queenDefinition = () => dataDefinition(QUEEN);
const yukikoDefinition = () => dataDefinition(YUKIKO);

/** ペルソナ状態だけの定義（アイギスなど） */
function personaOnly(resourceId: number): SkillDefinition {
  const empty = { effects: [], notes: [note('テスト')] };
  return parseSkillDefinition({
    formatVersion: 1,
    resourceId,
    checkedAt: '2026-10-06',
    states: ['persona'],
    skills: { skill1: empty, skill2: empty, burst: empty },
  });
}

function fixedSlot(id: number, definition?: SkillDefinition): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  if (definition) slot.skills = { definition, levels: MAX_SKILL_LEVELS };
  return slot;
}

function team(slots: TeamSlotInput[], element: Element, controlledSlot = 2): TeamInput {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true };
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const pair = (element: Element) =>
  team(
    [
      fixedSlot(COCOA, dataDefinition(COCOA)),
      fixedSlot(YUNI, dataDefinition(YUNI)),
      fixedSlot(QUEEN, queenDefinition()),
      fixedSlot(YUKIKO, yukikoDefinition()),
    ],
    element,
  );
const q = 2;
const y = 3;

const empty = { effects: [], notes: [note('-')] };
const definitionWith = (effect: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-06',
  skills: { skill1: { effects: [effect] }, skill2: empty, burst: empty },
  ...extra,
});
const timed = { kind: 'timed', trigger: 'burstUse', target: 'allies', stat: 'attack', ref: 1, durationRef: 2 };

describe('ペルソナの語彙の検証（parseSkillDefinition）', () => {
  it('reads states and rejects unknown or duplicate ones', () => {
    expect(parseSkillDefinition(definitionWith(timed, { states: ['persona'] })).states).toEqual(['persona']);
    expect(() => parseSkillDefinition(definitionWith(timed, { states: ['bunny'] }))).toThrow(/states\[0\]/);
    expect(() => parseSkillDefinition(definitionWith(timed, { states: ['persona', 'persona'] }))).toThrow(/duplicate/);
  });

  it('allows targetState and targetBurstStep only on timed allies', () => {
    const e = parseSkillDefinition(definitionWith({ ...timed, targetState: 'persona', targetBurstStep: 'Step3' }))
      .skills.skill1.effects[0] as TimedEffect;
    expect(e).toMatchObject({ targetState: 'persona', targetBurstStep: 'Step3' });
    expect(() => parseSkillDefinition(definitionWith({ ...timed, target: 'self', targetState: 'persona' }))).toThrow(
      /targetState: only allowed with target "allies"/,
    );
    expect(() =>
      parseSkillDefinition(
        definitionWith({ kind: 'passive', target: 'allies', stat: 'attack', ref: 1, targetBurstStep: 'Step3' }),
      ),
    ).toThrow(/targetBurstStep is only allowed in timed/);
  });

  it('allows { applied } only in damage, and names only on timed without a condition', () => {
    const damage = { kind: 'damage', trigger: { applied: 'followUp' }, ref: 1, damageType: 'distributed' };
    expect(parseSkillDefinition(definitionWith(damage)).skills.skill1.effects[0]).toMatchObject({
      trigger: { applied: 'followUp' },
    });
    expect(() => parseSkillDefinition(definitionWith({ ...damage, trigger: { applied: 'oneMore' } }))).toThrow(
      /applied/,
    );
    expect(() => parseSkillDefinition(definitionWith({ ...timed, trigger: { applied: 'followUp' } }))).toThrow(
      /only allowed in damage/,
    );
    expect(
      parseSkillDefinition(definitionWith({ ...damage, delayFrames: 104 })).skills.skill1.effects[0],
    ).toMatchObject({
      delayFrames: 104,
    });
    expect(() =>
      parseSkillDefinition(definitionWith({ ...damage, trigger: 'fullBurstStart', delayFrames: 24 })),
    ).toThrow(/burstUse/);
    expect(
      (parseSkillDefinition(definitionWith({ ...timed, name: 'followUp' })).skills.skill1.effects[0] as TimedEffect)
        .name,
    ).toBe('followUp');
    expect(() =>
      parseSkillDefinition(
        definitionWith({ ...timed, name: 'followUp', condition: { inFullBurst: true }, stat: 'critRate' }),
      ),
    ).toThrow(/named effect/);
  });

  it('allows durationUntil battleEnd on attack with stacks, but not fullBurstEnd', () => {
    const { durationRef: _, ...base } = timed;
    const e = parseSkillDefinition(definitionWith({ ...base, durationUntil: 'battleEnd', maxStacks: 3 })).skills.skill1
      .effects[0] as TimedEffect;
    expect(e).toMatchObject({ durationUntil: 'battleEnd', maxStacks: 3 });
    expect(() => parseSkillDefinition(definitionWith({ ...base, durationUntil: 'fullBurstEnd' }))).toThrow(
      /duration until an event/,
    );
  });
});

describe('ペルソナ状態の味方への絞り込み（skills/composition.ts）', () => {
  const targetsOf = (input: TeamInput, slot: number, skill: 'skill2', name: string) => {
    const applied = applyCompositionToTeam(input);
    const effect = applied.slots[slot]!.skills!.definition!.skills[skill].effects.find(
      (e) => e.kind === 'timed' && e.name === name,
    ) as TimedEffect;
    return effect.fixedTargets;
  };

  it('gives the follow-up to the other III in the Persona state, and the baton pass to Yukiko', () => {
    expect(targetsOf(pair('Wind'), y, 'skill2', 'followUp')).toEqual([q]);
    expect(targetsOf(pair('Wind'), q, 'skill2', 'batonTouch')).toEqual([y]);
  });

  it('skips a Persona II (Aigis) and a III without the Persona state', () => {
    const withAigis = team(
      [
        fixedSlot(RAM),
        fixedSlot(AIGIS, personaOnly(AIGIS)),
        fixedSlot(QUEEN, queenDefinition()),
        fixedSlot(YUKIKO, yukikoDefinition()),
      ],
      'Wind',
    );
    expect(targetsOf(withAigis, q, 'skill2', 'batonTouch')).toEqual([y]);
    // 雪子に定義（states）が無ければペルソナ状態でない
    const undefinedYukiko = team(
      [fixedSlot(RAM), fixedSlot(DELTA), fixedSlot(QUEEN, queenDefinition()), fixedSlot(YUKIKO)],
      'Wind',
    );
    expect(targetsOf(undefinedYukiko, q, 'skill2', 'batonTouch')).toEqual([]);
  });
});

describe('追撃とバトンタッチ（ココア + ユニ + クイーン（真）+ 雪子）', () => {
  const wind = pair('Wind');
  const plan = planTeamRun(wind);
  const yukikoBursts = plan.schedule!.activations.filter((a) => a.slotIndex === y).map((a) => a.frame);
  const queenBursts = plan.schedule!.activations.filter((a) => a.slotIndex === q).map((a) => a.frame);

  it('has both III burst in the run', () => {
    expect(yukikoBursts.length).toBeGreaterThan(0);
    expect(queenBursts.length).toBeGreaterThan(0);
  });

  // 追撃の分配ダメージは、追撃が付いたフレームの 82f 後（C-0429。仮説。動画では雪子のバーストのヒットの 104f 後で、間に止まり 22f が入る。V-0292）
  it("applies the follow-up to Queen at each of Yukiko's bursts, and fires Queen's S1 82 frames later", () => {
    const followUps = appliedFrames(plan.timeline, 'followUp', q);
    expect(followUps).toEqual(yukikoBursts.filter((f) => f < plan.frames));
    expect(appliedFrames(plan.timeline, 'followUp', y)).toEqual([]);
    const s1 = plan.skillHits.filter(
      (h) => h.slotIndex === q && h.effect.source.skill === 'skill1' && typeof h.effect.trigger === 'object',
    );
    expect(s1.map((h) => h.frame)).toEqual(followUps.map((f) => f + 82).filter((f) => f < plan.frames));
  });

  it("stacks the baton pass on Yukiko at each of Queen's bursts, up to 3, until the end of the battle", () => {
    const baton = plan.timeline.windows.filter(
      (w) =>
        w.slotIndex === y &&
        w.effect.source.resourceId === QUEEN &&
        w.effect.source.skill === 'skill2' &&
        w.effect.stat === 'attack',
    );
    expect(baton.map((w) => w.start)).toEqual(queenBursts.slice(0, 3));
    for (const w of baton) expect(w.end).toBe(plan.frames);
    expect(plan.timeline.windows.some((w) => w.slotIndex === q && w.effect.name === 'batonTouch')).toBe(false);
  });

  it('does nothing against a Fire enemy (no 1more)', () => {
    const fire = planTeamRun(pair('Fire'));
    expect(fire.timeline.applications).toEqual([]);
    expect(fire.timeline.windows.some((w) => w.effect.name !== undefined)).toBe(false);
  });

  it('agrees between sim and calc', () => {
    const sim = runSimulation(wind);
    const calc = computeTeamDamage(wind);
    expect(sim.schedule).toEqual(calc.schedule);
    wind.slots.forEach((_, i) => {
      expect(sim.slots[i]!.skillHits.damage).toBe(calc.slots[i]!.skillHits.totalDamage);
      const s = sim.slots[i]!.totalDamage;
      const c = calc.slots[i]!.totalDamage;
      expect(Math.abs(s - c) / c).toBeLessThan(0.05);
    });
  });
});
