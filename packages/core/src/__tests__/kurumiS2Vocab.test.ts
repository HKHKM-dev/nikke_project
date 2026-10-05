// クルミ S2 編: フルバースト中だけ数える回数トリガー（during・reset）と、damage の条件（fullBurst・targetStatus）の
// DSL・トリガー・発火の絞り込み（plan/design-kurumi-s2.md 2 節）。3 節の読み（H1〜H3）を定義に差し込んで、語彙の働きを見る
// （実測の値は持ち込まない）。クルミの定義は H3（V-0181・C-0276）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { computeTeamDamage } from '../calc/model.ts';
import { dotActiveSpans } from '../frame/dot.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const KURUMI = 862;
const raw862 = readJson<{ skills: Record<string, { effects: unknown[]; notes?: unknown[] }> }>(
  `../../data/skills/${KURUMI}.json`,
);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);
const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);

/** 862.json を写して、skill2 を effects に差し替えた定義 */
function withSkill2(effects: unknown[]): unknown {
  const copy = structuredClone(raw862);
  copy.skills.skill2 =
    effects.length > 0 ? { effects } : { effects, notes: [{ ja: 'S2 なし', en: 'no S2', kind: 'unimplemented' }] };
  return copy;
}

const S2_H1 = {
  kind: 'damage',
  trigger: { count: 'normalHit', everyRef: 1, during: 'fullBurst', reset: 'fullBurstStart' },
  condition: { targetStatus: 'hacking' },
  ref: 2,
  damageType: 'additional',
};
const S2_H2 = { ...S2_H1, trigger: { ...S2_H1.trigger, reset: 'never' } };
const S2_H3 = {
  kind: 'damage',
  trigger: { count: 'normalHit', everyRef: 1 },
  condition: { fullBurst: true, targetStatus: 'hacking' },
  ref: 2,
  damageType: 'additional',
};

describe('during・reset と damage の condition の検証', () => {
  it('parses the three readings', () => {
    for (const e of [S2_H1, S2_H2, S2_H3]) {
      expect(parseSkillDefinition(withSkill2([e])).skills.skill2.effects[0]).toMatchObject(e);
    }
  });

  it('needs reset with during, and during with reset', () => {
    const { reset: _, ...noReset } = S2_H1.trigger;
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H1, trigger: noReset }]))).toThrow(/during needs reset/);
    const { during: __, ...noDuring } = S2_H1.trigger;
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H1, trigger: noDuring }]))).toThrow(/reset needs during/);
    expect(() =>
      parseSkillDefinition(withSkill2([{ ...S2_H1, trigger: { ...S2_H1.trigger, reset: 'battleStart' } }])),
    ).toThrow(/reset/);
  });

  it('allows during only in damage, and not with gaugeHits', () => {
    const timed = {
      kind: 'timed',
      trigger: S2_H1.trigger,
      target: 'self',
      stat: 'attack',
      ref: 2,
      durationSeconds: 5,
    };
    expect(() => parseSkillDefinition(withSkill2([timed]))).toThrow(/only allowed in damage/);
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H1, condition: undefined, gaugeHits: [0] }]))).toThrow(
      /gaugeHits cannot be used with a condition or a counting window/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H3, gaugeHits: [0] }]))).toThrow(
      /gaugeHits cannot be used with a condition/,
    );
  });

  it('needs at least one known condition key', () => {
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H3, condition: {} }]))).toThrow(/at least one/);
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H3, condition: { selfBuffed: 'attack' } }]))).toThrow(
      /condition\.selfBuffed: unknown field/,
    );
    expect(() => parseSkillDefinition(withSkill2([{ ...S2_H3, condition: { fullBurst: false } }]))).toThrow(
      /expected true/,
    );
  });
});

describe('dotActiveSpans', () => {
  it('spans each group from its first application to its last tick, both ends included', () => {
    // 5 秒維持・1 秒間隔・付いた 1 秒後から: 0 と 120 は同じまとまり、1000 は新しいまとまり
    const spans = dotActiveSpans([0, 120, 1000], 1, 5, 'afterInterval');
    expect(spans).toHaveLength(2);
    expect(spans[0]!.start).toBe(0);
    expect(spans[1]!.start).toBe(1000);
    expect(spans[0]!.end).toBeGreaterThan(120);
    expect(spans[0]!.end).toBeLessThan(1000);
  });
});

const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element: null, hasCore: true };

