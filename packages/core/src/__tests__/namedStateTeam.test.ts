// 名前の付いた状態の語彙編（plan/design-named-state.md・plan/design-named-state-impl.md 2 節）: 状態の付与（kind: 'state'）の検証、
// 同じ状態の中身の窓を付与をまたいで和集合にすること、条件つき・順位の対象の付与と「〈状態名〉が適用された時」、1 パス目の順位、
// calc の射撃の数え方（中身の窓の shotCount）。定義は data/skills のもの（ウンファ：TU・クイーン（真）・雪子）と、それを書き換えたもの
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { runFirstPass } from '../frame/firstPass.ts';
import { planTeamRun } from '../frame/plan.ts';
import { runSimulation } from '../sim/engine.ts';
import { applyCompositionToTeam } from '../skills/composition.ts';
import { MAX_SKILL_LEVELS, isStateContent } from '../skills/resolve.ts';
import { appliedFrames, selfBuffedAt } from '../skills/timeline.ts';
import { applyTreasureToTeam } from '../skills/treasure.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import { toTimelineSlots, type TeamInput, type TeamSlotInput } from '../team.ts';
import { gameSecondsToFrames } from '../time.ts';
import type { CharacterData, Element } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };
const rawDefinition = (id: number) => readJson<RawDefinition>(`../../data/skills/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

const FLOWER = 304;
const EUNHWA = 95;
const SUN = 308;
const QUEEN = 870;

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

function team(slots: TeamSlotInput[], element: Element | null, controlledSlot: number): TeamInput {
  const enemy: EnemyInput = { defence: FIXED_SPEC_ENEMY_DEFENCE, element, hasCore: true };
  return { slots, enemy, durationSeconds: 180, burst: true, controlledSlot };
}

const empty = { effects: [], notes: [{ ja: '-', en: '-', kind: 'unimplemented' }] };
const definitionWith = (effects: Record<string, unknown>[]) => ({
  formatVersion: 1,
  resourceId: 1,
  checkedAt: '2026-10-09',
  skills: { skill1: { effects }, skill2: empty, burst: empty },
});
const camouflage = {
  kind: 'state',
  state: 'camouflage',
  trigger: 'burstUse',
  target: 'self',
  durationSeconds: 5,
  contents: [{ stat: 'trueDamage', ref: 1 }],
};
const parse = (effects: Record<string, unknown>[]): SkillDefinition => parseSkillDefinition(definitionWith(effects));

describe('状態の付与の検証（parseSkillDefinition）', () => {
  it('checks each content item as a timed with the fields of the grant', () => {
    expect(parse([camouflage]).skills.skill1.effects[0]).toMatchObject({ kind: 'state', state: 'camouflage' });
    const { durationSeconds: _, ...noSeconds } = camouflage;
    expect(() => parse([{ ...noSeconds, durationShots: 3, contents: [{ stat: 'attack', ref: 1 }] }])).toThrow(
      /a duration in shots is not supported for "attack"/,
    );
    expect(() => parse([{ ...camouflage, contents: [{ stat: 'trueDamage' }] }])).toThrow(/ref/);
    expect(() => parse([{ ...camouflage, contents: [] }])).toThrow(/contents: expected a non-empty array/);
  });

  it('keeps the value fields in the contents, and the trigger rules of timed', () => {
    expect(() => parse([{ ...camouflage, stat: 'attack' }])).toThrow(/a state grant has no value/);
    expect(() => parse([{ ...camouflage, amplifies: { skill: 'skill2', percent: 100 } }])).toThrow(/amplifies/);
    expect(() => parse([{ ...camouflage, trigger: { applied: 'followUp' } }])).toThrow(/only allowed in damage/);
    expect(() => parse([{ ...camouflage, trigger: { count: 'normalHit', chance: 0.5 } }])).toThrow(/chance/);
    expect(() => parse([{ ...camouflage, name: 'followUp' }])).toThrow(/unknown field/);
  });

  it('allows contents on one grant of a state, with the same duration and max stacks on all of them', () => {
    const second = { ...camouflage, trigger: 'fullBurstStart', contents: undefined };
    expect(parse([camouflage, second]).skills.skill1.effects).toHaveLength(2);
    expect(() => parse([camouflage, { ...camouflage, trigger: 'fullBurstStart' }])).toThrow(
      /only one grant of "camouflage" in a definition may have contents/,
    );
    expect(() => parse([camouflage, { ...second, durationSeconds: 6 }])).toThrow(/need the same duration/);
    expect(() => parse([camouflage, { ...second, maxStacks: 2 }])).toThrow(/need the same max stacks/);
  });

  it('does not mix a static grant with a timed grant of the same state', () => {
    const { durationSeconds: _, ...rest } = camouflage;
    const forever = { ...rest, trigger: 'battleStart', durationUntil: 'battleEnd' };
    expect(() => parse([forever, { ...forever, trigger: 'fullBurstStart', contents: undefined }])).toThrow(
      /need to be all static/,
    );
  });

  it('rejects a grant that looks at its own state, and ids of the other side', () => {
    const baton = {
      kind: 'state',
      state: 'batonPass',
      trigger: 'burstUse',
      target: 'allies',
      durationSeconds: 5,
    };
    expect(() => parse([{ ...baton, targetState: 'batonPass' }])).toThrow(/cannot look at its own state/);
    expect(() => parse([{ ...camouflage, state: 'hacked' }])).toThrow(/held by the enemy/);
  });
});

describe('ウンファ：TU のカモフラージュ（付与をまたぐ和集合。録画 233 の編成）', () => {
  // フラワー（I）+ ウンファ：TU（II）+ サン（III・操作）。モデルではフルバーストの中の炸裂弾がフルチャージの発として付け直し、
  // バースト使用時の窓と重なる（plan/design-named-state-impl.md 2 節）
  const input = team([slotOf(FLOWER), slotOf(EUNHWA), slotOf(SUN)], 'Fire', 2);
  const plan = planTeamRun(applyCompositionToTeam(input));
  const e = 1;
  const states = plan.timeline.namedStateWindows.filter((w) => w.state === 'camouflage');
  const bursts = plan.schedule!.activations.filter((a) => a.slotIndex === e).map((a) => a.frame);

  it('re-applies Camouflage inside the burst window (the two triggers overlap)', () => {
    const applied = appliedFrames(plan.timeline, 'camouflage', e);
    const five = gameSecondsToFrames(5);
    expect(applied).toContain(bursts[0]);
    expect(applied.some((f) => f > bursts[0]! && f < bursts[0]! + five)).toBe(true);
  });

  it('keeps one window per state (union across the grants) and puts the contents on it', () => {
    expect(states.length).toBeGreaterThan(0);
    for (let i = 1; i < states.length; i++) expect(states[i]!.start).toBeGreaterThan(states[i - 1]!.end);
    const contents = plan.timeline.windows.filter((w) => isStateContent(w.effect) && w.slotIndex === e);
    for (const stat of ['trueDamageConversion', 'trueDamage']) {
      const spans = contents.filter((w) => w.effect.stat === stat).map((w) => [w.start, w.end]);
      expect(spans).toEqual(states.map((w) => [w.start, w.end]));
    }
    // バースト使用時の窓（5 秒）が、付け直しで延びる
    expect(states[0]!.start).toBe(bursts[0]);
    expect(states[0]!.end).toBeGreaterThan(bursts[0]! + gameSecondsToFrames(5));
  });

  it('adds the true damage up once where the two triggers overlap', () => {
    const ups = plan.timeline.segments.map((s) => s.slots[e]!.buffs.trueDamage);
    expect(Math.max(...ups)).toBeCloseTo(0.4224, 12);
    expect(ups.every((v) => v === 0 || Math.abs(v - 0.4224) < 1e-12)).toBe(true);
  });

  it('agrees between sim and calc', () => {
    const sim = runSimulation(input);
    const calc = computeTeamDamage(input);
    expect(sim.schedule).toEqual(calc.schedule);
    expect(Math.abs(sim.slots[e]!.totalDamage - calc.slots[e]!.totalDamage) / calc.slots[e]!.totalDamage).toBeLessThan(
      0.05,
    );
  });
});

describe('calc の射撃の数え方（自分の射撃の回数で開いた状態の窓。plan/design-named-state-impl.md 1.6 節）', () => {
  // バーストの受けるダメージ▲（weaponChangeShot）を外し、自分の射撃の回数で開く窓をカモフラージュのフルチャージの付与だけにする
  const withoutBurstTaken = () => {
    const raw = structuredClone(rawDefinition(EUNHWA));
    raw.skills.burst!.effects = raw.skills.burst!.effects.filter((x) => x.kind !== 'timed');
    return raw;
  };
  const sources = (raw: RawDefinition) => {
    const calc = computeTeamDamage(team([slotOf(FLOWER), slotOf(EUNHWA, raw), slotOf(SUN)], 'Fire', 2));
    return new Set(calc.slots[1]!.segments.map((g) => g.triggerSource));
  };

  it('counts every group of the slot from the shots when a full-charge grant opens its state', () => {
    expect(sources(withoutBurstTaken())).toEqual(new Set(['shots']));
  });

  it('keeps the average rate outside the windows when no grant counts its own shots', () => {
    const raw = withoutBurstTaken();
    raw.skills.skill1!.effects = raw.skills.skill1!.effects.filter((x) => typeof x.trigger === 'string');
    expect(sources(raw)).toContain('average');
  });
});

describe('条件つき・順位の対象の付与と「〈状態名〉が適用された時」（クイーン（真）の定義を書き換え）', () => {
  /** ラム（I）+ デルタ（II）+ クイーン（真）（III・操作）。S1 に付与と、その状態が付いた時の分配ダメージを足す */
  const withGrant = (grant: Record<string, unknown>) => {
    const raw = structuredClone(rawDefinition(QUEEN));
    raw.skills.skill1!.effects.push(grant, {
      kind: 'damage',
      trigger: { applied: 'followUp' },
      ref: 4,
      damageType: 'distributed',
    });
    return team([slotOf(822), slotOf(20), slotOf(QUEEN, raw)], 'Wind', 2);
  };
  const q = 2;
  const grantIndex = rawDefinition(QUEEN).skills.skill1!.effects.length;

  it('applies a conditional grant only while the condition holds, and fires the damage at each application', () => {
    // 「自分が分配ダメージ増加状態なら」（S2 のバースト 3 段階突入時の▲。C-0391）、通常攻撃 10 回ごと
    const input = withGrant({
      kind: 'state',
      state: 'followUp',
      trigger: { count: 'normalShot', every: 10 },
      condition: { selfBuffed: 'distributedDamage' },
      target: 'self',
      durationSeconds: 1,
    });
    const plan = planTeamRun(applyCompositionToTeam(input));
    const fires = plan.shots[q]!.frames.filter((_, i) => (i + 1) % 10 === 0);
    const applied = appliedFrames(plan.timeline, 'followUp', q);
    const skips = plan.timeline.conditionSkips.filter((x) => x.state === 'followUp').map((x) => x.frame);
    expect(applied.length).toBeGreaterThan(0);
    expect(skips.length).toBeGreaterThan(0);
    // 窓は射撃の回数起点なので次のフレームから。付けなかった発火と合わせると、発火のすべて
    expect([...applied.map((f) => f - 1), ...skips].sort((a, b) => a - b)).toEqual(
      fires.filter((f) => f + 1 < plan.frames),
    );
    for (const f of applied) {
      expect(selfBuffedAt(plan.timeline.passive, plan.timeline.windows, q, 'distributedDamage', f - 1)).toBe(true);
    }
    const hits = plan.skillHits.filter((h) => h.slotIndex === q && h.effect.effectIndex === grantIndex + 1);
    expect(hits.map((h) => h.frame)).toEqual(applied);
  });

  it('applies a ranked grant to the slot chosen by the rank at each fire', () => {
    const input = withGrant({
      kind: 'state',
      state: 'followUp',
      trigger: 'fullBurstStart',
      target: 'topAttack',
      targetCount: 1,
      durationSeconds: 1,
    });
    const plan = planTeamRun(applyCompositionToTeam(input));
    const rankings = plan.timeline.rankings.filter(
      (r) => r.sourceSlotIndex === q && r.effect.source.skill === 'skill1' && r.effect.effectIndex === grantIndex,
    );
    expect(rankings.length).toBeGreaterThan(0);
    const applications = plan.timeline.applications.filter((a) => a.state === 'followUp');
    expect(applications.map((a) => [a.frame, a.slotIndex])).toEqual(
      rankings.flatMap((r) => r.targets.map((t) => [r.frame, t])),
    );
    // クイーン（真）に付いた回だけ、分配ダメージが出る
    const hits = plan.skillHits.filter((h) => h.slotIndex === q && h.effect.effectIndex === grantIndex + 1);
    expect(hits.map((h) => h.frame)).toEqual(applications.filter((a) => a.slotIndex === q).map((a) => a.frame));
  });
});

describe('1 パス目の順位に入る状態の中身（アリス + クイーン（真）+ 雪子）', () => {
  // アリスの S1 の topAttack のチャージ速度▲（射撃に効く）があるので、1 パス目が順位を出し、追撃・バトンタッチの攻撃力▲を追う
  const input = team([slotOf(311), slotOf(160), slotOf(191), slotOf(QUEEN), slotOf(871)], 'Wind', 3);
  const prepared = applyCompositionToTeam(applyTreasureToTeam(input));
  const plan = planTeamRun(prepared);
  const first = runFirstPass(toTimelineSlots(prepared.slots), {
    frames: plan.frames,
    burst: true,
    controlledSlot: 3,
  });
  const key = (w: { state?: string; slotIndex: number; start: number; end: number }) =>
    `${w.state ?? ''}:${w.slotIndex}:${w.start}-${w.end}`;

  it('tracks the follow-up and the baton pass in the loop with the same windows as planBuffTimeline', () => {
    const tracked = first.namedStateWindows.map(key).sort();
    expect(tracked.length).toBeGreaterThan(0);
    expect(tracked).toEqual(
      plan.timeline.namedStateWindows
        .filter((w) => w.state === 'followUp' || w.state === 'batonPass')
        .map(key)
        .sort(),
    );
  });

  it('chooses the same targets in the loop (charge speed) and in planBuffTimeline (charge damage)', () => {
    const speed = first.firingWindows.filter(
      (w) => w.effect.source.resourceId === 191 && w.effect.target === 'topAttack',
    );
    const damage = plan.timeline.windows.filter((w) => w.effect.stat === 'chargeDamage');
    expect(speed.length).toBeGreaterThan(0);
    expect(speed.map(key).sort()).toEqual(damage.map(key).sort());
  });
});
