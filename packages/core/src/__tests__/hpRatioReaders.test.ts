// HP の割合を時間で読む編（plan/design-hp-ratio-readers.md）: 常時の条件 selfHp（ミルクの S2・ノワールの S1）と、回復の対象
// lowestHpRatio（ミサトの S1）が、最大HP のみ▲（エード・マスト）で下がった HP の割合を時間で読むか。割合の動かない編成は、いままでどおり
// 編成の段で決める（常時の件のまま）
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planTeamRun } from '../frame/plan.ts';
import { itemsOf } from '../skills/holders.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput } from '../team.ts';
import { fixedTeam } from './teamHelpers.ts';

const FLOWER = 304;
const ADE = 310;
const MILK = 141;
const NOIR = 271;
const MISATO = 833;
const MAST = 350;

type Span = { start: number; end: number };
const spans = (items: readonly Span[]): Span[] => items.map(({ start, end }) => ({ start, end }));

/** [0, frames) から off の区間（重なってよい）を除いた区間 */
function complement(off: readonly Span[], frames: number): Span[] {
  const sorted = [...off].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  let at = 0;
  for (const { start, end } of sorted) {
    if (start > at) out.push({ start: at, end: Math.min(start, frames) });
    at = Math.max(at, end);
  }
  if (at < frames) out.push({ start: at, end: frames });
  return out;
}

describe('エードの最大HP のみ▲ と、ミルク・ノワールの常時の selfHp（撮影 A の編成）', () => {
  // I-DOLL・フラワー → エードの順にバーストを使い、ミルク・ノワールは使わない（V-0730 の撮影 A）
  const input: TeamInput = fixedTeam([FLOWER, ADE, MILK, NOIR], 2, { noBurstSlots: [2, 3] });
  const plan = planTeamRun(input);
  const frames = plan.frames;
  const milkS2 = spans(itemsOf(plan.history, { sourceSlotIndex: 2, kind: 'while', stat: 'critDamage', holder: 2 }));
  const noirS1 = spans(itemsOf(plan.history, { sourceSlotIndex: 3, kind: 'while', stat: 'attack', holder: 3 }));
  const onMilk = (skill: 'skill2' | 'burst') =>
    spans(itemsOf(plan.history, { sourceSlotIndex: 1, kind: 'timed', skill, stat: 'maxHpOnly', holder: 2 }));

  it('makes the HP-conditioned passives windowed, not constant', () => {
    expect(itemsOf(plan.history, { sourceSlotIndex: 2, kind: 'passive', stat: 'critDamage' })).toEqual([]);
    expect(milkS2.length).toBeGreaterThan(1);
  });

  it('drops Milk S2 (80% or more) during each Ade burst max-HP-only up (79.90%), from the frame after it starts', () => {
    const bursts = onMilk('burst');
    expect(bursts.length).toBeGreaterThan(0);
    // S2 だけ（86.49%）では外れない
    const off = bursts.map((w) => ({ start: w.start + 1, end: w.end }));
    expect(milkS2).toEqual(complement(off, frames));
  });

  it('drops Noir S1 (70% or more) only while S2 and the burst overlap (68.83%, caster-based max HP; V-0730)', () => {
    const s2 = onMilk('skill2');
    const off = onMilk('burst').flatMap((b) =>
      s2
        .filter((w) => w.start < b.end && b.start < w.end)
        .map((w) => ({ start: Math.max(w.start, b.start) + 1, end: Math.min(w.end, b.end) })),
    );
    expect(off.length).toBeGreaterThan(0);
    expect(noirS1).toEqual(complement(off, frames));
  });

  it('adds the caster-based max-HP-only up as the pre-buff max HP of Ade over that of the holder', () => {
    const value = (holder: number) =>
      itemsOf(plan.history, { sourceSlotIndex: 1, kind: 'timed', skill: 'burst', stat: 'maxHpOnly', holder })[0]!
        .origin;
    const ratioOf = (holder: number) => {
      const o = value(holder);
      return o.kind === 'timed' ? o.effect.value : NaN;
    };
    const maxHp = (slot: number) => plan.history.slots[slot]?.casterMaxHp ?? NaN;
    // エード自身は説明文の値（25.15%）、味方はエードとの最大HP の比を掛けた値
    expect(ratioOf(1)).toBeCloseTo(0.2515, 6);
    for (const holder of [0, 2, 3]) expect(ratioOf(holder) / ratioOf(1)).toBeCloseTo(maxHp(1) / maxHp(holder), 9);
  });
});

