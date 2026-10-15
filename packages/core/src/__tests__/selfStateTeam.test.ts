// 2 段目の段 1（plan/design-skill-stage1.md 1.1・1.3・1.4 節）: 自分の状態の条件（selfState）と、解除不可の印と、状態の表示。
// 読み込みの検証、編成の段で決まる selfState（静的な状態・どの枠も付けない状態）、時間で変わる状態を見る段 1.5 の判定と damage の判定
// （同じフレームに付いた件も見る）、枠に付いた状態のまとめ。定義は data/skills のもの（クイーン（真）・アニス：スター）と、それを書き換えたもの
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTeamDamage } from '../calc/model.ts';
import type { EnemyInput } from '../damage.ts';
import { computeFixedSpecAttack, FIXED_SPEC_ENEMY_DEFENCE } from '../fixedSpec.ts';
import { planTeamRun } from '../frame/plan.ts';
import { applyComposition, applyCompositionToTeam } from '../skills/composition.ts';
import { itemsOf } from '../skills/holders.ts';
import { appliedFrames } from '../skills/timeline.ts';
import { MAX_SKILL_LEVELS } from '../skills/resolve.ts';
import { parseSkillDefinition, type SkillDefinition } from '../skills/types.ts';
import type { TeamInput, TeamSlotInput } from '../team.ts';
import type { CharacterData, Element } from '../types.ts';

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T;
}

const character = (id: number) => readJson<CharacterData>(`../../data/characters/${id}.json`);
type RawDefinition = { skills: Record<string, { effects: Record<string, unknown>[]; notes?: unknown[] }> };
const rawDefinition = (id: number) => readJson<RawDefinition>(`../../data/skills/${id}.json`);
const DEFINED = new Set(readJson<{ resourceIds: number[] }>('../../data/skills/index.json').resourceIds);

const ANIS = 17;
const FLOWER = 304;
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
  checkedAt: '2026-10-16',
  skills: { skill1: { effects }, skill2: empty, burst: empty },
});
const parse = (effects: Record<string, unknown>[]): SkillDefinition => parseSkillDefinition(definitionWith(effects));

const atk = (condition: unknown, stat = 'attack') => ({
  kind: 'timed',
  trigger: 'fullBurstStart',
  target: 'self',
  stat,
  ref: 1,
  durationSeconds: 1,
  condition,
});
const forever = (state: string) => ({
  kind: 'state',
  state,
  trigger: 'battleStart',
  target: 'self',
  durationUntil: 'battleEnd',
});

describe('selfState と undispellable の読み込み', () => {
  it('reads the state id and the absent form', () => {
    const def = parse([atk({ selfState: 'camouflage' }), atk({ selfState: { state: 'camouflage', present: false } })]);
    expect(def.skills.skill1.effects.map((e) => ('condition' in e ? e.condition : undefined))).toEqual([
      { selfState: { state: 'camouflage', present: true } },
      { selfState: { state: 'camouflage', present: false } },
    ]);
  });

  it('rejects ids of the enemy side, malformed forms and a grant that looks at its own state', () => {
    expect(() => parse([atk({ selfState: 'hacked' })])).toThrow(/held by the enemy/);
    expect(() => parse([atk({ selfState: { state: 'camouflage' } })])).toThrow(/present: expected a boolean/);
    expect(() => parse([atk({ selfState: { state: 'camouflage', present: true, extra: 1 } })])).toThrow(
      /unknown field/,
    );
    const grant = { kind: 'state', state: 'camouflage', trigger: 'burstUse', target: 'self', durationSeconds: 1 };
    expect(() => parse([{ ...grant, condition: { selfState: 'camouflage' } }])).toThrow(/cannot look at its own state/);
    expect(parse([{ ...grant, condition: { selfState: 'followUp' } }]).skills.skill1.effects).toHaveLength(1);
  });

  it('reads the undispellable mark of a grant (true only)', () => {
    const def = parse([{ ...forever('camouflage'), undispellable: true }]);
    expect(def.skills.skill1.effects[0]).toMatchObject({ kind: 'state', undispellable: true });
    expect(() => parse([{ ...forever('camouflage'), undispellable: false }])).toThrow(/undispellable: expected true/);
  });
});

describe('編成の段で決まる selfState（plan/design-skill-stage1.md 1.1 節）', () => {
  const anis = character(ANIS);
  const def = parse([
    forever('camouflage'),
    atk({ selfState: 'camouflage' }),
    atk({ selfState: 'batonPass' }),
    atk({ selfState: { state: 'batonPass', present: false } }),
    { kind: 'state', state: 'followUp', trigger: 'burstUse', target: 'self', durationSeconds: 3 },
    // フルバーストタイム中の条件は、1 パス目で件を追う攻撃力▲には書けないので、攻撃ダメージ▲にする
    atk({ selfState: 'followUp', inFullBurst: true }, 'attackDamage'),
    atk({ selfState: { state: 'camouflage', present: false } }),
  ]);
  const conditions = (d: SkillDefinition) =>
    d.skills.skill1.effects.filter((e) => e.kind === 'timed').map((e) => ('condition' in e ? e.condition : undefined));

  it('drops the condition on a static state, removes the effect on a state no slot gives, and keeps the rest', () => {
    const composed = applyComposition(def, [anis], 0);
    expect(conditions(composed)).toEqual([
      undefined, // 静的な状態（いつも付いている）: 条件ごと落とす
      undefined, // どの枠も付けない状態の否定: いつも満たす
      { selfState: { state: 'followUp', present: true }, inFullBurst: true }, // 時間で変わる状態: 残す
    ]);
    // 2 回通しても同じ
    expect(applyComposition(composed, [anis], 0)).toBe(composed);
  });

  it('keeps a condition on a state that another slot may give', () => {
    const composed = applyComposition(def, [anis], 0, null, [], new Set(['batonPass']));
    expect(conditions(composed)).toEqual([
      undefined,
      { selfState: { state: 'batonPass', present: true } },
      { selfState: { state: 'batonPass', present: false } },
      { selfState: { state: 'followUp', present: true }, inFullBurst: true },
    ]);
  });
});