function slotOf(id: number, definition?: unknown): TeamSlotInput {
  const c = character(id);
  const fixed = computeFixedSpecAttack(c);
  const slot: TeamSlotInput = {
    character: c,
    growth: fixed.growth,
    attackOverride: fixed.attack,
    condition: { coreHitRate: 1, distanceBonus: false, fullCharge: true },
  };
  const raw = definition ?? (DEFINED.has(id) ? readJson<unknown>(`../../data/skills/${id}.json`) : undefined);
  if (raw !== undefined) slot.skills = { definition: parseSkillDefinition(raw), levels: MAX_SKILL_LEVELS };
  return slot;
}

/** クルミ（I）+ デルタ（II）+ ドレイク（III）。フルバーストが起きる最小の 3 人 */
function teamWith(s2: unknown[] | null | 'repo'): TeamInput {
  // null は S2 なし、'repo' はリポジトリの定義のまま
  const kurumi = s2 === 'repo' ? slotOf(KURUMI) : slotOf(KURUMI, withSkill2(s2 ?? []));
  return { slots: [kurumi, slotOf(20), slotOf(101)], enemy, durationSeconds: 180, burst: true, controlledSlot: 0 };
}

const N = 36;

describe.each([
  ['H1（フルバーストごとに数え直す）', S2_H1],
  ['H2（フルバースト中だけ数え、持ち越す）', S2_H2],
  ['H3（通算の 36 の倍数の命中がフルバースト中なら）', S2_H3],
] as const)('クルミ S2 の読み %s', (name, effect) => {
  const input = teamWith([effect]);
  const plan = planTeamRun(input);
  const shots = plan.shots[0]!.frames;
  const windows = plan.schedule!.fullBurstWindows;
  const s2 = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2').map((h) => h.frame);
  const inWindow = (f: number) => windows.some((w) => w.start <= f && f < w.end);

  it('fires only inside full bursts, at the expected hits', () => {
    expect(windows.length).toBeGreaterThan(1);
    expect(s2.length).toBeGreaterThan(0);
    expect(s2.every(inWindow)).toBe(true);
    let expected: number[];
    if (name.startsWith('H3')) {
      expected = shots.filter((f, j) => (j + 1) % N === 0 && inWindow(f));
    } else {
      expected = [];
      let carried = 0;
      for (const w of windows) {
        const inside = shots.filter((f) => w.start <= f && f < w.end);
        const offset = name.startsWith('H1') ? 0 : carried;
        inside.forEach((f, j) => {
          if ((offset + j + 1) % N === 0) expected.push(f);
        });
        carried += inside.length;
      }
    }
    expect(s2).toEqual(expected);
  });

  it('fires only while the target is hacked, and never for a status nobody applies', () => {
    const hacking = plan.skillHits.filter((h) => h.slotIndex === 0 && h.effect.dot?.status === 'hacking');
    expect(hacking.length).toBeGreaterThan(0);
    const none = planTeamRun(teamWith([{ ...effect, condition: { ...effect.condition, targetStatus: 'stunned' } }]));
    expect(none.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2')).toHaveLength(0);
  });

  it('adds the same additional damage in sim and calc', () => {
    const base = planTeamRun(teamWith(null));
    // S2 を足しても 1 パス目（射撃・時刻表）は変わらない
    expect(plan.shots[0]!.frames).toEqual(base.shots[0]!.frames);
    expect(plan.schedule!.fullBurstWindows).toEqual(base.schedule!.fullBurstWindows);
    const sim = runSimulation(input).totalDamage - runSimulation(teamWith(null)).totalDamage;
    const calc = computeTeamDamage(input).totalDamage - computeTeamDamage(teamWith(null)).totalDamage;
    expect(sim).toBeGreaterThan(0);
    expect(calc).toBeCloseTo(sim, 0);
  });
});

describe('クルミの定義（H3。V-0181・C-0276）', () => {
  it('fires S2 on the same hits as H3', () => {
    const def = parseSkillDefinition(raw862);
    expect(def.skills.skill2.effects).toMatchObject([S2_H3]);
    const real = planTeamRun(teamWith('repo'));
    const h3 = planTeamRun(teamWith([S2_H3]));
    const s2 = (p: typeof real) =>
      p.skillHits.filter((h) => h.slotIndex === 0 && h.effect.source.skill === 'skill2').map((h) => h.frame);
    expect(s2(real).length).toBeGreaterThan(0);
    expect(s2(real)).toEqual(s2(h3));
  });
});