describe('HP の割合が動かない編成', () => {
  it('keeps Milk S2 a constant passive (decided in the composition step)', () => {
    const plan = planTeamRun(fixedTeam([FLOWER, MILK], 1));
    expect(itemsOf(plan.history, { sourceSlotIndex: 1, kind: 'while' })).toEqual([]);
    expect(itemsOf(plan.history, { sourceSlotIndex: 1, kind: 'passive', stat: 'critDamage' }).length).toBe(2);
  });

  it('drops Milk S2 when the slot assumes a low HP ratio', () => {
    const input = fixedTeam([FLOWER, MILK], 1);
    input.slots[1] = { ...input.slots[1]!, hpRatio: 0.5 };
    const plan = planTeamRun(input);
    expect(itemsOf(plan.history, { sourceSlotIndex: 1, stat: 'critDamage' })).toEqual([]);
  });
});

describe('マストの最大HP のみ▲ と、ミサトの S1 の回復（lowestHpRatio。撮影 C の編成）', () => {
  // I-DOLL・フラワー → マストの順にバーストを使う（V-0730 の撮影 C）
  const input: TeamInput = fixedTeam([MISATO, MAST, MILK, NOIR, FLOWER], 2, { noBurstSlots: [0, 2, 3] });
  const plan = planTeamRun(input);
  const lowered = spans(
    itemsOf(plan.history, { sourceSlotIndex: 1, kind: 'timed', skill: 'burst', stat: 'maxHpOnly', holder: 1 }),
  );
  const heals = plan.history.heals.filter((h) => h.sourceSlotIndex === 0);
  /** 回復の記録のフレームから見て、発火のフレーム（記録の 0〜7f 前）のどれでも窓の中か外かが変わらない回復 */
  const clear = (frame: number, inside: boolean) =>
    Array.from({ length: 8 }, (_, d) => frame - d).every(
      (f) => lowered.some((w) => w.start < f && f < w.end) === inside,
    );

  it('heals the youngest attacker (51.1%, below Mast at 53.7%) inside her burst max-HP-only up, and Misato (full, youngest) outside', () => {
    expect(lowered.length).toBeGreaterThan(0);
    const inside = heals.filter((h) => clear(h.frame, true));
    const outside = heals.filter((h) => clear(h.frame, false));
    expect(inside.length).toBeGreaterThan(0);
    expect(outside.length).toBeGreaterThan(0);
    for (const h of inside) expect(h.slotIndex).toBe(2);
    for (const h of outside) expect(h.slotIndex).toBe(0);
  });
});

describe('常時の selfHp の書けない stat', () => {
  const definition = (stat: string, target?: string) => {
    const json = JSON.parse(readFileSync(new URL('../../data/skills/141.json', import.meta.url), 'utf8'));
    json.skills.skill2.effects[0].stat = stat;
    // 値を持たない常時のフラグ（静的に読む）は自分にだけ・ref なしで書く
    if (target !== undefined) {
      json.skills.skill2.effects[0].target = target;
      delete json.skills.skill2.effects[0].ref;
    }
    return parseSkillDefinition(json);
  };

  it('rejects stats moving the HP ratio or read by the first pass at a shot', () => {
    expect(() => definition('maxHpOnly')).toThrow(/selfHp is not supported for "maxHpOnly"/);
    expect(() => definition('reloadSpeed')).toThrow(/selfHp is not supported for "reloadSpeed"/);
    expect(() => definition('critDamage')).not.toThrow();
  });

  it('rejects stats that while cannot hold (held by the enemy, static flags)', () => {
    expect(() => definition('damageTaken')).toThrow(/selfHp is not supported for "damageTaken"/);
    expect(() => definition('elementAdvantage', 'self')).toThrow(/selfHp is not supported for "elementAdvantage"/);
  });
});

describe('発動者の最大HP 基準（casterMaxHp）の書ける所', () => {
  const ade = () => JSON.parse(readFileSync(new URL('../../data/skills/310.json', import.meta.url), 'utf8'));

  it('rejects casterMaxHp outside max HP stats, in passive, and in state contents', () => {
    const attack = ade();
    attack.skills.burst.effects[0].stat = 'attack';
    expect(() => parseSkillDefinition(attack)).toThrow(/casterMaxHp is only allowed with stat "maxHp" or "maxHpOnly"/);
    const passive = ade();
    const { trigger: _t, durationRef: _d, ...rest } = passive.skills.burst.effects[0];
    passive.skills.skill2.effects.push({ ...rest, kind: 'passive' });
    expect(() => parseSkillDefinition(passive)).toThrow(/casterMaxHp is only allowed in timed/);
    const state = ade();
    const { stat, ref, scaling, kind: _k, assumes: _a, claims: _c, ...grant } = state.skills.burst.effects[0];
    state.skills.burst.effects[0] = {
      ...grant,
      kind: 'state',
      state: 'barrier',
      contents: [{ stat, ref, scaling }],
    };
    expect(() => parseSkillDefinition(state)).toThrow(/casterMaxHp is only allowed in timed/);
  });
});
