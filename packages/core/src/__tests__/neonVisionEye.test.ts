// 2 段目の段 10 の PR 2（plan/design-skill-stage10.md 2.3・3.2 節）: ネオン：ビジョン・アイ（18）の火力ゲージ。カウンタの増減
// （counterChange）・カウンタの条件（selfCounter）・状態の終わりのきっかけ（{ ended }）・カウンタの値をスタック数にする付与（stacksFrom）と、
// 条件つきの射撃ごとの倍率ダメージ（S1 の超火力状態の追加効果）。録画 0671〜0673（V-0503）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { effectFrameOf } from '../burst/schedule.ts';
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

const NEON = 18;
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
const definition = (id: number) => parseSkillDefinition(readJson<unknown>(`../../data/skills/${id}.json`));
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
  if (DEFINED.has(id)) slot.skills = { definition: definition(id), levels: MAX_SKILL_LEVELS };
  return slot;
}

function run() {
  const m = 2;
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: 'Fire', hasCore: true };
  const input: TeamInput = {
    slots: [slotOf(822), slotOf(20), slotOf(NEON)],
    enemy,
    durationSeconds: 180,
    burst: true,
    controlledSlot: m,
  };
  const plan = planTeamRun(applyCompositionToTeam(input));
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === m).map(effectFrameOf);
  return { m, plan, bursts };
}

describe('ネオン：ビジョン・アイ（18）の火力ゲージ', () => {
  it('counts the gauge: 100 at battle start, Super Firepower at 100 (back to 0), and Firepower Charge below 100', () => {
    const { m, plan, bursts } = run();
    expect(bursts.length).toBeGreaterThanOrEqual(4);
    const records = plan.history.counters.filter((c) => c.slotIndex === m && c.counter === 'firepowerGauge');
    const valueBefore = (frame: number) => records.filter((c) => c.frame < frame).at(-1)?.value ?? 0;
    expect(records[0]).toEqual({ frame: 0, slotIndex: m, counter: 'firepowerGauge', value: 100, battleStart: true });
    // 1 回目は 100 で超火力（0 になる）。2 回目は 0 から火力チャージ（+1・その間の通常攻撃の発ごとに +2・終わりに +45）。上限は 100
    const charge = itemsOf(plan.history, { holder: m, state: 'firepowerCharge' })[0]!;
    const shots = plan.shots[m]!.frames.filter((f) => charge.start <= f && f < charge.end).length;
    expect(bursts.slice(0, 4).map(valueBefore)).toEqual([100, 0, 1 + 2 * shots + 45, 100]);
    expect(Math.max(...records.map((c) => c.value))).toBe(100);
    const applied = (state: string) =>
      bursts.map((f) => plan.history.applications.some((a) => a.slotIndex === m && a.state === state && a.frame === f));
    expect(applied('superFirepower').slice(0, 4)).toEqual([true, false, false, true]);
    expect(applied('firepowerCharge').slice(0, 4)).toEqual([false, true, true, false]);
    // 火力チャージの終わり（{ ended }）に +45: 2 回目の火力チャージの件の終わりのフレームの記録
    const atEnd = records.find((c) => c.frame === charge.end)!;
    expect(atEnd.value - valueBefore(charge.end)).toBe(45);
  });

  it('gives the Super Firepower bonus hits only during Super Firepower, and Super Firepower Charge stacks equal to the gauge', () => {
    const { m, plan } = run();
    const records = plan.history.counters.filter((c) => c.slotIndex === m && c.counter === 'firepowerGauge');
    const valueBefore = (frame: number) => records.filter((c) => c.frame < frame).at(-1)?.value ?? 0;
    const superItems = itemsOf(plan.history, { holder: m, state: 'superFirepower' });
    const bonus = plan.skillHits.filter((h) => h.slotIndex === m && h.effect.source.skill === 'skill1');
    expect(bonus.length).toBeGreaterThan(0);
    for (const h of bonus) expect(superItems.some((i) => i.start < h.frame && h.frame < i.end)).toBe(true);
    expect(bonus[0]!.hit.multiplier).toBeCloseTo(2.6279, 9);
    // フルバーストの終わりの超火力チャージのスタック数（火力ゲージ 0 の回は付かない）
    const spc = itemsOf(plan.history, { holder: m, state: 'superFirepowerCharge' });
    const stacksAt = (frame: number) =>
      Math.max(0, ...spc.filter((i) => i.start <= frame && frame < i.end).map((i) => i.stack ?? 1));
    const ends = plan.schedule!.fullBurstWindows.slice(0, 4).map((w) => w.end);
    expect(ends.map(stacksAt)).toEqual(ends.map((e) => valueBefore(e)));
    expect(ends.map(stacksAt)[0]).toBe(0);
    expect(ends.map(stacksAt)[2]).toBe(100);
  });

  it('rejects malformed counters', () => {
    const def = readJson<{ skills: Record<string, { effects: Record<string, unknown>[] }> }>(
      '../../data/skills/18.json',
    );
    const withEffect = (slot: string, index: number, patch: Record<string, unknown>) => {
      const copy = structuredClone(def);
      copy.skills[slot]!.effects[index] = { ...copy.skills[slot]!.effects[index], ...patch };
      return () => parseSkillDefinition(copy);
    };
    expect(withEffect('burst', 1, {})).not.toThrow();
    expect(
      withEffect('burst', 1, { condition: { selfCounter: { counter: 'firepowerGauge', atLeast: 1, below: 100 } } }),
    ).toThrow(/exactly one of atLeast and below/);
    expect(withEffect('burst', 1, { condition: { selfCounter: { counter: 'firepowerGauge', atLeast: 101 } } })).toThrow(
      /at most the max/,
    );
    expect(withEffect('skill2', 4, { maxStacks: 50 })).toThrow(/stacksFrom needs maxStacks/);
    expect(withEffect('skill2', 1, { counter: 'nope' })).toThrow(/counter/);
    expect(withEffect('skill2', 1, { amount: 2 })).toThrow(/exactly one of amount and amountRef/);
    expect(withEffect('skill2', 3, { trigger: { ended: 'firepowerCharge', x: 1 } })).toThrow(/unknown field/);
  });
});