describe('時間で変わる状態を見る selfState（クイーン（真）の定義を書き換え）', () => {
  /** ラム（I）+ デルタ（II）+ クイーン（真）（III・操作）。S1 に、バースト使用時の付与（追撃。2 秒）と、それを見る効果を足す */
  const q = 2;
  const grantIndex = rawDefinition(QUEEN).skills.skill1!.effects.length;
  const withEffects = (effects: Record<string, unknown>[]) => {
    const raw = structuredClone(rawDefinition(QUEEN));
    raw.skills.skill1!.effects.push(
      { kind: 'state', state: 'followUp', trigger: 'burstUse', target: 'self', durationSeconds: 2 },
      ...effects,
    );
    return planTeamRun(applyCompositionToTeam(team([slotOf(822), slotOf(20), slotOf(QUEEN, raw)], 'Wind', q)));
  };
  const queenBursts = (plan: ReturnType<typeof planTeamRun>) =>
    plan.schedule!.activations.filter((a) => a.slotIndex === q).map((a) => a.frame);

  it('fires a conditional timed at stage 1.5 only while the state is on the caster', () => {
    const on = withEffects([atk({ selfState: 'followUp' })]);
    const off = withEffects([atk({ selfState: { state: 'followUp', present: false } })]);
    const fullBursts = on.schedule!.fullBurstWindows.map((w) => w.start);
    expect(fullBursts.length).toBeGreaterThan(0);
    // クイーン（真）だけが III なので、フルバーストはどれもクイーン（真）のバーストの直後で、追撃（2 秒）が付いている
    const fired = (plan: ReturnType<typeof planTeamRun>) =>
      itemsOf(plan.history, { holder: q, kind: 'timed', skill: 'skill1', effectIndex: grantIndex + 1 }).map(
        (i) => i.start,
      );
    expect(fired(on)).toEqual(fullBursts);
    expect(fired(off)).toEqual([]);
    const skips = off.history.conditionSkips.filter(
      (x) => x.sourceSlotIndex === q && x.effect.effectIndex === grantIndex + 1,
    );
    expect(skips.map((x) => x.frame)).toEqual(fullBursts);
  });

  it('lets damage see a state given in the same frame (burst use)', () => {
    const damage = (condition: unknown) => ({
      kind: 'damage',
      trigger: 'burstUse',
      ref: 4,
      damageType: 'distributed',
      condition,
    });
    const on = withEffects([damage({ selfState: 'followUp' })]);
    const off = withEffects([damage({ selfState: { state: 'followUp', present: false } })]);
    const hitFrames = (plan: ReturnType<typeof planTeamRun>) =>
      plan.skillHits.filter((h) => h.slotIndex === q && h.effect.effectIndex === grantIndex + 1).map((h) => h.frame);
    // バースト使用時の付与は、バーストの効果のフレームに付く（付いた記録）。同じフレームのダメージがそれを見る
    const applied = appliedFrames(on.history, 'followUp', q);
    expect(applied.length).toBe(queenBursts(on).length);
    expect(hitFrames(on)).toEqual(applied);
    expect(hitFrames(off)).toEqual([]);
  });
});

describe('枠に付いた状態のまとめ（アニス：スター。plan/design-skill-stage1.md 1.4 節）', () => {
  it('shows My Own Star as a static, undispellable state when Anis: Star is alone', () => {
    const calc = computeTeamDamage(team([slotOf(ANIS)], null, 0));
    const [star, shooting, ...rest] = calc.slots[0]!.states;
    expect(star).toEqual({ state: 'myOwnStar', sourceSlotIndex: 0, count: 1, isStatic: true, undispellable: true });
    // バーストのたびに付くシューティングスター（中身の無い呼び名の状態。付いた回数はバーストの回数）
    const bursts = calc.schedule!.activations.filter((a) => a.slotIndex === 0).length;
    expect(bursts).toBeGreaterThan(0);
    expect(shooting).toEqual({
      state: 'shootingStar',
      sourceSlotIndex: 0,
      count: bursts,
      isStatic: false,
      undispellable: false,
    });
    expect(rest).toEqual([]);
  });

  it("shows Everyone's Star with another Burst I ally", () => {
    const calc = computeTeamDamage(team([slotOf(ANIS), slotOf(FLOWER)], null, 0));
    expect(calc.slots[0]!.states.map((s) => [s.state, s.isStatic, s.undispellable])).toEqual([
      ['everyonesStar', true, true],
      ['shootingStar', false, false],
    ]);
  });
});
